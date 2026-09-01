/**
 * 板と印字の配色と寸法。
 *
 * **いまは 1 つだけ。** `style:` でテーマを選べるようにするのは Phase 6 で、
 * 先に何通りも用意すると、板の描き方が固まる前に配色を決めることになる。
 * breadboard の `theme.ts` (317 行) には溝やレールの寸法が混ざっていて
 * そのままでは使えないので、要る分だけをここに持つ。
 */

export type Palette = {
  /** 板の地の色。生基板のガラスエポキシに寄せる。 */
  readonly plate: string;
  readonly plateEdge: string;
  /** 穴の内側 (抜けている所)。 */
  readonly hole: string;
  /** 穴のまわりのランド (はんだが乗る銅箔)。 */
  readonly land: string;
  /** 行と列の名前。 */
  readonly label: string;
  /** 部品の足 (リード線)。 */
  readonly lead: string;
  /** 部品の胴。**実物の色を持つ部品 (LED・カラーコード) はここを使わない** — 
   * あちらは fence-kit の色で、テーマから触らせない。 */
  readonly body: string;
  readonly bodyEdge: string;
  /** 部品の名前と値。 */
  readonly caption: string;
};

export type Metrics = {
  /** 穴の直径。ピッチ (20) より必ず小さく。 */
  readonly holeSize: number;
  /** ランドの外径。 */
  readonly landSize: number;
  readonly textSize: number;
};

export type Theme = { readonly palette: Palette; readonly metrics: Metrics };

export const THEME: Theme = {
  palette: {
    plate: '#e8dfc4',
    plateEdge: '#c9bd96',
    hole: '#8b7f5e',
    land: '#c8a44a',
    label: '#6d6552',
    lead: '#9aa0a6',
    body: '#efe4cd',
    bodyEdge: '#b6a887',
    caption: '#3c3730',
  },
  metrics: {
    holeSize: 4,
    landSize: 9,
    textSize: 9,
  },
};
