import type { StyleSpec } from '../types.ts';

/**
 * 図の配色。**意味を持つ色 (配線色・抵抗のカラーコード・LED の色) はここに入れない**。
 * あれは実物の色そのものなので、テーマで塗り替えると図が嘘になる (`palette.ts` が持つ)。
 *
 * null が書けるのは「描かない」を選べるところだけ:
 * canvas は透明のまま、holeEdge は縁を付けない、wireHalo は配線を縁取らない。
 */
export type Palette = {
  readonly canvas: string | null;
  readonly plate: string;
  readonly plateEdge: string;
  readonly ravine: string;
  readonly hole: string;
  readonly holeEdge: string | null;
  readonly label: string;
  readonly positive: string;
  readonly negative: string;
  readonly lead: string;
  readonly chipBody: string;
  readonly chipPin: string;
  readonly chipText: string;
  readonly deviceBody: string;
  readonly deviceEdge: string;
  readonly deviceText: string;
  readonly partText: string;
  readonly textHalo: string;
  readonly wireHalo: string | null;
  readonly errorInk: string;
  readonly errorPlate: string;
  readonly errorEdge: string;
};

export type Metrics = {
  /** 部品のラベル (ID と値) の字の大きさ。ほかの字はここからの比で決まる。 */
  readonly textSize: number;
  /** ボードの印字 (行・列・極性) の倍率。部品のラベルとは別に持つ。 */
  readonly boardTextScale: number;
  readonly wireWidth: number;
  readonly holeSize: number;
};

export type RenderTheme = {
  readonly name: string;
  readonly palette: Palette;
  readonly metrics: Metrics;
};

/** 出力そのものの指定。大きさはテーマではなく貼り先の都合で決まるので、テーマとは分ける。 */
export type RenderStyle = {
  readonly theme: RenderTheme;
  /** 出力の横ドット数。null なら viewBox の座標をそのまま px として出す。 */
  readonly width: number | null;
  /** お知らせを図の下に出すか。既定は出す。 */
  readonly debug: boolean;
  /** 図の右下に処理系の版を刻むか。既定は刻まない。 */
  readonly stamp: boolean;
};

export type StyleResolution = { readonly style: RenderStyle; readonly messages: readonly string[] };

/** 部品ラベルの既定の大きさ。ほかの字の大きさはこれとの比で書く。 */
export const BASE_TEXT_SIZE = 10;

/** 穴の既定の大きさ。ラベルの縁取りは、これより大きい穴のぶんだけ太くする。 */
export const BASE_HOLE_SIZE = 5.2;

const DEFAULT_METRICS: Metrics = {
  textSize: BASE_TEXT_SIZE,
  boardTextScale: 1,
  wireWidth: 3.4,
  holeSize: BASE_HOLE_SIZE,
};

const metrics = (overrides: Partial<Metrics> = {}): Metrics => ({ ...DEFAULT_METRICS, ...overrides });

/**
 * 実物のブレッドボードに寄せた配色。ほかのテーマはここからの差分として考える。
 * **ここは変えない** (`style: classic` と書いた図の見え方が変わる)。
 */
const CLASSIC: Palette = {
  canvas: null,
  plate: '#f2efe6',
  plateEdge: '#d8d2c2',
  ravine: '#e6e2d4',
  hole: '#30353d',
  holeEdge: null,
  // 印字は薄いと穴に埋もれるので、板の色に対して十分暗くする。
  label: '#5f5748',
  positive: '#d33a2f',
  negative: '#2b6fd4',
  lead: '#8f98a3',
  chipBody: '#2b2f36',
  chipPin: '#b9bec7',
  chipText: '#e8ebf0',
  deviceBody: '#3d434d',
  deviceEdge: '#20242b',
  deviceText: '#f0f3f8',
  partText: '#3f4650',
  textHalo: '#f2efe6',
  wireHalo: null,
  errorInk: '#8c1d18',
  errorPlate: '#fdecea',
  errorEdge: '#e0b4b0',
};

/**
 * 暗い文書に貼るための配色。穴は塗りでは板と差が付かないので、明るい縁で立たせる。
 * 配線は色を変えず (意味が変わる)、明るい縁取りを敷いて黒や紺を浮かせる。
 */
const DARK: Palette = {
  canvas: '#161a1f',
  plate: '#2b3038',
  plateEdge: '#434b56',
  ravine: '#232830',
  hole: '#0d1014',
  holeEdge: '#78838f',
  label: '#aab4c0',
  positive: '#ff6f61',
  negative: '#6ba7ff',
  lead: '#8d97a3',
  chipBody: '#12161b',
  chipPin: '#c9cfd8',
  chipText: '#eef1f6',
  deviceBody: '#1c2128',
  deviceEdge: '#080a0d',
  deviceText: '#eef1f6',
  partText: '#e2e8f0',
  textHalo: '#2b3038',
  wireHalo: '#e8edf4',
  errorInk: '#ffb4ab',
  errorPlate: '#3b1f1d',
  errorEdge: '#6b3a36',
};

/** プロジェクタや印刷の劣化に耐える配色。輪郭を黒で締めて、配線も黒で縁取る。 */
const HIGH_CONTRAST: Palette = {
  canvas: '#ffffff',
  plate: '#ffffff',
  plateEdge: '#000000',
  ravine: '#dcdcdc',
  hole: '#000000',
  holeEdge: null,
  label: '#000000',
  positive: '#c40000',
  negative: '#0032a0',
  lead: '#4a5058',
  chipBody: '#000000',
  chipPin: '#ffffff',
  chipText: '#ffffff',
  deviceBody: '#000000',
  deviceEdge: '#000000',
  deviceText: '#ffffff',
  partText: '#000000',
  textHalo: '#ffffff',
  wireHalo: '#000000',
  errorInk: '#8c0006',
  errorPlate: '#ffffff',
  errorEdge: '#8c0006',
};

/**
 * 白黒印刷・コピー向け。板と印字だけをグレーに落とす。
 * **配線の色と抵抗のカラーコードは残す** (色そのものが情報なので、落とすと読めなくなる)。
 * 明るい配線が地に沈まないよう、暗い縁取りを敷く。
 */
const MONO: Palette = {
  canvas: '#ffffff',
  plate: '#f4f4f4',
  plateEdge: '#c4c4c4',
  ravine: '#e4e4e4',
  hole: '#3a3a3a',
  holeEdge: null,
  label: '#4a4a4a',
  // ＋と−は記号で見分けが付くので、濃さの差だけ残す。
  positive: '#3a3a3a',
  negative: '#7a7a7a',
  lead: '#8f8f8f',
  chipBody: '#3a3a3a',
  chipPin: '#dcdcdc',
  chipText: '#f4f4f4',
  deviceBody: '#4a4a4a',
  deviceEdge: '#242424',
  deviceText: '#f8f8f8',
  partText: '#242424',
  textHalo: '#f4f4f4',
  wireHalo: '#3a3a3a',
  errorInk: '#8c1d18',
  errorPlate: '#f6ecea',
  errorEdge: '#c4a09c',
};

/**
 * 既定のテーマ (`DEFAULT_THEME_NAME`)。色は classic のまま、字と線と穴だけ大きくする。
 * 貼り先が暗いときに縁が透けないよう、地は白で塗る。
 */
const PRESENTATION: Palette = { ...CLASSIC, canvas: '#ffffff' };

/** 名前つきのテーマ。`style: <名前>` で選ぶ。 */
export const THEMES: Record<string, RenderTheme> = {
  classic: { name: 'classic', palette: CLASSIC, metrics: metrics() },
  dark: { name: 'dark', palette: DARK, metrics: metrics() },
  'high-contrast': {
    name: 'high-contrast',
    // 穴は真っ黒な時点で十分読めるので大きくしない。広げるとラベルと重なる場所が増える。
    metrics: metrics({ textSize: 12, boardTextScale: 1.1, wireWidth: 4.2 }),
    palette: HIGH_CONTRAST,
  },
  mono: { name: 'mono', palette: MONO, metrics: metrics() },
  presentation: {
    name: 'presentation',
    palette: PRESENTATION,
    metrics: metrics({ textSize: 12.5, boardTextScale: 1.15, wireWidth: 4.2, holeSize: 6 }),
  },
};

export const THEME_NAMES: readonly string[] = Object.keys(THEMES);

/**
 * `style:` を書かなかったときのテーマ。テーマを選べない場面
 * (図が組み立てられず、フェンスを読めてすらいないとき) の拠り所でもある。
 *
 * classic ではなく presentation にしてある。既定の図がそのままスライドや記事に
 * 貼れる大きさで出るほうがよく、classic は「実物の見た目に寄せた小さい図が要る」
 * ときに名前で選ぶ、という位置づけにした。
 */
export const DEFAULT_THEME_NAME = 'presentation';

export const DEFAULT_THEME = THEMES[DEFAULT_THEME_NAME] as RenderTheme;

/** 名前は入力から来るので、必ず自分の持ち物だけを引く (`palette.ts` の色名と同じ理由)。 */
const lookupTheme = (name: string): RenderTheme | null =>
  Object.hasOwn(THEMES, name) ? THEMES[name] ?? null : null;

const clampByte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((part) => clampByte(part).toString(16).padStart(2, '0')).join('')}`;

const channels = (hex: string): readonly [number, number, number] => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return [r, g, b];
};

/** 板の色を暗い側へ寄せる。地の色だけ変えたときに、縁と溝が元の板の色のまま浮くのを防ぐ。 */
function darken(hex: string, amount: number): string {
  const [r, g, b] = channels(hex);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** その色が明るいか。ITU-R BT.601 の輝度で足りる (人が読めるかの判定にしか使わない)。 */
const isLight = (hex: string): boolean => {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
};

/**
 * 板の色を指定されたとき、そこに載る印字を読める側へ寄せる。
 * 板だけ暗くして字が暗いまま残ると、テーマが守っているコントラストが崩れる。
 * 細かく合わせたいときは、近いテーマを選んでから個別に上書きしてもらう。
 */
const inkFor = (plate: string): { readonly partText: string; readonly label: string } =>
  isLight(plate)
    ? { partText: CLASSIC.partText, label: CLASSIC.label }
    : { partText: DARK.partText, label: DARK.label };

function withOverrides(theme: RenderTheme, spec: StyleSpec): RenderTheme {
  const { palette } = theme;
  const plate = spec.boardColor ?? palette.plate;
  const derived = spec.boardColor === null
    ? null
    : { plate, plateEdge: darken(plate, 0.16), ravine: darken(plate, 0.07), ...inkFor(plate) };

  return {
    name: theme.name,
    palette: {
      ...palette,
      ...derived,
      hole: spec.holeColor ?? palette.hole,
      partText: spec.textColor ?? derived?.partText ?? palette.partText,
      // 縁取りは板と同じ色でなければ意味が無いので、板を動かしたら黙って付いていく。
      textHalo: spec.textBackground ?? spec.boardColor ?? palette.textHalo,
    },
    metrics: {
      ...theme.metrics,
      textSize: spec.textSize ?? theme.metrics.textSize,
      wireWidth: spec.wireWidth ?? theme.metrics.wireWidth,
      holeSize: spec.holeSize ?? theme.metrics.holeSize,
    },
  };
}

/**
 * 既定のテーマ → 名前で選ばれたテーマ → 個別のキー、の順に重ねて見た目を決める。
 * 知らないテーマ名は既定のまま描き続け、使える名前を添えて理由を返す。
 */
export function resolveStyle(spec: StyleSpec): StyleResolution {
  const messages: string[] = [];
  const named = spec.theme === null ? DEFAULT_THEME : lookupTheme(spec.theme);
  if (named === null) {
    messages.push(`知らないテーマです。使えるのは ${THEME_NAMES.join(', ')}`);
  }

  return {
    style: {
      theme: withOverrides(named ?? DEFAULT_THEME, spec),
      width: spec.width,
      debug: spec.debug ?? true,
      stamp: spec.stamp ?? false,
    },
    messages,
  };
}

/** 部品ラベル以外の字や余白を、選ばれた字の大きさに合わせて伸ばす倍率。既定では 1。 */
export const textScale = (theme: RenderTheme): number => theme.metrics.textSize / BASE_TEXT_SIZE;
