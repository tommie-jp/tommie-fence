/**
 * 胴を描く側が受け取る型と、既定の塗り。**どの胴のファイルからも値を読めるよう
 * 何も import しない** — `bodies.ts` と `smdDraw.ts` は互いを呼ぶので、既定の塗りを
 * どちらかに置くと値の循環になる。
 */

/** 胴を描くのに要る部品の情報。**両方の `PlacedPart` がそのまま当てはまる形**。 */
export type BodyPart = {
  readonly type: string;
  readonly value?: string | null;
  /** 姿 (`capacitor/electrolytic` の `electrolytic`、LED の `3mm`)。 */
  readonly variant?: string | null;
  /** 足。極性の印 (`+` `-` `A` `K`) を読む。 */
  readonly pins: readonly { readonly name: string }[];
};

/**
 * 塗りの差し替え口。`name` は**実物の色の名前**が分かっているとき
 * (抵抗の帯、LED の色) だけ付く。白黒の図はそこで網に移す。
 */
export type BodyInk = {
  readonly paint: (color: string, name?: string) => string;
};

/** そのままの色で描く (色のある図)。 */
export const REAL_INK: BodyInk = { paint: (color) => color };
