import type { FenceError } from '../types.ts';
import { markRange, relatedLine } from '../errors.ts';
import { element, escapeHtml } from './html.ts';

/**
 * 並べるエラーの数。これを超えたぶんは 1 行にまとめる (帯が図より高くならないように)。
 * **1 件が行の中身と印で 2〜3 行を使う**ので、1 件 1 行だったころより低くしてある。
 */
const MAX_SHOWN = 5;

/** どこから出た文言かがひと目で分かるように、出す 1 行の頭へ必ず付ける名札。 */
const PREFIX = 'circuit: ';

/** 行番号と本文だけの形。自分で見出しを付ける出し先 (CLI のお知らせ) がここを使う。 */
export const messageLine = (error: FenceError): string => {
  const related = relatedLine(error);
  const body = related === null ? error.message : `${error.message} (${related} 行目)`;
  return error.line === null ? body : `${error.line} 行目: ${body}`;
};

/** 図の下の帯にも CLI にも出る、エラー 1 件ぶんの 1 行。 */
export const errorLine = (error: FenceError): string => `${PREFIX}${messageLine(error)}`;

/**
 * 読めなかった行の中身。**プレビューではフェンスが図に差し替わる**ので、
 * 行番号だけでは読み手に照らす先がない。
 *
 * 中身は他人が書いた字なので、`<mark>` の前後も中も 1 つずつエスケープを通す
 * (組み立ててから通すと `<mark>` 自身が消える)。
 */
function snippetHtml(error: FenceError): string {
  const { text } = error;
  if (text === undefined) return '';

  const range = markRange(error);
  const body =
    range === null
      ? escapeHtml(text)
      : escapeHtml(text.slice(0, range[0])) +
        element('mark', {}, escapeHtml(text.slice(range[0], range[1]))) +
        escapeHtml(text.slice(range[1]));

  return element('code', { class: 'circuit-error-line' }, body);
}

const listItems = (errors: readonly FenceError[]): string => {
  const shown = errors
    .slice(0, MAX_SHOWN)
    .map((error) => element('li', {}, escapeHtml(errorLine(error)) + snippetHtml(error)));
  const rest = errors.length > MAX_SHOWN ? [element('li', {}, `ほかに ${errors.length - MAX_SHOWN} 件`)] : [];
  return [...shown, ...rest].join('');
};

/** 図は描けたが一部が読めなかったときに、図の下へ貼る帯。 */
export const renderErrorBanner = (errors: readonly FenceError[]): string =>
  errors.length === 0 ? '' : element('ul', { class: 'circuit-errors' }, listItems(errors));

/** 図が 1 つも描けなかったときに返す、それ自体で完結したカード。 */
export const renderErrorCard = (errors: readonly FenceError[]): string =>
  element(
    'div',
    { class: 'circuit-error-card' },
    element('p', { class: 'circuit-error-title' }, 'circuit フェンスを読めませんでした') +
      renderErrorBanner(errors),
  );
