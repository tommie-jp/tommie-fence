import { LIMITS } from './limits.ts';
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

export const fenceError = (
  message: string,
  line: number | null,
  related: number | null = null,
  token?: string,
): FenceError => ({
  message,
  line,
  ...(related === null ? {} : { related }),
  ...(token === undefined ? {} : { token }),
});

/**
 * 桁まで分かっているエラー。**数えたのが自分ではないとき**に使う
 * (YAML の構文エラーは yaml が桁を返すので、綴りから探し直す理由がない)。
 * 綴り (`token`) を渡す道と入口を分けてあるのは、両方を渡す意味がないため。
 */
export const fenceErrorAt = (message: string, line: number | null, column: number): FenceError => ({
  message,
  line,
  column,
});

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * 読めなかったことを返す。`token` に読めなかった綴りを渡すと、
 * あとで行の中のその位置を指せる (attachSourceText が桁に畳む)。
 */
export const fail = <T>(message: string, line: number | null, token?: string): Result<T> => ({
  ok: false,
  error: fenceError(message, line, null, token),
});

/** 相手の行。書かれていないときと null を同じに扱う唯一の入口。 */
export const relatedLine = (error: FenceError): number | null => error.related ?? null;

/**
 * フェンスの中の行番号を、Markdown の行番号へ移す。
 * 相手の行 (related) も一緒に動かす。ここを 1 か所にしておかないと、
 * 片方だけずれた行番号が出る。
 *
 * 行の中身と桁は**フェンスの行から取ったもの**なので動かさない。
 */
export const shiftErrors = (errors: readonly FenceError[], offset: number): FenceError[] =>
  errors.map((error) => {
    const related = relatedLine(error);
    return {
      ...error,
      ...(error.line === null ? {} : { line: error.line + offset }),
      ...(related === null ? {} : { related: related + offset }),
    };
  });

/**
 * 出口へ流してはいけない字。**1 文字を 1 文字に**置き換える
 * (詰めて落とすと、そこから先の桁が 1 つずつずれてキャレットが的を外す)。
 *
 * 3 種類ある。どれも「他人の書いたノートが、書いていないものを見せる」道:
 *
 * - C0 と DEL — 端末がエスケープとして読む。
 * - C1 (U+0080〜U+009F) — U+009B を端末が CSI として読む。**描画側の
 *   escapeHtml はこの帯を消す**ので、ここで空白に替えておかないと
 *   そこから先の桁が 1 つずつずれて `<mark>` が別の字に当たる。
 * - 並べ替えと幅ゼロ — U+202E から先が右から左に並び替わり、書いていない行を
 *   見せられる。行を割る U+2028 / U+2029 は、帯を white-space: pre で組む
 *   ので中身を 2 行にする。幅ゼロの字も、桁と見た目を食い違わせる。
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028-\u2029\u2066-\u2069\ufeff]/gu;

/**
 * 行の中身をエラーに載せるときの唯一の入口。
 *
 * 字下げは**残す**。落とすと桁が合わなくなり、書いた行と照らせるという
 * この機能の目的が消える。何も書かれていない行では null を返す
 * (空の行を帯に並べても読み手の手がかりにならない)。
 */
export const snippetOf = (rawLine: string): string | null => {
  const kept = rawLine.replace(CONTROL, ' ').replace(/\s+$/u, '');
  if (kept.trim().length === 0) return null;

  // 数えるのも切るのも**字**で行う。UTF-16 の数で切ると絵文字が真っ二つになり、
  // 片割れが出口へ出る。日本語の 120 字も 240 単位ではなく 120 字と数える
  // (この上限は帯の高さと幅のためのもの。valueLength と同じ数え方に揃える)。
  const chars = [...kept];
  return chars.length > LIMITS.snippetLength
    ? `${chars.slice(0, LIMITS.snippetLength).join('')}…`
    : kept;
};

/**
 * 行を綴りの単位に割るときの区切り。**空白と YAML の記号**だけを区切りにする。
 * `a_1.5` の `.` `_`、`i=i1` の `=` は綴りの中の字なので区切りにしない
 * (割ってしまうと `i=i1` を丸ごと指せない)。
 */
const CHUNK = /[^\s:,'"[\]{}]+/gu;

/**
 * 行の中の、その綴りが書かれているところ。**1 か所に決まるときだけ**返す。
 *
 * 綴り 1 つぶんとして書かれているところだけを見る。素の indexOf で探すと
 * `a1` が `a10` の中に当たり、書いていないところにキャレットが立つ。
 *
 * 同じ綴りが 2 つ以上あるときは指さない。先に書かれたほうを選びたくなるが、
 * `resistr: resistr a1 a3` の 1 つめは**読めている部品 ID** で、読めなかったのは
 * 2 つめの種類のほう。どちらか決められないまま片方を指すと、直す必要のない字に
 * キャレットが立つ。**指さないほうがまだ正しい** — 行の中身は出るので、
 * 読み手の手がかりは残る。
 */
const locate = (text: string, token: string): { column: number; span: number } | null => {
  if (token.length === 0) return null;

  const found = [...text.matchAll(CHUNK)].filter((chunk) => chunk[0] === token);
  const only = found.length === 1 ? found[0] : undefined;
  return only === undefined ? null : { column: only.index + 1, span: token.length };
};

/**
 * 行の中身のうち、印を付けるところ。**CLI のキャレットとプレビューの反転が
 * 同じところを指すための唯一の入口** (2 か所で数えると、片方だけ直したときに
 * 黙って食い違う)。
 *
 * 桁が中身の外を指すのは、長い行を切り詰めたとき。そのときは印を付けない。
 * 長さが分からない (0 の) ときも 1 字は取る — 指す先が消えるほうが困る。
 */
export const markRange = (error: FenceError): readonly [number, number] | null => {
  const { text, column, span } = error;
  if (text === undefined || column === undefined || column < 1 || column > text.length) return null;

  const start = column - 1;
  return [start, start + Math.max(span ?? 0, 1)];
};

/**
 * 読めなかった行の中身を 1 件ずつ添える。**行番号をずらす前に**通すこと
 * (ずらしたあとの行番号でフェンスの中身は引けない)。
 *
 * 綴り (`token`) を持っているエラーは、ここで行の中を探して桁に畳み、
 * 綴りそのものは落とす。生の入力を出す側まで運ばないための関門。
 */
export function attachSourceText(errors: readonly FenceError[], source: string): FenceError[] {
  const rows = source.split('\n');

  return errors.map((error) => {
    const { token, ...rest } = error;
    if (error.line === null) return rest;

    const text = snippetOf(rows[error.line - 1] ?? '');
    if (text === null) return rest;

    // 桁が分かっているときは探し直さない (YAML の構文エラーはライブラリが返す)。
    const found = rest.column === undefined && token !== undefined ? locate(text, token) : null;
    return { ...rest, text, ...(found === null ? {} : found) };
  });
}
