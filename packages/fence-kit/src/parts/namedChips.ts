import { element } from '../markup.ts';
import { num } from '../svg.ts';
import { chipAlongX, dipBox, dipChip, segmentFace } from './chips.ts';
import type { ChipBox, ChipPoint, DipOptions } from './chips.ts';

/**
 * ピンに名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP のピンの位置のうち、
 * ピンのある所に名前が付いた物**。リレー・フォトカプラ・7 セグ (1 桁と 4 桁) がこの形で、
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
  /**
   * 7 セグの桁の数。書かなければ 1。**桁の間は 1 番と `positions / 2` 番の列の間**
   * (4 桁の OSL40562 は 12.70 mm = 5 ピッチで、ピンの列の端から端と同じ)。
   */
  readonly digits?: number;
  /**
   * 胴の長さ (列に沿う向き、2.54mm 単位)。書かなければ DIP と同じ (ピンの並び + 縁)。
   * **ピンの並びより胴が長い部品**だけが書く。胴はピンの並びの真ん中に置く。
   */
  readonly bodyAlong?: number;
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
  {
    // OptoSupply OSL40562-LR (0.56 インチ 4 桁、カソード共通、ダイナミック点灯)。
    // 秋月の資料 https://akizukidenshi.com/goodsaffix/OSL40562-LR.pdf の 2 ページめ
    // (Package dimensions and pin function) で確かめた。外形 50.30 × 19.0 mm、桁の間 12.70 mm、
    // 1 列 6 本 (2.54 mm)、列の間 15.24 mm。上から見て 1 番が左下、12 番が左上、DIG1 が左端の桁。
    // e=1 d=2 dp=3 c=4 g=5 DIG4=6 b=7 DIG3=8 DIG2=9 f=10 a=11 DIG1=12。
    // DIGk は k 桁めのカソードの共通、a〜g・dp は 4 桁で共通につながったアノード。
    // **ピンの数が違うので 5161AS の姿ではなく種類を分ける** (DIP スイッチと同じ)。
    type: 'seg7x4', look: 'osl40562', name: 'OSL40562-LR', kindName: '4 桁 7 セグメント LED', prefix: 'DS',
    positions: 12, rowSpan: 6, body: 'display', digits: 4, bodyAlong: 50.3 / 2.54,
    pins: pins({ 1: 'e', 2: 'd', 3: 'dp', 4: 'c', 5: 'g', 6: 'DIG4', 7: 'b', 8: 'DIG3', 9: 'DIG2', 10: 'f', 11: 'a', 12: 'DIG1' }),
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
 * 名前つきの DIP 型の胴の外形。**描くのも当たり判定もこれを使う** (perfboard の約束)。
 * ふつうは DIP と同じで、胴の長さ (`bodyAlong`) のある部品だけ列に沿って伸ばす
 * (伸ばすのはピンの並びの真ん中から両側へ同じだけ)。
 */
export function namedChipBox(chip: NamedChip, points: readonly ChipPoint[], pitch: number): ChipBox {
  const box = dipBox(points, pitch);
  if (chip.bodyAlong === undefined || points.length === 0) return box;
  const length = chip.bodyAlong * pitch;
  if (chipAlongX(points)) return { ...box, x: box.x + box.width / 2 - length / 2, width: length };
  return { ...box, y: box.y + box.height / 2 - length / 2, height: length };
}

/**
 * 名前つきの DIP 型を描く。**DIP の絵 (`dipChip`) に、ピンの名前と品名を載せる**。
 * 7 セグは品名の代わりに面 (「8.」) を描く — 品名は部品リストに出る。4 桁の 7 セグは
 * 面を桁の数だけ、横長の胴 (`namedChipBox`) の中に並べる。
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
  const top = mean(true);
  const bottom = mean(false);
  // 桁の並ぶ向きと間隔は 1 番から `half` 番の列へ (DIG1 が 1 番の側)。
  const pointOf = (at: number): ChipPoint | undefined =>
    points[names.indexOf(chip.pins.find((pin) => pin.at === at)?.name ?? '')];
  const faces = digitCentres(chip.digits ?? 1, pointOf(1), pointOf(half))
    .map((offset) => digitFace(shifted(top, offset), shifted(bottom, offset)))
    .join('');
  const box = namedChipBox(chip, points, options.pitch);
  return `${dipChip({ ...options, pinOne, caption: '', box, staggerLabels: true })}${faces}`;
}

/**
 * 桁ごとの中心のずれ。**1 桁なら 0 だけ**。複数の桁は 1 番と `half` 番の列の間を
 * 1 桁の間隔とし、真ん中から両側へ並べる (4 桁なら −1.5・−0.5・0.5・1.5 倍)。
 */
function digitCentres(digits: number, first: ChipPoint | undefined, last: ChipPoint | undefined): ChipPoint[] {
  if (digits <= 1 || first === undefined || last === undefined) return [{ x: 0, y: 0 }];
  const step = { x: last.x - first.x, y: last.y - first.y };
  return Array.from({ length: digits }, (_, index) => {
    const k = index - (digits - 1) / 2;
    return { x: step.x * k, y: step.y * k };
  });
}

const shifted = (point: ChipPoint | null, offset: ChipPoint): ChipPoint | null =>
  point === null ? null : { x: point.x + offset.x, y: point.y + offset.y };

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
