import { fit, num, svgText } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import type { Theme } from './theme.ts';

/** 題の字の大きさ (本文に対する比)。 */
const TITLE_SCALE = 1.5;

/**
 * 図の題。**板の上**に置く。
 *
 * 図に題を付けられると、文章から「図02 を直して」と指せる。48 / 49 と同じ
 * 作法で、examples と文法リファレンスはどの図にも `title: 図NN ...` を書く。
 */
export function renderTitle(title: string | null, layout: Layout, theme: Theme): string {
  if (title === null) return '';

  const size = theme.metrics.textSize * TITLE_SCALE;
  // 画布からはみ出した字は**黙って消える**ので、必ず幅で切る。
  const text = fit(clampText(title, LIMITS.titleLength), (layout.width - layout.board.x * 2) / size);

  return svgText(layout.board.x, layout.titleBaseline, text, {
    anchor: 'start',
    fill: theme.palette.caption,
    'font-size': num(size),
    'font-weight': 600,
  });
}
