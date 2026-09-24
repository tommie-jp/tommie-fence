import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { vnaPlugin } from './markdownItPlugin.ts';

const md = (reader?: Parameters<typeof vnaPlugin>[0]) => new MarkdownIt().use(vnaPlugin(reader));

describe('vnaPlugin', () => {
  test('replaces a vna fence with the drawing and the band', () => {
    const html = md().render('```vna\n```');
    expect(html).toContain('class="vna"');
    expect(html).toContain('<svg');
    expect(html).toContain('vna-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```perfboard\nboard: 12x8\n```');
    expect(html).toContain('<code');
    expect(html).not.toContain('class="vna"');
  });

  test('gives line numbers of the markdown, not of the fence', () => {
    expect(md().render('# 題\n\n```vna\nswep: 1M-2M\n```')).toContain('4 行目');
  });

  test('asks the host for a data reader with the render env', () => {
    const seen: unknown[] = [];
    const html = md((env) => {
      seen.push(env);
      return (name) => (name === 'a.s1p' ? '# HZ S RI R 50\n1000000 0.5 0\n2000000 0.5 0' : null);
    }).render('```vna\nsweep: 1M-2M\ndata: a.s1p\ntraces:\n  - S11 logmag\n```', { currentDocument: 'x' });
    expect(seen[0]).toEqual({ currentDocument: 'x' });
    expect(html).toContain('実測 (a.s1p)');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```vna\ntitle: </div><img src=x onerror=alert(1)>\n```');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
