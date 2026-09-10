/**
 * 短縮リンクの対応表を組む。**s.tommie.jp の台帳 (`links.tsv`) に流し込む
 * ための TSV** を出すだけで、ここでは何も配らない (52 の docs/42 / 44)。
 *
 *   npm run build --workspace=playground        # dist/examples.json を作る
 *   node packages/playground/scripts/shortLinks.mjs > /tmp/fences.tsv
 *   cd ~/53-s.tommie.jp && ./doShort.sh --merge /tmp/fences.tsv
 *
 * **指すのは文書の置き場** (`?doc=…`)。かつては図の中身を base64 で載せた
 * リンクを指していたが、**URL は中身ではなく置き場を指す**と決めた
 * (52 の docs/43 / 44)。置き場を指すと、
 *
 * - 短い (75 字ほど)。base64 が消えるので短縮の効きは薄いが、名前で渡せる
 * - **行き先の `.md` を直せば、短縮リンクの先も新しくなる**
 *
 * **道は例のファイル名から作る。** 図の中身から作ると (ハッシュなど)、
 * 貼られたときに意味が伝わらない。文書 1 つに道 1 本。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://tommie-jp.github.io/tommie-fence/';

/** 種類のディレクトリ名。**綴りは短いほう** (52 の docs/08 に揃える)。 */
const DIRECTORY = { circuit: 'circuit', breadboard: 'bread', perfboard: 'perf' };

/** `01-led.md` → `01-led`。 */
const stemOf = (name) => name.replace(/\.[^.]+$/, '');

const examples = JSON.parse(
  readFileSync(join(import.meta.dirname, '../dist/examples.json'), 'utf8'),
);

// **わざと壊した例は配らない。** エラーの帯を確かめるためのもので、
// 短縮リンクを渡す相手には意味がない (頁の側も `?dev` でしか出さない)。
for (const one of examples.filter((example) => !example.broken)) {
  const where = `fence/${DIRECTORY[one.kind]}/${stemOf(one.name)}`;
  const to = `${SITE}?doc=${one.path}`;
  process.stdout.write(`${where}\t${to}\t${one.title}\n`);
}
