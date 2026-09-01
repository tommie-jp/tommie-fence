import { describe, expect, test } from 'vitest';
import { VERSION } from '../version.ts';
import { renderDocument } from './document.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';

const layout = createLayout(createBoard({ cols: 6, rows: 4 }));
const svg = renderDocument(layout, '<g id="body"/>');

describe('renderDocument', () => {
  test('sizes the canvas from the layout', () => {
    expect(svg).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
  });

  test('stamps the version on the root so a saved .svg says what drew it', () => {
    expect(svg).toContain(`data-perfboard-fence="${VERSION}"`);
  });

  test('puts the body inside', () => {
    expect(svg).toContain('<g id="body"/>');
  });

  test('is self contained: no script and nothing fetched from outside', () => {
    // xmlns だけは http から始まるが、これは名前空間の名前で取りに行かない。
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('xlink:href');
    expect(svg).not.toContain('url(');
    expect(svg.match(/http/g)).toHaveLength(1);
  });

  test('opens and closes exactly one svg', () => {
    expect(svg.match(/<svg /g)).toHaveLength(1);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });
});
