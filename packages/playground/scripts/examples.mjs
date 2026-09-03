//
// 例をビルド時に集めて 1 つの JSON にする。ページは起動時にこれを 1 回読む。
//
// **出所は各パッケージの examples/ そのもの。** 例をこちらへ写すと、直した日に
// 2 つが食い違う (写しは必ず古くなる)。フェンスだけを抜き出して持ってくる。
//
// 抜き出しは行頭のフェンスに限った正規表現で足りる — 相手は自分たちの例
// (箇条書きの中に埋めたフェンスは無い)。取りこぼしたら数が減るので、
// 下限を決めて止める。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_OF = {
  breadboard: 'breadboard-fence',
  perfboard: 'perfboard-fence',
  circuit: 'circuit-fence',
};

/** この数を下回ったら、抜き出しが壊れたと見なして止める。 */
const LEAST = 5;

/**
 * 1 つの Markdown から、その種類のフェンスを順に取り出す。**直前の見出しも
 * 一緒に返す** — 題 (`title:`) を書かないフェンス (わざと壊した例など) は、
 * 見出しがいちばん読み手に伝わる名前になるため。
 *
 * フェンスの中は見出しとして数えない (` ```text ` に書いた報告の見本を
 * 見出しと取り違えるため)。
 */
function fencesIn(markdown, kind) {
  const found = [];
  let heading = null;
  let body = null;
  let mine = false;

  for (const line of markdown.split('\n')) {
    const fence = line.match(/^```(\S*)/);

    if (body !== null) {
      if (fence && fence[1] === '') {
        if (mine) found.push({ source: `${body.join('\n')}\n`, heading });
        body = null;
      } else {
        body.push(line);
      }
      continue;
    }

    if (fence) {
      body = [];
      mine = fence[1] === kind;
      continue;
    }

    const title = line.match(/^#{1,6}\s+(\S.*?)\s*$/);
    if (title?.[1] !== undefined) heading = title[1];
  }
  return found;
}

const titleOf = (body) => body.match(/^title:\s*(\S.*?)\s*$/m)?.[1] ?? null;

function fromDirectory(directory, kind, broken, repoPath) {
  if (!existsSync(directory)) return [];

  const found = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.md') || name.startsWith('README')) continue;

    const markdown = readFileSync(join(directory, name), 'utf8');
    const fences = fencesIn(markdown, kind);
    const stem = name.replace(/\.md$/, '');

    // 同じ名前が並ぶとき (1 つの見出しの下に何本もあるとき) だけ番号を添える。
    const labels = fences.map((fence) => titleOf(fence.source) ?? fence.heading ?? stem);
    const seen = new Map();
    for (const label of labels) seen.set(label, (seen.get(label) ?? 0) + 1);
    const numbered = new Map();

    for (const [index, fence] of fences.entries()) {
      const label = labels[index] ?? stem;
      let shown = label;
      if ((seen.get(label) ?? 0) > 1) {
        const nth = (numbered.get(label) ?? 0) + 1;
        numbered.set(label, nth);
        shown = `${label} (${nth})`;
      }
      found.push({ kind, broken, label: shown, source: fence.source, from: `${repoPath}/${name}` });
    }
  }
  return found;
}

/** 3 つのパッケージの examples/ から、フェンスを集める。 */
export function collectExamples(packagesDir = '..') {
  const all = [];
  for (const [kind, pkg] of Object.entries(PACKAGE_OF)) {
    const base = join(packagesDir, pkg, 'examples');
    const repoPath = `packages/${pkg}/examples`;
    // まともな例が先、わざと壊した例が後。選ぶ欄はこの並びのまま出す。
    const ok = fromDirectory(base, kind, false, repoPath);
    const broken = fromDirectory(join(base, 'errors'), kind, true, `${repoPath}/errors`);

    if (ok.length < LEAST) {
      throw new Error(`${kind} の例が ${ok.length} 本しか取れていません (${base})。抜き出しが壊れています`);
    }
    all.push(...ok, ...broken);
  }
  return all;
}
