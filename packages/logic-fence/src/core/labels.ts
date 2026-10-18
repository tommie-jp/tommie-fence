import { pickLang } from 'fence-kit';
import type { Lang } from 'fence-kit';

/**
 * 図の中に出る固定の字 (読み値の見出し・状態の行の語)。言語ごとにここ 1 か所に置く。
 * 書き手が書いた字 (title・レーンの名前) は含めない。
 */
export type Labels = {
  readonly readings: string;
  /** カーソルの表の 1 列目の見出し。 */
  readonly signal: string;
  /** 3 本以上のカーソルの差の行の名前。 */
  readonly deltaFromFirst: string;
  /** 状態の行の「窓」の語。 */
  readonly window: string;
};

const TABLE: Readonly<Record<Lang, Labels>> = {
  ja: { readings: '読み値 — カーソル', signal: '信号', deltaFromFirst: 'ΔX (X1 から)', window: '窓' },
  en: { readings: 'Readings — Cursors', signal: 'Signal', deltaFromFirst: 'ΔX (from X1)', window: 'window' },
};

export const labelsOf = (lang: Lang): Labels => pickLang(lang, TABLE);
