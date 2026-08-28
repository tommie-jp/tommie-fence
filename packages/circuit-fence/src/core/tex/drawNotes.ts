/**
 * 図に重ねる注釈 (`notes:`) を circuitikz TeX にする。
 *
 * 注釈は**回路の一員ではない**ので、ネットにも分岐の黒丸にも数えない。
 * 描くのも回路のいちばん最後で、印も字も回路の上に重なる。
 *
 * 色や大きさの表そのものは `core/notes.ts` にある。ここが持つのは
 * **その表を TeX の書き方に直す**ところだけ (何が書けるかを決めるのは表の側で、
 * どう描くかを決めるのがここ)。
 */

import { toPoint } from '../model/address.ts';
import type { Point } from '../model/address.ts';
import { noteAnchorCell, resolveNoteTarget } from '../model/circuit.ts';
import type { Circuit, NoteAnchor } from '../model/circuit.ts';
import type { Points } from '../parser/compact.ts';
import {
  DEFAULT_NOTE_SIZE, NOTE_INK, NOTE_MARK_COLOR, NOTE_MARK_TEXT, hexDigits, noteBoldWidth, noteColor,
  noteFontTex, noteLine, noteMonoWidth, noteSourceLine, noteSpan, noteWidth, texAnchorOf, texColorOf,
} from '../notes.ts';
import type { NoteSize } from '../notes.ts';
import { STAMP_TEXT } from '../version.ts';
import type {
  ArrowNote, BoxNote, NoteOverlay, NoteSpec, NoteTextStyle, PartSpec, SourceNote, TexTarget,
  TextNote,
} from '../types.ts';
import { escapeTex, escapeTexListing, hasUnicode } from './escape.ts';
import { num } from './num.ts';

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

/**
 * フェンスの中身を、Markdown に書いたとおりの姿にする。
 * 囲みの ``` も足す — 図だけを見た人が、そのまま書き写せる形にするため。
 *
 * **行番号は添えない**。書き写せる形であることが値打ちなので、書いていない字を
 * 混ぜない。図の下の帯が指す行は、この書き出しの ``` から数えれば見つかる
 * (わざと壊してある例のように、Markdown の側で行番号を添えることはある)。
 */
export const listingOf = (source: string): string[] => [
  '```circuit',
  ...source.replace(/\s+$/, '').split('\n'),
  '```',
];

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
 *
 * 送りは地の文より詰めた書き出し用のもの (`noteSourceLine`)。書き手が段を
 * 書いていれば、そちらで送る。上下に取る余白は段に付いてこない — 余白は字が
 * 縁で切れないための実測値で、行の間隔とは別のもの。
 */
function drawSourceNote(note: SourceNote, pitch: number, target: TexTarget, lines: string[]): string[] {
  const { x, y } = toPoint(note.at, pitch);
  const options = styleOptions(note, target);
  const step = noteSourceLine(note.size, note.leading);
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
function drawArrowNote(
  note: ArrowNote,
  byId: ReadonlyMap<string, PartSpec>,
  pitch: number,
  points: Points,
): string[] {
  const from = resolveNoteTarget(note.from, byId, points);
  const to = resolveNoteTarget(note.to, byId, points);
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
export function drawNote(
  note: NoteSpec,
  byId: ReadonlyMap<string, PartSpec>,
  pitch: number,
  target: TexTarget,
  listing: string[],
  points: Points,
): string[] {
  if (note.kind === 'text') return drawTextNote(note, pitch, target);
  if (note.kind === 'source') return drawSourceNote(note, pitch, target, listing);
  if (note.kind === 'box') return drawBoxNote(note, pitch);
  if (note.kind === 'arrow') return drawArrowNote(note, byId, pitch, points);

  const anchor = resolveNoteTarget(note.target, byId, points);
  // 指し先の無い注釈は buildCircuit が落としている。ここに来るのは検証漏れ。
  if (anchor === null) return [];

  const { x, y } = noteCenter(anchor, pitch);
  return [`\\draw[${texColorOf(note.color)}] (${num(x)},${num(y)}) circle (${num(NOTE_RADIUS)});`];
}

/**
 * 題の字の大きさ。図の見出しなので、注釈のどの段よりはっきりさせる
 * (`large` + 太字)。書き手が選べるようにはしていない — 題は 1 枚に 1 つで、
 * 大きさを選ぶ意味が薄いわりに、覚えることだけ増える。
 */
const TITLE_SIZE: NoteSize = 'large';

/** 題と図の間に空ける幅 (pt)。刻印と同じで、字が図にくっつかない最小限。 */
const TITLE_INSET = 2;

/** 題のノードに付ける名前。幅を取っておく `\path` から呼ぶためだけに使う。 */
const TITLE_NODE = 'circuittitle';

/**
 * 図の上に載せる題。
 *
 * **置き場所は番地から測れない** — 番地は a1 が最上段で、その上が無い。
 * TikZ に測らせた `current bounding box` の左上に掛ける (実機で確認済み)。
 * だから注釈より後、刻印と同じ並びで**いちばん最後に書く**。
 *
 * 字はフェンスでは TeX に渡さず、目印を 1 文字置いて描き上がった SVG に
 * 差し込む (約束 7)。注釈とまったく同じ道なので、日本語がそのまま出る。
 * 幅は TeX が知らないので、見積もったぶんの場所を取っておく
 * (取らないと、図より長い題が SVG の右で切れる)。
 */
export function drawTitle(circuit: Circuit, target: TexTarget): string[] {
  const title = circuit.title;
  if (title === null) return [];

  const options = [
    'anchor=south west',
    `inner sep=${num(TITLE_INSET)}pt`,
    ...(target === 'latex' ? [] : [MARK_COLOR_NAME]),
    `font=${noteFontTex(TITLE_SIZE, true)}`,
  ];
  const at = 'at (current bounding box.north west)';

  if (target === 'latex') return [`\\node[${options.join(', ')}] ${at} {${latexNoteText(title)}};`];

  return [
    `\\node[${options.join(', ')}] (${TITLE_NODE}) ${at} {${NOTE_MARK_TEXT}};`,
    `\\path (${TITLE_NODE}.south west) rectangle`
    + ` ++(${num(noteBoldWidth(title, TITLE_SIZE))},${num(noteLine(TITLE_SIZE))});`,
  ];
}

/** 刻印の大きさ。書き出し (`- source`) を大きさ無しで書いたときと同じ。 */
const STAMP_SIZE: NoteSize = DEFAULT_NOTE_SIZE;

/** 刻印と図の間に空ける幅 (pt)。字がグラウンドの記号にくっつかない最小限。 */
const STAMP_INSET = 2;

/** 刻印の目印に付ける名前。場所を取っておくのに使う。 */
const STAMP_NODE = 'circuitstamp';

/**
 * 図の隅に、その図を組んだ処理系のバージョンを刻む (`style: stamp: on`)。
 *
 * **置き場所は番地から測らない**。図がどこまで広がるかは、ラベルも注釈も
 * 描き終わるまで決まらないので、TikZ に測らせた `current bounding box` の
 * 右下に掛ける (実機で確認済み。だから**いちばん最後に書く**)。
 *
 * 字は題と同じで、**フェンスでは TeX に渡さず描き上がった SVG に差し込む**。
 * TeX のフォント (cmr) の名前は SVG にそのまま出るが、その名前のフォントは
 * 開く側に無い。代わりのフォントは字送りが違うので、字を大きくすると
 * TeX が測った幅からはみ出して重なる (実測)。
 *
 * `gray` で描くのはグリッドと同じ扱いにするため。描き上がった SVG で
 * グリッドの色に塗り替わり (render/theme.ts)、回路より薄く出る。
 */
export function drawStamp(target: TexTarget): string[] {
  const options = [
    'anchor=north east',
    `inner sep=${num(STAMP_INSET)}pt`,
    target === 'latex' ? STAMP_COLOR : MARK_COLOR_NAME,
    `font=${noteFontTex(STAMP_SIZE, false)}`,
  ];
  const at = 'at (current bounding box.south east)';

  if (target === 'latex') return [`\\node[${options.join(', ')}] ${at} {${escapeTex(STAMP_TEXT)}};`];

  return [
    `\\node[${options.join(', ')}] (${STAMP_NODE}) ${at} {${NOTE_MARK_TEXT}};`,
    // 目印は 1 文字なので、本物の字のぶんだけ左へ場所を取っておく
    // (図が刻印より狭いと、取らなければ刻印だけ箱の外へ出る)。
    `\\path (${STAMP_NODE}.north east) rectangle`
    + ` ++(-${num(noteWidth(STAMP_TEXT, STAMP_SIZE))},-${num(noteLine(STAMP_SIZE))});`,
  ];
}

/** 刻印の色。グリッドと同じ `gray` で描き、SVG でテーマのグリッド色に塗り替わる。 */
const STAMP_COLOR = 'gray';

/**
 * 注釈に使う色の宣言。**実際に使う色だけ**書く。
 * 名前も値もパレットの表から作るので、書き手の字は TeX に入らない (約束 3)。
 */
export function noteColorLines(
  circuit: Circuit,
  target: TexTarget,
  extra: readonly string[] = [],
): string[] {
  const names = new Set<string>(extra);
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
    target === 'fence'
    && (circuit.title !== null
      || circuit.notes.some((note) => note.kind === 'text' || note.kind === 'source'));
  return marked
    ? [...palette, `\\definecolor{${MARK_COLOR_NAME}}{HTML}{${hexDigits(NOTE_MARK_COLOR)}}`]
    : palette;
}

/** SVG に差し込む字。TeX が目印を置く順と同じ並びにする。 */
export function noteOverlays(
  circuit: Circuit,
  target: TexTarget,
  listing: string[],
  stamped = false,
): NoteOverlay[] {
  if (target === 'latex') return [];

  const notes = circuit.notes.flatMap((note): NoteOverlay[] => {
    if (note.kind !== 'text' && note.kind !== 'source') return [];
    const color = noteColor(note.color) ?? NOTE_INK;
    const look = { color, bold: note.bold, align: note.align };
    return note.kind === 'text'
      ? [{ text: note.text, mono: false, ...look }]
      : listing.map((text) => ({ text, mono: true, ...look }));
  });

  // 題は TeX のいちばん最後に置くので、差し込む並びでも末尾。
  // 色は書かせていないので、図のほかの文字と同じ色に乗る (NOTE_INK は
  // 黒のまま出て、そのあと recolorSvg がテーマの文字色に塗り替える)。
  const titled = circuit.title === null
    ? notes
    : [...notes, { text: circuit.title, color: NOTE_INK, mono: false, bold: true, align: 'left' } as const];

  // 刻印は題のさらに後 (題まで含めた箱の右下に掛かる)。右下に付くものなので、
  // 差し込む字は目印から**左へ**伸ばす。
  if (!stamped) return titled;
  return [
    ...titled,
    { text: STAMP_TEXT, color: STAMP_COLOR, mono: false, bold: false, align: 'right' },
  ];
}

/**
 * 注釈のために定型へ書き足すもの。
 *
 * **注釈の種類を見るのはこのファイルだけ**にしておく。定型を組み立てるのは
 * generate.ts の仕事だが、種類ごとの都合まであちらに散らすと、注釈を 1 つ足す
 * たびに 2 つのファイルを直すことになる (指し棒を足したときに実際そうなった)。
 */
export type NoteNeeds = {
  /** 標準の TeX フォントに字形が無い字が、注釈に出てくるか。 */
  readonly unicodeFont: boolean;
  /** 書き出しを組む等幅フォントが要るか (書き出しに日本語が出てくるときだけ)。 */
  readonly monoFont: boolean;
  /** 矢印の先端の形 (`arrows.meta`) が要るか。 */
  readonly arrowTips: boolean;
};

export function noteNeeds(circuit: Circuit, listing: readonly string[]): NoteNeeds {
  const hasSource = circuit.notes.some((note) => note.kind === 'source');
  const monoFont = hasSource && listing.some(hasUnicode);

  return {
    unicodeFont:
      circuit.notes.some((note) => note.kind === 'text' && hasUnicode(note.text))
      || (circuit.title !== null && hasUnicode(circuit.title))
      || monoFont,
    monoFont,
    arrowTips: circuit.notes.some((note) => note.kind === 'arrow'),
  };
}
