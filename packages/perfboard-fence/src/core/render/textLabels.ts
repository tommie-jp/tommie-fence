import { PARTS_HEADINGS_BY_LANG, pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';

/**
 * 図の中に出る固定の字 (部品表の基板の行・色の凡例の見出し・半田面の見出し)。部品表の見出しは
 * fence-kit の `PARTS_HEADINGS_BY_LANG`。利用者が書いた字 (題・注釈・ラベル) はここを通さない。
 * `ja` は今までの綴りのまま置く (出力を変えないため)。
 */
export type TextLabels = {
  readonly headings: readonly [string, string, string, string];
  /** 部品表の基板の行の ID の欄。 */
  readonly board: string;
  /** 穴数 (`18×24 穴`)。 */
  readonly holes: (cols: number, rows: number) => string;
  /** 白黒の図の色の凡例の見出し。 */
  readonly legend: string;
  /** 半田面の見出し。 */
  readonly backCaption: string;
};

const LABELS: Readonly<Record<Lang, TextLabels>> = {
  ja: {
    headings: PARTS_HEADINGS_BY_LANG.ja,
    board: '基板',
    holes: (cols, rows) => `${cols}×${rows} 穴`,
    legend: '色',
    backCaption: '半田面 (裏返した基板)',
  },
  en: {
    headings: PARTS_HEADINGS_BY_LANG.en,
    board: 'Board',
    holes: (cols, rows) => `${cols}×${rows} holes`,
    legend: 'Color',
    backCaption: 'Solder side (board flipped)',
  },
};

export const textLabels = (lang: Lang): TextLabels => pickLang(lang, LABELS);
