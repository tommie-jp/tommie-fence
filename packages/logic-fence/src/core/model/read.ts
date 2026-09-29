/** 1 つの値を読んだ答え。**読めなければ理由と、指す綴り**を返し、行は呼ぶ側が付ける。 */
export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string; readonly token?: string };

export const ok = <T>(value: T): Read<T> => ({ ok: true, value });

export const fail = <T>(reason: string, token?: string): Read<T> =>
  (token === undefined || token === '' ? { ok: false, reason } : { ok: false, reason, token });

/** 空白で区切る。**空の語は落とす** (2 つ続いた空白)。 */
export const wordsOf = (text: string): string[] => text.trim().split(/\s+/).filter((word) => word !== '');
