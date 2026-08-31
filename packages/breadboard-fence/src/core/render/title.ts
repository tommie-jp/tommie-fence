import { element, num, svgText } from './svg.ts';
import { fit } from './textFit.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 図の題。**左上に 1 行だけ**で、大きさ・太さ・色は選べない
 * (選べるようにすると、題ではなく注釈になってしまう。字を自由に置きたいときは
 * `notes:` の `text` がある)。
 */
const TITLE_SCALE = 1.4;
const TITLE_TOP_PAD = 6;
const TITLE_BOTTOM_PAD = 8;

const fontSizeOf = (theme: RenderTheme): number => theme.metrics.textSize * TITLE_SCALE;

/** 題のぶんだけ図を下へずらす高さ。題が無ければ 0。 */
export const titleHeight = (title: string | null, theme: RenderTheme): number =>
  title === null || title === '' ? 0 : fontSizeOf(theme) + TITLE_TOP_PAD + TITLE_BOTTOM_PAD;

export function renderTitle(title: string | null, x: number, width: number, theme: RenderTheme): string {
  if (title === null || title === '') return '';

  const size = fontSizeOf(theme);
  return element(
    'g',
    {},
    svgText(x, TITLE_TOP_PAD + size, fit(title, width / size), {
      'font-size': num(size),
      'font-weight': 700,
      fill: theme.palette.partText,
      anchor: 'start',
    }),
  );
}
