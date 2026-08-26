import { fenceError, safeToken } from '../errors.ts';
import { cornerOf, formatAddress, isSameAddress, parseAddress } from './address.ts';
import { lookupPartType, lookupPin, pinHint } from '../parts.ts';
import type { Address } from './address.ts';
import type { FenceDocument } from '../parser/parseFence.ts';
import { isDrawable } from '../tex/escape.ts';
import { cellOf, nameOfEndpoint } from '../types.ts';
import type {
  Endpoint, FenceError, MultiTerminalPart, NoteSpec, PartSpec, TexTarget, WireSpec,
} from '../types.ts';

/** 検証を通った図。ここから先 (ネットリスト導出・TeX 生成) は形を疑わない。 */
export type Circuit = {
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  /**
   * 図に重ねる注釈。**回路の一員ではない**ので、ネットリストにも
   * 分岐の黒丸の数え上げにも参加しない (parts と混ぜないのはそのため)。
   */
  readonly notes: readonly NoteSpec[];
};

/** 注釈が指す先。 */
export type NoteAnchor =
  | { readonly kind: 'part'; readonly part: PartSpec }
  | { readonly kind: 'cell'; readonly address: Address };

/**
 * 注釈の指し先を決める。**部品 ID を先に探し**、無ければ番地として読む。
 *
 * 番地は大小どちらで書いてもよいので、`C1` のような ID は番地 c1 とぶつかる。
 * 印を付けたくなるのはたいてい部品のほうなので、部品を先に見る
 * (裏を返すと、`C1` という部品がある図では番地 c1 を指せない)。
 */
export function resolveNoteTarget(
  target: string,
  byId: ReadonlyMap<string, PartSpec>,
): NoteAnchor | null {
  const part = byId.get(target);
  if (part !== undefined) return { kind: 'part', part };

  const address = parseAddress(target);
  return address === null ? null : { kind: 'cell', address };
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

  if (target === 'latex') return `${subject}に使えない文字があります (${LATEX_CHARSET} が使えます)`;

  // 書き出す .tex でなら通る字のときだけ、そちらへ誘導する。
  // どちらでも通らない字を .tex に送っても直らないので、使える字を伝える。
  if (isDrawable(value, 'latex')) {
    return `${subject}はプレビューの TeX にフォントがありません (circuit-fence render --emit-tex で .tex に書き出すと LaTeX で組めます)`;
  }
  return `${subject}に使えない文字があります (${ASCII_CHARSET} が使えます)`;
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
  // 足の名前は書き方が何通りかあるので、ここで 1 つに揃えてから先へ渡す。
  const wires = doc.wires
    .map((wire) => resolvePins(wire, byId, errors))
    .filter((wire): wire is WireSpec => wire !== null);
  // 指し先の無い注釈は描けない。1 つ落としても残りは描く。
  const notes = doc.notes.filter((note) => hasAnchor(note, byId, errors));
  const circuit: Circuit = { parts, wires, notes };

  errors.push(...overlaps(parts));

  return { circuit, errors, notices: ambiguousTouches(circuit, byId) };
}

/** 注釈の指し先があるか。無ければ理由を積んで、その注釈だけ落とす。 */
function hasAnchor(note: NoteSpec, byId: ReadonlyMap<string, PartSpec>, errors: FenceError[]): boolean {
  if (note.kind !== 'circle') return true;
  if (resolveNoteTarget(note.target, byId) !== null) return true;

  errors.push(
    fenceError(`注釈の指す先 ${safeToken(note.target)} がありません (部品 ID か番地で書きます)`, note.line),
  );
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

  return cross(b.from) === 0 && cross(b.to) === 0;
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
 * 足へ引いた線の上に、別の端が乗って**見える**ところ。
 *
 * 足 (`U1.out`) は記号ごとに決まった位置にあり、格子の上に無い。だから
 * 線がどこを通るかがこちら側では分からず、T 字かどうかを決められない。
 * 黙って別のネットにすると、図では触れて見えるのにネットリストだけ割れる。
 * つながりは変えずに、書き方を分けるよう伝える。
 *
 * 足の位置は部品を置いた交点で代用して見当をつける。当て推量なので
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
          `${formatAddress(cell)} はこの線の上に見えますが、足のある線ではつながりを決められません` +
            ` (${formatAddress(cell)} を通る配線に分けてください)`,
          wire.line,
        ),
      );
      break;
    }
  }

  errors.push(...touchesOnBodies(circuit, ends));

  return errors;
}

/**
 * 部品の**体の上**に別の端が乗っているところ。
 *
 * 部品は 2 点の間に記号を描くので、その途中に線を当てても足ではない。
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

/** 足のある配線が通りそうな線分。足の位置は置かれた交点で代用する。 */
function guessSegment(wire: WireSpec, byId: ReadonlyMap<string, PartSpec>): Segment | null {
  const from = endpointCell(wire.from, byId);
  const to = endpointCell(wire.to, byId);
  const hasPin = wire.from.kind === 'pin' || wire.to.kind === 'pin';

  return hasPin && from !== null && to !== null && !isSameAddress(from, to) ? { from, to } : null;
}

function endpointCell(endpoint: Endpoint, byId: ReadonlyMap<string, PartSpec>): Address | null {
  if (endpoint.kind === 'cell') return endpoint.address;
  const part = byId.get(endpoint.part);
  return part !== undefined && part.kind === 'multi-terminal' ? part.at : null;
}

/**
 * 配線の端が指す足を、circuitikz のアンカー名に揃える。
 *
 * `Q1.B` も `Q1.base` も `Q1.BASE` も同じ足なので、ここで 1 つの綴りにする。
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

  // 揃えたあとで見ないと、`Q1.B -- Q1.base` のような同じ足どうしを見逃す。
  if (nameOfEndpoint(from) === nameOfEndpoint(to)) {
    errors.push(fenceError(`配線の両端が同じところです (${safeToken(nameOfEndpoint(from))})`, wire.line));
    return null;
  }

  return { ...wire, from, to };
}

/** 端 1 つを解決する。番地はそのまま、足はアンカー名に揃える。 */
function resolveEndpoint(
  endpoint: Endpoint,
  line: number,
  byId: ReadonlyMap<string, PartSpec>,
  errors: FenceError[],
): Endpoint | null {
  if (endpoint.kind !== 'pin') return endpoint;

  const part = byId.get(endpoint.part);
  if (part === undefined) {
    errors.push(fenceError(`部品 ${safeToken(endpoint.part)} がありません`, line));
    return null;
  }

  // 足を指せるかは種類が多端子かどうかではなく、足の表を持っているかで決まる
  // (ポテンショメータのように 2 端子でも足を 1 本持つ種類がある)。
  const type = lookupPartType(part.type);
  if (type === null || type.pins === undefined) {
    errors.push(fenceError(`部品 ${safeToken(part.id)} (${safeToken(part.type)}) に足の名前はありません`, line));
    return null;
  }

  const anchor = lookupPin(type, endpoint.pin);
  if (anchor === null) {
    errors.push(
      fenceError(
        `${safeToken(part.id)} に足 ${safeToken(endpoint.pin)} はありません (${pinHint(type)})`,
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
 * 配線が通る線分。足 (`U1.out`) は格子の上に無いので、位置が分からない。
 * 両端が番地のときだけ線分として扱える (足が絡む線は幾何を見ない)。
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

  if (dx * ey - dy * ex !== 0) return false;

  const along = ex * dx + ey * dy;
  return along > 0 && along < dx * dx + dy * dy;
}

/** 配線の途中に乗っている端 1 つ。 */
export type WireContact = { readonly cell: Address; readonly wire: WireSpec };

/**
 * 部品の端と配線の端のうち、番地で表せるもの。別の配線の途中に乗ると T 字。
 *
 * 多端子部品を置いた交点は**端ではない** (記号の真ん中で、足はそこに無い)。
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
  const checked = part.kind === 'multi-terminal' ? checkOrientation(part, errors) : part;
  if (checked.kind === 'one-terminal' || checked.value === null) return checked;
  if (isDrawable(checked.value, target)) return checked;

  errors.push(fenceError(`部品 ${safeToken(checked.id)}: ${valueProblem(checked.value, target)}`, checked.line));
  return { ...checked, value: null };
}

/** 向きはオペアンプにしかない。ほかに書くと circuitikz が知らないキーになる。 */
function checkOrientation(part: MultiTerminalPart, errors: FenceError[]): MultiTerminalPart {
  if (part.orientation === null || part.type === 'opamp') return part;

  errors.push(
    fenceError(`${safeToken(part.type)} に向き ${safeToken(part.orientation)} は書けません (opamp だけ)`, part.line),
  );
  return { ...part, orientation: null };
}
