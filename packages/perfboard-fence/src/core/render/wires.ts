import { element, num } from 'fence-kit';
import { wireStroke } from '../color.ts';
import type { Layout } from '../model/layout.ts';
import type { RoutedWire } from '../types.ts';
import type { DeviceWire } from '../wiring/wiring.ts';
import type { PlacedDevice } from './devices.ts';
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
        stroke: wireStroke(wire.color),
        'stroke-width': WIRE_WIDTH,
        'stroke-linecap': 'round',
        'stroke-opacity': theme.metrics.wireOpacity,
      });
    })
    .join('');

/**
 * 機器の足と穴を結ぶ配線。**板の上まで線を引く。**
 *
 * 電池やスピーカーの線も、実物では板の穴に半田付けする。どの穴へ行くのかが
 * 図に出ないと、帯に浮いた箱と板が結び付かず、組む人が図から手を動かせない
 * (breadboard-fence も同じように引く)。線が届く先はその穴そのものなので、
 * 「挿す場所があるように見える」ということも無い。
 *
 * 機器どうしを結んだ配線は板に触れないので、ここには来ない。
 */
export const renderDeviceWires = (
  wires: readonly DeviceWire[],
  devices: readonly PlacedDevice[],
  layout: Layout,
  theme: Theme,
): string => {
  const pins = new Map(devices.map((placed) => [placed.device.id, placed.pins]));

  return wires
    .map((wire) => {
      const from = pins.get(wire.device)?.get(wire.pin);
      // 機器が帯に置けなかったとき (帯そのものが無いとき) は線も引けない。
      if (!from) return '';
      const to = layout.point(wire.hole);
      return element('line', {
        x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
        stroke: wireStroke(wire.color),
        'stroke-width': WIRE_WIDTH,
        'stroke-linecap': 'round',
        'stroke-opacity': theme.metrics.wireOpacity,
      });
    })
    .join('');
};
