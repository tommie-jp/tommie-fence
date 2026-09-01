/**
 * 名前の付いた板。**穴数は写真から数えた実物の値だけ**を持つ。
 *
 * 秋月の商品ページは寸法・ピッチ・穴径・取付穴まで書いてあるのに、
 * **穴数だけどこにも無い**。検索に出る「28×18」は寸法をピッチで割った推計で、
 * 実測と合わない (C タイプは 25×15)。
 *
 * **実寸から穴数は割り算で出ない。** 縁の余白が板ごとにも辺ごとにも違い、
 * 取付穴がそこに入るため。boardwright の Elegoo 5×7cm テンプレートは
 * 50×70mm で 18×24 穴を名乗るが、これは辺ごとに縁が 3.4mm と 5.8mm という
 * ことで、1 つの式からは出ない (向こうの `_note` 自身が derived と書いている)。
 * だから寸法は**引くための鍵**であって、計算の入力ではない。
 *
 * 秋月は同じ板を複数の綴りで売っている (C タイプは 72×47mm・72×47.5mm・
 * 72×48mm の 3 通り) ので、寸法は 1 つの板につき複数持てるようにする。
 */

/** 実寸 (mm)。**列 × 行と同じ順** — 板は長辺 × 短辺で売られている。 */
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
};

/**
 * 穴数は 2026-09-01 に秋月の商品写真から数えた。
 * 数え方は 52 の `docs/07`。C タイプはシルクの列番号 (1・5・10・15・20・25) と
 * 行の文字 (A・E・J・O) が最後の列・行でちょうど終わることまで確かめてある。
 * **A タイプ (155×114mm) は入れていない** — 商品写真が 640×480 しかなく、
 * 55 列を数え違いなく取れなかった。迷ったら黙る。
 */
const BOARDS: readonly CatalogBoard[] = [
  {
    key: 'akizuki-b',
    label: '秋月 B タイプ',
    mm: [[95, 72]],
    cols: 36,
    rows: 27,
    aliases: ['b'],
  },
  {
    key: 'akizuki-c',
    label: '秋月 C タイプ',
    mm: [[72, 47], [72, 47.5], [72, 48]],
    cols: 25,
    rows: 15,
    aliases: ['c'],
  },
  {
    key: 'akizuki-d',
    label: '秋月 D タイプ',
    mm: [[47, 36]],
    cols: 17,
    rows: 14,
    aliases: ['d'],
  },
];

/** `72x47mm` `7.2x4.7cm`。**単位が要る** — 単位が無い数は穴数。 */
const DIMENSIONS = /^([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(mm|cm)$/;

/** 同じ板を指す綴りかどうかを見るための丸め (0.1mm)。浮動小数の差で外さないため。 */
const round = (mm: number): number => Math.round(mm * 10) / 10;

/**
 * 実寸として書かれた綴りを mm にする。単位が無ければ `null` — そこが
 * **穴数と実寸の分かれ目**で、`25x15` を 25mm × 15mm と読むと板が消える。
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
 * 名前・短い名前・実寸のどれで書かれても同じ板を返す。
 * **持ち物だけを引く** (素の添字だと `constructor` が Object.prototype から拾える)。
 */
export function lookupBoard(text: string): CatalogBoard | null {
  const wanted = normalize(text);
  if (wanted === '') return null;

  const byName = BOARDS.find((b) => b.key === wanted || b.aliases.includes(wanted));
  if (byName) return byName;

  const mm = parseMillimetres(wanted);
  if (!mm) return null;
  return BOARDS.find((b) => b.mm.some((sold) => sameSize(sold, mm))) ?? null;
}

/** `board:` に書ける名前。報告で「持っているのはこれ」と並べるのに使う。 */
export const boardNames = (): readonly string[] => BOARDS.map((b) => b.key);

export const catalogBoards = (): readonly CatalogBoard[] => BOARDS;

/** 近いと言ってよい差。7×5cm と 72×47mm はこの内側、5×7cm は外側。 */
const NEAR = 0.12;

/**
 * 書かれた実寸に近い板。**当てはめるためではなく、教えるため**にある。
 * 丸めて勝手に当てると違う板の穴数で図が出るので、返すのは報告の文面用。
 * 寝かせた板 (50×70mm) は近いと言わない — 書かれたとおりに読む。
 */
export function nearestBoard(mm: Millimetres): CatalogBoard | null {
  let best: CatalogBoard | null = null;
  let bestGap = NEAR;
  for (const board of BOARDS) {
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
