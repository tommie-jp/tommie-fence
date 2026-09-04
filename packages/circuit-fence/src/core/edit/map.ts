import { extractCircuitFences } from '../fences.ts';
import type { FenceBlock } from '../fences.ts';
import { LIMITS } from '../limits.ts';
import { cornerOf, formatAddress, parseAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { NO_TURN, lookupPartType, lookupPin, mainPinName, pinPlaces } from '../parts.ts';
import type { PartType, PinSide, Turn } from '../parts.ts';
import { cellOf } from '../types.ts';
import type { PartSpec } from '../types.ts';
import type { Circuit } from '../model/circuit.ts';
import type { Endpoint } from '../types.ts';
import { handleAt, handleOf, partOfHandle } from './handles.ts';
import { nodesOf, pointEntries } from './point.ts';
import { addressTokensOn, addressesOf, locateTokens } from './shared.ts';

/**
 * 部品を掴むための**グリッドマップ**。パース済みモデルから即時に描ける
 * 升目で、図 (TeX → SVG) とは別物。
 *
 * **図そのものを掴ませない。** tikzjax の SVG は意味構造が残らず、外形も
 * ラベル込みで TeX 任せなので、クリック位置 → 番地の写像が立たない。
 * マップなら位置合わせの問題がそもそも存在せず、操作に即時で追従できる
 * (図は数秒後に描き直る)。
 */

/** 升目の上の 1 点。**番地と同じ形**だが、こちらは描くための座標。 */
export type Cell = { readonly row: number; readonly col: number };

/**
 * 箱から出る足 1 本。**辺は向きに合わせて回したあとのもの** —
 * 箱そのものは回しても同じ形なので、**回ったことが目で分かるのはここだけ**。
 */
export type ChipPin = { readonly name: string; readonly side: PinSide };

/** マップに置く部品 1 つ。 */
export type Chip = {
  /** 図に出る名前。**同じ名前の記号が 2 つ以上あることがある** (`handles.ts`)。 */
  readonly id: string;
  /** 掴んだものを 1 つに指す名札。名前が重なっていなければ名前そのもの。 */
  readonly handle: string;
  readonly type: string;
  readonly row: number;
  readonly col: number;
  /** 2 端子部品のもう一方の端。1 端子・多端子は null。 */
  readonly to: Cell | null;
  /** 書かれた行 (1 始まり)。読めなかった行を印すのと、消すのに要る。 */
  readonly line: number;
  /** 書かれた向き。2 端子は番地の順が向きなので、いつも立ったまま。 */
  readonly turn: Turn;
  /** 箱から出る足 (多端子だけ)。向きを写したあとの辺を持つ。 */
  readonly pins: readonly ChipPin[];
};

/**
 * マップに引く線 1 本。折れた配線は角で 2 本に割ってある
 * (描く側が向きを気にしなくて済む)。
 */
export type WireLine = {
  /**
   * 通る点 (2 つか 3 つ)。**折れる配線は角を挟んで 3 つ** —
   * 1 本の折れ線として持つので、描く側が角を両端に合わせられる
   * (別々の線にすると、足へずらした端のせいで角が外れて斜めになる)。
   */
  readonly points: readonly Cell[];
  /** 書かれた行 (1 始まり)。エディタのカーソルと突き合わせるための目印。 */
  readonly line: number;
  /**
   * ピンの端を部品の升で近似したか。**正しい足の位置は TeX しか知らない**
   * (記号の形から決まる)。描く側はここを見て破線にする。
   */
  readonly approximate: boolean;
  /**
   * その端が足なら、どの部品のどの足か (代表の綴り)。**升目の上では足の位置が
   * 分かる**ので、描く側はここまで線を伸ばす — 升の真ん中で止めると、
   * 押した接続点と線の先が食い違って見える (実機で指摘された)。
   */
  readonly fromPin: PinRef | null;
  readonly toPin: PinRef | null;
};

/** 配線の端が指している足。名前は升目に出るものと同じ代表の綴り。 */
export type PinRef = { readonly part: string; readonly name: string };

/** マップに置く節点 1 つ。**掴む物が部品とは違う**ので、チップとは別に持つ。 */
export type Dot = {
  readonly row: number;
  readonly col: number;
  /** `points:` が付けた名前。無ければ null。 */
  readonly name: string | null;
  /** その番地を書いている場所の数。 */
  readonly uses: number;
};

/**
 * マップに出す注釈 1 つ。**掴み手は書かれた行** — 注釈には名前が無いので、
 * 行そのもので指す (配線と同じ考え方)。部品と同じ `data-part` に載せるので、
 * 殻は注釈を部品として扱える (選ぶ・動かす・複製する・消すがそのまま通る)。
 */
export type MapNote = {
  readonly handle: string;
  readonly line: number;
  readonly kind: string;
  /** 字の注釈の言葉。ほかの印は空。 */
  readonly text: string;
  readonly row: number;
  readonly col: number;
  /** 部品を指しているか。**指しているものは動かさない** (名前が外れるため)。 */
  readonly onPart: boolean;
};

export type GridMap = {
  readonly rows: number;
  readonly cols: number;
  readonly chips: readonly Chip[];
  /** 掴める注釈。升目に載らない所を指しているものは出さない (チップと同じ理由)。 */
  readonly notes: readonly MapNote[];
  /** 掴める節点。交点の間にあるものは載らない (チップと同じ理由)。 */
  readonly dots: readonly Dot[];
  /** 引く線。部品の形と違い、**書かれたとおりの位置**に引ける。 */
  readonly wires: readonly WireLine[];
  /** 升目に載らないので出さなかった部品 (交点の間に置かれたもの)。 */
  readonly skipped: readonly string[];
  /** フェンスを読めたか。読めなければマップは空。 */
  readonly readable: boolean;
};

/** 動かせる余地。部品が端に寄っていても、その先へ運べる升を出しておく。 */
const MARGIN = 2;
const MIN_ROWS = 4;
const MIN_COLS = 6;

const isOnCrossing = (address: Address): boolean =>
  Number.isInteger(address.row) && Number.isInteger(address.col);

const cellAt = (address: Address): Cell => ({ row: address.row, col: address.col });

/**
 * 引く線。折れは角で 2 本に割る。
 *
 * **ピンの端は部品の升で近似する。** 足の正しい位置は記号の形から決まるので
 * TeX しか知らない (docs/03 に書いた既知の限界と同じ根)。描かないと配線が
 * 消えて見えるので、「だいたいここ」として引いて破線で断る。
 * 指す先の部品が無い配線は引かない — 書き間違いはエラーの帯の仕事で、
 * ここで当てずっぽうの線を足すと誤りが図らしく見えてしまう。
 */
/**
 * 足に付く配線の曲がり角。
 *
 * `cornerOf` は**升の番地**で見るので、角が端と同じ升に来ると「曲がっていない」
 * と答える。足は升の上に無い (箱の縁から出る) ので、同じ升でも図の上では
 * 曲がる — 升目だけ斜めの線になっていた (実機で指摘された)。
 *
 * **端のどちらかが足のときだけ**足す。番地どうしなら `cornerOf` の答えが正しい。
 */
function pinCornerOf(
  from: { readonly cell: Address; readonly pin: PinRef | null },
  to: { readonly cell: Address; readonly pin: PinRef | null },
  operator: WireOperator,
): Address | null {
  if (operator === '--') return null;
  if (from.pin === null && to.pin === null) return null;
  return operator === '-|'
    ? { row: from.cell.row, col: to.cell.col }
    : { row: to.cell.row, col: from.cell.col };
}

function wireLinesOf(doc: Circuit): WireLine[] {
  const anchorAt = new Map<string, Address>();
  for (const part of doc.parts) {
    const anchor = addressesOf(part)[0];
    if (anchor !== undefined) anchorAt.set(part.id, anchor);
  }

  const typeOf = new Map<string, string>();
  for (const part of doc.parts) typeOf.set(part.id, part.type);

  /** 書かれた足の綴り (`C`) を、升目に出る代表の綴り (`C`) に直す。 */
  const pinRefOf = (endpoint: Endpoint): PinRef | null => {
    if (endpoint.kind !== 'pin') return null;
    const type = lookupPartType(typeOf.get(endpoint.part) ?? '');
    if (type === null || type === undefined) return null;
    const anchor = lookupPin(type, endpoint.pin);
    return anchor === null ? null : { part: endpoint.part, name: mainPinName(type, anchor) };
  };

  const resolve = (endpoint: Endpoint): {
    cell: Address; approximate: boolean; pin: PinRef | null;
  } | null => {
    const written = cellOf(endpoint);
    if (written !== null) return { cell: written, approximate: false, pin: null };
    const anchor = endpoint.kind === 'pin' ? anchorAt.get(endpoint.part) : undefined;
    return anchor === undefined ? null : { cell: anchor, approximate: true, pin: pinRefOf(endpoint) };
  };

  const lines: WireLine[] = [];
  for (const wire of doc.wires) {
    const from = resolve(wire.from);
    const to = resolve(wire.to);
    if (from === null || to === null) continue;

    const approximate = from.approximate || to.approximate;
    const line = wire.line;
    const corner = cornerOf(from.cell, to.cell, wire.operator) ?? pinCornerOf(from, to, wire.operator);
    const points = corner === null
      ? [cellAt(from.cell), cellAt(to.cell)]
      : [cellAt(from.cell), cellAt(corner), cellAt(to.cell)];
    lines.push({ points, approximate, line, fromPin: from.pin, toPin: to.pin });
  }
  return lines;
}

/**
 * 箱から出る足。**向きを写した辺**で返す (`pinSideOf` が回す)。
 * 中心線に乗らない足 (オペアンプの ± など) は持たない — 辺が決まらないので、
 * 描くと当てずっぽうの位置を約束することになる。
 */
function pinsOf(type: PartType | null, turn: Turn): readonly ChipPin[] {
  if (type === null) return [];
  // **中心線に乗る足も乗らない足も置く。** 升目は掴むための道具なので、
  // 「まっすぐ引けるか」ではなく「どこから出ているか」で並べる。
  //
  // 名前は**図に出るものと同じ字**にする。図に足の名前を書く部品
  // (`pinLabels`) はそちらから引く — `mainPinName` は書ける綴りのうち最初の
  // 1 つを返すので、数字と名前の両方で呼べる足 (レギュレータ) では
  // 図と食い違う (JS は数字めいた鍵を先に並べるため。実機で気づいた)。
  return pinPlaces(type, turn).map(({ anchor, side }) => ({
    name: labelOf(type, anchor) ?? mainPinName(type, anchor),
    side,
  }));
}

/** 図に書く足の名前 (`pinLabels`)。持たない種類は null。 */
function labelOf(type: PartType, anchor: string): string | null {
  const labels = type.pinLabels;
  const at = /^pin (\d+)$/.exec(anchor);
  if (labels === undefined || at === null) return null;
  return labels[Number(at[1]) - 1] ?? null;
}

/** フェンス本文から升目のモデルを作る。**読めなければ空**で、嘘の位置を見せない。 */
export function gridMap(source: string): GridMap {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) {
    return {
      rows: MIN_ROWS, cols: MIN_COLS, chips: [], notes: [], dots: [], wires: [], skipped: [], readable: false,
    };
  }

  const chips: Chip[] = [];
  const skipped: string[] = [];

  for (const [index, part] of doc.parts.entries()) {
    const addresses = addressesOf(part);
    // **交点の間 (`a_1.5`) は升目に載らない。** 別の升へ寄せて見せると、
    // 掴んで動かしたとき書いた場所と違うところへ行く。
    if (!addresses.every(isOnCrossing)) {
      skipped.push(part.id);
      continue;
    }
    const [anchor, far] = addresses;
    // 2 端子部品は番地の順そのものが向きなので、向きの語を持たない。
    const turn = part.kind === 'two-terminal' ? NO_TURN : part.turn;
    chips.push({
      id: part.id,
      handle: handleAt(doc.parts, index),
      type: part.type,
      row: (anchor as Address).row,
      col: (anchor as Address).col,
      to: far ? { row: far.row, col: far.col } : null,
      line: part.line,
      turn,
      pins: pinsOf(lookupPartType(part.type), turn),
    });
  }

  const dots: Dot[] = nodesOf(doc, normalized)
    .filter((node) => isOnCrossing(node.address))
    .map((node) => ({ row: node.address.row, col: node.address.col, name: node.name, uses: node.uses }));

  const wires = wireLinesOf(doc);

  // **注釈も掴める。** 図に重ねる印なので回路の一員ではないが、置き直したい
  // ものではある。升目に載らない所を指しているものは出さない (チップと同じ理由)。
  const notes: MapNote[] = [];
  for (const note of doc.notes) {
    const target = noteTargetOf(note);
    if (target === null) continue;
    const named = doc.parts.some((part) => part.id === target);
    const address = named ? null : parseAddress(target);
    const cell = named
      ? cellOfPart(doc, target)
      : address !== null && isOnCrossing(address) ? cellAt(address) : null;
    if (cell === null) continue;
    notes.push({
      handle: `note:${note.line}`,
      line: note.line,
      kind: note.kind,
      text: note.kind === 'text' ? note.text : '',
      row: cell.row,
      col: cell.col,
      onPart: named,
    });
  }

  // **升目は点と線も覆う。** 配線だけが届く交点はチップに現れないので、
  // 部品だけを見て決めると端が升の外へ落ちて掴めなくなる。
  // 端数の番地は切り上げて数える (`a_1.5` は 2 列目まで要る)。
  const used: readonly Cell[] = [
    ...chips.flatMap((chip) => [chip, chip.to].filter((cell) => cell !== null)),
    ...dots,
    ...wires.flatMap((wire) => wire.points),
  ];
  const span = (of: (cell: Cell) => number): number[] => used.map((cell) => Math.ceil(of(cell)) + 1 + MARGIN);
  const rows = Math.min(26, Math.max(MIN_ROWS, ...span((cell) => cell.row)));
  const cols = Math.min(LIMITS.columns, Math.max(MIN_COLS, ...span((cell) => cell.col)));

  return { rows, cols, chips, notes, dots, wires, skipped, readable: true };
}

/**
 * エディタのカーソルが指しているもの。**マップ側で光らせる**ために使う
 * (掴んだものをエディタで光らせるのと逆向き)。
 *
 * 番地の綴りの上なら節点、それ以外は行が持っているもの (部品か配線)。
 * **行の上ならどこでも同じ答え**にする — 値の上とラベルの上で違う物を指すと、
 * 光るものがカーソルを動かすたびに入れ替わって読みにくい。
 */
export type Aim =
  | { readonly kind: 'part'; readonly id: string }
  | { readonly kind: 'node'; readonly address: Address }
  | { readonly kind: 'wire'; readonly line: number };

/** フェンスの中の行 (1 始まり) と桁 (0 始まり) で引く。指すものが無ければ null。 */
export function aimAt(source: string, line: number, column: number): Aim | null {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (!doc) return null;

  const text = normalized.split('\n')[line - 1];
  if (text === undefined) return null;

  const covers = (span: { column: number; length: number }): boolean =>
    column >= span.column && column <= span.column + span.length;

  // **`points:` の行き先も節点。** 名前を付けた行にカーソルを置いたときに指す。
  for (const entry of pointEntries(normalized)) {
    if (entry.line === line && covers(entry)) return { kind: 'node', address: entry.address };
  }

  // 部品の行なら、その行の部品。1 行に 2 つ以上あるときは桁で選ぶ。
  const here = doc.parts.filter((part) => part.line === line);

  // **番地を探すのは `parts:` と `wires:` の行だけ。** `title:` や `notes:` や
  // `style:` にも番地に見える字は書けるが、あれは節点を指していない
  // (`circle C1 red` の C1 は部品の名前。書き換え側で実際に踏んだ罠と同じ根)。
  const onWire = doc.wires.some((wire) => wire.line === line);
  if (here.length > 0 || onWire) {
    for (const token of addressTokensOn(text, doc.points)) {
      if (covers(token)) return { kind: 'node', address: token.address };
    }
  }
  if (here.length > 0) {
    let cursor = 0;
    let last = here[0] as (typeof here)[number];
    for (const part of here) {
      const located = locateTokens(text, addressesOf(part), doc.points, cursor);
      if (located === null) break;
      last = part;
      if (column <= located.end) return { kind: 'part', id: handleOf(doc.parts, part) };
      cursor = located.end;
    }
    return { kind: 'part', id: handleOf(doc.parts, last) };
  }

  const wire = doc.wires.find((one) => one.line === line);
  return wire === undefined ? null : { kind: 'wire', line };
}

/** カーソルのある行 (1 始まり) を含む circuit フェンス。無ければ null。 */
export function fenceAt(markdown: string, line: number): FenceBlock | null {
  for (const fence of extractCircuitFences(markdown)) {
    const bodyLines = fence.source === '' ? 0 : fence.source.replace(/\n$/, '').split('\n').length;
    // 開き記号の行から閉じ記号の行までを「中」とみなす (カーソルが縁にあっても拾う)。
    if (line >= fence.line && line <= fence.line + bodyLines + 1) return fence;
  }
  return null;
}

/**
 * その部品が載っている交点 (書かれた綴り)。ゴーストの光らせ先。無ければ空。
 *
 * **升目を組まずに、書かれた番地をそのまま読む。** `gridMap` を通すと
 * 升目に載らない番地 (`a_1.5`) の部品が黙って空になり、置いたのに何も光らない。
 * ホバーのたびに呼ばれるので、点や配線まで組み直す必要も無い。
 */
export function partCells(source: string, handle: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc === null ? null : partOfHandle(doc.parts, handle);
  return part === null ? [] : addressesOf(part).map(formatAddress);
}

/** その注釈が指している綴り。**指し先を持たないもの (書き出し) は null**。 */
function noteTargetOf(note: { readonly kind: string } & Record<string, unknown>): string | null {
  if (note.kind === 'circle') return typeof note.target === 'string' ? note.target : null;
  if (note.kind === 'text') return typeof note.at === 'object' && note.at !== null ? formatAddress(note.at as Address) : null;
  if (note.kind === 'box') {
    return typeof note.from === 'object' && note.from !== null ? formatAddress(note.from as Address) : null;
  }
  if (note.kind === 'arrow' || note.kind === 'line') return typeof note.from === 'string' ? note.from : null;
  return null;
}

/** その部品が座っている升。2 端子は先に書いた足のほう (アンカー)。 */
function cellOfPart(doc: { readonly parts: readonly PartSpec[] }, id: string): Cell | null {
  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) return null;
  const anchor = addressesOf(part)[0];
  return anchor === undefined || !isOnCrossing(anchor) ? null : cellAt(anchor);
}
