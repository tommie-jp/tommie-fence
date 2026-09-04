import { element, escapeMarkup, fit, num, svgText, textWidth } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { formatAddress } from '../model/address.ts';
import { drawBox, drawGlyph, glyphOf, glyphSpan, legGap, namesInside } from './mapGlyphs.ts';
import type { GlyphName } from './mapGlyphs.ts';
import type { Chip, ChipPin, Cell, Dot, GridMap, MapNote, WireLine } from './map.ts';
import type { PinSide, Turn } from '../parts.ts';

/**
 * マップの絵。**webview に渡す本体**で、ここも core の純関数
 * (vscode を知らないので、そのままユニットテストに掛かる)。
 *
 * 表ではなく 1 枚の SVG。**升をまたぐ部品と、折れる配線を描くため**で、
 * 表では線が引けず、2 端子部品は片方の升にしか置けなかった。
 *
 * フェンスから来た字は必ずエスケープする。webview は拡張が渡した markup を
 * サニタイズしない (プレビューと同じ約束)。`element` と `svgText` が
 * 属性と中身を通すので、**素の文字列連結で外の字を入れない**。
 */

/** マスの間隔。狭い脇のパネルに 10 列ほど収まる大きさ。 */
const PITCH = 34;
/**
 * 行と列の見出しに要る余白。**上は名前 1 行ぶん余計に空ける** —
 * 一番上の行に置いた部品の名前は記号の上に出るので、詰めると縁で切れる。
 */
const PAD_X = 20;
const PAD_Y = 32;
/** 列の見出しを置く高さ。部品の名前より上。 */
const AXIS_Y = 11;
/** 右と下の余り。記号が縁で切れないように。 */
const EDGE = 14;

const x = (col: number): number => PAD_X + col * PITCH;
const y = (row: number): number => PAD_Y + row * PITCH;

const layer = (klass: string, children: string): string =>
  (children === '' ? '' : element('g', { class: klass }, children));

const at = (cell: Cell, children: string, attrs: Record<string, string> = {}): string =>
  element('g', { ...attrs, transform: `translate(${num(x(cell.col))},${num(y(cell.row))})` }, children);

/**
 * 見せる升の数。**書かれた番地だけでなく、描いたものが届くところまで**出す。
 * 40 本のボードは升 1 つに置くが箱は何行にも広がるので、書かれた番地の数だけ
 * 点と見出しを出すと、部品の横に行の字が無い状態になる (実機で指摘された)。
 *
 * 伸ばせるのは**下と右だけ** — 行の名前は a から始まり、その上が無い。
 */
export type Shown = { readonly rows: number; readonly cols: number };

const shownOf = (map: GridMap, room: Room): Shown => ({
  rows: Math.min(MAX_ROWS, Math.max(map.rows, Math.ceil((room.bottom - EDGE - PAD_Y) / PITCH) + 1)),
  cols: Math.min(LIMITS.columns, Math.max(map.cols, Math.ceil((room.right - EDGE - PAD_X) / PITCH) + 1)),
});

/** 行の名前は a〜z の 26 まで。 */
const MAX_ROWS = 26;

/** 交点の目印。**升目そのもの**で、置ける場所がここだと分かる。 */
function drawGrid(map: Shown): string {
  const dots: string[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      dots.push(element('circle', { class: 'cf-grid-dot', cx: num(x(col)), cy: num(y(row)), r: 1.5 }));
    }
  }
  return layer('cf-grid', dots.join(''));
}

/** 行と列の見出し (a〜z と 1〜99)。番地を目で数えられるように。 */
function drawLabels(map: Shown): string {
  const cols = Array.from({ length: map.cols }, (_, col) =>
    svgText(x(col), AXIS_Y, String(col + 1), { class: 'cf-axis' }));
  const rows = Array.from({ length: map.rows }, (_, row) =>
    svgText(PAD_X - 12, y(row) + 4, formatAddress({ row, col: 0 }).slice(0, 1), { class: 'cf-axis' }));
  return layer('cf-axes', [...cols, ...rows].join(''));
}

/**
 * 配線を掴むための当たり判定。**見える線は細すぎて押せない** (1.5) ので、
 * 同じ経路に太い透明な線を重ねる。見える線と分けてあるのは、太くすると
 * 図が変わってしまうため。
 */
const grabWire = (wire: WireLine, dots: PinPoints): string =>
  element('polyline', {
    class: 'cf-wire-hit',
    'data-line': wire.line,
    points: pathOf(wire, dots),
  });

/**
 * 引いた線。ピンで書いた端は近似なので破線にして、正確な位置を約束しない
 * (**図の足の位置は記号の形が決める**ので、升目のものとは限らない)。
 * 読めなかった行に書かれていれば印を足す (**帯と絵で同じものを指す**)。
 */
const drawWire = (wire: WireLine, bad: Bad, dots: PinPoints): string =>
  element('polyline', {
    class: classOf(wire.approximate ? 'cf-wire cf-approx' : 'cf-wire', wire.line, bad),
    // 書かれた行。エディタのカーソルが来たとき、この線を光らせる目印。
    'data-line': wire.line,
    points: pathOf(wire, dots),
  });

/** 画布の四隅。**升目の外へ出た部品と札まで含める。** */
type Room = {
  readonly left: number; readonly top: number;
  readonly right: number; readonly bottom: number;
};

/** 足の名前 1 つが要る横幅。字の大きさは `.cf-pin-name` の 8px。 */
const PIN_NAME_FONT = 8;

/**
 * 画布に要る広さ。**升目・部品の箱・注釈の札**のどれも入るところまで取る。
 *
 * 升目だけで測ると、升 1 つに置く大きな部品 (40 本のボードは 20 行ぶんの箱に
 * なる) が縁で切れる。部品は升の中心を軸に上下へ伸びるので、**左と上へも**
 * 広げられるようにしてある (画布の原点は 0 とは限らない)。
 */
function roomFor(map: GridMap, nudges: ReadonlyMap<Chip, number>): Room {
  let room: Room = {
    left: 0, top: 0, right: x(map.cols - 1) + EDGE, bottom: y(map.rows - 1) + EDGE,
  };
  const hold = (left: number, top: number, right: number, bottom: number): void => {
    room = {
      left: Math.min(room.left, left), top: Math.min(room.top, top),
      right: Math.max(room.right, right), bottom: Math.max(room.bottom, bottom),
    };
  };

  for (const note of map.notes) hold(0, 0, noteRight(note) + EDGE, 0);

  for (const chip of map.chips) {
    if (chip.to !== null) continue;
    const rows = rowsOf(chip.pins, chip.turn);
    const { halfW, halfH } = reachOf(rows, glyphOf(chip.type).name);
    const at = { x: x(chip.col), y: y(chip.row) + (nudges.get(chip) ?? 0) };
    // 足の棒と、その先の名前。**辺ごとに要る幅が違う** (名前の長さが違う)。
    const beside = (side: PinSide): number => {
      const row = rows.get(side);
      if (row === undefined) return 0;
      const widest = Math.max(0, ...row.map((pin) => textWidth(pin.name) * PIN_NAME_FONT));
      return PIN_STUB + (side === 'left' || side === 'right' ? widest + PIN_MARGIN : PIN_NAME_FONT * 2);
    };
    hold(
      at.x - halfW - beside('left') - EDGE,
      // 名前は記号の上に出る (上に足があれば更に上)。
      at.y - halfH - Math.max(beside('top'), -NAME_ABOVE_PIN) - EDGE,
      at.x + halfW + beside('right') + EDGE,
      at.y + halfH + beside('bottom') + EDGE,
    );
  }
  return room;
}

/** 升目に出ている足の接続点。部品の名前と足の名前で引く。 */
type PinPoints = ReadonlyMap<string, { readonly x: number; readonly y: number }>;

const pinKey = (part: string, name: string): string => `${part}\u0000${name}`;

/**
 * 線が通る点。**足を指した端は接続点まで伸ばす** — 升の真ん中で止めると、
 * 押した丸と線の先が食い違って見える (実機で指摘された)。
 * 足が升目に出ていなければ (種類が読めないなど) 升の真ん中のまま。
 *
 * **角は両端に合わせ直す。** `-|` と `|-` は直角に折れるという意味なので、
 * 足へずらした端に角が付いてこないと、そこだけ斜めの線になる
 * (実機で「斜め線を使わずに」と言われた)。角は元の升で「どちらの端と
 * 行・列を共にするか」が決まっているので、その端の座標をそのまま貰う。
 */
function pathOf(wire: WireLine, dots: PinPoints): string {
  const ends = wire.points.map((cell, index) => {
    const pin = index === 0 ? wire.fromPin : index === wire.points.length - 1 ? wire.toPin : null;
    const dot = pin === null ? undefined : dots.get(pinKey(pin.part, pin.name));
    return { cell, at: dot ?? { x: x(cell.col), y: y(cell.row) } };
  });

  const drawn = ends.map((end, index) => {
    // 角 (真ん中の点) だけは、行・列を共にする端から座標を貰う。
    if (index === 0 || index === ends.length - 1) return end.at;
    const before = ends[index - 1];
    const after = ends[index + 1];
    if (before === undefined || after === undefined) return end.at;
    const shares = (side: typeof before, of: 'row' | 'col'): boolean => side.cell[of] === end.cell[of];
    return {
      x: shares(before, 'col') ? before.at.x : shares(after, 'col') ? after.at.x : end.at.x,
      y: shares(before, 'row') ? before.at.y : shares(after, 'row') ? after.at.y : end.at.y,
    };
  });

  return drawn.map((at) => `${num(at.x)},${num(at.y)}`).join(' ');
}

/**
 * 升目に出したすべての接続点の場所。**描くときと同じ計算**を通すので、
 * 丸と線の先が必ず揃う (別々に数えると、片方だけ直したときにずれる)。
 */
function pinPointsOf(chips: readonly Chip[], nudges: ReadonlyMap<Chip, number>): PinPoints {
  const dots = new Map<string, { x: number; y: number }>();
  for (const chip of chips) {
    if (chip.to !== null || chip.pins.length === 0) continue;
    const rows = rowsOf(chip.pins, chip.turn);
    const glyph = glyphOf(chip.type).name;
    const { halfW, halfH } = reachOf(rows, glyph);
    const nudge = nudges.get(chip) ?? 0;
    for (const [side, row] of rows) {
      row.forEach((pin, at) => {
        const spot = pinAt(side, at, row.length, halfW, halfH, legGap(glyph));
        dots.set(pinKey(chip.id, pin.name), {
          x: x(chip.col) + spot.x2,
          y: y(chip.row) + nudge + spot.y2,
        });
      });
    }
  }
  return dots;
}

/** 掴める節点。名前が付いていれば添える (**1 行で動く節点**の目印になる)。 */
function drawDot(dot: Dot): string {
  const address = formatAddress({ row: dot.row, col: dot.col });
  const title = `${address}${dot.name === null ? '' : ` (${dot.name})`} — ${dot.uses} か所`;
  const name = dot.name === null ? '' : svgText(9, -7, dot.name, { class: 'cf-dot-name', anchor: 'start' });
  return at(
    dot,
    element('title', {}, escapeMarkup(title)) + element('circle', { class: 'cf-dot-mark', r: 4.5 }) + name,
    { class: 'cf-dot', 'data-node': address },
  );
}

/** 2 端子は線の向きに合わせて回す。**字は回さない** (逆さまになるので)。 */
function drawSpan(chip: Chip, far: Cell, nudge: number): string {
  const [x1, y1, x2, y2] = [x(chip.col), y(chip.row), x(far.col), y(far.row)];
  // 同じ 2 交点に並べた部品 (並列の RC) は線に直交する向きへ逃がす。
  // 重ねると後ろの 1 つを掴めない。
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ox, oy] = [(-(y2 - y1) / length) * nudge, ((x2 - x1) / length) * nudge];
  const [mx, my] = [(x1 + x2) / 2 + ox, (y1 + y2) / 2 + oy];
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const glyph = glyphOf(chip.type);

  const lead = drawLead(chip, [x1, y1, x2, y2], length, nudge);
  const body = element(
    'g',
    { transform: `translate(${num(mx)},${num(my)}) rotate(${num(angle)})` },
    drawGlyph(glyph.name),
  );
  const mark = glyph.mark === null ? '' : svgText(mx, my + 4, glyph.mark, { class: 'cf-mark' });
  // **名前を置く側は図と揃える** — 横置きは記号の下、縦置きは記号の左
  // (図では反対側が値の場所。実機で「文字列の位置が回路図と違う」)。
  const upright = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  const aside = asideOf(mx, chip.id);
  const name = upright
    ? svgText(aside.x, my + 4, chip.id, { class: 'cf-name', anchor: aside.anchor, halo: 'var(--cf-paper)' })
    : svgText(mx, my + NAME_BELOW, chip.id, { class: 'cf-name', halo: 'var(--cf-paper)' });
  return lead + body + mark + name;
}

/**
 * 2 端子部品の名前を記号から離す量。**図と同じ側に置く** — 横置きは下、
 * 縦置きは左。升の半分 (17) より内側に収めて、隣の升へはみ出さないようにする。
 */
const NAME_BELOW = 15;
const NAME_ASIDE = 14;

/** 名前の字の大きさ (`.cf-name` の `font-size`)。はみ出すかを測るのに要る。 */
const NAME_FONT = 10;

/**
 * 縦置きの名前の置き場。図と同じ**左**に置くが、**板の縁で切れるなら右へ回す**
 * — 1 列目に立てた部品の名前は、左に置くと行の見出しに重なって読めない
 * (実機で図に合わせたときに出た)。
 */
function asideOf(mx: number, id: string): { readonly x: number; readonly anchor: 'start' | 'end' } {
  const left = mx - NAME_ASIDE - textWidth(id) * NAME_FONT;
  return left < EDGE ? { x: mx + NAME_ASIDE, anchor: 'start' } : { x: mx - NAME_ASIDE, anchor: 'end' };
}

/**
 * 2 交点をつなぐ線。**記号のところで切る** — 通しで引くと、折れ線の抵抗にも
 * 極板 2 枚のコンデンサにも中心線が重なる。コンデンサは「切れている」ことが
 * 記号の意味なので、線を通すと嘘の図になる (実機で「中心線を非表示に」)。
 *
 * **逃がした部品は切らない。** 同じ 2 交点に並べた部品 (並列の RC) は胴が線から
 * 外れているので、切ると誰も居ないところに隙間が空く。
 */
function drawLead(
  chip: Chip,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  length: number,
  nudge: number,
): string {
  const whole = element('line', { class: 'cf-lead', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) });
  const span = glyphSpan(glyphOf(chip.type).name);
  // 記号を持たない `short` は線そのものなので、切ると何も残らない。
  if (nudge !== 0 || span === 0) return whole;

  const stub = length / 2 - span;
  // 交点が近すぎて足が残らないときは、隙間だけにする (短い線を潰さない)。
  if (stub <= 0) return '';

  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  const near = element('line', {
    class: 'cf-lead', x1: num(x1), y1: num(y1), x2: num(x1 + ux * stub), y2: num(y1 + uy * stub),
  });
  const far = element('line', {
    class: 'cf-lead', x1: num(x2 - ux * stub), y1: num(y2 - uy * stub), x2: num(x2), y2: num(y2),
  });
  return near + far;
}

/**
 * 記号を回す変換。**反転してから回す** (フェンスの意味と同じ順で、SVG は
 * 右に書いたものから効くので `rotate` を先に書く)。
 */
function turnOf(turn: Turn): string {
  const steps = [
    ...(turn.rotate === 0 ? [] : [`rotate(${num(turn.rotate)})`]),
    ...(turn.mirror ? ['scale(-1,1)'] : []),
  ];
  return steps.length === 0 ? '' : ` ${steps.join(' ')}`;
}

/**
 * 胴の既定の大きさ (原点から縁まで)。箱は 26x16 なので x が ±13、y が ±8。
 * **足が増えたら伸びる** (`reachOf`)。
 */
const HALF_W = 13;
const HALF_H = 8;
/** 足の棒の長さ。間隔は記号が決める (`legGap`)。 */
const PIN_STUB = 7;
/** 端の足と胴の角の間。足が角にかからないだけの余白。 */
const PIN_MARGIN = 6;

/** 足の先の丸の大きさと、その当たり判定。**押せる大きさ**は見た目より大きく取る。 */
const PIN_DOT = 2.6;
const PIN_HIT = 7;

/**
 * 足の名前を丸から離す幅。**字が丸に重なると、どこが接続点なのか分からない**
 * (実機でオペアンプの `+` `-` が丸に載っていた)。
 */
const NAME_CLEAR = 3;

/** 胴の中に書く字を、縁からどれだけ内側に入れるか。 */
const NAME_INSIDE = 3;

/** 辺ごとの足の並び。**書かれた順**で、上から下・左から右に置く。 */
type PinRows = ReadonlyMap<PinSide, readonly ChipPin[]>;

const rowsOf = (pins: readonly ChipPin[], turn: Turn): PinRows => {
  const rows = new Map<PinSide, ChipPin[]>();
  for (const pin of pins) {
    const row = rows.get(pin.side);
    if (row === undefined) rows.set(pin.side, [pin]);
    else row.push(pin);
  }
  // **辺の中の並びも回る。** 表は「上から下」「左から右」で書いてあるが、
  // 90 度と 180 度はその向きが裏返る (左辺のいちばん上の足は、90 度回すと
  // 上辺のいちばん右)。反転は上下の順を変えないので、ここでは見ない。
  if (turn.rotate !== 90 && turn.rotate !== 180) return rows;
  for (const row of rows.values()) row.reverse();
  return rows;
};

/**
 * その部品の胴の大きさ。**同じ辺に何本並ぶかで決まる** — DIP のように片側に
 * 何本も出る部品は、既定の箱では足が重なって 1 本ずつ押せない
 * (実機で「すべての部品の足に接続点があるか」と言われて広げた)。
 */
function reachOf(rows: PinRows, glyph: GlyphName): { readonly halfW: number; readonly halfH: number } {
  const along = (...sides: readonly PinSide[]): number =>
    Math.max(0, ...sides.map((side) => rows.get(side)?.length ?? 0));
  const room = (count: number): number => ((count - 1) * legGap(glyph)) / 2 + PIN_MARGIN;
  // **棒は記号の縁から出す。** 決め打ちの 13 から出すと、記号が小さい種類
  // (オペアンプの三角、トランスの巻線) で縁と棒の間が切れて見える。
  // 箱は名前を入れるので、狭くはしない。
  const edge = glyph === 'box' ? HALF_W : Math.max(glyphSpan(glyph), 8);
  return {
    halfW: Math.max(edge, room(along('top', 'bottom'))),
    halfH: Math.max(HALF_H, room(along('left', 'right'))),
  };
}

/**
 * 足 1 本の寸法。**辺の中の位置は真ん中から振り分ける** (n 本なら等間隔)。
 * 字は棒の先の外側に置く (棒に重ねると読めない)。
 *
 * 横向きの足の字は**棒の先**に置き、隣の升の点に少しはみ出すのを縁取りで
 * 読ませる。棒の上へ寄せると、字が箱の角に重なって読めなくなった (実測)。
 */
function pinAt(
  side: PinSide, at: number, of: number, halfW: number, halfH: number, gap: number, inside = false,
): {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly tx: number; readonly ty: number; readonly anchor?: 'start' | 'end';
} {
  const shift = (at - (of - 1) / 2) * gap;
  // 字は丸の外側へ。丸の半径と余白のぶんだけ、棒の先から更に離す。
  const clear = PIN_DOT + NAME_CLEAR;
  if (side === 'left') {
    const x = -halfW - PIN_STUB;
    return inside
      ? { x1: -halfW, y1: shift, x2: x, y2: shift, tx: -halfW + NAME_INSIDE, ty: shift + 3, anchor: 'start' }
      : { x1: -halfW, y1: shift, x2: x, y2: shift, tx: x - clear, ty: shift + 3, anchor: 'end' };
  }
  if (side === 'right') {
    const x = halfW + PIN_STUB;
    return inside
      ? { x1: halfW, y1: shift, x2: x, y2: shift, tx: halfW - NAME_INSIDE, ty: shift + 3, anchor: 'end' }
      : { x1: halfW, y1: shift, x2: x, y2: shift, tx: x + clear, ty: shift + 3, anchor: 'start' };
  }
  if (side === 'top') {
    const y = -halfH - PIN_STUB;
    return { x1: shift, y1: -halfH, x2: shift, y2: y, tx: shift, ty: y - clear };
  }
  const y = halfH + PIN_STUB;
  // 下は字の高さぶん (8px) だけ更に下げる。基準線が下端になるため。
  return { x1: shift, y1: halfH, x2: shift, y2: y, tx: shift, ty: y + clear + 8 };
}

/**
 * 足 1 本。**字は回さない** (辺のほうが既に回してある)。
 *
 * 先には**接続点**を出す。ここを配線の道具で押すと `Q1.C -- a4` と書ける —
 * 足を指す配線はこれまで手で書くしかなかった (実機で頼まれて足した)。
 * 名札は**書かれる綴りそのもの** (`Q1.C`) にしておく。殻は綴りを知らないので、
 * 押されたものをそのまま `addWire` へ返せる形で持たせる。
 */
function drawPin(pin: ChipPin, part: string, at: ReturnType<typeof pinAt>): string {
  const stub = element('line', {
    class: 'cf-pin', x1: num(at.x1), y1: num(at.y1), x2: num(at.x2), y2: num(at.y2),
  });
  const spelling = `${part}.${pin.name}`;
  const dot = element('circle', { class: 'cf-pin-dot', cx: num(at.x2), cy: num(at.y2), r: num(PIN_DOT) })
    + element('circle', {
      class: 'cf-pin-hit', 'data-pin': escapeMarkup(spelling),
      cx: num(at.x2), cy: num(at.y2), r: num(PIN_HIT),
    });
  return stub + dot + svgText(at.tx, at.ty, pin.name, {
    class: 'cf-pin-name',
    // 隣の升の点や升目の線に載るので、地の色で縁を取る (`cf-name` と同じ手)。
    halo: 'var(--cf-paper)',
    ...(at.anchor === undefined ? {} : { anchor: at.anchor }),
  });
}

/**
 * 記号の上に出す名前の高さ。上に足があるときは、足の名前 (`-18`) の更に上へ。
 * 記号の中に入る箱とは別 (箱は中に名前を入れる)。
 */
const NAME_ABOVE = -12;
const NAME_ABOVE_PIN = -28;

/** 1 端子と多端子は升の上に置く。箱に落ちた種類は名前を中に入れる。 */
function drawStanding(chip: Chip, nudge: number): string {
  const glyph = glyphOf(chip.type);
  const inside = glyph.name === 'box';
  const rows = rowsOf(chip.pins, chip.turn);
  const { halfW, halfH } = reachOf(rows, glyph.name);
  // **箱は回さない。** 矩形は回しても同じ意味しか持たず、縦横が入れ替わると
  // 中に入れた名前がはみ出す。向きは足のほうが示す。
  // 箱でない記号 (ground) は回して見せる — 足が無いので、回さないと
  // 向きを書いたことが figure に一切出ない。**字は回さない** (逆さまになる)。
  const spin = inside ? '' : turnOf(chip.turn);
  // 箱だけは足の本数で伸ばす (DIP は片側に何本も出る)。
  const shape = inside ? drawBox(halfW, halfH) : drawGlyph(glyph.name);
  const body = element('g', { transform: `translate(0,${num(nudge)})${spin}` }, shape);
  const pins = chip.pins.length === 0
    ? ''
    : element(
      'g',
      { class: 'cf-pins', transform: `translate(0,${num(nudge)})` },
      [...rows].flatMap(([side, row]) =>
        row.map((pin, at) =>
          drawPin(pin, chip.id, pinAt(
            side, at, row.length, halfW, halfH, legGap(glyph.name), namesInside(glyph.name, side),
          )))).join(''),
    );
  const mark = glyph.mark === null ? '' : svgText(0, nudge + 4, glyph.mark, { class: 'cf-mark' });
  // **上に足があるなら、その名前より更に上に出す。** 記号を持つ種類は名前が
  // 記号の上に出るので、上の足の名前 (`B` など) と同じ高さで重なる。
  const overhead = chip.pins.some((pin) => pin.side === 'top');
  const above = overhead ? NAME_ABOVE_PIN : NAME_ABOVE;
  const name = inside
    ? svgText(0, nudge + 4, chip.id, { class: 'cf-name' })
    : svgText(0, nudge + above, chip.id, { class: 'cf-name', halo: 'var(--cf-paper)' });
  return body + pins + mark + name;
}

/**
 * 掴める部品 1 つ。同じ升に何本も立つときは少しずらす — **同じ番地に 2 つは
 * この文法では接続**なので普通に起きるし、重ねると片方を掴めなくなる。
 */
function drawChip(chip: Chip, nudge: number, bad: Bad): string {
  const title = `${chip.id} (${chip.type}) ${formatAddress({ row: chip.row, col: chip.col })}`;
  const inner = chip.to === null ? drawStanding(chip, nudge) : drawSpan(chip, chip.to, nudge);
  const marked = element('title', {}, escapeMarkup(title))
    + (chip.to === null ? at(chip, inner) : inner);
  return element(
    'g',
    // **掴むのは名札、見せるのは名前。** 同じ名前の記号が 2 つ以上あることが
    // あるので、掴んだものを名前で指すと先に書いたほうを拾う (`handles.ts`)。
    { class: classOf('cf-chip', chip.line, bad), 'data-part': chip.handle, 'data-line': chip.line },
    marked,
  );
}

/** 注釈の札の字の大きさ。掴む的なので、記号の名前より 1 段小さい。 */
const NOTE_FONT = 9;
/** 札の内側の余白と高さ。字の上下が縁に当たらない最小限。 */
const NOTE_PAD = 4;
const NOTE_HEIGHT = NOTE_FONT + NOTE_PAD * 2;
/**
 * 札に出す字の長さ (全角を 1 とした幅)。**升目は掴むための道具**なので、
 * 長い注釈を全部出すと隣の部品が札の下に隠れる。切った跡は `…` が残し、
 * **全文は札に載せた `title`** が出す (乗せれば読める)。
 */
const NOTE_CHARS = 14;

/** 札に出す字と、その札の幅。**幅を測る側と描く側で 1 つ**にしておく。 */
function noteTag(note: MapNote): { readonly shown: string; readonly width: number } {
  const shown = fit(note.kind === 'text' ? note.text : note.kind, NOTE_CHARS);
  return { shown, width: textWidth(shown) * NOTE_FONT + NOTE_PAD * 2 };
}

/** その注釈の札が右へ伸びるところ。**画布の幅**を決めるのに要る。 */
const noteRight = (note: MapNote): number =>
  x(note.col) + PITCH * 0.18 + noteTag(note).width;

/**
 * 注釈。**印そのものは描かない** — マップは掴むための升目で、図ではない。
 * 指した升の角に小さな札を出し、字の注釈はその字も少しだけ見せる
 * (どの注釈かを選ぶのに要る)。
 */
function drawNote(note: MapNote, framed: boolean): string {
  const left = x(note.col) + PITCH * 0.18;
  const top = y(note.row) - PITCH * 0.42;
  const { shown, width } = noteTag(note);
  // **字の注釈に枠は付けない** (実機で「text に枠は要らない」)。書いた字が
  // そのまま読めるものに枠を足すと、枠のほうが目立つ。字だけでは升目の点や
  // 配線に載って読みにくいので、地の色で縁を取る (`cf-name` と同じ手)。
  // 枠が要る人のために設定で戻せる (`framed`。**既定は付けない**)。
  //
  // **自分の字を持たない注釈 (`circle` など) には枠を残す。** あちらに出るのは
  // 種類の名前なので、枠が「これは札で、図に出る字ではない」と言っている。
  const bare = note.kind === 'text' && !framed;
  const frame = bare ? '' : element('rect', {
    x: num(left), y: num(top), width: num(width), height: num(NOTE_HEIGHT), rx: 3,
    class: 'cf-note-tag',
  });
  return element(
    'g',
    { class: 'cf-chip cf-note-mark', 'data-part': note.handle, 'data-line': note.line },
    // 切った跡が `…` で残るので、**全文は乗せれば読める**ようにしておく。
    element('title', {}, escapeMarkup(bare ? note.text : note.kind))
    + frame
    + svgText(left + NOTE_PAD, top + NOTE_HEIGHT * 0.72, shown, {
      anchor: 'start', class: 'cf-note-text', 'font-size': num(NOTE_FONT),
      ...(bare ? { halo: 'var(--cf-paper)' } : {}),
    }),
  );
}

/**
 * 置き先の当たり判定。**掴んでいる間だけ効く** (CSS で切り替える)。
 * いつも効かせると部品を掴めなくなり、いつも切ると置けなくなる。
 */
function drawHits(map: Shown): string {
  const cells: string[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      cells.push(element('rect', {
        class: 'cf-cell',
        'data-address': formatAddress({ row, col }),
        x: num(x(col) - PITCH / 2), y: num(y(row) - PITCH / 2),
        width: num(PITCH), height: num(PITCH),
      }));
    }
  }
  return layer('cf-hits', cells.join(''));
}

/**
 * 同じ場所に来た部品をずらす量。**立っているものは升で、またぐものは
 * 両端の組で**数える (並列の RC は同じ 2 交点にまたがるので重なる)。
 * 重ねると後ろの 1 つを掴めない。
 */
function nudgesOf(chips: readonly Chip[]): Map<Chip, number> {
  const seen = new Map<string, number>();
  const nudges = new Map<Chip, number>();
  for (const chip of chips) {
    // **端点の並びで鍵を作らない。** `a1 c1` と `c1 a1` は同じ 2 交点なので、
    // 並びのままだと別物になって重なる (まさに並列の RC で起きる)。
    const here = `${chip.row},${chip.col}`;
    const key = chip.to === null ? here : [here, `${chip.to.row},${chip.to.col}`].sort().join('-');
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    nudges.set(chip, index * 7);
  }
  return nudges;
}

/**
 * 帯が名指した行。**絵の側にも印を付ける**ため、描くときに渡す —
 * 行番号だけ出しても、どの記号のことかは字と突き合わせないと分からない。
 */
export type Bad = ReadonlySet<number>;

const NONE: Bad = new Set();

const classOf = (base: string, line: number, bad: Bad): string => (bad.has(line) ? `${base} cf-bad` : base);

/**
 * 升目の見た目のうち、**書き手ではなく読み手が選ぶもの**。フェンスに書く
 * `style:` は図の話なので、こちらは VS Code の設定から来る。
 */
export type MapLook = {
  /** 字の注釈に枠を付けるか。**既定は付けない** (実機で「枠は要らない」)。 */
  readonly noteFrame?: boolean;
};

export function renderMapHtml(map: GridMap, bad: Bad = NONE, look: MapLook = {}): string {
  if (!map.readable) {
    return '<p class="cf-note">フェンスを読めません。エラーを直すとマップが出ます。</p>';
  }

  const nudges = nudgesOf(map.chips);
  // **画布は升目ではなく、描いたものに合わせる。** 40 本のマイコンボードは
  // 升 1 つに置くが箱は 20 行ぶんあり、升目の大きさで切ると図が丸ごと外へ出る
  // (実機で「pico を置いても回路図が広がらない」)。
  const room = roomFor(map, nudges);
  // 点と見出しは、画布に届くところまで出す (部品の横に行の字が無くならない)。
  const shown = shownOf(map, room);
  // 接続点は線より先に数える (線の先をそこへ合わせるため)。
  const dots = pinPointsOf(map.chips, nudges);

  const svg = element(
    'svg',
    {
      class: 'cf-map',
      viewBox: `${num(room.left)} ${num(room.top)} ${num(room.right - room.left)}`
        + ` ${num(room.bottom - room.top)}`,
      // 幅は CSS が決める。高さを比で決めるので、狭いパネルでも縦に伸びない。
      preserveAspectRatio: 'xMinYMin meet',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    drawGrid(shown)
      + drawLabels(shown)
      + layer('cf-wires', map.wires.map((wire) => drawWire(wire, bad, dots)).join(''))
      // 掴む層は見える線より後、部品より前。上に描いたものからクリックを取るので、
      // 部品と節点が先に取り、配線はその隙間で取る。
      + layer('cf-wire-hits', map.wires.map((wire) => grabWire(wire, dots)).join(''))
      + layer('cf-marks', map.dots.map(drawDot).join(''))
      + layer('cf-parts', map.chips.map((chip) => drawChip(chip, nudges.get(chip) ?? 0, bad)).join(''))
      // 注釈は部品の上。指したものが下に隠れると印の意味が無い (図と同じ順)。
      + layer('cf-notes', map.notes.map((note) => drawNote(note, look.noteFrame === true)).join(''))
      + drawHits(shown),
  );

  const skipped = map.skipped.length === 0
    ? ''
    : `<p class="cf-note">交点の間に置いた部品はマップに出ません: ${escapeMarkup(map.skipped.join(', '))}</p>`;
  return svg + skipped;
}
