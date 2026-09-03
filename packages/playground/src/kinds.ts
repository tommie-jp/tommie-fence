/**
 * どのフェンスか。**この 3 つだけ**が画面の切替とリンクの綴りに現れる。
 *
 * 依存を持たない小さな島にしてある — 共有リンクの組み立て (`share.ts`) も
 * 例の読み込み (`examples.ts`) もこれを要るが、3 つの描画コア
 * (`fences.ts` が束ねる) までは要らないため。
 */
export const KINDS = ['breadboard', 'perfboard', 'circuit'] as const;

export type Kind = (typeof KINDS)[number];

/** 外から来た字 (URL・JSON) を種類として受け取ってよいか。 */
export const isKind = (value: unknown): value is Kind =>
  typeof value === 'string' && (KINDS as readonly string[]).includes(value);

/** 画面に出す名前。フェンスの綴りそのものなので訳さない。 */
export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  breadboard: 'breadboard',
  perfboard: 'perfboard',
  circuit: 'circuit',
};
