/**
 * Check that a code string is present in a bundle, accounting for the fact that
 * esbuild escapes non-ASCII to \uXXXX by default.
 *
 * Written as a file because passing the regex through a PowerShell here-string
 * mangles the backslashes, which made an earlier check report a false negative.
 */
import { readFileSync } from 'node:fs';

const [file, ...needles] = process.argv.slice(2);
const raw = readFileSync(file, 'utf8');

// Would a JS parser see this string? Decode the escapes the way one would.
const decoded = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

const escapes = raw.match(/\\u[0-9a-fA-F]{4}/g);
console.log(`${file}: ${raw.length} chars, ${escapes ? escapes.length : 0} \\uXXXX escapes`);

let missing = 0;
for (const needle of needles) {
  const inRaw = raw.includes(needle);
  const inDecoded = decoded.includes(needle);
  const ok = inRaw || inDecoded;
  if (!ok) missing += 1;
  console.log(`  ${ok ? 'ok  ' : 'MISS'} ${needle}${inDecoded && !inRaw ? ' (as \\u escapes)' : ''}`);
}
process.exit(missing > 0 ? 1 : 0);
