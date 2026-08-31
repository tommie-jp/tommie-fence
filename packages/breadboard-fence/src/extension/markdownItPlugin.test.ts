import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { THEMES } from '../core/render/theme.ts';
import { breadboardPlugin } from './markdownItPlugin.ts';

const md = () => new MarkdownIt().use(breadboardPlugin);

describe('breadboardPlugin', () => {
  test('replaces a breadboard fence with the drawing', () => {
    const html = md().render('```breadboard\nboard: half\n```');

    expect(html).toContain('<svg');
    expect(html).toContain('class="breadboard"');
    expect(html).not.toContain('<code');
  });

  test('puts what it could not read next to the drawing, not inside it', () => {
    const html = md().render('```breadboard\nparts:\n  R1: resistr a5 a10\n```');

    expect(html).toContain('<svg');
    expect(html).toContain('breadboard-errors');
    // 図の SVG そのものには報告が入らない。
    expect(html.slice(0, html.indexOf('</svg>'))).not.toContain('行目');
  });

  test('applies the theme the fence asks for', () => {
    const html = md().render('```breadboard\nboard: half\nstyle: dark\n```');

    // プレビューまで style が届いていること。ここが classic の板の色になるときは、
    // たいてい拡張が古い .vsix のままなので `npm run package` から入れ直す。
    expect(html).toContain(THEMES.dark?.palette.plate);
    expect(html).not.toContain('知らないキーです: style');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```yaml\nboard: half\n```');

    expect(html).toContain('<code');
    expect(html).not.toContain('<svg');
  });

  test('renders an error card in html instead of throwing when the fence is invalid', () => {
    const html = md().render('```breadboard\nparts:\n  R1: [unclosed\n```');

    expect(html).toContain('breadboard-error-card');
  });

  test('keeps working when the fence is empty', () => {
    expect(() => md().render('```breadboard\n```')).not.toThrow();
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```breadboard\nparts:\n  U1: dip8 @ e5 </svg><img src=x onerror=alert(1)>\n```');

    // ラベルは表示されてよいが、タグとしてではなく文字として出ること。
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html.match(/<\/svg>/g)).toHaveLength(1);
  });
});
