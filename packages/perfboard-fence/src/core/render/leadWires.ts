import { element, num } from 'fence-kit';
import { bodyRect } from '../placement/geometry.ts';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, RoutedWire } from '../types.ts';
import type { Theme } from './theme.ts';
import { renderWires } from './wires.ts';

/** 胴の下をくぐる線を胴の上に重ねるときの不透明度。 */
const UNDER_OPACITY = 0.5;

/**
 * 部品の足へ来る線を、**胴の上にもう一度引く**。
 *
 * 配線は部品の下に敷くので、胴が足の穴を覆う部品 (USB-C の変換基板のパッド、
 * DIP の変換基板、電解コンデンサ、セラミックフィルタなど) では、線がどの足へ
 * 行くのかが部品面の図から見えない。胴の外形で切り抜いて重ねるので、胴の外の線は
 * 元のまま (他の部品を隠さない)、胴の上だけ足の真ん中まで線が見える。
 * **その部品の足に来る線は濃いまま**、胴の下をくぐるだけの線は**半分透かして**重ねる
 * (`UNDER_OPACITY`) — くぐる線も行き先が追えて、しかも足へ来る線と見分けられる。
 */
export function renderLeadWires(
  parts: readonly PlacedPart[],
  wires: readonly RoutedWire[],
  layout: Layout,
  theme: Theme,
  hops: readonly (readonly Point[])[] = [],
): string {
  return parts.map((part) => {
    const feet = new Set(part.pins.map((pin) => `${pin.address.row},${pin.address.col}`));
    const touches = (wire: RoutedWire): boolean =>
      feet.has(`${wire.from.row},${wire.from.col}`) || feet.has(`${wire.to.row},${wire.to.col}`);
    const rect = part.pins.length === 0 ? null : bodyRect(part, layout);
    if (rect === null) return '';
    const reach = Math.hypot(rect.width, rect.height) / 2;
    // 胴を囲む正方形に掛かる線だけ。切り抜くので、多めに拾っても絵は変わらない。
    const near = (wire: RoutedWire): boolean => {
      const a = layout.point(wire.from);
      const b = layout.point(wire.to);
      return Math.max(a.x, b.x) >= rect.cx - reach && Math.min(a.x, b.x) <= rect.cx + reach
        && Math.max(a.y, b.y) >= rect.cy - reach && Math.min(a.y, b.y) <= rect.cy + reach;
    };
    const picked = wires.flatMap((wire, index) => (touches(wire) ? [{ wire, hop: hops[index] ?? [] }] : []));
    const under = wires.flatMap((wire, index) =>
      (!touches(wire) && near(wire) ? [{ wire, hop: hops[index] ?? [] }] : []));
    if (picked.length === 0 && under.length === 0) return '';

    const id = `pf-lead-${safeId(part.id)}-${Math.round(rect.cx)}-${Math.round(rect.cy)}`;
    const clip = element('clipPath', { id }, element('rect', {
      x: num(rect.cx - rect.width / 2), y: num(rect.cy - rect.height / 2),
      width: num(rect.width), height: num(rect.height),
      transform: `rotate(${num((rect.angle * 180) / Math.PI)} ${num(rect.cx)} ${num(rect.cy)})`,
    }));
    const draw = (items: typeof picked): string =>
      renderWires(items.map((item) => item.wire), layout, theme, items.map((item) => item.hop));
    const faint = under.length === 0 ? '' : element('g', { opacity: UNDER_OPACITY }, draw(under));
    const solid = picked.length === 0 ? '' : draw(picked);
    return clip + element('g', { 'clip-path': `url(#${id})` }, faint + solid);
  }).join('');
}

const safeId = (text: string): string => text.replace(/[^A-Za-z0-9_-]/g, '_');
