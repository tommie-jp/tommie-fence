import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { EMPTY_CARD_TABLE, buildCardTable } from 'fence-kit';
import type { CardTable, CardTableNotice, PartCard } from 'fence-kit';
import { MAX_CARD_BYTES, cardTooLarge, readCardText } from './text.ts';
import type { CardTextIssue } from './text.ts';

/**
 * 手元の部品カードの置き場を読む (52 の docs/158 の 2-2)。**Node の API を使う**ので、
 * CLI と VS Code 拡張 (デスクトップ) だけが呼ぶ。
 */

/** 置き場。ワークスペースの `.tommie-fence/parts/`。 */
export const CARD_DIR = join('.tommie-fence', 'parts');
/** カードのファイル名の終わり。拡張子で JSON Schema を当てる。 */
export const CARD_SUFFIX = '.part.yaml';
/** 1 つの置き場から読む枚数の上限。 */
export const MAX_CARDS = 500;

export type CardFileRead = {
  /** 置き場から見た名前 (`74LS00.part.yaml`)。 */
  readonly name: string;
  /** 絶対パス。 */
  readonly path: string;
  readonly card: PartCard | null;
  readonly issues: readonly CardTextIssue[];
};

export type CardDirRead = {
  readonly dir: string;
  /** 描くときに渡す表。読めたカードだけ (同梱と重なる型番は外してある)。 */
  readonly table: CardTable;
  readonly files: readonly CardFileRead[];
  /** 表を組むときの知らせ (同梱の型番と重なった、など)。 */
  readonly notices: readonly CardTableNotice[];
  /** ファイルの置き場そのものの言うこと (上限を越えた、置き場の外を指すリンク、など)。 */
  readonly problems: readonly string[];
};

const isInside = (child: string, parent: string): boolean => {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep) && parse(path).root === '';
};

/**
 * `start` (ファイルかディレクトリ) から上へ辿って、`.tommie-fence/parts/` を探す。
 *
 * - `stop` を渡せば、そこより上へは行かない (VS Code はワークスペースのフォルダを渡す)
 * - 渡さなければ (CLI)、**git のリポジトリの根** (`.git` のあるディレクトリ) で止まる。根の外の
 *   共有の場所 (`/tmp/.tommie-fence/parts`) に他人が置いたカードを拾わないため。リポジトリの外なら上まで辿る
 * - 置き場そのものが辿った場所の外を指すリンクなら、使わない (ワークスペースの外のファイルを図に出さない)
 *
 * 見つからなければ null。
 */
export function findCardDir(start: string, stop: string | null = null): string | null {
  let here = resolve(start);
  if (existsSync(here) && !statSync(here).isDirectory()) here = dirname(here);
  const limit = stop === null ? null : resolve(stop);
  for (;;) {
    const candidate = join(here, CARD_DIR);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return isInside(realpathSync(candidate), realpathSync(here)) ? candidate : null;
    }
    if (limit !== null && (here === limit || !isInside(here, limit))) return null;
    if (limit === null && existsSync(join(here, '.git'))) return null;
    const up = dirname(here);
    if (up === here) return null;
    here = up;
  }
}

/** 置き場の `*.part.yaml` を全部読み、表を組む。並びはファイルの名前の順。 */
export function loadCardDir(dir: string): CardDirRead {
  const problems: string[] = [];
  const root = realpathSync(dir);
  const names = readdirSync(dir).filter((name) => name.endsWith(CARD_SUFFIX)).sort();
  if (names.length > MAX_CARDS) problems.push(`部品カードが ${names.length} 枚あります。${MAX_CARDS} 枚まで読みます`);

  const files: CardFileRead[] = [];
  for (const name of names.slice(0, MAX_CARDS)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    // 置き場の外を指すリンクは読まない (ワークスペースの外のファイルを図に出さない)。
    if (stat.isSymbolicLink() && !isInside(realpathSync(path), root)) {
      problems.push(`${name} は置き場の外を指すリンクなので読みません`);
      continue;
    }
    const info = statSync(path);
    if (!info.isFile()) continue;
    // 読む前に大きさで断る (数 GB の字を丸ごと読んで止まらない)。
    const { card, issues } = info.size > MAX_CARD_BYTES
      ? { card: null, issues: [{ line: 1, message: cardTooLarge(), severity: 'error' as const }] }
      : readCardText(readFileSync(path, 'utf8'));
    files.push({ name, path, card, issues });
  }

  const placed = files.flatMap((file) => (file.card === null ? [] : [{ card: file.card, file: file.name }]));
  const { table, notices } = placed.length === 0 ? { table: EMPTY_CARD_TABLE, notices: [] } : buildCardTable(placed);
  return { dir, table, files, notices, problems };
}

/** `path` (描くファイル) のカードを読む。置き場が無ければ null。 */
export function loadCardsFor(path: string, stop: string | null = null): CardDirRead | null {
  const dir = findCardDir(path, stop);
  return dir === null ? null : loadCardDir(dir);
}

/** CLI と Problems に出す 1 行 (`74LS00.part.yaml:3: …`)。 */
export function cardIssueLines(read: CardDirRead): readonly string[] {
  return [
    ...read.problems.map((problem) => `${read.dir}: ${problem}`),
    ...read.files.flatMap((file) => file.issues.map((issue) => `${file.path}:${issue.line}: ${issue.severity === 'error' ? '誤り' : 'お知らせ'}: ${issue.message}`)),
    ...read.notices.map((notice) => `${join(read.dir, notice.file)}: お知らせ: ${notice.message}`),
  ];
}
