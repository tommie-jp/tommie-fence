import { element } from '../markup.ts';
import { num } from '../svg.ts';
import { dipChip, segmentFace } from './chips.ts';
import type { ChipPoint, DipOptions } from './chips.ts';

/**
 * ピンに名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP のピンの位置のうち、
 * ピンのある所に名前が付いた物**。リレー・フォトカプラ・7 セグがこの形で、
 * 違うのは列の間の穴数と、どの位置にピンがあるかだけ。
 *
 * **表だけを共有する** (マイコンボードの `boards.ts` と同じ)。ブレッドボードとユニバーサル基板は DIP と
 * 同じ道で置いて描き、回路図はピンの名前を記号のピンに当てる。
 *
 * **ピンの並びは実物のデータシートで確かめたもの** (段 0)。位置の番号は DIP と
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
  /** DIP のピンの位置の数 (2 列の合計)。 */
  readonly positions: number;
  /** 2 列の間の穴の数 (2.54mm 単位)。DIP は 3。 */
  readonly rowSpan: number;
  /** ピンのある位置と名前。**位置の順**。 */
  readonly pins: readonly NamedChipPin[];
  /** 胴の見た目。`display` は 7 セグの面、`switch` は DIP スイッチのつまみを描く。 */
  readonly body: 'relay' | 'chip' | 'display' | 'switch';
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
    // Vishay 4N35 (DIP6、Document Number 81181 Rev. 1.2、07-Jan-10)。1 アノード、2 カソード、3 NC、4 エミッタ、5 コレクタ、6 ベース。
    // **ピンの数が違うので PC817 の姿ではなく種類を分ける** (DIP スイッチと同じ)。
    type: 'photocoupler6', look: '4n35', name: '4N35', kindName: 'フォトカプラ', prefix: 'U', positions: 6, rowSpan: 3, body: 'chip',
    pins: pins({ 1: 'A', 2: 'K', 3: 'NC', 4: 'E', 5: 'C', 6: 'B' }),
  },
  {
    // 5161AS (0.56 インチ 1 桁、カソード共通)。1 列 5 本、列の間 15.24mm。
    // E=1 D=2 共通=3 C=4 DP=5 B=6 A=7 共通=8 F=9 G=10。
    type: 'seg7', look: '5161as', name: '5161AS', kindName: '7 セグメント LED', prefix: 'DS', positions: 10, rowSpan: 6, body: 'display',
    pins: pins({ 1: 'e', 2: 'd', 3: 'COM1', 4: 'c', 5: 'dp', 6: 'b', 7: 'a', 8: 'COM2', 9: 'f', 10: 'g' }),
  },
  dipSwitch(4),
  dipSwitch(8),
];

/**
 * DIP スイッチ (スライド型、`連` 個の開閉スイッチ)。**DIP と同じピンの並び**で、k 番の
 * スイッチは k 番のピン (`Ak`) と向かいのピン (`Bk` = 2n+1−k 番) の間の接点。
 * **ピンどうしは部品の中でつながない** (開いた接点。リレーの接点と同じ扱い)。
 * 連の数でピンの数が変わるので、姿ではなく**種類を分ける** (`dip-switch4` / `dip-switch8`)。
 */
function dipSwitch(ways: number): NamedChip {
  const lower = Array.from({ length: ways }, (_, index) => [index + 1, `A${index + 1}`] as const);
  const upper = Array.from({ length: ways }, (_, index) => [ways * 2 - index, `B${index + 1}`] as const);
  return {
    type: `dip-switch${ways}`, look: 'slide', name: `DIP SW ${ways}P`, kindName: 'DIP スイッチ', prefix: 'SW',
    positions: ways * 2, rowSpan: 3, body: 'switch',
    pins: pins(Object.fromEntries([...lower, ...upper])),
  };
}

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
 * 名前つきの DIP 型を描く。**DIP の絵 (`dipChip`) に、ピンの名前と品名を載せる**。
 * 7 セグは品名の代わりに面 (「8.」) を描く — 品名は部品リストに出る。
 *
 * `names` は `points` と同じ順のピンの名前 (基板が並べたもの)。回した部品では
 * 並びが巡るので、1 番ピンは**表の 1 番の位置の名前**で探す。
 */
export function drawNamedChip(options: Omit<DipOptions, 'pinOne'> & { readonly chip: NamedChip }): string {
  const { chip, names, points } = options;
  const firstName = chip.pins.find((pin) => pin.at === 1)?.name;
  const pinOne = Math.max(0, names.findIndex((name) => name === firstName));
  // **リレーとフォトカプラは番号も刷る** (名前の外側。52 の docs/95 の決め 2)。
  // 7 セグは面を描くので今のまま (名前だけ)。
  const numbers = names.map((name) => String(chip.pins.find((pin) => pin.name === name)?.at ?? ''));
  // DIP スイッチは品名の代わりにつまみを描く (品名は部品リストとキャプションに出る)。
  if (chip.body === 'switch') return `${dipChip({ ...options, numbers, pinOne, caption: '' })}${sliders(points, names)}`;
  if (chip.body !== 'display') return dipChip({ ...options, numbers, pinOne });

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
  const face = digitFace(mean(true), mean(false));
  return `${dipChip({ ...options, pinOne, caption: '' })}${face}`;
}

/** 桁の面 (「8.」)。上下どちらかの列が無ければ (ピンを寄せ切れない置き方) 何も描かない。 */
function digitFace(top: ChipPoint | null, bottom: ChipPoint | null): string {
  if (top === null || bottom === null) return '';
  const gap = Math.hypot(top.x - bottom.x, top.y - bottom.y) || 1;
  return segmentFace({
    centre: { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 },
    rowGap: gap,
    up: { x: (top.x - bottom.x) / gap, y: (top.y - bottom.y) / gap },
  });
}

/**
 * つまみの溝の長さ (2 列の間に対する比) と幅 (px)、つまみの長さ (溝に対する比)。
 * **溝はピンの番号の内側に収める** — 列から `SLOT_CLEAR` までは番号と名前の段なので、
 * 列の間が狭い基板 (ブレッドボードの溝をまたぐ 2 行) では溝のほうを短くする。
 */
const SLOT_LENGTH = 0.3;
const SLOT_CLEAR = 20;
/** 立てた胴は名前が番号の横に並ぶ (横書き) ので、そのぶん深い。 */
const SLOT_CLEAR_UPRIGHT = 25;
const SLOT_MIN = 8;
const SLOT_WIDTH = 6;
const KNOB_LENGTH = 0.5;
const SLOT_INK = '#5b616b';
const KNOB_INK = '#f4f5f7';

/**
 * DIP スイッチのつまみ。**向かい合うピン (`Ak` と `Bk`) の間に溝 1 本**、つまみは A の側
 * (どちらが ON かは品ごとに違うので、字では刷らない)。
 */
function sliders(points: readonly ChipPoint[], names: readonly string[]): string {
  const at = (name: string): ChipPoint | undefined => points[names.indexOf(name)];
  return names
    .filter((name) => name.startsWith('A'))
    .map((name) => {
      const from = at(name);
      const to = at(`B${name.slice(1)}`);
      if (from === undefined || to === undefined) return '';
      const along = (ratio: number): ChipPoint => ({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
      const bar = (start: ChipPoint, end: ChipPoint, ink: string, name: string): string => element('line', {
        class: name, x1: num(start.x), y1: num(start.y), x2: num(end.x), y2: num(end.y),
        stroke: ink, 'stroke-width': SLOT_WIDTH,
      });
      const gap = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const clear = Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? SLOT_CLEAR_UPRIGHT : SLOT_CLEAR;
      const length = Math.max(SLOT_MIN, Math.min(SLOT_LENGTH * gap, gap - clear * 2)) / gap;
      const [start, end] = [(1 - length) / 2, (1 + length) / 2];
      return bar(along(start), along(end), SLOT_INK, 'dip-switch-slot')
        + bar(along(start), along(start + length * KNOB_LENGTH), KNOB_INK, 'dip-switch-knob');
    })
    .join('');
}
