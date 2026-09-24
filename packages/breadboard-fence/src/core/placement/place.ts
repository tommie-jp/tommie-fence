import { fail, ok, safeToken } from '../errors.ts';
import { formatAddress, isCrossing, parseAddress } from '../model/address.ts';
import { offBoardReason } from '../model/board.ts';
import { HOLE_ROWS } from '../types.ts';
import type {
  Address, Board, FenceError, HoleAddress, HoleRow, PartKind, PartSpec, PlacedPart, PlacedPin,
  RailAddress, Result,
} from '../types.ts';
import type { BoardPart, Connector, NamedChip } from 'fence-kit';
import { MIN_CONNECTOR_PINS, adapterFor, isDirectSmd, lookupNamedChip, smdLooksOf, smdSuggestion } from 'fence-kit';
import type { Turn } from '../parts/orient.ts';
import { isPolarVariant, typesWithVariants, variantsOf } from '../parts/variants.ts';
import { describeUnknownType, lookupFootprint } from './footprints.ts';

export type PlaceResult = { readonly parts: readonly PlacedPart[]; readonly errors: readonly FenceError[] };

/** 部品の骨格。ピンと形が決まる前の、フェンスに書かれたままの部分。 */
type PartBase = Omit<PlacedPart, 'kind' | 'pins' | 'bridges'>;

/** 6mm 角のタクトスイッチが溝をまたいでまたぐ列の数。 */
const SWITCH_SPAN = 2;

/**
 * 部品を穴に落とし込む。1 つ失敗しても残りは描けるように、
 * 失敗した部品だけを捨てて errors に積む。
 */
export function placeParts(specs: readonly PartSpec[], board: Board): PlaceResult {
  const parts: PlacedPart[] = [];
  const errors: FenceError[] = [];
  const claims = new Map<string, Claim>();

  for (const spec of specs) {
    const placed = placePart(spec, board);
    if (!placed.ok) {
      errors.push(placed.error);
      continue;
    }

    const badVariant = variantError(placed.value);
    if (badVariant) {
      errors.push(badVariant);
      continue;
    }

    const covered = coveredHoles(placed.value);
    const conflict = findConflict(placed.value, covered, claims);
    if (conflict) {
      errors.push(conflict);
      continue;
    }

    for (const pin of placed.value.pins) {
      if (pin.address) claims.set(formatAddress(pin.address), { id: placed.value.id, body: false });
    }
    for (const address of covered) claims.set(formatAddress(address), { id: placed.value.id, body: true });
    parts.push(placed.value);
  }

  return { parts, errors };
}

/** その穴を押さえている部品。body なら足ではなく本体の下という意味。 */
type Claim = { readonly id: string; readonly body: boolean };

/** ピン名に書く極性の印。 */
const POLARITY_MARKS: ReadonlySet<string> = new Set(['+', '-']);

/**
 * 書かれた姿がその種類に合うか。**極性のない部品に極性が付いていたら**報告する
 * (そのまま組むと部品を壊すため)。
 *
 * 逆に「向きのある姿にピン名が無い」のはエラーにしない。
 * **極性・向きのある 2 端子は、先に書いた穴が + 側 (アノード)** という規則が
 * フェンス全体にかかっているので、書かなくても向きは決まる (circuit-fence と同じ
 * 1 文の規則)。led と diode は最初からこの規則で描いていたので、
 * 電解とタンタルだけがタグ必須という食い違いをここで畳んだ。
 */
function variantError(part: PlacedPart): FenceError | null {
  const { variant } = part;
  if (variant === null) return null;

  const allowed = variantsOf(part.type);
  const direct = directSmdError(part, variant, allowed);
  if (direct !== null) return direct;
  if (allowed.length === 0) {
    return {
      message:
        `部品 ${safeToken(part.id)}: ${safeToken(part.type)} の姿は選べません ` +
        `(姿を選べるのは ${typesWithVariants().join(', ')})`,
      line: part.line,
      token: part.written,
    };
  }
  if (!allowed.includes(variant)) {
    // 別名 (`s-mini`) は綴りとしては受け取らず、表の綴りを返す。
    // この板は変換基板に載せた姿だけなので、`s-mini` は `sot346-dip` へ案内する。
    const target = smdSuggestion(part.type, variant, allowed);
    const hint = target !== null
      ? `${safeToken(variant)} は ${target} と書きます`
      : `${safeToken(part.type)} に使えるのは ${allowed.join(', ')}`;
    return {
      message: `知らない姿です: ${safeToken(variant)} (${hint})`,
      line: part.line,
      token: part.written,
    };
  }

  // ここから先の variant は表にある名前なので、そのまま文面に出してよい。
  if (isPolarVariant(variant)) return null;
  if (part.pins.some((pin) => POLARITY_MARKS.has(pin.name))) {
    return {
      message: `部品 ${safeToken(part.id)}: ${variant} は無極性なので (+) (-) は書けません`,
      line: part.line,
    };
  }
  return null;
}

/**
 * 直付けの面実装 (`resistor/2012` `transistor/sot346`)。**ユニバーサル基板の姿**で、
 * 足がブレッドボードの穴に届かない。知らない姿として断ると「書けるのに表に無い」と
 * 読めるので、**なぜ挿せないかと、書き直し先**を言う (52 の docs/64)。
 */
function directSmdError(part: PlacedPart, variant: string, allowed: readonly string[]): FenceError | null {
  if (!isDirectSmd(variant) || allowed.includes(variant)) return null;
  const adapter = adapterFor(part.type, variant);
  // **その種類がその姿で直付けできるときだけ** perfboard を勧める。`diode/2012` のように
  // どこでも書けない姿は、知らない姿として断る (書き直した先でまた断られないように)。
  if (adapter === null && !smdLooksOf(part.type, 'perfboard').includes(variant)) return null;
  const instead = adapter === null
    ? 'ユニバーサル基板 (perfboard) なら直付けで書けます'
    : `変換基板に載せて ${safeToken(part.type)}/${adapter} と書きます`;
  return {
    message: `部品 ${safeToken(part.id)}: ${variant} は面実装なので、ブレッドボードには挿せません。${instead}`,
    line: part.line,
    token: part.written,
  };
}

/**
 * 本体が板に載る部品 (パッケージ) の、**ピンで囲まれた内側の穴**。
 * タクトスイッチの真ん中の列や、マイコンボードの下に隠れる行がこれで、
 * 実物では何も挿せない。抵抗のように胴が板から浮く部品は対象にしない
 * (またいだ穴はそのまま使えるため)。
 */
const COVERING_KINDS: ReadonlySet<PartKind> = new Set<PartKind>(['switch', 'dip', 'sip', 'board']);

/** 部品が塞いでいる穴ぜんぶ (足の穴 + 本体の下)。寄せ (relocate.ts) の台帳がこれを数える。 */
export function occupiedHoles(part: PlacedPart): Address[] {
  return [
    ...part.pins.flatMap((pin) => (pin.address ? [pin.address] : [])),
    ...coveredHoles(part),
  ];
}

/**
 * 部品の絵が載っている穴。足の穴と、足が張る矩形の中の穴。
 *
 * `occupiedHoles` と分けてあるのは、見ているものが違うから。あちらは
 * 「実物で足を挿せない穴」なので、胴が板から浮く 2 本足の下は数えない。
 * こちらは「図の上で絵に埋まっている穴」で、浮いていようと絵が載っていれば数える。
 * 行に沿ってまっすぐ引く配線が、ここを通ると部品につながって見えてしまう。
 *
 * **縦や斜めに挿した部品も数える。** `resistor a5 c5` の胴は b5 の上に描かれるので、
 * 足の並びを 1 行に限ると、その胴を配線がまっすぐ突き抜ける。
 */
export function drawnOverHoles(part: PlacedPart): Address[] {
  return [
    ...part.pins.flatMap((pin) => (pin.address ? [pin.address] : [])),
    ...spannedHoles(part),
  ];
}

export function coveredHoles(part: PlacedPart): Address[] {
  return COVERING_KINDS.has(part.kind) ? spannedHoles(part) : [];
}

/** 足が張る矩形の中の穴 (足の穴そのものは除く)。 */
function spannedHoles(part: PlacedPart): Address[] {
  const pins = part.pins.flatMap((pin) => (pin.address ? [pin.address] : []));
  const rails = pins.filter((address): address is RailAddress => address.kind === 'rail');
  // 足が全部レールに並ぶ部品。レールは行の格子に乗らないので別に数える。
  if (rails.length >= 2 && rails.length === pins.length) return spannedOnRail(rails);

  const holes = pins.filter((address): address is HoleAddress => address.kind === 'hole');
  if (holes.length === 0) return [];

  const rows = holes.map((hole) => HOLE_ROWS.indexOf(hole.row));
  const cols = holes.map((hole) => hole.col);
  const own = new Set(holes.map(formatAddress));

  const covered: Address[] = [];
  for (let row = Math.min(...rows); row <= Math.max(...rows); row += 1) {
    const name = HOLE_ROWS[row];
    if (!name) continue;
    for (let col = Math.min(...cols); col <= Math.max(...cols); col += 1) {
      const address: Address = { kind: 'hole', row: name, col };
      if (!own.has(formatAddress(address))) covered.push(address);
    }
  }
  return covered;
}

/** 同じレールに並ぶ足の間。足が別々のレールに散っていれば、間に穴は無い。 */
function spannedOnRail(rails: readonly RailAddress[]): Address[] {
  const [{ polarity, side }] = rails as [RailAddress];
  if (rails.some((rail) => rail.polarity !== polarity || rail.side !== side)) return [];

  const cols = rails.map((rail) => rail.col);
  const between: Address[] = [];
  for (let col = Math.min(...cols) + 1; col < Math.max(...cols); col += 1) {
    between.push({ kind: 'rail', polarity, side, col });
  }
  return between;
}

function findConflict(
  part: PlacedPart,
  covered: readonly Address[],
  claims: ReadonlyMap<string, Claim>,
): FenceError | null {
  const own = new Set<string>();
  const wanted = [
    ...part.pins.flatMap((pin) => (pin.address ? [{ address: pin.address, body: false }] : [])),
    ...covered.map((address) => ({ address, body: true })),
  ];

  for (const { address, body } of wanted) {
    const name = formatAddress(address);
    const claim = claims.get(name);

    if (claim) {
      // 本体がからむときは、どちらの本体の下なのかを名指しする。
      const message = body || claim.body
        ? `${name} は部品 ${safeToken(body ? part.id : claim.id)} の本体の下です`
        : `${name} は部品 ${safeToken(claim.id)} が使っています`;
      return { message, line: part.line };
    }
    // 同じ部品の 2 本の足が同じ穴に入る = 部品を短絡させている。
    if (!body && own.has(name)) {
      return { message: `部品 ${safeToken(part.id)} の足が 2 本とも ${name} に入っています`, line: part.line };
    }
    own.add(name);
  }

  return null;
}

function placePart(spec: PartSpec, board: Board): Result<PlacedPart> {
  const footprint = lookupFootprint(spec.type);
  if (!footprint) {
    return fail(
      `知らない部品の種類です: ${safeToken(spec.type)} (${describeUnknownType(spec.type)})`,
      spec.line,
      spec.written,
    );
  }

  const base: PartBase = {
    id: spec.id,
    type: spec.type,
    written: spec.written,
    variant: spec.variant,
    value: spec.value,
    label: spec.label,
    at: spec.at,
    line: spec.line,
  };

  if (footprint.kind === 'device') {
    if (!spec.pins || spec.pins.length === 0) {
      return fail(`部品 ${safeToken(spec.id)}: ボード外の機器には pins (ピン名の配列) が要ります`, spec.line);
    }
    return ok({
      ...base,
      kind: 'device',
      at: spec.at ?? 'top',
      bridges: [],
      pins: spec.pins.map((name) => ({ name, address: null })),
    });
  }

  if (footprint.kind === 'two-lead' || footprint.kind === 'three-lead' || footprint.kind === 'four-lead') {
    const legs = footprint.kind === 'two-lead' ? 2 : footprint.kind === 'three-lead' ? 3 : 4;
    return placeLegs(spec, board, base, legs, footprint.kind);
  }

  if (footprint.kind === 'connector') return placeConnector(spec, board, base, footprint.connector);
  if (footprint.kind === 'switch') return placeSwitch(spec, board, base);
  if (footprint.kind === 'sip') return placeSip(spec, board, base, footprint.pins);
  if (footprint.kind === 'board') return placeBoard(spec, board, base, footprint.board);
  if (footprint.kind === 'named') {
    return placeNamed(spec, board, base, lookupNamedChip(spec.type, spec.variant) ?? footprint.chip);
  }
  return placeDip(spec, board, base, footprint.pins);
}

/** 足の数だけ穴番地を並べて書く部品 (抵抗・トランジスタなど)。 */
function placeLegs(
  spec: PartSpec,
  board: Board,
  base: PartBase,
  legs: number,
  kind: 'two-lead' | 'three-lead' | 'four-lead',
): Result<PlacedPart> {
  if (spec.holes.length !== legs) {
    return fail(`部品 ${safeToken(spec.id)}: 穴番地を ${legs} つ書きます (今は ${spec.holes.length} つ)`, spec.line);
  }

  const pins: PlacedPin[] = [];
  for (const hole of spec.holes) {
    const address = resolveHole(hole.addr, board, spec.line);
    if (!address.ok) return address;
    // 同じ名前が 2 本あると `D1.A` がどちらを指すか決まらない。
    if (pins.some((pin) => pin.name === hole.tag)) {
      return fail(`部品 ${safeToken(spec.id)}: ピン名 ${safeToken(hole.tag)} が 2 回出てきます`, spec.line);
    }
    pins.push({ name: hole.tag, address: address.value });
  }
  return ok({ ...base, kind, bridges: [], pins });
}

/**
 * USB コネクタ。**書いた穴がそのまま足**で、名前は書いた順に表から当てる
 * (`VBUS GND D+ D-`)。実物の変換基板は足の並びが製品ごとに違うので、並びは
 * 決め打たない (変圧器と同じ)。**穴に名前 `(GND)` は書かせない** — 名前は表が
 * 決めるので、書けると同じ足が 2 つの名前を持つ。
 */
function placeConnector(spec: PartSpec, board: Board, base: PartBase, connector: Connector): Result<PlacedPart> {
  const order = connector.pins.join(' ');
  const most = connector.pins.length;
  if (spec.holes.length < MIN_CONNECTOR_PINS || spec.holes.length > most) {
    return fail(
      `部品 ${safeToken(spec.id)}: 穴番地を ${MIN_CONNECTOR_PINS}〜${most} つ、${order} の順に書きます`
      + ` (今は ${spec.holes.length} つ。電源だけなら 2 つ)`,
      spec.line,
    );
  }
  const tagged = spec.holes.find((hole) => hole.tagged);
  if (tagged) {
    return fail(
      `部品 ${safeToken(spec.id)}: 足の名前は表の順で決まるので、穴に (${safeToken(tagged.tag)}) は書けません`
      + ` (${order} の順に穴を書きます)`,
      spec.line,
    );
  }

  const pins: PlacedPin[] = [];
  for (const [index, hole] of spec.holes.entries()) {
    const address = resolveHole(hole.addr, board, spec.line);
    if (!address.ok) return address;
    pins.push({ name: connector.pins[index] ?? String(index + 1), address: address.value });
  }
  return ok({ ...base, kind: 'connector', bridges: [], pins });
}

/**
 * `@ 穴` で置く部品のアンカーの穴。2 列の形 (DIP・ボード) は胴の左端の列、
 * 1 列の形 (SIP) は 1 番ピンの穴。
 */
function anchorHole(spec: PartSpec, board: Board, example: string): Result<HoleAddress> {
  const anchorRef = spec.holes[0];
  if (spec.holes.length !== 1 || !anchorRef) {
    return fail(`部品 ${safeToken(spec.id)}: アンカーの穴を 1 つだけ書きます (例: ${example})`, spec.line);
  }

  const anchor = resolveHole(anchorRef.addr, board, spec.line);
  if (!anchor.ok) return anchor;
  if (anchor.value.kind !== 'hole') {
    return fail(`部品 ${safeToken(spec.id)}: レールではなく穴に置きます (例: ${example})`, spec.line);
  }
  return ok(anchor.value);
}

const rightEdge = (spec: PartSpec, board: Board, lastCol: number): FenceError | null =>
  lastCol > board.columns
    ? { message: `部品 ${safeToken(spec.id)}: ボードの右端 (${board.columns} 列) をはみ出します`, line: spec.line }
    : null;

/**
 * 穴の行の、板の上での位置 (ピッチ単位)。**溝は 3 ピッチぶん** — e と f の間が
 * 0.3 インチで、DIP がちょうどまたぐ。
 */
const ROW_POSITION: Readonly<Record<HoleRow, number>> = {
  a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11,
};

/**
 * **`r180` は名前を半周ずらす。** 穴は動かない — 2 列は溝をまたいで
 * e 行と f 行に固定されているので、回しても部品が覆う升は同じ。変わるのは
 * **どの升が 1 番ピンか**で、それは升の並びを一周とみなして半分だけ送るのと同じ
 * (並びを逆にすると裏返しになる。実物の IC は裏返して挿せないので、書き方も無い)。
 */
const spun = (names: readonly string[], turn: Turn): readonly string[] =>
  (turn.rotate === 0 ? names : [...names.slice(names.length / 2), ...names.slice(0, names.length / 2)]);

/**
 * 溝をまたいで 2 列に並ぶピンを穴に落とす。**実物を上から見た並び** — 切り欠きを
 * 左にすると 1 番は左下で、下の列を右へ進み、折り返して上の列を左へ戻る
 * (反時計回り)。**アンカーは胴の置き場 (左端の列) を決めるだけ**で、溝の上下の
 * どちらの行に書いても同じ向きに挿さる。
 *
 * 以前は 1 番をアンカーの行に置いていて、上のブロックに書くと 1 番が左上に来た
 * — 実物を裏から見た形 (鏡像) で、どう挿しても作れない (52 の docs/71)。
 */
function dualRowPins(anchor: HoleAddress, oppositeRow: HoleRow, names: readonly string[]): PlacedPin[] {
  const half = names.length / 2;
  const anchorBelow = ROW_POSITION[anchor.row] > ROW_POSITION[oppositeRow];
  const lower = anchorBelow ? anchor.row : oppositeRow;
  const upper = anchorBelow ? oppositeRow : anchor.row;
  return names.map((name, index) => {
    const pin = index + 1;
    const onLowerRow = pin <= half;
    return {
      name,
      address: {
        kind: 'hole',
        row: onLowerRow ? lower : upper,
        col: onLowerRow ? anchor.col + pin - 1 : anchor.col + (names.length - pin),
      } satisfies Address,
    };
  });
}

function placeDip(spec: PartSpec, board: Board, base: PartBase, pinCount: number): Result<PlacedPart> {
  const anchor = anchorHole(spec, board, 'dip8 @ e5');
  if (!anchor.ok) return anchor;
  if (anchor.value.row !== 'e' && anchor.value.row !== 'f') {
    return fail(`部品 ${safeToken(spec.id)}: dip は溝をまたぐので e 行か f 行に置きます`, spec.line);
  }

  const overflow = rightEdge(spec, board, anchor.value.col + pinCount / 2 - 1);
  if (overflow) return { ok: false, error: overflow };

  const names = Array.from({ length: pinCount }, (_, index) => String(index + 1));
  const oppositeRow: HoleRow = anchor.value.row === 'e' ? 'f' : 'e';
  return ok({
    ...base,
    kind: 'dip',
    bridges: [],
    pins: dualRowPins(anchor.value, oppositeRow, spun(names, spec.turn)),
  });
}

/** その行から、溝の向こうへ `span` ピッチ先の行。届かなければ null。 */
function acrossGap(row: HoleRow, span: number): HoleRow | null {
  const upper = ROW_POSITION[row] < ROW_POSITION.f;
  const wanted = ROW_POSITION[row] + (upper ? span : -span);
  const found = HOLE_ROWS.find((one) => ROW_POSITION[one] === wanted && (ROW_POSITION[one] < ROW_POSITION.f) !== upper);
  return found ?? null;
}

/**
 * 足に名前のある DIP 型 (リレー・フォトカプラ・7 セグ)。**DIP と同じ並べ方**で、
 * 列の間は表の穴数、足があるのは表の位置だけ。アンカーの行から、向かいの列は
 * 溝の向こうの `rowSpan` ピッチ先 (G5V-2 は e↔f、7 セグは b↔f 〜 e↔i)。
 */
function placeNamed(spec: PartSpec, board: Board, base: PartBase, chip: NamedChip): Result<PlacedPart> {
  const anchor = anchorHole(spec, board, `${chip.type} @ e5`);
  if (!anchor.ok) return anchor;

  const oppositeRow = acrossGap(anchor.value.row, chip.rowSpan);
  if (oppositeRow === null) {
    const upper = HOLE_ROWS.filter((row) => ROW_POSITION[row] < ROW_POSITION.f && acrossGap(row, chip.rowSpan) !== null);
    const lower = HOLE_ROWS.filter((row) => ROW_POSITION[row] >= ROW_POSITION.f && acrossGap(row, chip.rowSpan) !== null);
    return fail(
      `部品 ${safeToken(spec.id)}: ${chip.type} は溝をまたぐので ${upper.join('・')} 行か ${lower.join('・')} 行に置きます`,
      spec.line,
    );
  }

  const perRow = chip.positions / 2;
  const overflow = rightEdge(spec, board, anchor.value.col + perRow - 1);
  if (overflow) return { ok: false, error: overflow };

  // **足の無い位置は空の名前で持って回し、並べてから落とす** — 回すと位置が
  // 巡るので、先に落とすと向かいの列へ行く足を数え違える。
  const names = Array.from({ length: chip.positions }, (_, index) =>
    chip.pins.find((pin) => pin.at === index + 1)?.name ?? '');
  return ok({
    ...base,
    kind: 'dip',
    bridges: [],
    // 何も書かれていなければ品名を出す (マイコンボードと同じ)。
    label: base.label ?? (base.value === null ? chip.name : null),
    pins: dualRowPins(anchor.value, oppositeRow, spun(names, spec.turn)).filter((pin) => pin.name !== ''),
  });
}

/**
 * 0.7 インチ (7 ピッチ) 幅のマイコンボード。ピンの 2 列は上下ブロックの同じ位置の行
 * (a↔f, b↔g, c↔h, …) にちょうど落ちる。
 */
function placeBoard(spec: PartSpec, board: Board, base: PartBase, part: BoardPart): Result<PlacedPart> {
  const anchor = anchorHole(spec, board, 'pico @ h5');
  if (!anchor.ok) return anchor;

  const overflow = rightEdge(spec, board, anchor.value.col + part.pins.length / 2 - 1);
  if (overflow) return { ok: false, error: overflow };

  const oppositeRow = HOLE_ROWS[(HOLE_ROWS.indexOf(anchor.value.row) + HOLE_ROWS.length / 2) % HOLE_ROWS.length];
  if (!oppositeRow) return fail(`部品 ${safeToken(spec.id)}: この行には置けません`, spec.line);

  return ok({
    ...base,
    kind: 'board',
    bridges: [],
    // 何も書かれていなければ製品名を出す。図と部品リストに「何を挿すのか」が残る。
    label: base.label ?? (base.value === null ? part.name : null),
    pins: dualRowPins(anchor.value, oppositeRow, spun(part.pins, spec.turn)),
  });
}

/** 1 列に並んだヘッダ。ピン名を書けるので、ヘッダ 1 列のモジュールをこれで賄う。 */
function placeSip(spec: PartSpec, board: Board, base: PartBase, pinCount: number): Result<PlacedPart> {
  const anchor = anchorHole(spec, board, 'sip4 @ a20');
  if (!anchor.ok) return anchor;

  const names = spec.pins ?? Array.from({ length: pinCount }, (_, index) => String(index + 1));
  if (names.length !== pinCount) {
    return fail(
      `部品 ${safeToken(spec.id)}: pins は ${pinCount} 本ぶんの名前を書きます (今は ${names.length} 本)`,
      spec.line,
    );
  }

  const overflow = rightEdge(spec, board, anchor.value.col + pinCount - 1);
  if (overflow) return { ok: false, error: overflow };

  // **1 列に並ぶ形の `r180` は名前を逆順にする。** 升は同じで、端が入れ替わる
  // (2 列の形と違って一周にならないので、半周ではなく逆順)。
  const ordered = spec.turn.rotate === 0 ? names : [...names].reverse();
  return ok({
    ...base,
    kind: 'sip',
    bridges: [],
    pins: ordered.map((name, index) => ({
      name,
      address: { kind: 'hole', row: anchor.value.row, col: anchor.value.col + index } satisfies Address,
    })),
  });
}

/**
 * 溝をまたぐ 4 本足のタクトスイッチ。**同じ側の 2 本は押していなくてもつながっている**ので、
 * その組を bridges で申告する。ここを黙っていると、図から導いたネットリストが実物と食い違う。
 */
function placeSwitch(spec: PartSpec, board: Board, base: PartBase): Result<PlacedPart> {
  const anchor = anchorHole(spec, board, 'button @ e5');
  if (!anchor.ok) return anchor;
  if (anchor.value.row !== 'e' && anchor.value.row !== 'f') {
    return fail(`部品 ${safeToken(spec.id)}: button は溝をまたぐので e 行か f 行に置きます`, spec.line);
  }

  const overflow = rightEdge(spec, board, anchor.value.col + SWITCH_SPAN);
  if (overflow) return { ok: false, error: overflow };

  const { row, col } = anchor.value;
  const oppositeRow: HoleRow = row === 'e' ? 'f' : 'e';
  const leg = (name: string, legRow: HoleRow, legCol: number): PlacedPin => ({
    name,
    address: { kind: 'hole', row: legRow, col: legCol } satisfies Address,
  });

  return ok({
    ...base,
    kind: 'switch',
    pins: [
      leg('1a', row, col),
      leg('1b', row, col + SWITCH_SPAN),
      leg('2a', oppositeRow, col),
      leg('2b', oppositeRow, col + SWITCH_SPAN),
    ],
    bridges: [['1a', '1b'], ['2a', '2b']],
  });
}

function resolveHole(text: string, board: Board, line: number): Result<Address> {
  const address = parseAddress(text);
  if (!address) return fail(`穴番地として読めません: ${safeToken(text)} (a5 や +t5 のように書きます)`, line, text);
  // **足は穴に挿す。** 交点の間 (`b5c3`) を書けるのは注釈だけで、部品と配線は
  // 交点そのものを指す — 間に挿せる穴は実物に無い。
  if (!isCrossing(address)) {
    return fail(`穴の間には挿せません: ${safeToken(text)} (交点の間を書けるのは注釈だけです)`, line, text);
  }
  const reason = offBoardReason(board, address);
  if (reason) return fail(reason, line);
  return ok(address);
}
