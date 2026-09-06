/**
 * どのフェンスか。**この 3 つだけ**が画面の切替とリンクの綴りに現れる。
 *
 * 依存を持たない小さな島にしてある — 共有リンクの組み立て (`share.ts`) も
 * 例の読み込み (`examples.ts`) もこれを要るが、3 つの描画コア
 * (`fences.ts` が束ねる) までは要らないため。
 */
export const KINDS = ['circuit', 'breadboard', 'perfboard'] as const;

export type Kind = (typeof KINDS)[number];

/** 外から来た字 (URL・JSON) を種類として受け取ってよいか。 */
export const isKind = (value: unknown): value is Kind =>
  typeof value === 'string' && (KINDS as readonly string[]).includes(value);

/**
 * 画面に出す名前。**フェンスの綴りに、その図の呼び名を添える。**
 *
 * 綴りだけだと、初めて来た人には 3 つが何の図なのか分からない
 * (`perfboard` が「基板図」だと当てられない)。綴りは書くときに要るので
 * 落とさず、括弧で読み方を足す。
 *
 * 並びは**回路図 → ブレッドボード → 基板** (`KINDS`)。作る順そのものなので、
 * 初めての人がボタンを左から押すと組み立ての順になる。
 */
export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  circuit: 'circuit',
  breadboard: 'breadboard',
  perfboard: 'perfboard',
};

/**
 * その図の呼び名。**綴りとは別に持つ** — 狭い画面では呼び名を畳んで、
 * 3 つの釦を 1 行に収める (綴りのほうがフェンスに書く字で、そちらは畳めない)。
 */
export const KIND_READING: Readonly<Record<Kind, string>> = {
  circuit: '回路図',
  breadboard: 'ブレッドボード図',
  perfboard: '基板図',
};
