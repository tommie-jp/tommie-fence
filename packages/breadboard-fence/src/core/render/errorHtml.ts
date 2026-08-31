import type { FenceError } from '../types.ts';
import { errorLine, sourceRows } from './errorText.ts';
import { escapeXml } from './svg.ts';

/**
 * 読めなかったところを図の**外**に出す。
 *
 * 帯を SVG の中に描いていた頃は、字が選べず、折り返しも桁合わせも自前で
 * やる必要があった。HTML なら等幅の `<pre>` に流すだけで印の桁が合い、
 * 読み手はそのまま文面をコピーできる。図の SVG は図だけになるので、
 * GitHub や別のノートに貼ったときにも余計なものが付いてこない。
 *
 * VS Code のプレビューは拡張が返した HTML をサニタイズしないので、
 * 中の字は必ず `escapeXml` を通す (図と同じ約束)。
 */
const MAX_SHOWN = 8;

const rowsHtml = (error: FenceError): string => {
  const rows = sourceRows(error);
  if (rows.length === 0) return '';
  return `<pre class="breadboard-error-source">${escapeXml(rows.join('\n'))}</pre>`;
};

const itemHtml = (error: FenceError): string => {
  const kind = error.notice === true ? ' breadboard-notice' : '';
  return `<li class="breadboard-error-item${kind}">`
    + `<span class="breadboard-error-line">${escapeXml(errorLine(error))}</span>`
    + `${rowsHtml(error)}</li>`;
};

function listHtml(errors: readonly FenceError[]): string {
  const shown = errors.slice(0, MAX_SHOWN).map(itemHtml).join('');
  // 1 件が 2〜3 行を使うので、全部並べると図より帯のほうが長くなる。
  const rest = errors.length > MAX_SHOWN
    ? `<li class="breadboard-error-item">ほかに ${errors.length - MAX_SHOWN} 件</li>`
    : '';
  return `<ul class="breadboard-error-list">${shown}${rest}</ul>`;
}

/** 図は描けたが一部が読めなかったときに、図の下へ貼る帯。 */
export const renderErrorBanner = (errors: readonly FenceError[]): string =>
  errors.length === 0 ? '' : `<div class="breadboard-errors">${listHtml(errors)}</div>`;

/** 図が 1 つも描けなかったときのカード。 */
export const renderErrorCard = (errors: readonly FenceError[]): string =>
  '<div class="breadboard-error-card">'
  + '<p class="breadboard-error-title">breadboard フェンスを読めませんでした</p>'
  + `${listHtml(errors)}</div>`;
