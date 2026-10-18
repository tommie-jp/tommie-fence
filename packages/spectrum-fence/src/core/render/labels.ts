import { pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';

/**
 * 図に出る固定の字 (`lang:` で切り替える)。利用者が書いた字 (title・`data:` の凡例の名前) は含めない。
 * 日本語の表は今までの字のまま (`ja` の出力は変えない)。
 */
type Labels = {
  readonly readings: string;
  /** `data:` の凡例の名前の既定 (測った CSV)。 */
  readonly measured: string;
  readonly measuredFallback: string;
  readonly holdCalc: string;
  readonly ideal: string;
  readonly current: string;
  readonly frequency: string;
  readonly level: string;
  readonly resolution: string;
  readonly sweeps: string;
  /** 範囲の間の字 (`0 Hz〜1 kHz`)。 */
  readonly through: string;
};

const TABLE: Readonly<Record<Lang, Labels>> = {
  ja: {
    readings: '読み値', measured: '実測', measuredFallback: '実測 (data)', holdCalc: '計算', ideal: '理想 (計算)', current: '今の掃引 (計算)',
    frequency: '周波数', level: 'レベル', resolution: '分解能', sweeps: '掃引', through: '〜',
  },
  en: {
    readings: 'Readings', measured: 'Measured', measuredFallback: 'Measured (data)', holdCalc: 'calc.', ideal: 'Ideal (calculated)', current: 'Current sweep (calculated)',
    frequency: 'Frequency', level: 'Level', resolution: 'Resolution', sweeps: 'sweeps', through: ' to ',
  },
};

export const labelsOf = (lang: Lang): Labels => pickLang(lang, TABLE);

/** `MAX HOLD (計算 3 掃引)` / `MAX HOLD (calc. 3 sweeps)`。 */
export const holdLabelOf = (lang: Lang, sweeps: number): string => {
  const t = labelsOf(lang);
  return `MAX HOLD (${t.holdCalc} ${sweeps} ${t.sweeps})`;
};
