import { describe, expect, test } from 'vitest';
import { aimAt, fenceAt } from './map.ts';

const NOTE = [
  '# ノート',
  '',
  '```breadboard',
  'board: half',
  'points:',
  '  vin: a5',
  'parts:',
  '  R1: resistor vin a10 330',
  'wires:',
  '  - a10 -- b12',
  '```',
  '',
  'あとがき',
  '',
].join('\n');

/** フェンスの中身だけ (行はフェンスの中の 1 始まり)。 */
const SOURCE = NOTE.split('\n').slice(3, 10).join('\n');

describe('fenceAt', () => {
  test('finds the fence the cursor sits in', () => {
    expect(fenceAt(NOTE, 8)?.line).toBe(3);
  });

  test('picks it up from the fence markers too', () => {
    // 縁にカーソルがあっても掴めないと、開いた直後に何も出ない。
    expect(fenceAt(NOTE, 3)?.line).toBe(3);
    expect(fenceAt(NOTE, 11)?.line).toBe(3);
  });

  test('is null outside every fence', () => {
    expect(fenceAt(NOTE, 1)).toBeNull();
    expect(fenceAt(NOTE, 13)).toBeNull();
  });

  test('leaves other fence languages alone', () => {
    const other = ['```circuit', 'parts:', '```', ''].join('\n');

    expect(fenceAt(other, 2)).toBeNull();
  });
});

describe('aimAt', () => {
  test('points at the part when the cursor is on its line', () => {
    // `  R1: resistor vin a10 330` はフェンスの 5 行目。
    expect(aimAt(SOURCE, 5, 4)).toEqual({ kind: 'part', id: 'R1' });
  });

  test('points at the hole when the cursor is on the address itself', () => {
    const line = '  R1: resistor vin a10 330';

    expect(aimAt(SOURCE, 5, line.indexOf('a10'))).toEqual({ kind: 'node', id: 'a10' });
  });

  test('reads a hole written by its name as that hole', () => {
    const line = '  R1: resistor vin a10 330';

    expect(aimAt(SOURCE, 5, line.indexOf('vin'))).toEqual({ kind: 'node', id: 'a5' });
  });

  test('points at the wire by its line, since one line is one path', () => {
    expect(aimAt(SOURCE, 7, 2)).toEqual({ kind: 'wire', id: '7' });
  });

  test('points at the hole an endpoint names, when the cursor is on it', () => {
    const line = '  - a10 -- b12';

    expect(aimAt(SOURCE, 7, line.indexOf('b12'))).toEqual({ kind: 'node', id: 'b12' });
  });

  test('points at the hole a points: line gives a name to', () => {
    expect(aimAt(SOURCE, 3, 2)).toEqual({ kind: 'node', id: 'a5' });
  });

  test('is null on a line that carries nothing to grab', () => {
    expect(aimAt(SOURCE, 1, 0)).toBeNull();
  });
});
