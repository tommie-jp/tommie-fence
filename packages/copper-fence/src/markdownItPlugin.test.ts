import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { copperPlugin } from './markdownItPlugin.ts';

const md = () => new MarkdownIt().use(copperPlugin);

describe('copperPlugin', () => {
  test('replaces a copper fence with the drawing and the band', () => {
    const html = md().render('```copper\n```');

    expect(html).toContain('class="copper"');
    expect(html).toContain('<svg');
    expect(html).toContain('copper-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```perfboard\nboard: 12x8\n```');

    expect(html).toContain('<code');
    expect(html).not.toContain('class="copper"');
  });

  test('gives line numbers of the markdown, not of the fence', () => {
    const html = md().render('# 題\n\n```copper\nbored: 1\n```');

    expect(html).toContain('4 行目');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```copper\nbored: </div><img src=x onerror=alert(1)>\n```');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
