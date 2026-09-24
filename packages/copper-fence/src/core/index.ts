import { normalizeNewlines, textWidth, wireColor } from 'fence-kit';
import type { Net } from 'fence-kit';
import { attachSourceText, fenceError, notice, safeToken, shiftErrors } from './errors.ts';
import { checkErc } from './erc/erc.ts';
import { couplingsOf } from './geometry/coupling.ts';
import { cutUnderChips } from './geometry/cut.ts';
import { islandsOf } from './geometry/islands.ts';
import { shapesOf } from './geometry/shapes.ts';
import type { Axis } from './geometry/shapes.ts';
import { farFromBoard, hasFrontGround } from './model/board.ts';
import { PX, createLayout } from './model/layout.ts';
import type { Bounds } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { smdSpecOf } from './parts/catalog.ts';
import { SMA, chipGeometry, footprintOf } from './parts/footprint.ts';
import type { Footprint } from './parts/footprint.ts';
import { renderGrid, renderIslands, renderPlate, renderRulers, renderVias } from './render/board.ts';
import {
  blockParts, boardDescription, renderCouplings, renderDescription, renderLineCaptions, renderPartLabels,
} from './render/captions.ts';
import { createPlacer } from './render/placer.ts';
import { renderBack } from './render/back.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner } from './render/errorHtml.ts';
import { listSize, partsListing, renderList, renderSource, sourceListing, sourceSize } from './render/lists.ts';
import { noteBounds, noteColor, renderNotes } from './render/notes.ts';
import { renderHits, renderLineHits, renderShapeHits } from './render/hits.ts';
import { renderJumpers, renderPart } from './render/parts.ts';
import { resolveStyle } from './render/theme.ts';
import { renderTitle } from './render/title.ts';
import { endResolver, stripAt, wire } from './wiring/wiring.ts';
import type { CopperSpec, FenceError, LineSpec, Mm, PartSpec, ViaSpec, WireSpec } from './types.ts';
import { parsePoint } from './model/point.ts';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export type RenderResult = {
  /** それ自体で完結した SVG。**板は必ず描く** (読めなかった行があっても、読めた所まで)。 */
  readonly svg: string;
  /** 島・地・足から導いたネットリスト。**エスケープしていない生のデータ**。 */
  readonly netlist: readonly Net[];
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /** 読めてはいるが、思ったとおりには出ないところ。**ERC は入らない**。 */
  readonly notices: readonly FenceError[];
  /** ERC — 図のとおりに切って組んでも動かないところ。`style: check: off` の図では空。 */
  readonly erc: readonly FenceError[];
  /** 図の下に貼る帯の HTML。言うことが無ければ空文字列。**SVG には何も書き込まない**。 */
  readonly errorHtml: string;
};

export type RenderOptions = {
  /** 掴むための印を付ける (マップのエディタ用)。**既定では付けない**。 */
  readonly edit?: boolean;
  /** フェンスが始まる行 (Markdown の中での 1 始まり)。言うことの行番号を Markdown の行に直す。 */
  readonly offset?: number;
};

const colorOf = (name: string): string | null => wireColor(name);

/** 図に出る物の広がり (mm)。**板の外へ張り出す SMA と、その名札を含める**。 */
function boundsOf(footprints: readonly Footprint[], extra: readonly Mm[], labelMm: number, width: number, height: number): Bounds {
  let [minX, minY, maxX, maxY] = [0, 0, width, height];
  const take = (point: Mm): void => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  for (const footprint of footprints) {
    const { outline, part } = footprint;
    take({ x: outline.x, y: outline.y });
    take({ x: outline.x + outline.width, y: outline.y + outline.height });
    if (part.kind !== 'edge') continue;
    // 名札は胴の脇 (左右の SMA は上、上下の SMA は右)。
    const label = part.value === null ? part.id : `${part.id} ${part.value}`;
    const wide = (textWidth(label) * labelMm) + 1;
    if (part.side === 'left' || part.side === 'right') {
      take({ x: outline.x + outline.width / 2 - wide / 2, y: outline.y - labelMm - 1 });
      take({ x: outline.x + outline.width / 2 + wide / 2, y: outline.y });
    } else {
      take({ x: footprint.center.x + SMA.size / 2 + wide + 1, y: outline.y });
    }
  }
  for (const point of extra) take(point);
  return { minX, minY, maxX, maxY };
}

/**
 * 動かせる点 (マップの節点)。**線路の点、ジャンパの端、足のある部品の点で書いた端**。
 * そこを掴むと、同じ点を書いた物がまとめて動く (`movePoint`)。
 */
function editNodes(copper: readonly CopperSpec[], parts: readonly PartSpec[], wires: readonly WireSpec[]): Mm[] {
  // **点で書いた端だけ。** 島の名前で書いた端は `movePoint` が動かせない (島を動かす)。
  const written = (end: string): Mm[] => {
    const point = parsePoint(end);
    return point === null ? [] : [point];
  };
  return [
    ...copper.flatMap((spec) => (spec.kind === 'line' ? spec.points : [])),
    ...wires.flatMap((wire) => [...written(wire.from), ...written(wire.to)]),
    ...parts.flatMap((part) => (part.kind === 'leaded'
      ? part.ends.map((end) => parsePoint(end)).filter((point): point is Mm => point !== null)
      : [])),
  ];
}

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・ブラウザのどこからでも同じように呼べる。
 */
export function renderCopper(input: string, options: RenderOptions = {}): RenderResult {
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);
  const { doc } = parsed;
  const { board } = doc;
  const style = resolveStyle(doc.style);
  const { theme } = style;

  // 形 → チップの切れ目 → 島。**切ってから島を数える** (切れた線路は 2 つの島)。
  const made = shapesOf(doc.copper, board);
  const chips = doc.parts.flatMap((part) => {
    if (part.kind !== 'chip') return [];
    const spec = smdSpecOf(part.variant ?? '');
    if (spec === null) return [];
    const axis: Axis | null = part.orient === null ? null : part.orient.turn % 180 === 0 ? 'x' : 'y';
    return [{ part: part.id, at: part.at, axis, gap: chipGeometry(spec).gap }];
  });
  const cut = cutUnderChips(made.shapes, chips);
  // **表が地の板で、どの銅にも触れない via は地の一部** (via の列で表と裏の地を留める)。
  // 島にすると、地の中に溝で囲んだ輪を掘ることになる。
  const viaIds = new Set(doc.copper.filter((spec) => spec.kind === 'via').map((spec) => spec.id));
  const all = islandsOf(cut.shapes);
  const islands = hasFrontGround(board)
    ? all.filter((island) => !island.members.every((member) => viaIds.has(member)))
    : all;
  const resolve = endResolver(doc.copper, doc.parts);

  const footprints: Footprint[] = [];
  const placeErrors: FenceError[] = [];
  for (const part of doc.parts) {
    const found = footprintOf(part, board, cut.axes, resolve);
    if (!found.ok) {
      placeErrors.push(fenceError(found.reason, part.line, part.id));
      continue;
    }
    const off = found.value.pins.flatMap((pin) => pin.points).find((point) => farFromBoard(board, point) !== null);
    if (off !== undefined) {
      placeErrors.push(fenceError(`${safeToken(part.id)} が板から離れすぎです`, part.line, part.id));
      continue;
    }
    footprints.push(found.value);
  }

  const ground = { board, islands, slots: made.slots };
  const wiring = wire(ground, cut.shapes, footprints, doc.wires, resolve);
  const couplings = couplingsOf(cut.shapes, board);

  // 注釈は回路の一員ではないので、読めなくても図は出る。
  const noteErrors: FenceError[] = [];
  const notes = doc.notes.filter((note) => {
    const far = [note.from, note.to].find((point) => point !== null && farFromBoard(board, point) !== null);
    if (far === undefined) return true;
    noteErrors.push(fenceError('注釈の点が板から離れすぎです (板の外は 20mm まで)', note.line));
    return false;
  });
  const sourceNotes = options.edit === true ? [] : notes.filter((note) => note.kind === 'source');
  const listNotes = notes.filter((note) => note.kind === 'parts');
  for (const extra of [...sourceNotes.slice(1), ...listNotes.slice(1)]) {
    noteErrors.push(notice(`${extra.kind === 'source' ? '書き出し (source)' : '部品表 (parts)'} は 1 つだけ描きます (後のものは描いていません)`, extra.line));
  }

  // **読めなかったところがあるうちは ERC を掛けない** (書いた物について書き忘れを言うことになる)。
  const hardErrors = [...parsed.errors, ...made.errors, ...placeErrors, ...wiring.errors, ...noteErrors]
    .filter((error) => error.notice !== true);
  const checking = style.check && hardErrors.length === 0;
  const erc = checking
    ? checkErc({
      board, copper: doc.copper, footprints, landings: wiring.landings, jumpers: wiring.jumpers, islands, couplings,
      stripAt: (point) => stripAt(point, ground),
    })
    : [];
  const notChecked = style.check && hardErrors.length > 0
    ? [notice('読めなかったところがあるので ERC は掛けていません (直すと掛かります)', null)]
    : [];

  const listing = sourceNotes.length > 0 ? sourceListing(source) : [];
  const rows = listNotes.length > 0 ? partsListing(doc.parts) : [];
  const labelMm = (theme.metrics.textSize * 0.9) / PX;
  const layout = createLayout(board, {
    title: doc.title !== null,
    bounds: boundsOf(
      footprints,
      [
        ...wiring.jumpers.flatMap((jumper) => [jumper.from, jumper.to]),
        ...noteBounds(notes, theme, PX),
      ],
      labelMm,
      board.width,
      board.height,
    ),
    list: rows.length > 0 ? listSize(rows, theme) : null,
    source: listing.length > 0 ? sourceSize(listing, theme) : null,
    descriptionWidth: textWidth(boardDescription(board, doc.f)) * theme.metrics.textSize,
    // マップ (掴む図) には出さない — 掴むのは表だけ。
    back: style.back && options.edit !== true,
  });

  // SMA が板の辺を覆う範囲 (目盛の数字を描かない所)。
  const covered = (side: 'top' | 'left'): (readonly [number, number])[] => footprints
    .flatMap((footprint) => (footprint.part.kind === 'edge' && footprint.part.side === side
      ? [[footprint.part.offset - SMA.size / 2 - 1, footprint.part.offset + SMA.size / 2 + 1] as const]
      : []));
  const lines = doc.copper.filter((spec): spec is LineSpec => spec.kind === 'line');
  const vias = doc.copper.filter((spec): spec is ViaSpec => spec.kind === 'via');
  const edit = options.edit === true;
  // 字は**名札 → 線路 → 隙間**の順に置き場を取る。胴は先に塞いでおく。
  const placer = createPlacer();
  blockParts(footprints, layout, placer);
  const labels = renderPartLabels(footprints, layout, theme, placer);
  const captions = renderLineCaptions(lines, cut.shapes, board, doc.f, layout, theme, placer)
    + renderCouplings(couplings, layout, theme, placer);

  // 板 → 銅 → 方眼 → 穴 → ジャンパ → 部品 → 字 → 注釈 → 目盛。**注釈は一番上**
  // (指したものが下に隠れると印の意味が無くなる)。
  const body = renderTitle(doc.title, layout, theme)
    + renderPlate(board, layout, theme, islands, made.slots)
    + renderIslands(islands, layout, theme)
    + (style.grid ? renderGrid(board, layout, theme) : '')
    + renderVias(vias, layout, theme)
    + (edit ? renderShapeHits(doc.copper, layout) + renderLineHits(lines, layout) : '')
    + renderJumpers(wiring.jumpers, layout, theme, colorOf, edit)
    + footprints.map((footprint) => renderPart(layout, footprint, theme, edit)).join('')
    + captions
    + labels
    + renderNotes(notes, layout, theme, colorOf)
    + renderRulers(board, layout, theme, { top: covered('top'), left: covered('left') })
    + renderDescription(board, doc.f, layout, theme)
    + renderBack({ board, layout, theme, islands, slots: made.slots, vias, footprints })
    + (layout.listBand === null ? '' : renderList(rows, layout.listBand, theme, noteColor(listNotes[0]!, theme, colorOf)))
    + (layout.sourceBand === null ? '' : renderSource(listing, layout.sourceBand, theme, noteColor(sourceNotes[0]!, theme, colorOf)))
    // 掴む層は**いちばん上** (升と節点)。
    + (edit ? renderHits(board, layout, editNodes(doc.copper, doc.parts, doc.wires)) : '');

  const svg = renderDocument(layout, body, { theme, width: style.width, stamp: style.stamp });

  const collected = [...parsed.errors, ...made.errors, ...placeErrors, ...wiring.errors, ...noteErrors, ...notChecked];
  const reported = attachSourceText(byLine(collected), source);
  const errors = reported.filter((error) => error.notice !== true);
  const notices = reported.filter((error) => error.notice === true);
  const at = (list: readonly FenceError[]): readonly FenceError[] => shiftErrors(list, options.offset ?? 0);
  const ercAt = attachSourceText(byLine(erc), source);
  const shown = style.debug ? [...at(errors), ...at(notices), ...at(ercAt)] : at(errors);
  return {
    svg,
    netlist: wiring.netlist,
    errors: at(errors),
    notices: at(notices),
    erc: at(ercAt),
    errorHtml: renderErrorBanner(shown),
  };
}

export { extractCopperFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Net } from 'fence-kit';
export { errorText } from './render/errorText.ts';
export { STAMP_TEXT, VERSION } from './version.ts';

// **殻へ渡す口。** 掴んで動かす editor はこの 1 つを受け取って動く (52 の docs/19)。
export { createCopperEditor } from './edit/fenceEditor.ts';
