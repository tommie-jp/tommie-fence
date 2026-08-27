import { DEFAULT_NOTE_SIZE, notePt } from '../notes.ts';
import type { StyleSpec } from '../types.ts';

/**
 * 図の配色。図そのものは TeX (circuitikz) が黒一色で描いてくるので、
 * ここでやるのは**描き上がった SVG の塗り替え**。
 * こうすると 1 回描いた図をどのテーマでも使い回せる (描き直さない)。
 *
 * 色は 3 つだけ。回路図に「実物の色」は無いので、実体配線図のように
 * 意味を持つ色 (配線色・カラーコード) を別に抱える必要がない。
 */
export type Theme = {
  readonly name: string;
  /** 線と文字。 */
  readonly ink: string;
  /** 端子の白丸のような「地の色」で塗るところ。 */
  readonly paper: string;
  /**
   * グリッドの色。**行英字・列数字がこの色そのままで出る**ので、読める濃さにする。
   * 点は TeX 側で薄めて描くので (tex/generate.ts の GRID_DOT_OPACITY)、
   * ここを回路より薄い色にすると点が消えてしまう。
   */
  readonly grid: string;
  /**
   * 地の色をエディタに合わせてよいか。
   * テーマを選ばず、地の色も書かなかったときだけ true。
   * 色を書いた図まで CSS で塗り替えると、書いた指定が効かなくなる。
   */
  readonly followsEditor: boolean;
};

/**
 * 既定はエディタ追従。線は currentColor にしておくと、プレビューの文字色を
 * そのまま拾うので、明るいテーマでも暗いテーマでも読める。
 */
const AUTO: Theme = {
  name: 'auto', ink: 'currentColor', paper: '#ffffff', grid: '#8b949e', followsEditor: true,
};

const THEMES: Record<string, Theme> = {
  auto: AUTO,
  light: { name: 'light', ink: '#1f2328', paper: '#ffffff', grid: '#8c959f', followsEditor: false },
  dark: { name: 'dark', ink: '#e6edf3', paper: '#0d1117', grid: '#7d8590', followsEditor: false },
  /** 資料に貼る用。プレビューのテーマに関わらず黒一色。 */
  mono: { name: 'mono', ink: '#000000', paper: '#ffffff', grid: '#767676', followsEditor: false },
};

export const THEME_NAMES: readonly string[] = Object.keys(THEMES);
export const DEFAULT_THEME_NAME = 'auto';
export const DEFAULT_THEME = AUTO;

export type ThemeResolution = { readonly theme: Theme; readonly messages: readonly string[] };

/** 名前でテーマを選び、個別に書かれた色で上書きする (テーマ → 個別キーの二段重ね)。 */
export function resolveTheme(style: StyleSpec): ThemeResolution {
  const messages: string[] = [];
  const named = style.theme === null ? DEFAULT_THEME : (THEMES[style.theme] ?? null);
  if (named === null) messages.push(`知らないテーマです (使えるのは ${THEME_NAMES.join(' / ')})`);

  const base = named ?? DEFAULT_THEME;
  return {
    theme: {
      name: base.name,
      ink: style.inkColor ?? base.ink,
      paper: style.paperColor ?? base.paper,
      grid: style.gridColor ?? base.grid,
      // 地の色を書いてあるなら、その色のままにする。
      followsEditor: base.followsEditor && style.paperColor === null,
    },
    messages,
  };
}

/**
 * エンジンが出す色は 3 種類しかないので (実測)、それをテーマの色に置き換える。
 *
 * - `#000` 回路の線と文字
 * - `#fff` 端子の白丸の塗り
 * - `gray` こちらがグリッドに使った色
 *
 * `none` (塗らない・描かない) には触らない。
 *
 * 分岐の黒丸 (circuitikz の `circ`) は**塗りを書かず** SVG の既定 (黒) に
 * 頼っているので、根に塗りを 1 つ置いて拾わせる。置かないと暗いテーマで
 * 地に沈んで見えなくなる。
 */
export function recolorSvg(svg: string, theme: Theme): string {
  return svg
    .replace(/(stroke|fill)="#000(?:000)?"/g, `$1="${theme.ink}"`)
    .replace(/(stroke|fill)="#fff(?:fff)?"/g, `$1="${theme.paper}"`)
    .replace(/(stroke|fill)="gray"/g, `$1="${theme.grid}"`)
    .replace(/^(\s*<svg\b)(?![^>]*\sfill=)/, `$1 fill="${theme.ink}"`);
}

const WIDTH = /(<svg[^>]*?)\swidth="([\d.]+)"([^>]*?)\sheight="([\d.]+)"/;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * 外寸だけを書き直す。viewBox は触らないので、図の中身は動かず縦横比も保たれる
 * (48 と同じ考え方)。単位は**属性に書く** — プレビューの CSP は inline style を
 * 落とすことがあるが、表現属性は CSP の外にあるので必ず効く (実測)。
 *
 * 測れない図は触らない。外寸を書き直せないだけで図は出るので、
 * これまでどおりの大きさで出す。
 */
const withOuterSize = (svg: string, width: number, unit: string): string =>
  svg.replace(WIDTH, (whole, head: string, w: string, middle: string, h: string) => {
    const natural = Number(w);
    if (!Number.isFinite(natural) || natural <= 0) return whole;
    const height = round3((Number(h) * width) / natural);
    return `${head} width="${width}${unit}"${middle} height="${height}${unit}"`;
  });

/** 出力の横ドット数だけを変える。 */
export function resizeSvg(svg: string, width: number | null): string {
  return width === null ? svg : withOuterSize(svg, width, '');
}

const VIEWBOX = /<svg\b[^>]*\sviewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+[-\d.]+"/;

/**
 * 図の外寸を em で書き直す。**注釈の `normal` が、読み手のプレビューの
 * 地の文と同じ大きさになる**倍率にする。
 *
 * エンジンが出す図はドットで外寸が書いてあるので、素のままだと注釈の字が
 * 周りの文章より小さく出る (`normal` は 8pt = 10.7 ドット、プレビューの
 * 地の文は既定 14 ドット)。**合わせる層はここ (表示) しかない** — TeX の指定を
 * 変えても、読み手が字の大きさを変えれば同じだけずれる。
 *
 * viewBox の 1 は図の中の font-size の 1 と同じ物差しなので (`normal` の注釈は
 * font-size="8" で出る)、viewBox の幅を `normal` の pt で割った値をそのまま
 * em にすればよい。1 em = normal になり、読み手の設定にも拡大にも付いてくる。
 */
export function scaleSvgToText(svg: string): string {
  const viewBox = Number(VIEWBOX.exec(svg)?.[1]);
  if (!Number.isFinite(viewBox) || viewBox <= 0) return svg;

  return withOuterSize(svg, round3(viewBox / notePt(DEFAULT_NOTE_SIZE)), 'em');
}
