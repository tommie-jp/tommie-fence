import { wireColor, wireColorNames } from './colors.ts';
import { BOLD_FAMILY, num, svgText } from './svg.ts';
import { fit, textWidth } from './textFit.ts';

/**
 * **画面の外 (上か下) に置く字** — 計器の画面とグラフ (scope・spectrum・vna・graph・logic) の注釈
 * `- text below: 字` `- text above: 字` (52 の docs/157)。画面の中の注釈は番地 (時刻と電圧、軸の値) で
 * 置くので、画面の外を指せない。説明や読み方を画面に重ねずに書くための帯。
 *
 * - `\n` で改行する (YAML の 1 行の中に複数行を書くため)。120 字・8 行まで
 * - 語は色 (配線の色の名前) と `bold`
 */
export type OutsidePlace = 'above' | 'below';

export type OutsideNote = {
  readonly place: OutsidePlace;
  readonly lines: readonly string[];
  /** 色 (`#rrggbb`)。書かなければ null (呼ぶ側の字の色)。 */
  readonly color: string | null;
  readonly bold: boolean;
};

export const OUTSIDE_LIMITS = { length: 120, lines: 8 } as const;

/** 行の送りと、帯の上下の余白 (字の大きさに対する比と px)。 */
const LEADING = 1.35;
const PAD = 6;

/** 書いた語が「画面の外の字」か (`below` `above`)。 */
export const isOutsidePlace = (word: string | undefined): word is OutsidePlace => word === 'below' || word === 'above';

export type OutsideRead =
  | { readonly ok: true; readonly note: OutsideNote }
  | { readonly ok: false; readonly message: string; readonly token?: string };

/**
 * `text below red bold: 字` の、`text` の後ろの語 (`below red bold`) と字を読む。
 * 字の見えない字 (制御文字) は呼ぶ側が落としてから渡す。
 */
export function readOutsideNote(words: readonly string[], body: string | null): OutsideRead {
  const [place, ...rest] = words;
  if (!isOutsidePlace(place)) return { ok: false, message: 'text の画面の外は below か above で書きます', token: place };
  let color: string | null = null;
  let bold = false;
  for (const word of rest) {
    const lower = word.toLowerCase();
    if (lower === 'bold' && !bold) {
      bold = true;
      continue;
    }
    const hex = wireColor(lower);
    if (hex !== null && color === null) {
      color = hex;
      continue;
    }
    return { ok: false, message: `画面の外の字に書ける語は色 (${wireColorNames().slice(0, 6).join(' / ')} など) と bold です (今は ${word})`, token: word };
  }
  const text = (body ?? '').trim();
  if (text === '') return { ok: false, message: 'text は字を : の後ろに書きます (例: - text below: 1 τ で 63 %)' };
  const lines = [...text.replace(/\\n/g, '\n')].slice(0, OUTSIDE_LIMITS.length).join('')
    .split('\n').slice(0, OUTSIDE_LIMITS.lines);
  return { ok: true, note: { place, lines, color, bold } };
}

export type OutsideSize = { readonly width: number; readonly height: number };

/** 帯の大きさ (その場所の字を全部積んだもの)。字が無ければ高さ 0。 */
export function outsideNotesSize(notes: readonly OutsideNote[], place: OutsidePlace, size: number): OutsideSize {
  const here = notes.filter((note) => note.place === place);
  const lines = here.flatMap((note) => note.lines);
  if (lines.length === 0) return { width: 0, height: 0 };
  const width = Math.max(...lines.map((line) => textWidth(line) * size));
  return { width: Math.ceil(width), height: Math.ceil(lines.length * size * LEADING + PAD * 2) };
}

export type OutsideBand = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 帯に字を積む。帯の幅を越える行は `…` で切る。 */
export function renderOutsideNotes(
  notes: readonly OutsideNote[], place: OutsidePlace, band: OutsideBand, options: { readonly size: number; readonly fill: string },
): string {
  const { size, fill } = options;
  let row = 0;
  return notes.filter((note) => note.place === place).map((note) => note.lines.map((line) => {
    const y = band.y + PAD + size * (0.8 + row * LEADING);
    row += 1;
    return svgText(band.x, y, fit(line, band.width / size), {
      anchor: 'start', 'font-size': num(size), fill: note.color ?? fill,
      ...(note.bold ? { 'font-weight': 700, 'font-family': BOLD_FAMILY } : {}),
    });
  }).join('')).join('');
}
