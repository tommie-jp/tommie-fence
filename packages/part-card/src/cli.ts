import { resolve } from 'node:path';
import type { CardTable } from 'fence-kit';
import type { CliCommand } from 'fence-kit/cli';
import { cardIssueLines, findCardDir, loadCardDir } from './node.ts';
import type { CardDirRead } from './node.ts';

/**
 * 3 つのフェンスの CLI が部品カードを読む口 (52 の docs/158 の 2-4)。
 *
 * - 既定は、描くファイルから上へ辿って `.tommie-fence/parts/` を探す
 * - `--cards <dir>` でその置き場だけ、`--no-cards` で読まない
 * - `--strict-cards` は、手元のカードの型番を使った図を**誤り**にする (教科書の焼きで使う。
 *   手元のカードはほかの場所に無いので、そのまま公開すると別の場所で「表に無い」になる)
 */

export const CARD_FLAGS: readonly string[] = ['--no-cards', '--strict-cards'];
export const CARD_VALUES: readonly string[] = ['--cards'];

export const CARD_USAGE = `  部品カード (52 の docs/158): 描くファイルから上へ辿って .tommie-fence/parts/*.part.yaml を読みます。
  --cards <dir> はその置き場だけを読み、--no-cards は読みません。
  --strict-cards は手元のカードの型番を使った図を誤りにします (公開する図の確かめに)。`;

export type CliCards = {
  /** そのファイルを描くときの表。置き場が無い・読まないなら undefined。 */
  readonly tableFor: (path: string) => CardTable | undefined;
  readonly strict: boolean;
};

/** 引数から読み方を決める。`--cards` と `--no-cards` を両方書いたら理由の文。 */
export function cliCards(command: CliCommand, report: (line: string) => void): CliCards | string {
  const dir = command.values?.get('--cards') ?? null;
  const off = command.flags.has('--no-cards');
  if (dir !== null && off) return '--cards と --no-cards は一緒に書けません';
  const strict = command.flags.has('--strict-cards');

  const loaded = new Map<string, CardDirRead>();
  const load = (cardDir: string): CardTable | undefined => {
    const key = resolve(cardDir);
    const known = loaded.get(key);
    if (known !== undefined) return known.table;
    const read = loadCardDir(key);
    loaded.set(key, read);
    // 置き場ごとに 1 度だけ言う (ファイルごとに繰り返さない)。
    for (const line of cardIssueLines(read)) report(line);
    return read.table;
  };

  if (off) return { tableFor: () => undefined, strict };
  if (dir !== null) return { tableFor: () => load(dir), strict };
  return {
    tableFor: (path) => {
      const found = findCardDir(path);
      return found === null ? undefined : load(found);
    },
    strict,
  };
}

/** `--strict-cards` で手元のカードの型番を使ったときの文。 */
export const strictCardsMessage = (label: string, models: readonly string[]): string =>
  `${label}: 手元の部品カードの型番を使っています (${models.join(' ')})。ほかの場所では「表に無い」になります。公開側へ昇格するか、--strict-cards を外します`;
