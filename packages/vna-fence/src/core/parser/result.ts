import type { FenceError } from '../types.ts';

/** 1 行を読んだ答え。**読めなければ行番号の無いエラー**を返し、行は呼ぶ側が付ける。 */
export type LineResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FenceError };

export const ok = <T>(value: T): LineResult<T> => ({ ok: true, value });

export const fail = <T>(message: string, token?: string): LineResult<T> => ({
  ok: false,
  error: token === undefined ? { message, line: null } : { message, line: null, token },
});

/** 空白で区切る。**空の語は落とす** (2 つ続いた空白)。 */
export const wordsOf = (text: string): string[] => text.trim().split(/\s+/).filter((word) => word !== '');
