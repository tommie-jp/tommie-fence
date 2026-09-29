import { lookupPinout } from 'fence-kit';
import type { Pinout } from 'fence-kit';

/**
 * 回路図の IC (`ic`) の**働きの並び** (52 の docs/100)。足を実物の順ではなく
 * 働きで箱の 4 辺に振る — 正の電源は上、GND は下、入力・制御は左、出力は右、
 * 結ぶことの多い足は隣どうし (KiCad の部品記号の規約 KLC S4.2 と同じ置き方)。
 *
 * 足の名前と番号は fence-kit の足の名前の表 (板の 2 つと同じ表) から引き、
 * ここは**どの名前をどの辺に置くか**だけを持つ。板の上の IC は実物の並びしか
 * ないので、この表は回路図だけのもの。
 *
 * 辺の中の並びは、左右の辺は上から下、上下の辺は左から右。
 */
export type IcSide = 'left' | 'right' | 'top' | 'bottom';

export type IcLayout = Readonly<Record<IcSide, readonly string[]>>;

export type IcPinout = Pinout & { readonly layout: IcLayout };

/**
 * 555。**RESET は VCC の隣** (普段は VCC に結ぶ)、**THRES と TRIG は隣**
 * (無安定・単安定とも結ぶか同じ C に付く)、DISCH はその上 (R1–R2–C の梯子が
 * 左に縦に並ぶ)。GND を真ん中 (VCC の真下) に置き、CONT はその隣 (パスコンで
 * GND へ落とす)。
 */
const timer555 = (power: string): IcLayout => ({
  top: [power, 'RESET'],
  left: ['DISCH', 'THRES', 'TRIG'],
  right: ['OUT'],
  bottom: ['GND', 'CONT'],
});

/**
 * CD4511 (BCD → 7 セグ)。**入力 A〜D は左に下の桁から**、**出力 a〜g は右に
 * セグメントの順** — 7 セグの箱を同じ順に並べれば線が交差しない。LT・BL は
 * 普段 VDD に結ぶので VDD の隣 (上)、LE は普段 GND に結ぶので VSS の隣 (下)。
 */
const CD4511_LAYOUT: IcLayout = {
  top: ['VDD', 'LT', 'BL'],
  left: ['INA', 'INB', 'INC', 'IND'],
  right: ['Oa', 'Ob', 'Oc', 'Od', 'Oe', 'Of', 'Og'],
  bottom: ['VSS', 'LE/STROBE'],
};

/**
 * 74HC163 (同期カウンタ)。**A〜D (プリセット) と ENP・ENT・CLK は左**、Q は下の桁から右に、
 * 桁上げ RCO は Q の下。CLR と LOAD は普段 VCC に結ぶので VCC の隣 (上)。
 */
const HC163_LAYOUT: IcLayout = {
  top: ['VCC', 'CLR', 'LOAD'],
  left: ['A', 'B', 'C', 'D', 'ENP', 'ENT', 'CLK'],
  right: ['QA', 'QB', 'QC', 'QD', 'RCO'],
  bottom: ['GND'],
};

/** 74HC154 (4 → 16 デコーダ)。アドレスは左に下の桁から、Y は右に 0 から。E1・E2 は普段 GND に結ぶので GND の隣 (下)。 */
const HC154_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'A1', 'A2', 'A3'],
  right: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15'],
  bottom: ['GND', 'E1', 'E2'],
};

/** 62256 (SRAM 32K×8)。アドレスは左に A0 から、データは右に DQ0 から、制御 CE・OE・WE は下 (VSS の隣)。 */
const SRAM62256_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14'],
  right: ['DQ0', 'DQ1', 'DQ2', 'DQ3', 'DQ4', 'DQ5', 'DQ6', 'DQ7'],
  bottom: ['VSS', 'CE', 'OE', 'WE'],
};

/** 型番は fence-kit の表の**代表の綴り** (別の綴りも同じ行に当たる)。 */
const LAYOUTS: readonly { readonly pins: number; readonly model: string; readonly layout: IcLayout }[] = [
  { pins: 8, model: 'NE555', layout: timer555('VCC') },
  { pins: 8, model: 'TLC555', layout: timer555('VDD') },
  { pins: 16, model: 'CD4511B', layout: CD4511_LAYOUT },
  { pins: 16, model: '74HC163', layout: HC163_LAYOUT },
  { pins: 24, model: '74HC154', layout: HC154_LAYOUT },
  { pins: 28, model: '62256', layout: SRAM62256_LAYOUT },
];

/** 型番から足の名前と働きの並びを引く。並びを持たない型番は null。 */
export function lookupIcPinout(model: string | null): IcPinout | null {
  for (const row of LAYOUTS) {
    const pinout = lookupPinout(model, row.pins);
    if (pinout !== null && pinout.model === row.model) return { ...pinout, layout: row.layout };
  }
  return null;
}

/** 働きの並びを持つ型番 (代表の綴り)。お知らせと早見表に出す。 */
export const icLayoutModels = (): readonly string[] => LAYOUTS.map((row) => row.model);
