import { pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';
import type { Ground } from '../types.ts';

/** 図の中に出るフェンス自身の固定の字 (利用者が書いた字は含まない)。言語ごとの表を 1 か所に置く。 */
type Labels = {
  /** 部品表の見出し (部品 / 種類 / 値)。 */
  readonly headings: readonly [string, string, string];
  /** 部品表の基板の行の頭。 */
  readonly boardName: string;
  readonly singleSided: string;
  readonly doubleSided: string;
  /** 地の在りかの読み (図の下の 1 行)。 */
  readonly ground: Readonly<Record<Ground, string>>;
  /** 裏から見た図の題。 */
  readonly backView: string;
  readonly backSolid: string;
  readonly backBare: string;
};

const LABELS: Readonly<Record<Lang, Labels>> = {
  ja: {
    headings: ['部品', '種類', '値'],
    boardName: '基板',
    singleSided: '片面',
    doubleSided: '両面',
    ground: { back: '裏: ベタ GND', front: '表: GND (溝で切る)', both: '表・裏: GND', none: '地なし' },
    backView: '裏から見た図 (左右反転)',
    backSolid: '裏は銅のベタ (GND)',
    backBare: '裏に銅は無い',
  },
  en: {
    headings: ['Part', 'Type', 'Value'],
    boardName: 'Board',
    singleSided: 'single-sided',
    doubleSided: 'double-sided',
    ground: { back: 'Back: solid GND', front: 'Front: GND (cut by grooves)', both: 'Front & back: GND', none: 'No ground' },
    backView: 'Back view (mirrored)',
    backSolid: 'back is solid copper (GND)',
    backBare: 'no copper on the back',
  },
};

export const labelsOf = (lang: Lang): Labels => pickLang(lang, LABELS);
