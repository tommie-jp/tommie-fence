// 同梱の部品の表の中身を控える (52 の docs/160 の段 0)。TS の行を部品カードへ移す前に 1 度だけ回す。
//
//   node packages/part-card/scripts/snapshot.mjs
//
// 控えは src/tableSnapshot.json。試験 (tableSnapshot.test.ts) が今の表と突き合わせる。次の Release のあとで消す。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = new URL('../dist/snapshot.mjs', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('../src/tableSnapshot.ts', import.meta.url))],
  outfile: fileURLToPath(bundled),
  bundle: true, format: 'esm', platform: 'node', logLevel: 'error', external: ['yaml'],
});
const { tableSnapshot } = await import(bundled.href);
const snapshot = tableSnapshot();
writeFileSync(new URL('../src/tableSnapshot.json', import.meta.url), `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`表の行 ${Object.keys(snapshot).length} を控えました → packages/part-card/src/tableSnapshot.json`);
