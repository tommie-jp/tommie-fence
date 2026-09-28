import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { graphPlugin } from './markdownItPlugin.ts';

const md = (reader?: Parameters<typeof graphPlugin>[0]) => new MarkdownIt().use(graphPlugin(reader));

describe('graphPlugin', () => {
  test('replaces a graph fence with the drawing and the band', () => {
    const html = md().render('```graph\n```');
    expect(html).toContain('class="graph"');
    expect(html).toContain('<svg');
    expect(html).toContain('graph-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```perfboard\nboard: 12x8\n```');
    expect(html).toContain('<code');
    expect(html).not.toContain('class="graph"');
  });

  test('gives line numbers of the markdown, not of the fence', () => {
    expect(md().render('# 題\n\n```graph\nxx: 1\n```')).toContain('4 行目');
  });

  test('asks the host for a data reader with the render env', () => {
    const seen: unknown[] = [];
    const html = md((env) => {
      seen.push(env);
      return () => null;
    }).render('```graph\nx: 周波数 Hz\n```', { currentDocument: 'x' });
    expect(seen[0]).toEqual({ currentDocument: 'x' });
    expect(html).toContain('class="graph"');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```graph\ntitle: </div><img src=x onerror=alert(1)>\n```');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
