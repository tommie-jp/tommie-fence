import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { spectrumPlugin } from './markdownItPlugin.ts';

const md = (reader?: Parameters<typeof spectrumPlugin>[0]) => new MarkdownIt().use(spectrumPlugin(reader));

describe('spectrumPlugin', () => {
  test('replaces a spectrum fence with the drawing and the band', () => {
    const html = md().render('```spectrum\n```');
    expect(html).toContain('class="spectrum"');
    expect(html).toContain('<svg');
    expect(html).toContain('spectrum-errors');
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```perfboard\nboard: 12x8\n```');
    expect(html).toContain('<code');
    expect(html).not.toContain('class="spectrum"');
  });

  test('gives line numbers of the markdown, not of the fence', () => {
    expect(md().render('# 題\n\n```spectrum\ndevice: ad2\ntme: 1ms/div\n```')).toContain('5 行目');
  });

  test('asks the host for a data reader with the render env', () => {
    const seen: unknown[] = [];
    const html = md((env) => {
      seen.push(env);
      return () => null;
    }).render('```spectrum\ndevice: ad2\n```', { currentDocument: 'x' });
    expect(seen[0]).toEqual({ currentDocument: 'x' });
    expect(html).toContain('class="spectrum"');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```spectrum\ntitle: </div><img src=x onerror=alert(1)>\n```');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
