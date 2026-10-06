// 3 本足のディスクリートの表 (src/parts/discretes.ts) から、早見表と文法リファレンスの表の行を書き出す。
// 使い方: node scripts/discrete-rows.mjs   (表の見出しつきで標準出力へ)
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/parts/discretes.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const source = outputFiles[0].text;
const { discreteTable } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const MAX_ALIASES = 3;
console.log('| 型番 | 種類 | 穴の順 (印字面を手前、ピンを下にして左から) | パッケージ |');
console.log('| --- | --- | --- | --- |');
for (const row of discreteTable()) {
  const [head, ...rest] = row.models;
  const aliases = rest.length === 0 ? '' : ` (${rest.slice(0, MAX_ALIASES).map((model) => `\`${model}\``).join(' ')}${rest.length > MAX_ALIASES ? ' …' : ''})`;
  const names = row.names.map((name) => `\`${name}\``).join(' ');
  const note = row.note === undefined ? '' : `。${row.note}`;
  console.log(`| \`${head}\`${aliases} | \`${row.type}\` | ${names} | ${row.pkg}${note} |`);
}
