import { element, escapeMarkup, num, svgText } from 'fence-kit';
import { formatAddress } from '../model/address.ts';
import { drawGlyph, glyphOf } from './mapGlyphs.ts';
import type { Chip, Cell, Dot, GridMap, WireLine } from './map.ts';

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

/** 引いた線。ピンで書いた端は近似なので破線にして、正確な位置を約束しない。 */
const drawWire = (wire: WireLine): string =>
  element('line', {
    class: wire.approximate ? 'cf-wire cf-approx' : 'cf-wire',
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

  const lead = element('line', { class: 'cf-lead', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) });
  const body = element(
    'g',
    { transform: `translate(${num(mx)},${num(my)}) rotate(${num(angle)})` },
    drawGlyph(glyph.name),
  );
  const mark = glyph.mark === null ? '' : svgText(mx, my + 4, glyph.mark, { class: 'cf-mark' });
  // **縦に置いた部品の名前は横へ逃がす。** 上に置くと自分の線に重なって読めない。
  const upright = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  const name = upright
    ? svgText(mx + 14, my + 4, chip.id, { class: 'cf-name', anchor: 'start', halo: 'var(--cf-paper)' })
    : svgText(mx, my - 13, chip.id, { class: 'cf-name', halo: 'var(--cf-paper)' });
  return lead + body + mark + name;
}

/** 1 端子と多端子は升の上に置く。箱に落ちた種類は名前を中に入れる。 */
function drawStanding(chip: Chip, nudge: number): string {
  const glyph = glyphOf(chip.type);
  const inside = glyph.name === 'box';
  const body = element('g', { transform: `translate(0,${num(nudge)})` }, drawGlyph(glyph.name));
  const mark = glyph.mark === null ? '' : svgText(0, nudge + 4, glyph.mark, { class: 'cf-mark' });
  const name = inside
    ? svgText(0, nudge + 4, chip.id, { class: 'cf-name' })
    : svgText(0, nudge - 12, chip.id, { class: 'cf-name', halo: 'var(--cf-paper)' });
  return body + mark + name;
}

/**
 * 掴める部品 1 つ。同じ升に何本も立つときは少しずらす — **同じ番地に 2 つは
 * この文法では接続**なので普通に起きるし、重ねると片方を掴めなくなる。
 */
function drawChip(chip: Chip, nudge: number): string {
  const title = `${chip.id} (${chip.type}) ${formatAddress({ row: chip.row, col: chip.col })}`;
  const inner = chip.to === null ? drawStanding(chip, nudge) : drawSpan(chip, chip.to, nudge);
  const marked = element('title', {}, escapeMarkup(title))
    + (chip.to === null ? at(chip, inner) : inner);
  return element('g', { class: 'cf-chip', 'data-part': chip.id }, marked);
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
    const key = chip.to === null
      ? `${chip.row},${chip.col}`
      : `${chip.row},${chip.col}-${chip.to.row},${chip.to.col}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    nudges.set(chip, index * 7);
  }
  return nudges;
}

export function renderMapHtml(map: GridMap): string {
  if (!map.readable) {
    return '<p class="cf-note">フェンスを読めません。エラーを直すとマップが出ます。</p>';
  }

  const width = x(map.cols - 1) + EDGE;
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
      + layer('cf-wires', map.wires.map(drawWire).join(''))
      + layer('cf-marks', map.dots.map(drawDot).join(''))
      + layer('cf-parts', map.chips.map((chip) => drawChip(chip, nudges.get(chip) ?? 0)).join(''))
      + drawHits(map),
  );

  const skipped = map.skipped.length === 0
    ? ''
    : `<p class="cf-note">交点の間に置いた部品はマップに出ません: ${escapeMarkup(map.skipped.join(', '))}</p>`;
  return svg + skipped;
}
