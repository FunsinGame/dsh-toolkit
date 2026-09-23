/**
 * Encoding guard.
 *
 * Editing this repo with PowerShell has repeatedly corrupted non-ASCII text: the
 * shell emits UTF-16 when it writes files, and passing regex escapes through
 * `node -e` from PowerShell mangles them. This script is a plain file (no shell
 * quoting involved) and answers one question: does any source file contain
 * mojibake, i.e. UTF-8 bytes that were decoded as Latin-1/CP1252 and re-encoded?
 *
 * The reliable signal is not "contains CJK" — these files legitimately contain
 * Chinese. It is a *run* of CJK in a place that should hold accented Latin or a
 * comment separator, plus the classic CP1252 pairs (鈥, 锛, 鍜, 娑, 鏂, 涓).
 *
 * Run: node tools/check-encoding.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', 'out', 'media', '.git', 'models', 'backups', 'data', 'peaks']);

/** Classic CP1252 misreadings of UTF-8 lead bytes. */
const MOJIBAKE_LEADS = [
  0x9225, // 鈥  from E2 80 xx (em dash, en dash, curly quotes)
  0x951B, // 锛  from EF BC xx (fullwidth punctuation)
  0x6402, // 搂  from C2 A7 (section sign)
  0x6D93, // 涓  from E6 xx
  0x93C2, // 鏂  from E6 96
  0x5D85, // 嶅
  0x6434, // 搴
  0x935A, // 鍚
  0x6FB6, // 澶
  0x9429, // 鐩
  0x9550, // 镐
  0x7D26, // 紦
  0x6FB9, // 澹
];

/**
 * Codepoints deliberately excluded even though they head a mojibake pair.
 * U+677F (板) is a real character in common words here (面板 "panel", 地板
 * "floor"), so flagging it reports far more noise than signal.
 */
const ALLOWED = new Set([0x677f]);

const files = [];
const SELF = fileURLToPath(import.meta.url);
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    // this file necessarily contains the patterns it searches for
    if (full === SELF) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs|js|json|md)$/.test(entry.name)) files.push(full);
  }
};
walk(ROOT);

let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // U+FFFD is always wrong: it means a lossy decode already happened.
    if (line.includes('\uFFFD')) {
      problems++;
      console.log(`${relative(ROOT, file)}:${i + 1}  U+FFFD  ${line.trim().slice(0, 90)}`);
      return;
    }
    for (const cp of MOJIBAKE_LEADS) {
      if (ALLOWED.has(cp)) continue;
      if (line.includes(String.fromCodePoint(cp))) {
        problems++;
        console.log(
          `${relative(ROOT, file)}:${i + 1}  U+${cp.toString(16).toUpperCase().padStart(4, '0')}  ${line.trim().slice(0, 90)}`,
        );
        return;
      }
    }
  });
}

console.log(problems === 0 ? `\nOK: ${files.length} files scanned, no mojibake.` : `\n${problems} suspicious line(s).`);
process.exit(problems === 0 ? 0 : 1);
