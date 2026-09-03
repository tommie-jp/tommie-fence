import { keptSourceLines } from 'fence-kit';
import { colorValue } from '../color.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Band } from '../model/layout.ts';
import { monoBandSize, renderMonoBand } from './monoBand.ts';
import type { Theme } from './theme.ts';

/**
 * 書き出し (`- source`)。**そのフェンスの中身を図の下に写す。**
 * 図だけを貼られた人が、同じ図をもう一度出せるようにするためのもの。
 *
 * **板の上には重ねない。** フェンス全体は板より高いことが普通で、重ねると
 * 穴も部品も読めなくなる。板の下に自分の帯を持つ (`layout.sourceBand`)。
 *
 * **行番号は添えない。** 値打ちは「見たままを書き写せる」ことなので、
 * 番号が混ざると写したものが動かない。
 *
 * 帯の測り方と描き方は部品表と同じなので `monoBand.ts` にある。
 */

/** フェンスの囲みも書き出す。囲みごと写せば、そのまま動くものになる。 */
const FENCE = '```perfboard';

/**
 * 図に書き出すフェンスの中身。**長すぎるときは切るが、切ったことを図に書く** —
 * 黙って落とすと、写した人は足りないことに気づけない。
 */
export function sourceListing(source: string): readonly string[] {
  // 切り方は fence-kit にある (3 つのフェンスで同じもの)。
  // **行数だけでなく 1 行の長さも止める** — 長い 1 行は画布をいくらでも伸ばせる。
  const kept = keptSourceLines(source, LIMITS.sourceLines)
    .map((line) => clampText(line, LIMITS.sourceLineLength));
  return [FENCE, ...kept, '```'];
}

export const sourceBandSize = monoBandSize;

export function renderSourceListing(
  lines: readonly string[],
  band: Band,
  theme: Theme,
  color: string | null,
): string {
  const fill = (color === null ? null : colorValue(color)) ?? theme.palette.caption;
  return renderMonoBand(lines, band, theme, fill);
}
