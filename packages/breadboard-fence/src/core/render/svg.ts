import type { Point } from '../types.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// XML 1.0 が載せられない文字 (タブ・改行・復帰以外の制御文字)。
// 1 つ混ざるだけで図全体がパースできなくなるので、エスケープではなく捨てる。
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * 図に載る文字列は必ずここを通す。VS Code の Markdown プレビューは
 * 拡張が返した HTML をサニタイズしないので、エスケープが唯一の防御になる。
 */
export const escapeXml = (text: string): string =>
  text.replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** 座標の桁を落として出力を安定させる (同じ入力なら同じ文字列 = プレビューの差分更新が軽い)。 */
export const num = (value: number): string => String(Math.round(value * 100) / 100);

const point = (p: Point): string => `${num(p.x)} ${num(p.y)}`;

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

const towards = (from: Point, to: Point, length: number): Point => {
  const span = distance(from, to);
  if (span === 0) return from;
  return { x: from.x + ((to.x - from.x) / span) * length, y: from.y + ((to.y - from.y) / span) * length };
};

/** 折れ点を丸めた線。角の丸めは短い方の辺の半分までに抑える。 */
export function roundedPath(points: readonly Point[], radius: number): string {
  const path = points.filter((current, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== current.x || previous.y !== current.y;
  });
  const [start] = path;
  if (!start || path.length < 2) return '';

  const commands = [`M ${point(start)}`];
  for (let index = 1; index < path.length - 1; index += 1) {
    const corner = path[index]!;
    const before = path[index - 1]!;
    const after = path[index + 1]!;
    const entry = towards(corner, before, Math.min(radius, distance(corner, before) / 2));
    const exit = towards(corner, after, Math.min(radius, distance(corner, after) / 2));
    commands.push(`L ${point(entry)}`, `Q ${point(corner)} ${point(exit)}`);
  }
  commands.push(`L ${point(path[path.length - 1]!)}`);

  return commands.join(' ');
}

export type Attributes = Record<string, string | number | undefined>;

const attributes = (attrs: Attributes): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join('');

export const element = (name: string, attrs: Attributes, children?: string): string =>
  children === undefined ? `<${name}${attributes(attrs)}/>` : `<${name}${attributes(attrs)}>${children}</${name}>`;

/** 既定の字の大きさ (10) に対する縁取りの太さ。字を大きくする側が比例して広げる。 */
export const TEXT_HALO_WIDTH = 3;

export type TextOptions = Attributes & {
  readonly anchor?: 'start' | 'middle' | 'end';
  /** 穴や配線の上に載る文字を読めるようにする縁取りの色。 */
  readonly halo?: string;
  /** 縁取りの太さ。字を大きくしたときに広げないと、下の穴が字に透ける。 */
  readonly haloWidth?: number;
};

export function svgText(x: number, y: number, content: string, options: TextOptions = {}): string {
  const { anchor = 'middle', halo, haloWidth = TEXT_HALO_WIDTH, ...rest } = options;
  return element(
    'text',
    {
      x: num(x),
      y: num(y),
      'text-anchor': anchor,
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
      ...(halo ? { stroke: halo, 'stroke-width': num(haloWidth), 'paint-order': 'stroke' } : {}),
      ...rest,
    },
    escapeXml(content),
  );
}
