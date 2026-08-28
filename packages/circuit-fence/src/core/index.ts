import { fenceError } from './errors.ts';
import { buildCircuit } from './model/circuit.ts';
import { computeNets } from './model/nets.ts';
import type { Net } from './model/nets.ts';
import { parseFence } from './parser/parseFence.ts';
import { DEFAULT_THEME, resolveTheme } from './render/theme.ts';
import type { Theme } from './render/theme.ts';
import { generateTex } from './tex/generate.ts';
import type { FenceError, NoteOverlay, TexTarget } from './types.ts';

export type CompileResult = {
  /** 図にできたときの circuitikz TeX。1 つも描けなかったときは null。 */
  readonly tex: string | null;
  /** TeX の行 → 元の YAML の行。TeX が落ちたときに行番号を引き戻すのに使う。 */
  readonly lineMap: ReadonlyMap<number, number>;
  /** グリッドの導通から導いたネットリスト。図にできなかったときは空。 */
  readonly netlist: readonly Net[];
  /** 描き上がった SVG を塗り替えるための配色。 */
  readonly theme: Theme;
  /** 出力の横ドット数。指定が無ければ null (図のままの大きさ)。 */
  readonly width: number | null;
  /**
   * 描き上がった SVG に差し込む注釈の字。**塗り替えより先に**当てる
   * (色を書かなかった注釈は黒で出て、そのあと recolorSvg が文字色に塗り替える)。
   */
  readonly notes: readonly NoteOverlay[];
  /** 読めなかったところ。図が描けていても空とは限らない。 */
  readonly errors: readonly FenceError[];
  /**
   * 図は描けたが伝えたいこと (指定が効かなかった・つながりを決められない)。
   * 読めなかったわけではないので、CLI の終了コードには数えない。
   */
  readonly notices: readonly FenceError[];
};

const EMPTY_LINE_MAP: ReadonlyMap<number, number> = new Map();

/**
 * フェンスの中身 (YAML) を circuitikz TeX とネットリストにする。
 * DOM も Node も使わない同期の純関数なので、VS Code のプレビュー・CLI・
 * サーバー側描画のどこからでも同じように呼べる。
 */
export type CompileOptions = {
  /**
   * どの TeX 向けに組むか。省略時はフェンス (プレビューと CLI の SVG)。
   * `latex` にすると、フェンスでは断る日本語の値が通り、単位が siunitx で組まれ、
   * オペアンプが本物の記号になる。
   */
  readonly target?: TexTarget;
};

export function compileCircuit(source: string, options: CompileOptions = {}): CompileResult {
  const target = options.target ?? 'fence';
  const { doc, errors } = parseFence(source);

  if (doc === null) {
    return {
      tex: null,
      lineMap: EMPTY_LINE_MAP,
      netlist: [],
      theme: DEFAULT_THEME,
      width: null,
      notes: [],
      errors,
      notices: [],
    };
  }

  const { theme, messages } = resolveTheme(doc.style);
  // テーマ名が読めなかった理由は style: の行に付けたいが、ここには行が無い。
  // parseFence が項目ごとに行を付けているので、ここで出るのは名前の取り違えだけ。
  const themeErrors = messages.map((message) => fenceError(message, null));

  if (doc.parts.length === 0) {
    // 部品は書かれていたが 1 行も読めなかったのなら、その行の理由がもう出ている。
    // 「部品がありません」を足すと、直しに行く先の無いエラーが増えるだけ。
    const nothingWritten = errors.length === 0;
    return {
      tex: null,
      lineMap: EMPTY_LINE_MAP,
      netlist: [],
      theme,
      width: doc.style.width,
      notes: [],
      errors: nothingWritten
        ? [fenceError('部品がありません (parts: に「ID: 種類 番地 番地 値」を並べます)', null)]
        : [...errors, ...themeErrors],
      notices: [],
    };
  }

  const { circuit, errors: modelErrors, notices } = buildCircuit(doc, { target });
  const { tex, lineMap, messages: texMessages, notes } = generateTex(circuit, {
    style: doc.style,
    target,
    source: doc.source,
  });

  return {
    tex,
    lineMap,
    netlist: computeNets(circuit),
    theme,
    width: doc.style.width,
    notes,
    errors: [...errors, ...modelErrors, ...themeErrors],
    // 図は組めたが指定が効かなかったところ。行は style の項目に付けられない
    // ので (どの項目かは文面で分かる) 行なしで出す。
    notices: [...texMessages.map((message) => fenceError(message, null)), ...notices],
  };
}

export { recolorSvg, resizeSvg, scaleSvgToText, DEFAULT_THEME, LIGHT_THEME } from './render/theme.ts';
export { applyNotes } from './render/noteText.ts';
export { finishSvg, markSvg } from './render/finish.ts';
export { STAMP_TEXT, VERSION } from './version.ts';
export type { Theme } from './render/theme.ts';
export { errorLine, messageLine, renderErrorBanner, renderErrorCard } from './render/errorCard.ts';
export { shiftErrors } from './errors.ts';
export { renderNetlist } from './render/netlistHtml.ts';
export { extractCircuitFences, outputStem } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { Net } from './model/nets.ts';
export type { FenceError, NoteOverlay, TexTarget } from './types.ts';
export { standaloneTex } from './tex/generate.ts';
