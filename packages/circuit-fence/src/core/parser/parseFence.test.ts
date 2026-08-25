import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { parseFence } from './parseFence.ts';

const lines = (...rows: string[]): string => `${rows.join('\n')}\n`;

describe('parseFence', () => {
  test('reads an empty fence as an empty circuit rather than an error', () => {
    const result = parseFence('');

    expect(result.errors).toEqual([]);
    expect(result.doc).toMatchObject({ parts: [], wires: [] });
  });

  test('reports a YAML syntax error on the line it was written', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3', ' bad: indent'));

    expect(result.doc).toBeNull();
    expect(result.errors[0]?.line).toBe(3);
    expect(result.errors[0]?.message).toContain('YAML の構文エラー');
  });

  test('asks for a map when the fence holds something else', () => {
    const result = parseFence(lines('- a1 -- a3'));

    expect(result.doc).toBeNull();
    expect(result.errors[0]?.message).toContain('parts');
  });

  test('names the key it could not use and lists the ones that work', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3 10k', 'wire:', '  - a1 -- a3'));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(3);
    expect(result.errors[0]?.message).toContain('wire');
    expect(result.errors[0]?.message).toContain('parts / wires');
  });

  test('keeps each part with the line it was written on', () => {
    const result = parseFence(lines('parts:', '  IN: port a1', '  R1: resistor a1 a3 10k'));

    expect(result.doc?.parts).toMatchObject([
      { id: 'IN', type: 'port', line: 2 },
      { id: 'R1', type: 'resistor', value: '10k', line: 3 },
    ]);
  });

  test('keeps each wire with the line it was written on', () => {
    const result = parseFence(lines('wires:', '  - a3 -- a4', '  - b1 -- b2'));

    expect(result.doc?.wires).toMatchObject([{ line: 2 }, { line: 3 }]);
  });

  test('reports a part whose one line could not be read, with its line', () => {
    const result = parseFence(lines('parts:', '  R1: resistr a1 a3'));

    expect(result.doc?.parts).toEqual([]);
    expect(result.errors[0]?.line).toBe(2);
  });

  test('asks for a map when parts is written as a list', () => {
    const result = parseFence(lines('parts:', '  - resistor a1 a3'));

    expect(result.errors[0]?.message).toContain('ID: 内容');
    expect(result.errors[0]?.line).toBe(2);
  });

  test('asks for a list when wires is written as a map', () => {
    const result = parseFence(lines('wires:', '  a3: a4'));

    expect(result.errors[0]?.message).toContain('リスト');
  });

  test('rejects a part id a wire could never point at', () => {
    const result = parseFence(lines('parts:', '  "R 1": resistor a1 a3'));

    expect(result.doc?.parts).toEqual([]);
    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.message).toContain('R 1');
  });

  test('reports a part id that was defined twice', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3', '  R1: resistor b1 b3'));

    expect(result.doc?.parts).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(3);
    expect(result.errors[0]?.message).toContain('二重');
  });

  test('asks for one line of text when a part is written as a map', () => {
    const result = parseFence(lines('parts:', '  R1:', '    type: resistor'));

    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.message).toContain('1 行');
  });

  test('stops reading parts once the limit is reached and says so', () => {
    const rows = ['parts:'];
    for (let index = 0; index <= LIMITS.parts; index += 1) rows.push(`  R${index}: resistor a1 a3`);

    const result = parseFence(lines(...rows));

    expect(result.doc?.parts).toHaveLength(LIMITS.parts);
    expect(result.errors[0]?.message).toContain(`${LIMITS.parts}`);
  });

  test('stops reading wires once the limit is reached and says so', () => {
    const rows = ['wires:'];
    for (let index = 0; index <= LIMITS.wires; index += 1) rows.push('  - a1 -- a3');

    const result = parseFence(lines(...rows));

    expect(result.doc?.wires).toHaveLength(LIMITS.wires);
    expect(result.errors[0]?.message).toContain(`${LIMITS.wires}`);
  });

  test('reads the parts that were written even when one of them is broken', () => {
    const result = parseFence(lines('parts:', '  R1:', '    type: resistor', '  C1: capacitor a3 c3 100n'));

    expect(result.doc?.parts).toMatchObject([{ id: 'C1', type: 'capacitor', line: 4 }]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('parseFence の style', () => {
  test('reads the style that was written', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3', 'style:', '  theme: dark', '  grid: on'));

    expect(result.errors).toEqual([]);
    expect(result.doc?.style).toMatchObject({ theme: 'dark', grid: true });
  });

  test('reads the short form where only the theme is chosen', () => {
    expect(parseFence(lines('style: dark')).doc?.style).toMatchObject({ theme: 'dark' });
  });

  test('points at the item that could not be read, not at the style line', () => {
    const result = parseFence(lines('style:', '  theme: dark', '  width: wide'));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(3);
  });

  test('falls back to the style line when the item has no line of its own', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3', 'style: 5'));

    expect(result.errors[0]?.line).toBe(3);
  });

  test('keeps reading the circuit when the style is broken', () => {
    const result = parseFence(lines('parts:', '  R1: resistor a1 a3', 'style:', '  theme: nope'));

    expect(result.doc?.parts).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(4);
  });
});
