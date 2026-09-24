import { fit, num, svgText } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../layout/figure.ts';
import type { Theme } from './theme.ts';

const TITLE_SCALE = 1.5;
/** 画布の左の余白 (layout の OUTER と同じ)。 */
const LEFT = 14;

/** 図の題。文章から「図02 を直して」と指せるように (板のフェンスと同じ作法)。 */
export function renderTitle(title: string | null, layout: Layout, theme: Theme): string {
  if (title === null) return '';
  const size = theme.metrics.textSize * TITLE_SCALE;
  const text = fit(clampText(title, LIMITS.titleLength), (layout.width - LEFT * 2) / size);
  return svgText(LEFT, layout.titleBaseline, text, {
    anchor: 'start', fill: theme.palette.caption, 'font-size': num(size), 'font-weight': 600,
  });
}
