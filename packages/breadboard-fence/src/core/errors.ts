import { LIMITS } from './limits.ts';
import { normalizeNewlines } from './newlines.ts';
import type { FenceError, Result } from './types.ts';

const MAX_TOKEN_LENGTH = 32;

/**
 * エラーメッセージに入力の断片を載せるときの唯一の入口。
 * 図は他人の書いたノートに埋め込まれるので、識別子として意味のある文字だけ残し、
 * 長さも切り詰める (描画側の escapeXml と合わせて二重の防御)。
 */
export const safeToken = (text: string): string => {
  const kept = text.replace(/[^\w.+\-/#]+/gu, ' ').trim();
  return kept.length > MAX_TOKEN_LENGTH ? `${kept.slice(0, MAX_TOKEN_LENGTH)}…` : kept;
};

/**
 * 読めなかったところ。`token` を渡すと、その綴りが行の中で 1 か所に決まるときだけ、
 * 報告に行の中身と下向きの印が付く (`attachSourceText`)。
 */
export const fenceError = (message: string, line: number | null, token?: string): FenceError =>
  token === undefined ? { message, line } : { message, line, token };

/**
 * お知らせ。**読めてはいるが、思ったとおりには出ない**というときに使う。
 * エラーと同じ帯に出すが区別は残す: `style: debug: off` で伏せられるのはこちらだけで、
 * **読めなかった行は伏せられない**。
 */
export const notice = (message: string, line: number | null, token?: string): FenceError => ({
  ...fenceError(message, line, token),
  notice: true,
});

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T>(message: string, line: number | null, token?: string): Result<T> => ({
  ok: false,
  error: fenceError(message, line, token),
});

/**
 * 制御文字・双方向制御・幅ゼロの文字。そのまま見せると桁がずれるうえ、
 * 双方向制御は**見えている並びと実際の並びを食い違わせられる**ので必ず置き換える。
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu;

/**
 * 行の中身を報告に載せられる形にする。**1 文字を 1 文字に置き換える**のが要で、
 * 詰めたり伸ばしたりすると、下に付ける印の桁が本文とずれる。
 * 字下げは残す (どの入れ子の行かが分かる)。
 */
export function snippetOf(text: string): string {
  const shown = text.replace(INVISIBLE, '·').replace(/\t/g, ' ');
  const characters = [...shown];
  return characters.length > LIMITS.snippetLength
    ? `${characters.slice(0, LIMITS.snippetLength).join('')}…`
    : shown;
}

/**
 * 行の中の綴りの位置。**1 か所に決まるときだけ**返す。
 * `resistr: resistr a1 a3` のように 2 つあるときは、どちらでもない場所を
 * 指すより指さないほうが正しい。
 */
export function locate(text: string, token: string): { column: number; length: number } | null {
  const first = text.indexOf(token);
  if (first === -1 || text.indexOf(token, first + 1) !== -1) return null;

  // 桁はコードポイントで数える (サロゲートペアを 2 桁に数えると印がずれる)。
  const column = [...text.slice(0, first)].length;
  const length = [...token].length;
  if (column + length > LIMITS.snippetLength) return null;
  return { column, length };
}

/**
 * 報告に行の中身と印を添える。**行番号をずらす前に**呼ぶこと
 * (ここで見るのはフェンスの中身の行番号で、Markdown 全体の行番号ではない)。
 */
export function attachSourceText(errors: readonly FenceError[], source: string): FenceError[] {
  const lines = normalizeNewlines(source).split('\n');

  return errors.map((error) => {
    if (error.line === null || error.text !== undefined) return error;
    const raw = lines[error.line - 1];
    // 空行を添えても何も伝わらない (YAML の構文エラーは行末を指すことがある)。
    if (raw === undefined || raw.trim() === '') return error;

    const text = snippetOf(raw);
    const at = error.token === undefined ? null : locate(raw, error.token);
    return at === null ? { ...error, text } : { ...error, text, at };
  });
}
