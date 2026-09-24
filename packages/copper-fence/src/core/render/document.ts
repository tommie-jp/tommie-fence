import { element, num, svgText } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { STAMP_TEXT, VERSION } from '../version.ts';
import type { Theme } from './theme.ts';

/**
 * 図の外側。**それ自体で完結した SVG** — 外部リソースもスクリプトも参照しない。
 * 版を根に書いておくと、貼った `.svg` を後から見てどの版が描いたかが分かる。
 */
export type DocumentOptions = {
  readonly theme: Theme;
  readonly width?: number | null;
  readonly stamp?: boolean;
};

const STAMP_INSET = 4;

export function renderDocument(layout: Layout, body: string, options: DocumentOptions): string {
  const { theme, width = null, stamp = false } = options;
  const scale = width === null ? 1 : width / layout.width;
  const canvas = theme.palette.canvas === null
    ? ''
    : element('rect', { x: 0, y: 0, width: num(layout.width), height: num(layout.height), fill: theme.palette.canvas });
  const stamped = stamp
    ? svgText(layout.width - STAMP_INSET, layout.height - STAMP_INSET, STAMP_TEXT, {
      anchor: 'end', fill: theme.palette.label, 'font-size': num(theme.metrics.lineTextSize),
    })
    : '';
  return element('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${num(layout.width)} ${num(layout.height)}`,
    width: num(layout.width * scale),
    height: num(layout.height * scale),
    'data-copper-fence': VERSION,
    role: 'img',
  }, `${canvas}${body}${stamped}`);
}
