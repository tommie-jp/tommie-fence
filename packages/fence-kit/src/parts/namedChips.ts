import { dipChip, segmentFace } from './chips.ts';
import type { ChipPoint, DipOptions } from './chips.ts';

/**
 * 足に名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP の足の位置のうち、
 * 足のある所に名前が付いた物**。リレー・フォトカプラ・7 セグがこの形で、
 * 違うのは列の間の穴数と、どの位置に足があるかだけ。
 *
 * **表だけを共有する** (マイコンボードの `boards.ts` と同じ)。板の 2 つは DIP と
 * 同じ道で置いて描き、回路図は足の名前を記号の足に当てる。
 *
 * **足の並びは実物のデータシートで確かめたもの** (段 0)。位置の番号は DIP と
 * 同じ回り方 (上から見て 1 番が左下、反時計回り)。
 */

export type NamedChipPin = { readonly at: number; readonly name: string };

export type NamedChip = {
  /** 種類。フェンスに書く名前 (`relay`)。 */
  readonly type: string;
  /** 姿 (品名)。`relay/g5v-2` の `/` の後ろ。**表の最初の姿が既定**。 */
  readonly look: string;
  /** 部品リストと図に出す品名。 */
  readonly name: string;
  /** 種類の和名 (パレットと部品の一覧)。**3 つのフェンスで同じ字**にする。 */
  readonly kindName: string;
  /** ID の接頭辞 (回路図の慣習)。 */
  readonly prefix: string;
  /** DIP の足の位置の数 (2 列の合計)。 */
  readonly positions: number;
  /** 2 列の間の穴の数 (2.54mm 単位)。DIP は 3。 */
  readonly rowSpan: number;
  /** 足のある位置と名前。**位置の順**。 */
  readonly pins: readonly NamedChipPin[];
  /** 胴の見た目。`display` は 7 セグの面を描く。 */
  readonly body: 'relay' | 'chip' | 'display';
};

const pins = (entries: Readonly<Record<number, string>>): readonly NamedChipPin[] =>
  Object.entries(entries)
    .map(([at, name]) => ({ at: Number(at), name }))
    .sort((a, b) => a.at - b.at);

const CHIPS: readonly NamedChip[] = [
  {
    // Omron G5V-2 (2c)。下から見て 1・4・6・8 / 16・13・11・9、列の間 7.62mm。
    // 1・16 がコイル (極性なし)、4・13 が共通、6・11 が b 接点、8・9 が a 接点。
    type: 'relay', look: 'g5v-2', name: 'G5V-2', kindName: 'リレー', prefix: 'K', positions: 16, rowSpan: 3, body: 'relay',
    pins: pins({ 1: 'A1', 4: 'COM1', 6: 'NC1', 8: 'NO1', 9: 'NO2', 11: 'NC2', 13: 'COM2', 16: 'A2' }),
  },
  {
    // シャープ PC817。1 アノード、2 カソード、3 エミッタ、4 コレクタ。
    type: 'photocoupler', look: 'pc817', name: 'PC817', kindName: 'フォトカプラ', prefix: 'U', positions: 4, rowSpan: 3, body: 'chip',
    pins: pins({ 1: 'A', 2: 'K', 3: 'E', 4: 'C' }),
  },
  {
    // 5161AS (0.56 インチ 1 桁、カソード共通)。1 列 5 本、列の間 15.24mm。
    // E=1 D=2 共通=3 C=4 DP=5 B=6 A=7 共通=8 F=9 G=10。
    type: 'seg7', look: '5161as', name: '5161AS', kindName: '7 セグメント LED', prefix: 'DS', positions: 10, rowSpan: 6, body: 'display',
    pins: pins({ 1: 'e', 2: 'd', 3: 'COM1', 4: 'c', 5: 'dp', 6: 'b', 7: 'a', 8: 'COM2', 9: 'f', 10: 'g' }),
  },
];

/** 種類の名前。表に出てくる順 (1 回ずつ)。 */
export const namedChipTypes = (): readonly string[] => [...new Set(CHIPS.map((chip) => chip.type))];

/** その種類の姿 (品名)。知らない種類は空。 */
export const namedChipLooks = (type: string): readonly string[] =>
  CHIPS.filter((chip) => chip.type === type).map((chip) => chip.look);

/** 種類と姿から引く。姿が null なら既定 (表の最初)。知らなければ null。 */
export function lookupNamedChip(type: string, look: string | null): NamedChip | null {
  const candidates = CHIPS.filter((chip) => chip.type === type);
  return (look === null ? candidates[0] : candidates.find((chip) => chip.look === look)) ?? null;
}

/**
 * 名前つきの DIP 型を描く。**DIP の絵 (`dipChip`) に、足の名前と品名を載せる**。
 * 7 セグは品名の代わりに面 (「8.」) を描く — 品名は部品リストに出る。
 *
 * `names` は `points` と同じ順の足の名前 (板が並べたもの)。回した部品では
 * 並びが巡るので、1 番ピンは**表の 1 番の位置の名前**で探す。
 */
export function drawNamedChip(options: Omit<DipOptions, 'pinOne'> & { readonly chip: NamedChip }): string {
  const { chip, names, points } = options;
  const firstName = chip.pins.find((pin) => pin.at === 1)?.name;
  const pinOne = Math.max(0, names.findIndex((name) => name === firstName));
  if (chip.body !== 'display') return dipChip({ ...options, pinOne });

  // 桁の上は 6〜10 番の列 (データシートの上から見た図で a が上)。
  const half = chip.positions / 2;
  const atOf = (name: string): number => chip.pins.find((pin) => pin.name === name)?.at ?? 0;
  const mean = (upper: boolean): ChipPoint | null => {
    const picked = points.filter((_, index) => (atOf(names[index] ?? '') > half) === upper);
    if (picked.length === 0) return null;
    return {
      x: picked.reduce((sum, point) => sum + point.x, 0) / picked.length,
      y: picked.reduce((sum, point) => sum + point.y, 0) / picked.length,
    };
  };
  const top = mean(true);
  const bottom = mean(false);
  const face = top === null || bottom === null ? '' : (() => {
    const gap = Math.hypot(top.x - bottom.x, top.y - bottom.y) || 1;
    return segmentFace({
      centre: { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 },
      rowGap: gap,
      up: { x: (top.x - bottom.x) / gap, y: (top.y - bottom.y) / gap },
    });
  })();
  return `${dipChip({ ...options, pinOne, caption: '' })}${face}`;
}
