import { notice } from '../errors.ts';
import { HAND_CUT } from '../limits.ts';
import { hasFrontGround } from '../model/board.ts';
import { formatMm, formatPoint } from '../model/point.ts';
import { GND } from '../geometry/islands.ts';
import type { Island } from '../geometry/islands.ts';
import type { Coupling } from '../geometry/coupling.ts';
import { SMA, place } from '../parts/footprint.ts';
import type { Footprint } from '../parts/footprint.ts';
import type { Jumper, PinLanding } from '../wiring/wiring.ts';
import type { Board, CopperSpec, FenceError, Mm } from '../types.ts';

/**
 * ERC — **図のとおりに切って組んでも動かない所**。perfboard の 3 つと同じ型の 4 つ:
 *
 * 1. 銅に乗っていない足 (チップの端・SMA の芯・SOT の足)。**SMA の中心導体が
 *    表の地に触れる**のもここ (縁まで島が伸びていないと、芯が地に載る)
 * 2. 同じ部品の 2 本の足が同じ銅に乗っている (切れ目が無い)
 * 3. ジャンパの端が銅に乗っていない
 * 4. 手で切れない細さ (幅・溝・結合の隙間が 0.3mm 未満)
 *
 * **4 はエッチングなら正しい図**なので、止めずにお知らせとして言う。
 * どれも `notices` と分けて返す (editor の「検査 N」の釦の向こうへ畳む)。
 */
export type ErcInput = {
  readonly board: Board;
  readonly copper: readonly CopperSpec[];
  readonly footprints: readonly Footprint[];
  readonly landings: readonly PinLanding[];
  readonly jumpers: readonly Jumper[];
  readonly islands: readonly Island[];
  readonly couplings: readonly Coupling[];
  /** 点の導通グループ (島・地・どこでもない)。 */
  readonly stripAt: (point: Mm) => string | null;
};

const nameOf = (islands: readonly Island[], strip: string): string =>
  (strip === GND ? 'GND' : islands.find((island) => island.strip === strip)?.name ?? strip);

export function checkErc(input: ErcInput): FenceError[] {
  const said: FenceError[] = [];
  const lineOf = new Map(input.footprints.map((footprint) => [footprint.part.id, footprint.part.line]));

  // 1. 銅に乗っていない足。
  for (const landing of input.landings) {
    for (const point of landing.points) {
      if (point.strip !== null) continue;
      said.push(notice(
        `${landing.part} の ${landing.pin} 番の足 (${formatPoint(point.at)}) の下に銅がありません`,
        lineOf.get(landing.part) ?? null,
        landing.part,
      ));
    }
  }

  // 1 の続き — SMA の中心導体は縁から板に載る。**その下に表の地があれば短絡**。
  if (hasFrontGround(input.board)) {
    for (const footprint of input.footprints) {
      if (footprint.part.kind !== 'edge') continue;
      const touched = [0.05, SMA.pinReach / 2, SMA.pinReach]
        .map((u) => place(footprint.center, footprint.angle, false, u, 0))
        .find((point) => input.stripAt(point) === GND);
      if (touched === undefined) continue;
      said.push(notice(
        `${footprint.part.id} の中心導体 (${formatPoint(touched)}) が表の地に触れています (縁まで島か線路を伸ばします)`,
        footprint.part.line,
        footprint.part.id,
      ));
    }
  }

  // 2. 同じ部品の足が同じ銅に乗っている。**箱は見ない** — モジュールの GND の足が
  //    同じ島に並ぶのは正しい図 (SAW の 2 本の GND など)。
  for (const footprint of input.footprints) {
    if (footprint.part.kind === 'box') continue;
    const mine = input.landings.filter((landing) => landing.part === footprint.part.id && !landing.shell);
    for (let i = 0; i < mine.length; i += 1) {
      for (let j = i + 1; j < mine.length; j += 1) {
        const [a, b] = [mine[i], mine[j]];
        if (a === undefined || b === undefined || a.strip !== b.strip || a.strip.startsWith('pin:')) continue;
        if (a.strip === GND && mine.length > 2) continue;
        said.push(notice(
          `${footprint.part.id} の ${a.pin} 番と ${b.pin} 番が同じ銅 (${nameOf(input.islands, a.strip)}) に乗っています`
            + (footprint.part.kind === 'chip' ? ' (線路の上に置くと切れ目ができます。向きを確かめます)' : ''),
          footprint.part.line,
          footprint.part.id,
        ));
      }
    }
  }

  // 3. ジャンパの端。
  for (const jumper of input.jumpers) {
    for (const [end, strip] of [[jumper.from, jumper.fromStrip], [jumper.to, jumper.toStrip]] as const) {
      if (strip !== null) continue;
      said.push(notice(`配線の端 (${formatPoint(end)}) の下に銅がありません`, jumper.line, formatPoint(end)));
    }
  }

  // 4. 手で切れない細さ。
  const frontGround = hasFrontGround(input.board);
  for (const spec of input.copper) {
    if (spec.kind !== 'line') continue;
    if (spec.width < HAND_CUT) {
      said.push(notice(
        `${spec.id} の幅 ${formatMm(spec.width)}mm は手で残すには細すぎます (${HAND_CUT}mm から。エッチングなら描けます)`,
        spec.line,
        spec.id,
      ));
    }
    const gap = spec.gap ?? input.board.cut;
    if (frontGround && gap < HAND_CUT) {
      said.push(notice(
        `${spec.id} の溝 ${formatMm(gap)}mm は手で切るには細すぎます (${HAND_CUT}mm から)`,
        spec.line,
        spec.id,
      ));
    }
  }
  for (const coupling of input.couplings) {
    if (coupling.spacing >= HAND_CUT) continue;
    said.push(notice(
      `${coupling.a} と ${coupling.b} の隙間 ${formatMm(coupling.spacing)}mm は手で切るには細すぎます (${HAND_CUT}mm から)`,
      coupling.line,
      coupling.b,
    ));
  }
  return said;
}
