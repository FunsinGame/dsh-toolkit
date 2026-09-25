/**
 * Can the CLAP model actually load from inside the INSTALLED extension package?
 *
 * The extension reports `modelsReady: false`, the manifest default is `true`, and no
 * settings file overrides it — so the remaining explanation is that the model load
 * itself fails in the packaged environment. `createEmbedder` degrades to a null
 * embedder and records a reason instead of throwing, so the failure is invisible
 * unless it is reproduced deliberately.
 *
 * This resolves everything from the extension's own `out/` directory, exactly as the
 * bundled extension does, so pnpm's hoisting cannot hide a missing dependency.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const extDir = path.resolve(
  process.argv[2] ?? path.join(process.env.USERPROFILE ?? '', '.vscode', 'extensions', 'sounddesk.sound-desk-vscode-0.1.0'),
);
const bundle = path.join(extDir, 'out', 'extension.js');
console.log(`extension: ${extDir}`);

const req = createRequire(bundle);
console.log('\n=== dependency resolution from the extension ===');
for (const spec of ['@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-common', 'ffmpeg-static']) {
  try {
    console.log(`  ok   ${spec} -> ${path.relative(extDir, req.resolve(spec))}`);
  } catch (err) {
    console.log(`  FAIL ${spec} -> ${err.code}`);
  }
}

console.log('\n=== load the model the way the engine does ===');
let transformers;
try {
  transformers = req('@huggingface/transformers');
  console.log('  transformers loaded, exports:', Object.keys(transformers).length);
} catch (err) {
  console.log('  FAILED to load transformers:', err.code ?? '', String(err.message).split('\n')[0]);
  process.exit(1);
}

// The same call the engine makes, with the same model id and cache directory default.
const { env, AutoTokenizer, AutoProcessor, ClapTextModelWithProjection, ClapAudioModelWithProjection } = transformers;
console.log('  cacheDir:', env.cacheDir ? path.relative(extDir, env.cacheDir) : '(none)');

try {
  const tokenizer = await AutoTokenizer.from_pretrained('Xenova/clap-htsat-unfused');
  console.log('  tokenizer ok');
  const textModel = await ClapTextModelWithProjection.from_pretrained('Xenova/clap-htsat-unfused', { dtype: 'q8' });
  console.log('  text model ok');
  const encoded = await tokenizer(['a door closing']);
  const out = await textModel(encoded);
  const embeds = out.text_embeds ?? out.embeds;
  console.log('  text embedding dims:', embeds ? embeds.dims.join('x') : '(none)');

  const processor = await AutoProcessor.from_pretrained('Xenova/clap-htsat-unfused');
  console.log('  processor ok');
  const audioModel = await ClapAudioModelWithProjection.from_pretrained('Xenova/clap-htsat-unfused', { dtype: 'q8' });
  console.log('  audio model ok');
  const features = await processor(new Float32Array(48_000));
  const input = features.input_features ?? Object.values(features)[0];
  const audioOut = await audioModel({ input_features: input });
  const audioEmbeds = audioOut.audio_embeds ?? audioOut.embeds;
  console.log('  audio embedding dims:', audioEmbeds ? audioEmbeds.dims.join('x') : '(none)');

  console.log('\nRESULT: the model loads and runs from inside the installed package.');
} catch (err) {
  console.log('\nRESULT: MODEL LOAD FAILED');
  console.log('  ', err.code ?? '', String(err.message).split('\n').slice(0, 4).join('\n   '));
  process.exit(1);
}
