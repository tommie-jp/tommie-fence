import { normalizeNewlines } from 'fence-kit';
import { attachSourceText } from './errors.ts';
import { createLayout } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { renderBoard } from './render/board.ts';
import { renderParts } from './render/parts.ts';
import { renderWires } from './render/wires.ts';
import { netlistOf, resolveWires } from './wiring/wiring.ts';
import { parseAddress } from './model/address.ts';
import { offBoardReason } from './model/board.ts';
import { fenceError, safeToken } from './errors.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { THEME } from './render/theme.ts';
import type { Address, FenceError } from './types.ts';
import type { Net } from 'fence-kit';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export type RenderResult = {
  /**
   * それ自体で完結した SVG。外部リソースもスクリプトも参照しない。
   * **図が 1 つも組めなかったときは空文字列**で、言うことは `errorHtml` に入る。
   */
  readonly svg: string;
  /**
   * 穴と配線から導いたネットリスト。意図した回路との突き合わせに使える。
   * svg と違い**エスケープしていない生のデータ**なので、画面に出す側で必ず
   * エスケープすること。
   */
  readonly netlist: readonly Net[];
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /** 読めてはいるが、思ったとおりには出ないところ。 */
  readonly notices: readonly FenceError[];
  /**
   * 図の下に貼る帯 (図は描けた) か、カード (読めなかった) の HTML。
   * 言うことが無ければ空文字列。**図の SVG には何も書き込まない**ので、
   * 書き出した SVG を貼ったときに報告が付いてこない。
   */
  readonly errorHtml: string;
};

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・サーバー側描画のどこからでも同じように呼べる。
 *
 * **Phase 3 で描けるのは板・穴・2 本足の部品・配線まで。** ERC は Phase 4、
 * 注釈と CLI は Phase 6 で入る (52 の docs/05)。
 */
export function renderPerfboard(input: string): RenderResult {
  // 外から来た字は、読む前に改行を揃える。行数は変わらないので行番号はそのまま。
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);

  if (!parsed.doc) {
    const errors = attachSourceText(parsed.errors, source);
    return { svg: '', netlist: [], errors, notices: [], errorHtml: renderErrorCard(errors) };
  }

  const { board } = parsed.doc;
  const layout = createLayout(board);
  const placement = placeParts(parsed.doc.parts, board);

  const pointErrors: FenceError[] = [];
  const points = new Map<string, Address>();
  const named: [Address, string][] = [];
  for (const { name, written, line } of parsed.doc.points) {
    const address = parseAddress(written);
    const reason = address === null
      ? `穴の番地として読めません: ${safeToken(written)}`
      : offBoardReason(board, address);
    if (address === null || reason !== null) {
      pointErrors.push(fenceError(reason ?? '', line, written));
      continue;
    }
    points.set(name, address);
    named.push([address, name]);
  }

  const wiring = resolveWires(parsed.doc.wires, points, board);
  const netlist = netlistOf(placement.parts, wiring.wires, named);

  // 配線は板の上、部品の下。線が部品の胴を隠すと、何が載っているか読めなくなる。
  const svg = renderDocument(
    layout,
    renderBoard(board, layout, THEME)
      + renderWires(wiring.wires, layout, THEME)
      + renderParts(placement.parts, layout, THEME),
  );

  // **行順に並べる。** 段ごとに集めた順のままだと、帯の打ち切り (8 件) で
  // 後ろの段の報告から先に消え、行を追って直せなくなる。
  const collected = [...parsed.errors, ...pointErrors, ...placement.errors, ...wiring.errors];
  const reported = attachSourceText(byLine(collected), source);
  const errors = reported.filter((error) => error.notice !== true);
  const notices = reported.filter((error) => error.notice === true);
  return { svg, netlist, errors, notices, errorHtml: renderErrorBanner(reported) };
}

export { extractPerfboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Net } from 'fence-kit';
export { VERSION } from './version.ts';
