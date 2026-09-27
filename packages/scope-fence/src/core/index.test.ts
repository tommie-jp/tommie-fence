import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

describe('renderScope — 段 0', () => {
  test('draws the grid even for an empty fence, and says it is empty', () => {
    const result = renderScope('');
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('data-scope-fence');
    expect(result.svg).toContain('1ms/div');
    expect(result.errors.map((error) => error.message)).toEqual(['scope フェンスが空です (ch1: から書き始めます)']);
    expect(result.errorHtml).toContain('scope-errors');
  });

  test('writes no NaN or Infinity into the drawing', () => {
    for (const source of ['', 'time: 5ms/div', 'title: x', 'foo: 1']) {
      expect(renderScope(source).svg).not.toMatch(/NaN|Infinity/);
    }
  });

  test('uses the time/div it was given on the status row', () => {
    expect(renderScope('time: 200us/div').svg).toContain('200µs/div');
  });

  test('moves line numbers to the markdown lines', () => {
    const [error] = renderScope('foo: 1', { offset: 10 }).errors;
    expect(error?.line).toBe(11);
  });

  test('keeps the title, escaped', () => {
    const { svg } = renderScope('title: <b>図</b>');
    expect(svg).toContain('&lt;b&gt;図');
    expect(svg).not.toContain('<b>');
  });

  test('shows notices only under style: debug (on by default)', () => {
    expect(renderScope('style:\n  debug: off').errorHtml).toBe('');
  });
});
