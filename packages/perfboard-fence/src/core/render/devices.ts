import { PIN_NAME_GAP, element, fit, num, pinNameInner, pinNameRow, pinNameWidth, svgText } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Band, Layout } from '../model/layout.ts';
import type { DeviceSpec, FenceError, Point, Spelling } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 基板の外の機器。**帯の中に箱として並べ、ピンを基板の側へ出す。**
 *
 * 盤面に載らないものを基板の上に描くと、挿す場所があるように見えてしまう。
 * 帯を分けておけば「これは外の物」が形で分かる。
 */

/** 箱どうしの間。 */
const GAP = 12;
/** 箱の外へ出るピンの長さ。 */
const LEG = 10;
/** ピンの名前を書く高さ。ピンの先の外側に書く。 */
const PIN_LABEL = 15;

/**
 * ピンの名前の大きさ。**機器の名前より大きく書く。**
 * 配線をどの端子へ引くかを読むのはこの字で、`+` `-` `1` `2` のように短いので、
 * 基板の字と同じ大きさだと線と穴に埋もれる。
 */
const PIN_NAME_SCALE = 1.35;
/**
 * ピンの名前を書くときの字の大きさ。**箱の幅を決めるのに要る**ので、
 * テーマを渡されない置き場所の計算でも同じ値を使えるように定数で持つ。
 */
const PIN_NAME_SIZE = 9 * PIN_NAME_SCALE;
/**
 * ピンの名前をこれより小さくしない。ピンが穴の格子に載る (番地で置いた) 機器で、
 * これでも隣の名前と触れるなら 2 段に互い違いに置く。
 */
const MIN_PIN_NAME = 6.5;
/** 2 段に置くときの段の間 (字の大きさに対する比)。 */
const STAGGER_LINE = 1.2;
/** ピンの名前を箱の縁からこれだけ内に収める。 */
const NAME_INSET = 3;
/** ピン 1 本ぶんの幅。名前が並ぶので穴のピッチより広く取る。 */
const PIN_GAP = 22;
/** 箱の最小の幅。ピンが 1〜2 本でも名前が入るように。 */
const MIN_WIDTH = 80;
/** 番地で置いた機器の箱の高さ。帯に並べたものと同じ背丈にする。 */
const DEVICE_BOX_HEIGHT = 34;
/** ピン 1 本ぶんがこれより狭くなったら、名前は読めない。 */
const CRAMPED = PIN_GAP / 2;

/**
 * 箱の幅。**ピンの名前が並ぶ幅から決める。**
 *
 * ピンの数だけで決めていたころは `sig gnd` のような名前が隣とくっついて
 * 1 つの綴りに読めた。どの端子へ引く線なのかを読むのはこの名前なので、
 * 名前が入る幅を先に取る。
 */
const boxWidth = (device: DeviceSpec, inBand = false): number => {
  const widest = device.pins.reduce((most, name) => Math.max(most, pinNameWidth(name)), 0);
  const pitch = Math.max(PIN_GAP, widest * PIN_NAME_SIZE + PIN_NAME_GAP);
  // 帯に並べたピンは箱の幅を (本数 + 1) で割った所に来るので、その間で名前が入るように。
  // 番地で置いたピンは穴の格子に載るので、箱を広げてもピンの間は変わらない。
  return Math.max(pitch * (device.pins.length + (inBand ? 1 : 0)), MIN_WIDTH);
};

export type PlacedDevice = {
  readonly device: DeviceSpec;
  readonly box: Band;
  /** ピンの名前 → 基板の側の端。配線はここへつながる。 */
  readonly pins: ReadonlyMap<string, Point>;
};

export type DeviceLayout = {
  readonly placed: readonly PlacedDevice[];
  /** 詰め込みすぎて読めなくなったときの言い分。**黙って描かない。** */
  readonly notices: readonly FenceError[];
};

/**
 * 番地で置いた機器の箱が、基板にどれだけ食い込むか (縦の量。食い込まなければ 0)。
 * 基板の上に置いた箱は下端を、下に置いた箱は上端を見る。
 */
function coverOf(box: Band, layout: Layout, above: boolean): number {
  const plate = layout.board;
  const across = box.x < plate.x + plate.width && box.x + box.width > plate.x;
  if (!across) return 0;
  return Math.max(0, above ? box.y + box.height - plate.y : plate.y + plate.height - box.y);
}

/**
 * 帯の中に機器を横へ並べる。**幅はピンの数で決まる** — ピンを等間隔に置ける
 * 幅が要るので、ピンの多い機器ほど広くなる。
 */
export function layoutDevices(devices: readonly DeviceSpec[], layout: Layout, spelling: Spelling): DeviceLayout {
  const placed: PlacedDevice[] = [];
  const notices: FenceError[] = [];

  // **番地で置いた機器は帯に並べない。** 書いた場所へそのまま置く
  // (箱の左上がその番地。ピンの位置は箱から決まる)。
  for (const device of devices) {
    if (device.where === null) continue;
    const address = parseAddress(device.where, spelling);
    if (address === null) continue;

    const at = layout.point(address);
    const width = boxWidth(device);
    const height = DEVICE_BOX_HEIGHT;
    // 基板より上にあるならピンは下へ、下にあるならピンは上へ (基板の側へ出す)。
    const above = at.y < layout.board.y + layout.board.height / 2;

    // **ピンは穴の格子に載せる。** 1 本目が書いた番地の列に来て、そこから 1 穴ずつ。
    // こうすると「そのピンのいちばん近い穴」が迷いなく決まり、配線を穴の番地で
    // 書ける (帯に並べたときは箱の幅で割るので、穴とは揃わない)。
    const columns = device.pins.map((_, pin) => layout.colX(address.col + pin));
    const first = columns[0] ?? at.x;
    const last = columns[columns.length - 1] ?? at.x;
    const box: Band = { x: (first + last) / 2 - width / 2, y: at.y, width, height };
    const tip = above ? box.y + box.height + LEG : box.y - LEG;
    const cover = coverOf(box, layout, above);
    if (cover > 0) {
      // **箱の左上がその番地**なので、基板の上に置いた箱は下へ伸びる。`-a` や `0` に
      // 置くと基板の縁と列の名前に被るが、書いた場所なので動かさずに言う。
      const rows = Math.ceil(cover / layout.pitch);
      const clear = formatAddress({ row: address.row + (above ? -rows : rows), col: address.col }, spelling);
      notices.push(notice(
        `${safeToken(device.id)} の箱が基板に重なっています (${safeToken(device.where)})。`
        + `${clear} から${above ? '上' : '下'}に置くと基板を避けられます`,
        device.line,
      ));
    }
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

    const wanted = here.map((device) => boxWidth(device, true));
    const asked = wanted.reduce((sum, width) => sum + width, 0) + GAP * (here.length - 1);

    // **帯からはみ出させない。** viewBox の外に描いた箱は黙って切れるので、
    // 入る幅まで一様に詰める (基板の穴数と機器の数は釣り合っていないことがある)。
    const room = Math.max(0, band.width - GAP * (here.length - 1));
    const squeeze = asked > band.width ? room / (asked - GAP * (here.length - 1)) : 1;
    const widths = wanted.map((width) => width * squeeze);
    const total = widths.reduce((sum, width) => sum + width, 0) + GAP * (here.length - 1);
    let x = band.x + Math.max(0, (band.width - total) / 2);

    // 詰めた結果、ピンの名前が読めない幅になったら言う。読めない図を黙って出さない。
    for (const [index, device] of here.entries()) {
      if ((widths[index] as number) / device.pins.length >= CRAMPED) continue;
      notices.push(notice(
        `${safeToken(device.id)} のピンが基板の幅に収まりません`
        + ` (${device.pins.length} 本。基板を広げるか、機器を上下に分けます)`,
        device.line,
      ));
    }

    // 帯の高さは箱と、基板の側へ出るピンと、その名前で分け合う。
    const height = band.height - LEG - PIN_LABEL;

    for (const [index, device] of here.entries()) {
      const width = widths[index] as number;
      // ピンは基板の側へ出す (上の帯なら下、下の帯なら上)。
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

  // ピンは箱の縁から出る。**名前は箱の内側、ピンの付け根**に書く — 外側に書くと
  // 基板の列番号や配線に重なり、どのピンの名前なのかも遠くなる。
  const edge = top ? box.y + box.height : box.y;
  const size = theme.metrics.textSize;
  // **隣の名前と触れない大きさまで**縮め、それでも触れるなら 2 段に互い違いに置く。
  // ピンが穴の格子に載る (番地で置いた) 機器では間隔が基板のピッチで決まるので、
  // 箱を広げても名前の場所は増えない (PIR の `GND VCC OUT` が `GNDVCCOUT` と読めた)。
  const entries = [...placed.pins.entries()];
  const xs = entries.map(([, point]) => point.x);
  const names = entries.map(([name]) => name);
  const within = { left: box.x + NAME_INSET, right: box.x + box.width - NAME_INSET };
  const oneRow = pinNameRow(xs, names, { largest: size * PIN_NAME_SCALE, smallest: Math.min(size, MIN_PIN_NAME), within });
  // 2 段にするときは基板の字の大きさまで (箱の背丈に 2 段と機器の名前を収める)。
  const nameRow = oneRow.staggered ? pinNameRow(xs, names, {
    largest: size,
    smallest: Math.min(size, MIN_PIN_NAME),
    within,
  }) : oneRow;
  const nameSize = nameRow.size;
  const nameY = top ? edge - 5 : edge + nameSize;
  const inward = (top ? -1 : 1) * nameSize * STAGGER_LINE;
  const legs = entries
    .map(([name, point], index) => element('line', {
      x1: num(point.x), y1: num(edge), x2: num(point.x), y2: num(point.y),
      stroke: theme.palette.lead, 'stroke-width': 2, 'stroke-linecap': 'round',
    }) + svgText(point.x, nameY + (nameRow.staggered && pinNameInner(xs, index) ? inward : 0), name, {
      fill: theme.palette.caption,
      'font-size': num(nameSize),
    }))
    .join('');

  // 機器の名前はピンの名前とぶつからない側へ寄せる (上の機器なら箱の上寄り)。
  const label = fit(device.label, box.width / size);
  // 名前が 2 段なら、機器の名前は箱の奥の縁まで下げる (真ん中だと奥の段に重なる)。
  const captionY = nameRow.staggered
    ? (top ? box.y + size * 0.65 : box.y + box.height - size * 0.65)
    : box.y + box.height / 2 + (top ? -size * 0.5 : size * 0.9);
  const caption = svgText(box.x + box.width / 2, captionY, label, {
    fill: theme.palette.caption,
    'font-size': num(size),
    'dominant-baseline': 'middle',
  });

  return `${body}${legs}${caption}`;
}

/**
 * 基板の外の機器を全部。`edit` のときは**掴むための印**で 1 つずつ包む
 * (部品と同じ `data-part`。実機で「基板外の部品もマウスコマンドの対象にする」)。
 * 既定では包まない — 貼る図は 1 バイトも変わらない。
 */
export const renderDevices = (placed: readonly PlacedDevice[], theme: Theme, edit = false): string =>
  placed
    .map((one) => {
      const drawn = renderDevice(one, theme);
      return edit ? element('g', { class: 'cf-chip', 'data-part': one.device.id }, drawn) : drawn;
    })
    .join('');

/**
 * 番地で置いた機器が、基板の上と下へどれだけはみ出すか。
 *
 * **基板からの距離は番地で決まっていて、基板がどこに来ても変わらない**ので、
 * 仮に組んだ寸法で一度測れば、その値をそのまま `createLayout` へ渡せる
 * (測る → 空ける → 測り直す、の堂々巡りにならない)。
 */
export function deviceOverhang(
  devices: readonly DeviceSpec[],
  layout: Layout,
  spelling: Spelling,
): { readonly above: number; readonly below: number } {
  let above = 0;
  let below = 0;

  for (const device of devices) {
    if (device.where === null) continue;
    const address = parseAddress(device.where, spelling);
    if (address === null) continue;

    const at = layout.point(address);
    // ピンとピンの名前のぶんも数える (箱だけ空けると名前が基板に重なる)。
    above = Math.max(above, layout.board.y - at.y);
    below = Math.max(below, at.y + DEVICE_BOX_HEIGHT + LEG + PIN_LABEL - (layout.board.y + layout.board.height));
  }

  return { above: Math.max(0, above), below: Math.max(0, below) };
}
