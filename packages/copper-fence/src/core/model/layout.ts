import { SMD_PX_PER_MM } from 'fence-kit';
import type { Board, Mm, Point, Rect } from '../types.ts';

/**
 * mm を画布の px に落とす。**縮尺は perfboard と同じ** (2.54mm = 20px)。
 * 並べたとき大きさが揃い、fence-kit の面実装の絵 (mm の表を同じ比で描く) が
 * そのまま使える (52 の docs/73 決め 4)。
 */
export const PX = SMD_PX_PER_MM;

/** 画布の縁の余白。 */
const OUTER = 14;
/** 目盛の帯 (板の上と左)。 */
export const RULER = 16;
/** 題の帯。題が無ければ空けない。 */
const TITLE_BAND = 26;
/** 板の説明の 1 行。 */
const DESCRIPTION_BAND = 20;
/** 帯と帯の間。 */
const BAND_GAP = 12;

export type Band = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 図に出る物の広がり (mm)。板の外へ張り出す SMA や注釈を含む。 */
export type Bounds = { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };

export type LayoutOptions = {
  readonly title?: boolean;
  /** 板の外まで含めた広がり (mm)。書かなければ板そのもの。 */
  readonly bounds?: Bounds;
  readonly list?: { readonly width: number; readonly height: number } | null;
  readonly source?: { readonly width: number; readonly height: number } | null;
  /** 板の説明の 1 行の幅 (px)。**板より長いことがある**ので、画布の幅に入れる。 */
  readonly descriptionWidth?: number;
};

export type Layout = {
  readonly width: number;
  readonly height: number;
  /** 板の矩形 (px)。 */
  readonly board: Rect;
  readonly titleBaseline: number;
  /** 板の説明の 1 行のベースライン。 */
  readonly descriptionBaseline: number;
  readonly listBand: Band | null;
  readonly sourceBand: Band | null;
  toPx(point: Mm): Point;
  /** mm の長さを px に。 */
  len(mm: number): number;
};

export function createLayout(board: Board, options: LayoutOptions = {}): Layout {
  const bounds = options.bounds ?? { minX: 0, minY: 0, maxX: board.width, maxY: board.height };
  // 目盛の帯は板の上と左に必ず空ける (板の外へ張り出す物がそこへ来ても、帯はその内側)。
  const minX = Math.min(bounds.minX, -RULER / PX);
  const minY = Math.min(bounds.minY, -RULER / PX);
  const maxX = Math.max(bounds.maxX, board.width);
  const maxY = Math.max(bounds.maxY, board.height);

  const titleBand = options.title === true ? TITLE_BAND : 0;
  const ox = OUTER - minX * PX;
  const oy = OUTER + titleBand - minY * PX;
  const drawnRight = OUTER + (maxX - minX) * PX;
  const drawnBottom = oy + maxY * PX;

  let y = drawnBottom + DESCRIPTION_BAND;
  const descriptionBaseline = y - 6;
  const bandAt = (size: { width: number; height: number } | null | undefined): Band | null => {
    if (size === null || size === undefined || size.height === 0) return null;
    const band = { x: OUTER, y: y + BAND_GAP, width: size.width, height: size.height };
    y = band.y + band.height;
    return band;
  };
  const listBand = bandAt(options.list);
  const sourceBand = bandAt(options.source);

  const widest = Math.max(drawnRight, ox + (options.descriptionWidth ?? 0), ...[listBand, sourceBand].map((band) => (band === null ? 0 : band.x + band.width)));
  return {
    width: Math.ceil(widest + OUTER),
    height: Math.ceil(y + OUTER),
    board: { x: ox, y: oy, width: board.width * PX, height: board.height * PX },
    titleBaseline: OUTER + 18,
    descriptionBaseline,
    listBand,
    sourceBand,
    toPx: (point) => ({ x: ox + point.x * PX, y: oy + point.y * PX }),
    len: (mm) => mm * PX,
  };
}
