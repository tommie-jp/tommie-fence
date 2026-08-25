import { describe, expect, test } from 'vitest';
import { renderNetlist } from './netlistHtml.ts';

describe('renderNetlist', () => {
  test('returns nothing when there is no net to show', () => {
    expect(renderNetlist([])).toBe('');
  });

  test('lists each net with the terminals on it', () => {
    const html = renderNetlist([{ name: 'IN', refs: ['IN', 'R1.1'] }]);

    expect(html).toContain('IN');
    expect(html).toContain('R1.1');
  });

  test('folds the list away so it does not crowd the drawing', () => {
    expect(renderNetlist([{ name: 'GND', refs: ['G1'] }])).toContain('<details');
  });

  test('escapes the names so a net cannot carry markup into the page', () => {
    const html = renderNetlist([{ name: '<img src=x>', refs: ['</table><script>alert(1)</script>'] }]);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
  });
});
