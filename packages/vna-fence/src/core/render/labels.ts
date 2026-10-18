import type { Lang } from 'fence-kit';

/**
 * 図の中に出る固定の字 (`lang:` で ja / en を切り替える)。
 * エラーとお知らせの文は言語によらず日本語のまま。
 */
export type Labels = {
  /** 読み値の表の周波数の列の名前。 */
  readonly frequency: string;
  readonly open: string;
  readonly short: string;
  /** 理想 (dut: の模型) の名前。 */
  readonly ideal: string;
  /** `data:` に名前を書かなかったときの実測の名前。 */
  readonly measured: string;
  /** 1 目盛あたりの量の単位 (`10 dB/目盛`)。 */
  readonly perDivision: string;
  readonly logScale: string;
  readonly center: string;
  readonly bandPass: string;
  /** TDR の山の印。 */
  readonly peakMark: string;
  readonly readings: string;
  readonly readingsIdeal: string;
  readonly readingsMeasured: string;
  readonly keyIdeal: string;
  readonly peakLine: (trace: string, where: string, distance: string, ns: string, range: string) => string;
};

export const LABELS: Readonly<Record<Lang, Labels>> = {
  ja: {
    frequency: '周波数',
    open: '開放',
    short: '短絡',
    ideal: '理想',
    measured: '実測',
    perDivision: '/目盛',
    logScale: '10 倍/目盛 (対数)',
    center: '中心',
    bandPass: '帯域通過',
    peakMark: '山',
    readings: '読み値',
    readingsIdeal: '理想 (dut: の模型)',
    readingsMeasured: '実測 (data)',
    keyIdeal: '理想 (dut:)',
    peakLine: (trace, where, distance, ns, range) => `${trace} (${where}) の一番高い山: ${distance} m (${ns} ns)。見える範囲 ${range} m`,
  },
  en: {
    frequency: 'Freq',
    open: 'Open',
    short: 'Short',
    ideal: 'Ideal',
    measured: 'Measured',
    perDivision: '/div',
    logScale: '10x/div (log)',
    center: 'center',
    bandPass: 'band-pass',
    peakMark: 'peak',
    readings: 'Readings',
    readingsIdeal: 'Ideal (dut: model)',
    readingsMeasured: 'Measured (data)',
    keyIdeal: 'Ideal (dut:)',
    peakLine: (trace, where, distance, ns, range) => `${trace} (${where}) highest peak: ${distance} m (${ns} ns). Visible range ${range} m`,
  },
};
