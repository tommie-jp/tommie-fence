import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { perfboardPlugin } from './markdownItPlugin.ts';

const md = () => new MarkdownIt().use(perfboardPlugin);

describe('perfboardPlugin', () => {
  test('replaces a perfboard fence with what the core returned', () => {
    const html = md().render('```perfboard\n```');

    expect(html).toContain('class="perfboard"');
    expect(html).toContain('perfboard-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```breadboard\nboard: half\n```');

    expect(html).toContain('<code');
    expect(html).not.toContain('perfboard-error-card');
  });

  // **板は必ず描く** (52 の docs/54)。読めなかった行は図の下の帯に出る。
  test('draws the board and puts the reason in the band when the fence cannot be read', () => {
    expect(() => md().render('```perfboard\nparts:\n  R1: [unclosed\n```')).not.toThrow();
    expect(md().render('```perfboard\nparts:\n  R1: [unclosed\n```')).toContain('perfboard-errors');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```perfboard\nbored: </div><img src=x onerror=alert(1)>\n```');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
