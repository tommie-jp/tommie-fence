// 足の名前の表 (src/parts/pinouts.ts) から、早見表と文法リファレンスの表の行を書き出す。
// 使い方: node scripts/pinout-rows.mjs [型番 ...]   (型番を省くと全部)
// 文書の表に行を手で写すと載せ漏れる (試験が落ちる) ので、行はここから貼る。
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/parts/pinouts.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const source = outputFiles[0].text;
const { pinoutTable } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const wanted = process.argv.slice(2).map((model) => model.toUpperCase());
const rows = pinoutTable().filter((row) => wanted.length === 0 || wanted.includes(row.models[0].toUpperCase()));

const MAX_ALIASES = 3;
for (const row of rows) {
  const [head, ...rest] = row.models;
  const aliases = rest.length === 0 ? '' : ` (${rest.slice(0, MAX_ALIASES).map((model) => `\`${model}\``).join(' ')}${rest.length > MAX_ALIASES ? ' …' : ''})`;
  const names = row.names.map((name) => `\`${name}\``).join(' ');
  const note = row.note === undefined ? '' : ` (${row.note})`;
  console.log(`| \`${head}\`${aliases} | \`dip${row.names.length}\` | ${names}${note} |`);
}
