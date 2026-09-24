import { renderBreadboard, errorText as breadboardErrorText } from 'breadboard-fence/src/core';
import { renderPerfboard, errorText as perfboardErrorText } from 'perfboard-fence/src/core';
import { renderCopper, errorText as copperErrorText } from 'copper-fence/src/core';
import { renderVna, errorText as vnaErrorText } from 'vna-fence/src/core';
import { compileCircuit, errorLine, snippetLines } from 'circuit-fence/src/core';
import type { FenceError } from 'circuit-fence/src/core';
import type { Kind } from './kinds.ts';
import type { Finishing } from './tex/index.ts';

/**
 * 3 つのコアを 1 つの入口にまとめる。**ここが唯一 3 つを知っている場所**で、
 * 画面 (`main.ts`) は種類を渡すだけ。
 *
 * どのコアも DOM も Node も知らない同期の純関数なので、そのままブラウザで動く。
 * 例外は circuit の**図だけ** — 描くには WASM の TeX が要る。ここでは TeX まで
 * 組んで返し、図にするのは `tex/` (非同期。資材を落としてから描く)。
 */

export type NetRow = { readonly name: string; readonly refs: readonly string[] };

export type Output = {
  /** それ自体で完結した SVG。組めなかったときと circuit は空。 */
  readonly svg: string;
  /** circuitikz の TeX。circuit 以外は null。 */
  readonly tex: string | null;
  readonly netlist: readonly NetRow[];
  /**
   * マーカーの読み値 (vna だけ。CLI の `check` と同じ字の行)。ほかは空。
   * vna にはネットリストが無いので、その場所に出す。
   */
  readonly readings: readonly string[];
  /** 読めなかったところと、お知らせ。CLI と同じ文面 (行番号・行の中身・印)。 */
  readonly messages: readonly string[];
  /** 読めなかったところがあったか (お知らせだけなら false)。 */
  readonly broken: boolean;
  /**
   * 描き上がった SVG に当てるもの (注釈・配色・幅)。circuit 以外は null。
   * **図を描くのは非同期**なので、描けてから `drawTex` がこれを当てる。
   * 拡張とまったく同じ後処理を通すため、中身はコアが決めたものをそのまま運ぶ。
   */
  readonly finishing: Finishing | null;
};

const nets = (netlist: readonly { name: string; refs: readonly string[] }[]): NetRow[] =>
  netlist.map((net) => ({ name: net.name, refs: net.refs }));

/**
 * circuit の報告は 2 つに分かれている (名札の行と、行の中身 + 印) ので、
 * CLI と同じ順で 1 つの文面に組む。breadboard / perfboard は `errorText` が
 * 組み上がったものを返す。
 */
const circuitText = (error: FenceError): string =>
  [errorLine(error), ...snippetLines(error)].join('\n');

function renderCircuit(source: string): Output {
  const { tex, netlist, errors, notices, notes, theme, width } = compileCircuit(source);
  return {
    svg: '',
    tex,
    netlist: nets(netlist),
    readings: [],
    // **お知らせも必ず出す。** `style: debug: off` は図に添える帯を伏せる指定で、
    // ここは図の代わりに読むための場所 (CLI の `check` と同じ扱い)。
    messages: [...errors, ...notices].map(circuitText),
    broken: errors.length > 0,
    finishing: { notes, theme, width },
  };
}

/**
 * vna。**`data:` (Touchstone) は読めない** — 頁は文書の隣のファイルに手が届かない。
 * コアが「この宿主では読めません」と言い、理想の模型だけを描く。
 */
function renderVnaOutput(source: string): Output {
  const { svg, readingLines, errors, notices } = renderVna(source);
  return {
    svg,
    tex: null,
    netlist: [],
    readings: readingLines,
    messages: [...errors, ...notices].map(vnaErrorText),
    broken: errors.length > 0,
    finishing: null,
  };
}

export function render(kind: Kind, source: string): Output {
  if (kind === 'circuit') return renderCircuit(source);
  if (kind === 'vna') return renderVnaOutput(source);

  const { svg, netlist, errors, notices } =
    kind === 'breadboard' ? renderBreadboard(source) : kind === 'copper' ? renderCopper(source) : renderPerfboard(source);
  const text = kind === 'breadboard' ? breadboardErrorText : kind === 'copper' ? copperErrorText : perfboardErrorText;
  return {
    svg,
    tex: null,
    netlist: nets(netlist),
    readings: [],
    messages: [...errors, ...notices].map(text),
    broken: errors.length > 0,
    finishing: null,
  };
}
