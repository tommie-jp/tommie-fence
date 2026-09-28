import { element, formatSeconds, formatVolts, num, svgText } from 'fence-kit';
import { notice } from '../errors.ts';
import type { Rect } from '../layout/screen.ts';
import { DIVISIONS } from '../model/screen.ts';
import type { TraceName } from '../model/channel.ts';
import type { Screen } from '../model/screen.ts';
import type { FenceError, NoteSpec } from '../types.ts';
import type { Theme } from './theme.ts';
import type { Scale } from './trace.ts';

/**
 * 注釈を時間の画面に置く (vna の panel.ts と同じ描き方)。**band は線の下、印と字は線の上**。
 * 横は画面の時刻、縦は注釈の ch の V/div と基準 (書かなければ ch1)。
 * **置けない注釈は言う** (黙って消さない): 画面の外、描いていない ch。
 * 字は `svgText` が `escapeMarkup` を通す (唯一の防御。直下の CLAUDE.md の約束 2)。
 */
export type NotesInput = {
  readonly notes: readonly NoteSpec[];
  readonly grid: Rect;
  readonly screen: Screen;
  readonly scales: ReadonlyMap<TraceName, Scale>;
  readonly theme: Theme;
};

export type PlacedNotes = {
  /** band (線の下に描く)。 */
  readonly under: string;
  /** mark と text (線の上に描く)。 */
  readonly over: string;
  readonly said: readonly FenceError[];
};

/** 格子の外と見なす幅 (比)。縁ちょうどの注釈を丸めの誤差で落とさない。 */
const EDGE = 1e-9;
/** 字を丸の右に置くのは丸が格子の左からこの比までのとき (右寄りなら左に置く)。 */
const TEXT_RIGHT_UNTIL = 0.6;
const RING_RADIUS = 3.5;
const TEXT_GAP = 6;
const BAND_OPACITY = 0.35;

const xFraction = (t: number, screen: Screen): number => (t - screen.left) / screen.span;
/** 縦の比。**`fractionY` と違って格子の縁に寄せない** (画面の外かを見るため)。 */
const yFraction = (volts: number, scale: Scale): number => (volts / scale.perDiv + scale.position + DIVISIONS.y / 2) / DIVISIONS.y;

function renderBand(note: Extract<NoteSpec, { kind: 'band' }>, input: NotesInput): { readonly svg: string; readonly said: FenceError | null } {
  const { grid, screen, theme } = input;
  const from = Math.max(0, xFraction(note.from, screen));
  const to = Math.min(1, xFraction(note.to, screen));
  if (to <= from) {
    return { svg: '', said: notice(`band ${formatSeconds(note.from)}〜${formatSeconds(note.to)} は画面の外です (描いていません)`, note.line) };
  }
  const x = grid.x + from * grid.width;
  const width = (to - from) * grid.width;
  const rect = element('rect', { x: num(x), y: num(grid.y), width: num(width), height: num(grid.height), fill: theme.palette.band, 'fill-opacity': BAND_OPACITY });
  const label = note.text === null ? '' : svgText(x + width / 2, grid.y + theme.metrics.smallSize + 3, note.text, {
    fill: theme.palette.note, 'font-size': num(theme.metrics.smallSize), halo: theme.palette.halo, haloWidth: 2.5,
  });
  return { svg: rect + label, said: null };
}

type PointNote = Extract<NoteSpec, { kind: 'mark' | 'text' }>;

/** 点の注釈の画素。置けなければ言うこと。 */
function pointOf(note: PointNote, input: NotesInput): { readonly x: number; readonly y: number } | FenceError {
  const { grid, screen, scales } = input;
  const scale = scales.get(note.channel);
  if (scale === undefined) return notice(`${note.kind} の ${note.channel} を描いていないので、置けません (${note.channel}: を書くか、注釈に描いている ch を書きます)`, note.line, note.channel);
  const fx = xFraction(note.t, screen);
  const fy = yFraction(note.volts, scale);
  if (!(fx >= -EDGE && fx <= 1 + EDGE && fy >= -EDGE && fy <= 1 + EDGE)) {
    return notice(`${note.kind} ${formatSeconds(note.t)} ${formatVolts(note.volts)} は画面の外です (描いていません。${note.channel} の V/div で置きます)`, note.line);
  }
  return { x: grid.x + fx * grid.width, y: grid.y + (1 - fy) * grid.height };
}

function renderPoint(note: PointNote, input: NotesInput): { readonly svg: string; readonly said: FenceError | null } {
  const { grid, theme } = input;
  const at = pointOf(note, input);
  if ('message' in at) return { svg: '', said: at };
  const ring = element('circle', { cx: num(at.x), cy: num(at.y), r: RING_RADIUS, fill: 'none', stroke: theme.palette.note, 'stroke-width': 1.5 });
  if (note.kind === 'mark') return { svg: ring, said: null };
  const right = at.x < grid.x + grid.width * TEXT_RIGHT_UNTIL;
  return {
    svg: ring + svgText(at.x + (right ? TEXT_GAP : -TEXT_GAP), at.y - TEXT_GAP, note.text, {
      anchor: right ? 'start' : 'end', fill: theme.palette.note, 'font-size': num(theme.metrics.smallSize), halo: theme.palette.halo, haloWidth: 2.5,
    }),
    said: null,
  };
}

/** 注釈を描く。`source` はここでは描かない (図の下の帯。呼ぶ側)。 */
export function placeNotes(input: NotesInput): PlacedNotes {
  const said: FenceError[] = [];
  const under: string[] = [];
  const over: string[] = [];
  for (const note of input.notes) {
    if (note.kind === 'source') continue;
    const drawn = note.kind === 'band' ? renderBand(note, input) : renderPoint(note, input);
    (note.kind === 'band' ? under : over).push(drawn.svg);
    if (drawn.said !== null) said.push(drawn.said);
  }
  return { under: under.join(''), over: over.join(''), said };
}
