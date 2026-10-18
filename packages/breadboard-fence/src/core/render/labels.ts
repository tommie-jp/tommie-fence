import { PARTS_HEADINGS_BY_LANG, pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';

/**
 * 図の中に出る固定の字 (部品表の基板の行・「ほかに N 件」)。見出しは fence-kit の
 * `PARTS_HEADINGS_BY_LANG`。利用者が書いた字 (題・注釈・ラベル) はここを通さない。
 * 日本語の字は `ja` の出力を変えないため、今までの綴りのまま置く。
 */
export type PartsLabels = {
  readonly headings: readonly [string, string, string, string];
  /** 基板の行の ID の欄。 */
  readonly board: string;
  /** 基板の行の値の欄: サイズと穴数 (`half (400 穴)`)。 */
  readonly boardSize: (size: string, holes: number) => string;
  readonly railsOn: string;
  readonly railsOff: string;
  /** 上限を超えて並べなかったぶんの 1 行。 */
  readonly more: (count: number) => string;
};

const LABELS: Readonly<Record<Lang, PartsLabels>> = {
  ja: {
    headings: PARTS_HEADINGS_BY_LANG.ja,
    board: '基板',
    boardSize: (size, holes) => `${size} (${holes} 穴)`,
    railsOn: ' レール有り',
    railsOff: ' レール無し',
    more: (count) => `ほかに ${count} 件`,
  },
  en: {
    headings: PARTS_HEADINGS_BY_LANG.en,
    board: 'Board',
    boardSize: (size, holes) => `${size} (${holes} holes)`,
    railsOn: ' with rails',
    railsOff: ' no rails',
    more: (count) => `${count} more`,
  },
};

export const partsLabels = (lang: Lang): PartsLabels => pickLang(lang, LABELS);
