import {
  FLOW_ADD_REFUSAL, REWRITE_REFUSAL, appendUnderKey, element, escapeMarkup, insertLines, isFlowKey, partIcon, wireColorNames,
} from 'fence-kit';
import type { EditResult, NewPart } from 'fence-kit';
import { formatMm, formatPoint, parsePoint, round2 } from '../model/point.ts';
import { resolveKind, typeNames as allTypes } from '../parts/catalog.ts';
import { SMA } from '../parts/footprint.ts';
import { lineModel } from '../render/captions.ts';
import type { Board, Mm } from '../types.ts';
import { nearestEdge, straighten } from './geometry.ts';
import { find, itemOf, read } from './items.ts';
import type { Read } from './items.ts';
import { changed, refuse } from './result.ts';

/**
 * パレットに出す物。**本の治具で使う物を、使う順に**並べる — 端面 SMA、
 * 直列・シャントのチップ、MMIC、箱、足のある部品、島・via・切り欠き。
 */
const PALETTE: readonly (readonly [type: string, name: string])[] = [
  ['sma', '端面 SMA'],
  ['capacitor/1608', 'チップ C (1608)'],
  ['resistor/1608', 'チップ R (1608)'],
  ['inductor/1608', 'チップ L (1608)'],
  ['bead/1608', 'フェライトビーズ (1608)'],
  ['led/1608', 'チップ LED (1608)'],
  ['diode/sod323', 'ダイオード (SOD-323)'],
  ['transistor/sot23', 'トランジスタ (SOT-23)'],
  ['ic3/sot89', 'MMIC (SOT-89)'],
  ['box', '箱 (SAW・缶)'],
  ['resistor', '抵抗 (足)'],
  ['capacitor', 'コンデンサ (足)'],
  ['pad', '島'],
  ['via', 'via'],
  ['slot', '切り欠き'],
];

/** 銅の形 (`copper:` に書く物)。 */
const SHAPES = new Set(['pad', 'via', 'slot', 'line']);

/** 名前の頭。**RF の図の慣わし** (線路は TL、ビーズは FB)。 */
const PREFIX: Readonly<Record<string, string>> = {
  sma: 'J', box: 'U', ic3: 'U', regulator: 'U', transistor: 'Q', resistor: 'R', capacitor: 'C', inductor: 'L',
  bead: 'FB', led: 'D', diode: 'D', zener: 'D', schottky: 'D', varicap: 'D', crystal: 'Y',
  pad: 'P', via: 'V', slot: 'X', line: 'TL',
};

/** 足のある部品を 1 点で置いたときの長さ (mm)。1/4W 抵抗が収まる 10mm。 */
const LEAD_SPAN = 10;

const baseOf = (type: string): string => type.split('/')[0] ?? type;

/** 次の名前 (`C3`)。**知らない種類だけ null**。 */
export function nextId(source: string, type: string): string | null {
  const base = baseOf(type);
  const kind = SHAPES.has(base) ? null : resolveKind(type);
  const prefix = PREFIX[base] ?? (kind !== null && kind.ok ? (PREFIX[kind.value.type] ?? 'U') : null);
  if (prefix === undefined || prefix === null) return null;
  const { doc } = read(source);
  const taken = new Set([...doc.parts.map((part) => part.id), ...doc.copper.map((spec) => spec.id)]);
  let number = 1;
  while (taken.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

/** その板で 50Ω になる線路の幅 (mm)。地の無い板は 1mm。 */
export function fiftyOhmWidth(board: Board): number {
  if (board.ground === 'none') return 1;
  let [lo, hi] = [0.05, 50];
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if ((lineModel(mid, board.cut, board)?.z0 ?? 0) > 50) lo = mid;
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

/** 置く行を書き換えにする。**鍵の下の最後の項目の後ろ**、無ければ鍵ごと足す。 */
function appended(state: Read, key: 'parts' | 'copper', text: string, preview: boolean): EditResult {
  if (isFlowKey(state.lines, key)) return refuse(FLOW_ADD_REFUSAL);
  const lines = key === 'parts' ? state.doc.parts : state.doc.copper;
  const last = Math.max(0, ...lines.map((one) => one.line ?? 0));
  const edits = appendUnderKey(state.lines, key, last, text);
  return changed(state.source, { lines: edits }, { preview });
}

const turnWord = (quarters: number): string | null => {
  const turn = ((((quarters % 4) + 4) % 4) * 90);
  return turn === 0 ? null : `r${turn}`;
};

/** 部品・島を置く。**押した点 1 つで置ける** (足のある部品は右へ 10mm、2 点ならその 2 点)。 */
export function addPart(source: string, part: NewPart): EditResult {
  const state = read(source);
  const points = part.at.map((written) => parsePoint(written));
  const bad = points.indexOf(null);
  if (bad >= 0) return refuse(`点として読めません: ${part.at[bad] ?? ''}`);
  const [first, second] = points as Mm[];
  if (first === undefined) return refuse('置く点がありません');
  const base = baseOf(part.type);
  const preview = part.preview === true;
  const orient = [turnWord(part.turn ?? 0), part.flip === true ? 'mirror' : null].filter((word): word is string => word !== null);

  if (base === 'pad') return appended(state, 'copper', `${part.id}: pad ${formatPoint(first)}`, preview);
  if (base === 'via') return appended(state, 'copper', `${part.id}: via ${formatPoint(first)}`, preview);
  if (base === 'slot') {
    const size = (part.turn ?? 0) % 2 === 0 ? '10x1' : '1x10';
    return appended(state, 'copper', `${part.id}: slot ${formatPoint(first)} ${size}`, preview);
  }
  const kind = resolveKind(part.type);
  if (!kind.ok) return refuse(kind.reason);
  switch (kind.value.kind) {
    case 'edge': {
      const edge = nearestEdge(state.doc.board, first);
      return appended(state, 'parts', `${part.id}: ${part.type} ${edge.side} ${formatMm(edge.offset)}`, preview);
    }
    case 'box':
      return appended(state, 'parts', [`${part.id}: box ${formatPoint(first)} 4x4 4`, ...orient].join(' '), preview);
    case 'chip':
    case 'sot':
      return appended(state, 'parts', [`${part.id}: ${part.type} ${formatPoint(first)}`, ...orient].join(' '), preview);
    case 'leaded': {
      const along = (part.turn ?? 0) % 2 === 0 ? { x: LEAD_SPAN, y: 0 } : { x: 0, y: LEAD_SPAN };
      const end = second ?? { x: round2(first.x + along.x), y: round2(first.y + along.y) };
      return appended(state, 'parts', `${part.id}: ${part.type} ${formatPoint(first)} ${formatPoint(end)}`, preview);
    }
  }
}

/**
 * 線路を引く (マップで 2 点を結ぶ)。**幅はその板で 50Ω になる幅** — 引いた
 * 線路がそのまま治具の線路になる。斜めに結んだときは横→縦に折る。
 */
export function addWire(source: string, from: string, to: string): EditResult {
  const [a, b] = [parsePoint(from), parsePoint(to)];
  if (a === null || b === null) return refuse(`点として読めません: ${a === null ? from : to}`);
  if (a.x === b.x && a.y === b.y) return refuse('同じ点どうしは結べません');
  const state = read(source);
  const id = nextId(source, 'line') ?? 'TL1';
  const points = straighten([a, b]).map(formatPoint).join(' ');
  return appended(state, 'copper', `${id}: line ${points} ${formatMm(fiftyOhmWidth(state.doc.board))}`, false);
}

/** 複製 — 行を写して名前と場所だけ変える。**2mm 右下** (SMA は辺に沿って隣)。 */
export function duplicate(source: string, handle: string, id: string): EditResult {
  const state = read(source);
  const found = find(state.doc, handle);
  if (found === null || found.kind === 'jumper' || found.kind === 'line') return refuse(`複製できるものではありません: ${handle}`);
  const spec = found.kind === 'part' ? found.part : found.shape;
  const item = itemOf(state.lines, spec.line, spec.id);
  if (item === null) return refuse(`${spec.id}: ${REWRITE_REFUSAL}`, spec.line);
  const shift = (written: string): string => {
    const point = parsePoint(written);
    return point === null ? written : formatPoint({ x: round2(point.x + 2), y: round2(point.y + 2) });
  };
  const words = item.words.map((word) => word.text);
  if (found.kind === 'part' && found.part.kind === 'edge') {
    const length = found.part.side === 'left' || found.part.side === 'right' ? state.doc.board.height : state.doc.board.width;
    const next = found.part.offset + SMA.size + 1;
    words[2] = formatMm(next + SMA.size / 2 <= length ? next : Math.max(found.part.offset - SMA.size - 1, SMA.size / 2));
  } else {
    const last = found.kind === 'part' && found.part.kind === 'leaded' ? 3 : 2;
    for (let at = 1; at < last; at += 1) words[at] = shift(words[at] ?? '');
  }
  const text = state.lines[item.line - 1] ?? '';
  const indent = /^\s*/.exec(text)?.[0] ?? '  ';
  return changed(state.source, { lines: insertLines([{ line: item.line + 1, text: `${indent}${id}: ${words.join(' ')}` }]) });
}

/** パレット。**殻が読むのは `data-type` と、2 端子の `data-ends`**。 */
export function renderPalette(): string {
  const rows = PALETTE.map(([type, name]) => {
    const kind = resolveKind(type);
    const ends = kind.ok && kind.value.kind === 'leaded' ? { 'data-ends': '2' } : {};
    const icon = partIcon(baseOf(type), { variant: type.includes('/') ? type.split('/')[1] ?? null : null }) ?? '';
    return element('li', {}, element(
      'button',
      { type: 'button', class: 'cf-pick', 'data-type': type, 'data-find': escapeMarkup(`${type} ${name}`.toLowerCase()), ...ends },
      `${icon}${escapeMarkup(name)} ${element('code', {}, escapeMarkup(type))}`,
    ));
  }).join('');
  return element('details', { class: 'cf-palette' },
    element('summary', {}, '部品を置く')
      + element('input', { type: 'search', class: 'cf-search', placeholder: '種類・名前で探す' })
      + element('ul', { class: 'cf-types' }, rows));
}

/** 種類の欄の候補。 */
export const renderTypeOptions = (id: string): string =>
  element('datalist', { id }, [...allTypes(), ...PALETTE.map(([type]) => type)]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => element('option', { value })).join(''));

/** 色の欄の候補 (ジャンパの被覆の色)。 */
export const renderColorOptions = (id: string): string =>
  element('datalist', { id }, wireColorNames().map((value) => element('option', { value })).join(''));
