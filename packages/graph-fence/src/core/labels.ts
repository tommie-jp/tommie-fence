import { pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';

/**
 * 図の中に出る固定の字 (読み値の見出し・軸の注記など)。言語ごとにここ 1 か所に置く。
 * 書き手が書いた字 (title・軸の名前・線の名前・注釈) は含めない。
 */
export type Labels = {
  /** `data:` に凡例の名前が無いときの名前。 */
  readonly measured: string;
  readonly readings: string;
  readonly ideal: string;
  /** `ideal` と測った値が両方あるときの「と」。 */
  readonly and: string;
  readonly value: string;
  readonly log: string;
};

const TABLE: Readonly<Record<Lang, Labels>> = {
  ja: { measured: '実測', readings: '読み値', ideal: '理想 (計算)', and: 'と', value: '値', log: '対数' },
  en: { measured: 'Measured', readings: 'Readings', ideal: 'Ideal (calculated)', and: 'and', value: 'Value', log: 'log' },
};

export const labelsOf = (lang: Lang): Labels => pickLang(lang, TABLE);
