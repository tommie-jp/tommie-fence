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

/** 型番は fence-kit の表の**代表の綴り** (別の綴りも同じ行に当たる)。 */
const LAYOUTS: readonly { readonly pins: number; readonly model: string; readonly layout: IcLayout }[] = [
  { pins: 8, model: 'NE555', layout: timer555('VCC') },
  { pins: 8, model: 'TLC555', layout: timer555('VDD') },
  { pins: 16, model: 'CD4511B', layout: CD4511_LAYOUT },
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
