import { describe, expect, test } from 'vitest';
import { texErrors } from './texLog.ts';

// 生成した TeX の 9 行目が YAML の 2 行目、10 行目が 3 行目から来たとする。
const lineMap = new Map([
  [9, 2],
  [10, 3],
]);

const log = (...rows: string[]): string => rows.join('\n');

describe('texErrors', () => {
  test('brings a TeX line number back to the line of YAML it came from', () => {
    const errors = texErrors(
      log('! Undefined control sequence.', 'l.10 \\draw (a1) to[R] (a3);', '?'),
      lineMap,
      0,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('Undefined control sequence');
  });

  test('subtracts the preamble the engine puts in front of the fence', () => {
    const errors = texErrors(log('! Missing $ inserted.', 'l.19 \\draw (a1);'), lineMap, 9);

    expect(errors[0]?.line).toBe(3);
  });

  test('reports without a line when the failing line is not one of ours', () => {
    const errors = texErrors(log("! LaTeX Error: File `siunitx.sty' not found.", 'l.1 \\usepackage'), lineMap, 0);

    expect(errors[0]?.line).toBeNull();
    expect(errors[0]?.message).toContain('siunitx');
  });

  test('reports without a line when the log names no line at all', () => {
    const errors = texErrors(log('! Emergency stop.'), lineMap, 0);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBeNull();
  });

  test('finds every error the log holds', () => {
    const errors = texErrors(
      log('! Undefined control sequence.', 'l.9 \\draw', '! Missing $ inserted.', 'l.10 \\draw'),
      lineMap,
      0,
    );

    expect(errors.map((error) => error.line)).toEqual([2, 3]);
  });

  test('does not take a line number from the error that follows', () => {
    const errors = texErrors(log('! Emergency stop.', '! Missing $ inserted.', 'l.10 \\draw'), lineMap, 0);

    expect(errors[0]?.line).toBeNull();
    expect(errors[1]?.line).toBe(3);
  });

  test('says nothing when the log holds no error', () => {
    expect(texErrors(log('This is e-TeX', 'Output written on input.dvi'), lineMap, 0)).toEqual([]);
  });

  test('cuts a message that runs long so the band stays readable', () => {
    const errors = texErrors(`! ${'x'.repeat(300)}`, lineMap, 0);

    expect(errors[0]?.message.length).toBeLessThan(200);
  });
});
