// 同梱の部品カード (packages/fence-kit/parts/*.part.yaml) を fence-kit の表に焼く (52 の docs/158 の 4-1)。
//
//   npm run cards            焼く (src/parts/cards/bundled.gen.ts を書く)
//   npm run cards -- --check 焼いた物が古くないかだけを見る (古ければ 1)
//
// **焼くのは、ブラウザ (プレビューの web 版・playground・フェンスを束ねて使うほかのアプリ) では実行時にファイルを読めないから。**
// 焼いた物はコミットする。カードと食い違っていないことは part-card の試験も見張る。
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../../fence-kit/', import.meta.url);
const partsDir = new URL('parts/', root);
const target = new URL('src/parts/cards/bundled.gen.ts', root);

// .ts をそのまま読めないので束ねる。yaml は束ねない (CJS の実装が ESM の束に混ざると読めない)。
// 束は part-card の dist/ に置き、yaml は node に node_modules から解かせる。
const bundled = new URL('../dist/bake-text.mjs', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('../src/text.ts', import.meta.url))],
  outfile: fileURLToPath(bundled),
  bundle: true, format: 'esm', platform: 'node', logLevel: 'error', external: ['yaml'],
});
const { readCardText } = await import(bundled.href);

/** 置き場の下まで降りて、カードを集める。並びはディレクトリ・名前の順 (chips/ discretes/ modules/ boards/ …)。 */
const walk = (dir, prefix = '') => readdirSync(dir).sort().flatMap((name) => {
  const url = new URL(name, dir);
  if (statSync(url).isDirectory()) return walk(new URL(`${name}/`, dir), `${prefix}${name}/`);
  return name.endsWith('.part.yaml') ? [`${prefix}${name}`] : [];
});
const names = walk(partsDir);
const cards = [];
let failed = 0;
for (const name of names) {
  const { card, issues } = readCardText(readFileSync(new URL(name, partsDir), 'utf8'));
  for (const issue of issues) {
    console.error(`packages/fence-kit/parts/${name}:${issue.line}: ${issue.severity === 'error' ? '誤り' : 'お知らせ'}: ${issue.message}`);
  }
  if (card === null) failed += 1;
  else cards.push(card);
}
if (failed > 0) {
  console.error(`読めないカードが ${failed} 枚あります。焼きません`);
  process.exit(1);
}

const text = [
  '// 自動で書き出したファイル。手で直さない。',
  '// 元は packages/fence-kit/parts/**/*.part.yaml、書き出すのは `npm run cards` (52 の docs/158)。',
  "import type { PartCard } from './types.ts';",
  '',
  // 1 枚 1 行 (150 枚を字下げつきで書くと 5,000 行を越え、差分が読めない)。
  `export const BUNDLED_CARDS: readonly PartCard[] = [\n${cards.map((card) => `  ${JSON.stringify(card)},`).join('\n')}\n];`,
  '',
].join('\n');

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text) {
    console.error('bundled.gen.ts がカードと食い違っています。npm run cards で焼き直します');
    process.exit(1);
  }
  console.log(`同梱のカード ${cards.length} 枚: 焼いた物と同じ`);
} else {
  writeFileSync(target, text);
  console.log(`同梱のカード ${cards.length} 枚を焼きました → packages/fence-kit/src/parts/cards/bundled.gen.ts`);
}
