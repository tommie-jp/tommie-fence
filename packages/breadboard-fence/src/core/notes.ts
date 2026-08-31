/**
 * 注釈 (`notes:`) の語彙。**回路図フェンス (circuit-fence) と同じ語**を使う。
 * 同じノートで両方を書くときに、印の付け方まで覚え直さずに済むようにするため。
 *
 * 注釈は**回路の一員ではない**。ネットにもネットリストにも部品リストにも数えない。
 * 図の上に重ねる印と字であって、板に挿すものではない。
 */

export const NOTE_KINDS = ['circle', 'box', 'arrow', 'line', 'text', 'source'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_COLORS = ['red', 'blue', 'green', 'orange', 'ink'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_SIZES = ['tiny', 'small', 'normal', 'large', 'huge'] as const;
export type NoteSize = (typeof NOTE_SIZES)[number];

export const NOTE_ALIGNS = ['left', 'center', 'right'] as const;
export type NoteAlign = (typeof NOTE_ALIGNS)[number];

/**
 * 字を図の外に置く場所。**番地を書かなかったときの既定**でもある。
 *
 * 板の番地はどれも実在の穴に縛られているので、**板の外を指す番地が存在しない**。
 * 図の説明や書き写し用の写しを板の上に重ねると、穴と印字に重なって読みにくい。
 * 場所の語を 1 つ置いて、板の下の帯に流せるようにする。
 */
export const NOTE_PLACES = ['below'] as const;
export type NotePlace = (typeof NOTE_PLACES)[number];

/** 場所を書かなかったときはここ。板の下、部品リストの後ろ。 */
export const DEFAULT_PLACE: NotePlace = 'below';

/** 字を図の外に置ける種類。印や枠は指し先があってこそなので、板の上にしか置けない。 */
export const PLACEABLE_KINDS: ReadonlySet<NoteKind> = new Set<NoteKind>(['text', 'source']);

/** 行送り。`source` にだけ書ける (1 行の `text` では意味を持たないため)。 */
export const NOTE_LEADINGS = ['tight', 'loose'] as const;
export type NoteLeading = (typeof NOTE_LEADINGS)[number];

/**
 * 印の色。**配線色 (`render/palette.ts`) とは別の表**にしてある。
 * 配線の色は「何色の線を挿すか」という実物の情報だが、注釈の色は読み手への合図で、
 * 板の上には存在しない。同じ `red` でも意味が違うので混ぜない。
 */
const COLOR_VALUES: Record<Exclude<NoteColor, 'ink'>, string> = {
  red: '#e5534b',
  blue: '#4c8eda',
  green: '#2ea043',
  orange: '#d29922',
};

/** 印・枠・指し棒・直線の既定の色。字だけは図の文字色に従う。 */
export const DEFAULT_MARK_COLOR: NoteColor = 'red';

/**
 * 語 → 実際の色。`ink` は図の文字色 (テーマが決める) なので、ここでは解決できない。
 * 呼ぶ側がテーマの色を渡す。
 */
export const noteColorValue = (color: NoteColor, ink: string): string =>
  color === 'ink' ? ink : COLOR_VALUES[color];

/**
 * 字の大きさ。**図の文字サイズに対する倍率**で持つ。
 * circuit-fence は pt の絶対値で持っているが、こちらは `style: text-size` と
 * テーマで基準の大きさが動くので、そこに追従しないと図と注釈の釣り合いが崩れる。
 */
const SIZE_SCALES: Record<NoteSize, number> = {
  tiny: 0.7,
  small: 0.85,
  normal: 1,
  large: 1.4,
  huge: 2,
};

export const noteSizeScale = (size: NoteSize): number => SIZE_SCALES[size];

/** 行送り (字の大きさに対する倍率)。 */
const LEADINGS: Record<NoteLeading, number> = { tight: 1, loose: 1.4 };
export const SOURCE_LEADING = 1.15;
export const TEXT_LEADING = 1.4;

export const noteLeading = (leading: NoteLeading | null, kind: NoteKind): number => {
  if (leading !== null) return LEADINGS[leading];
  return kind === 'source' ? SOURCE_LEADING : TEXT_LEADING;
};

/** 指し先を 1 つだけ書く種類か。書く数が合っているかの検証に使う。 */
export const noteTargetCount = (kind: NoteKind): number =>
  kind === 'box' || kind === 'arrow' || kind === 'line' ? 2 : 1;
