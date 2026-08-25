import type { FenceError } from '../types.ts';
import { PALETTE } from './palette.ts';
import { element, num, svgText } from './svg.ts';

const LINE_HEIGHT = 17;
const PADDING = 12;
const CARD_WIDTH = 560;
const MAX_SHOWN = 8;

export const errorLine = (error: FenceError): string =>
  error.line === null ? error.message : `${error.line} 行目: ${error.message}`;

// カードの幅は固定なので、長いメッセージは折り返す (はみ出すと切れて読めなくなる)。
const MAX_CHARS = 62;

const wrap = (text: string): string[] => {
  const characters = [...text];
  const rows: string[] = [];
  for (let start = 0; start < characters.length; start += MAX_CHARS) {
    rows.push(characters.slice(start, start + MAX_CHARS).join(''));
  }
  return rows.length > 0 ? rows : [''];
};

const lines = (errors: readonly FenceError[]): readonly string[] => [
  ...errors.slice(0, MAX_SHOWN).flatMap((error) => wrap(errorLine(error))),
  ...(errors.length > MAX_SHOWN ? [`ほかに ${errors.length - MAX_SHOWN} 件`] : []),
];

const renderLines = (errors: readonly FenceError[], x: number, y: number): string =>
  lines(errors)
    .map((line, index) =>
      svgText(x, y + index * LINE_HEIGHT, line, { 'font-size': 12, fill: PALETTE.errorInk, anchor: 'start' }),
    )
    .join('');

export const bannerHeight = (errors: readonly FenceError[]): number =>
  errors.length === 0 ? 0 : lines(errors).length * LINE_HEIGHT + PADDING * 2;

/** 図は描けたが一部が読めなかったときに、図の下へ貼る帯。 */
export function renderErrorBanner(errors: readonly FenceError[], x: number, y: number, width: number): string {
  if (errors.length === 0) return '';

  const plate = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(bannerHeight(errors) - PADDING), rx: 6,
    fill: PALETTE.errorPlate, stroke: PALETTE.errorEdge,
  });

  return plate + renderLines(errors, x + PADDING, y + PADDING + 4);
}

/** 図が 1 つも描けなかったときに返す、それ自体で完結したカード。 */
export function renderErrorCard(errors: readonly FenceError[]): string {
  const height = LINE_HEIGHT + PADDING + bannerHeight(errors);
  const title = svgText(PADDING * 2, PADDING + LINE_HEIGHT, 'breadboard フェンスを読めませんでした', {
    'font-size': 13, fill: PALETTE.errorInk, anchor: 'start', 'font-weight': 'bold',
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(CARD_WIDTH)}" height="${num(height)}" viewBox="0 0 ${num(CARD_WIDTH)} ${num(height)}">`,
    element('rect', {
      x: PADDING / 2, y: PADDING / 2, width: num(CARD_WIDTH - PADDING), height: num(height - PADDING), rx: 8,
      fill: PALETTE.errorPlate, stroke: PALETTE.errorEdge,
    }),
    title,
    renderLines(errors, PADDING * 2, PADDING + LINE_HEIGHT * 2 + 4),
    '</svg>',
  ].join('\n');
}
