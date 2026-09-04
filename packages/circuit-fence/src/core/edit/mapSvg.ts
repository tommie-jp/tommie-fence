import { element, escapeMarkup, fit, num, svgText, textWidth } from 'fence-kit';
import { formatAddress } from '../model/address.ts';
import { drawBox, drawGlyph, glyphOf, glyphSpan } from './mapGlyphs.ts';
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

/** 交点の目印。**升目そのもの**で、置ける場所がここだと分かる。 */
function drawGrid(map: GridMap): string {
  const dots: string[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      dots.push(element('circle', { class: 'cf-grid-dot', cx: num(x(col)), cy: num(y(row)), r: 1.5 }));
    }
  }
  return layer('cf-grid', dots.join(''));
}

/** 行と列の見出し (a〜z と 1〜99)。番地を目で数えられるように。 */
function drawLabels(map: GridMap): string {
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
const grabWire = (wire: WireLine): string =>
  element('line', {
    class: 'cf-wire-hit',
    'data-line': wire.line,
    x1: num(x(wire.from.col)), y1: num(y(wire.from.row)),
    x2: num(x(wire.to.col)), y2: num(y(wire.to.row)),
  });

/**
 * 引いた線。ピンで書いた端は近似なので破線にして、正確な位置を約束しない。
 * 読めなかった行に書かれていれば印を足す (**帯と絵で同じものを指す**)。
 */
const drawWire = (wire: WireLine, bad: Bad): string =>
  element('line', {
    class: classOf(wire.approximate ? 'cf-wire cf-approx' : 'cf-wire', wire.line, bad),
    // 書かれた行。エディタのカーソルが来たとき、この線を光らせる目印。
    'data-line': wire.line,
    x1: num(x(wire.from.col)), y1: num(y(wire.from.row)),
    x2: num(x(wire.to.col)), y2: num(y(wire.to.row)),
  });

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
/** 足の棒の長さと、同じ辺に並ぶ足の間隔。名前が 8px なので 12 で読める。 */
const PIN_STUB = 7;
const PIN_GAP = 12;
/** 端の足と胴の角の間。足が角にかからないだけの余白。 */
const PIN_MARGIN = 6;

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
  const room = (count: number): number => ((count - 1) * PIN_GAP) / 2 + PIN_MARGIN;
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
function pinAt(side: PinSide, at: number, of: number, halfW: number, halfH: number): {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly tx: number; readonly ty: number; readonly anchor?: 'start' | 'end';
} {
  const shift = (at - (of - 1) / 2) * PIN_GAP;
  if (side === 'left') {
    return { x1: -halfW, y1: shift, x2: -halfW - PIN_STUB, y2: shift, tx: -halfW - PIN_STUB - 2, ty: shift + 3, anchor: 'end' };
  }
  if (side === 'right') {
    return { x1: halfW, y1: shift, x2: halfW + PIN_STUB, y2: shift, tx: halfW + PIN_STUB + 2, ty: shift + 3, anchor: 'start' };
  }
  if (side === 'top') {
    return { x1: shift, y1: -halfH, x2: shift, y2: -halfH - PIN_STUB, tx: shift, ty: -halfH - PIN_STUB - 3 };
  }
  return { x1: shift, y1: halfH, x2: shift, y2: halfH + PIN_STUB, tx: shift, ty: halfH + PIN_STUB + 9 };
}

/** 足の先の丸の大きさと、その当たり判定。**押せる大きさ**は見た目より大きく取る。 */
const PIN_DOT = 2.6;
const PIN_HIT = 7;

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
        row.map((pin, at) => drawPin(pin, chip.id, pinAt(side, at, row.length, halfW, halfH)))).join(''),
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
function drawHits(map: GridMap): string {
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

  // **札のぶんまで画布を広げる。** 右端に近い注釈は、升目の幅だけで切ると
  // 札が縁で切れて読めない (字に合わせて伸びるようにして初めて出た)。
  const width = Math.max(x(map.cols - 1) + EDGE, ...map.notes.map((note) => noteRight(note) + EDGE));
  const height = y(map.rows - 1) + EDGE;
  const nudges = nudgesOf(map.chips);

  const svg = element(
    'svg',
    {
      class: 'cf-map',
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      // 幅は CSS が決める。高さを比で決めるので、狭いパネルでも縦に伸びない。
      preserveAspectRatio: 'xMinYMin meet',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    drawGrid(map)
      + drawLabels(map)
      + layer('cf-wires', map.wires.map((wire) => drawWire(wire, bad)).join(''))
      // 掴む層は見える線より後、部品より前。上に描いたものからクリックを取るので、
      // 部品と節点が先に取り、配線はその隙間で取る。
      + layer('cf-wire-hits', map.wires.map(grabWire).join(''))
      + layer('cf-marks', map.dots.map(drawDot).join(''))
      + layer('cf-parts', map.chips.map((chip) => drawChip(chip, nudges.get(chip) ?? 0, bad)).join(''))
      // 注釈は部品の上。指したものが下に隠れると印の意味が無い (図と同じ順)。
      + layer('cf-notes', map.notes.map((note) => drawNote(note, look.noteFrame === true)).join(''))
      + drawHits(map),
  );

  const skipped = map.skipped.length === 0
    ? ''
    : `<p class="cf-note">交点の間に置いた部品はマップに出ません: ${escapeMarkup(map.skipped.join(', '))}</p>`;
  return svg + skipped;
}
