import { element, num, svgText, textWidth } from 'fence-kit';
import type { Panel, PanelKind } from '../layout/panels.ts';
import {
  DIVISIONS, dbAxis, degAxis, fraction, linAxis, logOhmAxis, niceAxis, ohmAxis, swrAxis, tickLabel,
} from '../layout/scales.ts';
import type { Axis } from '../layout/scales.ts';
import type { Complex } from '../model/complex.ts';
import { formatHertzShort } from '../model/frequency.ts';
import type { RectSeries, RoundSeries, Series, TdrSeries } from '../model/series.ts';
import type { Sweep } from '../model/sweep.ts';
import type { MarkerSpec, NoteSpec, NoteUnit } from '../types.ts';
import { traceColor } from './theme.ts';
import type { Theme } from './theme.ts';

/**
 * 枠 1 つを描く。**格子 → band → 理想 (破線) → 実測 (実線) → マーカー → 注釈**の順に
 * 重ねる (指した印が線の下に隠れないように)。
 */

const STROKE = 1.5;
const DASH = '5 3';
const HORIZONTAL = 10;

export type PanelInput = {
  readonly panel: Panel;
  readonly series: readonly Series[];
  readonly sweep: Sweep;
  readonly markers: readonly MarkerSpec[];
  readonly notes: readonly NoteSpec[];
  readonly theme: Theme;
};

/** 注釈の単位 → 置く枠。単位の無い数は SWR か linear。 */
export const UNIT_PANELS: Readonly<Record<NoteUnit, readonly PanelKind[]>> = {
  dB: ['db'],
  deg: ['deg'],
  ns: ['ns'],
  ohm: ['ohm'],
  none: ['swr', 'lin'],
};

const UNIT_TEXT: Readonly<Record<PanelKind, string>> = {
  db: 'dB', deg: '°', ns: 'ns', swr: '', lin: '', ohm: 'Ω', smith: '', polar: '', tdr: '',
};

const HEADING: Readonly<Record<PanelKind, string>> = {
  db: 'LOGMAG', deg: 'PHASE', ns: 'DELAY', swr: 'SWR', lin: 'LINEAR', ohm: 'R · X · |Z|', smith: 'SMITH', polar: 'POLAR', tdr: 'TDR',
};

/** 見出しに添える形式の名前。 */
const FORMAT_NAME: Readonly<Record<string, string>> = { r: 'R', x: 'X', z: '|Z|' };

const rectValues = (series: readonly Series[]): number[] =>
  series.flatMap((one) => (one.kind === 'rect' ? one.points.map((point) => point.value) : []));

/** その枠の縦軸。**描く値から決める** (dB の上端・Ω の幅)。 */
export function axisOf(kind: PanelKind, series: readonly Series[]): Axis {
  const values = rectValues(series);
  switch (kind) {
    case 'db': return dbAxis(values);
    case 'deg': return degAxis();
    case 'ns': return niceAxis(values, false, [0, 8]);
    case 'swr': return swrAxis(values);
    case 'lin': return linAxis();
    case 'ohm': {
      const onlyZ = series.length > 0 && series.every((one) => one.trace.spec.format === 'z');
      return onlyZ ? logOhmAxis(values) : ohmAxis(values);
    }
    default: return niceAxis(series.flatMap((one) => (one.kind === 'tdr' ? one.tdr.points.map((point) => point.value) : [])), true, [0, 1]);
  }
}

const perDivision = (kind: PanelKind, axis: Axis): string => {
  if (axis.log) return '10 倍/目盛 (対数)';
  const step = (axis.max - axis.min) / DIVISIONS;
  const shown = Math.round(step * 1000) / 1000;
  const unit = UNIT_TEXT[kind];
  return `${shown}${unit === '' || unit === '°' ? unit : ` ${unit}`}/目盛`;
};

function heading(input: PanelInput, axis: Axis | null): string {
  const { panel, theme } = input;
  const size = theme.metrics.textSize;
  const y = panel.box.y + size;
  const tdrVf = panel.traces[0]?.spec.vf;
  // Ω の枠は**描いている形式だけ**を名乗る (|Z| だけなら |Z|)。
  const name = panel.kind === 'ohm'
    ? [...new Set(panel.traces.map((trace) => FORMAT_NAME[trace.spec.format] ?? ''))].join(' · ')
    : HEADING[panel.kind];
  const title = panel.kind === 'tdr'
    ? `TDR  帯域通過 · vf ${tdrVf ?? 0.66}`
    : axis === null ? name : `${name}  ${perDivision(panel.kind, axis)}`;
  const left = svgText(panel.plot.x, y, title, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size), 'font-weight': 600 });
  // **形式が混ざる枠では形式も添える** (R・X・|Z| を重ねた枠が「S11 S11 S11」にならない)。
  const mixed = new Set(panel.traces.map((trace) => trace.spec.format)).size > 1;
  let x = panel.plot.x + panel.plot.width;
  const names = [...panel.traces].reverse().map((trace) => {
    const label = mixed ? `${trace.spec.param} ${FORMAT_NAME[trace.spec.format] ?? ''}` : trace.spec.param;
    const text = svgText(x, y, label, { anchor: 'end', fill: traceColor(theme, trace.index), 'font-size': num(size), 'font-weight': 600 });
    x -= textWidth(label) * size + size;
    return text;
  });
  return left + names.join('');
}

const polyline = (points: readonly (readonly [number, number])[], color: string, dashed: boolean): string =>
  (points.length < 2
    ? ''
    : element('polyline', {
      points: points.map(([x, y]) => `${num(x)},${num(y)}`).join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': STROKE,
      'stroke-linejoin': 'round',
      ...(dashed ? { 'stroke-dasharray': DASH } : {}),
    }));

/** 番号が格子の上にはみ出す高さ。これより上の点では印を下向きに返す。 */
const GLYPH_REACH = 17;

/**
 * マーカーの印 (▽ と番号)。先が点を指す。**格子の上の縁に近い点では ▲ を点の下に**
 * 置く — 上に出すと枠の見出しに重なる (0 dB の LOGMAG で踏んだ)。
 */
function markerGlyph(x: number, y: number, label: string, color: string, theme: Theme, top: number): string {
  const below = y - GLYPH_REACH < top;
  const tip = below ? 7 : -7;
  const path = `M${num(x)},${num(y)} L${num(x - 4)},${num(y + tip)} L${num(x + 4)},${num(y + tip)} Z`;
  const size = theme.metrics.smallSize;
  return element('path', { d: path, fill: color })
    + svgText(x, below ? y + 9 + size * 0.8 : y - 9, label, {
      fill: color, 'font-size': num(size), 'font-weight': 600, halo: theme.palette.halo, haloWidth: 2.5,
    });
}

/** 列の中のその周波数の値。**実測は一番近い点** (実機のマーカーと同じ)、理想は前後の点の間を直線で。 */
export function valueAt<T extends number | Complex>(
  points: readonly { readonly f: number; readonly value: T }[],
  f: number,
  snap: boolean,
  mix: (a: T, b: T, t: number) => T,
): { readonly f: number; readonly value: T } | null {
  if (points.length === 0) return null;
  const after = points.findIndex((point) => point.f >= f);
  if (after === -1) return snap ? (points.at(-1) ?? null) : null;
  if (after === 0) return (points[0]?.f ?? 0) === f || snap ? (points[0] ?? null) : null;
  const a = points[after - 1];
  const b = points[after];
  if (a === undefined || b === undefined) return null;
  // **吸い付いた点の周波数も返す** — 印は吸い付いた所に描く (表の読み値と同じ点)。
  if (snap) return f - a.f <= b.f - f ? a : b;
  return { f, value: mix(a.value, b.value, (f - a.f) / (b.f - a.f)) };
}

const mixNumber = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 位相の補間。**±180° の折り返しをまたぐときは 360° ずらしてから**混ぜ、範囲に戻す。 */
export const mixPhase = (a: number, b: number, t: number): number => {
  const near = b - a > 180 ? b - 360 : b - a < -180 ? b + 360 : b;
  const mixed = a + (near - a) * t;
  return mixed > 180 ? mixed - 360 : mixed < -180 ? mixed + 360 : mixed;
};
const mixComplex = (a: Complex, b: Complex, t: number): Complex => ({ re: a.re + (b.re - a.re) * t, im: a.im + (b.im - a.im) * t });

/** マーカーを載せる列。**トレースごとに実測があれば実測、無ければ理想**。 */
function shownSeries<T extends Series>(series: readonly T[]): readonly T[] {
  return series.filter((one) => one.basis === 'data'
    || !series.some((other) => other.basis === 'data' && other.trace.index === one.trace.index));
}

const ordered = <T extends Series>(series: readonly T[]): readonly T[] =>
  [...series.filter((one) => one.basis === 'model'), ...series.filter((one) => one.basis === 'data')];

/**
 * 線を切る所。**位相が ±180° で折り返す所では切る** — 繋ぐと枠を縦に横切る線が出る
 * (実機も折り返しでは線を繋がない)。
 */
function pieces<T extends { readonly value: number }>(points: readonly T[], wraps: boolean): readonly (readonly T[])[] {
  if (!wraps) return [points];
  return points.reduce<T[][]>((out, point, index) => {
    const before = points[index - 1];
    if (before === undefined || Math.abs(point.value - before.value) > 180) out.push([point]);
    else out.at(-1)?.push(point);
    return out;
  }, []);
}

// ---- 直交の枠 (周波数が横軸) ----

function renderRect(input: PanelInput): string {
  const { panel, sweep, theme, markers, notes } = input;
  const { plot } = panel;
  const series = input.series.filter((one): one is RectSeries => one.kind === 'rect');
  const axis = axisOf(panel.kind, series);
  const xOf = (f: number): number => plot.x + ((f - sweep.start) / (sweep.stop - sweep.start)) * plot.width;
  const yOf = (value: number): number => plot.y + (1 - fraction(axis, value)) * plot.height;

  const bands = notes.flatMap((note) => {
    if (note.kind !== 'band') return [];
    const from = Math.max(sweep.start, note.from);
    const to = Math.min(sweep.stop, note.to);
    if (to <= from) return [];
    const x = xOf(from);
    const width = xOf(to) - x;
    return [element('rect', { x: num(x), y: num(plot.y), width: num(width), height: num(plot.height), fill: theme.palette.band, 'fill-opacity': 0.35 })
      + (note.text === null ? '' : svgText(x + width / 2, plot.y + theme.metrics.smallSize + 3, note.text, {
        fill: theme.palette.caption, 'font-size': num(theme.metrics.smallSize), halo: theme.palette.halo, haloWidth: 2.5,
      }))];
  });

  const lines = ordered(series).flatMap((one) => pieces(one.points, panel.kind === 'deg').map((piece) =>
    polyline(piece.map((point) => [xOf(point.f), yOf(point.value)] as const), traceColor(theme, one.trace.index), one.basis === 'model')));

  const glyphs = shownSeries(series).flatMap((one) => markers.flatMap((marker, index) => {
    const at = valueAt(one.points, marker.f, one.basis === 'data', panel.kind === 'deg' ? mixPhase : mixNumber);
    return at === null ? [] : [markerGlyph(xOf(at.f), yOf(at.value), `${index + 1}`, traceColor(theme, one.trace.index), theme, plot.y)];
  }));

  const noted = notes.flatMap((note) => {
    if (note.kind !== 'text' && note.kind !== 'mark') return [];
    if (note.f < sweep.start || note.f > sweep.stop) return [];
    const x = xOf(note.f);
    const y = yOf(note.value);
    const ring = element('circle', { cx: num(x), cy: num(y), r: 3.5, fill: 'none', stroke: theme.palette.note, 'stroke-width': 1.5 });
    if (note.kind === 'mark') return [ring];
    const right = x < plot.x + plot.width * 0.6;
    return [ring + svgText(x + (right ? 6 : -6), y - 6, note.text, {
      anchor: right ? 'start' : 'end', fill: theme.palette.note, 'font-size': num(theme.metrics.smallSize), halo: theme.palette.halo, haloWidth: 2.5,
    })];
  });

  const xLabels = [0, HORIZONTAL / 2, HORIZONTAL].map((division) => {
    const f = sweep.start + ((sweep.stop - sweep.start) * division) / HORIZONTAL;
    const anchor = division === 0 ? 'start' : division === HORIZONTAL ? 'end' : 'middle';
    return svgText(plot.x + (plot.width * division) / HORIZONTAL, plot.y + plot.height + theme.metrics.smallSize + 4, formatHertzShort(f), {
      anchor, fill: theme.palette.label, 'font-size': num(theme.metrics.smallSize),
    });
  });

  return heading(input, axis) + grid(panel, axis, theme) + bands.join('') + lines.join('')
    + glyphs.join('') + noted.join('') + xLabels.join('');
}

/** 10 × 8 目盛の格子と縦軸の字。対数の軸は 10 倍ごとに線を引く。 */
function grid(panel: Panel, axis: Axis, theme: Theme): string {
  const { plot } = panel;
  const { palette } = theme;
  const size = theme.metrics.smallSize;
  const vertical = Array.from({ length: HORIZONTAL - 1 }, (_, index) => {
    const x = plot.x + (plot.width * (index + 1)) / HORIZONTAL;
    return element('line', { x1: num(x), y1: num(plot.y), x2: num(x), y2: num(plot.y + plot.height), stroke: palette.grid, 'stroke-width': 0.75 });
  });
  const horizontal = axis.ticks.map((tick) => {
    const y = plot.y + (1 - (tick - axis.min) / (axis.max - axis.min)) * plot.height;
    const line = tick === axis.min || tick === axis.max
      ? ''
      : element('line', { x1: num(plot.x), y1: num(y), x2: num(plot.x + plot.width), y2: num(y), stroke: palette.grid, 'stroke-width': 0.75 });
    const label = svgText(plot.x - 4, y + size * 0.35, tickLabel(tick, axis, axis.log ? 'Ω' : ''), {
      anchor: 'end', fill: palette.label, 'font-size': num(size),
    });
    return line + label;
  });
  const frame = element('rect', {
    x: num(plot.x), y: num(plot.y), width: num(plot.width), height: num(plot.height), fill: 'none', stroke: palette.frame, 'stroke-width': 1,
  });
  return vertical.join('') + horizontal.join('') + frame;
}

// ---- TDR (距離が横軸) ----

/** 反射とみなす高さ (一番高い山に対する比)。 */
const SIGNIFICANT = 0.05;

/**
 * 横軸に描く距離。**見える範囲いっぱいは描かない** — 1 GHz まで掃引すると 40 m 先まで
 * 見えるが、1 m のケーブルの山が左端に潰れる。一番遠い反射の 2 倍を切りの良い値に
 * 丸め、見える範囲で頭を打つ。
 */
export function visibleRange(series: readonly TdrSeries[]): number {
  const full = Math.max(1e-9, ...series.map((one) => one.tdr.range));
  const far = Math.max(0, ...series.flatMap((one) => {
    const top = one.tdr.peak?.value ?? 0;
    // **後ろ半分は探さない** — 逆 FFT は巡回なので、入口 (t≈0) の山の左の裾が記録の
    // 末尾に折り返して出る。そこを「遠い反射」と読むと、横軸が範囲いっぱいに伸びる。
    return one.tdr.points
      .filter((point) => point.distance <= one.tdr.range / 2 && point.value >= top * SIGNIFICANT)
      .map((point) => point.distance);
  }));
  if (far === 0) return full;
  const wanted = far * 2;
  const power = 10 ** Math.floor(Math.log10(wanted));
  const nice = ([1, 2, 2.5, 5, 10].find((multiple) => multiple * power >= wanted) ?? 10) * power;
  return Math.min(full, nice);
}

function renderTdr(input: PanelInput): string {
  const { panel, theme } = input;
  const { plot } = panel;
  const series = input.series.filter((one): one is TdrSeries => one.kind === 'tdr');
  const axis = axisOf('tdr', series);
  const range = visibleRange(series);
  const xOf = (distance: number): number => plot.x + Math.min(1, distance / range) * plot.width;
  const yOf = (value: number): number => plot.y + (1 - fraction(axis, value)) * plot.height;
  const lines = ordered(series).map((one) => polyline(
    one.tdr.points.filter((point) => point.distance <= range).map((point) => [xOf(point.distance), yOf(point.value)] as const),
    traceColor(theme, one.trace.index),
    one.basis === 'model',
  ));
  const peaks = shownSeries(series).flatMap((one) => (one.tdr.peak === null
    ? []
    : [markerGlyph(xOf(one.tdr.peak.distance), yOf(one.tdr.peak.value), '山', traceColor(theme, one.trace.index), theme, plot.y)]));
  const xLabels = [0, HORIZONTAL / 2, HORIZONTAL].map((division) => {
    const anchor = division === 0 ? 'start' : division === HORIZONTAL ? 'end' : 'middle';
    const meters = (range * division) / HORIZONTAL;
    return svgText(plot.x + (plot.width * division) / HORIZONTAL, plot.y + plot.height + theme.metrics.smallSize + 4, `${Math.round(meters * 100) / 100} m`, {
      anchor, fill: theme.palette.label, 'font-size': num(theme.metrics.smallSize),
    });
  });
  return heading(input, axis) + grid(panel, axis, theme) + lines.join('') + peaks.join('') + xLabels.join('');
}

// ---- 丸い枠 (Smith と極) ----

const SMITH_R = [0.2, 0.5, 1, 2, 5] as const;
const SMITH_X = [0.2, 0.5, 1, 2, 5] as const;

function renderRound(input: PanelInput): string {
  const { panel, theme, markers } = input;
  const { plot } = panel;
  const radius = plot.width / 2;
  const cx = plot.x + radius;
  const cy = plot.y + radius;
  const at = (g: Complex): readonly [number, number] => [cx + radius * g.re, cy - radius * g.im];
  const series = input.series.filter((one): one is RoundSeries => one.kind === 'round');
  const lines = ordered(series).map((one) =>
    polyline(one.points.map((point) => at(point.value)), traceColor(theme, one.trace.index), one.basis === 'model'));
  const glyphs = shownSeries(series).flatMap((one) => markers.flatMap((marker, index) => {
    const found = valueAt(one.points, marker.f, one.basis === 'data', mixComplex);
    if (found === null) return [];
    const [x, y] = at(found.value);
    return [markerGlyph(x, y, `${index + 1}`, traceColor(theme, one.trace.index), theme, plot.y)];
  }));
  const chart = panel.kind === 'smith' ? smithGrid(cx, cy, radius, theme) : polarGrid(cx, cy, radius, theme);
  return heading(input, null) + chart + lines.join('') + glyphs.join('');
}

function smithGrid(cx: number, cy: number, radius: number, theme: Theme): string {
  const { palette } = theme;
  const size = theme.metrics.smallSize;
  const thin = { fill: 'none', stroke: palette.grid, 'stroke-width': 0.75 };
  const circles = SMITH_R.map((r) => element('circle', {
    cx: num(cx + radius * (r / (1 + r))), cy: num(cy), r: num(radius / (1 + r)), ...thin,
  }));
  // x の円弧は (1, 0) から単位円の上の点まで。**短い弧**で、上半分は時計回り (画面の向き)。
  const arcs = SMITH_X.flatMap((x) => [x, -x]).map((x) => {
    const px = (x * x - 1) / (x * x + 1);
    const py = (2 * x) / (x * x + 1);
    const r = radius / Math.abs(x);
    return element('path', {
      d: `M${num(cx + radius)},${num(cy)} A${num(r)},${num(r)} 0 0 ${x > 0 ? 1 : 0} ${num(cx + radius * px)},${num(cy - radius * py)}`,
      ...thin,
    });
  });
  const axis = element('line', { x1: num(cx - radius), y1: num(cy), x2: num(cx + radius), y2: num(cy), ...thin });
  const rim = element('circle', { cx: num(cx), cy: num(cy), r: num(radius), fill: 'none', stroke: palette.frame, 'stroke-width': 1 });
  const rLabels = SMITH_R.map((r) => svgText(cx + radius * ((r - 1) / (r + 1)) + 2, cy - 3, `${r}`, {
    anchor: 'start', fill: palette.label, 'font-size': num(size),
  }));
  const xLabels = SMITH_X.flatMap((x) => [x, -x]).map((x) => {
    const px = (x * x - 1) / (x * x + 1);
    const py = (2 * x) / (x * x + 1);
    const out = 1.09;
    return svgText(cx + radius * px * out, cy - radius * py * out + size * 0.35, `${x < 0 ? '−' : ''}j${Math.abs(x)}`, {
      fill: palette.label, 'font-size': num(size),
    });
  });
  const ends = svgText(cx - radius - 3, cy + size * 0.35, '0', { anchor: 'end', fill: palette.label, 'font-size': num(size) })
    + svgText(cx + radius + 3, cy + size * 0.35, '∞', { anchor: 'start', fill: palette.label, 'font-size': num(size) });
  return circles.join('') + arcs.join('') + axis + rim + rLabels.join('') + xLabels.join('') + ends;
}

function polarGrid(cx: number, cy: number, radius: number, theme: Theme): string {
  const { palette } = theme;
  const size = theme.metrics.smallSize;
  const thin = { fill: 'none', stroke: palette.grid, 'stroke-width': 0.75 };
  const rings = [0.25, 0.5, 0.75].map((r) => element('circle', { cx: num(cx), cy: num(cy), r: num(radius * r), ...thin }));
  const spokes = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 6;
    const dx = radius * Math.cos(angle);
    const dy = radius * Math.sin(angle);
    return element('line', { x1: num(cx - dx), y1: num(cy + dy), x2: num(cx + dx), y2: num(cy - dy), ...thin });
  });
  const rim = element('circle', { cx: num(cx), cy: num(cy), r: num(radius), fill: 'none', stroke: palette.frame, 'stroke-width': 1 });
  const labels = [['0°', radius + 4, 0, 'start'], ['90°', 0, -radius - 5, 'middle'], ['180°', -radius - 4, 0, 'end'], ['−90°', 0, radius + size + 3, 'middle']] as const;
  const angleLabels = labels.map(([text, dx, dy, anchor]) => svgText(cx + dx, cy + dy + size * 0.35, text, {
    anchor, fill: palette.label, 'font-size': num(size),
  }));
  const ringLabels = [0.5].map((r) => svgText(cx + radius * r - 2, cy - 3, `${r}`, { anchor: 'end', fill: palette.label, 'font-size': num(size) }));
  return rings.join('') + spokes.join('') + rim + angleLabels.join('') + ringLabels.join('');
}

export function renderPanel(input: PanelInput): string {
  if (input.panel.kind === 'smith' || input.panel.kind === 'polar') return renderRound(input);
  if (input.panel.kind === 'tdr') return renderTdr(input);
  return renderRect(input);
}
