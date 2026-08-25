import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { formatAddress } from '../model/address.ts';
import type { PartSpec } from '../types.ts';
import { placeParts } from './place.ts';

const board = createBoard('half');

const spec = (over: Partial<PartSpec> & Pick<PartSpec, 'id' | 'type'>): PartSpec => ({
  holes: [],
  value: null,
  label: null,
  at: null,
  pins: null,
  line: 1,
  ...over,
});

const holes = (...addresses: string[]) => addresses.map((addr, index) => ({ addr, tag: String(index + 1) }));

const pinMap = (part: { pins: readonly { name: string; address: unknown }[] }) =>
  Object.fromEntries(part.pins.map((pin) => [pin.name, pin.address ? formatAddress(pin.address as never) : null]));

describe('placeParts', () => {
  test('resolves dip8 anchored at e5 to pins straddling the ravine', () => {
    const { parts, errors } = placeParts([spec({ id: 'U1', type: 'dip8', holes: holes('e5') })], board);

    expect(errors).toEqual([]);
    expect(pinMap(parts[0]!)).toEqual({
      '1': 'e5', '2': 'e6', '3': 'e7', '4': 'e8',
      '5': 'f8', '6': 'f7', '7': 'f6', '8': 'f5',
    });
  });

  test('mirrors the package when it is anchored in the bottom block', () => {
    const { parts } = placeParts([spec({ id: 'U1', type: 'dip8', holes: holes('f5') })], board);

    expect(pinMap(parts[0]!)).toMatchObject({ '1': 'f5', '4': 'f8', '5': 'e8', '8': 'e5' });
  });

  test('reports a dip anchored in a row that does not touch the ravine', () => {
    const { parts, errors } = placeParts([spec({ id: 'U1', type: 'dip8', holes: holes('a5'), line: 4 })], board);

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(4);
  });

  test('reports a dip that runs past the last column of the board', () => {
    const { errors } = placeParts([spec({ id: 'U1', type: 'dip8', holes: holes('e29') })], board);

    expect(errors).toHaveLength(1);
  });

  test('resolves a two lead part to the two holes it is pushed into', () => {
    const { parts } = placeParts([spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') })], board);

    expect(pinMap(parts[0]!)).toEqual({ '1': 'a5', '2': 'a10' });
  });

  test('keeps the polarity tag of an led as the pin name', () => {
    const led = spec({
      id: 'D1',
      type: 'led',
      holes: [
        { addr: 'b12', tag: 'A' },
        { addr: 'b13', tag: 'K' },
      ],
    });

    const { parts } = placeParts([led], board);

    expect(pinMap(parts[0]!)).toEqual({ A: 'b12', K: 'b13' });
  });

  test('resolves a transistor to the three holes its legs go into', () => {
    const transistor = spec({
      id: 'Q1',
      type: 'transistor',
      holes: [
        { addr: 'h9', tag: 'B' },
        { addr: 'h10', tag: 'C' },
        { addr: 'h11', tag: 'E' },
      ],
      label: '2SC1815',
    });

    const { parts, errors } = placeParts([transistor], board);

    expect(errors).toEqual([]);
    expect(parts[0]?.kind).toBe('three-lead');
    expect(pinMap(parts[0]!)).toEqual({ B: 'h9', C: 'h10', E: 'h11' });
  });

  test('names the legs of a transistor 1 to 3 when no pin name is given', () => {
    const { parts } = placeParts([spec({ id: 'Q1', type: 'transistor', holes: holes('a1', 'a2', 'a3') })], board);

    expect(pinMap(parts[0]!)).toEqual({ '1': 'a1', '2': 'a2', '3': 'a3' });
  });

  test('reports a transistor that is not given exactly three holes', () => {
    const { errors } = placeParts(
      [spec({ id: 'Q1', type: 'transistor', holes: holes('a1', 'a2'), line: 5 })],
      board,
    );

    expect(errors[0]?.line).toBe(5);
  });

  test('reports a part that gives two legs the same name', () => {
    const led = spec({
      id: 'D1',
      type: 'led',
      holes: [
        { addr: 'b12', tag: 'A' },
        { addr: 'b13', tag: 'A' },
      ],
      line: 4,
    });

    const { parts, errors } = placeParts([led], board);

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(4);
  });

  test('reports a two lead part that is not given exactly two holes', () => {
    const { errors } = placeParts([spec({ id: 'R1', type: 'resistor', holes: holes('a5'), line: 6 })], board);

    expect(errors[0]?.line).toBe(6);
  });

  test('reports a hole that is past the end of the board and names it', () => {
    const { errors } = placeParts([spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a99'), line: 3 })], board);

    expect(errors[0]?.message).toContain('a99');
    expect(errors[0]?.line).toBe(3);
  });

  test('reports a hole that is not an address at all', () => {
    const { errors } = placeParts([spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'zz') })], board);

    expect(errors).toHaveLength(1);
  });

  test('reports an unknown part type', () => {
    const { errors } = placeParts([spec({ id: 'X1', type: 'flux-capacitor', holes: holes('a1', 'a2') })], board);

    expect(errors[0]?.message).toContain('flux-capacitor');
  });

  test('gives an off board device the pins it declares and no addresses', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'AD2', type: 'device', at: 'top', pins: ['W1', 'GND'], label: 'Analog Discovery 2' })],
      board,
    );

    expect(errors).toEqual([]);
    expect(parts[0]?.kind).toBe('device');
    expect(pinMap(parts[0]!)).toEqual({ W1: null, GND: null });
  });

  test('reports a device that declares no pins', () => {
    const { errors } = placeParts([spec({ id: 'AD2', type: 'device', at: 'top', line: 8 })], board);

    expect(errors[0]?.line).toBe(8);
  });

  test('reports a part whose two leads go into the same hole', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a5'), line: 2 })],
      board,
    );

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('a5');
  });

  test('reports two parts that occupy the same hole', () => {
    const { errors } = placeParts(
      [
        spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10'), line: 2 }),
        spec({ id: 'R2', type: 'resistor', holes: holes('a10', 'a15'), line: 3 }),
      ],
      board,
    );

    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('a10');
  });

  test('keeps the parts that are fine when one of them fails', () => {
    const { parts, errors } = placeParts(
      [
        spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }),
        spec({ id: 'R2', type: 'resistor', holes: holes('b5') }),
        spec({ id: 'R3', type: 'resistor', holes: holes('c5', 'c10') }),
      ],
      board,
    );

    expect(parts.map((part) => part.id)).toEqual(['R1', 'R3']);
    expect(errors).toHaveLength(1);
  });

  test('lays a sip header along one row from the anchor hole', () => {
    const { parts, errors } = placeParts([spec({ id: 'M1', type: 'sip4', holes: holes('a20') })], board);

    expect(errors).toEqual([]);
    expect(pinMap(parts[0]!)).toEqual({ '1': 'a20', '2': 'a21', '3': 'a22', '4': 'a23' });
  });

  test('names the header pins from the pins list', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'M1', type: 'sip4', holes: holes('j10'), pins: ['GND', 'VCC', 'SCL', 'SDA'] })],
      board,
    );

    expect(errors).toEqual([]);
    expect(pinMap(parts[0]!)).toEqual({ GND: 'j10', VCC: 'j11', SCL: 'j12', SDA: 'j13' });
  });

  test('reports a pins list that does not have one name per pin', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'M1', type: 'sip4', holes: holes('a1'), pins: ['GND', 'VCC'], line: 3 })],
      board,
    );

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('4');
  });

  test('reports a header that runs off the right edge of the board', () => {
    const { errors } = placeParts([spec({ id: 'M1', type: 'sip4', holes: holes('a29') })], board);

    expect(errors[0]?.message).toContain('30');
  });

  test('straddles the ravine with the four legs of a pushbutton', () => {
    const { parts, errors } = placeParts([spec({ id: 'SW1', type: 'pushbutton', holes: holes('e5') })], board);

    expect(errors).toEqual([]);
    expect(pinMap(parts[0]!)).toEqual({ '1a': 'e5', '1b': 'e7', '2a': 'f5', '2b': 'f7' });
  });

  test('bridges the two legs that sit on the same side of a pushbutton', () => {
    const { parts } = placeParts([spec({ id: 'SW1', type: 'pushbutton', holes: holes('e5') })], board);

    // 押していなくてもつながっている組。押すと 1 と 2 の側がつながる。
    expect(parts[0]?.bridges).toEqual([['1a', '1b'], ['2a', '2b']]);
  });

  test('reports a pushbutton anchored in a row that does not touch the ravine', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'SW1', type: 'pushbutton', holes: holes('a5'), line: 2 })],
      board,
    );

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(2);
  });

  test('places the pico header rows 0.7 inch apart across the ravine', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'MCU', type: 'pico', holes: holes('h5') })],
      createBoard('full'),
    );

    expect(errors).toEqual([]);
    // ピン 1 から 20 本 h 行を進み、7 ピッチ離れた c 行を戻ってくる。
    expect(pinMap(parts[0]!)).toMatchObject({ GP0: 'h5', GP15: 'h24', GP16: 'c24', VBUS: 'c5' });
  });

  test('flips the pico when it is anchored in the top block', () => {
    const { parts } = placeParts([spec({ id: 'MCU', type: 'pico2', holes: holes('c5') })], createBoard('full'));

    expect(pinMap(parts[0]!)).toMatchObject({ GP0: 'c5', VBUS: 'h5' });
  });

  test('labels a board with its product name when the fence does not', () => {
    const { parts } = placeParts([spec({ id: 'MCU', type: 'pico2-w', holes: holes('h5') })], createBoard('full'));

    expect(parts[0]?.label).toBe('Pico 2 W');
  });

  test('keeps the label the fence wrote for a board', () => {
    const { parts } = placeParts(
      [spec({ id: 'MCU', type: 'pico', holes: holes('h5'), label: '母艦' })],
      createBoard('full'),
    );

    expect(parts[0]?.label).toBe('母艦');
  });

  test('reports a board that runs off the right edge', () => {
    const { parts, errors } = placeParts([spec({ id: 'MCU', type: 'pico', holes: holes('h20') })], board);

    expect(parts).toEqual([]);
    expect(errors[0]?.message).toContain('30');
  });

  test('claims the hole under the body of a pushbutton', () => {
    const { parts, errors } = placeParts(
      [
        spec({ id: 'SW1', type: 'pushbutton', holes: holes('e5') }),
        // e6 は足の穴ではないが、本体の下なので何も挿せない。
        spec({ id: 'R1', type: 'resistor', holes: holes('e6', 'e10'), line: 3 }),
      ],
      board,
    );

    expect(parts.map((part) => part.id)).toEqual(['SW1']);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('SW1');
  });

  test('claims the holes under a board so nothing is placed beneath it', () => {
    const { parts, errors } = placeParts(
      [
        spec({ id: 'MCU', type: 'pico', holes: holes('h5') }),
        spec({ id: 'R1', type: 'resistor', holes: holes('e10', 'e14'), line: 4 }),
      ],
      createBoard('full'),
    );

    expect(parts.map((part) => part.id)).toEqual(['MCU']);
    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('MCU');
  });

  test('leaves the rows beside a board free', () => {
    const { parts, errors } = placeParts(
      [
        spec({ id: 'MCU', type: 'pico', holes: holes('h5') }),
        // 基板は c 行と h 行にまたがるだけなので、その外側の行は空いている。
        spec({ id: 'R1', type: 'resistor', holes: holes('j10', 'j14') }),
        spec({ id: 'R2', type: 'resistor', holes: holes('b10', 'b14') }),
      ],
      createBoard('full'),
    );

    expect(errors).toEqual([]);
    expect(parts).toHaveLength(3);
  });

  test('does not claim the holes a two lead part straddles', () => {
    // 抵抗の胴は板から浮いているので、またいだ穴はそのまま使える。
    const { errors } = placeParts(
      [
        spec({ id: 'R1', type: 'resistor', holes: holes('a5', 'a10') }),
        spec({ id: 'R2', type: 'resistor', holes: holes('a7', 'a12') }),
      ],
      board,
    );

    expect(errors).toEqual([]);
  });

  test('reports a board anchored on a rail instead of a hole', () => {
    const { parts, errors } = placeParts(
      [spec({ id: 'MCU', type: 'pico', holes: holes('+t5'), line: 5 })],
      createBoard('full'),
    );

    expect(parts).toEqual([]);
    expect(errors[0]?.line).toBe(5);
  });
});
