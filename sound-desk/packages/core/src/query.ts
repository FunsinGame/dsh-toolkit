/**
 * Parser for the keyword query mini-language, matching the syntax the reference
 * product documents:
 *
 *   wind (gust*, blow*) -window
 *
 *   space        → AND (all terms must match)
 *   comma        → OR
 *   ( … )        → grouping of alternatives
 *   term*        → prefix wildcard
 *   -term        → exclusion
 *
 * The parser is deliberately separate from SQL generation so it can be unit
 * tested and so the web UI can render the parsed structure back to the user.
 */

const AUDIO_EXTENSIONS = [
  'wav', 'bwf', 'aif', 'aiff', 'aifc', 'flac', 'mp3', 'ogg', 'oga', 'opus',
  'm4a', 'mp4', 'caf', 'bwf', 'w64', 'rf64', 'dsf', 'dff', 'ape', 'wv', 'mpc',
] as const;

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

export function containsCjk(text: string): boolean {
  return CJK.test(text);
}

/** Heuristic: a long, space-separated sentence is a description, not a keyword query. */
export function looksLikeNaturalLanguage(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  // A filename or a query with operators is never natural language.
  if (/[*()\-"]/.test(t) && !containsCjk(t)) return false;
  if (sniffFilename(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (containsCjk(t)) {
    // Chinese has no spaces: treat anything with a comma or >6 chars as a description.
    return /[，,、；;]/.test(t) || t.length > 6;
  }
  return words.length >= 3;
}

export interface FilenameSniff {
  basename: string;
  stem: string;
  extension: string;
}

/** Returns non-null when the text looks like an audio filename (with or without extension). */
export function sniffFilename(text: string): FilenameSniff | null {
  const t = text.trim().replace(/^["']|["']$/g, '');
  if (t.length === 0) return null;

  // Anything containing whitespace or query metacharacters is a query, never a
  // filename. This gate must run before the extension check, otherwise
  // "DOORWood_Wooden Door Close.wav" would be sniffed as a filename.
  if (/[\s()*,"']/.test(t)) return null;

  const dot = t.lastIndexOf('.');
  if (dot > 0) {
    const ext = t.slice(dot + 1).toLowerCase();
    if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
      const base = t.slice(0, dot);
      return { basename: t, stem: base, extension: ext };
    }
  }
  // A bare token that looks like a UCS-ish filename stem.
  if (t.length >= 8 && /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_-]+$/.test(t)) {
    return { basename: t, stem: t, extension: '' };
  }
  return null;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(input: string, separator = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

interface Token {
  kind: 'word' | 'lparen' | 'rparen' | 'star';
  value: string;
  negated: boolean;
}

function tokenize(clause: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  // Every branch below advances `i`, so the scan can never stall. `,` terminates
  // a word but is skipped here because clauses are split on top-level commas
  // before this is called.
  while (i < clause.length) {
    const ch = clause[i]!;

    if (/\s/.test(ch) || ch === ',') {
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')', negated: false });
      i += 1;
      continue;
    }

    // A leading '-' negates the item that follows — which may be a word or a
    // parenthesised group, so record it on whichever token comes next.
    let negated = false;
    if (ch === '-') {
      const next = clause[i + 1];
      if (next !== undefined && !/\s/.test(next) && next !== '-' && next !== ',') {
        negated = true;
        i += 1;
      }
    }

    const nextCh = clause[i];
    if (nextCh === '(') {
      tokens.push({ kind: 'lparen', value: '(', negated });
      i += 1;
      continue;
    }
    if (nextCh === undefined) break;

    let word = '';
    let prefix = false;
    while (i < clause.length) {
      const c = clause[i]!;
      if (/\s/.test(c) || c === ',' || c === '(' || c === ')') break;
      if (c === '*') {
        prefix = true;
        i += 1;
        break;
      }
      word += c;
      i += 1;
    }

    if (word.length > 0) {
      tokens.push({ kind: 'word', value: prefix ? `${word}*` : word, negated });
    }
    // a lone '-' carries no term and is simply dropped
  }
  return tokens;
}

/**
 * Parse one clause (a comma-free segment) into AND-ed slots.
 *
 * Slot rules:
 *   `a b`      → two required terms (AND)
 *   `(a, b)`   → one optional group: a OR b
 *   `-c`       → exclusion
 *
 * A `-` applies only to the item it prefixes. Nested scopes are flattened with
 * OR (they inherit the inner alternatives), which keeps the grammar simple:
 *   `wind (gust*, blow*) -window` → required [wind], optional [[gust*, blow*]], excluded [window]
 *   `-(metal, glass)`            → excluded [metal, glass]
 */
interface ClauseSlots {
  required: string[];
  optionalGroups: string[][];
  excluded: string[];
  tokens: Token[];
}

interface ScopeItem {
  terms: string[];
  negated: boolean;
}

function parseClause(tokens: Token[]): ClauseSlots {
  const slots: ClauseSlots = { required: [], optionalGroups: [], excluded: [], tokens };
  let pos = 0;

  /**
   * Read one scope. `isTop` controls interpretation: at the top level a positive
   * item becomes required/optional and a negative item becomes an exclusion;
   * inside parentheses the whole scope collapses into one alternative group.
   */
  const readScope = (isTop: boolean): ScopeItem[] => {
    const items: ScopeItem[] = [];

    while (pos < tokens.length) {
      const t = tokens[pos]!;
      if (t.kind === 'rparen') {
        pos += 1;
        break;
      }
      if (t.kind === 'lparen') {
        pos += 1;
        const nested = readScope(false);
        if (nested.length > 0) {
          // `-(a, b)` excludes the whole group; `(a, b)` is an alternative set.
          items.push({
            terms: nested.flatMap((n) => n.terms),
            negated: t.negated || nested.every((n) => n.negated),
          });
        }
        continue;
      }
      if (t.kind === 'word') {
        items.push({ terms: [t.value], negated: t.negated });
      }
      pos += 1;
    }

    if (isTop) {
      for (const it of items) {
        if (it.negated) {
          slots.excluded.push(...it.terms.map(stripWildcard));
        } else if (it.terms.length === 1) {
          // keep wildcards intact for the FTS layer
          slots.required.push(it.terms[0]!);
        } else {
          slots.optionalGroups.push(it.terms);
        }
      }
      return items;
    }

    return items;
  };

  readScope(true);
  return slots;
}

export interface ParsedQueryInternal {
  parsed: import('./types.js').ParsedQuery;
  /** everything after removing operators — what should be sent to the semantic retriever */
  freeText: string;
}

export function parseQuery(input: string): import('./types.js').ParsedQuery {
  const raw = (input ?? '').trim();
  const filename = sniffFilename(raw);

  const parsed: import('./types.js').ParsedQuery = {
    raw,
    required: [],
    optionalGroups: [],
    excluded: [],
    looksLikeFilename: filename !== null,
    isNaturalLanguage: false,
  };
  if (filename) parsed.filenameHint = filename.stem;
  if (raw.length === 0) return parsed;

  const required: string[] = [];
  const excluded: string[] = [];
  const optionalGroups: string[][] = [];
  const freeTextParts: string[] = [];

  // Comma separates alternative clauses. We treat the whole query as a chain of
  // AND-groups; each comma-separated clause contributes its terms.
  const clauses = splitTopLevel(raw, ',');
  for (const clause of clauses) {
    if (clause.trim().length === 0) continue;
    const tokens = tokenize(clause);
    if (tokens.length === 0) continue;

    const slots = parseClause(tokens);
    required.push(...slots.required);
    excluded.push(...slots.excluded);
    for (const group of slots.optionalGroups) {
      // keep wildcards: toFtsMatch turns `gust*` into a prefix query
      optionalGroups.push(group);
    }
    freeTextParts.push(clause.trim());
  }

  parsed.required = dedupe(required);
  parsed.excluded = dedupe(excluded);
  parsed.optionalGroups = optionalGroups.map(dedupe).filter((g) => g.length > 0);
  parsed.isNaturalLanguage = looksLikeNaturalLanguage(raw) && parsed.optionalGroups.length === 0;

  return parsed;
}

function stripWildcard(term: string): string {
  return term.replace(/\*+$/, '');
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter((s) => s.length > 0))];
}

/** The text that should be used for semantic embedding / rewriting. */
export function semanticTextOf(parsed: import('./types.js').ParsedQuery): string {
  const parts = [...parsed.required];
  for (const g of parsed.optionalGroups) parts.push(g[0] ?? '');
  const text = parts.filter(Boolean).join(', ');
  return text.length > 0 ? text : parsed.raw;
}

/**
 * Translate a parsed query into an FTS5 MATCH expression.
 *
 * `column` is the FTS column list to search, e.g. `search_text`.
 * Terms are quoted so that user input can never inject FTS operators.
 */
export function toFtsMatch(parsed: import('./types.js').ParsedQuery, columns?: string[]): string | null {
  const colPrefix = columns && columns.length > 0 ? `{${columns.join(' ')}} : ` : '';

  const positive = parsed.required.map((term) => ftsTerm(term, false));
  for (const group of parsed.optionalGroups) {
    const inner = group.map((t) => ftsTerm(t, false)).join(' OR ');
    if (inner) positive.push(`(${inner})`);
  }

  const negative = parsed.excluded.map((t) => ftsTerm(t, true));
  if (positive.length === 0 && negative.length === 0) return null;

  // FTS5 spells exclusion as a binary `NOT` between expressions: `a NOT b`.
  // Written as `a AND NOT b` it is a syntax error, and that error used to be
  // swallowed by the caller, silently dropping the exclusion.
  if (positive.length === 0) {
    // A query that is only exclusions cannot be expressed as a bare MATCH; the
    // caller must treat "exclude only" as a filter over everything else.
    return colPrefix + negative.join(' AND ');
  }

  const body = positive.join(' AND ');
  const withExclusions = negative.length > 0 ? `${body} ${negative.join(' ')}` : body;
  return colPrefix + withExclusions;
}

function ftsTerm(term: string, negate: boolean): string {
  const escaped = term.replace(/"/g, '""');
  const isPrefix = /\*$/.test(term);
  const body = isPrefix ? escaped.replace(/\*+$/, '') : escaped;
  const quoted = `"${body}"${isPrefix ? '*' : ''}`;
  return negate ? `NOT ${quoted}` : quoted;
}

/**
 * Build the text blob that gets indexed into FTS5.
 *
 * CJK text is expanded into character bigrams because SQLite's built-in
 * tokenizers do not segment Chinese. Indexing "金属门" as "金属 属门" means a
 * query for "金属" matches while a query for "门" also matches, with BM25
 * ranking still doing sensible work. Latin words are lowercased and kept whole.
 */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  // Normalise separators in filenames so `DOORWood_Wooden Door_close.wav`
  // contributes the tokens door, wood, wooden, door, close.
  const pieces: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const normalised = String(part)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-./\\()[\]{}]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalised) pieces.push(normalised);
  }
  const joined = pieces.join(' ');
  return `${joined} ${toBigrams(joined)}`.replace(/\s+/g, ' ').trim();
}

/** Character bigrams for CJK runs; leaves latin runs alone. */
export function toBigrams(text: string): string {
  const out: string[] = [];
  let run = '';
  const flush = () => {
    if (run.length === 1) out.push(run);
    else if (run.length > 1) {
      for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
    }
    run = '';
  };
  for (const ch of text) {
    if (CJK.test(ch)) {
      run += ch;
    } else {
      flush();
    }
  }
  flush();
  return out.join(' ');
}

/** Token list for the same text, used when building bigram queries. */
export function queryToFtsTerms(text: string): string[] {
  const normalised = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./\\()[\]{}]+/g, ' ')
    .toLowerCase();
  const tokens: string[] = [];
  for (const raw of normalised.split(/\s+/)) {
    if (!raw) continue;
    if (containsCjk(raw)) {
      const bigrams = toBigrams(raw);
      if (bigrams.length > 0) tokens.push(...bigrams.split(' '));
      else tokens.push(raw);
    } else {
      tokens.push(raw);
    }
  }
  return tokens;
}
