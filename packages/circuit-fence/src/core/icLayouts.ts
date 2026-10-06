import { lookupPinout } from 'fence-kit';
import type { Pinout } from 'fence-kit';

/**
 * 回路図の IC (`ic`) の**働きの並び** (52 の docs/100)。ピンを実物の順ではなく
 * 働きで箱の 4 辺に振る — 正の電源は上、GND は下、入力・制御は左、出力は右、
 * 結ぶことの多いピンは隣どうし (KiCad の部品記号の規約 KLC S4.2 と同じ置き方)。
 *
 * ピンの名前と番号は fence-kit のピンの名前の表 (ブレッドボードとユニバーサル基板と同じ表) から引き、
 * ここは**どの名前をどの辺に置くか**だけを持つ。基板の上の IC は実物の並びしか
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

/**
 * 74HC595 (シフトレジスタ)。**直列入力 SER とクロック SRCLK・RCLK は左**、並列出力 QA〜QH は右に上から、
 * 直列出力 QH' はその下。SRCLR は普段 VCC、OE は普段 GND に結ぶので、それぞれ電源の隣。
 */
const HC595_LAYOUT: IcLayout = {
  top: ['VCC', 'SRCLR'],
  left: ['SER', 'SRCLK', 'RCLK'],
  right: ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', "QH'"],
  bottom: ['GND', 'OE'],
};

/** 74HC164 (直列入力・並列出力)。A・B・CLK は左、QA〜QH は右に上から。CLR は普段 VCC に結ぶので電源の隣。 */
const HC164_LAYOUT: IcLayout = {
  top: ['VCC', 'CLR'],
  left: ['A', 'B', 'CLK'],
  right: ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'],
  bottom: ['GND'],
};

/** 74HC165 (並列入力・直列出力)。並列入力 A〜H は左に上から、その上に制御。CLKINH は普段 GND に結ぶので GND の隣。 */
const HC165_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['SH/LD', 'CLK', 'SER', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  right: ['QH', '/QH'],
  bottom: ['GND', 'CLKINH'],
};

/** 74HC194 (双方向シフトレジスタ)。直列入力・並列入力・制御は左、Q0〜Q3 は右。MR は普段 VCC に結ぶので電源の隣。 */
const HC194_LAYOUT: IcLayout = {
  top: ['VCC', 'MR'],
  left: ['DSR', 'D0', 'D1', 'D2', 'D3', 'DSL', 'S0', 'S1', 'CP'],
  right: ['Q0', 'Q1', 'Q2', 'Q3'],
  bottom: ['GND'],
};

/** 74HC138 (3 → 8 デコーダ)。アドレスは左に下の桁から、Y は右に 0 から。G1 は普段 VCC、G2A・G2B は普段 GND に結ぶ。 */
const HC138_LAYOUT: IcLayout = {
  top: ['VCC', 'G1'],
  left: ['A', 'B', 'C'],
  right: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7'],
  bottom: ['GND', 'G2A', 'G2B'],
};

/** 74HC139 (2 → 4 デコーダ ×2)。アドレスは左、Y は右に 0 から。G は普段 GND に結ぶので GND の隣。 */
const HC139_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['1A', '1B', '2A', '2B'],
  right: ['1Y0', '1Y1', '1Y2', '1Y3', '2Y0', '2Y1', '2Y2', '2Y3'],
  bottom: ['GND', '1G', '2G'],
};

/** 74HC157 (2 入力データセレクタ ×4)。選択 A/B と入力は左、出力は右。G は普段 GND に結ぶので GND の隣。 */
const HC157_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A/B', '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B'],
  right: ['1Y', '2Y', '3Y', '4Y'],
  bottom: ['GND', 'G'],
};

/** 74HC153 (4 入力データセレクタ ×2)。選択 A・B とデータは左、出力は右。G は普段 GND に結ぶ。 */
const HC153_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A', 'B', '1C0', '1C1', '1C2', '1C3', '2C0', '2C1', '2C2', '2C3'],
  right: ['1Y', '2Y'],
  bottom: ['GND', '1G', '2G'],
};

/** 74HC151 (8 入力データセレクタ)。選択 A〜C とデータ D0〜D7 は左、出力 Y・W は右。G は普段 GND に結ぶ。 */
const HC151_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A', 'B', 'C', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
  right: ['Y', 'W'],
  bottom: ['GND', 'G'],
};

/** 74HC573 (D ラッチ)・74HC574 (D フリップフロップ)。D は左、Q は右に同じ順 (線が交差しない)。OE は普段 GND に結ぶ。 */
const latch8 = (clock: string): IcLayout => ({
  top: ['VCC'],
  left: ['1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', clock],
  right: ['1Q', '2Q', '3Q', '4Q', '5Q', '6Q', '7Q', '8Q'],
  bottom: ['GND', 'OE'],
});

/** 74HC273 (D フリップフロップ ×8)。D は左、Q は右に同じ順。CLR は普段 VCC に結ぶので電源の隣。 */
const HC273_LAYOUT: IcLayout = {
  top: ['VCC', 'CLR'],
  left: ['1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', 'CLK'],
  right: ['1Q', '2Q', '3Q', '4Q', '5Q', '6Q', '7Q', '8Q'],
  bottom: ['GND'],
};

/** 74HC245 (バス トランシーバ)。A 側は左、B 側は右に同じ順。DIR は VCC か GND、OE は普段 GND に結ぶ。 */
const HC245_LAYOUT: IcLayout = {
  top: ['VCC', 'DIR'],
  left: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
  right: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  bottom: ['GND', 'OE'],
};

/** 74HC283 (4 ビット全加算器)。A・B は左に下の桁から組で、桁上げ入力 CIN はその下。和は右、桁上げ出力 COUT はその下。 */
const HC283_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'B0', 'A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'CIN'],
  right: ['S0', 'S1', 'S2', 'S3', 'COUT'],
  bottom: ['GND'],
};

/** 74HC85 (4 ビット比較器)。A・B は左に下の桁から組で、下の桁の結果の入力 (カスケード) はその下。結果は右。 */
const HC85_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'B0', 'A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'LTIN', 'EQIN', 'GTIN'],
  right: ['LTOUT', 'EQOUT', 'GTOUT'],
  bottom: ['GND'],
};

/** 74HC393 (2 進カウンタ ×2)。クロックは左、Q は右に下の桁から。CLR は普段 GND に結ぶ。 */
const HC393_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['1CLK', '2CLK'],
  right: ['1QA', '1QB', '1QC', '1QD', '2QA', '2QB', '2QC', '2QD'],
  bottom: ['GND', '1CLR', '2CLR'],
};

/** 74HC4040 (12 段カウンタ)。クロックは左、QA〜QL は右に下の桁から。CLR は普段 GND に結ぶ。 */
const HC4040_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['CLK'],
  right: ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'QI', 'QJ', 'QK', 'QL'],
  bottom: ['GND', 'CLR'],
};

/** 74HC4060 (14 段カウンタ + 発振器)。CLKI は左、発振の CLKO・/CLKO と Q は右に。CLR は普段 GND に結ぶ。 */
const HC4060_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['CLKI'],
  right: ['CLKO', '/CLKO', 'QD', 'QE', 'QF', 'QG', 'QH', 'QI', 'QJ', 'QL', 'QM', 'QN'],
  bottom: ['GND', 'CLR'],
};

/** 74HC74 (D フリップフロップ ×2)。D とクロックは左、Q と Q̅ は右。PRE・CLR は普段 VCC に結ぶので電源の隣。 */
const HC74_LAYOUT: IcLayout = {
  top: ['VCC', '1PRE', '1CLR', '2PRE', '2CLR'],
  left: ['1D', '1CLK', '2D', '2CLK'],
  right: ['1Q', '/1Q', '2Q', '/2Q'],
  bottom: ['GND'],
};

/** 74HC174 (D フリップフロップ ×6)。D は左、Q は右に同じ順。CLR は普段 VCC に結ぶ。 */
const HC174_LAYOUT: IcLayout = {
  top: ['VCC', 'CLR'],
  left: ['1D', '2D', '3D', '4D', '5D', '6D', 'CLK'],
  right: ['1Q', '2Q', '3Q', '4Q', '5Q', '6Q'],
  bottom: ['GND'],
};

/** 74HC193 (アップダウン カウンタ)。プリセット A〜D と UP・DOWN・LOAD は左、Q と CO・BO は右。CLR は普段 GND に結ぶ。 */
const HC193_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A', 'B', 'C', 'D', 'UP', 'DOWN', 'LOAD'],
  right: ['QA', 'QB', 'QC', 'QD', 'CO', 'BO'],
  bottom: ['GND', 'CLR'],
};

/** 74HC4051 (8 チャネル アナログ マルチプレクサ)。チャネル A0〜A7 は左、共通 A は右。選択 S0〜S2・E・VEE は GND の側。 */
const HC4051_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
  right: ['A'],
  bottom: ['GND', 'VEE', 'E', 'S0', 'S1', 'S2'],
};

/**
 * 74HC4052 (4 チャネル アナログ マルチプレクサ ×2)。74HC4051 と同じ考え方で、チャネル A0〜A3・B0〜B3 は左、
 * 共通 AN・BN は右、選択 S0・S1 と E・VEE は GND の側。
 */
const HC4052_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3'],
  right: ['AN', 'BN'],
  bottom: ['GND', 'VEE', 'E', 'S0', 'S1'],
};

/**
 * SA612 (ダブルバランスド ミキサ + 発振器)。**RF の入力 IN_A・IN_B と局部発振の OSC_B・OSC_E は
 * どちらも左** (RF も外の LO も左から入る)、ミキサの出力 OUT_A・OUT_B は右。
 */
const SA612_LAYOUT: IcLayout = {
  top: ['VCC'],
  left: ['IN_A', 'IN_B', 'OSC_B', 'OSC_E'],
  right: ['OUT_A', 'OUT_B'],
  bottom: ['GND'],
};

/**
 * LM386 (オーディオ パワー アンプ)。**利得の C を付ける GAIN1・GAIN8 は上に隣どうし** (電源 VS の隣)、
 * 入力は左に +INPUT が上、出力 VOUT は右。BYPASS は C で GND へ落とすので GND の隣 (下)。
 */
const LM386_LAYOUT: IcLayout = {
  top: ['VS', 'GAIN1', 'GAIN8'],
  left: ['+INPUT', '-INPUT'],
  right: ['VOUT'],
  bottom: ['GND', 'BYPASS'],
};

/**
 * CD4040B (12 段リプルカウンタ。74HC4040 と同じピンの並び)。クロック CLOCK とリセット R は左、
 * Q1〜Q12 は右に下の桁から。CMOS 4000 系なので電源は VDD (上)・VSS (下)。
 */
const CD4040_LAYOUT: IcLayout = {
  top: ['VDD'],
  left: ['CLOCK', 'R'],
  right: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12'],
  bottom: ['VSS'],
};

/** CD4013B (D フリップフロップ ×2)。回路ごとに D・CLOCK・SET・RESET を左、Q・/Q を右に同じ順。 */
const CD4013_LAYOUT: IcLayout = {
  top: ['VDD'],
  left: ['D1', 'CLOCK1', 'SET1', 'RESET1', 'D2', 'CLOCK2', 'SET2', 'RESET2'],
  right: ['Q1', '/Q1', 'Q2', '/Q2'],
  bottom: ['VSS'],
};

/** 箱で描く部品のピンの並び。働きで並べた IC (`ic`) は型番で引く。箱でなければ null。 */
export function boxPinoutOf(type: string, model: string | null): IcPinout | null {
  return type === 'ic' ? lookupIcPinout(model) : null;
}

/** 型番は fence-kit の表の**代表の綴り** (別の綴りも同じ行に当たる)。 */
const LAYOUTS: readonly { readonly pins: number; readonly model: string; readonly layout: IcLayout }[] = [
  { pins: 8, model: 'NE555', layout: timer555('VCC') },
  { pins: 8, model: 'TLC555', layout: timer555('VDD') },
  { pins: 16, model: 'CD4511B', layout: CD4511_LAYOUT },
  { pins: 16, model: '74HC163', layout: HC163_LAYOUT },
  { pins: 24, model: '74HC154', layout: HC154_LAYOUT },
  { pins: 28, model: '62256', layout: SRAM62256_LAYOUT },
  { pins: 16, model: '74HC161', layout: HC163_LAYOUT },
  { pins: 16, model: '74HC595', layout: HC595_LAYOUT },
  { pins: 14, model: '74HC164', layout: HC164_LAYOUT },
  { pins: 16, model: '74HC165', layout: HC165_LAYOUT },
  { pins: 16, model: '74HC194', layout: HC194_LAYOUT },
  { pins: 16, model: '74HC138', layout: HC138_LAYOUT },
  { pins: 16, model: '74HC139', layout: HC139_LAYOUT },
  { pins: 16, model: '74HC157', layout: HC157_LAYOUT },
  { pins: 16, model: '74HC153', layout: HC153_LAYOUT },
  { pins: 16, model: '74HC151', layout: HC151_LAYOUT },
  { pins: 20, model: '74HC573', layout: latch8('LE') },
  { pins: 20, model: '74HC574', layout: latch8('CLK') },
  { pins: 20, model: '74HC273', layout: HC273_LAYOUT },
  { pins: 20, model: '74HC245', layout: HC245_LAYOUT },
  { pins: 16, model: 'CD74HC283', layout: HC283_LAYOUT },
  { pins: 16, model: '74HC85', layout: HC85_LAYOUT },
  { pins: 14, model: '74HC393', layout: HC393_LAYOUT },
  { pins: 16, model: '74HC4040', layout: HC4040_LAYOUT },
  { pins: 16, model: '74HC4060', layout: HC4060_LAYOUT },
  { pins: 14, model: '74HC74', layout: HC74_LAYOUT },
  { pins: 16, model: '74HC174', layout: HC174_LAYOUT },
  { pins: 16, model: '74HC193', layout: HC193_LAYOUT },
  { pins: 16, model: '74HC4051', layout: HC4051_LAYOUT },
  { pins: 16, model: 'CD4040B', layout: CD4040_LAYOUT },
  { pins: 14, model: 'CD4013B', layout: CD4013_LAYOUT },
  { pins: 16, model: '74HC4052', layout: HC4052_LAYOUT },
  { pins: 8, model: 'SA612', layout: SA612_LAYOUT },
  { pins: 8, model: 'LM386', layout: LM386_LAYOUT },
];

/** 型番からピンの名前と働きの並びを引く。並びを持たない型番は null。 */
export function lookupIcPinout(model: string | null): IcPinout | null {
  for (const row of LAYOUTS) {
    const pinout = lookupPinout(model, row.pins);
    if (pinout !== null && pinout.model === row.model) return { ...pinout, layout: row.layout };
  }
  return null;
}

/** 働きの並びを持つ型番 (代表の綴り)。お知らせと早見表に出す。 */
export const icLayoutModels = (): readonly string[] => LAYOUTS.map((row) => row.model);
