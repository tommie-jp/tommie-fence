import { TEXT_HALO_WIDTH, element, escapeMarkup, num, svgText } from 'fence-kit';
import type { Attributes, TextOptions } from 'fence-kit';
import type { Point } from '../types.ts';

export type { Attributes, TextOptions };
export { element, num, svgText, TEXT_HALO_WIDTH };

/**
 * 図に載る文字列は必ずここを通す。VS Code の Markdown プレビューは
 * 拡張が返した HTML をサニタイズしないので、エスケープが唯一の防御になる。
 *
 * 中身は fence-kit にある。5 文字の実体参照と制御文字の切り捨ては XML と
 * HTML で同じで、分けると片方だけ直す事故が起きる (実際、circuit 側に
 * `escapeHtml` という名前で同じ実装が複製されていた)。
 */
export const escapeXml = escapeMarkup;

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
