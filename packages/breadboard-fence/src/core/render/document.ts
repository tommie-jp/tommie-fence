import type { Layout } from '../model/layout.ts';
import type { Board, FenceError, PlacedPart, Point } from '../types.ts';
import { renderBoard } from './board.ts';
import type { DevicePlacement } from './devices.ts';
import { renderDevice } from './devices.ts';
import { bannerHeight, renderErrorBanner } from './errorCard.ts';
import { renderPart } from './parts.ts';
import { num } from './svg.ts';
import { renderWire } from './wires.ts';

export type RenderedWire = { readonly points: readonly Point[]; readonly color: string };

export type DocumentInput = {
  readonly board: Board;
  readonly layout: Layout;
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
  const { layout, errors } = input;
  const banner = bannerHeight(errors);
  const height = layout.height + banner;

  const body = [
    renderBoard(input.board, layout),
    ...input.wires.map((wire) => renderWire(wire.points, wire.color)),
    ...input.parts.filter((part) => part.kind !== 'device').map((part) => renderPart(part, layout)),
    ...input.parts
      .filter((part) => part.kind === 'device')
      .map((part) => {
        const placement = input.devices.get(part.id);
        return placement ? renderDevice(part, placement) : '';
      }),
    renderErrorBanner(errors, layout.board.x, layout.height, layout.board.width),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width)}" height="${num(height)}" viewBox="0 0 ${num(layout.width)} ${num(height)}" role="img">`,
    ...body.filter(Boolean),
    '</svg>',
  ].join('\n');
}
