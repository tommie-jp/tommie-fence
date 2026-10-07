import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { gateNumbersOf } from '../gateNumbers.ts';
import { cornerOf, formatAddress, isNearlyZero, isSameAddress, oldSpellingHint, parseAddress } from './address.ts';
import { partTypeOf, lookupPin, mismatchedDiscrete, orientOf, pinAxis, pinHint, pinRefName, unnamedDip } from '../parts.ts';
import type { Address } from './address.ts';
import { NO_POINTS } from '../parser/compact.ts';
import type { Points } from '../parser/compact.ts';
import type { FenceDocument } from '../parser/parseFence.ts';
import { describeChars, isDrawable, isSourceDrawable, unusableChars } from '../tex/escape.ts';
import { unitValueProblem } from '../values.ts';
import { isMathLabel, mathInnerOf, mathLabelTex } from '../tex/mathLabel.ts';
import { cellOf, nameOfEndpoint } from '../types.ts';
import type {
  ArrowNote, Endpoint, FenceError, LineNote, MultiTerminalPart, NoteSpec, OneTerminalPart, PartSpec, TexTarget,
  TwoTerminalPart,
  WireSpec,
} from '../types.ts';

/** 検証を通った図。ここから先 (ネットリスト導出・TeX 生成) は形を疑わない。 */
export type Circuit = {
  /**
   * 番地に付けた名前。図には出ないが、注釈の指し先として引け、
   * 名前の乗った節点はネットリストにその名前で出る (nets.ts)。
   */
  readonly points: Points;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  /**
   * 図に重ねる注釈。**回路の一員ではない**ので、ネットリストにも
   * 分岐の黒丸の数え上げにも参加しない (parts と混ぜないのはそのため)。
   */
  readonly notes: readonly NoteSpec[];
  /**
   * 図の上に載せる題。書かなければ null。
   * **回路の一員ではない**ので、注釈と同じく数え上げには参加しない。
   */
  readonly title: string | null;
};

/** 注釈が指す先。 */
export type NoteAnchor =
  | { readonly kind: 'part'; readonly part: PartSpec }
  | { readonly kind: 'cell'; readonly address: Address };

/**
 * 注釈の指し先を決める。**部品 ID を先に探し**、無ければ名前、番地の順に読む。
 *
 * 番地は数字で始まり `,` を含む (`1,3`) ので、部品 ID (`C1`) と取り違えることはない
 * (旧い綴りでは `C1` が番地 c1 とぶつかり、部品のほうを取ったと知らせていた)。
 */
export function resolveNoteTarget(
  target: string,
  byId: ReadonlyMap<string, PartSpec>,
  points: Points = NO_POINTS,
): NoteAnchor | null {
  const part = byId.get(target);
  if (part !== undefined) return { kind: 'part', part };

  // 番地の名前 (`points:`) も指せる。名前に番地の形は許していないので、
  // ここで引く順が図の意味を変えることはない。
  const named = points.get(target);
  if (named !== undefined) return { kind: 'cell', address: named };

  const address = parseAddress(target);
  return address === null ? null : { kind: 'cell', address };
}

/**
 * 注釈の指し先が図のどこに当たるか。**番地の目盛りで**返す (cm ではない)。
 * 2 端子部品は記号の真ん中なので、両端の間の値になることがある。
 *
 * 部品 ID と番地は書き方が違うだけで同じ 1 点を指せる (`ground c3` と `c3`)。
 * 書かれた字ではなくここで比べないと、長さ 0 の指し棒がすり抜ける。
 */
export function noteAnchorCell(anchor: NoteAnchor): Address {
  if (anchor.kind === 'cell') return anchor.address;

  const { part } = anchor;
  if (part.kind !== 'two-terminal') return part.at;

  return { row: (part.from.row + part.to.row) / 2, col: (part.from.col + part.to.col) / 2 };
}

export type BuildResult = {
  readonly circuit: Circuit;
  readonly errors: readonly FenceError[];
  /** 図は描けるが伝えたいこと。読めなかったわけではないので errors に混ぜない。 */
  readonly notices: readonly FenceError[];
};

const ASCII_CHARSET = '英数字と . + - / ( ) _ %';
const LATEX_CHARSET = `${ASCII_CHARSET}、日本語、µ Ω °`;

const valueProblem = (value: string, target: TexTarget): string => {
  // 日本語だけの値は safeToken が空になる。そのまま挟むと「値  は…」と穴が空く。
  const token = safeToken(value);
  const subject = token === '' ? '値' : `値 ${token} `;

  const bad = describeChars(unusableChars(value, 'latex'));
  if (target === 'latex') return `${subject}に使えない文字があります: ${bad} (${LATEX_CHARSET} が使えます)`;

  // 書き出す .tex でなら通る字のときだけ、そちらへ誘導する。
  // どちらでも通らない字を .tex に送っても直らないので、使える字を伝える。
  if (isDrawable(value, 'latex')) {
    return `${subject}はプレビューの TeX にフォントがありません (circuit-fence render --emit-tex で .tex に書き出すと LaTeX で組めます)`;
  }
  return `${subject}に使えない文字があります: ${bad} (${ASCII_CHARSET} が使えます)`;
};

export type BuildOptions = {
  /** 省略時はフェンス (プレビューと CLI の SVG)。 */
  readonly target?: TexTarget;
};

/**
 * 1 行ずつ読めた部品と配線を、図にできる形にまとめる。
 * 値が描けない部品は**値だけ落として部品は残す** (読めたところは捨てない)。
 */
export function buildCircuit(doc: FenceDocument, options: BuildOptions = {}): BuildResult {
  const target = options.target ?? 'fence';
  const errors: FenceError[] = [];
  const parts = doc.parts.map((part) => checkPart(part, errors, target));
  const byId = new Map(parts.map((part) => [part.id, part]));
  // 指す先が無い配線は描けない。1 本落としても残りは描く。
  // ピンの名前は書き方が何通りかあるので、ここで 1 つに揃えてから先へ渡す。
  const wires = doc.wires
    .map((wire) => resolvePins(wire, byId, errors))
    .filter((wire): wire is WireSpec => wire !== null);
  // 指し先の無い注釈と、書き出せないフェンスを指した注釈は描けない。
  // 1 つ落としても残りは描く。
  const sourceLines = doc.source.replace(/\s+$/, '').split('\n');
  const notes = doc.notes.filter(
    (note) => hasAnchor(note, byId, errors, doc.points) && canWriteSource(note, sourceLines, errors),
  );
  const circuit: Circuit = { points: doc.points, parts, wires, notes, title: doc.title };

  // **`check: off` は「伏せる」ではなく「見ない」。** 書いた人が外したのだから、
  // 外したことをこちらから言い足さない (`debug: off` との違いは文法の説明に書く)。
  // 外れるのは**読めているものへの検査**だけで、読めなかった行は必ず出る。
  const checking = doc.style.check !== false;
  if (checking) errors.push(...overlaps(parts));

  return {
    circuit,
    errors,
    // ピンの名前を補えなかった DIP は `check: off` でも言う — 検査ではなく、
    // 何で描いたか (番号) の知らせ (文法の方針 2)。
    notices: [...parts.flatMap(unnamedDipNotice), ...parts.flatMap(mismatchedDiscreteNotice), ...parts.flatMap(gateNumberNotice), ...(checking ? ambiguousTouches(circuit, byId) : [])],
  };
}

/** 記号と型番の極性が食い違うときのお知らせ (52 の docs/119)。図は書かれた記号のまま描く。 */
function mismatchedDiscreteNotice(part: PartSpec): FenceError[] {
  const mismatch = mismatchedDiscrete(part);
  if (mismatch === null) return [];
  return [fenceError(
    `${part.id} の型番 ${safeToken(mismatch.model)} は ${mismatch.actual}ですが、${part.type} (${mismatch.drawn}) の記号で描きました`
    + ' (記号の種類を型番に合わせます)',
    part.line,
  )];
}

/** ゲートにピンの番号を添えられなかったときのお知らせ (`gateNumbers.ts`)。 */
function gateNumberNotice(part: PartSpec): FenceError[] {
  const { problem } = gateNumbersOf(part);
  return problem === null ? [] : [fenceError(problem, part.line)];
}

/**
 * 型番がピンの名前の表に無い DIP のお知らせ (52 の docs/95 の決め 3)。**エラーには
 * しない** — 表に無い IC も番号で描ければ試せる。直し方は 2 つ (表に足す・`device`)。
 */
function unnamedDipNotice(part: PartSpec): FenceError[] {
  const unnamed = unnamedDip(part);
  if (unnamed === null) return [];
  const known = unnamed.known.length === 0
    ? `${part.type} の型番は表にありません`
    : `${part.type} で表にあるのは ${unnamed.known.join(' / ')}`;
  return [fenceError(
    `${part.id} の型番 ${safeToken(unnamed.model)} のピンの名前は表に無いので、番号で描きました (${known}。表に無い IC のピンに名前を出すなら device で pins: を書きます)`,
    part.line,
  )];
}

/**
 * その注釈が書いた指し先。字と枠は番地しか書けず、番地はその場に何も
 * 無くても図の上の場所として成り立つので、指し先を持たない。
 */
const noteTargetsOf = (note: NoteSpec): readonly string[] =>
  note.kind === 'circle'
    ? [note.target]
    : note.kind === 'arrow' || note.kind === 'line'
      ? [note.from, note.to]
      : [];

/**
 * 注釈の指し先があるか。無ければ理由を積んで、その注釈だけ落とす。
 *
 * 指し先を書くのは印 (`circle`) と指し棒 (`arrow`) だけ。
 */
function hasAnchor(
  note: NoteSpec,
  byId: ReadonlyMap<string, PartSpec>,
  errors: FenceError[],
  points: Points,
): boolean {
  // 1 行に 2 つ書き間違えても、返すのは最初の 1 つだけ。同じ行を 2 度指しても
  // 直す場所は増えない。
  const missing = noteTargetsOf(note).find((target) => resolveNoteTarget(target, byId, points) === null);
  if (missing !== undefined) {
    errors.push(
      fenceError(`注釈の指す先 ${safeToken(missing)} がありません (部品 ID か番地で書きます)`, note.line),
    );
    return false;
  }

  return (note.kind !== 'arrow' && note.kind !== 'line') || hasLength(note, byId, errors, points);
}

/**
 * 指し棒に長さがあるか。起点と終点が同じところだと向きが決まらない。
 *
 * 書かれた字ではなく**指し先の場所で**見る。番地は大小どちらでも書けるうえ、
 * 部品 ID と番地でも同じ 1 点を指せる (`G1: ground c3` があるとき
 * `arrow G1 c3` は長さ 0)。字で比べると、そこがすり抜ける。
 */
function hasLength(
  note: ArrowNote | LineNote,
  byId: ReadonlyMap<string, PartSpec>,
  errors: FenceError[],
  points: Points,
): boolean {
  const from = resolveNoteTarget(note.from, byId, points);
  const to = resolveNoteTarget(note.to, byId, points);
  if (from === null || to === null) return true;

  if (!isSameAddress(noteAnchorCell(from), noteAnchorCell(to))) return true;

  errors.push(
    fenceError(
      `${note.kind === 'line' ? '線' : '指し棒'}の起点と終点が同じところです (${safeToken(note.from)})`,
      note.line,
    ),
  );
  return false;
}

/**
 * `- source` が指しているフェンスを、そのまま図に書き出せるか。
 *
 * 書き出すのは書き手の書いた YAML そのものなので、TeX が自分の記法として読む字
 * (`\` `$` `{` `}` `^`) が混じることがある。約束 3 はここでも動かさないので、
 * 書き出しだけ落として**その字のある行**を返す。
 */
function canWriteSource(note: NoteSpec, sourceLines: readonly string[], errors: FenceError[]): boolean {
  if (note.kind !== 'source') return true;

  // **長いフェンスは切って書き出す** (断らない)。以前は上限を超えると書き出しごと
  // 落としていたが、breadboard と perfboard は切って「… ほかに N 行」と書いていた。
  // 3 つで揃える — 断られるより、途中まで出て切れたと分かるほうが直しやすい。
  const bad = sourceLines.slice(0, LIMITS.sourceLines).findIndex((text) => !isSourceDrawable(text));
  if (bad < 0) return true;

  errors.push(fenceError('この行に図へ書き出せない字があります (source の注釈は描いていません)', bad + 1));
  return false;
}

/** 2 つの部品が同じところを占めているか。 */
function overlapping(a: PartSpec, b: PartSpec): boolean {
  if (a.kind !== 'two-terminal' || b.kind !== 'two-terminal') {
    // 交点に置く記号どうしは、同じ交点なら重なり。
    const here = a.kind === 'two-terminal' ? null : a.at;
    const there = b.kind === 'two-terminal' ? null : b.at;
    return here !== null && there !== null && isSameAddress(here, there);
  }

  // 2 端子は線分。同じ直線に乗っていて、区間が重なっていれば重なり
  // (端どうしが 1 点で会うのは、重なりではなくつながり)。
  const first = { from: a.from, to: a.to };
  const second = { from: b.from, to: b.to };
  if (!collinear(first, second)) return false;

  return (
    liesOn(second.from, first) ||
    liesOn(second.to, first) ||
    liesOn(first.from, second) ||
    liesOn(first.to, second) ||
    (isSameAddress(first.from, second.from) && isSameAddress(first.to, second.to)) ||
    (isSameAddress(first.from, second.to) && isSameAddress(first.to, second.from))
  );
}

/** 2 つの線分が同じ直線に乗っているか。 */
function collinear(a: Segment, b: Segment): boolean {
  const dx = a.to.col - a.from.col;
  const dy = a.to.row - a.from.row;
  const cross = (cell: Address): number =>
    dx * (cell.row - a.from.row) - dy * (cell.col - a.from.col);

  return isNearlyZero(cross(b.from)) && isNearlyZero(cross(b.to));
}

/**
 * 同じ場所に重ねて置かれた部品。
 *
 * Lcapy は同じ 2 点の間に 2 つ置いても**エラーも警告も出さずに重ねて描く**ので、
 * 気づけるのは図を見たときだけになる (実際に動かして確認した)。ここを行番号つきで
 * 返せることが、このプロジェクトが張り合う 2 点のうちの 1 つ。
 *
 * どちらが間違いかは書いた人にしか分からないので、部品は両方とも残して描く。
 */
function overlaps(parts: readonly PartSpec[]): FenceError[] {
  const errors: FenceError[] = [];

  for (const [index, part] of parts.entries()) {
    const first = parts.slice(0, index).find((earlier) => overlapping(earlier, part));
    if (first === undefined) continue;

    errors.push(
      fenceError(
        `部品 ${safeToken(part.id)} が ${safeToken(first.id)} と同じ場所に重なっています`,
        part.line,
        first.line,
      ),
    );
  }

  return errors;
}

/**
 * ピンへ引いた線の上に、別の端が乗って**見える**ところ。
 *
 * ピン (`U1.out`) は記号ごとに決まった位置にあり、格子の上に無い。だから
 * 線がどこを通るかがこちら側では分からず、T 字かどうかを決められない。
 * 黙って別のネットにすると、図では触れて見えるのにネットリストだけ割れる。
 * つながりは変えずに、書き方を分けるよう伝える。
 *
 * ピンの位置は部品を置いた交点で代用して見当をつける。当て推量なので
 * **つなぐ判断には使わない** (外したときに出るのは余計な 1 行だけ)。
 */
function ambiguousTouches(circuit: Circuit, byId: ReadonlyMap<string, PartSpec>): FenceError[] {
  const ends = endpointsOf(circuit);
  const errors: FenceError[] = [];

  for (const wire of circuit.wires) {
    const guess = guessSegment(wire, byId);
    if (guess === null) continue;

    for (const cell of ends) {
      if (isSameAddress(cell, guess.from) || isSameAddress(cell, guess.to)) continue;
      if (!liesOn(cell, guess)) continue;

      errors.push(
        fenceError(
          `${formatAddress(cell)} はこの線の上に見えますが、ピンのある線ではつながりを決められません` +
            ` (${formatAddress(cell)} を通る配線に分けてください)`,
          wire.line,
        ),
      );
      break;
    }
  }

  errors.push(...touchesOnBodies(circuit, ends));
  errors.push(...slantedIntoPins(circuit, byId));

  return errors;
}

/**
 * `--` でピンへ引いていて、**斜めに入る**ところ。
 *
 * ピンは記号ごとに決まった位置にあり、格子の上に無い。`--` は 2 点を
 * まっすぐ結ぶので、中心線に乗っていないピンへ引くと斜めに入る。
 * 図は書いたとおりに描く (勝手に折らない) が、回路図としては直角に入るのが
 * 普通なので、`|-` / `-|` を添えて伝える。
 *
 * まっすぐ引けるのは、ピンが中心線に乗っていて、相手の番地がその軸に
 * 揃っているときだけ (`U1.out -- c7` のような書き方)。軸は表から引く
 * (parts.ts の pinAxis)。両端ともピンのときと、両端を番地で置く 2 端子部品の
 * ピン (ワイパー・ゲート) は**見ない** — 中心線がどこかを決められないので、
 * 当て推量で口を出さない。
 */
function slantedIntoPins(circuit: Circuit, byId: ReadonlyMap<string, PartSpec>): FenceError[] {
  const errors: FenceError[] = [];

  for (const wire of circuit.wires) {
    if (wire.operator !== '--') continue;

    const pin = wire.from.kind === 'pin' ? wire.from : wire.to.kind === 'pin' ? wire.to : null;
    const cell = cellOf(wire.from) ?? cellOf(wire.to);
    if (pin === null || cell === null) continue;

    const part = byId.get(pin.part);
    if (part === undefined || part.kind !== 'multi-terminal') continue;

    const type = partTypeOf(part);
    // **向きを渡す。** 記号を回すとピンの乗る中心線も回るので、渡さないと
    // 回した部品では正しく引いた線に「斜めです」と言い、斜めの線を黙って通す。
    const axis = type === null ? null : pinAxis(type, pin.pin, part.turn);
    // 交点の間の番地は 1/100 刻みの小数なので、丸めの残りを 0 として見る
    // (`===` だと、揃っている線に「斜めです」と言ってしまう)。
    if (axis === 'h' && isNearlyZero(cell.row - part.at.row)) continue;
    if (axis === 'v' && isNearlyZero(cell.col - part.at.col)) continue;

    // ピンはネットリストと同じ呼び名で言う (箱のピンは図に刷ってある名前)。
    errors.push(
      fenceError(
        `${safeToken(`${pin.part}.${pinRefName(type, pin.pin)}`)} へ -- で引くと斜めに入ります` +
          ` (|- か -| なら直角に入ります)`,
        wire.line,
      ),
    );
  }

  return errors;
}

/**
 * 部品の**体の上**に別の端が乗っているところ。
 *
 * 部品は 2 点の間に記号を描くので、その途中に線を当ててもピンではない。
 * つないだことにはできないが、図では触れて見えるので黙っていない。
 */
function touchesOnBodies(circuit: Circuit, ends: readonly Address[]): FenceError[] {
  const errors: FenceError[] = [];

  for (const part of circuit.parts) {
    if (part.kind !== 'two-terminal') continue;
    const body = { from: part.from, to: part.to };

    for (const cell of ends) {
      if (!liesOn(cell, body)) continue;

      errors.push(
        fenceError(
          `${formatAddress(cell)} は部品 ${safeToken(part.id)} の上に乗っています` +
            ` (部品の途中はつなげません。端の番地に寄せてください)`,
          part.line,
        ),
      );
      break;
    }
  }

  return errors;
}

/**
 * ピンのある配線のうち、**交点を拾いうる一辺**。無ければ null。
 *
 * ピンの位置は置かれた交点で代用するしかないが、**代用が効くかどうかは
 * ピンで決まる**:
 *
 * - **中心線に乗るピン** (`out` など。`pinAxis` が答える) は、その線が交点の
 *   並びに乗る。だから置かれた交点を通る線分でそのまま見てよい
 * - **中心線から外れたピン** (ボードの `GP27`、オペアンプの `±`) は、記号の縁の
 *   半端な高さに出る。そこから出る辺は**交点の並びに乗らない**ので、
 *   どの交点も通らない — 見なくてよい。折れた線なら、**交点の側の一辺だけ**が
 *   並びに乗るので、そちらを見る
 * - `--` で外れたピンへ引くと斜めに入る。それは別のお知らせ
 *   (`slantedIntoPins`) が言うので、ここでは重ねて言わない
 *
 * **見当で「つなぐ」判断はしない**のは今までどおり。見当が外れても、
 * 出る/出ないが変わるのはこのお知らせだけ。
 */
function guessSegment(wire: WireSpec, byId: ReadonlyMap<string, PartSpec>): Segment | null {
  const from = endpointCell(wire.from, byId);
  const to = endpointCell(wire.to, byId);
  const pin = wire.from.kind === 'pin' ? wire.from : wire.to.kind === 'pin' ? wire.to : null;
  if (pin === null || from === null || to === null || isSameAddress(from, to)) return null;

  const part = byId.get(pin.part);
  const type = part === undefined ? null : partTypeOf(part);
  const centred = part !== undefined && part.kind === 'multi-terminal' && type != null
    && pinAxis(type, pin.pin, part.turn) !== null;
  if (centred) return { from, to };

  // ここから下は、中心線から外れたピン。
  if (wire.operator === '--') return null;
  // 折れた線の**交点の側の一辺**。`-|` は先に横なので、角はピンの行と交点の列。
  const cell = pin === wire.from ? to : from;
  const other = pin === wire.from ? from : to;
  const corner = wire.operator === '-|'
    ? { row: (pin === wire.from ? other : cell).row, col: (pin === wire.from ? cell : other).col }
    : { row: (pin === wire.from ? cell : other).row, col: (pin === wire.from ? other : cell).col };
  return isSameAddress(corner, cell) ? null : { from: corner, to: cell };
}

function endpointCell(endpoint: Endpoint, byId: ReadonlyMap<string, PartSpec>): Address | null {
  if (endpoint.kind === 'cell') return endpoint.address;
  const part = byId.get(endpoint.part);
  return part !== undefined && part.kind === 'multi-terminal' ? part.at : null;
}

/**
 * 配線の端が指すピンを、circuitikz のアンカー名に揃える。
 *
 * `Q1.B` も `Q1.base` も `Q1.BASE` も同じピンなので、ここで 1 つの綴りにする。
 * 揃えないと、書き方の違いだけでネットが割れ、TeX にも存在しない
 * アンカー名 (`Q1.b`) を渡してしまう。
 * 指す先が無ければ理由を積んで null (その配線は描かない)。
 */
function resolvePins(
  wire: WireSpec,
  byId: ReadonlyMap<string, PartSpec>,
  errors: FenceError[],
): WireSpec | null {
  const ends = [wire.from, wire.to].map((endpoint) => resolveEndpoint(endpoint, wire.line, byId, errors));
  const [from, to] = ends;
  if (from === null || to === null || from === undefined || to === undefined) return null;

  // 揃えたあとで見ないと、`Q1.B -- Q1.base` のような同じピンどうしを見逃す。
  if (nameOfEndpoint(from) === nameOfEndpoint(to)) {
    errors.push(fenceError(`配線の両端が同じところです (${safeToken(nameOfEndpoint(from))})`, wire.line));
    return null;
  }

  return { ...wire, from, to };
}

/** 端 1 つを解決する。番地はそのまま、ピンはアンカー名に揃える。 */
function resolveEndpoint(
  endpoint: Endpoint,
  line: number,
  byId: ReadonlyMap<string, PartSpec>,
  errors: FenceError[],
): Endpoint | null {
  if (endpoint.kind !== 'pin') return endpoint;

  const part = byId.get(endpoint.part);
  if (part === undefined) {
    // 旧い番地に小数を書くとピンの形になる (`a1.5` は「a1 の 5 番ピン」)。
    // 部品が無いなら番地のつもりだった見込みが高いので、直せる形を添える。
    const near = oldSpellingHint(`${endpoint.part}.${endpoint.pin}`);
    const hint = near === null ? '' : ` (${near})`;
    errors.push(fenceError(`部品 ${safeToken(endpoint.part)} がありません${hint}`, line));
    return null;
  }

  // ピンを指せるかは種類が多端子かどうかではなく、ピンの表を持っているかで決まる
  // (ポテンショメータのように 2 端子でもピンを 1 本持つ種類がある)。
  const type = partTypeOf(part);
  if (type === null || type.pins === undefined) {
    errors.push(fenceError(`部品 ${safeToken(part.id)} (${safeToken(part.type)}) にピンの名前はありません`, line));
    return null;
  }

  const anchor = lookupPin(type, endpoint.pin);
  if (anchor === null) {
    errors.push(
      fenceError(
        `${safeToken(part.id)} にピン ${safeToken(endpoint.pin)} はありません (${pinHint(type)})`,
        line,
      ),
    );
    return null;
  }

  return { kind: 'pin', part: endpoint.part, pin: anchor };
}

/** 配線 1 本が通る線分。折れた線は 2 本、まっすぐな線は 1 本。 */
type Segment = { readonly from: Address; readonly to: Address };

/**
 * 配線が通る線分。ピン (`U1.out`) は格子の上に無いので、位置が分からない。
 * 両端が番地のときだけ線分として扱える (ピンが絡む線は幾何を見ない)。
 */
function segmentsOf(wire: WireSpec): Segment[] {
  const from = cellOf(wire.from);
  const to = cellOf(wire.to);
  if (from === null || to === null) return [];

  const corner = cornerOf(from, to, wire.operator);
  return corner === null
    ? [{ from, to }]
    : [{ from, to: corner }, { from: corner, to }];
}

/**
 * 交点が線分の**途中**に乗っているか。端は含まない。
 * 斜めの線もあるので、同じ直線上か (外積 0) と、両端の間か (内積) で見る。
 */
function liesOn(cell: Address, segment: Segment): boolean {
  const dx = segment.to.col - segment.from.col;
  const dy = segment.to.row - segment.from.row;
  const ex = cell.col - segment.from.col;
  const ey = cell.row - segment.from.row;

  if (!isNearlyZero(dx * ey - dy * ex)) return false;

  // 端にちょうど乗っているものは「途中」ではない (呼ぶ側が端を外している)。
  const along = ex * dx + ey * dy;
  const length = dx * dx + dy * dy;
  if (isNearlyZero(along) || isNearlyZero(along - length)) return false;

  return along > 0 && along < length;
}

/** 配線の途中に乗っている端 1 つ。 */
export type WireContact = { readonly cell: Address; readonly wire: WireSpec };

/**
 * 部品の端と配線の端のうち、番地で表せるもの。別の配線の途中に乗ると T 字。
 *
 * 多端子部品を置いた交点は**端ではない** (記号の真ん中で、ピンはそこに無い)。
 * 端として数えると、記号の下を通った線に黒丸が乗ってしまう。
 */
function endpointsOf(circuit: Circuit): Address[] {
  const parts = circuit.parts.flatMap((part) => {
    if (part.kind === 'two-terminal') return [part.from, part.to];
    return part.kind === 'one-terminal' ? [part.at] : [];
  });
  const wires = circuit.wires.flatMap((wire) =>
    [cellOf(wire.from), cellOf(wire.to)].filter((cell): cell is Address => cell !== null),
  );
  return [...parts, ...wires];
}

/**
 * 端が別の配線の途中に乗っているところ (T 字)。回路図の約束どおり、
 * ここは**つながっている**ものとして扱い、黒丸を打つ。
 * 十字に通り過ぎるだけ (どちらの端でもない) は数えない = つながらない。
 */
export function wireContacts(circuit: Circuit): WireContact[] {
  const endpoints = endpointsOf(circuit);
  const contacts: WireContact[] = [];
  const seen = new Set<string>();

  for (const [index, wire] of circuit.wires.entries()) {
    const segments = segmentsOf(wire);
    if (segments.length === 0) continue;

    const own = [cellOf(wire.from), cellOf(wire.to)].filter((cell): cell is Address => cell !== null);
    for (const cell of endpoints) {
      // その配線自身の端は「途中に乗った」ではない。
      if (own.some((end) => isSameAddress(cell, end))) continue;
      if (!segments.some((segment) => liesOn(cell, segment))) continue;

      // 鍵は配線そのもの (並びの位置) で作る。行番号だと、1 行に 2 本書いた
      // ときに片方の接点が落ちて、書き方だけでネットリストが変わってしまう。
      const key = `${cell.row},${cell.col}/${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({ cell, wire });
    }
  }

  return contacts;
}

/**
 * 図に出る値と向きを見る。**種類を問わず**通す
 * (1 つでも素通りすると、そこから任意の TeX を書けてしまう)。
 */
function checkPart(part: PartSpec, errors: FenceError[], target: TexTarget): PartSpec {
  const oriented = part.kind === 'two-terminal' ? part : checkOrientation(part, errors);
  const checked = oriented.kind === 'two-terminal' ? checkLabels(oriented, errors, target) : oriented;
  if (checked.kind === 'one-terminal' || checked.value === null) return checked;
  // **数には単位を要る** (素の数の C・L・水晶・電流源、大きい K)。字と同じく
  // 値だけ落として部品は残す — 黙って 47 F と描くよりは値の無い図のほうがよい。
  const unitless = checked.kind === 'two-terminal' ? unitValueProblem(checked.type, checked.value) : null;
  if (unitless !== null) {
    errors.push(fenceError(`部品 ${safeToken(checked.id)}: ${unitless}`, checked.line));
    return { ...checked, value: null };
  }
  if (isDrawable(checked.value, target)) return checked;

  errors.push(fenceError(`部品 ${safeToken(checked.id)}: ${valueProblem(checked.value, target)}`, checked.line));
  return { ...checked, value: null };
}

/**
 * 図に出る字 (`l=` `i=` `v=`) の関門。値と同じく**種類を問わず通す**
 * (1 つでも素通りすると、そこから任意の TeX を書けてしまう。約束 3)。
 * 読めない字は**その字だけ落として部品は残す** (値と同じ扱い。
 * ラベルを落とせば ID がそのまま図に出る)。
 *
 * `$…$` で囲んであれば数式の部分集合として読み直す。囲んでいなければ
 * 値と同じ字種で見る。**どちらも書かれた TeX がそのまま図へ行くことはない**。
 */
function checkLabels(part: TwoTerminalPart, errors: FenceError[], target: TexTarget): TwoTerminalPart {
  const check = (text: string | null, key: string): string | null => {
    if (text === null) return text;
    const subject = `部品 ${safeToken(part.id)} の ${key}=`;

    if (isMathLabel(text)) {
      const read = mathLabelTex(mathInnerOf(text));
      if (read.ok) return text;
      errors.push(fenceError(`${subject} : ${read.message}`, part.line));
      return null;
    }

    if (isDrawable(text, target)) return text;
    errors.push(fenceError(`${subject} : ${valueProblem(text, target)}`, part.line));
    return null;
  };

  return {
    ...part,
    label: check(part.label, 'l'),
    current: check(part.current, 'i'),
    voltage: check(part.voltage, 'v'),
  };
}

/**
 * 書かれた向きが、その種類に書けるものか。**表引き** (`parts.ts` の `orient`)。
 *
 * **回転と反転は別々に見る。** 回せても反転すると字が鏡文字になる記号があり
 * (DIP のピン番号と型番)、左右対称で反転しても図が変わらない記号もある
 * (`ground`)。書けない向きは**落として**から先へ渡す — TeX には検証済みの形
 * しか渡さない (設計上の約束 5)。
 */
function checkOrientation<P extends MultiTerminalPart | OneTerminalPart>(
  part: P,
  errors: FenceError[],
): P {
  const type = partTypeOf(part);
  const orient = type === null ? null : orientOf(type);
  if (orient === null) return part;

  let turn = part.turn;
  if (turn.rotate !== 0 && !orient.rotate) {
    errors.push(fenceError(
      `${safeToken(part.type)} は回せません (向きを書けるのは多端子部品と ground です)`,
      part.line,
    ));
    turn = { ...turn, rotate: 0 };
  }
  if (turn.mirror && !orient.mirror) {
    errors.push(fenceError(
      `${safeToken(part.type)} に mirror は書けません${orient.rotate ? ' (回転だけ書けます)' : ''}`,
      part.line,
    ));
    turn = { ...turn, mirror: false };
  }

  if (part.kind !== 'multi-terminal') return { ...part, turn };
  if (part.orientation === null || orient.signs) return { ...part, turn };

  errors.push(
    fenceError(`${safeToken(part.type)} に向き ${safeToken(part.orientation)} は書けません (opamp だけ)`, part.line),
  );
  return { ...part, orientation: null, turn };
}
