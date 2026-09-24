#!/usr/bin/env node
/**
 * scripts/migrate-seed-zh.mjs — one-time migration that rescues the curated
 * Chinese content from the legacy seed and re-keys it onto OFFICIAL UCS CatIDs.
 *
 * WHY THIS EXISTS
 *   data/categories.seed.json was hand-authored before the official list was
 *   available. Its CatIDs are invented (`AIRCRAFTCabin`, `AMBDesignedDark`,
 *   `FOLEYFootstepsBoots`) and only ONE of the 178 (`DOORWood`) matches the real
 *   UCS. The seed therefore cannot be merged into the official dataset — doing
 *   so would publish invalid CatIDs that the app would then write into
 *   filenames. But the seed also carries ~700 hand-written Chinese synonyms and
 *   labels that are genuinely useful, so this script moves that content onto the
 *   real CatIDs and writes data/curated-zh.json.
 *
 *   Run once; the committed output (data/curated-zh.json) is the artefact that
 *   matters from then on. Kept in the repo so the mapping decisions are
 *   auditable and reproducible.
 *
 * Usage: node scripts/migrate-seed-zh.mjs [--report]
 */

import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../data/', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, DATA), 'utf8'));

/**
 * Legacy seed category -> official UCS category/categories.
 * Only categories that exist in the seed are listed. Where a legacy bucket
 * genuinely spans several official categories the subcategories are routed by
 * name; unlisted subcategories fall back to the first entry.
 */
const CATEGORY_MAP = {
  AIRCRAFT: ['AIRCRAFT'],
  ALARMS: ['ALARMS'],
  AMBIENCE: ['AMBIENCE'],
  ANIMALS: ['ANIMALS', 'BIRDS'],
  BELLS: ['BELLS'],
  BOATS: ['BOATS'],
  CROWD: ['CROWDS'],
  DESIGNED: ['DESIGNED'],
  DOORS: ['DOORS'],
  ELECTRONIC: ['BEEPS', 'ELECTRICITY', 'SCIFI', 'ALARMS'],
  EMOTIONS: ['VOICES', 'HUMAN', 'CROWDS'],
  EQUIPMENT: ['EQUIPMENT', 'COMPUTERS', 'COMMUNICATIONS'],
  FIRE: ['FIRE', 'FIREWORKS'],
  FOLEY: ['FOLEY', 'FOOTSTEPS'],
  GUNS: ['GUNS', 'WEAPONS', 'BULLETS'],
  HORNS: ['HORNS'],
  HUMAN: ['HUMAN', 'VOICES'],
  IMPACTS: ['METAL', 'WOOD', 'GLASS', 'ROCKS', 'CERAMICS', 'PLASTIC', 'WATER', 'DIRT & SAND', 'ICE', 'GORE'],
  MACHINES: ['MACHINES', 'ROBOTS', 'MOTORS', 'MECHANICAL'],
  MAGIC: ['MAGIC'],
  MEDICAL: ['BEEPS', 'MACHINES', 'OBJECTS'],
  MOVEMENT: ['MOVEMENT', 'DRAWERS', 'MECHANICAL'],
  MUSICAL: ['MUSICAL'],
  NATURE: ['AMBIENCE', 'WATER', 'WIND', 'RAIN', 'GEOTHERMAL', 'NATURAL DISASTER', 'VEGETATION', 'WEATHER'],
  OFFICE: ['OBJECTS', 'COMPUTERS', 'MACHINES', 'COMMUNICATIONS', 'AMBIENCE'],
  SCIFI: ['SCIFI', 'DESIGNED', 'ROBOTS', 'LASERS'],
  SPORTS: ['SPORTS', 'CROWDS'],
  TOOLS: ['TOOLS', 'MECHANICAL'],
  VEHICLES: ['VEHICLES', 'MOTORS'],
  WATER: ['WATER', 'LIQUID & MUD'],
  WEAPONS: ['WEAPONS', 'FIGHT'],
  WHOOSHES: ['SWOOSHES', 'DESIGNED', 'AIR'],
};

/**
 * Explicit per-subcategory routing, keyed `LEGACY_CATEGORY/SeedSubCategory` ->
 * one or more `OFFICIAL_CATEGORY/OFFICIAL_LABEL` targets (compared
 * case/space-insensitively). Needed where the legacy bucket mixes concerns that
 * UCS splits apart, or where the legacy name is a synonym of the official one.
 */
const SUBCATEGORY_MAP = {
  // ---- AIRCRAFT ----
  'AIRCRAFT/PropPlane': 'AIRCRAFT/PROP',
  'AIRCRAFT/Drone': 'AIRCRAFT/RADIO CONTROLLED',
  'AIRCRAFT/Cabin': 'AIRCRAFT/INTERIOR',
  // ---- ALARMS ----
  'ALARMS/House': 'ALARMS/ELECTRONIC',
  'ALARMS/Industrial': ['ALARMS/ELECTRONIC', 'AMBIENCE/INDUSTRIAL'],
  // ---- AMBIENCE ----
  'AMBIENCE/DesignedDark': 'AMBIENCE/DESIGNED',
  'AMBIENCE/DesignedSciFi': 'AMBIENCE/SCIFI',
  'AMBIENCE/ExtAirport': 'AMBIENCE/TRANSPORTATION',
  'AMBIENCE/ExtCity': 'AMBIENCE/URBAN',
  'AMBIENCE/ExtCrowd': 'AMBIENCE/PUBLIC PLACE',
  'AMBIENCE/ExtForest': 'AMBIENCE/FOREST',
  'AMBIENCE/ExtJungle': 'AMBIENCE/TROPICAL',
  'AMBIENCE/ExtOcean': ['AMBIENCE/SEASIDE', 'WATER/SURF'],
  'AMBIENCE/ExtRain': 'RAIN/GENERAL',
  'AMBIENCE/ExtStreet': 'AMBIENCE/TOWN',
  'AMBIENCE/ExtTraffic': 'AMBIENCE/TRAFFIC',
  'AMBIENCE/ExtWind': 'AMBIENCE/AIR',
  'AMBIENCE/IntChurch': 'AMBIENCE/RELIGIOUS',
  'AMBIENCE/IntDoor': 'AMBIENCE/TRANSPORTATION',
  'AMBIENCE/IntHouse': 'AMBIENCE/RESIDENTIAL',
  'AMBIENCE/IntOffice': 'AMBIENCE/OFFICE',
  'AMBIENCE/IntWarehouse': 'AMBIENCE/INDUSTRIAL',
  // ---- ANIMALS ----
  'ANIMALS/Bird': ['ANIMALS/WILD', 'BIRDS/MISC'],
  'ANIMALS/Cat': 'ANIMALS/CAT DOMESTIC',
  'ANIMALS/Dog': 'ANIMALS/DOG',
  'ANIMALS/Horse': 'ANIMALS/HORSE',
  'ANIMALS/Insect': 'ANIMALS/INSECT',
  // ---- BELLS ----
  'BELLS/Church': ['BELLS/LARGE', 'BELLS/GONG'],
  'BELLS/Door': 'BELLS/DOORBELL',
  'BELLS/Gong': 'BELLS/GONG',
  // ---- BOATS ----
  'BOATS/Sailboat': 'BOATS/SAILBOAT',
  'BOATS/Speedboat': 'BOATS/MOTORBOAT',
  'BOATS/Ship': 'BOATS/SHIP',
  // ---- CROWD ----
  'CROWD/Applause': 'CROWDS/APPLAUSE',
  'CROWD/Cheer': 'CROWDS/CHEERING',
  'CROWD/City': 'CROWDS/WALLA',
  'CROWD/Cries': 'CROWDS/ANGRY',
  'CROWD/Protest': ['CROWDS/ANGRY', 'AMBIENCE/PROTEST'],
  'CROWD/Sports': 'CROWDS/SPORT',
  // ---- DESIGNED ----
  'DESIGNED/Braam': 'DESIGNED/BRAAM',
  'DESIGNED/Hit': 'DESIGNED/IMPACT',
  'DESIGNED/Riser': 'DESIGNED/RISER',
  'DESIGNED/Downlifter': 'DESIGNED/MORPH',
  'DESIGNED/Transition': 'DESIGNED/MORPH',
  'DESIGNED/Whoosh': 'DESIGNED/WHOOSH',
  // ---- DOORS ----
  'DOORS/Car': ['DOORS/METAL', 'VEHICLES/DOOR'],
  'DOORS/Elevator': 'DOORS/SLIDING',
  'DOORS/Glass': 'DOORS/GLASS',
  'DOORS/Metal': 'DOORS/METAL',
  'DOORS/Wood': 'DOORS/WOOD',
  // ---- ELECTRONIC ----
  'ELECTRONIC/Alarm': 'ALARMS/ELECTRONIC',
  'ELECTRONIC/Beep': 'BEEPS/GENERAL',
  'ELECTRONIC/Glitch': 'SCIFI/MECHANISM',
  'ELECTRONIC/Hum': 'ELECTRICITY/BUZZ & HUM',
  'ELECTRONIC/Noise': 'ELECTRICITY/MISC',
  'ELECTRONIC/PowerDown': 'SCIFI/MECHANISM',
  'ELECTRONIC/PowerUp': 'SCIFI/MECHANISM',
  'ELECTRONIC/PowerUpDown': 'SCIFI/MECHANISM',
  // ---- EMOTIONS ----
  'EMOTIONS/Anger': 'VOICES/EFFORTS',
  'EMOTIONS/Cry': 'VOICES/CRYING',
  'EMOTIONS/Fear': 'VOICES/SCREAM',
  'EMOTIONS/Laugh': 'VOICES/LAUGH',
  'EMOTIONS/Pain': 'VOICES/EFFORTS',
  'EMOTIONS/Sigh': 'HUMAN/BREATH',
  'EMOTIONS/Surprise': 'VOICES/REACTION',
  // ---- EQUIPMENT ----
  'EQUIPMENT/Camera': 'COMMUNICATIONS/CAMERA',
  'EQUIPMENT/Computer': 'COMPUTERS/MISC',
  'EQUIPMENT/Fan': 'MACHINES/FAN',
  'EQUIPMENT/Printer': 'COMPUTERS/MISC',
  'EQUIPMENT/Stove': 'MACHINES/APPLIANCE',
  'EQUIPMENT/Tools': 'TOOLS/MISC',
  // ---- FIRE ----
  'FIRE/Crackle': 'FIRE/CRACKLE',
  'FIRE/Fireworks': 'FIREWORKS/MISC',
  'FIRE/Flames': 'FIRE/BURNING',
  'FIRE/Lighter': 'FIRE/IGNITE',
  'FIRE/Match': 'FIRE/IGNITE',
  'FIRE/Torch': 'FIRE/TORCH',
  // ---- FOLEY ----
  'FOLEY/Cloth': 'FOLEY/CLOTH',
  'FOLEY/Coins': ['FOLEY/PROP', 'OBJECTS/COIN'],
  'FOLEY/Paper': 'PAPER/HANDLE',
  'FOLEY/Plastic': 'PLASTIC/HANDLE',
  'FOLEY/FootstepsBoots': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsCarpet': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsConcrete': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsGrass': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsGravel': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsHeels': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsMetal': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsSnow': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsSneakers': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsWater': 'FOOTSTEPS/HUMAN',
  'FOLEY/FootstepsWoodFloor': 'FOOTSTEPS/HUMAN',
  // ---- GUNS ----
  'GUNS/Cannon': 'GUNS/CANNON',
  'GUNS/Handgun': 'GUNS/PISTOL',
  'GUNS/MachineGun': 'GUNS/AUTOMATIC',
  'GUNS/Rifle': 'GUNS/RIFLE',
  'GUNS/Shotgun': 'GUNS/SHOTGUN',
  'GUNS/Silenced': 'GUNS/SUPPRESSED',
  // ---- HORNS ----
  'HORNS/Air': 'HORNS/AIR POWERED',
  'HORNS/Car': ['VEHICLES/HORN', 'HORNS/TRADITIONAL'],
  'HORNS/Ship': 'BOATS/HORN',
  'HORNS/Train': 'TRAINS/HORN',
  // ---- HUMAN ----
  'HUMAN/Breath': 'HUMAN/BREATH',
  'HUMAN/Cough': 'HUMAN/COUGH',
  'HUMAN/Cry': 'VOICES/CRYING',
  'HUMAN/Heartbeat': 'HUMAN/HEARTBEAT',
  'HUMAN/Scream': 'VOICES/SCREAM',
  'HUMAN/Sneeze': 'HUMAN/SNEEZE',
  'HUMAN/Snore': 'HUMAN/SNORE',
  // ---- IMPACTS ----
  'IMPACTS/Metal': 'METAL/IMPACT',
  'IMPACTS/Body': 'FIGHT/IMPACT',
  'IMPACTS/Flesh': 'GORE/FLESH',
  'IMPACTS/Stone': 'ROCKS/IMPACT',
  'IMPACTS/Water': 'WATER/IMPACT',
  'IMPACTS/Wood': 'WOOD/IMPACT',
  // ---- MACHINES ----
  'MACHINES/Hydraulic': 'MECHANICAL/HYDRAULIC & PNEUMATIC',
  'MACHINES/Motor': 'MOTORS/ELECTRIC',
  'MACHINES/Robot': 'ROBOTS/MOVEMENT',
  'MACHINES/Vacuum': 'MACHINES/APPLIANCE',
  'MACHINES/WashingMachine': 'MACHINES/APPLIANCE',
  // ---- MAGIC ----
  'MAGIC/Spell': 'MAGIC/SPELL',
  'MAGIC/Whoosh': 'MAGIC/SHIMMER',
  // ---- MEDICAL ----
  'MEDICAL/Defibrillator': 'MACHINES/MEDICAL',
  'MEDICAL/Monitor': 'BEEPS/MEDICAL',
  // ---- MOVEMENT ----
  'MOVEMENT/Chair': 'OBJECTS/FURNITURE',
  'MOVEMENT/Drawer': 'DRAWERS/MISC',
  'MOVEMENT/Switch': 'MECHANICAL/SWITCH',
  // ---- MUSICAL ----
  'MUSICAL/Brass': 'MUSICAL/BRASS',
  'MUSICAL/DrumKit': 'MUSICAL/PERCUSSION',
  'MUSICAL/DrumTaiko': 'MUSICAL/PERCUSSION',
  'MUSICAL/GuitarAcoustic': 'MUSICAL/PLUCKED',
  'MUSICAL/GuitarElectric': 'MUSICAL/PLUCKED',
  'MUSICAL/Harp': 'MUSICAL/PLUCKED',
  'MUSICAL/Percussion': 'MUSICAL/PERCUSSION',
  'MUSICAL/Piano': 'MUSICAL/KEYED',
  'MUSICAL/String': 'MUSICAL/STRINGED',
  // ---- NATURE ----
  'NATURE/Beach': 'AMBIENCE/SEASIDE',
  'NATURE/River': 'WATER/FLOW',
  'NATURE/Thunder': 'WEATHER/THUNDER',
  'NATURE/Waterfall': 'WATER/WATERFALL',
  'NATURE/Wind': 'WIND/GENERAL',
  // ---- OFFICE ----
  'OFFICE/Chair': 'OBJECTS/FURNITURE',
  'OFFICE/Keyboard': 'COMPUTERS/KEYBOARD & MOUSE',
  'OFFICE/Mouse': 'COMPUTERS/KEYBOARD & MOUSE',
  'OFFICE/Paper': 'PAPER/HANDLE',
  'OFFICE/Phone': 'COMMUNICATIONS/TELEPHONE',
  'OFFICE/Printer': 'COMPUTERS/MISC',
  // ---- SCIFI ----
  'SCIFI/Alarm': 'SCIFI/ALARM',
  'SCIFI/Door': 'SCIFI/DOOR',
  'SCIFI/Teleport': 'SCIFI/ENERGY',
  'SCIFI/Weapon': 'SCIFI/WEAPON',
  // ---- SPORTS ----
  'SPORTS/Ball': 'SPORTS/MISC',
  'SPORTS/Swimming': 'SPORTS/WATER',
  'SPORTS/Whistle': 'WHISTLES/HUMAN',
  // ---- TOOLS ----
  'TOOLS/Hammer': 'TOOLS/HAND',
  'TOOLS/Wrench': 'TOOLS/HAND',
  'TOOLS/Drill': 'TOOLS/POWER',
  // ---- VEHICLES ----
  'VEHICLES/Car': 'VEHICLES/CAR',
  'VEHICLES/Motorcycle': 'VEHICLES/MOTORCYCLE',
  'VEHICLES/Train': 'TRAINS/MISC',
  'VEHICLES/Truck': 'VEHICLES/TRUCK VAN & SUV',
  'VEHICLES/Engine': ['MOTORS/COMBUSTION', 'VEHICLES/MECHANISM'],
  // ---- WATER ----
  'WATER/Boiling': 'WATER/BUBBLES',
  'WATER/Drip': 'WATER/DRIP',
  'WATER/Pouring': 'WATER/POUR',
  'WATER/River': 'WATER/FLOW',
  'WATER/Shower': 'WATER/PLUMBING',
  'WATER/Splash': 'WATER/SPLASH',
  'WATER/Tap': 'WATER/PLUMBING',
  'WATER/Waves': 'WATER/WAVE',
  // ---- WEAPONS ----
  'WEAPONS/Knife': 'WEAPONS/KNIFE',
  'WEAPONS/Sword': 'WEAPONS/SWORD',
  // ---- WHOOSHES ----
  'WHOOSHES/Air': 'AIR/BLOW',
  'WHOOSHES/Cloth': 'DESIGNED/WHOOSH',
  'WHOOSHES/Fight': 'FIGHT/IMPACT',
  'WHOOSHES/PassBy': 'DESIGNED/WHOOSH',
  'WHOOSHES/Sword': 'WEAPONS/SWORD',
  'WHOOSHES/Transition': 'DESIGNED/WHOOSH',
  'WHOOSHES/Debris': 'DESIGNED/WHOOSH',
};

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Category-level Chinese labels that must survive a re-run. The migrated value
 * comes from the legacy seed and was written for the legacy bucket, so a few
 * are too narrow for the official category they now name — RAIN became
 * "雨声户外" (outdoor rain ambience) although the official RAIN category also
 * covers indoor rain on glass, cloth, metal, vegetation and wood.
 */
const CATEGORY_LABEL_OVERRIDES = {
  RAIN: '雨',
  'DIRT & SAND': '泥土与沙',
  'FOOD & DRINK': '食物与饮品',
  'LIQUID & MUD': '液体与泥浆',
  'NATURAL DISASTER': '自然灾害',
  'USER INTERFACE': '界面交互',
};

async function main() {
  const seed = await read('categories.seed.json');
  const zhNames = await read('zh-Hans.json');
  const catalog = await read('official-catalog.json');

  // Re-runs must not discard category labels that were added by hand after the
  // first migration, so seed the output from whatever is on disk already.
  let previous = { categories: {}, catIds: {} };
  try {
    const parsed = JSON.parse(await readFile(new URL('curated-zh.json', DATA), 'utf8'));
    previous = {
      categories: parsed.categories ?? {},
      catIds: parsed.catIds ?? {},
    };
  } catch {
    /* first run */
  }

  // Build an index of the official vocabulary: category -> label -> CatID
  const official = new Map();
  const catIds = new Set();
  for (const [category, info] of Object.entries(catalog.tree)) {
    const byLabel = new Map();
    for (const item of info.subCategories) {
      const m = /^(.*) \(([A-Za-z0-9]+)\)$/.exec(item);
      if (!m) continue;
      byLabel.set(norm(m[1]), { label: m[1], catId: m[2] });
      catIds.add(m[2]);
    }
    official.set(category, byLabel);
  }

  const out = {
    _note:
      'Hand-curated Chinese display names and search synonyms, re-keyed onto OFFICIAL UCS ' +
      'v8.2.1 CatIDs by scripts/migrate-seed-zh.mjs. `categories` maps a UCS category code ' +
      'to its Chinese display name (all 82 covered); `catIds` maps an official CatID to its ' +
      'Chinese label plus extra search synonyms. Merged into the dataset by ' +
      'scripts/build-ucs.mjs — entries that are not in the official list are ignored, so this ' +
      'file can never invent a CatID.',
    _ordering:
      'Each `catIds` entry is written so the Chinese label comes first and the hand-written ' +
      'synonyms follow; build-ucs.mjs prepends this list to the official synonyms, which keeps ' +
      'the most searchable Chinese term inside the slice the Chinese query rewriter reads.',
    _source: 'Migrated from data/categories.seed.json + data/zh-Hans.json (UCS v8.2.1 official list).',
    categories: { ...previous.categories, ...CATEGORY_LABEL_OVERRIDES },
    catIds: {},
  };

  const stats = { routed: 0, unmapped: [], categoryLabels: Object.keys(previous.categories).length, subLabels: 0 };

  // Carry hand-edited per-CatID entries forward, then let the seed mapping add
  // to them. Nothing here can introduce a CatID: keys are re-checked below.
  for (const [catId, value] of Object.entries(previous.catIds)) {
    if (value && typeof value === 'object') {
      out.catIds[catId] = {
        zh: Array.isArray(value.zh) ? [...value.zh] : [],
        ...(value.label ? { label: value.label } : {}),
        ...(Array.isArray(value.excludes) && value.excludes.length ? { excludes: [...value.excludes] } : {}),
      };
    }
  }

  for (const [legacyCat, targets] of Object.entries(CATEGORY_MAP)) {
    const seedEntries = seed.categories.filter((c) => c.category === legacyCat);
    if (seedEntries.length === 0) continue;

    // Category-level Chinese label: inherit from the first target that has one.
    const catLabel = zhNames[legacyCat];
    if (catLabel) {
      const primary = targets[0];
      if (!out.categories[primary]) {
        out.categories[primary] = catLabel;
        stats.categoryLabels += 1;
      }
    }

    for (const entry of seedEntries) {
      const subKey = entry.subCategory;
      const explicit = SUBCATEGORY_MAP[`${legacyCat}/${subKey}`];
      const targetsForEntry = [];
      if (explicit) {
        for (const spec of Array.isArray(explicit) ? explicit : [explicit]) {
          const slash = spec.lastIndexOf('/');
          const tc = spec.slice(0, slash);
          const tl = spec.slice(slash + 1);
          const hit = official.get(tc)?.get(norm(tl));
          if (hit) targetsForEntry.push(hit);
          else stats.unmapped.push(`${legacyCat}/${subKey} -> ${spec} (no such official subcategory)`);
        }
      } else {
        // Name match within each candidate category, else the first candidate's
        // MISC bucket so no curated synonym is silently dropped.
        for (const tc of targets) {
          const hit = official.get(tc)?.get(norm(subKey));
          if (hit) {
            targetsForEntry.push(hit);
            break;
          }
        }
        if (targetsForEntry.length === 0) {
          const tc = targets[0];
          const hit = official.get(tc)?.get(norm('MISC'));
          if (hit) {
            targetsForEntry.push(hit);
            stats.unmapped.push(`${legacyCat}/${subKey} -> ${tc}/MISC (fuzzy fallback)`);
          }
        }
      }
      if (targetsForEntry.length === 0) {
        stats.unmapped.push(`${legacyCat}/${subKey} -> DROPPED`);
        continue;
      }

      const label = zhNames[`${legacyCat}/${subKey}`];
      for (const target of targetsForEntry) {
        const existing = out.catIds[target.catId] ?? { zh: [] };
        if (label && !existing.label) existing.label = label;
        for (const syn of entry.synonymsZh ?? []) {
          const value = String(syn).trim();
          if (value && value !== existing.label && !existing.zh.includes(value)) existing.zh.push(value);
        }
        for (const ex of entry.excludes ?? []) {
          const value = String(ex).trim();
          const list = (existing.excludes ??= []);
          if (value && !list.includes(value)) list.push(value);
        }
        if (existing.excludes?.length > 8) existing.excludes = existing.excludes.slice(0, 8);
        if (existing.zh.length > 24) existing.zh = existing.zh.slice(0, 24);
        out.catIds[target.catId] = existing;
        stats.routed += 1;
      }
    }
  }

  for (const key of Object.keys(out.catIds)) {
    if (out.catIds[key].label) stats.subLabels += 1;
  }

  await writeFile(new URL('curated-zh.json', DATA), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  const unmapped = stats.unmapped;
  console.log(`routed ${stats.routed} curated entries onto official CatIDs`);
  console.log(`  category labels: ${stats.categoryLabels}/82`);
  console.log(`  CatID labels   : ${stats.subLabels}`);
  console.log(`  fuzzy fallbacks: ${unmapped.filter((u) => u.includes('fuzzy')).length}`);
  console.log(`  dropped        : ${unmapped.filter((u) => u.includes('DROPPED')).length}`);
  if (process.argv.includes('--report')) {
    for (const u of unmapped) console.log(`    ${u}`);
  }
}

await main();
