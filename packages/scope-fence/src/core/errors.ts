import { normalizeNewlines } from 'fence-kit';
import { LIMITS } from './limits.ts';
import type { FenceError } from './types.ts';

/**
 * エラーメッセージに入力の断片を載せるときの唯一の入口。
 * 図は他人の書いたノートに埋め込まれるので、識別子として意味のある文字だけ残し、
 * 長さも切り詰める (描画側のエスケープと合わせて二重の防御)。
 */
export const safeToken = (text: string): string => {
  // **どの字体の文字も残す。** `\w` は ASCII だけなので、それで濾すと
  // `抵抗` や `résistor` が丸ごと落ちて、行のどこにも無い綴りを名指すことになる。
  // 図と HTML を守っているのはエスケープのほうなので、ここで落とすのは
  // マークアップになりうる記号だけでよい。
  const kept = text.replace(/[^\p{L}\p{N}_.+\-/#]+/gu, ' ').trim();
  // 記号だけの綴り (`@` や `()`) は全部落ちて空になる。空のまま文に埋めると
  // 「点の名前  は使えません」と、何を指しているのか分からない文になる。
  if (kept === '') return '(記号)';
  const characters = [...kept];
  return characters.length > LIMITS.idLength
    ? `${characters.slice(0, LIMITS.idLength).join('')}…`
    : kept;
};

/**
 * 読めなかったところ。`token` を渡すと、その綴りが行の中で 1 か所に決まるときだけ、
 * 報告に行の中身と下向きの印が付く (`attachSourceText`)。
 */
export const fenceError = (message: string, line: number | null, token?: string): FenceError =>
  token === undefined ? { message, line } : { message, line, token };

/**
 * お知らせ。**読めてはいるが、思ったとおりには出ない**というときに使う。
 * エラーと同じ帯に出すが区別は残す — 直さないと図が出ないものと、
 * 直さなくても図は出るものとでは、次にやることが違う。
 */
export const notice = (message: string, line: number | null, token?: string): FenceError => ({
  ...fenceError(message, line, token),
  notice: true,
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
 * `resistr: resistr b3 b7` のように 2 つあるときは、どちらでもない場所を
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
 * 印を付ける範囲 (0 始まり)。**帯と端末が同じところを指すための唯一の入口**で、
 * 2 か所で数えると片方だけ直したときに黙って食い違う。
 * 長さが 0 でも 1 字は取る — 指す先が消えるほうが困る。
 */
export const markRange = (error: FenceError): readonly [number, number] | null => {
  const { text, at } = error;
  if (text === undefined || at === undefined || at.column < 0 || at.column >= [...text].length) return null;
  return [at.column, at.column + Math.max(at.length, 1)];
};

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

/**
 * 行番号を Markdown の行へずらす。**フェンスの中の数え方で読んだものを、
 * 書き手が直しに行く行に直す** (実機で「.md ファイルの行番号にする」と
 * 言われた)。0 なら何もしない (`.yaml` を丸ごと 1 枚として描くとき)。
 */
export const shiftErrors = (errors: readonly FenceError[], offset: number): readonly FenceError[] =>
  (offset === 0
    ? errors
    : errors.map((error) => ({
      ...error,
      ...(error.line === null ? {} : { line: error.line + offset }),
    })));
