import { fit, num, svgText, textWidth } from 'fence-kit';
import { colorValue } from '../color.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { Band } from '../model/layout.ts';
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
 */

/** 等幅で書く。図のほかの字とは別の family を使う (桁が揃わないと写しにくい)。 */
const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";

/**
 * 等幅の 1 字は、比例フォント向けの見積もり (`textWidth`) より広い。
 * **全角に合わせて 1.2 倍**で数える (等幅の全角は字の大きさそのまま。
 * `textWidth` は全角を 1.0 と見積もる)。英数字はこれで 0.66 と多めに出るが、
 * **広く見積もるほうが安全** — 多ければ帯が少し広いだけ、少なければ
 * 画布からはみ出して黙って切れる。幅を測るときも切るときも同じ数を使う。
 */
const MONO_WIDEN = 1.2;

/** 行送り (字の大きさに対する倍率)。 */
const LEADING = 1.15;

/** 帯の上下に入れる余白。 */
const PAD = 8;

/** フェンスの囲みも書き出す。囲みごと写せば、そのまま動くものになる。 */
const FENCE = '```perfboard';

/**
 * 図に書き出すフェンスの中身。**長すぎるときは切るが、切ったことを図に書く** —
 * 黙って落とすと、写した人は足りないことに気づけない。
 */
export function sourceListing(source: string): readonly string[] {
  const lines = source.split('\n');
  // 末尾の空行はフェンスに書かれていたものではない (改行の揃えで増える)。
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();

  // 行数だけでなく**1 行の長さも止める**。長い 1 行は画布をいくらでも伸ばせる。
  const kept = lines.slice(0, LIMITS.sourceLines).map((line) => clampText(line, LIMITS.sourceLineLength));
  if (lines.length > kept.length) kept.push(`… ほかに ${lines.length - kept.length} 行`);
  return [FENCE, ...kept, '```'];
}

/**
 * 書き出しが要る大きさ。**板の幅には合わせない** — 板が細いフェンスでも
 * 書き出しは同じ長さなので、板に合わせると `…` だらけになる。
 * 画布を広げる判断は `createLayout` がこの値を見て行う。
 */
export function sourceBandSize(
  lines: readonly string[],
  theme: Theme,
): { readonly width: number; readonly height: number } {
  if (lines.length === 0) return { width: 0, height: 0 };

  const size = theme.metrics.textSize;
  const widest = Math.max(...lines.map((line) => textWidth(line)));
  return {
    // **切り上げる。** 帯の幅から limit を割り戻すので、端数のままだと
    // 丸め誤差で**いま測った当の行**が `…` に切られる。
    width: Math.ceil(widest * size * MONO_WIDEN),
    height: size * LEADING * (lines.length - 1) + size + PAD * 2,
  };
}

/**
 * 帯に 1 行ずつ書く。色を書かなかったときは**図の文字色に従う** —
 * 色見本や白黒 (`mono`) の図で、書き出しだけが浮かないようにするため。
 */
export function renderSourceListing(
  lines: readonly string[],
  band: Band,
  theme: Theme,
  color: string | null,
): string {
  if (lines.length === 0) return '';

  const size = theme.metrics.textSize;
  const step = size * LEADING;
  const fill = (color === null ? null : colorValue(color)) ?? theme.palette.caption;
  // 帯は書き出しに合わせて広げてあるので、ここで切れるのは桁外れに長い行だけ。
  const limit = band.width / (size * MONO_WIDEN);

  return lines
    .map((line, index) =>
      svgText(band.x, band.y + PAD + size * 0.8 + step * index, fit(line, limit), {
        anchor: 'start',
        fill,
        'font-size': num(size),
        'font-family': MONO_FAMILY,
        // 字下げは YAML の意味そのものなので、空白を詰めさせない。
        'xml:space': 'preserve',
      }),
    )
    .join('');
}
