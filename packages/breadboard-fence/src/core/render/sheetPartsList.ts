import type { Lang } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { Board, PartsListMode, PlacedPart } from '../types.ts';

/** 表の見出しの材料。`name` が null の枚は番号だけ。 */
export type SheetCaption = { readonly name: string | null; readonly number: number };

/** 枚の題と同じ書き方 (`入出力 (1枚め)`・`2枚め`、英語は `(sheet 1)`)。 */
export function sheetCaptionText({ name, number }: SheetCaption, lang: Lang): string {
  const bare = lang === 'en' ? `sheet ${number}` : `${number}枚め`;
  return name === null ? bare : `${name} (${bare})`;
}

/** 1 枚ぶんの部品表の材料。絵はその枚の Layout で描く (枚ごとに基板の大きさが違ってよい)。 */
export type SheetListing = {
  readonly caption: SheetCaption;
  readonly parts: readonly PlacedPart[];
  readonly board: Board;
  readonly layout: Layout;
  readonly mode: PartsListMode;
};

/**
 * `sheets:` の図の部品表。**図の間に挟まず、最後の枚の下に枚ごとに分けて並べる**
 * (実機で「図が複数枚のとき、部品表は末尾に複数枚分、分けて表示する」と頼まれた)。
 */
export type SheetPartsList = {
  /** true の枚は表を出さない (最後の枚以外)。 */
  readonly hold: boolean;
  /** 前の枚の表。`parts-list: none` の枚は入らない。 */
  readonly earlier: readonly SheetListing[];
  /** この枚の表の見出し。 */
  readonly caption: SheetCaption;
};
