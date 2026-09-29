import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { logicPlugin } from './markdownItPlugin.ts';

const md = () => new MarkdownIt().use(logicPlugin());

describe('logicPlugin', () => {
  test('replaces a logic fence with the drawing and the band', () => {
    const html = md().render('```logic\n```');
    expect(html).toContain('class="logic"');
    expect(html).toContain('<svg');
    expect(html).toContain('logic-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```perfboard\nboard: 12x8\n```');
    expect(html).toContain('<code');
    expect(html).not.toContain('class="logic"');
  });

  test('gives line numbers of the markdown, not of the fence', () => {
    expect(md().render('# 題\n\n```logic\ndevice: ad3\ntme: 1s/div\n```')).toContain('5 行目');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```logic\ntitle: </div><img src=x onerror=alert(1)>\n```');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
