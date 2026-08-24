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

export const fenceError = (message: string, line: number | null): FenceError => ({ message, line });

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T>(message: string, line: number | null): Result<T> => ({
  ok: false,
  error: fenceError(message, line),
});
