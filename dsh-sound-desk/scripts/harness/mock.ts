/**
 * Fake host + engine for the visual harness.
 *
 * The real workbench talks to `/dsh-sound-desk` on the DSH origin. This module
 * installs the same shapes from a table so the page can be opened in a plain
 * browser for screenshots and manual UI review — no engine, no library, no DSH.
 */

const library = {
  id: 1,
  name: 'Game SFX · 主库',
  root: 'D:/SFX/GameAudio',
  kind: 'local',
  coverPath: null,
  createdAt: Date.now(),
  assetCount: 1284,
}

const categoryTree = [
  {
    category: 'DOOR',
    count: 4,
    children: [
      { catId: 'DOORMetal', label: 'Metal', count: 2 },
      { catId: 'DOORWood', label: 'Wood', count: 1 },
      { catId: 'DOORGlass', label: 'Glass', count: 1 },
    ],
  },
  {
    category: 'IMPACT',
    count: 2,
    children: [
      { catId: 'IMPACTMetal', label: 'Metal', count: 1 },
      { catId: 'IMPACTStone', label: 'Stone', count: 1 },
    ],
  },
  { category: 'UI', count: 2, children: [{ catId: 'UIConfirm', label: 'Confirm', count: 2 }] },
  { category: 'AMBIENCE', count: 1, children: [{ catId: 'AMBForest', label: 'Forest', count: 1 }] },
]

function asset(id, filename, durationMs, extra = {}) {
  return {
    id,
    filename,
    path: `D:/SFX/GameAudio/${filename}`,
    libraryId: 1,
    libraryRoot: 'D:/SFX/GameAudio',
    durationMs,
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    codec: 'PCM',
    sizeBytes: 48000 * 2 * 3 * (durationMs / 1000),
    stage: 4,
    hash: 'deadbeef',
    peaksPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    favorite: false,
    rating: 0,
    tags: [],
    playCount: 0,
    lastPlayedAt: null,
    ucsCatId: null,
    ucsConfidence: null,
    ucsSource: null,
    ucsEvidence: null,
    ucsAlternatives: [],
    embedded: {
      description: null,
      keywords: [],
      designer: null,
      recorder: null,
      library: null,
      copyright: null,
      scene: null,
      take: null,
      note: null,
    },
    format: {
      codec: 'PCM',
      sampleRate: 48000,
      bitDepth: 24,
      channels: 2,
      isFloat: false,
      audioFormatTag: 1,
    },
    dsp: {
      peak: 0.91,
      rms: 0.15,
      peakDb: -0.8,
      rmsDb: -16.4,
      decayMs: 620,
      spectralCentroidHz: 3200,
      highFrequencyRatio: 0.31,
      stereoCorrelation: 0.62,
      hasVoiceLikeActivity: false,
      tonality: 0.24,
    },
    ...extra,
  }
}

const assets = [
  asset(11, 'door_metal_slam_heavy_04.wav', 1150, {
    ucsCatId: 'DOORMetal',
    ucsConfidence: 0.91,
    ucsSource: 'filename',
    ucsEvidence: 'filename "door_metal_slam"',
    favorite: true,
    rating: 5,
    tags: ['heavy', 'trailer'],
    playCount: 12,
    embedded: {
      description: 'A heavy steel door slamming shut in a concrete stairwell.',
      keywords: ['door', 'metal', 'slam', 'heavy'],
      designer: 'A. Chen',
      recorder: null,
      library: 'GameAudio',
      copyright: null,
      scene: 'facility',
      take: '04',
      note: null,
    },
  }),
  asset(12, 'door_metal_close_latch_02.wav', 780, {
    ucsCatId: 'DOORMetal',
    ucsConfidence: 0.83,
    ucsSource: 'filename',
    tags: ['mechanical'],
  }),
  asset(13, 'impact_metal_clang_01.wav', 940, {
    ucsCatId: 'IMPACTMetal',
    ucsConfidence: 0.77,
    ucsSource: 'filename',
    favorite: true,
  }),
  asset(14, 'ui_confirm_tone_02.wav', 420, {
    ucsCatId: 'UIConfirm',
    ucsConfidence: 0.88,
    ucsSource: 'filename',
    rating: 3,
  }),
  asset(15, 'amb_forest_dawn_loop_01.wav', 48_000, {
    ucsCatId: 'AMBForest',
    ucsConfidence: 0.72,
    ucsSource: 'filename',
    tags: ['loop', 'bed'],
  }),
]

const hits = [
  { asset: assets[0], score: { vector: 0.88, fts: 0.7, ucs: 0.9, struct: 0.6, ranks: { vector: 1, bm25: 2 }, final: 0.91, confidence: 0.91, rerank: { fused: 0.8, lexical: 0.9, category: 0.85, dsp: 1, matchedTerms: ['door', 'metal', 'slam'] } }, captions: ['metal door slam'], highlights: ['door', 'metal'] },
  { asset: assets[1], score: { vector: 0.74, fts: 0.6, ucs: 0.7, struct: 0.5, ranks: { vector: 2, bm25: 1 }, final: 0.79, confidence: 0.79 }, captions: ['metal door latch'], highlights: ['door'] },
  { asset: assets[2], score: { vector: 0.66, fts: 0.55, ucs: 0.6, struct: 0.4, ranks: { vector: 3 }, final: 0.7, confidence: 0.7 }, captions: ['metal clang'], highlights: ['metal'] },
  { asset: assets[3], score: { vector: 0.58, fts: 0.4, ucs: 0.5, struct: 0.3, ranks: { vector: 4 }, final: 0.61, confidence: 0.61 }, captions: ['ui confirm tone'], highlights: [] },
  { asset: assets[4], score: { vector: 0.52, fts: 0.3, ucs: 0.45, struct: 0.2, ranks: { vector: 5 }, final: 0.55, confidence: 0.55 }, captions: ['forest ambience'], highlights: [] },
]

/**
 * A real clip for the mocked media routes.
 *
 * The workbench is only convincing with a waveform on screen, and the waveform is
 * drawn from the engine's peak container (or decoded samples). Serving a generated
 * WAV plus a matching `SDPK` pyramid keeps the harness honest: the same code paths
 * run that run against a real library.
 */
const SAMPLE_RATE = 48_000
const CLIP_SECONDS = 1.4

function envelopeAt(seconds: number): number {
  const attack = Math.min(1, seconds / 0.004)
  return attack * Math.exp(-seconds * 3.1)
}

function clipChannels(): Float32Array[] {
  const count = Math.round(SAMPLE_RATE * CLIP_SECONDS)
  const left = new Float32Array(count)
  const right = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const t = i / SAMPLE_RATE
    const env = envelopeAt(t)
    const body = Math.sin(2 * Math.PI * 82 * t) * 0.62 + Math.sin(2 * Math.PI * 173 * t) * 0.28
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1
    const sample = (body + noise * 0.22) * env * 0.86
    left[i] = Math.max(-1, Math.min(1, sample))
    right[i] = Math.max(-1, Math.min(1, sample * 0.94 + Math.sin(2 * Math.PI * 96 * t) * env * 0.05))
  }
  return [left, right]
}

let wavCache: Uint8Array | null = null
function wavBytes(): Uint8Array {
  if (wavCache !== null) return wavCache
  const [left, right] = clipChannels()
  const frames = left.length
  const dataBytes = frames * 2 * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let i = 0; i < frames; i += 1) {
    view.setInt16(offset, Math.round(left[i] * 32767), true)
    view.setInt16(offset + 2, Math.round(right[i] * 32767), true)
    offset += 4
  }
  wavCache = new Uint8Array(buffer)
  return wavCache
}

/** `SDPK` v1, one level — the same container `@sounddesk/audio-wav` writes. */
let peakCache: Uint8Array | null = null
function peakBytes(): Uint8Array {
  if (peakCache !== null) return peakCache
  const [left, right] = clipChannels()
  const buckets = 900
  const samplesPerBucket = Math.ceil(left.length / buckets)
  const dataBytes = buckets * 2 * 2 * 2
  const buffer = new ArrayBuffer(14 + 12 + dataBytes)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'SDPK')
  view.setUint16(4, 1, true)
  view.setUint32(6, SAMPLE_RATE, true)
  view.setUint16(10, 2, true)
  view.setUint16(12, 1, true)
  view.setUint32(14, samplesPerBucket, true)
  view.setUint32(18, buckets, true)
  view.setUint32(22, dataBytes, true)
  let offset = 26
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    for (const channel of [left, right]) {
      const start = bucket * samplesPerBucket
      const end = Math.min(start + samplesPerBucket, channel.length)
      let min = 1
      let max = -1
      for (let i = start; i < end; i += 1) {
        if (channel[i] < min) min = channel[i]
        if (channel[i] > max) max = channel[i]
      }
      if (start >= end) {
        min = 0
        max = 0
      }
      view.setInt16(offset, Math.round(min * 32767), true)
      view.setInt16(offset + 2, Math.round(max * 32767), true)
      offset += 4
    }
  }
  peakCache = new Uint8Array(buffer)
  return peakCache
}

const settings = {
  dataDir: '',
  loadModel: true,
  ffmpegPath: '',
  referenceDir: '',
  logLevel: 'normal',
}

const hostStatus = {
  plugin: 'dsh-sound-desk',
  version: '0.1.0',
  state: 'ready',
  error: null,
  restartRequired: false,
  dataDir: 'C:/Users/me/.dsh/sound-desk',
  engineUrl: 'http://127.0.0.1:51234',
  modelLoaded: true,
  modelId: 'Xenova/clap-htsat-unfused',
  embedderError: null,
  ffmpeg: 'C:/tools/ffmpeg.exe',
  stats: { assets: 1284, libraries: 2, embedded: 1180, peaks: 1284, totalBytes: 0, byStage: {}, byCategory: [] },
  settings,
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function installMockHost() {
  const global = window as unknown as { fetch: typeof fetch; __DSH_SOUND_DESK_MOCK__?: boolean }
  if (global.__DSH_SOUND_DESK_MOCK__ === true) return
  global.__DSH_SOUND_DESK_MOCK__ = true
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url, window.location.origin)
    const path = url.pathname.replace(/^\/dsh-sound-desk/, '')
    const method = (init.method ?? 'GET').toUpperCase()

    if (path === '/host/status') return json(hostStatus)
    if (path === '/host/settings') return json({ settings, dataDir: hostStatus.dataDir, restartRequired: false })
    if (path === '/host/logs') {
      return json({
        level: 'normal',
        lines: [
          { at: Date.now() - 54_000, level: 'info', text: 'UCS dataset: 753 CatIDs, data version 8.2.1' },
          { at: Date.now() - 53_000, level: 'info', text: 'embedding model ready: Xenova/clap-htsat-unfused (512d)' },
          { at: Date.now() - 52_000, level: 'info', text: 'engine ready at http://127.0.0.1:51234' },
        ],
      })
    }
    if (path === '/api/libraries') return json({ libraries: [library, { ...library, id: 2, name: 'Foley · 素材盘', root: 'E:/Foley', assetCount: 402 }] })
    if (path === '/api/stats') {
      return json({
        assets: 1284,
        libraries: 2,
        embedded: 1180,
        peaks: 1284,
        totalBytes: 6_400_000_000,
        byStage: { '4': 1180, '2': 104 },
        byCategory: categoryTree.map((node) => ({ category: node.category, count: node.count })),
        dbBytes: 18_400_000,
        modelsReady: true,
      })
    }
    if (path === '/api/ucs/tree') return json({ tree: categoryTree, uncategorized: 104 })
    if (path === '/api/jobs') return json({ jobs: [] })
    if (path === '/api/personalization') return json({ enabled: true, events: 214, assets: 96, maxAdjustment: 0.1 })
    if (path === '/api/session') {
      return json({
        ok: true,
        serverVersion: '0.1.0',
        embeddingDim: 512,
        similarityThreshold: 0.12,
        webRoot: null,
        ffmpeg: { available: true, version: '7.1', source: 'path' },
        maxsim: { windowedAssets: 42, windowedVectors: 126, maxWindows: 8, refinePerQuery: 2 },
      })
    }
    if (path === '/api/playlists') return json({ playlists: [{ id: 1, name: '预告片低音', itemCount: 18 }] })
    if (path === '/api/assets') return json({ items: assets, total: 1284, limit: 500, offset: 0 })
    if (/^\/api\/assets\/\d+$/.test(path) && method === 'GET') {
      const id = Number(path.split('/').pop())
      return json(assets.find((entry) => entry.id === id) ?? assets[0])
    }
    if (/^\/api\/assets\/\d+\/embedded$/.test(path)) {
      return json({ editable: true, reason: null, hasBackup: false, embedded: assets[0].embedded })
    }
    if (path === '/api/search') {
      return json({
        hits,
        total: 1284,
        tookMs: 24,
        captionsUsed: ['metal door slam'],
        unmatchedTerms: [],
        belowThreshold: false,
        semanticIncomplete: false,
      })
    }
    if (/^\/api\/media\/\d+\/stream$/.test(path)) {
      return new Response(wavBytes(), {
        status: 200,
        headers: { 'content-type': 'audio/wav', 'content-length': String(wavBytes().byteLength) },
      })
    }
    if (/^\/api\/media\/\d+\/peaks$/.test(path)) {
      return new Response(peakBytes(), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    }
    if (/^\/api\/media\/\d+\/download$/.test(path)) {
      return new Response(wavBytes(), {
        status: 200,
        headers: { 'content-type': 'audio/wav', 'content-disposition': 'attachment; filename="door_metal_slam_heavy_04.wav"' },
      })
    }
    if (path === '/api/personalization/usage') return json({ ok: true, events: 215 })
    console.warn('MOCK MISS', method, path)
    return json({ error: `mock: no route for ${method} ${path}` }, 404)
  }
}
