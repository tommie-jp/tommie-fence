/**
 * 短縮リンクの対応表を組む。**s.tommie.jp の台帳 (`links.tsv`) に流し込む
 * ための TSV** を出すだけで、ここでは何も配らない (52 の docs/42)。
 *
 *   npm run build --workspace=playground        # dist/examples.json を作る
 *   node packages/playground/scripts/shortLinks.mjs > /tmp/fences.tsv
 *   cd ~/53-s.tommie.jp && ./doShort.sh --merge /tmp/fences.tsv
 *
 * **道は例のファイル名から作る。** 図の中身から作ると (ハッシュなど)、
 * 貼られたときに意味が伝わらない。1 つのファイルに図が何枚もあるときだけ
 * 枝番を付ける。
 *
 * **行き先は `share.ts` と同じ綴り** (`#<種類>/<base64url>`)。ここがずれると
 * 転送ページは出来ても、頁の側が「自分の URL」と結び付けられない。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://tommie-jp.github.io/tommie-fence/';

/** 種類のディレクトリ名。**綴りは短いほう** (52 の docs/08 に揃える)。 */
const DIRECTORY = { circuit: 'circuit', breadboard: 'bread', perfboard: 'perf' };

/** `.../examples/01-led.md` → `01-led`。 */
const stemOf = (from) => (from.split('/').pop() ?? from).replace(/\.[^.]+$/, '');

const toBase64Url = (text) =>
  Buffer.from(text, 'utf8').toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const examples = JSON.parse(
  readFileSync(join(import.meta.dirname, '../dist/examples.json'), 'utf8'),
);

// **わざと壊した例は配らない。** エラーの帯を確かめるためのもので、
// 短縮リンクを渡す相手には意味がない (頁の側も `?dev` でしか出さない)。
const shown = examples.filter((one) => !one.broken);

// 同じファイルから何枚出ているかを先に数える (1 枚なら枝番を付けない)。
const perFile = new Map();
for (const one of shown) {
  const key = `${one.kind}/${stemOf(one.from)}`;
  perFile.set(key, (perFile.get(key) ?? 0) + 1);
}

const nth = new Map();
for (const one of shown) {
  const stem = stemOf(one.from);
  const key = `${one.kind}/${stem}`;
  const index = (nth.get(key) ?? 0) + 1;
  nth.set(key, index);

  const leaf = perFile.get(key) === 1 ? stem : `${stem}-${index}`;
  const where = `fence/${DIRECTORY[one.kind]}/${leaf}`;
  const to = `${SITE}#${one.kind}/${toBase64Url(one.source)}`;
  process.stdout.write(`${where}\t${to}\t${one.label}\n`);
}
