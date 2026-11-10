import { PARTS_SYMBOL_HEADING_BY_LANG, bandColor, partKind, partsMark, valueWithRole, withRatings } from 'fence-kit';
import type { Lang, PartsMark } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { formatAddress } from '../model/address.ts';
import { partsLabels } from './labels.ts';
import { partsIcon, partsIconsWithin, scaledToColumn } from './partsListIcons.ts';
import type { PartsIcon } from './partsListIcons.ts';
import { LIMITS } from '../limits.ts';
import { fit, textWidth } from './textFit.ts';
import type { Board, BoardSize, PartsListMode, PlacedPart } from '../types.ts';
import { BOARD_HALO_OPACITY, TEXT_HALO_WIDTH, element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { isLight, textScale } from './theme.ts';

/** 部品リストと、その下に続く帯との間に空ける高さ。 */
const GAP = 12;
/** 行の高さと基板の内側の余白。字の大きさに対する比で持つ (テーマごとに字が違うため)。 */
const LINE_RATIO = 1.5;
const PAD_RATIO = 0.9;
/** 字の上端からベースラインまで。基板の中で行を上下に振り分けるのに使う。 */
const CAP_RATIO = 0.8;
/** 列と列の間。字の大きさの何倍か。 */
const COLUMN_GAP = 1.5;

/** 基板にこれだけの幅も残っていない列は、出さずに諦める (字の大きさに対する比)。 */
const MIN_COLUMN_WIDTH = 4;

/**
 * 種類の列に許す幅。実在の種類は `capacitor/electrolytic` が最長 (12.1) なので普段は効かない。
 * `dip0008` のようにゼロを詰めた種類が通ってしまう (`placement/footprints.ts` の
 * DIP_PATTERN) ため、長すぎる種類が値の列を押し出さないようにする。
 */
const MAX_TYPE_WIDTH = 13;

/**
 * 絵の欄 (`parts-list: symbols`) の行の送り (字の大きさに対する比)。**行と行の間を字の高さの
 * 1/2** にする (実機で「行間は 1/2 に」と頼まれた)。
 */
const SYMBOL_LINE_RATIO = 1.5;

/**
 * 絵の高さ (行の数)。**2 行ぶん**で描き、**1 行ごとに左右の 2 列を交互に使う** (インターリーブ)。
 * 上下に並ぶ行の絵は別の列にあるので、2 行ぶんの高さでもぶつからない。同じ列の絵は 2 行おき
 * (実機で「次の行は水平にずらし、2 行の高さで」と頼まれた。1 行の高さでは刷り込みが読めなかった)。
 */
const ICON_ROWS = 2;

/**
 * 絵を入れるために値の欄を切るときの下限 (字の大きさに対する比)。`Analog Discovery 3` が切れずに読める幅。
 * これより狭くしないと絵が入らない図は、値を読めるほうを取って絵の欄を空ける。
 */
const MIN_VALUE_WIDTH = 10;

/** 値の欄の幅の候補。今の幅から下限まで 1 字ぶんずつ。 */
const valueCandidates = (full: number): readonly number[] => [
  full,
  ...Array.from({ length: Math.max(0, Math.floor(full - MIN_VALUE_WIDTH)) }, (_, index) => full - index - 1),
];

/** 同じ列の上下の絵との間に残す隙間 (px)。 */
const ICON_CLEARANCE = 1;

/** 左右の 2 列の間 (字の大きさに対する比)。 */
const ICON_COLUMN_GAP = 0.5;

/**
 * 奇数行に敷く帯 (絵の欄のとき)。**見出しの下の行を 1 行目と数え、奇数行を少し薄くする** —
 * 絵が 2 行にまたがるので、どの行の絵かを帯で追えるようにする (実機で頼まれた)。
 * 白を透かして重ねるので、明るいテーマでも暗いテーマでも同じ書き方で薄く見える。
 */
const STRIPE = { fill: '#ffffff', opacity: 0.45 } as const;

/** 帯の色の四角。1 本ぶんの幅と間 (字の大きさに対する比)。高さは字の高さに合わせる (perfboard と同じ)。 */
const SWATCH = { width: 0.9, gap: 0.25, height: 0.8 } as const;

/**
 * 表の 1 行。最後の欄は抵抗なら帯の色の並び (四角で描く)、コンデンサなら胴の記号 (`104`)。
 * 欄の中身は perfboard の部品表と同じもの (fence-kit)。
 */
type Row = {
  readonly id: string;
  readonly type: string;
  readonly value: string;
  readonly mark: PartsMark;
  /** 図の中の位置 (`b10,b15`。`parts-list: symbols` のときだけ)。番地の無い行は持たない。 */
  readonly position?: string;
  /** 最後の欄に置く部品の絵 (`parts-list: symbols` のときだけ)。描けない種類は null。 */
  readonly icon?: PartsIcon | null;
};

/** 見出しの行。番号と型番だけが並ぶと、どの欄が値なのかが読めない。 */
const headingRow = (lang: Lang): Row => {
  const [id, type, value, mark] = partsLabels(lang).headings;
  return { id, type, value, mark };
};

/**
 * 値は**図に出ているのと同じ文字列**だけを選ぶ。整えたり (`10k` → `10kΩ`) はしない。
 * 図の字と食い違うと突き合わせに使えなくなる。
 *
 * 機器はラベルしか見ない (`render/devices.ts` の captionOf が `label ?? id` で、
 * 値は図に出ない)。ラベルが無ければ箱には ID が出ており、それは ID の列にもう
 * 並んでいるので、値の列は空にする。
 */
const valueOf = (part: PlacedPart): string =>
  (part.kind === 'device' ? part.label : part.value ?? part.label) ?? '';

/**
 * 種類の列には姿も添える (`capacitor/ceramic`)。同じ `0.1u` でもセラミックか
 * フィルムかは買うときに効く違いで、図だけを渡された人はここでしか読めない。
 */
const typeOf = (part: PlacedPart, lang: Lang): string =>
  part.kind === 'device' ? part.type : partKind(part.type, part.variant, valueOf(part), lang);

/** 実物の穴数。`board:` のサイズ名では買えないので、売り場の呼び名に添える。 */
const HOLES: Readonly<Record<BoardSize, number>> = { mini: 170, half: 400, full: 830 };

/**
 * 基板の行。**サイズと穴数**を書き、電源レールは既定 (mini は無し、half / full は有り)
 * と違うときだけ添える。印字 (`letters` `numbers`) は買う基板を決めないので載せない。
 */
export function boardRow(board: Board, lang: Lang = 'ja'): Row {
  const labels = partsLabels(lang);
  const hasRails = board.rails !== null;
  const rails = hasRails === (board.size !== 'mini') ? '' : hasRails ? labels.railsOn : labels.railsOff;
  return { id: labels.board, type: 'breadboard', value: `${labels.boardSize(board.size, HOLES[board.size])}${rails}`, mark: '' };
}

/**
 * IC には働きを添える (`CD4081 (2 入力 AND ×4)`)。型番だけだと、どの IC が何をするのか
 * 表から読めない。機器の名札には添えない。
 */

/** これを超えるピンの部品は全部を並べず、1 番ピンの穴だけを出す。 */
const LISTED_PINS = 3;

/** 図の中の位置。穴番地を書いたままの綴りで並べる (`b10,b15`)。機器は基板の外なので空。 */
function positionOf(part: PlacedPart): string {
  const addresses = part.pins.flatMap((pin) => (pin.address ? [formatAddress(pin.address)] : []));
  return (addresses.length > LISTED_PINS ? addresses.slice(0, 1) : addresses).join(',');
}

const rowsOf = (parts: readonly PlacedPart[], lang: Lang): readonly Row[] =>
  parts.map((part) => part.kind === 'device'
    ? { id: part.id, type: typeOf(part, lang), value: valueOf(part), mark: '' }
    : { id: part.id, type: typeOf(part, lang), value: withRatings(valueWithRole(valueOf(part), lang), part.ratings), mark: partsMark(part.type, part.variant, part.value) });

const markWidth = (mark: PartsMark): number =>
  typeof mark === 'string'
    ? textWidth(mark)
    : mark.length === 0 ? 0 : mark.length * SWATCH.width + (mark.length - 1) * SWATCH.gap;

/** 帯の色の四角を並べる。白と黒も地と見分けられるよう、細い縁を付ける。 */
function swatches(x: number, baseline: number, colors: readonly string[], size: number, edge: string): string {
  const height = SWATCH.height * size;
  return colors
    .map((name, index) => element('rect', {
      x: num(x + index * (SWATCH.width + SWATCH.gap) * size), y: num(baseline - height),
      width: num(SWATCH.width * size), height: num(height),
      fill: bandColor(name), stroke: edge, 'stroke-width': 0.5,
    }))
    .join('');
}

const widest = (values: readonly string[]): number => Math.max(0, ...values.map(textWidth));

/**
 * 行の送り。絵の欄では、**いちばん背の高い絵が 2 行ぶん (上下の隙間つき) に収まる**まで広げる —
 * 絵は基板と同じ大きさで描くので縮めない (トランジスタはピンの名前まで入れると 2 行を超える)。
 */
const lineHeight = (theme: RenderTheme, mode: PartsListMode = 'below', icons: readonly (PartsIcon | null)[] = [], atLeast = 0): number => {
  if (mode !== 'symbols') return theme.metrics.textSize * LINE_RATIO;
  const tallest = Math.max(0, ...icons.map((icon) => icon?.height ?? 0));
  return Math.max(atLeast, theme.metrics.textSize * SYMBOL_LINE_RATIO, (tallest + ICON_CLEARANCE * 2) / ICON_ROWS);
};

/** 並べる行数。上限を超えたぶんは「ほかに N 件」の 1 行にまとめる。 */
const rowCount = (parts: number): number => (parts > LIMITS.listedParts ? LIMITS.listedParts + 1 : parts);

const plateHeight = (rows: number, theme: RenderTheme, mode: PartsListMode = 'below', icons: readonly (PartsIcon | null)[] = [], atLeast = 0): number => {
  const { textSize } = theme.metrics;
  const height = textSize * PAD_RATIO * 2 + textSize + lineHeight(theme, mode, icons, atLeast) * (rows - 1);
  if (mode !== 'symbols') return height;
  // 最後の行の絵は、字の行の真ん中から下へ絵の半分だけ伸びる。表の下の余白で足りなければ広げる。
  const below = textSize * PAD_RATIO + textSize * (1 - CAP_RATIO);
  const last = icons[icons.length - 1]?.height ?? 0;
  const reach = last / 2 - (textSize * CAP_RATIO) / 2;
  return height + Math.max(0, reach - below + ICON_CLEARANCE);
};

/** 表に並べる部品 (名前の順・上限まで)。高さを測る所と描く所で同じ並びを使う。 */
const shownOf = (parts: readonly PlacedPart[]): readonly PlacedPart[] =>
  [...parts].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).slice(0, LIMITS.listedParts);

const iconsOf = (parts: readonly PlacedPart[], layout: Layout | null, theme: RenderTheme, mode: PartsListMode): readonly (PartsIcon | null)[] =>
  mode !== 'symbols' || layout === null ? [] : parts.map((part) => partsIcon(part, layout, theme));

/** 部品リストが図の下に足す高さ (基板 + 下の余白)。並べるものが無ければ 0。 */
export function partsListHeight(
  parts: readonly PlacedPart[],
  theme: RenderTheme,
  board: Board | null = null,
  mode: PartsListMode = 'below',
  layout: Layout | null = null,
  atLeast = 0,
): number {
  if (parts.length === 0) return 0;
  const icons = iconsOf(shownOf(parts), layout, theme, mode);
  // 見出しの 1 行と、基板の 1 行を足す。「ほかに N 件」の行には絵が無い。
  const lastIcons = parts.length > LIMITS.listedParts ? [...icons, null] : icons;
  return plateHeight(rowCount(parts.length) + 1 + (board === null ? 0 : 1), theme, mode, lastIcons, atLeast) + GAP;
}

/** 表の行の送り。`sheets:` の図は全部の表をいちばん広い送りにそろえる。 */
export function partsListLine(parts: readonly PlacedPart[], theme: RenderTheme, mode: PartsListMode, layout: Layout): number {
  return lineHeight(theme, mode, iconsOf(shownOf(parts), layout, theme, mode));
}

/**
 * 絵を `<g class="bf-parts-icon">` で置く。**図の SVG の中に `<svg>` を増やさない** — 図を読む道具
 * (SVG の数・部品の矩形を数える試験) が表の絵を図の部品と取り違えないように、専用の class を付ける。
 */
const iconGroup = (icon: PartsIcon, left: number, top: number): string =>
  element('g', { class: 'bf-parts-icon', transform: `translate(${num(left)} ${num(top)})` }, icon.svg);

/**
 * 図の下に貼る部品リスト。ID・種類・値を書いた順に 1 行ずつ並べる。
 * 同じ値でまとめたりはしない。図の中の `R1` と 1 対 1 で突き合わせるための表なので、
 * 行と部品がずれると用を成さない。
 */
export function renderPartsList(
  parts: readonly PlacedPart[],
  x: number,
  y: number,
  width: number,
  theme: RenderTheme,
  board: Board | null = null,
  lang: Lang = 'ja',
  mode: PartsListMode = 'below',
  layout: Layout | null = null,
  atLeast = 0,
): string {
  if (parts.length === 0) return '';
  const symbols = mode === 'symbols' && layout !== null;

  // 表から部品を探すので名前の順に並べる (数字は数として: R2 の次は R10)。上限で切る前に並べる。
  const shown = shownOf(parts);
  const icons = iconsOf(shown, layout, theme, mode);
  const listed = rowsOf(shown, lang).map((row, index) => (symbols ? { ...row, position: positionOf(shown[index]!) } : row));
  const hidden = parts.length - listed.length;
  // 先頭は見出し。基板は最初に用意する物なので、名前の順には入れず見出しのすぐ下に置く。上限の数にも数えない。
  const heading = headingRow(lang);
  const textRows: readonly Row[] = [
    symbols ? { ...heading, mark: PARTS_SYMBOL_HEADING_BY_LANG[lang], position: partsLabels(lang).position } : heading,
    ...(board === null ? [] : [boardRow(board, lang)]),
    ...listed,
  ];
  const { palette } = theme;
  const { textSize } = theme.metrics;
  const pad = textSize * PAD_RATIO;
  const line = lineHeight(theme, mode, icons, atLeast);

  // 基板は基板と同じ色で塗る。`board-color` を変えたときに印字の色が追従する仕掛け
  // (theme.ts の inkFor) にそのまま相乗りできるため。字の縁取りは cell が敷く。
  const plate = element('rect', {
    x: num(x), y: num(y), width: num(width), height: num(plateHeight(textRows.length + (hidden === 0 ? 0 : 1), theme, mode, hidden === 0 ? icons : [...icons, null], atLeast)), rx: 6,
    fill: palette.plate, stroke: palette.plateEdge,
  });

  // 列の幅は左から順に、基板に残っている幅で頭打ちにして決める。こうしておくと
  // どれか 1 つが長すぎても、右の列が基板の外に押し出されることはない。
  const inked = x + width - pad;
  const room = (columnX: number): number => Math.max(0, (inked - columnX) / textSize);

  const idX = x + pad;
  // ID は図の部品と突き合わせるための鍵なので切らない。フェンスから来る ID は
  // 英数字 32 文字までで、いちばん狭い基板でも収まる (room はコアの API を直に
  // 呼ばれたときの保険で、フェンス経由では効かない)。
  const idWidth = Math.min(widest(textRows.map((row) => row.id)), room(idX));

  const typeX = idX + (idWidth + COLUMN_GAP) * textSize;
  const typeRoom = room(typeX);
  const typeWidth = Math.min(widest(textRows.map((row) => row.type)), MAX_TYPE_WIDTH, typeRoom);

  const valueX = typeX + (typeWidth + COLUMN_GAP) * textSize;
  const valueRoom = room(valueX);
  // **絵の欄では、位置を持つ行 (部品) の値だけで幅を決める。** 機器のラベルや基板の行は長くても
  // 右の欄が空なので、はみ出して書ける。
  const fullValueWidth = Math.min(widest(textRows.filter((row) => !symbols || row.position).map((row) => row.value)), valueRoom);
  const positionWidth = symbols ? widest(textRows.map((row) => row.position ?? '')) : 0;

  // 絵は行の偶奇で左右の列に分かれる。列の幅はそれぞれの列にある絵だけで測る。
  const listedFrom = textRows.length - listed.length;
  const iconColumns = (candidates: readonly (PartsIcon | null)[]): readonly [number, number] => {
    const widthOn = (parity: number): number => Math.max(0, ...candidates
      .filter((_, offset) => (offset + listedFrom) % 2 === parity)
      .map((icon) => icon?.width ?? 0));
    return [widthOn(0), widthOn(1)];
  };
  const markRoomFor = (value: number, withPosition: boolean): number =>
    room(valueX + (value + COLUMN_GAP + (withPosition ? positionWidth + COLUMN_GAP : 0)) * textSize);
  const iconsFitIn = (candidates: readonly (PartsIcon | null)[], markSpace: number): boolean => {
    const [left, right] = iconColumns(candidates);
    return (left + right) / textSize + ICON_COLUMN_GAP <= markSpace;
  };
  const iconsAt = (value: number, withPosition: boolean): readonly (PartsIcon | null)[] =>
    partsIconsWithin(shown, layout as Layout, theme, (candidates) => iconsFitIn(candidates, markRoomFor(value, withPosition)));
  // リードを詰めても入らない図だけ、値の欄の長い説明を 1 字ぶんずつ切っていく。
  // それでも入らなければ位置の欄を諦め、次にはみ出す絵だけを縮める。縮めても入らない図は値を切らず、絵の欄を空ける。
  type IconPlan = { readonly value: number; readonly showPosition: boolean; readonly icons: readonly (PartsIcon | null)[] };
  const iconPlan = (): IconPlan => {
    if (!symbols) return { value: fullValueWidth, showPosition: false, icons: [] };
    const candidates = valueCandidates(fullValueWidth);
    const plainAt = (withPosition: boolean): number | undefined =>
      candidates.find((value) => iconsFitIn(iconsAt(value, withPosition), markRoomFor(value, withPosition)));
    const withPosition = plainAt(true);
    if (withPosition !== undefined) return { value: withPosition, showPosition: true, icons: iconsAt(withPosition, true) };
    const without = plainAt(false);
    if (without !== undefined) return { value: without, showPosition: false, icons: iconsAt(without, false) };
    const narrowest = candidates[candidates.length - 1] ?? fullValueWidth;
    const column = ((markRoomFor(narrowest, false) - ICON_COLUMN_GAP) * textSize) / 2;
    const scaled = scaledToColumn(iconsAt(narrowest, false), column);
    return iconsFitIn(scaled, markRoomFor(narrowest, false))
      ? { value: narrowest, showPosition: false, icons: scaled }
      : { value: fullValueWidth, showPosition: false, icons: iconsAt(fullValueWidth, false) };
  };
  const { value: valueWidth, showPosition, icons: fitted } = iconPlan();

  const positionX = valueX + (valueWidth + COLUMN_GAP) * textSize;
  const markX = showPosition ? positionX + (positionWidth + COLUMN_GAP) * textSize : positionX;
  const markRoom = room(markX);
  const rows: readonly Row[] = textRows.map((row, index) =>
    symbols && index >= listedFrom ? { ...row, icon: fitted[index - listedFrom] ?? null } : row);

  const baselineOf = (index: number): number => y + pad + textSize * CAP_RATIO + line * index;
  /**
   * 絵は基板と同じ大きさのまま、その行の字の高さの真ん中に合わせて置く。
   * 行の番号の偶奇で左右の列を替える (インターリーブ)。右の列は、左の列でいちばん幅のある絵の右から。
   */
  // 右の列は普段は「いちばん幅のある絵」の右に置く。それでは入らない図だけ、左の列の幅まで寄せる。
  const widestIcon = Math.max(...iconColumns(fitted));
  const leftColumn = (widestIcon * 2) / textSize + ICON_COLUMN_GAP <= markRoom ? widestIcon : iconColumns(fitted)[0];
  const secondX = markX + leftColumn + ICON_COLUMN_GAP * textSize;
  const iconsFit = iconsFitIn(fitted, markRoom);
  const iconLeft = (index: number): number => (index % 2 === 0 ? markX : secondX);
  /**
   * 値の字を書ける幅。部品の行は値の欄の幅まで。右の欄が空の行は基板の端まで書けるが、
   * 上下の行の背の高い絵がこの行の字の高さまで来ていれば、その絵の手前まで。
   */
  const valueLimit = (index: number): number => {
    if (!symbols || rows[index]?.position) return Math.min(valueRoom, symbols ? valueWidth : valueRoom);
    const reaching = [index - 1, index + 1].flatMap((near) => {
      const icon = rows[near]?.icon;
      return icon && iconsFit && icon.height / 2 > line - textSize / 2 ? [iconLeft(near)] : [];
    });
    return Math.min(valueRoom, ...reaching.map((left) => (left - valueX) / textSize - ICON_COLUMN_GAP));
  };
  const placeIcon = (icon: PartsIcon, index: number): string => {
    const top = baselineOf(index) - (textSize * CAP_RATIO) / 2 - icon.height / 2;
    return iconGroup(icon, iconLeft(index), top);
  };
  // 縁取りは図のキャプションと同じものを敷く。`style` の `text-color` は基板ではなく
  // この縁取りとの対比で読ませる指定なので、外すとリストだけが地に沈む。
  // リストは基板の上の字ではなく読む表なので、透かさず地に対して一番濃い色 (黒か白) で書く。
  const ink = isLight(palette.plate) ? '#000000' : '#ffffff';
  const cell = (cellX: number, baseline: number, text: string, fill: string): string =>
    svgText(cellX, baseline, text, {
      'font-size': num(textSize),
      fill,
      anchor: 'start',
      halo: palette.textHalo,
      haloWidth: TEXT_HALO_WIDTH * textScale(theme),
      haloOpacity: BOARD_HALO_OPACITY, inkOpacity: 1,
    });

  const cells = rows.flatMap((row, index) => {
    const baseline = baselineOf(index);
    return [
      cell(idX, baseline, fit(row.id, idWidth), ink),
      // 基板に幅が残っていない列は諦める。ID を切ると図の部品と突き合わせられなく
      // なるが、種類と値のほうは図 (部品の形とキャプション `R1 330`) にも出ている。
      ...(typeRoom < MIN_COLUMN_WIDTH ? [] : [cell(typeX, baseline, fit(row.type, typeWidth), ink)]),
      ...(row.value === '' || valueRoom < MIN_COLUMN_WIDTH
        ? []
        : [cell(valueX, baseline, fit(row.value, valueLimit(index)), ink)]),
      ...(showPosition && row.position ? [cell(positionX, baseline, row.position, ink)] : []),
      ...(row.icon !== undefined
        ? (row.icon === null || !iconsFit ? [] : [placeIcon(row.icon, index)])
        : row.mark.length === 0 || markRoom < MIN_COLUMN_WIDTH || markWidth(row.mark) > markRoom
          ? []
          : [typeof row.mark === 'string'
            ? cell(markX, baseline, row.mark, ink)
            : swatches(markX, baseline, row.mark, textSize, ink)]),
    ];
  });

  // 収まらなかったぶんは黙って落とさず、件数を最後の行に出す。
  const more = hidden === 0 ? '' : cell(idX, baselineOf(rows.length), partsLabels(lang).more(hidden), ink);

  // 奇数行の帯。字と絵より先に敷く (帯の上に字と絵が乗る)。行の帯は字の行を中心に行の送りの高さ。
  const stripes = symbols
    ? rows.slice(1).map((_, offset) => offset + 1).filter((index) => index % 2 === 1).map((index) => element('rect', {
      x: num(x + 1), y: num(baselineOf(index) - (textSize * CAP_RATIO) / 2 - line / 2),
      width: num(width - 2), height: num(line),
      fill: STRIPE.fill, 'fill-opacity': STRIPE.opacity,
    })).join('')
    : '';

  return plate + stripes + cells.join('') + more;
}
