//
// 例をビルド時に集める。**`.md` をそのまま配る** (52 の docs/43)。
//
// fence-editor は「外にある `.md` を開いて、中のフェンスを直して、書き戻す」
// 道具で、頁はその手順のデモをする。**例もその「外にある `.md`」の 1 つ**に
// する — フェンスだけを抜き出すと、散文とフェンスが混ざった本物の文書を
// 開くところが見せられない。
//
// **出所は各パッケージの examples/ そのもの。** 中身は書き換えず、写して
// 一覧を作るだけ (直した日に 2 つが食い違わない)。
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_OF = {
  breadboard: 'breadboard-fence',
  perfboard: 'perfboard-fence',
  circuit: 'circuit-fence',
};

/** この数を下回ったら、集めるところが壊れたと見なして止める。 */
const LEAST = 5;

/** 文書の名前。**最初の見出し**を採る (無ければファイル名)。 */
const headingOf = (markdown, stem) => {
  for (const line of markdown.split('\n')) {
    // フェンスの中は見出しとして数えない。
    if (line.startsWith('```')) break;
    const found = line.match(/^#\s+(\S.*?)\s*$/);
    if (found?.[1] !== undefined) return found[1];
  }
  return stem;
};

/** その言語のフェンスが何本あるか (行頭のフェンスだけ数える)。 */
const countFences = (markdown, kind) =>
  markdown.split('\n').filter((line) => line.startsWith(`\`\`\`${kind}`)).length;

function fromDirectory(directory, kind, broken, repoPath, prefix) {
  if (!existsSync(directory)) return [];

  const found = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.md') || name.startsWith('README')) continue;

    const markdown = readFileSync(join(directory, name), 'utf8');
    const fences = countFences(markdown, kind);
    // フェンスが 1 つも無い `.md` は開いても何も描けないので配らない。
    if (fences === 0) continue;

    found.push({
      kind,
      broken,
      name,
      title: headingOf(markdown, name.replace(/\.md$/, '')),
      fences,
      /** `dist/` からの道。頁はここを取りに行く。 */
      path: `${prefix}/${name}`,
      /** リポジトリの中の置き場。出どころのリンクに使う。 */
      from: `${repoPath}/${name}`,
    });
  }
  return found;
}

/** 3 つのパッケージの examples/ から `.md` を集めて写す。 */
export async function collectExamples(packagesDir = '..', outDir = 'dist/examples') {
  const all = [];
  for (const [kind, pkg] of Object.entries(PACKAGE_OF)) {
    const base = join(packagesDir, pkg, 'examples');
    const repoPath = `packages/${pkg}/examples`;
    // まともな例が先、わざと壊した例が後。選ぶ欄はこの並びのまま出す。
    const ok = fromDirectory(base, kind, false, repoPath, `examples/${kind}`);
    const broken = fromDirectory(join(base, 'errors'), kind, true, `${repoPath}/errors`, `examples/${kind}/errors`);

    if (ok.length < LEAST) {
      throw new Error(`${kind} の例が ${ok.length} 本しか取れていません (${base})。集めるところが壊れています`);
    }

    await mkdir(join(outDir, kind), { recursive: true });
    for (const one of [...ok, ...broken]) {
      const to = join(outDir, one.path.replace(/^examples\//, ''));
      await mkdir(join(to, '..'), { recursive: true });
      await cp(join(packagesDir, pkg, 'examples', one.broken ? 'errors' : '', one.name), to);
    }
    all.push(...ok, ...broken);
  }
  return all;
}

/** 一覧を書き出す。写しは `collectExamples` が済ませてある。 */
export async function writeExamples(packagesDir = '..', outDir = 'dist') {
  const all = await collectExamples(packagesDir, join(outDir, 'examples'));
  await writeFile(join(outDir, 'examples.json'), `${JSON.stringify(all)}\n`);
  return all;
}
