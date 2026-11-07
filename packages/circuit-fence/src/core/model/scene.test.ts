import { describe, expect, test } from 'vitest';
import { pinProbe, readPinProbe, scenesOfCircuit } from '../index.ts';

const fence = (...lines: string[]) => lines.join('\n');

describe('the scene that fence-check reads (52 docs/148)', () => {
  test('two-terminal parts give a body and a lead; wires bend at their corner', () => {
    const [scene] = scenesOfCircuit(fence(
      'parts:',
      '  V1: dc 1,3 1,1 5V',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - 3,1 -| 1,3',
    ));
    expect(scene?.approximate).toBe(true);
    expect(scene?.parts.map((part) => part.id)).toEqual(['V1', 'R1']);
    expect(scene?.wires.filter((wire) => wire.lead === true).map((wire) => wire.id)).toEqual(['V1', 'R1']);
    const bent = scene?.wires.find((wire) => wire.id === 'wire(3,1-1,3)');
    expect(bent?.points).toHaveLength(3);
  });

  test('wires to pins of multi-terminal parts are only counted as skipped', () => {
    const [scene] = scenesOfCircuit(fence(
      'parts:',
      '  Q1: npn 3,3',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - 3,1 -- Q1.C',
    ));
    expect(scene?.skipped).toBe(1);
  });

  test('a short has a lead but no body', () => {
    const [scene] = scenesOfCircuit(fence('parts:', '  S1: short 1,1 3,1'));
    expect(scene?.parts).toEqual([]);
    expect(scene?.wires).toHaveLength(1);
  });

  test('no parts, no scene', () => {
    expect(scenesOfCircuit('title: 空\n')).toEqual([]);
  });
});

describe('pin positions asked of TeX (52 docs/148)', () => {
  const source = fence(
    'parts:',
    '  Q1: npn 3,3',
    '  R1: resistor 1,1 3,1 1k',
    'wires:',
    '  - 3,1 -- Q1.C',
  );

  test('the probe asks for every pin a wire reaches and the outline of each multi-terminal part', () => {
    const probe = pinProbe(source);
    expect(probe?.keys).toEqual(['part-Q1.collector', 'part-Q1|east', 'part-Q1|north', 'part-Q1|west', 'part-Q1|south']);
    expect(probe?.tex).toContain('\\pgfpointanchor{part-Q1}{collector}\\typeout{FCPIN|0|');
    expect(probe?.tex).toContain('\\pgfpointanchor{part-Q1}{north}');
    // 問い合わせは図の終わりの内側に置く (ノードが見える所)。
    expect(probe!.tex.indexOf('FCPIN')).toBeLessThan(probe!.tex.lastIndexOf('\\end{circuitikz}'));
  });

  test('nothing to ask, no probe', () => {
    expect(pinProbe(fence('parts:', '  R1: resistor 1,1 3,1 1k'))).toBeNull();
    expect(pinProbe('title: 空\n')).toBeNull();
  });

  test('the log is read back in px, with y turned downwards', () => {
    const points = readPinProbe('x\nFCPIN|0|113.81097pt|-95.0321pt\nFCPIN|9|1pt|1pt\n', ['part-Q1.collector']);
    const pin = points.get('part-Q1.collector');
    expect(pin?.x).toBeCloseTo(151.18, 1);
    expect(pin?.y).toBeCloseTo(126.23, 1);
    expect(points.size).toBe(1);
  });

  test('with the probed points, pin wires are checked and the part gets a body', () => {
    const probed = new Map([
      ['part-Q1.collector', { x: 151.18, y: 126.23 }],
      ['part-Q1|east', { x: 170, y: 150 }],
      ['part-Q1|north', { x: 150, y: 120 }],
      ['part-Q1|west', { x: 130, y: 150 }],
      ['part-Q1|south', { x: 150, y: 180 }],
    ]);
    const [scene] = scenesOfCircuit(source, probed);
    expect(scene?.skipped).toBe(0);
    expect(scene?.wires.find((wire) => wire.id === 'wire(3,1-Q1.collector)')?.points).toEqual([
      { x: expect.closeTo(151.18, 1), y: 0 }, { x: 151.18, y: 126.23 },
    ]);
    const body = scene?.parts.find((part) => part.id === 'Q1');
    expect(body?.rect).toMatchObject({ cx: 150, cy: 150, width: 40, height: 60 });
    expect(body?.pins).toEqual([{ x: 151.18, y: 126.23 }]);
    expect(body?.joins).toEqual([{ x: expect.closeTo(151.18, 1), y: expect.closeTo(151.18, 1) }]);
  });

  test('a bent wire to a pin turns where TikZ turns it', () => {
    const bent = fence('parts:', '  Q1: npn 3,3', '  R1: resistor 1,1 2,1 1k', 'wires:', '  - 2,1 -| Q1.C');
    const [scene] = scenesOfCircuit(bent, new Map([['part-Q1.collector', { x: 150, y: 120 }]]));
    expect(scene?.wires.find((wire) => wire.id === 'wire(2,1-Q1.collector)')?.points).toHaveLength(3);
  });
});
