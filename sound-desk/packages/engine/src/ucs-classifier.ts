/**
 * UCS classification — levels L0–L3 of the pipeline described in the plan.
 *
 *   L0  filename: a UCS CatID prefix, or the filename tokens matching a catId
 *   L1  embedded metadata: iXML CATEGORY/SUBCATEGORY, or keywords that match
 *   L2  model-based zero-shot classification (optional; injected as a scorer)
 *   L3  acoustic rules — cheap DSP sanity checks that veto absurd answers
 *
 * Every result carries an evidence string and a confidence, because a
 * classification the user cannot audit is a classification they will not trust.
 * A `manual` assignment is never touched by this module (enforced in the DB
 * layer), so the user's correction always wins.
 */

import type { ClassifyCandidate, DspFeatures, EmbeddedMetadata, UcsSource } from '@sounddesk/core';

export interface UcsEntry {
  catId: string;
  category: string;
  subCategory: string;
  synonymsEn: string[];
  synonymsZh: string[];
  excludes: string[];
}

export interface ClassifyInput {
  filename: string;
  /** path relative to the library root, used for directory hints like /Guns/Handguns/ */
  relativePath?: string;
  embedded: EmbeddedMetadata | null;
  dsp: DspFeatures | null;
  durationMs: number | null;
}

export interface ClassifyResult {
  catId: string | null;
  category: string | null;
  subCategory: string | null;
  confidence: number;
  source: UcsSource;
  evidence: string;
  alternatives: ClassifyCandidate[];
}

/** Injected so the engine can run without any ML model loaded. */
export interface ZeroShotScorer {
  (candidateCatIds: string[]): Promise<Array<{ catId: string; score: number }>>;
}

export interface ClassifyOptions {
  zeroShot?: ZeroShotScorer;
  /** cap on how many catIds the zero-shot scorer is asked about */
  candidateLimit?: number;
}

const CONFIDENCE = {
  filenameCatId: 0.99,
  directory: 0.9,
  ixml: 0.95,
  zeroShotHigh: 0.85,
  zeroShotLow: 0.45,
} as const;

/**
 * Alias priority. The point of these numbers is that a token describing the
 * *kind of sound* must outweigh one describing its material or object:
 *
 *   CatID        3.0  "IMPACTMetal" / "DOORWood" — unambiguous
 *   Category     2.0  "IMPACTS" / "FOLEY"        — the folder-naming signal
 *   Synonym      1.0  curated phrases for the entry
 *   SubCategory  0.5  "Metal", "Wood" — a material, true of many categories
 *
 * Without the low subcategory weight, `Impacts/Metal/metal_clang.wav` scores
 * DOORMetal (subcategory "Metal") above IMPACTMetal, which is nonsense.
 */
const PRIORITY = { catId: 3, category: 2, synonym: 1, subCategory: 0.5, subCategoryPart: 0.4 } as const;

interface AliasHit {
  catId: string;
  priority: number;
}

export class UcsClassifier {
  private readonly byCatId = new Map<string, UcsEntry>();
  /** lowercase alias → the catIds it can stand for, with match priority */
  private readonly aliasIndex = new Map<string, AliasHit[]>();
  private readonly categoryIndex = new Map<string, Set<string>>();

  private readonly entries: UcsEntry[];

  constructor(entries: UcsEntry[]) {
    this.entries = entries;
    for (const e of entries) {
      this.byCatId.set(e.catId, e);
      addAlias(this.aliasIndex, e.catId, e.catId, PRIORITY.catId);
      addAlias(this.aliasIndex, e.category, e.catId, PRIORITY.category);
      addAlias(this.aliasIndex, e.subCategory, e.catId, PRIORITY.subCategory);
      // Sub-categories are glued words ("FootstepsWoodFloor"). Without splitting
      // them, the single token a user or filename actually contains ("footstep")
      // never matches the entry, and classification falls back to whichever
      // sibling matches the material instead. These parts are deliberately weak.
      for (const part of splitTokens(e.subCategory)) {
        addAlias(this.aliasIndex, part, e.catId, PRIORITY.subCategoryPart);
      }
      addTo(this.categoryIndex, e.category.toUpperCase(), e.catId);
      for (const syn of e.synonymsEn) addAlias(this.aliasIndex, syn, e.catId, PRIORITY.synonym);
      for (const syn of e.synonymsZh) addAlias(this.aliasIndex, syn, e.catId, PRIORITY.synonym);
    }
  }

  get size(): number {
    return this.byCatId.size;
  }

  /** Scoring transparency for tests and diagnostics. */
  explain(input: ClassifyInput, limit = 8): Array<{ catId: string; score: number; evidence: string; strong: boolean; inCategory: boolean }> {
    const signals: Array<{ token: string; label: string; source: UcsSource; weight: number }> = [];
    const stem = input.filename.replace(/\.[^.]+$/, '');
    for (const token of splitTokens(stem)) signals.push({ token, label: 'filename', source: 'filename', weight: 1 });
    if (input.relativePath) {
      for (const segment of input.relativePath.split(/[\\/]/).slice(0, -1).filter(Boolean)) {
        for (const token of splitTokens(segment)) {
          signals.push({ token, label: `directory "${segment}"`, source: 'filename', weight: 1.5 });
        }
      }
    }
    return this.rankSignals(signals).slice(0, limit);
  }

  private rankSignals(
    signals: Array<{ token: string; label: string; source: UcsSource; weight: number }>,
    excludedTokens: Set<string> = new Set(),
  ): Array<{ catId: string; score: number; evidence: string; strong: boolean; inCategory: boolean }> {
    interface Evidence {
      token: string;
      priority: number;
      weight: number;
    }
    const acc = new Map<string, { specific: Evidence[]; category: Evidence[]; weak: Evidence[] }>();

    for (const signal of signals) {
      if (excludedTokens.has(signal.token)) continue;
      const hits = this.aliasIndex.get(signal.token);
      if (!hits || hits.length === 0) continue;
      for (const hit of hits) {
        const entry = this.byCatId.get(hit.catId);
        if (!entry) continue;
        // An entry's own exclusion list outranks its synonym list.
        const isOwnName = normalizePhrase(entry.catId) === signal.token || normalizePhrase(entry.subCategory) === signal.token;
        if (!isOwnName && entry.excludes.some((x) => normalizePhrase(x) === signal.token)) continue;

        const bucket = acc.get(hit.catId) ?? { specific: [], category: [], weak: [] };
        const evidence: Evidence = { token: signal.token, priority: hit.priority, weight: signal.weight };
        if (hit.priority === PRIORITY.category) bucket.category.push(evidence);
        else if (hit.priority <= PRIORITY.subCategory) bucket.weak.push(evidence);
        else bucket.specific.push(evidence);
        acc.set(hit.catId, bucket);
      }
    }

    return [...acc.entries()]
      .map(([catId, bucket]) => {
        const specificity = [...bucket.specific, ...bucket.weak].reduce((sum, e) => sum + e.priority * e.weight, 0);
        // A category-code token ("impacts", "doors") is evidence that the sound
        // belongs to that *category*, which every member shares — so it can only
        // confirm a member that has specific evidence of its own. Giving it full
        // weight regardless would hand every sibling the same score and let the
        // alphabet pick the winner.
        const categoryWeight = specificity > 0 ? 1 : 0.25;
        const category = bucket.category.reduce((sum, e) => sum + e.priority * e.weight * categoryWeight, 0);
        const weak = bucket.weak.reduce((sum, e) => sum + e.priority * e.weight * 0.25, 0);
        const matched = [...bucket.specific, ...bucket.category, ...bucket.weak];
        const corroboration = 1 + 0.1 * Math.max(0, matched.length - 1);
        const score = (specificity + category + weak) * corroboration;
        const entry = this.byCatId.get(catId);
        const contradicting = entry
          ? entry.excludes.some((x) => signals.some((s) => s.token === normalizePhrase(x)))
          : false;
        return {
          catId,
          score: contradicting ? score * 0.2 : score,
          evidence: [...new Set(matched.map((m) => m.token))].join(', '),
          strong: bucket.specific.length > 0 || bucket.category.length > 0,
          inCategory: bucket.category.length > 0,
        };
      })
      .sort((a, b) => {
        if (a.strong !== b.strong) return a.strong ? -1 : 1;
        return b.score - a.score || a.catId.localeCompare(b.catId);
      });
  }

  get(catId: string): UcsEntry | null {
    return this.byCatId.get(catId) ?? null;
  }

  list(): UcsEntry[] {
    return this.entries;
  }

  catIdsInCategory(category: string): string[] {
    return [...(this.categoryIndex.get(category.toUpperCase()) ?? [])];
  }

  categories(): string[] {
    return [...this.categoryIndex.keys()].sort();
  }

  /** Public entry point: run L0 → L1 → L2 → L3 and return the best answer. */
  async classify(input: ClassifyInput, opts: ClassifyOptions = {}): Promise<ClassifyResult> {
    const candidates: ClassifyCandidate[] = [];

    const l0 = this.level0Filename(input);
    if (l0) candidates.push(l0);

    const l1 = this.level1Embedded(input);
    if (l1) candidates.push(l1);

    const l2 = await this.level2ZeroShot(input, candidates, opts);
    candidates.push(...l2);

    const l3 = this.level3Acoustic(input, candidates);

    // Highest confidence wins; ties broken by pipeline order (L0 first).
    candidates.sort((a, b) => b.score - a.score || orderOf(a.source) - orderOf(b.source));

    const best = candidates[0];
    if (!best) {
      return {
        catId: null,
        category: null,
        subCategory: null,
        confidence: 0,
        source: 'filename',
        evidence: 'no UCS signal found',
        alternatives: [],
      };
    }

    const entry = this.byCatId.get(best.catId);
    return {
      catId: best.catId,
      category: entry?.category ?? null,
      subCategory: entry?.subCategory ?? null,
      confidence: best.score,
      source: best.source,
      evidence: best.evidence,
      alternatives: candidates.slice(1, 6),
    };
  }

  // -- L0: filename ------------------------------------------------------

  private level0Filename(input: ClassifyInput): ClassifyCandidate | null {
    const stem = input.filename.replace(/\.[^.]+$/, '');

    // A leading UCS CatID, e.g. DOORWood_Wooden Door Close_...wav — authoritative.
    const ucsMatch = /^([A-Z][A-Za-z]*)_/.exec(stem);
    if (ucsMatch) {
      const catId = ucsMatch[1]!;
      if (this.byCatId.has(catId)) {
        return { catId, category: '', subCategory: '', score: CONFIDENCE.filenameCatId, source: 'filename', evidence: `filename CatID "${catId}"` };
      }
    }

    // Score the filename and the directory path together rather than returning
    // on the first hint. A bare "metal" is ambiguous (DOORMetal vs IMPACTMetal),
    // and the directory is exactly what disambiguates it.
    const signals: Array<{ token: string; label: string; source: UcsSource; weight: number }> = [];
    for (const token of splitTokens(stem)) {
      signals.push({ token, label: 'filename', source: 'filename', weight: 1 });
    }
    if (input.relativePath) {
      const segments = input.relativePath.split(/[\\/]/).slice(0, -1).filter(Boolean);
      for (const segment of segments) {
        for (const token of splitTokens(segment)) {
          signals.push({ token, label: `directory "${segment}"`, source: 'filename', weight: 1.5 });
        }
      }
    }

    // First pass, ignoring exclusions, to discover which material/subject words
    // the filename actually commits to. Anything contradicted by the category we
    // are about to pick must not have influenced that pick.
    const firstPass = this.scoreSignals(signals, 'filename tokens');
    const contradicted = new Set<string>();
    if (firstPass) {
      const entry = this.byCatId.get(firstPass.catId);
      if (entry) {
        for (const signal of signals) {
          if (entry.excludes.some((x) => normalizePhrase(x) === signal.token)) contradicted.add(signal.token);
        }
      }
    }

    const result = this.scoreSignals(signals, 'filename tokens', undefined, contradicted);
    if (result) return result;
    return firstPass;
  }

  /**
   * Turn ranked candidates into the single best one.
   *
   * There is exactly one scoring implementation (`rankSignals`) so that the
   * diagnostics view and the live classifier can never disagree.
   */
  private scoreSignals(
    signals: Array<{ token: string; label: string; source: UcsSource; weight: number }>,
    evidenceLabel: string,
    sourceOverride?: UcsSource,
    excludedTokens: Set<string> = new Set(),
  ): ClassifyCandidate | null {
    const ranked = this.rankSignals(signals, excludedTokens);
    const best = ranked[0];
    if (!best) return null;

    const matchedCount = Math.max(1, best.evidence.split(', ').length);
    const maxPossible = PRIORITY.catId * 1.5 * matchedCount;
    const raw = 0.35 + 0.55 * (best.score / maxPossible);

    // Margin against the runner-up. When a directory only says "Impacts" and
    // nothing identifies the material, several sibling CatIDs tie and the winner
    // is decided alphabetically — that is a guess, and confidence must say so.
    const runnerUp = ranked[1];
    const margin = runnerUp && runnerUp.strong === best.strong ? (best.score - runnerUp.score) / Math.max(1e-6, best.score) : 1;
    const ambiguity = Math.min(1, Math.max(0, margin / 0.25));

    const confidence = Math.min(0.92, raw * (0.45 + 0.55 * ambiguity));
    return {
      catId: best.catId,
      category: '',
      subCategory: '',
      score: confidence,
      source: sourceOverride ?? 'filename',
      evidence:
        ambiguity < 0.5
          ? `${evidenceLabel}: ${best.evidence}（同类多个候选难分，未找到区分子类）`
          : `${evidenceLabel}: ${best.evidence}`,
    };
  }

  // -- L1: embedded metadata --------------------------------------------

  private level1Embedded(input: ClassifyInput): ClassifyCandidate | null {
    const em = input.embedded;
    if (!em) return null;

    // iXML CATEGORY / SUBCATEGORY is authoritative when present.
    const cat = (em.ixml?.CATEGORY ?? '').trim();
    const sub = (em.ixml?.SUBCATEGORY ?? em.ixml?.SUB_CATEGORY ?? '').trim();
    if (cat) {
      const joined = `${cat}${sub}`;
      if (this.byCatId.has(joined)) {
        return { catId: joined, category: '', subCategory: '', score: CONFIDENCE.ixml, source: 'ixml', evidence: `iXML CATEGORY=${cat} SUBCATEGORY=${sub}` };
      }
      const hits = this.aliasIndex.get(normalizePhrase(joined)) ?? this.aliasIndex.get(normalizePhrase(cat));
      if (hits && hits.length > 0) {
        const catId = pickBest(hits, this.byCatId);
        if (catId) {
          return { catId, category: '', subCategory: '', score: CONFIDENCE.ixml - 0.05, source: 'ixml', evidence: `iXML CATEGORY=${cat}` };
        }
      }
      const byCat = this.categoryIndex.get(cat.toUpperCase());
      if (byCat && byCat.size > 0) {
        const catId = sub ? this.bestInCategory(cat.toUpperCase(), sub) : pickBestFromSet(byCat, this.byCatId);
        if (catId) {
          return { catId, category: '', subCategory: '', score: CONFIDENCE.ixml - 0.1, source: 'ixml', evidence: `iXML CATEGORY=${cat}${sub ? ` SUBCATEGORY=${sub}` : ''}` };
        }
      }
    }

    const text = [em.description, em.keywords?.join(' '), em.note, em.project, em.scene]
      .filter(Boolean)
      .join(' ');
    if (!text) return null;
    return this.scoreSignals(
      splitTokens(text).map((token) => ({ token, label: 'embedded text', source: 'ixml' as UcsSource, weight: 1 })),
      'embedded description/keywords',
      'ixml',
    );
  }

  private bestInCategory(category: string, subCategory: string): string | null {
    const wanted = normalizePhrase(subCategory);
    const ids = this.categoryIndex.get(category);
    if (!ids) return null;
    for (const id of ids) {
      const e = this.byCatId.get(id);
      if (!e) continue;
      if (normalizePhrase(e.subCategory) === wanted) return id;
    }
    return null;
  }

  // -- L2: zero-shot model ----------------------------------------------

  private async level2ZeroShot(
    input: ClassifyInput,
    already: ClassifyCandidate[],
    opts: ClassifyOptions,
  ): Promise<ClassifyCandidate[]> {
    if (!opts.zeroShot) return [];

    // Prune to a candidate list: everything the lexical levels found, plus every
    // catId in the categories those hints point at. Asking the model about 800
    // catIds would be wasteful and would bury good lexical signals.
    const hintCategories = new Set<string>();
    for (const c of already) {
      const e = this.byCatId.get(c.catId);
      if (e) hintCategories.add(e.category);
    }
    let candidates: string[];
    if (hintCategories.size > 0) {
      candidates = [...hintCategories].flatMap((cat) => this.catIdsInCategory(cat));
    } else {
      candidates = this.topVocabularyCandidates(input);
    }
    const limit = opts.candidateLimit ?? 60;
    if (candidates.length > limit) candidates = candidates.slice(0, limit);
    if (candidates.length === 0) return [];

    let scores: Array<{ catId: string; score: number }>;
    try {
      scores = await opts.zeroShot(candidates);
    } catch {
      // A failing model must never break indexing.
      return [];
    }

    const ranked = scores.filter((s) => this.byCatId.has(s.catId)).sort((a, b) => b.score - a.score);
    const out: ClassifyCandidate[] = [];
    for (const s of ranked.slice(0, 3)) {
      const confident = s.score >= 0.5;
      out.push({
        catId: s.catId,
        category: '',
        subCategory: '',
        score: confident ? Math.min(CONFIDENCE.zeroShotHigh, s.score) : CONFIDENCE.zeroShotLow * s.score,
        source: 'clap',
        evidence: `CLAP zero-shot p=${s.score.toFixed(2)}`,
      });
    }
    return out;
  }

  /** When nothing lexical matched, seed the model with the most common categories. */
  private topVocabularyCandidates(input: ClassifyInput): string[] {
    const tokens = splitTokens(`${input.filename} ${input.embedded?.description ?? ''}`);
    const scored = new Map<string, { count: number; priority: number }>();
    for (const token of tokens) {
      const hits = this.aliasIndex.get(token);
      if (!hits) continue;
      for (const hit of hits) {
        const prev = scored.get(hit.catId) ?? { count: 0, priority: 0 };
        prev.count += 1;
        prev.priority = Math.max(prev.priority, hit.priority);
        scored.set(hit.catId, prev);
      }
    }
    return [...scored.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].priority - a[1].priority || a[0].localeCompare(b[0]))
      .map(([catId]) => catId);
  }

  // -- L3: acoustic sanity rules ----------------------------------------

  /**
   * Cheap DSP vetoes. These do not invent a classification; they demote a
   * candidate that contradicts what the waveform says, and promote an obvious
   * one when the lexical levels found nothing.
   */
  private level3Acoustic(input: ClassifyInput, candidates: ClassifyCandidate[]): ClassifyCandidate[] {
    const dsp = input.dsp;
    if (!dsp) return candidates;

    const out: ClassifyCandidate[] = [];
    for (const c of candidates) {
      const entry = this.byCatId.get(c.catId);
      if (!entry) continue;
      let penalty = 0;
      const notes: string[] = [];

      const isAmbience = /AMBIENCE|NATURE|AIR|CROWD/.test(entry.category);
      const isImpact = /IMPACT|WEAPON|GUNS|EXPLOSION/.test(entry.category);
      const isMusical = /MUSICAL/.test(entry.category);

      // A very short file with no tail is not an ambience.
      if (isAmbience && input.durationMs !== null && input.durationMs < 500 && dsp.decayMs < 200) {
        penalty += 0.3;
        notes.push('too short for ambience');
      }
      // Long, sustained, low-frequency material is rarely a sharp impact.
      if (isImpact && dsp.tonality > 0.8 && dsp.spectralCentroidHz < 300) {
        penalty += 0.2;
        notes.push('tonal/low-centroid contradicts impact');
      }
      // A strongly tonal signal supports MUSICAL.
      if (isMusical && dsp.tonality < 0.3) {
        penalty += 0.15;
        notes.push('weak tonality for musical');
      }

      out.push({
        ...c,
        score: Math.max(0, c.score - penalty),
        evidence: notes.length > 0 ? `${c.evidence} [${notes.join('; ')}]` : c.evidence,
      });
    }

    // Nothing lexical matched — use acoustics alone to make a guess.
    if (out.length === 0) {
      const guess = this.acousticOnlyGuess(dsp, input.durationMs);
      if (guess) out.push(guess);
    }
    return out;
  }

  private acousticOnlyGuess(dsp: DspFeatures, durationMs: number | null): ClassifyCandidate | null {
    if (dsp.tonality > 0.75 && dsp.spectralCentroidHz < 2000) {
      const entry = this.entries.find((e) => e.category === 'MUSICAL');
      if (entry) {
        return { catId: entry.catId, category: '', subCategory: '', score: 0.3, source: 'dsp-rule', evidence: `tonal signal (tonality=${dsp.tonality.toFixed(2)})` };
      }
    }
    if (dsp.decayMs > 800 && (durationMs ?? 0) > 2000) {
      const entry = this.entries.find((e) => e.category === 'AMBIENCE');
      if (entry) {
        return { catId: entry.catId, category: '', subCategory: '', score: 0.28, source: 'dsp-rule', evidence: `long decay (${Math.round(dsp.decayMs)}ms)` };
      }
    }
    if (dsp.peak > 0.5 && dsp.decayMs < 300) {
      const entry = this.entries.find((e) => e.category === 'IMPACTS');
      if (entry) {
        return { catId: entry.catId, category: '', subCategory: '', score: 0.3, source: 'dsp-rule', evidence: `fast transient (decay=${Math.round(dsp.decayMs)}ms)` };
      }
    }
    return null;
  }

  // -- helpers -----------------------------------------------------------

  private matchTokens(tokens: string[], evidenceLabel: string, source: UcsSource, baseScore: number): ClassifyCandidate | null {
    const scores = new Map<string, { score: number; priority: number; matched: string[] }>();
    for (const token of tokens) {
      const hits = this.aliasIndex.get(token);
      if (!hits) continue;
      for (const hit of hits) {
        const prev = scores.get(hit.catId) ?? { score: 0, priority: 0, matched: [] };
        prev.score += 1;
        prev.priority = Math.max(prev.priority, hit.priority);
        prev.matched.push(token);
        scores.set(hit.catId, prev);
      }
    }
    if (scores.size === 0) return null;

    // Rank by hit count first, then by alias strength: a direct name match beats
    // a synonym match, and an exact-name hit is worth more than raw frequency.
    const ranked = [...scores.entries()]
      .map(([catId, info]) => {
        const entry = this.byCatId.get(catId);
        // An excluded term in the text is strong evidence against this category.
        const contradicting = entry ? entry.excludes.some((x) => tokens.includes(normalizePhrase(x))) : false;
        const weight = info.score + info.priority * 0.75;
        const adjusted = contradicting ? weight * 0.2 : weight;
        return { catId, info, adjusted, contradicting };
      })
      .sort((a, b) => b.adjusted - a.adjusted || a.catId.localeCompare(b.catId));

    const best = ranked[0];
    if (!best) return null;

    const confidence = Math.min(baseScore, baseScore * (best.info.score / Math.max(1, tokens.length)) + 0.25);
    return {
      catId: best.catId,
      category: '',
      subCategory: '',
      score: confidence,
      source,
      evidence: `${evidenceLabel}: ${[...new Set(best.info.matched)].slice(0, 4).join(', ')}`,
    };
  }
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!key) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/** Register an alias, keeping the highest priority seen for each catId. */
function addAlias(map: Map<string, AliasHit[]>, raw: string, catId: string, priority: number): void {
  const key = normalizePhrase(raw);
  if (!key) return;
  let hits = map.get(key);
  if (!hits) {
    hits = [];
    map.set(key, hits);
  }
  const existing = hits.find((h) => h.catId === catId);
  if (existing) {
    if (priority > existing.priority) existing.priority = priority;
    return;
  }
  hits.push({ catId, priority });
}

/** Lowercase, collapse punctuation and whitespace. */
export function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-./\\()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split an identifier-ish string into lowercase tokens, splitting camelCase. */
export function splitTokens(s: string): string[] {
  return normalizePhrase(s.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .split(' ')
    .filter((t) => t.length > 1);
}

/** Pick the highest-priority hit; alphabetical order breaks ties deterministically. */
function pickBest(hits: AliasHit[], byCatId: Map<string, UcsEntry>): string | null {
  let best: AliasHit | null = null;
  for (const hit of hits) {
    if (!byCatId.has(hit.catId)) continue;
    if (best === null) {
      best = hit;
      continue;
    }
    if (hit.priority > best.priority) {
      best = hit;
      continue;
    }
    if (hit.priority === best.priority && hit.catId < best.catId) best = hit;
  }
  return best?.catId ?? null;
}

/** Same ordering rule, for a set of catIds with no priority information. */
function pickBestFromSet(catIds: Set<string>, byCatId: Map<string, UcsEntry>): string | null {
  let best: string | null = null;
  for (const id of catIds) {
    if (!byCatId.has(id)) continue;
    if (best === null || id < best) best = id;
  }
  return best;
}

function orderOf(source: UcsSource): number {
  switch (source) {
    case 'manual':
      return 0;
    case 'filename':
      return 1;
    case 'ixml':
      return 2;
    case 'clap':
      return 3;
    case 'llm':
      return 4;
    default:
      return 5;
  }
}
