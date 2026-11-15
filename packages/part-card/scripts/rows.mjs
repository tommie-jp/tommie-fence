// 部品の表を、3 つのフェンスの文書の表に書き出す (52 の docs/158 の 4-3、docs/160 の 1-3)。
//
//   npm run rows            書き出す (印 <!-- part-rows:… begin … --> と <!-- part-rows:… end --> の間など)
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
const { BUNDLED_CARDS, CARD_ROW_DOCS, ROW_BLOCKS, replaceCardRows, replaceRowBlock } = await import(bundled.href);

/** 文書ごとに、掛ける書き換え (印の名前と、書き換える関数) を並べる。 */
const jobs = new Map();
const add = (doc, label, run) => jobs.set(doc, [...(jobs.get(doc) ?? []), [label, run]]);
for (const doc of CARD_ROW_DOCS) add(doc, 'part-cards', (text) => replaceCardRows(text, BUNDLED_CARDS));
for (const block of ROW_BLOCKS) for (const doc of block.docs) add(doc, `part-rows:${block.name}`, (text) => replaceRowBlock(text, block));

const check = process.argv.includes('--check');
let stale = 0;
for (const [doc, runs] of jobs) {
  const path = new URL(`../../../${doc}`, import.meta.url);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [label, run] of runs) {
    const next = run(after);
    if (next === null) {
      console.error(`${doc}: 印 (${label}) がありません`);
      process.exit(1);
    }
    after = next;
  }
  if (after === before) continue;
  stale += 1;
  if (check) console.error(`${doc}: 部品の表が古い (npm run rows で書き出します)`);
  else {
    writeFileSync(path, after);
    console.log(`${doc}: 書き出しました`);
  }
}
if (check && stale > 0) process.exit(1);
console.log(`同梱の部品カード ${BUNDLED_CARDS.length} 枚 / 文書 ${jobs.size} つ`);
