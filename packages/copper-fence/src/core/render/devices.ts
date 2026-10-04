import { element, num, svgText } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { DEVICE_TEXT_MM } from '../parts/device.ts';
import type { PlacedDevice } from '../parts/device.ts';
import type { Mm } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 基板の外の機器の絵。**箱 (名札) と、基板の側へ出るピン (名前つき)**。置き方は
 * `parts/device.ts` が決め、ここはその上に絵を載せるだけ。機器へ引く配線は
 * 銅を作らない線なので `renderJumpers` が描く (ピンの先から銅の上まで)。
 * 裏から見た図には描かない — 機器は基板の外の物で、裏の面に置く物ではない。
 */

const NAME_INSET_PX = 3;

/** ピンの名前の置き場 (px)。ピンの付け根の内側、辺に沿ってピンの真横。 */
function nameAt(layout: Layout, device: PlacedDevice, base: Mm, size: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const at = layout.toPx(base);
  switch (device.face) {
    case 'right': return { x: at.x - NAME_INSET_PX, y: at.y + size * 0.35, anchor: 'end' };
    case 'left': return { x: at.x + NAME_INSET_PX, y: at.y + size * 0.35, anchor: 'start' };
    case 'bottom': return { x: at.x, y: at.y - NAME_INSET_PX - 1, anchor: 'middle' };
    case 'top': return { x: at.x, y: at.y + NAME_INSET_PX + size * 0.8, anchor: 'middle' };
  }
}

export function renderDevices(devices: readonly PlacedDevice[], layout: Layout, theme: Theme): string {
  const { palette, metrics } = theme;
  const size = metrics.textSize;
  return devices.map((device) => {
    const corner = layout.toPx({ x: device.box.x, y: device.box.y });
    const body = element('rect', {
      x: num(corner.x), y: num(corner.y), width: num(layout.len(device.box.width)), height: num(layout.len(device.box.height)),
      rx: 2, fill: palette.box, stroke: palette.boxEdge, 'stroke-width': 1,
    });
    const legs = device.pins.map((pin) => {
      const [a, b] = [layout.toPx(pin.base), layout.toPx(pin.tip)];
      const name = nameAt(layout, device, pin.base, size);
      return element('line', {
        x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y), stroke: palette.lead, 'stroke-width': 1.6, 'stroke-linecap': 'round',
      })
        + element('circle', { cx: num(b.x), cy: num(b.y), r: 2, fill: palette.solder, stroke: palette.lead, 'stroke-width': 0.6 })
        + svgText(name.x, name.y, pin.name, { anchor: name.anchor, fill: palette.boxText, 'font-size': num(size), 'font-weight': 'bold' });
    }).join('');
    const label = layout.toPx(device.label);
    const text = svgText(label.x, label.y + (DEVICE_TEXT_MM * size) / 2, device.spec.label, {
      fill: palette.boxText, 'font-size': num(size),
    });
    return element('g', { class: 'cf-device', 'data-device': device.spec.id }, body + legs + text);
  }).join('');
}
