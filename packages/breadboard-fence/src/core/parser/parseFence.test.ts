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
    expect(doc?.board.size).toBe('half');
    expect(doc?.parts.map((part) => part.id)).toEqual(['R1', 'D1']);
    expect(doc?.wires).toHaveLength(2);
  });

  test('defaults the board to half size when it is not written', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a5 a10 330\n');

    expect(doc?.board.size).toBe('half');
  });

  test('reads the board map form with every printing option', () => {
    const { doc, errors } = parseFence(
      ['board:', '  size: full', '  rails: "+-+-"', '  letters: upper', '  numbers: all', ''].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(doc?.board).toEqual({
      size: 'full',
      rails: ['+t', '-t', '+b', '-b'],
      letters: 'upper',
      numbers: 'all',
    });
  });

  test('keeps the defaults for board entries that are not written', () => {
    const { doc, errors } = parseFence('board:\n  size: full\n');

    expect(errors).toEqual([]);
    expect(doc?.board).toEqual({
      size: 'full',
      rails: ['+t', '-t', '-b', '+b'],
      letters: 'lower',
      numbers: 'every-5',
    });
  });

  test('reads every rail arrangement that has one of each polarity per side', () => {
    const { doc, errors } = parseFence('board:\n  rails: "-++-"\n');

    expect(errors).toEqual([]);
    expect(doc?.board.rails).toEqual(['-t', '+t', '+b', '-b']);
  });

  test('reports each unreadable board entry on its own line and keeps the defaults', () => {
    const { doc, errors } = parseFence(
      ['board:', '  size: giant', '  rails: "++--"', '  letters: caps', '  numbers: some', ''].join('\n'),
    );

    expect(errors.map((error) => error.line)).toEqual([2, 3, 4, 5]);
    expect(doc?.board).toEqual({
      size: 'half',
      rails: ['+t', '-t', '-b', '+b'],
      letters: 'lower',
      numbers: 'every-5',
    });
  });

  test('reports an unknown board key with its name', () => {
    const { errors } = parseFence('board:\n  color: red\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('color');
    expect(errors[0]?.line).toBe(2);
  });

  test('reports a board that is neither a size nor a map', () => {
    const { doc, errors } = parseFence('board:\n  - half\n');

    expect(errors).toHaveLength(1);
    expect(doc?.board.size).toBe('half');
  });

  test('a later board key merges onto the earlier one instead of resetting it', () => {
    const { doc, errors } = parseFence('board: full\nboard:\n  rails: "+-+-"\n');

    expect(errors).toEqual([]);
    expect(doc?.board.size).toBe('full');
    expect(doc?.board.rails).toEqual(['+t', '-t', '+b', '-b']);
  });

  test('a later board size keeps the rails written earlier', () => {
    // サイズの既定でレールを上書きしてよいのは、レールを一度も書いていないときだけ。
    const { doc, errors } = parseFence('board:\n  rails: "+-+-"\nboard: half\n');

    expect(errors).toEqual([]);
    expect(doc?.board.rails).toEqual(['+t', '-t', '+b', '-b']);
  });

  test('a later mini size keeps the rails written earlier', () => {
    const { doc, errors } = parseFence('board:\n  rails: "+--+"\nboard: mini\n');

    expect(errors).toEqual([]);
    expect(doc?.board.size).toBe('mini');
    expect(doc?.board.rails).toEqual(['+t', '-t', '-b', '+b']);
  });

  test('an unreadable later board keeps the earlier value', () => {
    const { doc, errors } = parseFence('board: full\nboard: giant\n');

    expect(errors).toHaveLength(1);
    expect(doc?.board.size).toBe('full');
  });

  test('reports the line number of an unknown top level key', () => {
    const { errors } = parseFence('board: half\nwiring:\n  - a1 -- b1\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('wiring');
  });

  test('reports an unknown board size and names every size it knows', () => {
    const { errors } = parseFence('board: enormous\n');

    expect(errors[0]?.line).toBe(1);
    for (const size of ['mini', 'half', 'full']) {
      expect(errors[0]?.message).toContain(size);
    }
  });

  test('reads the mini size and leaves it without power rails', () => {
    // 170 穴のミニは実物にレールが無い。サイズが決めるのは既定までで、rails を書けば覆せる。
    const { doc, errors } = parseFence('board: mini\n');

    expect(errors).toEqual([]);
    expect(doc?.board.size).toBe('mini');
    expect(doc?.board.rails).toBeNull();
  });

  test('puts rails on a mini board when they are written', () => {
    const { doc, errors } = parseFence('board:\n  size: mini\n  rails: "+--+"\n');

    expect(errors).toEqual([]);
    expect(doc?.board.rails).toEqual(['+t', '-t', '-b', '+b']);
  });

  test('takes the rails off a half board when none is written', () => {
    const { doc, errors } = parseFence('board:\n  rails: none\n');

    expect(errors).toEqual([]);
    expect(doc?.board.size).toBe('half');
    expect(doc?.board.rails).toBeNull();
  });

  test('keeps the written rails whichever order the board entries come in', () => {
    const { doc, errors } = parseFence('board:\n  rails: "+--+"\n  size: mini\n');

    expect(errors).toEqual([]);
    expect(doc?.board.rails).toEqual(['+t', '-t', '-b', '+b']);
  });

  test('offers none when the rails cannot be read', () => {
    const { errors } = parseFence('board:\n  rails: "++--"\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('none');
  });

  test('shows the parts list below the drawing when it is not written', () => {
    const { doc, errors } = parseFence(led);

    expect(errors).toEqual([]);
    expect(doc?.partsList).toBe('below');
  });

  test('reads the parts list being turned off', () => {
    const { doc, errors } = parseFence('parts-list: none\nparts:\n  R1: resistor a5 a10\n');

    expect(errors).toEqual([]);
    expect(doc?.partsList).toBe('none');
  });

  test('reports an unreadable parts list value on its line and keeps the default', () => {
    const { doc, errors } = parseFence('board: half\nparts-list: hidden\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(doc?.partsList).toBe('below');
  });

  test('an unreadable later parts list keeps the earlier value', () => {
    const { doc, errors } = parseFence('parts-list: none\nparts-list: nope\n');

    expect(errors).toHaveLength(1);
    expect(doc?.partsList).toBe('none');
  });

  test('names the parts list among the keys an unknown top level key could have been', () => {
    const { errors } = parseFence('partlist: none\n');

    expect(errors[0]?.message).toContain('parts-list');
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

  test('points at the line of a device that carries a value nobody draws', () => {
    const { doc, errors } = parseFence(
      ['parts:', '  BAT:', '    type: device', '    label: 電池', '    value: 3V', '    pins: ["+", "-"]', ''].join('\n'),
    );

    // 機器は描けるので残す。捨てるのは value だけで、そのことは行番号つきで言う。
    expect(doc?.parts[0]).toMatchObject({ id: 'BAT', type: 'device', label: '電池', value: null });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('BAT');
    expect(errors[0]?.message).toContain('value');
    expect(errors[0]?.line).toBe(2);
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

  test('reports a duplicate part id even when parts is written twice', () => {
    const { doc, errors } = parseFence(
      ['parts:', '  R1: resistor a5 a10', 'parts:', '  R1: resistor b5 b10'].join('\n'),
    );

    expect(doc?.parts).toHaveLength(1);
    expect(errors.some((error) => error.message.includes('R1'))).toBe(true);
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
