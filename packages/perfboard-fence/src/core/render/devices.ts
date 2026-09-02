import { element, fit, num, svgText, textWidth } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import { parseAddress } from '../model/address.ts';
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
const PIN_LABEL = 15;

/**
 * 足の名前の大きさ。**機器の名前より大きく書く。**
 * 配線をどの端子へ引くかを読むのはこの字で、`+` `-` `1` `2` のように短いので、
 * 板の字と同じ大きさだと線と穴に埋もれる。
 */
const PIN_NAME_SCALE = 1.35;
/**
 * 足の名前を書くときの字の大きさ。**箱の幅を決めるのに要る**ので、
 * テーマを渡されない置き場所の計算でも同じ値を使えるように定数で持つ。
 */
const PIN_NAME_SIZE = 9 * PIN_NAME_SCALE;
/** 名前どうしの間。これだけ空けないと `sig` と `gnd` が地続きに読める。 */
const PIN_ROOM = 8;
/** 足 1 本ぶんの幅。名前が並ぶので穴のピッチより広く取る。 */
const PIN_GAP = 22;
/** 箱の最小の幅。足が 1〜2 本でも名前が入るように。 */
const MIN_WIDTH = 80;
/** 番地で置いた機器の箱の高さ。帯に並べたものと同じ背丈にする。 */
const DEVICE_BOX_HEIGHT = 34;
/** 足 1 本ぶんがこれより狭くなったら、名前は読めない。 */
const CRAMPED = PIN_GAP / 2;

/** 足と足の間。1 本しか無ければ箱の幅ぶん空いている。 */
const pinPitch = (placed: PlacedDevice): number => {
  const xs = [...placed.pins.values()].map((point) => point.x).sort((one, other) => one - other);
  return xs.length < 2
    ? placed.box.width
    : xs.slice(1).reduce((least, x, index) => Math.min(least, x - (xs[index] as number)), Infinity);
};

/**
 * 箱の幅。**足の名前が並ぶ幅から決める。**
 *
 * 足の数だけで決めていたころは `sig gnd` のような名前が隣とくっついて
 * 1 つの綴りに読めた。どの端子へ引く線なのかを読むのはこの名前なので、
 * 名前が入る幅を先に取る。
 */
const boxWidth = (device: DeviceSpec): number => {
  const widest = device.pins.reduce((most, name) => Math.max(most, textWidth(name)), 0);
  const pitch = Math.max(PIN_GAP, widest * PIN_NAME_SIZE + PIN_ROOM);
  return Math.max(pitch * device.pins.length, MIN_WIDTH);
};

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

  // **番地で置いた機器は帯に並べない。** 書いた場所へそのまま置く
  // (箱の左上がその番地。足の位置は箱から決まる)。
  for (const device of devices) {
    if (device.where === null) continue;
    const address = parseAddress(device.where);
    if (address === null) continue;

    const at = layout.point(address);
    const width = boxWidth(device);
    const height = DEVICE_BOX_HEIGHT;
    // 板より上にあるなら足は下へ、下にあるなら足は上へ (板の側へ出す)。
    const above = at.y < layout.board.y + layout.board.height / 2;

    // **足は穴の格子に載せる。** 1 本目が書いた番地の列に来て、そこから 1 穴ずつ。
    // こうすると「その足のいちばん近い穴」が迷いなく決まり、配線を穴の番地で
    // 書ける (帯に並べたときは箱の幅で割るので、穴とは揃わない)。
    const columns = device.pins.map((_, pin) => layout.colX(address.col + pin));
    const first = columns[0] ?? at.x;
    const last = columns[columns.length - 1] ?? at.x;
    const box: Band = { x: (first + last) / 2 - width / 2, y: at.y, width, height };
    const tip = above ? box.y + box.height + LEG : box.y - LEG;
    placed.push({
      device: { ...device, at: above ? 'top' : 'bottom' },
      box,
      pins: new Map(device.pins.map((name, pin) => [name, { x: columns[pin] ?? at.x, y: tip }])),
    });
  }

  for (const side of ['top', 'bottom'] as const) {
    const band = layout.deviceBands[side];
    const here = devices.filter((device) => device.where === null && device.at === side);
    if (!band || here.length === 0) continue;

    const wanted = here.map(boxWidth);
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

  // 足は箱の縁から出る。**名前は箱の内側、足の付け根**に書く — 外側に書くと
  // 板の列番号や配線に重なり、どの足の名前なのかも遠くなる。
  const edge = top ? box.y + box.height : box.y;
  const size = theme.metrics.textSize;
  // **隣の名前とくっつかない大きさまで**。足が穴の格子に載る (番地で置いた)
  // 機器では間隔が板のピッチで決まるので、箱を広げても名前の場所は増えない。
  const room = pinPitch(placed) - PIN_ROOM;
  const widest = device.pins.reduce((most, name) => Math.max(most, textWidth(name)), 0);
  const nameSize = Math.max(size, Math.min(size * PIN_NAME_SCALE, widest === 0 ? size : room / widest));
  const nameY = top ? edge - 5 : edge + nameSize;
  const legs = [...placed.pins.entries()]
    .map(([name, point]) => element('line', {
      x1: num(point.x), y1: num(edge), x2: num(point.x), y2: num(point.y),
      stroke: theme.palette.lead, 'stroke-width': 2, 'stroke-linecap': 'round',
    }) + svgText(point.x, nameY, name, {
      fill: theme.palette.caption,
      'font-size': num(nameSize),
    }))
    .join('');

  // 機器の名前は足の名前とぶつからない側へ寄せる (上の機器なら箱の上寄り)。
  const label = fit(device.label, box.width / size);
  const caption = svgText(box.x + box.width / 2, box.y + box.height / 2 + (top ? -size * 0.5 : size * 0.9), label, {
    fill: theme.palette.caption,
    'font-size': num(size),
    'dominant-baseline': 'middle',
  });

  return `${body}${legs}${caption}`;
}

export const renderDevices = (placed: readonly PlacedDevice[], theme: Theme): string =>
  placed.map((one) => renderDevice(one, theme)).join('');

/**
 * 番地で置いた機器が、板の上と下へどれだけはみ出すか。
 *
 * **板からの距離は番地で決まっていて、板がどこに来ても変わらない**ので、
 * 仮に組んだ寸法で一度測れば、その値をそのまま `createLayout` へ渡せる
 * (測る → 空ける → 測り直す、の堂々巡りにならない)。
 */
export function deviceOverhang(
  devices: readonly DeviceSpec[],
  layout: Layout,
): { readonly above: number; readonly below: number } {
  let above = 0;
  let below = 0;

  for (const device of devices) {
    if (device.where === null) continue;
    const address = parseAddress(device.where);
    if (address === null) continue;

    const at = layout.point(address);
    // 足と足の名前のぶんも数える (箱だけ空けると名前が板に重なる)。
    above = Math.max(above, layout.board.y - at.y);
    below = Math.max(below, at.y + DEVICE_BOX_HEIGHT + LEG + PIN_LABEL - (layout.board.y + layout.board.height));
  }

  return { above: Math.max(0, above), below: Math.max(0, below) };
}
