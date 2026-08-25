import { LIMITS } from '../limits.ts';
import { DEFAULT_PITCH, cornerOf, formatAddress, toPoint } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { wireContacts } from '../model/circuit.ts';
import type { Circuit } from '../model/circuit.ts';
import { lookupPartType, symbolFor } from '../parts.ts';
import { EMPTY_STYLE } from '../parser/style.ts';
import { cellOf as addressOf, nodeNameOf, texNameOfEndpoint } from '../types.ts';
import type {
  MultiTerminalPart, PartSpec, StyleSpec, TexTarget, TwoTerminalPart, OneTerminalPart,
} from '../types.ts';
import { escapeTex, hasUnicode } from './escape.ts';

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
};

export type GenerateOptions = {
  readonly pitch?: number;
  readonly style?: StyleSpec;
  /** 省略時はフェンス (プレビューと CLI の SVG)。 */
  readonly target?: TexTarget;
};

/** 既定の線の太さ (pt)。実機コンパイルを確認した値。 */
const DEFAULT_WIRE_WIDTH = 0.8;

/** 既定の記号の流儀。実機で検証したのは american のほう。 */
const DEFAULT_STANDARD = 'american';

/**
 * 標準の TeX フォントに字形が無い字を組むフォント。
 * 書き出す `.tex` に、そういう字が実際に出てくるときだけ書く
 * (**この 1 行だけが相手の環境で落ちうる**ので、要らないなら書かない)。
 */
const UNICODE_FONT = 'Noto Sans CJK JP';

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
const headerOf = (style: StyleSpec, target: TexTarget, needsUnicode: boolean): string[] => [
  '\\usepackage{circuitikz}',
  // オペアンプの ± をアンカーからずらして置くのに要る。
  '\\usetikzlibrary{calc}',
  // フェンスの TeX には siunitx が無い (実測)。書き出すほうでだけ使う。
  ...(target === 'latex' ? ['\\usepackage{siunitx}'] : []),
  ...(target === 'latex' && needsUnicode ? unicodeFontLines() : []),
  '\\begin{document}',
  `\\begin{circuitikz}[${style.standard ?? DEFAULT_STANDARD}, line width=${num(style.wireWidth ?? DEFAULT_WIRE_WIDTH)}pt]`,
  '\\ctikzset{bipoles/length=1.2cm}',
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

/** 座標の桁を落として出力を安定させる (同じ入力なら必ず同じ TeX)。 */
const num = (value: number): string => String(Math.round(value * 1000) / 1000);

/** 部品 ID を回路図の慣習どおりに組む (`R1` → R の添字 1、`Rload` → R の添字 load)。 */
function labelOf(id: string): string {
  const [first = '', ...rest] = [...id];
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
const SIGN_DY = 0.13;

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

  return [
    // + は横棒と縦棒。縦棒は横棒の真ん中から上下へ伸ばす。
    `\\draw ($(${name}.+)+(${dx},${num(-SIGN_DY)})$) -- ++(${bar},0);`,
    `\\draw ($(${name}.+)+(${num(SIGN_DX + SIGN_BAR / 2)},${num(-SIGN_DY - SIGN_BAR / 2)})$) -- ++(0,${bar});`,
    // - は横棒だけ。+ と同じ長さ・同じ太さになる。
    `\\draw ($(${name}.-)+(${dx},${num(SIGN_DY)})$) -- ++(${bar},0);`,
  ];
}

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
  const lastRow = Math.max(0, ...used.map((cell) => cell.row), corner?.row ?? 0);
  const lastCol = Math.max(0, ...used.map((cell) => cell.col), corner?.col ?? 0);

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
    `\\foreach \\x in {${xs.map(num).join(',')}} {\\foreach \\y in {${ys.map(num).join(',')}} {\\fill[gray] (\\x,\\y) circle (${dotSize}pt);}}`,
    ...columnLabels,
    ...rowLabels,
  ];
}

function drawTwoTerminal(part: TwoTerminalPart, target: TexTarget): string {
  // ラベルは `l_` (下・左)、値は `a^` (上・右) と向かい合わせに置く。
  // どちらも既定の側に置くと、LED のように上へ張り出す記号とラベルが重なる
  // (回路図の定石。実機で重なりを確認して決めた)。
  const options = [symbolFor(part.type, target)];
  // 足を指せる種類だけ、記号そのものに名前を付ける (`P1.w` の行き先になる)。
  // 指せない種類にまで付けると、要らない名前で TeX が太る。
  if (lookupPartType(part.type)?.pins !== undefined) options.push(`n=${nodeNameOf(part.id)}`);
  options.push(`l_=${labelOf(part.id)}`);
  if (part.value !== null) options.push(`a^=${annotationOf(part.value, unitOf(part.type), target)}`);

  return `\\draw (${formatAddress(part.from)}) to[${options.join(', ')}] (${formatAddress(part.to)});`;
}

function drawOneTerminal(part: OneTerminalPart, target: TexTarget): string {
  const at = formatAddress(part.at);
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
  const options = [symbol, ...(type?.options ?? [])];
  const turned = part.orientation === null ? null : ORIENTATION_TEX[part.orientation];
  if (turned !== undefined && turned !== null) options.push(turned);
  const at = formatAddress(part.at);
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

const drawPart = (part: PartSpec, target: TexTarget): string[] =>
  part.kind === 'two-terminal'
    ? [drawTwoTerminal(part, target)]
    : part.kind === 'one-terminal'
      ? [drawOneTerminal(part, target)]
      : drawMultiTerminal(part, target);

/** 積んだフォントが要る値があるか。要らないならフォントの行を書かない。 */
const needsUnicodeFont = (circuit: Circuit): boolean =>
  circuit.parts.some((part) => part.kind !== 'one-terminal' && part.value !== null && hasUnicode(part.value));

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
  const lines = headerOf(style, target, needsUnicodeFont(circuit));
  const cells = cellsOf(circuit);

  // グリッドは回路より先に描く (後から描くと部品の上に点が乗る)。
  if (style.grid === true) lines.push(...drawGrid(cells, style, pitch, messages));
  // 書いても効かない指定は、黙って捨てずに伝える。
  if (style.grid !== true && style.gridTo !== null) {
    messages.push('grid-to は grid: on のときに効きます');
  }

  for (const [name, cell] of cells) {
    const { x, y } = toPoint(cell.address, pitch);
    lines.push(`\\coordinate (${name}) at (${num(x)},${num(y)});`);
  }

  const drawings: { readonly tex: string; readonly line: number }[] = [
    ...circuit.parts.flatMap((part) => drawPart(part, target).map((tex) => ({ tex, line: part.line }))),
    ...circuit.wires.map((wire) => ({
      tex: `\\draw (${texNameOfEndpoint(wire.from)}) ${wire.operator} (${texNameOfEndpoint(wire.to)});`,
      line: wire.line,
    })),
  ];

  for (const drawing of drawings) {
    lines.push(`${drawing.tex} % line ${drawing.line}`);
    lineMap.set(lines.length, drawing.line);
  }

  for (const [name, cell] of cells) {
    if (cell.ends >= JUNCTION_ENDS) lines.push(`\\node[circ] at (${name}) {};`);
  }

  lines.push(...FOOTER);

  return { tex: lines.join('\n'), lineMap, messages };
}
