import { LIMITS } from '../limits.ts';
import { DEFAULT_PITCH, cornerOf, formatAddress, toPoint } from '../model/address.ts';
import type { Address, Point } from '../model/address.ts';
import { noteAnchorCell, resolveNoteTarget, wireContacts } from '../model/circuit.ts';
import type { Circuit, NoteAnchor } from '../model/circuit.ts';
import {
  NOTE_INK, NOTE_MARK_COLOR, NOTE_MARK_TEXT, hexDigits, noteColor, noteFontTex, noteLine,
  noteMonoWidth, noteSpan, noteWidth, texAnchorOf, texColorOf,
} from '../notes.ts';
import { lookupPartType, symbolFor } from '../parts.ts';
import { EMPTY_STYLE } from '../parser/style.ts';
import { cellOf as addressOf, nodeNameOf, texNameOfEndpoint } from '../types.ts';
import type {
  ArrowNote, BoxNote, MultiTerminalPart, NoteOverlay, NoteSpec, NoteTextStyle, PartSpec, SourceNote,
  StyleSpec, TexTarget, TextNote, TwoTerminalPart, OneTerminalPart,
} from '../types.ts';
import { escapeTex, escapeTexListing, hasUnicode } from './escape.ts';

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
  /**
   * そのフェンスの ``` が書かれた Markdown の行 (1 始まり)。書き出しに添える
   * 行番号がここから始まる。省いたときは中身の 1 行目を 1 行目として数える
   * (`.yaml` を 1 枚として描くときはそれで合う)。
   */
  readonly sourceLine?: number;
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
    `\\foreach \\x in {${xs.map(num).join(',')}} {\\foreach \\y in {${ys.map(num).join(',')}} {\\fill[gray, opacity=${num(GRID_DOT_OPACITY)}] (\\x,\\y) circle (${dotSize}pt);}}`,
    ...columnLabels,
    ...rowLabels,
  ];
}

function drawTwoTerminal(part: TwoTerminalPart, target: TexTarget): string {
  // ラベルは `l_` (下・左)、値は `a^` (上・右) と向かい合わせに置く。
  // どちらも既定の側に置くと、LED のように上へ張り出す記号とラベルが重なる
  // (回路図の定石。実機で重なりを確認して決めた)。
  const type = lookupPartType(part.type);
  // 種類そのものに要るオプション (抵抗計の Ω など) は記号のすぐ後ろ。
  const options = [symbolFor(part.type, target), ...(type?.options ?? [])];
  // 足を指せる種類だけ、記号そのものに名前を付ける (`P1.w` の行き先になる)。
  // 指せない種類にまで付けると、要らない名前で TeX が太る。
  if (type?.pins !== undefined) options.push(`n=${nodeNameOf(part.id)}`);
  // 記号だけでは見分けが付かない種類は、ID の下にもう 1 行書く (`l2_` は
  // 2 行を組んで下に置く circuitikz の書き方。`and` が行の区切り)。
  options.push(
    type?.mark === undefined
      ? `l_=${labelOf(part.id)}`
      : `l2_=${labelOf(part.id)} and ${type.mark}`,
  );
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

/**
 * 注釈の丸の半径 (cm)。**部品の長さではなく記号の大きさ**に合わせた決め打ち
 * (2 端子の記号は `bipoles/length=1.2cm` で、番地の間隔がいくつでも変わらない)。
 * 長い部品を端から端まで囲うと、印というより枠になって図が読みにくくなる。
 */
const NOTE_RADIUS = 0.9;

/**
 * 枠 (`box`) が角の番地の外側に取る余白 (cm)。丸の半径と同じ考え方で、
 * **番地の間隔ではなく記号の大きさ**に合わせた決め打ち。番地ちょうどで囲うと、
 * 縁に置いた記号が枠に噛む。記号そのものだけでなく、その上下に出る
 * ID と値のラベルまで抜ける値にしてある (実機で図を見て決めた)。
 */
const BOX_PAD = 0.7;

/** 枠の角の丸み (pt)。回路の線と見分けが付く程度に落とす。 */
const BOX_CORNER = 3;

/**
 * 指し棒の先端。細い既定の矢印だと、線の太さに対して見えないほど小さい。
 * `arrows.meta` の形なので、書くときはライブラリも一緒に足す。
 */
const ARROW_TIP = '-{Stealth[length=2.2mm]}';

/** 行番号に取る最小の桁数。 */
const MIN_LINE_DIGITS = 2;

/**
 * フェンスの中身を、Markdown に書いたとおりの姿にする。
 * 囲みの ``` も足す — 図だけを見た人が、そのまま書き写せる形にするため。
 *
 * 頭に **Markdown の行番号**を添える。図の下の帯に出る「13 行目」を、
 * 書き出しの中でそのまま探せるようにするため
 * (**行番号は添えたものであって、フェンスの中身ではない**)。
 * 囲みの ``` には番号を振らない。`.yaml` を 1 枚として描くときは ``` が
 * 実在しないので、振ると中身の行番号が 1 つずれる。
 */
export function listingOf(source: string, sourceLine = 0): string[] {
  const body = source.replace(/\s+$/, '').split('\n');
  // 2 桁ぶんは必ず取る。1 桁で始まって 2 桁で終わる図でも、頭が揃う。
  const width = Math.max(MIN_LINE_DIGITS, String(sourceLine + body.length).length);
  const blank = ' '.repeat(width);

  return [
    `${blank} \`\`\`circuit`,
    ...body.map((text, index) => `${String(sourceLine + index + 1).padStart(width)} ${text}`),
    `${blank} \`\`\``,
  ];
}

/**
 * 注釈の字の上下に取っておく余白 (cm)。行送りと同じだけ取る。
 * 差し込むのは読み手の環境のフォントで、TeX が見積もった高さとは違う。
 * ぎりぎりに取ると、図のいちばん下の行が SVG の縁で切れる (実測)。
 */
const noteMargin = noteLine;

/**
 * 字の注釈に付ける TeX のオプション。大きさと太さは表から綴るので、
 * 書き手の字は入らない (約束 3)。
 */
const styleOptions = (style: NoteTextStyle, target: TexTarget): string[] => [
  // フェンスは目印を 1 文字置くだけ。本物の字とは幅が違うので、寄せは
  // TeX には決めさせず、差し込むときに SVG の側で寄せる (render/noteText.ts)。
  `anchor=${target === 'latex' ? texAnchorOf(style.align) : 'west'}`,
  // 番地が字の端になる、という決まりを目の子で正しくする
  // (既定の内側余白があると 1/3 em ぶんずれる)。
  'inner sep=0',
  ...(target === 'latex' && style.color !== null ? [texColorOf(style.color)] : []),
  ...(target === 'latex' ? [] : [MARK_COLOR_NAME]),
  `font=${noteFontTex(style.size, style.bold)}`,
];

/** 目印の色に TeX で付ける名前。書き手の字は入らない。 */
const MARK_COLOR_NAME = 'circuitnotemark';

/**
 * 印を置く場所。部品を指したときは記号の真ん中、番地を指したときはその交点。
 * どこを指しているかを決めるのは model の仕事 (検証もそれで長さ 0 を弾くので、
 * ここで数え直すと二重の定義になって食い違う)。
 */
const noteCenter = (anchor: NoteAnchor, pitch: number): Point =>
  toPoint(noteAnchorCell(anchor), pitch);

/** 書き出す `.tex` の注釈の字。日本語が混じるときだけ積んだフォントで組む。 */
const latexNoteText = (text: string): string =>
  hasUnicode(text) ? `\\circuittext{${escapeTex(text)}}` : escapeTex(text);

/**
 * 図に重ねる字。
 *
 * 書き出す `.tex` はそのまま TeX に組ませる。フェンスは**字を TeX に渡さない**
 * (日本語のフォントが無く、渡すと例外ではなくプロセスごと落ちる)。
 * 代わりに目印の色の 1 文字だけを置き、描き上がった SVG でそこへ本物の字を
 * 差し込む (render/noteText.ts)。位置と大きさは TeX が決めたものを使うので、
 * 座標系を二重に持たなくてよい。
 */
function drawTextNote(note: TextNote, pitch: number, target: TexTarget): string[] {
  const { x, y } = toPoint(note.at, pitch);
  const options = styleOptions(note, target);
  const at = `at (${num(x)},${num(y)})`;

  if (target === 'latex') return [`\\node[${options.join(', ')}] ${at} {${latexNoteText(note.text)}};`];

  // 幅は TeX が知らない (字を渡していない) ので、こちらで見積もったぶんの場所を
  // 取っておく。取らないと、図の縁に書いた注釈が SVG の外に出て切れる。
  // 寄せによって字の広がる向きが変わるので、取る場所もそちら側にする。
  const half = noteMargin(note.size);
  const span = noteSpan(x, noteWidth(note.text, note.size), note.align);
  return [
    `\\path (${num(span.from)},${num(y - half)}) rectangle (${num(span.to)},${num(y + half)});`,
    `\\node[${options.join(', ')}] ${at} {${NOTE_MARK_TEXT}};`,
  ];
}

/**
 * 元のフェンスの書き出し。1 行ずつ、**格子ではなく字の行送り**で下へ並べる。
 * 格子の刻みで送ると、数行書いただけで図より書き出しのほうが高くなる。
 */
function drawSourceNote(note: SourceNote, pitch: number, target: TexTarget, lines: string[]): string[] {
  const { x, y } = toPoint(note.at, pitch);
  const options = styleOptions(note, target);
  const step = noteLine(note.size);
  const at = (index: number): string => `at (${num(x)},${num(y - step * index)})`;

  if (target === 'latex') {
    return lines.map(
      (text, index) => `\\node[${options.join(', ')}] ${at(index)} {${latexListing(text)}};`,
    );
  }

  // 幅も高さも TeX は知らない (字を渡していない) ので、まとめて場所を取っておく。
  const margin = noteMargin(note.size);
  const width = Math.max(0, ...lines.map((text) => noteMonoWidth(text, note.size)));
  const span = noteSpan(x, width, note.align);
  const top = y + margin;
  const bottom = y - step * (lines.length - 1) - margin;
  return [
    `\\path (${num(span.from)},${num(bottom)}) rectangle (${num(span.to)},${num(top)});`,
    ...lines.map((_, index) => `\\node[${options.join(', ')}] ${at(index)} {${NOTE_MARK_TEXT}};`),
  ];
}

/**
 * 書き出す `.tex` の 1 行。等幅で組む。日本語が混じる行だけは、
 * 標準の等幅フォントに字形が無いので積んだフォントに回す。
 */
const latexListing = (text: string): string =>
  hasUnicode(text) ? `\\circuitsource{${escapeTexListing(text)}}` : `\\texttt{${escapeTexListing(text)}}`;

/**
 * 図の一角を囲む枠。角の番地の外側に余白を取って囲む。
 * 破線にするのは、回路の線と見分けが付くようにするため
 * (枠は回路の一員ではない)。
 */
function drawBoxNote(note: BoxNote, pitch: number): string[] {
  const from = toPoint(note.from, pitch);
  const to = toPoint(note.to, pitch);
  const left = Math.min(from.x, to.x) - BOX_PAD;
  const right = Math.max(from.x, to.x) + BOX_PAD;
  const bottom = Math.min(from.y, to.y) - BOX_PAD;
  const top = Math.max(from.y, to.y) + BOX_PAD;

  return [
    `\\draw[${texColorOf(note.color)}, dashed, rounded corners=${num(BOX_CORNER)}pt]` +
      ` (${num(left)},${num(bottom)}) rectangle (${num(right)},${num(top)});`,
  ];
}

/**
 * 指し棒の端を、指し先の手前で止める量 (cm)。
 *
 * 部品を指したときは**印 (`circle`) と同じ丸の縁**で止める。真ん中まで伸ばすと
 * 先端が記号の下に隠れて、何を指しているのか分からなくなる。
 * 番地を指したときはその点が指し先そのものなので、削らない。
 */
const arrowGap = (anchor: NoteAnchor): number => (anchor.kind === 'part' ? NOTE_RADIUS : 0);

/**
 * 両端を手前で止めた線分。**削りすぎて裏返らない**よう、削る量の合計は
 * 線の長さの半分までに抑える (短い矢印は削る量のほうが長さより大きくなる)。
 */
function trimSegment(from: Point, to: Point, fromGap: number, toGap: number): readonly [Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const total = fromGap + toGap;
  if (length === 0 || total === 0) return [from, to];

  const scale = Math.min(1, length / 2 / total);
  const unitX = dx / length;
  const unitY = dy / length;
  return [
    { x: from.x + unitX * fromGap * scale, y: from.y + unitY * fromGap * scale },
    { x: to.x - unitX * toGap * scale, y: to.y - unitY * toGap * scale },
  ];
}

/** 図に重ねる指し棒。起点から終点へ、先端の付いた線を 1 本引く。 */
function drawArrowNote(note: ArrowNote, byId: ReadonlyMap<string, PartSpec>, pitch: number): string[] {
  const from = resolveNoteTarget(note.from, byId);
  const to = resolveNoteTarget(note.to, byId);
  // 指し先の無い注釈は buildCircuit が落としている。ここに来るのは検証漏れ。
  if (from === null || to === null) return [];

  const [start, end] = trimSegment(
    noteCenter(from, pitch),
    noteCenter(to, pitch),
    arrowGap(from),
    arrowGap(to),
  );

  return [
    `\\draw[${texColorOf(note.color)}, ${ARROW_TIP}]` +
      ` (${num(start.x)},${num(start.y)}) -- (${num(end.x)},${num(end.y)});`,
  ];
}

/** 注釈 1 つ。指し先はここでもう一度引く (検証は model/circuit.ts で済んでいる)。 */
function drawNote(
  note: NoteSpec,
  byId: ReadonlyMap<string, PartSpec>,
  pitch: number,
  target: TexTarget,
  listing: string[],
): string[] {
  if (note.kind === 'text') return drawTextNote(note, pitch, target);
  if (note.kind === 'source') return drawSourceNote(note, pitch, target, listing);
  if (note.kind === 'box') return drawBoxNote(note, pitch);
  if (note.kind === 'arrow') return drawArrowNote(note, byId, pitch);

  const anchor = resolveNoteTarget(note.target, byId);
  // 指し先の無い注釈は buildCircuit が落としている。ここに来るのは検証漏れ。
  if (anchor === null) return [];

  const { x, y } = noteCenter(anchor, pitch);
  return [`\\draw[${texColorOf(note.color)}] (${num(x)},${num(y)}) circle (${num(NOTE_RADIUS)});`];
}

/**
 * 注釈に使う色の宣言。**実際に使う色だけ**書く。
 * 名前も値もパレットの表から作るので、書き手の字は TeX に入らない (約束 3)。
 */
function noteColorLines(circuit: Circuit, target: TexTarget): string[] {
  const names = new Set<string>();
  for (const note of circuit.notes) {
    // 図形として描く注釈は、どちらの的でも TeX が色を塗る。
    if (note.kind === 'circle' || note.kind === 'box' || note.kind === 'arrow') names.add(note.color);
    // フェンスの字は目印の色で置くので、パレットの色は要らない (SVG で塗る)。
    else if (target === 'latex' && note.color !== null) names.add(note.color);
  }

  const palette = [...names].map((name) => {
    const color = noteColor(name) ?? NOTE_INK;
    return `\\definecolor{${texColorOf(name)}}{HTML}{${hexDigits(color)}}`;
  });

  const marked =
    target === 'fence' && circuit.notes.some((note) => note.kind === 'text' || note.kind === 'source');
  return marked
    ? [...palette, `\\definecolor{${MARK_COLOR_NAME}}{HTML}{${hexDigits(NOTE_MARK_COLOR)}}`]
    : palette;
}

/** SVG に差し込む字。TeX が目印を置く順と同じ並びにする。 */
function noteOverlays(circuit: Circuit, target: TexTarget, listing: string[]): NoteOverlay[] {
  if (target === 'latex') return [];

  return circuit.notes.flatMap((note): NoteOverlay[] => {
    if (note.kind !== 'text' && note.kind !== 'source') return [];
    const color = noteColor(note.color) ?? NOTE_INK;
    const look = { color, bold: note.bold, align: note.align };
    return note.kind === 'text'
      ? [{ text: note.text, mono: false, ...look }]
      : listing.map((text) => ({ text, mono: true, ...look }));
  });
}

/** 積んだフォントが要る字があるか。要らないならフォントの行を書かない。 */
const needsUnicodeFont = (circuit: Circuit, listing: string[]): boolean =>
  circuit.parts.some((part) => part.kind !== 'one-terminal' && part.value !== null && hasUnicode(part.value)) ||
  circuit.notes.some((note) => note.kind === 'text' && hasUnicode(note.text)) ||
  (circuit.notes.some((note) => note.kind === 'source') && listing.some(hasUnicode));

/** 書き出しに要る等幅のフォント。書き出しに日本語が出てくるときだけ書く。 */
const needsMonoFont = (circuit: Circuit, listing: string[]): boolean =>
  circuit.notes.some((note) => note.kind === 'source') && listing.some(hasUnicode);

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
  const listing = listingOf(options.source ?? '', options.sourceLine ?? 0);
  const lines = headerOf(
    style,
    target,
    needsUnicodeFont(circuit, listing),
    needsMonoFont(circuit, listing),
    circuit.notes.some((note) => note.kind === 'arrow'),
    noteColorLines(circuit, target),
  );
  const cells = cellsOf(circuit);
  const byId = new Map(circuit.parts.map((part) => [part.id, part]));

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

  // 注釈はいちばん最後に描く。図の上に重ねる印と字なので、回路にも黒丸にも
  // 隠れないようにする。
  const notes = circuit.notes.flatMap((note) =>
    drawNote(note, byId, pitch, target, listing).map((tex) => ({ tex, line: note.line })),
  );
  for (const drawing of notes) {
    lines.push(`${drawing.tex} % line ${drawing.line}`);
    lineMap.set(lines.length, drawing.line);
  }

  lines.push(...FOOTER);

  return { tex: lines.join('\n'), lineMap, messages, notes: noteOverlays(circuit, target, listing) };
}
