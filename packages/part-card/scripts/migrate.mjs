// TS の部品の表の行を、同梱の部品カード (packages/fence-kit/parts/**/*.part.yaml) に書き出す (52 の docs/160)。
// **1 回きりの道具**。移し終えたら消す。手で写すと、ピンの名前の 1 字違いが紛れるため。
//
//   node packages/part-card/scripts/migrate.mjs discretes   3 ピンの表
//   node packages/part-card/scripts/migrate.mjs modules     モジュールの表 (Debug Probe は残す)
//   node packages/part-card/scripts/migrate.mjs chips       ピンの名前の表
//   node packages/part-card/scripts/migrate.mjs boards      Tang Nano 9K
//
// 書き出したカードは TS の行と同じ中身になる (part-card の tableSnapshot.test.ts が見る)。行の上のコメントはカードの頭へ写す。
// ピンの名前の表は行ごとの出典を持たないので、pinouts.ts の頭のコメントの表から引き、無ければ行のコメントを使う。
// 文書の表の注 (手で直した字) と置き方 (dip / sip) は bread の早見表から引く。どれも無い行があれば何も書かずに止まる。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const bundled = new URL('../dist/migrate-tables.mjs', import.meta.url);
await build({
  stdin: {
    contents: "export { pinoutTable, discreteTable, moduleTable, lookupBoardPart, lookupRole, readCard } from 'fence-kit';",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
  },
  outfile: fileURLToPath(bundled), bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
});
const fk = await import(bundled.href);

const kind = process.argv[2];
const KINDS = { discretes: 'discretes.ts', modules: 'modules.ts', chips: 'pinouts.ts', boards: 'boards.ts' };
if (!(kind in KINDS)) {
  console.error('使い方: node migrate.mjs discretes|modules|chips|boards');
  process.exit(2);
}
const source = read(`packages/fence-kit/src/parts/${KINDS[kind]}`);
const lines = source.split('\n');

/** 行の上のコメント (`{` の次から `models:` の手前までの `//` の行)。 */
function commentOf(model) {
  const at = lines.findIndex((line) => line.includes(`models: ['${model}'`));
  if (at < 0) return [];
  const out = [];
  for (let index = at - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line.startsWith('//')) out.unshift(line.replace(/^\/\/ ?/, ''));
    else break;
  }
  return out;
}

/** 文書の表の行を、セルに割る (コードの中の `|` は無い前提)。 */
const cellsOf = (line) => line.split(' | ').map((cell) => cell.replace(/^\| /, '').replace(/ \|$/, ''));

/** bread の早見表のピンの名前の表: 型番 → { package, note }。まとめて書いた行は、行の中の型番ごとに引く。 */
function docPinRows() {
  const doc = read('packages/breadboard-fence/docs/02-cheatsheet.md').split('\n');
  const head = doc.findIndex((line) => line.startsWith('| 型番 (別名) | 種類 | ピンの名前'));
  const out = new Map();
  for (let index = head + 2; doc[index]?.startsWith('|'); index += 1) {
    const [first, type, names] = cellsOf(doc[index]);
    const pkg = /`([a-z]+\d+[^`]*)`/.exec(type)?.[1] ?? null;
    // ピンの名前のあとの括弧が注。名前は `X` の並びと 〜。
    const rest = names.replace(/^(`[^`]*`\s*|〜\s*)+/, '').trim();
    const note = rest.startsWith('(') && rest.endsWith(')') ? rest.slice(1, -1) : (rest === '' ? null : rest);
    const models = [...first.replace(/\(.*?\)/g, '').matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    for (const model of models) out.set(model.toUpperCase(), { pkg, note, grouped: models.length > 1 });
  }
  return out;
}

/** pinouts.ts の頭のコメントの出典の表: 型番 → 出典。`74HC14・00・10` のような略は、表の型番に当たる綴りへ開く。 */
function headSources(known) {
  const out = new Map();
  const end = lines.findIndex((line) => line.startsWith(' */'));
  for (const line of lines.slice(0, end)) {
    const match = /^ \* \| (.+?) \| (.+) \|$/.exec(line);
    if (match === null || match[1] === '行' || match[1].startsWith('---')) continue;
    const tokens = match[1].split(/ \/ |・/).map((token) => token.trim()).filter(Boolean);
    const [first] = tokens;
    for (const token of tokens) {
      let model = known.has(token.toUpperCase()) ? token : null;
      for (let cut = first.length; model === null && cut > 0; cut -= 1) {
        const tried = first.slice(0, cut) + token;
        if (known.has(tried.toUpperCase())) model = tried;
      }
      if (model !== null) out.set(known.get(model.toUpperCase()), match[2]);
    }
  }
  return out;
}

const flow = (doc) => YAML.visit(doc, { Seq(_key, node) { node.flow = true; } });

function cardText(comment, fields) {
  const doc = new YAML.Document(fields);
  flow(doc);
  const body = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  const head = ['同梱の部品カード (52 の docs/160 で TS の表から移した)。', ...comment].map((line) => `# ${line}`.trimEnd());
  return `${head.join('\n')}\n${body}`;
}

/** 書き出す前に fence-kit の検査に通す。1 枚でも誤りがあれば何も書かずに止まる。 */
const cards = [];
const problems = [];
const add = (dir, model, comment, fields) => {
  const { card, issues } = fk.readCard(JSON.parse(JSON.stringify(fields)));
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (card === null || errors.length > 0) problems.push(`${model}: ${errors.map((issue) => issue.message).join(' / ')}`);
  cards.push([`${dir}/${model}.part.yaml`, cardText(comment, fields)]);
};
const only = (key, value) => (value === undefined || value === null ? {} : { [key]: value });

if (kind === 'discretes') {
  for (const row of fk.discreteTable()) {
    const model = row.models[0];
    add('discretes', model, commentOf(model), {
      models: row.models, package: row.type, kind: row.kind, case: row.pkg, role: row.role,
      pins: row.names, ...only('note', row.note), source: row.source,
    });
  }
}

if (kind === 'modules') {
  for (const row of fk.moduleTable()) {
    const model = row.models[0];
    // 姿・刷る字・線の色・正式名称を持つ行 (Debug Probe) は、カードに書けないので TS に残す。
    if (row.look !== undefined || row.silk !== undefined || row.wireColors !== undefined || row.name !== undefined) continue;
    add('modules', model, commentOf(model), {
      models: row.models, package: 'device', role: row.role, 'role-en': row.roleEn, pins: row.names,
      view: row.view, product: row.product, ...only('note', row.note), source: row.source,
    });
  }
}

if (kind === 'chips') {
  const rows = fk.pinoutTable().filter((row) => row.card === undefined);
  const known = new Map(rows.flatMap((row) => row.models.map((model) => [model.toUpperCase(), row.models[0]])));
  const sources = headSources(known);
  const docRows = docPinRows();
  for (const row of rows) {
    const model = row.models[0];
    const comment = commentOf(model);
    const source = sources.get(model) ?? (comment.length > 0 ? comment.join(' ') : null);
    const doc = docRows.get(model.toUpperCase());
    if (source === null) problems.push(`${model}: 出典がありません (頭のコメントの表にも行のコメントにも無い)`);
    if (doc === undefined || doc.pkg === null) problems.push(`${model}: bread の早見表に行がありません`);
    const pkg = doc?.pkg ?? `dip${row.names.length}`;
    const roleEn = fk.lookupRole(model, 'en');
    add('chips', model, comment, {
      models: row.models, package: pkg, role: row.role, ...(roleEn !== row.role ? { 'role-en': roleEn } : {}),
      pins: row.names,
      ...only('look', row.look), ...only('outline', row.module), ...only('smd', row.chip),
      // 文書の注は手で直した字 (bread の早見表)。まとめて書いた行と注の無い行は表の注。
      ...only('note', doc !== undefined && !doc.grouped && doc.note !== null ? doc.note : row.note),
      source: source ?? '',
    });
  }
}

if (kind === 'boards') {
  const board = fk.lookupBoardPart('tang-nano-9k');
  add('boards', 'tang-nano-9k', commentOf('tang-nano-9k'), {
    models: ['tang-nano-9k'], package: 'board', name: board.name, chip: board.chip, 'row-span': board.rowSpan,
    reach: board.reach, usb: board.usb, ...only('mark', board.mark), hdmi: board.hdmi, wireless: board.wireless,
    role: 'FPGA ボード (Gowin GW1NR-9)', pins: board.pins,
    source: 'Sipeed の wiki のピン配置図と寸法図 (列の間 22.8169 mm = 9 ピッチ、基板 26.0 × 70.0 mm)。名前は FPGA のピン番号に IO を付けた物',
  });
}

if (problems.length > 0) {
  console.error(`書き出しません (${problems.length} 件):\n${problems.join('\n')}`);
  process.exit(1);
}
for (const [path, text] of cards) {
  const url = new URL(`packages/fence-kit/parts/${path}`, root);
  mkdirSync(new URL('.', url), { recursive: true });
  writeFileSync(url, text);
}
console.log(`${kind}: ${cards.length} 枚を書き出しました → packages/fence-kit/parts/${kind}/`);
