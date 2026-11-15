// 同梱の部品カードの型番を、3 つのフェンスの文書の表に書き出す (52 の docs/158 の 4-3)。
//
//   npm run rows            書き出す (印 <!-- part-cards:begin … --> と <!-- part-cards:end --> の間)
//   npm run rows -- --check 文書が古くないかだけを見る (古ければ 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = new URL('../dist/rows.mjs', import.meta.url);
await build({
  stdin: {
    contents: "export * from './src/docRows.ts'; export { BUNDLED_CARDS } from 'fence-kit';",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  outfile: fileURLToPath(bundled),
  bundle: true, format: 'esm', platform: 'node', logLevel: 'error', external: ['yaml'],
});
const { BUNDLED_CARDS, CARD_ROW_DOCS, replaceCardRows } = await import(bundled.href);

const check = process.argv.includes('--check');
let stale = 0;
for (const doc of CARD_ROW_DOCS) {
  const path = new URL(`../../../${doc}`, import.meta.url);
  const before = readFileSync(path, 'utf8');
  const after = replaceCardRows(before, BUNDLED_CARDS);
  if (after === null) {
    console.error(`${doc}: 印 (<!-- part-cards:begin … -->) がありません`);
    process.exit(1);
  }
  if (after === before) continue;
  stale += 1;
  if (check) console.error(`${doc}: 同梱の部品カードの表が古い (npm run rows で書き出します)`);
  else {
    writeFileSync(path, after);
    console.log(`${doc}: 書き出しました`);
  }
}
if (check && stale > 0) process.exit(1);
console.log(`同梱の部品カード ${BUNDLED_CARDS.length} 枚 / 文書 ${CARD_ROW_DOCS.length} つ`);
