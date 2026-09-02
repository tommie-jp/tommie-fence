import { computeNets } from 'fence-kit';
import type { Net, NetMember } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { holeStrip, offBoardReason } from '../model/board.ts';
import type {
  Address, Board, DeviceSpec, FenceError, PlacedPart, RoutedWire, StripId, WireSpec,
} from '../types.ts';

export type Wiring = {
  readonly wires: readonly RoutedWire[];
  /** 板の外の機器につながる端。導通に効く。 */
  readonly deviceLinks: readonly (readonly [StripId, StripId])[];
  /**
   * 機器の足と穴を結ぶ配線。**図に線を引くために持つ** — どの穴へ行くのかが
   * 図に出ないと、電池の線を挿す先が読む人に分からない (breadboard も引く)。
   * 機器どうしを結んだ配線は板に触れないので、ここには入らない。
   */
  readonly deviceWires: readonly DeviceWire[];
  readonly errors: readonly FenceError[];
};

/** 機器の足 1 つと、板の穴 1 つを結ぶ配線。 */
export type DeviceWire = {
  readonly device: string;
  readonly pin: string;
  readonly hole: Address;
  readonly color: string | null;
  readonly line: number | null;
};

/** 板の外の機器の足の導通グループ。**穴とは別の名前空間**にする。 */
export const devicePinStrip = (id: string, pin: string): StripId => `pin:${id}.${pin}`;

// `BAT.+` の形。穴の番地に `.` は現れないので、綴りだけで分かれる。
const PIN_REF = /^([\w-]+)\.(\S+)$/;

/**
 * 配線の端を番地に直す。名前 (`points:` で付けたもの) もここで引く。
 *
 * **読めた配線は捨てない。** 1 本落ちたら図全体が消えるより、引ける分を引いて
 * 「ここが読めなかった」と言うほうが直しやすい。
 */
export function resolveWires(
  specs: readonly WireSpec[],
  points: ReadonlyMap<string, Address>,
  board: Board,
  devices: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Wiring {
  const wires: RoutedWire[] = [];
  const deviceLinks: (readonly [StripId, StripId])[] = [];
  const deviceWires: DeviceWire[] = [];
  const errors: FenceError[] = [];

  /**
   * `BAT.+` を機器の足として読む。**機器の足でなければ undefined**、
   * 機器の足のつもりだが引けなければ null (理由は帯に出す)。
   *
   * 点は番地にも `points:` の名前にも現れないので、`.` を含む綴りは
   * 機器の足のつもりしかありえない。**番地として読めないと言って返さない** —
   * 名前を間違えた人が、番地の話をされて次に何をすべきか分からなくなる。
   */
  /** `BAT.+` の綴りを ID と足に割る。機器の足でなければ null。 */
  const pinParts = (written: string): { readonly id: string; readonly pin: string } | null => {
    const found = PIN_REF.exec(written);
    if (!found) return null;
    const [, id = '', pin = ''] = found;
    return { id, pin };
  };

  const devicePin = (written: string, line: number | null): StripId | null | undefined => {
    const found = PIN_REF.exec(written);
    if (!found) return undefined;
    const [, id = '', pin = ''] = found;
    const pins = devices.get(id);
    if (!pins) {
      // **書かれた綴りごと名指す。** 点の前だけを返すと、`1.5` のような
      // 書き間違いに対して「そんな機器はありません: 1」と、書いていない語を指す。
      errors.push(fenceError(
        `${safeToken(written)} を機器の足として読みました。そんな機器はありません: ${safeToken(id)}`,
        line,
        written,
      ));
      return null;
    }
    if (!pins.has(pin)) {
      errors.push(fenceError(
        `${safeToken(id)} に ${safeToken(pin)} という足はありません (${[...pins].map(safeToken).join(' / ')})`,
        line,
        written,
      ));
      return null;
    }
    return devicePinStrip(id, pin);
  };

  const resolve = (written: string, line: number | null): Address | null => {
    const named = points.get(written);
    if (named !== undefined) return named;

    const address = parseAddress(written);
    if (address === null) {
      errors.push(fenceError(
        `穴の番地としても points: の名前としても読めません: ${safeToken(written)}`,
        line,
        written,
      ));
      return null;
    }
    const reason = offBoardReason(board, address);
    if (reason !== null) {
      errors.push(fenceError(reason, line, written));
      return null;
    }
    return address;
  };

  /** 板の上の端を導通グループに直す。読めなければ null。 */
  const holeStripOf = (written: string, line: number | null): StripId | null => {
    const address = resolve(written, line);
    return address === null ? null : holeStrip(address);
  };

  for (const spec of specs) {
    // **機器へつなぐぶんも数える。** 線を引かないだけで導通は増えるので、
    // `wires` だけを数えると上限を素通りして `computeNets` に無限に積める。
    if (wires.length + deviceLinks.length >= LIMITS.wires) {
      errors.push(fenceError(`配線が多すぎます (${LIMITS.wires} 本まで)`, spec.line));
      break;
    }

    // **機器の足は板の上に無い。** それでも穴との間には線を引く — どの穴へ
    // 行くのかが図に出ないと、電池の線を挿す先が読む人に分からない。
    // 端は 1 つずつ見る — 両端まとめて見ると、同じ報告が 1 行に 2 度出て、
    // 帯の打ち切り (8 件) で本物の報告を押し出す。
    const fromPin = devicePin(spec.from, spec.line);
    if (fromPin === null) continue;
    const toPin = devicePin(spec.to, spec.line);
    if (toPin === null) continue;

    if (fromPin !== undefined || toPin !== undefined) {
      const from = fromPin ?? holeStripOf(spec.from, spec.line);
      if (from === null) continue;
      const to = toPin ?? holeStripOf(spec.to, spec.line);
      if (to === null) continue;

      if (from === to) {
        // 板の上の配線と同じ。導通を何も足さず、図にも何も出ない。
        errors.push(fenceError(`配線の両端が同じところです (${safeToken(spec.from)})`, spec.line));
        continue;
      }
      deviceLinks.push([from, to]);

      // 片端だけが機器の足なら、その足と穴を結ぶ線を引く。
      // **両端とも機器なら板に触れない**ので線は無く、書いた色も図に出ない。
      const fromParts = fromPin === undefined ? null : pinParts(spec.from);
      const toParts = toPin === undefined ? null : pinParts(spec.to);
      const pin = fromParts ?? toParts;
      const holeWritten = fromParts === null ? spec.from : spec.to;

      if (pin !== null && (fromParts === null || toParts === null)) {
        const hole = resolve(holeWritten, spec.line);
        // ここへ来た時点で穴は読めている (上の `holeStripOf` が通っている)。
        if (hole !== null) {
          deviceWires.push({ device: pin.id, pin: pin.pin, hole, color: spec.color, line: spec.line });
        }
      } else if (spec.color !== null) {
        // **書いた色が黙って消えない**ようにする。機器どうしを結んだ配線は
        // 板に触れないので図に線が無く、色の指定は効かない。
        errors.push(notice(
          `機器どうしを結ぶ配線は板に触れないので、色 (${safeToken(spec.color)}) は図に出ません`,
          spec.line,
        ));
      }
      continue;
    }

    const from = resolve(spec.from, spec.line);
    const to = resolve(spec.to, spec.line);
    if (from === null || to === null) continue;

    if (holeStrip(from) === holeStrip(to)) {
      // 同じ穴を結ぶ線は導通を何も足さず、図の上では点にしかならない。
      errors.push(fenceError(`配線の両端が同じ穴です (${formatAddress(from)})`, spec.line));
      continue;
    }
    wires.push({ from, to, color: spec.color, line: spec.line });
  }

  return { wires, deviceLinks, deviceWires, errors };
}

/**
 * 足の名前。2 本足は 1 / 2 の順で、書いた順そのまま。
 *
 * **ネットリストと ERC で同じものを使う。** 別々に持つと、片方を直したときに
 * 突き合わせが黙って外れ、ERC が何も言わなくなる (返るのは空なのでテストも通る)。
 */
export const pinRef = (part: PlacedPart, index: number): string => `${part.id}.${index + 1}`;

const membersOf = (parts: readonly PlacedPart[]): NetMember[] =>
  parts.flatMap((part) => part.pins.map((pin, index) => ({ ref: pinRef(part, index), strip: pin.strip })));

/**
 * ネットリスト。**穴は 1 つずつ独立している**ので、つなぐのは配線だけ。
 * ブレッドボードは列の 5 穴が最初から導通していて、同じ列に挿すだけで
 * 1 つのネットになるが、ここでは配線を書かないと何もつながらない。
 *
 * 部品そのものはネットとネットの間の枝なので、足どうしはつながない。
 */
export const netlistOf = (
  parts: readonly PlacedPart[],
  wires: readonly RoutedWire[],
  points: readonly (readonly [Address, string])[],
  devices: readonly DeviceSpec[] = [],
  deviceLinks: readonly (readonly [StripId, StripId])[] = [],
): Net[] =>
  computeNets({
    members: [
      ...membersOf(parts),
      // 機器の足も回路の端子。板の上に無いだけで、ネットには乗る。
      ...devices.flatMap((device) => device.pins.map((pin) => ({
        ref: `${device.id}.${pin}`,
        strip: devicePinStrip(device.id, pin),
      }))),
    ],
    links: [
      ...wires.map((wire) => [holeStrip(wire.from), holeStrip(wire.to)] as const),
      ...deviceLinks,
    ],
    names: points.map(([address, name]) => [holeStrip(address), name] as const),
  });

export type { Net, StripId };
