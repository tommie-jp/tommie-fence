import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

describe('renderPerfboard', () => {
  test('returns a card instead of a drawing when the fence is empty', () => {
    const result = renderPerfboard('');

    expect(result.svg).toBe('');
    expect(result.errorHtml).toContain('perfboard-error-card');
    expect(result.errors[0]?.message).toContain('空');
  });

  test('reports a yaml syntax error with the line and the text of that line', () => {
    const result = renderPerfboard('parts:\n  R1: a: b: c\n');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.text).toBe('  R1: a: b: c');
  });

  test('normalises newlines without moving line numbers', () => {
    const result = renderPerfboard('parts:\r\n  R1: a: b: c\r\n');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.text).toBe('  R1: a: b: c');
  });

  test('does not throw on anything it is given', () => {
    for (const input of ['', ' ', 'board: akizuki-c', '- 1', 'a: '.repeat(500)]) {
      expect(() => renderPerfboard(input)).not.toThrow();
    }
  });
  test('does not call a fence it could read "unreadable"', () => {
    const result = renderPerfboard('board: akizuki-c\n');

    expect(result.errors).toEqual([]);
    expect(result.notices).toHaveLength(1);
    expect(result.errorHtml).toContain('perfboard-notice');
    expect(result.errorHtml).not.toContain('perfboard-error-card');
  });

  test('puts the board name through safeToken before naming it', () => {
    const result = renderPerfboard('board: "</span><img src=x>"\n');

    expect(result.errorHtml).not.toContain('<img');
    expect(result.notices[0]?.message).not.toContain('<');
  });

  test('cuts a board name that is too long to name', () => {
    const result = renderPerfboard(`board: ${'x'.repeat(300)}\n`);

    expect(result.notices[0]?.message.length).toBeLessThan(120);
  });
});
