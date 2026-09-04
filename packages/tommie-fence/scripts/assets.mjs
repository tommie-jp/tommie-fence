import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

/**
 * 資材を 3 つのコアから写す。**表は `src/assets.ts`** にあり、そちらを
 * テストも読む (2 か所に分けると片方が古くなる)。
 *
 * `.ts` をそのまま import できないので、表の行を字から拾う。
 */
const table = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8');
const rows = [...table.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
if (rows.length === 0) throw new Error('src/assets.ts から写す表を読めませんでした');

for (const dir of ['media', 'syntaxes']) mkdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true });
for (const [from, to] of rows) {
  copyFileSync(new URL(`../${from}`, import.meta.url), new URL(`../${to}`, import.meta.url));
}
