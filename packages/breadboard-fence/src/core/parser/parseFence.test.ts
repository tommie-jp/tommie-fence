import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { parseFence } from './parseFence.ts';

const led = `board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
`;

describe('parseFence', () => {
  test('reads the board size, the parts and the wires', () => {
    const { doc, errors } = parseFence(led);

    expect(errors).toEqual([]);
    expect(doc?.board).toBe('half');
    expect(doc?.parts.map((part) => part.id)).toEqual(['R1', 'D1']);
    expect(doc?.wires).toHaveLength(2);
  });

  test('defaults the board to half size when it is not written', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a5 a10 330\n');

    expect(doc?.board).toBe('half');
  });

  test('reports the line number of an unknown top level key', () => {
    const { errors } = parseFence('board: half\nwiring:\n  - a1 -- b1\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('wiring');
  });

  test('reports an unknown board size', () => {
    const { errors } = parseFence('board: enormous\n');

    expect(errors[0]?.line).toBe(1);
  });

  test('reports a yaml syntax error with the line it happens on', () => {
    const { doc, errors } = parseFence('parts:\n  R1: [unclosed\n');

    expect(doc).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.line).toBeGreaterThan(0);
  });

  test('reports the line of the part whose specification is not text', () => {
    const { errors } = parseFence('parts:\n  R1: 42\n');

    expect(errors[0]?.line).toBe(2);
  });

  test('reports a duplicate part id', () => {
    const { errors } = parseFence('parts:\n  R1: resistor a5 a10\n  R1: resistor b5 b10\n');

    expect(errors.some((error) => error.message.includes('R1'))).toBe(true);
  });

  test('reads the expanded map form used for an off board device', () => {
    const { doc, errors } = parseFence(
      ['parts:', '  AD2:', '    type: device', '    at: top', '    label: Analog Discovery 2', '    pins: [W1, GND]', ''].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(doc?.parts[0]).toMatchObject({
      id: 'AD2',
      type: 'device',
      at: 'top',
      label: 'Analog Discovery 2',
      pins: ['W1', 'GND'],
    });
  });

  test('records the line number of every wire so later errors can point at it', () => {
    const { doc } = parseFence(led);

    expect(doc?.wires.map((wire) => wire.line)).toEqual([6, 7]);
  });

  test('accepts an empty document without crashing', () => {
    const { doc, errors } = parseFence('');

    expect(errors).toEqual([]);
    expect(doc?.parts).toEqual([]);
  });

  test('reports a wires section that is not a list', () => {
    const { errors } = parseFence('wires: a1 -- b1\n');

    expect(errors).toHaveLength(1);
  });

  test('reports a part id that could never be referenced from a wire', () => {
    const { doc, errors } = parseFence('parts:\n  "R 1": resistor a5 a10\n');

    expect(doc?.parts).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  test('stops reading parts once there are more than the limit allows', () => {
    const many = Array.from({ length: LIMITS.parts + 5 }, (_, index) => `  R${index}: resistor a1 a2`);
    const { doc, errors } = parseFence(['parts:', ...many].join('\n'));

    expect(doc?.parts).toHaveLength(LIMITS.parts);
    expect(errors).toHaveLength(1);
  });

  test('stops reading wires once there are more than the limit allows', () => {
    const many = Array.from({ length: LIMITS.wires + 5 }, () => '  - a1 -- b1');
    const { doc, errors } = parseFence(['wires:', ...many].join('\n'));

    expect(doc?.wires).toHaveLength(LIMITS.wires);
    expect(errors).toHaveLength(1);
  });
});
