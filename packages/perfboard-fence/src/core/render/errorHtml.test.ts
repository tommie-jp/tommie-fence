import { describe, expect, test } from 'vitest';
import { renderErrorBanner } from './errorHtml.ts';

describe('renderErrorBanner', () => {
  test('says nothing when there is nothing to say', () => {
    expect(renderErrorBanner([])).toBe('');
  });

  test('escapes what was written so a fence cannot inject markup', () => {
    const html = renderErrorBanner([
      { message: '知らない部品です', line: 2, text: '  U1: <img src=x onerror=alert(1)>' },
    ]);

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('caps the list so the report never dwarfs the drawing', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ message: `件 ${i}`, line: i + 1 }));

    expect(renderErrorBanner(many)).toContain('ほかに 4 件');
  });

  test('marks a notice apart from a line that could not be read', () => {
    const html = renderErrorBanner([{ message: '思ったとおりに出ません', line: 1, notice: true }]);

    expect(html).toContain('perfboard-notice');
  });
});
