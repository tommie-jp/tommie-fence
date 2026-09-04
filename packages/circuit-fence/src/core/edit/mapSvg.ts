import { element, escapeMarkup, fit, lookupBoardPart, num, svgText, textWidth } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { formatAddress, rowLetters } from '../model/address.ts';
import {
  drawBox, drawGlyph, glyphOf, glyphSpan, glyphTall, leadsFromCentre, legGap, namesInside,
} from './mapGlyphs.ts';
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

/** 升目に出す行の数。番地の上限 (`LIMITS.rows`) と同じところで止める。 */
const MAX_ROWS = LIMITS.rows;

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

/** 行と列の見出し (a・b … z・aa・ab … と 1〜99)。番地を目で数えられるように。 */
function drawLabels(map: Shown): string {
  const cols = Array.from({ length: map.cols }, (_, col) =>
    svgText(x(col), AXIS_Y, String(col + 1), { class: 'cf-axis' }));
  const rows = Array.from({ length: map.rows }, (_, row) =>
    svgText(PAD_X - 12, y(row) + 4, rowLetters(row), { class: 'cf-axis' }));
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
    const glyph = glyphOf(chip.type).name;
    const rows = rowsOf(chip.pins, chip.turn);
    const { halfW, halfH } = reachOf(rows, glyph);
    const at = { x: x(chip.col), y: y(chip.row) + (nudges.get(chip) ?? 0) };
    // 足の棒と、その先の名前。**辺ごとに要る幅が違う** (名前の長さが違う)。
    const beside = (side: PinSide): number => {
      const row = rows.get(side);
      if (row === undefined) return 0;
      const widest = Math.max(0, ...row.map((pin) => textWidth(pin.name) * PIN_NAME_FONT));
      return PIN_STUB + (side === 'left' || side === 'right' ? widest + PIN_MARGIN : PIN_NAME_FONT * 2);
    };
    // 名札の出る辺。**箱は中に入れる**ので外へは広がらない。上に出る分は下の
    // `NAME_TOP_ROOM` でまとめて取ってあるので、横と下だけここで見る。
    // 名札の出る辺には足が無いので、足の分と名札の分が両方効くことはない。
    // **箱も名前を外に出す**ので、余白を数える対象に入れる。
    const named = nameSideOf(chip.pins);
    const forName = (side: PinSide): number => (side === named
      ? standingNameReach(side, chip.id, { w: halfW, h: halfH }) - (side === 'bottom' ? halfH : halfW)
      : 0);
    hold(
      at.x - halfW - Math.max(beside('left'), forName('left')) - EDGE,
      at.y - halfH - Math.max(beside('top'), NAME_TOP_ROOM) - EDGE,
      at.x + halfW + Math.max(beside('right'), forName('right')) + EDGE,
      at.y + halfH + Math.max(beside('bottom'), forName('bottom')) + EDGE,
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
  const mark = glyph.mark === null
    ? ''
    : svgText(mx, my + (glyph.mark.below === true ? MARK_BELOW : 4), glyph.mark.text, { class: 'cf-mark' });
  // **名前を置く側は図と揃える** — 横置きは記号の下、縦置きは記号の左
  // (図では反対側が値の場所。実機で「文字列の位置が回路図と違う」)。
  const upright = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  // **記号の張り出しの外へ。** 決め打ちの距離だと、背の高い記号 (ダイアック・
  // 水晶・電源の丸) に名前が乗る (実機で指摘された)。線と直交する向きの
  // 張り出しは、縦置きでは横向きになるので、どちらの置き方でも同じ数を使う。
  const clear = Math.max(NAME_BELOW, glyphTall(glyph.name) + NAME_CLEAR_TALL);
  const aside = asideOf(mx, chip.id, clear);
  const name = upright
    ? svgText(aside.x, my + 4, chip.id, { class: 'cf-name', anchor: aside.anchor, halo: 'var(--cf-paper)' })
    : svgText(mx, my + clear, chip.id, { class: 'cf-name', halo: 'var(--cf-paper)' });
  return lead + body + mark + name;
}

/**
 * 2 端子部品の名前を記号から離す量。**図と同じ側に置く** — 横置きは下、
 * 縦置きは左。升の半分 (17) より内側に収めて、隣の升へはみ出さないようにする。
 */
const NAME_BELOW = 15;

/** 記号の張り出しから名前までの隙間。字の高さ (10px) の半分より少し広く取る。 */
const NAME_CLEAR_TALL = 8;

/**
 * 品種の字 (`NTC`) を記号の下へ置く高さ。**名前のさらに下**に置く —
 * 図も 2 行目として名前の下に書く (`l2_=`) ので、並びを揃える。
 * 記号と名前の間に入れると、10px の字が 2 つ重なって両方読めない (実測)。
 */
const MARK_BELOW = NAME_BELOW + 9;
const NAME_ASIDE = 14;

/** 名前の字の大きさ (`.cf-name` の `font-size`)。はみ出すかを測るのに要る。 */
const NAME_FONT = 10;

/**
 * 縦置きの名前の置き場。図と同じ**左**に置くが、**板の縁で切れるなら右へ回す**
 * — 1 列目に立てた部品の名前は、左に置くと行の見出しに重なって読めない
 * (実機で図に合わせたときに出た)。
 */
function asideOf(mx: number, id: string, aside: number): { readonly x: number; readonly anchor: 'start' | 'end' } {
  const left = mx - aside - textWidth(id) * NAME_FONT;
  return left < EDGE ? { x: mx + aside, anchor: 'start' } : { x: mx - aside, anchor: 'end' };
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
  // **中に書く名前が入るだけの幅を取る。** 左右の名前を内側へ寄せるので、
  // 狭い箱だと `IN` と `OUT` がくっついて 1 語に読める (実機で見つけた)。
  const inside = (side: PinSide): number => (namesInside(glyph, side)
    ? Math.max(0, ...(rows.get(side) ?? []).map((pin) => textWidth(pin.name) * PIN_NAME_FONT))
    : 0);
  const forNames = (inside('left') + inside('right')) / 2 + NAME_INSIDE * 2 + 2;
  return {
    halfW: Math.max(edge, room(along('top', 'bottom')), forNames),
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
 * 名札を出す辺を探す順。**図と同じ決め方**にする — `tex/generate.ts` の
 * `nameNode` も同じ順で空いている辺を探す。上が第一希望で、足のある辺は避ける。
 *
 * これで 3 本足のトランジスタ (`npn` / `nmos` など) の名札は**右**へ出る。
 * 上がコレクタ・下がエミッタ・左がベースで、空いているのが右しかないため。
 * 実機で「`Q1` が記号の真上にある。回路図では記号の右」と指摘された。
 * **辺を種類で決め打ちしない** — 回した記号は足ごと辺が回るので、
 * 空きを数えれば回転にもそのまま追従する (図と同じ辺に出続ける)。
 */
const NAME_ORDER: readonly PinSide[] = ['top', 'bottom', 'left', 'right'];

const nameSideOf = (pins: readonly ChipPin[]): PinSide => {
  const taken = new Set<PinSide>(pins.map((pin) => pin.side));
  return NAME_ORDER.find((side) => !taken.has(side)) ?? 'top';
};

/**
 * 名札を升の真ん中から離す量。**辺ごとに 1 つの決め打ちで、記号の大きさでは変えない。**
 * 記号はどれも半径 14 くらいの中に描いてあり、足の届く長さ (`reachOf`) は
 * 足の本数で伸びる別の寸法なので、そちらに合わせると記号から離れて浮く
 * (トランスや切り替えスイッチで 10px 浮いた)。**升の半分 (17) より内側**に収まる。
 *
 * 横が縦より遠いのは、記号が縦より横に長いため (2 端子の `NAME_ASIDE` と同じ値)。
 * 下だけ字の高さを足すのは、基準線が字の**下端**になるため。
 */
const STAND_ABOVE = -12;
const STAND_ASIDE = NAME_ASIDE;
const STAND_BELOW = -STAND_ABOVE + NAME_FONT - 2;

/**
 * 画布が升の上に取る余白。名札が上に出る種類ぶんを、**全部の部品に一律で**取る
 * (足の名前より更に上へ出る場合まで含めた昔からの値。ここを部品ごとに詰めると
 * 図の縁が種類によって動く)。
 */
const NAME_TOP_ROOM = 28;

/**
 * 名札 1 つの置き場。**空いている辺の外側**に置く。
 *
 * `half` はその辺までの胴の半分。**箱は足の本数で伸びる**ので、決め打ちの
 * 距離だと名前が箱の中や縁に乗る (実機で DIP の名前が切り欠きに重なった)。
 * 記号の胴は小さいので、決め打ちのほうが遠ければそちらを採る。
 */
function standingNameAt(
  side: PinSide,
  half: { readonly w: number; readonly h: number },
): { readonly x: number; readonly y: number; readonly anchor?: 'start' | 'end' } {
  const aside = Math.max(STAND_ASIDE, half.w + NAME_CLEAR);
  if (side === 'left') return { x: -aside, y: 4, anchor: 'end' };
  if (side === 'right') return { x: aside, y: 4, anchor: 'start' };
  if (side === 'bottom') return { x: 0, y: Math.max(STAND_BELOW, half.h + NAME_FONT) };
  return { x: 0, y: Math.min(STAND_ABOVE, -half.h - NAME_CLEAR) };
}

/**
 * 名札が升の真ん中から届く長さ。**画布の広さ (`roomFor`) が縁で切らないため**に要る。
 * 上に出る分は昔から `NAME_TOP_ROOM` でまとめて取ってあるので、ここでは見ない。
 */
function standingNameReach(side: PinSide, id: string, half: { readonly w: number; readonly h: number }): number {
  const place = standingNameAt(side, half);
  return side === 'left' || side === 'right'
    ? Math.abs(place.x) + textWidth(id) * NAME_FONT
    : place.y;
}

/**
 * 名前を出さない種類。**図が出していない**ものに合わせる — グラウンドは
 * 回路図で番号を振らない記号なので、升目にだけ `G1` が出ると図と食い違う。
 */
const NAMELESS: ReadonlySet<string> = new Set(['ground']);

/**
 * 切り欠きのある種類。**実物に向きの目印がある箱**だけが持つ — DIP の
 * パッケージと、マイコンボードの基板 (図もそこに半円を描く)。
 * ピンヘッダ (`sipN`) には無い。
 */
const DIP_TYPE = /^dip\d+$/;
const hasNotch = (type: string): boolean => DIP_TYPE.test(type) || lookupBoardPart(type) !== null;

/** 切り欠きの半径。箱の縁に半円で食い込む。 */
const NOTCH = 3.5;

/** その足が箱のどこに出ているか。**足の棒の根元**を返す (`pinAt` と同じ数え方)。 */
function pinPointOf(
  pin: ChipPin, rows: PinRows, halfW: number, halfH: number, gap: number,
): { readonly x: number; readonly y: number } | null {
  for (const [side, row] of rows) {
    const at = row.indexOf(pin);
    if (at < 0) continue;
    const place = pinAt(side, at, row.length, halfW, halfH, gap);
    return { x: place.x1, y: place.y1 };
  }
  return null;
}

/**
 * DIP の切り欠き。**実物と同じ向きの目印**が無いと、図を見ながら挿すときに
 * 180 度回して挿せてしまう (図が描いているのと同じ理由。実機で図と升目を
 * 並べて、升目にだけ無いと分かった)。
 *
 * **場所は 1 番ピンと最終ピンの間**。実物の切り欠きは 2 列の始まりと終わりが
 * 並ぶ短い辺にあり、その中点をいちばん近い縁へ寄せたところに来る。箱の上端に
 * 決め打つと、回した DIP で反対の端へ出て印が嘘をつく。
 */
function notchOf(chip: Chip, rows: PinRows, halfW: number, halfH: number, gap: number): string {
  if (!hasNotch(chip.type)) return '';
  // **列の頭どうしの間**。`chip.pins` の並びは列の順 (左の列を上から、次に右の列を
  // 上から) なので、末尾は最終ピンではない — 数え違えると印が反対の端へ出る。
  const heads = [...rows.values()].map((row) => row[0]);
  const [from, to] = heads.map((pin) => (pin === undefined ? null : pinPointOf(pin, rows, halfW, halfH, gap)));
  if (heads.length !== 2 || from === null || to === null || from === undefined || to === undefined) return '';

  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const alongX = Math.abs(mid.x) >= Math.abs(mid.y);
  const side = Math.sign(alongX ? mid.x : mid.y) || -1;
  // 半円は**箱の内側へ**へこむ (図と同じ)。実物の切り欠きはパッケージを
  // 削った窪みなので、縁の外へ膨らませると別の形になる (実機で指摘された)。
  const d = alongX
    ? `M${num(side * halfW)},${num(-NOTCH)} A${NOTCH},${NOTCH} 0 0 ${side > 0 ? 0 : 1}`
      + ` ${num(side * halfW)},${num(NOTCH)}`
    : `M${num(-NOTCH)},${num(side * halfH)} A${NOTCH},${NOTCH} 0 0 ${side > 0 ? 1 : 0}`
      + ` ${num(NOTCH)},${num(side * halfH)}`;
  return element('path', { class: 'cf-glyph-line', d });
}

/** 1 端子と多端子は空いている辺に名前を置く。箱に落ちた種類は名前を中に入れる。 */
function drawStanding(chip: Chip, nudge: number): string {
  const glyph = glyphOf(chip.type);
  const inside = glyph.name === 'box';
  // **名前は箱の中に入れない。** 図は箱の外 (足の無い辺) に出すので、
  // 中に入れると同じ部品が図と升目で違う所に名前を持つ (実機で並べて見つけた)。
  // 箱の中は型番の場所で、そちらは図が書く。
  const rows = rowsOf(chip.pins, chip.turn);
  const { halfW, halfH } = reachOf(rows, glyph.name);
  // **箱は回さない。** 矩形は回しても同じ意味しか持たず、縦横が入れ替わると
  // 中に入れた名前がはみ出す。向きは足のほうが示す。
  // 箱でない記号 (ground) は回して見せる — 足が無いので、回さないと
  // 向きを書いたことが figure に一切出ない。**字は回さない** (逆さまになる)。
  const spin = inside ? '' : turnOf(chip.turn);
  // 箱だけは足の本数で伸ばす (DIP は片側に何本も出る)。
  const shape = inside
    ? drawBox(halfW, halfH) + notchOf(chip, rows, halfW, halfH, legGap(glyph.name))
    : drawGlyph(glyph.name);
  const body = element('g', { transform: `translate(0,${num(nudge)})${spin}` }, shape);
  const pins = chip.pins.length === 0
    ? ''
    : element(
      'g',
      { class: 'cf-pins', transform: `translate(0,${num(nudge)})` },
      [...rows].flatMap(([side, row]) =>
        row.map((pin, at) => {
          const place = pinAt(
            side, at, row.length, halfW, halfH, legGap(glyph.name), namesInside(glyph.name, side),
          );
          // **中心から引く形は、線の根元を真ん中へ。** 丸の中の点まで届いて
          // いるのが記号なので、縁で止めると信号線の行き先が読めない。
          return drawPin(pin, chip.id, leadsFromCentre(glyph.name) ? { ...place, x1: 0, y1: 0 } : place);
        })).join(''),
    );
  const mark = glyph.mark === null
    ? ''
    : svgText(0, nudge + (glyph.mark.below === true ? MARK_BELOW : 4), glyph.mark.text, { class: 'cf-mark' });
  // **マイコンボードは種類を箱の中に書く** (`pico2`)。40 本の足の名前は左右の
  // 縁に寄るので真ん中が空いていて、そこが実物のチップの場所でもある
  // (実機で頼まれた)。名前 (`U1`) は箱の外なので、2 つが重ならない。
  const kind = lookupBoardPart(chip.type) === null
    ? ''
    : svgText(0, nudge + 4, chip.type, { class: 'cf-mark' });
  // 名札は**足の無い辺**へ。足のある辺に出すと、棒と足の名前に重なる。
  const place = standingNameAt(nameSideOf(chip.pins), { w: halfW, h: halfH });
  const name = NAMELESS.has(chip.type)
    ? ''
    : svgText(place.x, nudge + place.y, chip.id, {
      class: 'cf-name',
      halo: 'var(--cf-paper)',
      ...(place.anchor === undefined ? {} : { anchor: place.anchor }),
    });
  return body + pins + mark + kind + name;
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

  return element(
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
}
