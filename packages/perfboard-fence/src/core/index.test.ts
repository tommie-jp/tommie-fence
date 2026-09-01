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
    for (const input of ['', ' ', 'board: 28x18', 'board: 0x0', '- 1', 'a: '.repeat(500)]) {
      expect(() => renderPerfboard(input)).not.toThrow();
    }
  });
  test('draws the board when the fence is well formed, and says nothing', () => {
    const result = renderPerfboard('board: 28x18\n');

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('data-perfboard-fence');
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.errorHtml).toBe('');
  });

  test('draws one hole for every hole on the board', () => {
    const result = renderPerfboard('board: 6x4\n');

    expect(result.svg.match(/<circle /g)).toHaveLength(24);
  });

  test('puts an unreadable size through safeToken before naming it', () => {
    const result = renderPerfboard('board: "</span><img src=x>"\n');

    expect(result.errorHtml).not.toContain('<img');
    expect(result.errors[0]?.message).not.toContain('<');
  });

  test('cuts a size that is too long to name', () => {
    const result = renderPerfboard(`board: ${'x'.repeat(300)}\n`);

    expect(result.errors[0]?.message.length).toBeLessThan(200);
  });
  test('draws the parts on the board', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7 10k\n');

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('>R1 10k</text>');
    expect(result.svg).toContain('<line ');
  });

  test('keeps drawing the board when a part could not be read', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b99\n');

    // 板は描けている。読めなかったのは部品 1 つなので、帯で言う。
    expect(result.svg).toContain('<svg');
    expect(result.errorHtml).toContain('perfboard-errors');
    expect(result.errorHtml).not.toContain('perfboard-error-card');
    expect(result.errors[0]?.message).toContain('b99');
    expect(result.errors[0]?.text).toBe('  R1: resistor b3 b99');
  });
  test('lists what it could not read in the order it appears', () => {
    // 行順に並べないと、帯の打ち切り (8 件) で後ろの段の報告から先に消える。
    const result = renderPerfboard(
      'board: 10x6\nparts:\n  R1: resistor b3 b99\n  R2: resistr c1 c4\n',
    );

    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});
