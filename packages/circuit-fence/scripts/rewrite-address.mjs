// 交点の間の番地を、`_` で切っていた綴りから「英字 + 数字の組」に書き直す
// (52 の docs/24)。`a_1.5` → `a1a5`、`a.25_2` → `a2c0f0`。
//
// **正規表現だけで置き換えない。** `out_1.5` のような綴りにも当たるので、
// 書き直した綴りを新しい parseAddress に通し、**元の場所へ戻るものだけ**を採る。
// 採らなかった候補は最後に一覧で出す (目で見て直す)。
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { LAST_ROW, formatAddress, parseAddress, rowOfLetters } from '../src/core/model/address.ts';
import { LIMITS } from '../src/core/limits.ts';

/** `_` で行と列を切って小数を書いていた頃の綴り。端数が無い綴りは番地ではない。 */
const OLD = /\b([a-z]+)(?:\.([0-9]{1,2}))?_([0-9]{1,3})(?:\.([0-9]{1,2}))?\b/gi;
const READABLE = ['.md', '.ts', '.tex'];

const fractionOf = (digits) => (digits === undefined ? 0 : Number(`0.${digits}`));

/** 旧綴り → 新綴り。番地として読めないなら null。 */
function rewrite(letters, rowDigits, columnDigits, columnFraction) {
  const address = {
    row: rowOfLetters(letters.toLowerCase()) + fractionOf(rowDigits),
    col: Number(columnDigits) + fractionOf(columnFraction) - 1,
  };
  if (address.row < 0 || address.row > LAST_ROW) return null;
  if (address.col < 0 || address.col > LIMITS.columns - 1) return null;

  const spelled = formatAddress(address);
  const back = parseAddress(spelled);
  if (back === null) return null;
  // 書き直した綴りが元の場所へ戻らないなら、番地ではなかったということ。
  return Math.abs(back.row - address.row) < 1e-9 && Math.abs(back.col - address.col) < 1e-9 ? spelled : null;
}

const skipped = new Map();

function convert(path) {
  const before = readFileSync(path, 'utf8');
  const after = before.replace(OLD, (whole, letters, rowDigits, columnDigits, columnFraction) => {
    if (rowDigits === undefined && columnFraction === undefined) return whole;
    const spelled = rewrite(letters, rowDigits, columnDigits, columnFraction);
    if (spelled === null) {
      skipped.set(whole, (skipped.get(whole) ?? 0) + 1);
      return whole;
    }
    return spelled;
  });
  if (after === before) return 0;
  writeFileSync(path, after);
  return [...before.matchAll(OLD)].length - [...after.matchAll(OLD)].length;
}

function* filesUnder(path) {
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist' || name === 'coverage') continue;
    yield* filesUnder(join(path, name));
  }
}

let changed = 0;
let files = 0;
for (const target of process.argv.slice(2)) {
  for (const path of filesUnder(target)) {
    if (!READABLE.includes(extname(path))) continue;
    const count = convert(path);
    if (count > 0) {
      files += 1;
      changed += count;
      console.log(`${path}: ${count}`);
    }
  }
}
console.log(`\n書き直した: ${changed} か所 / ${files} ファイル`);
if (skipped.size > 0) {
  console.log('\n番地として読めなかった候補 (そのまま):');
  for (const [written, count] of [...skipped].sort((a, b) => b[1] - a[1])) console.log(`  ${written} × ${count}`);
}
