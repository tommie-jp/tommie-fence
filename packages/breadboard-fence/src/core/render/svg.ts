import type { Point } from '../types.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * 図に載る文字列は必ずここを通す。VS Code の Markdown プレビューは
 * 拡張が返した HTML をサニタイズしないので、エスケープが唯一の防御になる。
 */
export const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

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

export type TextOptions = Attributes & {
  readonly anchor?: 'start' | 'middle' | 'end';
  /** 穴や配線の上に載る文字を読めるようにする縁取りの色。 */
  readonly halo?: string;
};

export function svgText(x: number, y: number, content: string, options: TextOptions = {}): string {
  const { anchor = 'middle', halo, ...rest } = options;
  return element(
    'text',
    {
      x: num(x),
      y: num(y),
      'text-anchor': anchor,
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
      ...(halo ? { stroke: halo, 'stroke-width': 3, 'paint-order': 'stroke' } : {}),
      ...rest,
    },
    escapeXml(content),
  );
}
