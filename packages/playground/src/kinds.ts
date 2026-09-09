/**
 * どのフェンスか。**この 3 つだけ**が画面の切替とリンクの綴りに現れる。
 *
 * 依存を持たない小さな島にしてある — 共有リンクの組み立て (`share.ts`) も
 * 例の読み込み (`examples.ts`) もこれを要るが、3 つの描画コア
 * (`fences.ts` が束ねる) までは要らないため。
 */
export const KINDS = ['circuit', 'breadboard', 'perfboard'] as const;

export type Kind = (typeof KINDS)[number];

/** 外から来た字 (JSON・画面の状態) を種類として受け取ってよいか。**正の綴りだけ。** */
export const isKind = (value: unknown): value is Kind =>
  typeof value === 'string' && (KINDS as readonly string[]).includes(value);

/**
 * 正でない綴りと、その指し先。**足すだけで、減らさない。**
 *
 * 共有リンクは種類を**平文で**載せている (`#breadboard/…`) ので、綴りを
 * 変えると配ってあるリンクが読めなくなる。52 の docs/08 で
 * 「短い綴りを正にして長い綴りを別名で残す。別名に期限を切らない」と
 * 決めてあるので、**入れ替える前から両方を読めるようにしておく** —
 * そうすれば正を入れ替える日は、この表の向きを変えるだけで済む。
 *
 * `circuit` に短い綴りは無い (docs/08: 総称の `-board` を落とすので、
 * もともと識別子だけの `circuit` は変わらない)。
 */
const ALSO: Readonly<Record<string, Kind>> = {
  bread: 'breadboard',
  perf: 'perfboard',
};

/**
 * 外から来た字 (URL) を種類に直す。**別名も受ける。** 読めなければ null。
 *
 * 受け口をここだけ緩めるのは、リンクが「昔の綴りで書かれていることがある」
 * ものだから。画面の状態や例の JSON は自分で作るので `isKind` のまま。
 */
export const toKind = (value: unknown): Kind | null => {
  if (isKind(value)) return value;
  return typeof value === 'string' ? ALSO[value] ?? null : null;
};

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
