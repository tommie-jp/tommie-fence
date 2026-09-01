import { DEFAULT_WIRE_COLOR, element, num, wireColor } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { RoutedWire } from '../types.ts';
import type { Theme } from './theme.ts';

/** ジャンパの太さ。部品の足より少し太い (被覆があるぶん)。 */
const WIRE_WIDTH = 3;

/**
 * 配線。**2 つの穴をまっすぐ結ぶ。**
 *
 * ブレッドボードは溝と電源レールがあるので横レーンへ迂回する経路探索が要ったが
 * (48 の docs/12〜14)、ユニバーサル基板はどの穴も同じ格子の上にあり、
 * ジャンパは実物でも 2 点を最短で結ぶ。**書かれたとおりに描く**という約束とも
 * 合っている — 経路を機械が決めると、はんだ付けの手順書にならない。
 */
export const renderWires = (wires: readonly RoutedWire[], layout: Layout, theme: Theme): string =>
  wires
    .map((wire) => {
      const from = layout.point(wire.from);
      const to = layout.point(wire.to);
      return element('line', {
        x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
        stroke: (wire.color === null ? null : wireColor(wire.color)) ?? DEFAULT_WIRE_COLOR,
        'stroke-width': WIRE_WIDTH,
        'stroke-linecap': 'round',
        'stroke-opacity': theme.metrics.wireOpacity,
      });
    })
    .join('');
