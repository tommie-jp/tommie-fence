import type { Lang } from 'fence-kit';

/**
 * 図に出る固定の字 (読み値の見出し・凡例)。**言語ごとの字はここだけ**。
 * 利用者が書いた字 (title・注釈・`data:` の凡例の名前) は触らない。
 */
export type Labels = {
  /** 読み値の見出しの頭 (`読み値 — …`)。 */
  readonly readings: string;
  /** 理想 (計算) の呼び名。凡例と見出しに出る。 */
  readonly ideal: string;
  /** `data:` の名前が無いときの測った値の呼び名。 */
  readonly measuredData: string;
  /** `data:` に凡例の名前を書かなかったときの既定の名前。 */
  readonly measured: string;
  /** mixed のとき、理想の ch を言い添える語 (`CH2 は理想`)。 */
  readonly isIdeal: string;
  /** mixed の ch の区切り。 */
  readonly join: string;
};

const LABELS: Readonly<Record<Lang, Labels>> = {
  ja: { readings: '読み値', ideal: '理想 (計算)', measuredData: '実測 (data)', measured: '実測', isIdeal: ' は理想', join: '・' },
  en: { readings: 'Readings', ideal: 'Ideal (calculated)', measuredData: 'Measured (data)', measured: 'Measured', isIdeal: ' ideal', join: ', ' },
};

export const labelsOf = (lang: Lang): Labels => LABELS[lang];
