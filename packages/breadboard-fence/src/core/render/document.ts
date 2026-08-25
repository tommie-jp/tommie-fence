import type { Layout } from '../model/layout.ts';
import type { Board, FenceError, PlacedPart, Point } from '../types.ts';
import { renderBoard } from './board.ts';
import type { DevicePlacement } from './devices.ts';
import { renderDevice } from './devices.ts';
import { bannerHeight, renderErrorBanner } from './errorCard.ts';
import { renderPart } from './parts.ts';
import { element, num } from './svg.ts';
import type { RenderStyle } from './theme.ts';
import { renderWire } from './wires.ts';

export type RenderedWire = { readonly points: readonly Point[]; readonly color: string };

export type DocumentInput = {
  readonly board: Board;
  readonly layout: Layout;
  readonly style: RenderStyle;
  readonly parts: readonly PlacedPart[];
  readonly devices: ReadonlyMap<string, DevicePlacement>;
  readonly wires: readonly RenderedWire[];
  readonly errors: readonly FenceError[];
};

/**
 * 完結した 1 枚の SVG にまとめる。外部リソースもスクリプトも参照しないので、
 * VS Code のプレビュー・CLI・他アプリのどこに貼っても同じ絵になる。
 */
export function renderDocument(input: DocumentInput): string {
  const { layout, errors, style } = input;
  const { theme } = style;
  const banner = bannerHeight(errors);
  const height = layout.height + banner;

  // 座標系 (viewBox) は動かさず、外側の大きさだけを指定の横幅に合わせる。
  // ピッチを変えるとレイアウトも配線の経路も総取り替えになるので、拡大縮小はここだけで済ませる。
  const scale = style.width === null ? 1 : style.width / layout.width;

  const canvas = theme.palette.canvas === null
    ? ''
    : element('rect', { x: 0, y: 0, width: num(layout.width), height: num(height), fill: theme.palette.canvas });

  // 縁取りは全部先に敷いてから線を重ねる。1 本ずつ「縁取り→線」で描くと、
  // 交差したところで後の配線の縁取りが先の配線を塗り潰してしまう。
  const wires = input.wires.map((wire) => renderWire(wire.points, wire.color, theme));

  const body = [
    canvas,
    renderBoard(input.board, layout, theme),
    ...wires.map((wire) => wire.halo),
    ...wires.map((wire) => wire.line),
    ...input.parts.filter((part) => part.kind !== 'device').map((part) => renderPart(part, layout, theme)),
    ...input.parts
      .filter((part) => part.kind === 'device')
      .map((part) => {
        const placement = input.devices.get(part.id);
        return placement ? renderDevice(part, placement, theme) : '';
      }),
    renderErrorBanner(errors, layout.board.x, layout.height, layout.board.width, theme.palette),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width * scale)}" height="${num(height * scale)}" viewBox="0 0 ${num(layout.width)} ${num(height)}" role="img">`,
    ...body.filter(Boolean),
    '</svg>',
  ].join('\n');
}
