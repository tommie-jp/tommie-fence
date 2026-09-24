import { fit, num, svgText } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import type { Theme } from './theme.ts';

const TITLE_SCALE = 1.5;

/**
 * 題の字の種類。**欧文のフォントを先に並べる** — 題は太字で、`system-ui` だけだと
 * Windows では日本語の UI フォントの太字が選ばれ、`50Ω` の Ω が別の字に化けた
 * (実機で「図01 50и」)。欧文フォントは Ω と数字を持ち、仮名と漢字は後ろの
 * 日本語フォントへ 1 字ずつ落ちる。
 */
const TITLE_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans CJK JP', sans-serif";
/** 画布の左の余白 (layout の OUTER と同じ)。題は板ではなく画布の左に揃える (左の SMA に引きずられない)。 */
const LEFT = 14;

/** 図の題。文章から「図02 を直して」と指せるように (3 つのフェンスと同じ作法)。 */
export function renderTitle(title: string | null, layout: Layout, theme: Theme): string {
  if (title === null) return '';
  const size = theme.metrics.textSize * TITLE_SCALE;
  const text = fit(clampText(title, LIMITS.titleLength), (layout.width - LEFT * 2) / size);
  return svgText(LEFT, layout.titleBaseline, text, {
    anchor: 'start', fill: theme.palette.caption, 'font-size': num(size), 'font-weight': 600,
    'font-family': TITLE_FAMILY,
  });
}
