import { LIMITS } from '../limits.ts';
import { DEFAULT_PITCH, cornerOf, formatAddress, texNameOfAddress, toPoint } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { wireContacts } from '../model/circuit.ts';
import type { Circuit } from '../model/circuit.ts';
import { lookupPartType, optionsFor, symbolFor } from '../parts.ts';
import type { SourceInner } from '../parts.ts';
import { EMPTY_STYLE } from '../parser/style.ts';
import { cellOf as addressOf, nodeNameOf, texNameOfEndpoint } from '../types.ts';
import type {
  MultiTerminalPart, NoteOverlay, PartSpec, StyleSpec, TexTarget, TwoTerminalPart, OneTerminalPart,
} from '../types.ts';
import {
  drawNote, drawStamp, drawTitle, listingOf, noteColorLines, noteNeeds, noteOverlays,
} from './drawNotes.ts';
import { escapeTex, hasUnicode } from './escape.ts';
import { isMathLabel, mathInnerOf, mathLabelTex } from './mathLabel.ts';
import { num } from './num.ts';

/**
 * 生成した TeX と、その行が元の YAML の何行目から来たかの対応。
 * TeX が落ちたときに、TeX の行番号を書き手の行番号へ引き戻すのに使う。
 */
export type TexOutput = {
  readonly tex: string;
  /** TeX の行 (1 始まり) → YAML の行。定型と座標の行は載らない。 */
  readonly lineMap: ReadonlyMap<number, number>;
  /** 図は組めたが、そのときに伝えることがあれば (グリッドが広すぎるなど)。 */
  readonly messages: readonly string[];
  /**
   * 描き上がった SVG に差し込む注釈の字。**書いた順**に、TeX が置いた目印へ当てる
   * (render/noteText.ts)。書き出す `.tex` は字を TeX に組ませるので空。
   */
  readonly notes: readonly NoteOverlay[];
};

export type GenerateOptions = {
  readonly pitch?: number;
  readonly style?: StyleSpec;
  /** 省略時はフェンス (プレビューと CLI の SVG)。 */
  readonly target?: TexTarget;
  /**
   * フェンスの中身そのもの。`- source` の注釈が図に書き出す。
   * 書き写すのではなくここから作るので、フェンスを直すと書き出しも動く。
   */
  readonly source?: string;
};

/** 既定の線の太さ (pt)。実機コンパイルを確認した値。 */
const DEFAULT_WIRE_WIDTH = 0.8;

/** 既定の記号の流儀。実機で検証したのは american のほう。 */
const DEFAULT_STANDARD = 'american';

/**
 * 2 端子の記号の長さ (cm)。丸い電源の中身を描くのにも要るので定数にしてある
 * (circuitikz の記号の大きさはこの長さに対する割合で決まる)。
 */
const BIPOLE_LENGTH = 1.2;

/**
 * グラウンドの記号の中の、横棒 3 本の間隔 (pt)。**記号の側で決め打ち**で、
 * 線の太さでは変わらない (circuitikz 1.0 / 1.6.6 とも実測)。
 */
const GROUND_BAR_SPACING = 1.991;

/**
 * 横棒の太さ = 線の太さ × これ (circuitikz の `monopoles/ground/thickness` の既定)。
 * 棒だけが線と一緒に太るので、線を太くすると隙間が先に無くなる。
 */
const GROUND_BAR_THICKNESS = 2;

/** 横棒の間に残したい白 (pt)。circuitikz の既定の線 (0.4pt) で残る隙間に合わせた。 */
const GROUND_BAR_GAP = 1.1;

/**
 * グラウンドの記号を広げる倍率。
 *
 * 3 本の横棒の間隔は記号の側で決まっているのに、棒の太さは線に付いてくる。
 * 既定の 0.8pt では隙間が棒の 1/4 しか残らず、**棒が 1 つの塊に見える**。
 * 棒どうしの白が残る大きさまで記号を広げる (細い線なら既定のまま = 1)。
 *
 * 太さのほう (`monopoles/ground/thickness`) を細くする手もあるが、
 * 線が太いほど棒が相対的に細くなり、記号だけ痩せて見える。
 * 大きさを変えるほうが、線の太さによらず同じ形で出る。
 */
const groundScale = (wireWidth: number): number => {
  const wanted = (GROUND_BAR_THICKNESS * wireWidth + GROUND_BAR_GAP) / GROUND_BAR_SPACING;
  return Math.max(1, Math.round(wanted * 100) / 100);
};

/**
 * 標準の TeX フォントに字形が無い字を組むフォント。
 * 書き出す `.tex` に、そういう字が実際に出てくるときだけ書く
 * (**この 1 行だけが相手の環境で落ちうる**ので、要らないなら書かない)。
 */
const UNICODE_FONT = 'Noto Sans CJK JP';

/** 書き出しを等幅で組むフォント。日本語も等幅で持っているものを選ぶ。 */
const MONO_FONT = 'Noto Sans Mono CJK JP';

const monoFontLines = (): string[] => [
  '% 書き出しの等幅フォント。手元に無ければこの 1 行を書き換えてください。',
  `\\newfontfamily\\circuitmono{${MONO_FONT}}`,
  '\\newcommand{\\circuitsource}[1]{{\\circuitmono #1}}',
];

const unicodeFontLines = (): string[] => [
  '\\usepackage{fontspec}',
  '% 日本語などのフォント。手元に無ければこの 1 行を書き換えてください。',
  `\\newfontfamily\\circuitunicode{${UNICODE_FONT}}`,
  '\\newcommand{\\circuittext}[1]{{\\circuitunicode #1}}',
];

/**
 * 実機コンパイルを確認した定型。
 * circuitikz 1.0 (フェンス側 WASM) で通る書き方だけを使う。
 * 書き出す `.tex` はそこにパッケージを足すだけで、図の中身は同じ。
 */
const headerOf = (
  style: StyleSpec,
  target: TexTarget,
  needsUnicode: boolean,
  needsMono: boolean,
  needsArrows: boolean,
  colors: readonly string[],
  groundWidening: number,
  hasVoltage: boolean,
): string[] => [
  '\\usepackage{circuitikz}',
  // オペアンプの ± をアンカーからずらして置くのに要る。
  '\\usetikzlibrary{calc}',
  // 指し棒の先端の形。**要るときだけ**書く (図に入る書き方を増やさない。約束 6)。
  ...(needsArrows ? ['\\usetikzlibrary{arrows.meta}'] : []),
  // フェンスの TeX には siunitx が無い (実測)。書き出すほうでだけ使う。
  ...(target === 'latex' ? ['\\usepackage{siunitx}'] : []),
  ...(target === 'latex' && needsUnicode ? unicodeFontLines() : []),
  ...(target === 'latex' && needsMono ? monoFontLines() : []),
  ...colors,
  '\\begin{document}',
  `\\begin{circuitikz}[${style.standard ?? DEFAULT_STANDARD}, line width=${num(style.wireWidth ?? DEFAULT_WIRE_WIDTH)}pt]`,
  `\\ctikzset{bipoles/length=${num(BIPOLE_LENGTH)}cm}`,
  // グラウンドがあって、線が太くて棒が潰れるときだけ書く
  // (図に入る書き方を無条件には増やさない。約束 6)。
  ...(groundWidening > 1 ? [`\\ctikzset{grounds/scale=${num(groundWidening)}}`] : []),
  // 電圧の + と − を素子側へ寄せ、字のほうは記号から少し離す。既定のままだと
  // 符号が 2 マス先の端に付き (どの素子の電圧か読めない)、字は記号にくっつく。
  // **電圧があるときだけ**書く (約束 6)。どちらの値も実機で見て決めた
  // (1.0 と手元の LaTeX で同じ形になることも確認)。
  ...(hasVoltage
    ? ['\\ctikzset{voltage/distance from node=.7}', '\\ctikzset{voltage/american label distance=1.4}']
    : []),
];

const FOOTER = ['\\end{circuitikz}', '\\end{document}'];

/**
 * 生成した TeX を、LaTeX にそのまま渡せる 1 本の原稿にする。
 * フェンス側 (node-tikzjax) は文書クラスを自分の側で用意しているので、
 * 生成する本体には `\documentclass` を書かない。書き出すときだけ足す。
 *
 * 書き出す `.tex` は紙に貼る前提なので余白を少し取る。フェンスのほうは
 * 描いた SVG をそのまま並べるので、余白を足すと図がずれる。
 */
export const standaloneTex = (tex: string, target: TexTarget): string =>
  `\\documentclass${target === 'latex' ? '[border=2mm]' : ''}{standalone}\n${tex}`;

/**
 * 図に出る字を組む。**書き方は 2 通りで、置き場所は 3 つ** (ID の代わりの
 * `l=`、電流の `i=`、電圧の `v=`)。どこでも同じ読み方をする。
 *
 * - `$…$` で囲めば数式の部分集合。教科書と同じ綴りをそのまま書ける
 *   (`$\dot{E}$`)。**生の TeX は渡さず読み直して組み直す** (mathLabel.ts)
 * - 囲まなければ回路図の慣習どおり、先頭 1 文字が本体・残りが添字
 *   (`R1` → R の添字 1、`Rload` → R の添字 load)
 *
 * 読めない `$…$` はここまで来ない (model/circuit.ts が落として ID に戻す)。
 * それでも来たときのために**必ず `fallback` (部品 ID) に落とす** — ID は
 * 英数字と `_` `-` に限ってあるので、書き手の書いた TeX が図へ漏れる道が無い。
 * 落とし先をここに置いておけば、この関門は 1 つのファイルの中で閉じる。
 */
function labelOf(written: string, fallback: string): string {
  if (isMathLabel(written)) {
    const read = mathLabelTex(mathInnerOf(written));
    return read.ok ? `$${read.tex}$` : labelOf(fallback, fallback);
  }

  // 標準の TeX フォントに字形が無い字は、積んだフォントの側で組む (値と同じ)。
  // 数式で組むと、フォントが無いときに例外ではなくプロセスごと落ちる。
  if (hasUnicode(written)) return `\\circuittext{${escapeTex(written)}}`;

  const [first = '', ...rest] = [...written];
  const subscript = rest.join('');
  return subscript.length === 0
    ? `$${escapeTex(first)}$`
    : `$${escapeTex(first)}_{${escapeTex(subscript)}}$`;
}

// 数値 + SI 接頭辞。ここに当てはまるときだけ種類から単位を補う。
const SCALED_VALUE = /^(\d+(?:\.\d+)?)([kMGmunp]?)$/;

/** SI 接頭辞の siunitx での綴り。書き出す `.tex` でだけ使う。 */
const SI_PREFIXES: Readonly<Record<string, string>> = {
  k: '\\kilo', M: '\\mega', G: '\\giga', m: '\\milli', u: '\\micro', n: '\\nano', p: '\\pico',
};

/** 部品の種類から来る単位。書き出す `.tex` は siunitx に組ませる。 */
type Unit = { readonly tex: string | null; readonly si: string | null };

const NO_UNIT: Unit = { tex: null, si: null };

const unitOf = (typeName: string): Unit => {
  const type = lookupPartType(typeName);
  return type === null ? NO_UNIT : { tex: type.unitTex, si: type.unitSi };
};

/**
 * 値に単位を補う。`10k` (抵抗) → 10 kΩ。
 * 当てはまらない書き方 (型番の `1N4148`、定格の `3A` など) は書かれたとおりに出す
 * (単位を勝手に足すと嘘になる)。数式モードに置くので、
 * そのままだと `1N4148` の N が変数扱いで斜体になる。立体で組む。
 */
function annotationOf(value: string, unit: Unit, target: TexTarget): string {
  // 標準の TeX フォントに字形が無い字は、積んだフォントの側で組む。
  // フェンスにはこういう値が来ない (検証が値を落としている)。
  //
  // ここを target で分けないのは**わざと**。万一フェンスに来たとき、
  // \circuittext は定義が無いので TeX が「知らない命令」で止まり、
  // ログから行を引き戻せる。数式で組んでしまうと、フォントが無いときに
  // 例外ではなくプロセスごと落ちる (実測)。捕まえられる失敗のほうを選ぶ。
  if (hasUnicode(value)) return `\\circuittext{${escapeTex(value)}}`;

  const matched = unit.tex === null ? null : SCALED_VALUE.exec(value);
  if (!matched) return `$\\mathrm{${escapeTex(value)}}$`;

  const [, digits = '', prefix = ''] = matched;
  // siunitx なら u が µ で出る。フェンスには siunitx が無いので字のまま出す。
  if (target === 'latex' && unit.si !== null) {
    return `\\qty{${digits}}{${SI_PREFIXES[prefix] ?? ''}${unit.si}}`;
  }

  const scale = prefix === '' ? '' : `\\mathrm{${prefix}}`;
  return `$${digits}\\,${scale}${unit.tex ?? ''}$`;
}

/** 図に出てくる交点それぞれに、そこへ集まっている端の数。使われた順に並ぶ。 */
function cellsOf(circuit: Circuit): Map<string, { readonly address: Address; ends: number }> {
  const seen = new Map<string, { readonly address: Address; ends: number }>();
  const add = (address: Address): void => {
    const name = formatAddress(address);
    const found = seen.get(name);
    if (found) found.ends += 1;
    else seen.set(name, { address, ends: 1 });
  };

  for (const part of circuit.parts) {
    if (part.kind === 'two-terminal') {
      add(part.from);
      add(part.to);
    } else {
      add(part.at);
    }
  }

  // 同じ 2 点を結ぶ配線が 2 本書かれていても、集まっている端は 1 つと数える。
  // 二重に数えると、ただの曲がりに黒丸が出てしまう。
  const counted = new Set<string>();
  for (const wire of circuit.wires) {
    const from = addressOf(wire.from);
    const to = addressOf(wire.to);

    // 並べ替えない。`a3 -| c5` と `c5 -| a3` は曲がる場所が違う別の線なので、
    // 同じ鍵にすると片方が数えられずに黒丸が消える。
    const ends = `${texNameOfEndpoint(wire.from)}${wire.operator}${texNameOfEndpoint(wire.to)}`;
    if (counted.has(ends)) continue;
    counted.add(ends);

    // 足 (`U1.out`) は格子の上に無いので、交点としては数えない。
    if (from !== null) add(from);
    if (to !== null) add(to);

    // 曲がり角は線が入って出ていくので端 2 つぶん。ここに部品の端が乗ると
    // 合わせて 3 つになり、分岐として黒丸が付く (曲がるだけなら 2 つのまま)。
    const corner = from === null || to === null ? null : cornerOf(from, to, wire.operator);
    if (corner !== null) {
      add(corner);
      add(corner);
    }
  }

  // 端が配線の途中に乗っているところ (T 字)。線が通り抜けているぶんの
  // 端 2 つを足すと、乗っている端と合わせて 3 つになり、分岐として黒丸が付く。
  for (const contact of wireContacts(circuit)) {
    add(contact.cell);
    add(contact.cell);
  }

  return seen;
}

/**
 * 分岐に打つ黒丸。端が 3 つ以上集まったところだけ。
 * 2 つは通過か曲がりなので打たない (打つと線がただ太って見える)。
 * circuitikz は線が交わっただけでは黒丸を出さないので、こちらで置く。
 */
const JUNCTION_ENDS = 3;

/**
 * `plain amp` に書き足す ± の大きさ (TikZ の単位) と、アンカーからのずらし。
 * 実物の回路図 (三角形の高さに対して控えめ、左辺から離して内側に置く) に
 * 寄せた値。縮めても読める下限でもある。
 */
const SIGN_BAR = 0.28;
const SIGN_DX = 0.44;

/**
 * ± を置く高さ。足のアンカーから、**もう一方の足のほうへ**この割合だけ寄せる。
 * 外へ寄せると三角形の縁と足の線に挟まれて、どちらの足の印か読めなくなる。
 * 割合で書くのは、向き (`+up`) で足が入れ替わっても付いていくため。
 */
const SIGN_SHIFT = 0.22;

/**
 * オペアンプの ± を線で描く。
 *
 * 字では書かない。フェンス側のフォントでは `$-$` が別の字形 (ドット付きの i)
 * になり、テキストの `{-}` は + に対して細くて短く、釣り合わない (どちらも実測)。
 * 線なら太さも長さも + と揃い、線の太さの指定にも一緒に従う。
 */
function amplifierSigns(name: string): string[] {
  const bar = num(SIGN_BAR);
  const dx = num(SIGN_DX);
  const shift = num(SIGN_SHIFT);
  // 足から足へ引いた線の上で、足の側に寄せた点 (calc の !割合! で取る)。
  const plus = `($(${name}.+)!${shift}!(${name}.-)$)`;
  const minus = `($(${name}.-)!${shift}!(${name}.+)$)`;

  return [
    // + は横棒と縦棒。縦棒は横棒の真ん中から上下へ伸ばす。
    `\\draw ($${plus}+(${dx},0)$) -- ++(${bar},0);`,
    `\\draw ($${plus}+(${num(SIGN_DX + SIGN_BAR / 2)},${num(-SIGN_BAR / 2)})$) -- ++(0,${bar});`,
    // - は横棒だけ。+ と同じ長さ・同じ太さになる。
    `\\draw ($${minus}+(${dx},0)$) -- ++(${bar},0);`,
  ];
}

/** 丸い電源の記号の直径 (記号の長さに対する割合)。circuitikz の esource と同じ。 */
const SOURCE_CIRCLE = 0.6;

/**
 * 丸い電源の中身の大きさ (TikZ の単位)。波はここを半周期ぶんの幅として描く。
 * circuitikz が丸の中に描いているのと同じ値 (半径の半分) にしてあるので、
 * 記号を置き換えても大きさは変わらず、向きだけが変わる。
 */
const SOURCE_UNIT = SOURCE_CIRCLE * BIPOLE_LENGTH / 4;

/** 直流電源の + と - の、横棒の長さと丸の真ん中からのずらし (TikZ の単位)。 */
const SOURCE_SIGN_BAR = 0.2;
const SOURCE_SIGN_GAP = 0.17;

type Point = { readonly x: number; readonly y: number };

/** 直流電源の + と -。オペアンプの ± と同じで、字ではなく線で描く。 */
function directCurrentSigns(mid: Point, ux: number, uy: number): string[] {
  const gap = SOURCE_SIGN_GAP;
  const half = SOURCE_SIGN_BAR / 2;
  const bar = num(SOURCE_SIGN_BAR);
  // 先に書いた番地が + 側 (ecap や battery と同じ約束)。
  const plus = { x: mid.x - ux * gap, y: mid.y - uy * gap };
  const minus = { x: mid.x + ux * gap, y: mid.y + uy * gap };

  return [
    `\\draw (${num(plus.x - half)},${num(plus.y)}) -- ++(${bar},0);`,
    `\\draw (${num(plus.x)},${num(plus.y - half)}) -- ++(0,${bar});`,
    // - は横棒だけ。+ と同じ長さ・同じ太さになる。
    `\\draw (${num(minus.x - half)},${num(minus.y)}) -- ++(${bar},0);`,
  ];
}

/**
 * 丸い電源の中身を描く。circuitikz の記号は中身を 90 度回して描くので
 * (parts.ts の「電源」の頭)、丸だけの `esource` に自分で描き足す。
 *
 * 波形は**図の座標系にまっすぐ**描く。縦にも斜めにも置ける記法なので、
 * 記号と一緒に波を回すと読めなくなる (circuitikz が計器にしているのと同じ
 * 扱い。straight instruments)。+ と - だけは配線の向きに沿って並べる。
 */
function sourceInner(inner: SourceInner, from: Point, to: Point): string[] {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  // 番地が同じなら記号そのものが出ない。中身も描かない。
  if (span === 0) return [];

  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  // 波はどれも丸の左端から右端まで、1 周期ぶん。
  const start = `\\draw (${num(mid.x - SOURCE_UNIT)},${num(mid.y)})`;
  const one = num(SOURCE_UNIT);
  const up = num(SOURCE_UNIT / 2);
  const down = num(-SOURCE_UNIT / 2);

  switch (inner) {
    case 'dc':
      return directCurrentSigns(mid, (to.x - from.x) / span, (to.y - from.y) / span);
    case 'sine':
      return [`${start} sin ++(${up},${up}) cos ++(${up},${down}) sin ++(${up},${down}) cos ++(${up},${up});`];
    case 'square':
      return [
        `${start} -- ++(0,${one}) -- ++(${one},0) -- ++(0,${num(-2 * SOURCE_UNIT)})`
        + ` -- ++(${one},0) -- ++(0,${one});`,
      ];
    case 'triangle':
      return [
        `${start} -- ++(${up},${num(0.75 * SOURCE_UNIT)}) -- ++(${one},${num(-1.5 * SOURCE_UNIT)})`
        + ` -- ++(${up},${num(0.75 * SOURCE_UNIT)});`,
      ];
  }
}

/**
 * グリッドの点の濃さ。行英字・列数字は同じ色をそのまま (濃く) 使うので、
 * 点だけをこのぶん薄める。図の主役は回路で、点は位置の目安でしかない。
 */
const GRID_DOT_OPACITY = 0.35;

/** 書かれた向き → circuitikz のオプション。綴りを知っているのはここだけ。 */
const ORIENTATION_TEX: Readonly<Record<string, string>> = {
  '+up': 'noinv input up',
  '+down': 'noinv input down',
};

/**
 * 部品を置ける位置を見せるグリッド。ブレッドボードと同じで、
 * 行は左に英字、列は上に数字を書く。
 *
 * 回路より薄く見えるよう gray で描く (描き上がった SVG で色を差し替えるときの
 * 目印でもある。render/theme.ts が gray をグリッドの色に塗り替える)。
 *
 * **点と字は同じ色を濃さで分ける**。点は位置を示すだけなので薄く、
 * 行英字と列数字は読むものなので濃く出す。色を 2 つ持たずに不透明度で分けると、
 * `grid-color` の 1 つの指定でどちらも決まる。
 */
function drawGrid(
  cells: ReadonlyMap<string, { readonly address: Address }>,
  style: StyleSpec,
  pitch: number,
  messages: string[],
): string[] {
  const used = [...cells.values()].map((cell) => cell.address);
  const corner = style.gridTo;

  // 使っている番地を覆う範囲。grid-to が書いてあれば、そこまで広げる
  // (部品を動かす先が見えるように)。
  // 点は交点の上にだけ打つ (間の番地に点を打つと、格子と番地の対応が崩れる)。
  // 間に置いた部品まで覆えるように、はみ出したぶんは次の交点まで切り上げる。
  const lastRow = Math.ceil(Math.max(0, ...used.map((cell) => cell.row), corner?.row ?? 0));
  const lastCol = Math.ceil(Math.max(0, ...used.map((cell) => cell.col), corner?.col ?? 0));

  const wanted = (lastRow + 1) * (lastCol + 1);
  if (wanted > LIMITS.gridCells) {
    // 描けないぶんを黙って間引くと、点の間隔が番地と合わなくなって嘘になる。
    // グリッドだけ諦めて、回路はそのまま描く。
    messages.push(
      `グリッドが広すぎます (${wanted} 点。${LIMITS.gridCells} 点まで)。grid-to を狭めてください`,
    );
    return [];
  }

  const xs: number[] = [];
  for (let col = 0; col <= lastCol; col += 1) xs.push(col * pitch);
  const ys: number[] = [];
  for (let row = 0; row <= lastRow; row += 1) ys.push(-row * pitch);

  const dotSize = num(Math.max(0.4, pitch * 0.55));
  const margin = num(pitch * 0.42);

  const columnLabels = xs.map(
    (x, col) => `\\node[gray, font=\\scriptsize] at (${num(x)},${margin}) {${col + 1}};`,
  );
  const rowLabels = ys.map(
    (y, row) =>
      `\\node[gray, font=\\scriptsize, anchor=east] at (-${margin},${num(y)}) {${formatAddress({ row, col: 0 })[0] ?? ''}};`,
  );

  return [
    `\\foreach \\x in {${xs.map(num).join(',')}} {\\foreach \\y in {${ys.map(num).join(',')}} {\\fill[gray, opacity=${num(GRID_DOT_OPACITY)}] (\\x,\\y) circle (${dotSize}pt);}}`,
    ...columnLabels,
    ...rowLabels,
  ];
}

function drawTwoTerminal(part: TwoTerminalPart, target: TexTarget, pitch: number): string[] {
  // ラベルは `l_` (下・左)、値は `a^` (上・右) と向かい合わせに置く。
  // どちらも既定の側に置くと、LED のように上へ張り出す記号とラベルが重なる
  // (回路図の定石。実機で重なりを確認して決めた)。
  const type = lookupPartType(part.type);
  // 種類そのものに要るオプション (抵抗計の Ω など) は記号のすぐ後ろ。
  const options = [symbolFor(part.type, target), ...optionsFor(part.type, target)];
  // 足を指せる種類だけ、記号そのものに名前を付ける (`P1.w` の行き先になる)。
  // 指せない種類にまで付けると、要らない名前で TeX が太る。
  if (type?.pins !== undefined) options.push(`n=${nodeNameOf(part.id)}`);
  // 記号だけでは見分けが付かない種類は、ID の下にもう 1 行書く (`l2_` は
  // 2 行を組んで下に置く circuitikz の書き方。`and` が行の区切り)。
  // ラベルを書いてあれば図ではそちらを出す。配線から指す名前もネット名も ID のまま。
  const label = labelOf(part.label ?? part.id, part.id);
  options.push(type?.mark === undefined ? `l_=${label}` : `l2_=${label} and ${type.mark}`);
  if (part.value !== null) options.push(`a^=${annotationOf(part.value, unitOf(part.type), target)}`);
  // 電流の矢は from → to、電圧の + は from の側。**どちらも極性と同じ規則**
  // (先に書いた番地が + 側) なので、書き手が覚えることは増えない。
  // 綴りは 1.0 (フェンス) と 2023 (手元の LaTeX) の両方で同じ図になると実測済み。
  if (part.current !== null) options.push(`i>^=${labelOf(part.current, part.id)}`);
  // 値・電流と同じ側に出るので、並べて書けないことはパーサが弾いている。
  if (part.voltage !== null) options.push(`v^>=${labelOf(part.voltage, part.id)}`);

  const drawn = `\\draw (${texNameOfAddress(part.from)}) to[${options.join(', ')}] (${texNameOfAddress(part.to)});`;
  if (type?.inner === undefined) return [drawn];

  return [drawn, ...sourceInner(type.inner, toPoint(part.from, pitch), toPoint(part.to, pitch))];
}

function drawOneTerminal(part: OneTerminalPart, target: TexTarget): string {
  const at = texNameOfAddress(part.at);
  const symbol = symbolFor(part.type, target);
  const id = escapeTex(part.id);

  // 名前の出し方は種類ごとに決まっている (parts.ts の idLabel)。
  // 端子は白丸の横に添え、電源レールは記号そのものの文字として出す。
  // グラウンドのように名前を持たない記号は記号だけ。
  switch (lookupPartType(part.type)?.idLabel) {
    case 'beside':
      return `\\draw (${at}) node[${symbol}]{} node[above left]{${id}};`;
    case 'inside':
      return `\\node[${symbol}] at (${at}) {${id}};`;
    default:
      return `\\node[${symbol}] at (${at}) {};`;
  }
}

/**
 * 多端子部品。1 つの交点に記号を置き、足は circuitikz のアンカーに任せる。
 *
 * フェンスではオペアンプだけ記号を差し替えている (`op amp` はフォントが無くて
 * 落ちる)。`plain amp` は三角形しか描かないので、± を普通のノードとして
 * 書き足す。位置は実機で詰めた値。
 * 書き出す `.tex` は本物の `op amp` を使うので、書き足しは要らない。
 */
function drawMultiTerminal(part: MultiTerminalPart, target: TexTarget): string[] {
  const type = lookupPartType(part.type);
  const symbol = symbolFor(part.type, target);
  // 種類そのものに要るオプション (DIP の足の本数) が先、書かれた向きが後。
  const options = [symbol, ...optionsFor(part.type, target)];
  const turned = part.orientation === null ? null : ORIENTATION_TEX[part.orientation];
  if (turned !== undefined && turned !== null) options.push(turned);
  const at = texNameOfAddress(part.at);
  const name = nodeNameOf(part.id);
  const annotation = part.value === null ? null : annotationOf(part.value, NO_UNIT, target);
  // 箱で描く IC は型番を中に書く (回路図の慣習どおり)。
  const inside = type?.valueInside === true ? (annotation ?? '') : '';
  const node = `\\node[${options.join(', ')}] (${name}) at (${at}) {${inside}};`;
  // それ以外の型番は記号の南のアンカーに掛ける。`label=below:` はノードの
  // (空の) 文字を基準にするので、記号の体の上に字が乗る (実機で確認)。
  const number =
    annotation === null || type?.valueInside === true
      ? []
      : [`\\node[font=\\scriptsize, anchor=north] at (${name}.south) {${annotation}};`];
  if (symbol !== 'plain amp') return [node, ...number];

  return [node, ...number, ...amplifierSigns(name)];
}

const drawPart = (part: PartSpec, target: TexTarget, pitch: number): string[] =>
  part.kind === 'two-terminal'
    ? drawTwoTerminal(part, target, pitch)
    : part.kind === 'one-terminal'
      ? [drawOneTerminal(part, target)]
      : drawMultiTerminal(part, target);

/** 部品の値に、積んだフォントが要る字があるか。注釈の側は drawNotes.ts が見る。 */
/**
 * 図に出る字のうち、積んだフォントで組むものがあるか。
 * **値だけでなくラベルと矢の字も見る** — どれも同じ `\circuittext` で組むので、
 * 1 つでも見落とすと書き出した `.tex` にフォントの行が足りず、組んでも字が出ない。
 */
const valuesNeedUnicodeFont = (circuit: Circuit): boolean =>
  circuit.parts.some((part) => {
    if (part.kind === 'one-terminal') return false;
    const written = part.kind === 'two-terminal' ? [part.value, part.label, part.current, part.voltage] : [part.value];
    return written.some((text) => text !== null && hasUnicode(text));
  });

/**
 * 検証済みの図を circuitikz TeX にする。
 * 図の 1 行ごとに `% line N` を書き、TeX が落ちたときに元の行へ戻れるようにする。
 */
export function generateTex(circuit: Circuit, options: GenerateOptions = {}): TexOutput {
  const style = options.style ?? EMPTY_STYLE;
  const target = options.target ?? 'fence';
  const pitch = options.pitch ?? style.pitch ?? DEFAULT_PITCH;
  const lineMap = new Map<number, number>();
  const messages: string[] = [];
  const listing = listingOf(options.source ?? '');
  const needs = noteNeeds(circuit, listing);
  const lines = headerOf(
    style,
    target,
    valuesNeedUnicodeFont(circuit) || needs.unicodeFont,
    needs.monoFont,
    needs.arrowTips,
    noteColorLines(circuit, target),
    circuit.parts.some((part) => part.type === 'ground')
      ? groundScale(style.wireWidth ?? DEFAULT_WIRE_WIDTH)
      : 1,
    circuit.parts.some((part) => part.kind === 'two-terminal' && part.voltage !== null),
  );
  const cells = cellsOf(circuit);
  const byId = new Map(circuit.parts.map((part) => [part.id, part]));

  // グリッドは回路より先に描く (後から描くと部品の上に点が乗る)。
  if (style.grid === true) lines.push(...drawGrid(cells, style, pitch, messages));
  // 書いても効かない指定は、黙って捨てずに伝える。
  if (style.grid !== true && style.gridTo !== null) {
    messages.push('grid-to は grid: on のときに効きます');
  }

  for (const cell of cells.values()) {
    const { x, y } = toPoint(cell.address, pitch);
    lines.push(`\\coordinate (${texNameOfAddress(cell.address)}) at (${num(x)},${num(y)});`);
  }

  const drawings: { readonly tex: string; readonly line: number }[] = [
    ...circuit.parts.flatMap((part) => drawPart(part, target, pitch).map((tex) => ({ tex, line: part.line }))),
    ...circuit.wires.map((wire) => ({
      tex: `\\draw (${texNameOfEndpoint(wire.from)}) ${wire.operator} (${texNameOfEndpoint(wire.to)});`,
      line: wire.line,
    })),
  ];

  for (const drawing of drawings) {
    lines.push(`${drawing.tex} % line ${drawing.line}`);
    lineMap.set(lines.length, drawing.line);
  }

  for (const cell of cells.values()) {
    if (cell.ends >= JUNCTION_ENDS) lines.push(`\\node[circ] at (${texNameOfAddress(cell.address)}) {};`);
  }

  // 注釈はいちばん最後に描く。図の上に重ねる印と字なので、回路にも黒丸にも
  // 隠れないようにする。
  const notes = circuit.notes.flatMap((note) =>
    drawNote(note, byId, pitch, target, listing, circuit.points).map((tex) => ({ tex, line: note.line })),
  );
  for (const drawing of notes) {
    lines.push(`${drawing.tex} % line ${drawing.line}`);
    lineMap.set(lines.length, drawing.line);
  }

  // 題と刻印は注釈より後。どちらも図がどこまで広がったかを測ってから掛ける
  // (番地には a より上も、図の右下より外も無い)。フェンスのどの行から来た
  // ものでもないので `% line` は付けない。
  //
  // 題が先。題は図を上へ、そして題が図より長ければ右へも広げるので、
  // 刻印は**題まで含めた**箱の右下に付く。逆にすると、長い題を書いたときだけ
  // 刻印が図の途中の幅に取り残される。
  lines.push(...drawTitle(circuit, target));
  if (style.stamp === true) lines.push(...drawStamp(target));

  lines.push(...FOOTER);

  return {
    tex: lines.join('\n'),
    lineMap,
    messages,
    notes: noteOverlays(circuit, target, listing, style.stamp === true),
  };
}
