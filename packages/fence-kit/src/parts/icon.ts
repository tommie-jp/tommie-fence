import { bodySize, drawBody, hasBody } from './bodies.ts';
import type { BodyInk, BodyPart } from './bodies.ts';
import { drawPackage, packageHalfWidth, packageReach } from './packages.ts';
import { element } from '../markup.ts';
import { num } from '../svg.ts';

/**
 * パレットに出す部品の絵。**実物の姿をそのまま置く。**
 *
 * 以前は「小さな枠に落とすと胴の色と帯の位置が読めない別物になる」として
 * 絵を出していなかったが、**胴はもともと小さい** (抵抗で 38 × 13) ので、
 * 縮めずにそのまま置ける。名前の前に姿が出ると、名前を覚えていなくても選べる
 * (実機で頼まれて足した)。
 *
 * **図と同じ関数で描く。** パレット用に別の絵を持つと、姿を直したときに
 * 片方だけ古くなる。
 */

/** 絵の縦幅。行の高さに収まるところで、いちばん大きい胴 (立てた缶) が入る大きさ。 */
const HEIGHT = 26;

/** 2 本足を描くときの足の間隔。実物の既定の間隔に近く、帯が全部見える長さ。 */
const SPAN = 40;

const partOf = (type: string, variant: string | null): BodyPart =>
  ({ type, variant, value: null, pins: [{ name: '' }, { name: '' }] });

/**
 * その種類の絵 (SVG 1 つ)。描き方を知らない種類は null
 * (名前だけの行になる — 絵が無いことより、行が消えるほうが困る)。
 */
export function partIcon(
  type: string,
  options: { readonly variant?: string | null; readonly ink?: BodyInk; readonly plate?: string; readonly chip?: string } = {},
): string | null {
  const part = partOf(type, options.variant ?? null);
  const ink = options.ink;

  if (hasBody(type)) {
    const size = bodySize(part, SPAN);
    const width = Math.max(size.width + 12, 28);
    const leads = element('line', {
      x1: num(-width / 2), y1: 0, x2: num(width / 2), y2: 0, stroke: '#9aa0a6', 'stroke-width': 1.6,
    });
    return frame(width, leads + drawBody(part, SPAN, ink));
  }

  const reach = packageReach(part, 18);
  const halfWidth = packageHalfWidth(part, 18);
  if (!isPackage(type)) return null;
  return frame(
    Math.max(halfWidth * 2 + 8, 28),
    drawPackage(part, {
      cx: 0, cy: 0, reach, halfWidth, side: 1,
      plate: options.plate ?? '#2c7a4b', chipBody: options.chip ?? '#2b2f36',
    }, ink),
  );
}

/** 足の位置を形が決める種類は、パレットでは箱の絵になる (姿を持たない)。 */
const PACKAGED = new Set(['transistor', 'potentiometer', 'slide-switch', 'thyristor', 'triac', 'regulator']);

const isPackage = (type: string): boolean => PACKAGED.has(type);

/** 絵を載せる小さな画布。**原点が真ん中**なので、胴の座標をそのまま使える。 */
const frame = (width: number, drawn: string): string =>
  element('svg', {
    class: 'cf-icon',
    viewBox: `${num(-width / 2)} ${num(-HEIGHT / 2)} ${num(width)} ${num(HEIGHT)}`,
    width: num(width), height: num(HEIGHT), 'aria-hidden': 'true',
  }, drawn);
