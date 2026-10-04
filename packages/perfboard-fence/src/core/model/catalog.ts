import type { Silk } from '../types.ts';

/**
 * 名前の付いた基板。**穴数は写真から数えた実物の値だけ**を持つ。
 *
 * 秋月の商品ページは寸法・ピッチ・穴径・取付穴まで書いてあるのに、
 * **穴数だけどこにも無い**。検索に出る「28×18」は寸法をピッチで割った推計で、
 * 実測と合わない (C タイプは 25×15)。
 *
 * **実寸から穴数は割り算で出ない。** 縁の余白が基板ごとにも辺ごとにも違い、
 * 取付穴がそこに入るため。boardwright の Elegoo 5×7cm テンプレートは
 * 50×70mm で 18×24 穴を名乗るが、これは辺ごとに縁が 3.4mm と 5.8mm という
 * ことで、1 つの式からは出ない (向こうの `_note` 自身が derived と書いている)。
 * だから寸法は**引くための鍵**であって、計算の入力ではない。
 *
 * 秋月は同じ基板を複数の綴りで売っていることがあるので、寸法は 1 つの基板につき
 * 複数持てるようにしてある。**ただし綴りが違えば別の基板のこともある** —
 * 「C タイプ」は 72×47mm と 72×47.5mm で穴数が違う (下の頭書き)。
 */

/** 実寸 (mm)。**列 × 行と同じ順** — 基板は長辺 × 短辺で売られている。 */
export type Millimetres = readonly [number, number];

export type CatalogBoard = {
  /** `board:` に書く正式な名前。 */
  readonly key: string;
  /** 図と報告に出す呼び名。 */
  readonly label: string;
  /** 売られている綴り。**先頭が代表**で、報告にはそれを出す。 */
  readonly mm: readonly Millimetres[];
  readonly cols: number;
  readonly rows: number;
  /** 正式な名前の代わりに書ける綴り (店の呼ぶ型番の 1 文字など)。 */
  readonly aliases: readonly string[];
  /**
   * 汎用の標準基板 (縦長で数えた) かどうか。**横に置いた綴り (`7x5cm`) を同じ基板の
   * 向き違いとして読める**のはこの基板だけ。秋月の基板は綴りごとに別の基板のことが
   * あるので、向きを替えて当てはめない。
   */
  readonly turnable: boolean;
  /**
   * この基板のシルクの振り方。**実物の刷りどおり**で、`board:` に `silk:` が無ければこれが使われる。
   * 秋月は短辺が英字・下から。汎用 5x7cm は縦置きなら `fence` と同じ並びで、横置き (`7x5cm`) は
   * 長辺が英字・短辺が数字 (下から)。
   */
  readonly silk: Silk;
  /**
   * 実物が揺れる基板の、穴数の許す範囲 (この向きでの列と行)。無ければ数えた
   * 1 通りだけ。`grid:` がこの内側なら黙って受け、外なら「数えていない」と言う。
   */
  readonly gridRange?: { readonly cols: readonly [number, number]; readonly rows: readonly [number, number] };
};

/**
 * 穴数は**メーカーの外形図から数えた**。図面の丸を 1 つずつ拾って列と行に
 * 束ね、**ピッチが 2.54mm に出ること**で図面と枠の取り方を検算してある。
 * A と C は図面自身が穴数を書いており (`2200-Ø1.00NT` / `375-1.0ø NT`)、
 * 数えた値と一致した。B と D は 2026-09-01 に商品写真から数えた値
 * (数え方は 52 の `docs/07`)。
 *
 * **同じ「C タイプ」でも基板が違えば穴数が違う。** 72×47mm (ガラスコンポジット・
 * 日本製) は 25 × 15 だが、72×47.5mm (片面ガラス・めっき仕上げ) の外形図は
 * 27 × 17 の格子で、四隅が取付穴に取られている。だから**実寸の綴りは、
 * その綴りで売られている基板を数えたときだけ**別名にする。
 */
/**
 * 汎用の標準基板 5 種 (海外の量販品。縁のパッドと四隅の取付穴があり、
 * スルーホールの両面板)。穴数は**作者が数えた**値で、縦長 (列 < 行) で持つ。
 * **名前に `cm` が要る** — 単位の無い `5x7` は 5 列 × 7 行の穴数として読まれる。
 * 12x18cm だけは実物が揺れるので許す範囲を持つ (列 44〜46、行 60〜65)。
 */
const standard = (
  key: string,
  wide: number,
  tall: number,
  cols: number,
  rows: number,
  gridRange?: CatalogBoard['gridRange'],
): CatalogBoard => ({
  key,
  label: `汎用 ${key}`,
  mm: [[wide, tall]],
  cols,
  rows,
  aliases: [],
  turnable: true,
  silk: 'fence',
  ...(gridRange ? { gridRange } : {}),
});

const STANDARD_BOARDS: readonly CatalogBoard[] = [
  standard('5x7cm', 50, 70, 18, 24),
  standard('7x9cm', 70, 90, 26, 31),
  standard('9x15cm', 90, 150, 33, 54),
  standard('10x15cm', 100, 150, 36, 55),
  standard('12x18cm', 120, 180, 44, 60, { cols: [44, 46], rows: [60, 65] }),
];

const BOARDS: readonly CatalogBoard[] = [
  {
    key: 'akizuki-a',
    label: '秋月 A タイプ',
    mm: [[155, 114]],
    cols: 55,
    rows: 40,
    aliases: ['a'],
    turnable: false,
    silk: 'alpha-rows',
  },
  {
    key: 'akizuki-b',
    label: '秋月 B タイプ',
    mm: [[95, 72]],
    cols: 36,
    rows: 27,
    aliases: ['b'],
    turnable: false,
    silk: 'alpha-rows',
  },
  {
    // 72×47.5mm と 72×48mm は**別の基板**で、穴数も違う (頭書き)。
    // 数えていない綴りを別名にすると、違う基板の図が黙って出る。
    key: 'akizuki-c',
    label: '秋月 C タイプ',
    mm: [[72, 47]],
    cols: 25,
    rows: 15,
    aliases: ['c'],
    turnable: false,
    silk: 'alpha-rows',
  },
  {
    key: 'akizuki-d',
    label: '秋月 D タイプ',
    mm: [[47, 36]],
    cols: 17,
    rows: 14,
    aliases: ['d'],
    turnable: false,
    silk: 'alpha-rows',
  },
  ...STANDARD_BOARDS,
];

/** `72x47mm` `7.2x4.7cm`。**単位が要る** — 単位が無い数は穴数。 */
const DIMENSIONS = /^([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(mm|cm)$/;

/** 同じ基板を指す綴りかどうかを見るための丸め (0.1mm)。浮動小数の差で外さないため。 */
const round = (mm: number): number => Math.round(mm * 10) / 10;

/**
 * 実寸として書かれた綴りを mm にする。単位が無ければ `null` — そこが
 * **穴数と実寸の分かれ目**で、`25x15` を 25mm × 15mm と読むと基板が消える。
 */
export function parseMillimetres(text: string): Millimetres | null {
  // 名前も短い名前も大小を問わないので、単位だけ問うのは筋が通らない (`7X5CM`)。
  const found = DIMENSIONS.exec(text.trim().toLowerCase());
  if (!found) return null;

  const scale = found[3] === 'cm' ? 10 : 1;
  const wide = round(Number(found[1]) * scale);
  const tall = round(Number(found[2]) * scale);
  if (wide <= 0 || tall <= 0) return null;
  return [wide, tall];
}

const normalize = (text: string): string => text.trim().toLowerCase();

const sameSize = (a: Millimetres, b: Millimetres): boolean =>
  round(a[0]) === round(b[0]) && round(a[1]) === round(b[1]);

/**
 * 名前・短い名前・実寸のどれで書かれても同じ基板を返す。
 * **持ち物だけを引く** (素の添字だと `constructor` が Object.prototype から拾える)。
 */
export function lookupBoard(text: string): CatalogBoard | null {
  const wanted = normalize(text);
  if (wanted === '') return null;

  const byName = BOARDS.find((b) => b.key === wanted || b.aliases.includes(wanted));
  if (byName) return byName;

  const mm = parseMillimetres(wanted);
  if (!mm) return null;
  const sold = BOARDS.find((b) => b.mm.some((size) => sameSize(size, mm)));
  if (sold) return sold;
  // 標準基板を横に置いた綴り (`7x5cm` = 5x7cm を寝かせた基板)。
  const upright = BOARDS.find((b) => b.turnable && sameSize(b.mm[0]!, [mm[1], mm[0]]));
  return upright ? turned(upright) : null;
}

/** `5x7cm` → `7x5cm`。cm の綴りを前後入れ替える。 */
const turnedKey = (key: string): string => key.replace(/^([0-9.]+)x([0-9.]+)cm$/, '$2x$1cm');

/**
 * 向きを替えた基板。**列と行 (と許す範囲) を入れ替えるだけ**で、穴の数え直しは
 * しない。実寸の綴りも入れ替える (報告の呼び名が寝かせた向きで出る)。
 */
function turned(board: CatalogBoard): CatalogBoard {
  const [wide, tall] = board.mm[0]!;
  const { gridRange } = board;
  return {
    ...board,
    key: turnedKey(board.key),
    label: `汎用 ${turnedKey(board.key)}`,
    mm: [[tall, wide]],
    cols: board.rows,
    rows: board.cols,
    // 寝かせると長辺が横に来て、そちらに英字が刷られている (手持ちのアリエクスプレスの基板)。
    silk: 'alpha-cols',
    ...(gridRange ? { gridRange: { cols: gridRange.rows, rows: gridRange.cols } } : {}),
  };
}

/** `board:` に書ける名前。報告で「持っているのはこれ」と並べるのに使う。 */
export const boardNames = (): readonly string[] => BOARDS.map((b) => b.key);

export const catalogBoards = (): readonly CatalogBoard[] => BOARDS;

/** 近いと言ってよい差。70×50mm と 72×47mm はこの内側、50×70mm は外側。 */
const NEAR = 0.12;

/**
 * 書かれた実寸に近い基板。**当てはめるためではなく、教えるため**にある。
 * 丸めて勝手に当てると違う基板の穴数で図が出るので、返すのは報告の文面用。
 * 寝かせた基板 (50×70mm) は近いと言わない — 書かれたとおりに読む。
 * 標準基板 (`5x7cm` など) は名前と実寸で引けるので、ここでは挙げない。
 */
export function nearestBoard(mm: Millimetres): CatalogBoard | null {
  let best: CatalogBoard | null = null;
  let bestGap = NEAR;
  for (const board of BOARDS) {
    // 標準基板は向きも寸法も言い切っているので、近いとは言わない (秋月の基板だけ)。
    if (board.turnable) continue;
    for (const sold of board.mm) {
      const gap = Math.max(Math.abs(mm[0] - sold[0]) / sold[0], Math.abs(mm[1] - sold[1]) / sold[1]);
      if (gap < bestGap) {
        best = board;
        bestGap = gap;
      }
    }
  }
  return best;
}

/** 図と報告に出す呼び名。`秋月 C タイプ (72×47mm、25 列 15 行)`。 */
export const describeBoard = (board: CatalogBoard): string => {
  const [wide, tall] = board.mm[0]!;
  return `${board.label} (${wide}×${tall}mm、${board.cols} 列 ${board.rows} 行)`;
};
