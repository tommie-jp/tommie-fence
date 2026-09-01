import { element, fit, num, svgText } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import type { Band, Layout } from '../model/layout.ts';
import type { DeviceSpec, FenceError, Point } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 板の外の機器。**帯の中に箱として並べ、足を板の側へ出す。**
 *
 * 盤面に載らないものを板の上に描くと、挿す場所があるように見えてしまう。
 * 帯を分けておけば「これは外の物」が形で分かる。
 */

/** 箱どうしの間。 */
const GAP = 12;
/** 箱の外へ出る足の長さ。 */
const LEG = 10;
/** 足の名前を書く高さ。足の先の外側に書く。 */
const PIN_LABEL = 12;
/** 足 1 本ぶんの幅。名前が並ぶので穴のピッチより広く取る。 */
const PIN_GAP = 22;
/** 箱の最小の幅。足が 1〜2 本でも名前が入るように。 */
const MIN_WIDTH = 80;
/** 足 1 本ぶんがこれより狭くなったら、名前は読めない。 */
const CRAMPED = PIN_GAP / 2;

export type PlacedDevice = {
  readonly device: DeviceSpec;
  readonly box: Band;
  /** 足の名前 → 板の側の端。配線はここへつながる。 */
  readonly pins: ReadonlyMap<string, Point>;
};

export type DeviceLayout = {
  readonly placed: readonly PlacedDevice[];
  /** 詰め込みすぎて読めなくなったときの言い分。**黙って描かない。** */
  readonly notices: readonly FenceError[];
};

/**
 * 帯の中に機器を横へ並べる。**幅は足の数で決まる** — 足を等間隔に置ける
 * 幅が要るので、足の多い機器ほど広くなる。
 */
export function layoutDevices(devices: readonly DeviceSpec[], layout: Layout): DeviceLayout {
  const placed: PlacedDevice[] = [];
  const notices: FenceError[] = [];

  for (const side of ['top', 'bottom'] as const) {
    const band = layout.deviceBands[side];
    const here = devices.filter((device) => device.at === side);
    if (!band || here.length === 0) continue;

    const wanted = here.map((device) => Math.max(PIN_GAP * device.pins.length, MIN_WIDTH));
    const asked = wanted.reduce((sum, width) => sum + width, 0) + GAP * (here.length - 1);

    // **帯からはみ出させない。** viewBox の外に描いた箱は黙って切れるので、
    // 入る幅まで一様に詰める (板の穴数と機器の数は釣り合っていないことがある)。
    const room = Math.max(0, band.width - GAP * (here.length - 1));
    const squeeze = asked > band.width ? room / (asked - GAP * (here.length - 1)) : 1;
    const widths = wanted.map((width) => width * squeeze);
    const total = widths.reduce((sum, width) => sum + width, 0) + GAP * (here.length - 1);
    let x = band.x + Math.max(0, (band.width - total) / 2);

    // 詰めた結果、足の名前が読めない幅になったら言う。読めない図を黙って出さない。
    for (const [index, device] of here.entries()) {
      if ((widths[index] as number) / device.pins.length >= CRAMPED) continue;
      notices.push(notice(
        `${safeToken(device.id)} の足が板の幅に収まりません`
        + ` (${device.pins.length} 本。板を広げるか、機器を上下に分けます)`,
        device.line,
      ));
    }

    // 帯の高さは箱と、板の側へ出る足と、その名前で分け合う。
    const height = band.height - LEG - PIN_LABEL;

    for (const [index, device] of here.entries()) {
      const width = widths[index] as number;
      // 足は板の側へ出す (上の帯なら下、下の帯なら上)。
      const box: Band = {
        x, y: side === 'top' ? band.y : band.y + LEG + PIN_LABEL, width, height,
      };
      const tip = side === 'top' ? box.y + box.height + LEG : box.y - LEG;
      const step = width / (device.pins.length + 1);
      const pins = new Map<string, Point>(
        device.pins.map((name, pin) => [name, { x: box.x + step * (pin + 1), y: tip }]),
      );
      placed.push({ device, box, pins });
      x += width + GAP;
    }
  }

  return { placed, notices };
}

function renderDevice(placed: PlacedDevice, theme: Theme): string {
  const { box, device } = placed;
  const top = device.at === 'top';
  const body = element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: 4,
    fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

  // 足は箱の縁から出て、名前はその先の外側。**箱の中に書くと題と重なる。**
  const edge = top ? box.y + box.height : box.y;
  const legs = [...placed.pins.entries()]
    .map(([name, point]) => element('line', {
      x1: num(point.x), y1: num(edge), x2: num(point.x), y2: num(point.y),
      stroke: theme.palette.lead, 'stroke-width': 2, 'stroke-linecap': 'round',
    }) + svgText(point.x, point.y + (top ? PIN_LABEL - 3 : -4), name, {
      fill: theme.palette.label,
      'font-size': num(theme.metrics.textSize),
    }))
    .join('');

  const label = fit(device.label, box.width / theme.metrics.textSize);
  const caption = svgText(box.x + box.width / 2, box.y + box.height / 2, label, {
    fill: theme.palette.caption,
    'font-size': num(theme.metrics.textSize),
    'dominant-baseline': 'middle',
  });

  return `${body}${legs}${caption}`;
}

export const renderDevices = (placed: readonly PlacedDevice[], theme: Theme): string =>
  placed.map((one) => renderDevice(one, theme)).join('');
