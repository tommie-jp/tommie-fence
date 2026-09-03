import { renderBreadboard, errorText as breadboardErrorText } from 'breadboard-fence/core';
import { renderPerfboard, errorText as perfboardErrorText } from 'perfboard-fence/core';
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
    // **お知らせも必ず出す。** `style: debug: off` は図に添える帯を伏せる指定で、
    // ここは図の代わりに読むための場所 (CLI の `check` と同じ扱い)。
    messages: [...errors, ...notices].map(circuitText),
    broken: errors.length > 0,
    finishing: { notes, theme, width },
  };
}

export function render(kind: Kind, source: string): Output {
  if (kind === 'circuit') return renderCircuit(source);

  const { svg, netlist, errors, notices } =
    kind === 'breadboard' ? renderBreadboard(source) : renderPerfboard(source);
  const text = kind === 'breadboard' ? breadboardErrorText : perfboardErrorText;
  return {
    svg,
    tex: null,
    netlist: nets(netlist),
    messages: [...errors, ...notices].map(text),
    broken: errors.length > 0,
    finishing: null,
  };
}
