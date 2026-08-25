import { describe, expect, test } from 'vitest';
import { buildCircuit } from './circuit.ts';
import { parseFence } from '../parser/parseFence.ts';
import { computeNets } from './nets.ts';

const netsOf = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return computeNets(buildCircuit(doc).circuit);
};

describe('computeNets', () => {
  test('derives the three nets of an RC low pass', () => {
    const nets = netsOf(
      'parts:',
      '  IN:  port a1',
      '  R1:  resistor a1 a3 10k',
      '  C1:  capacitor a3 c3 100n',
      '  OUT: port a4',
      '  G1:  ground c3',
      'wires:',
      '  - a3 -- a4',
    );

    expect(nets).toEqual([
      { name: 'IN', refs: ['IN', 'R1.1'] },
      { name: 'OUT', refs: ['R1.2', 'C1.1', 'OUT'] },
      { name: 'GND', refs: ['C1.2', 'G1'] },
    ]);
  });

  test('names a net after the port that hangs off it', () => {
    const nets = netsOf('parts:', '  VIN: port a1', '  R1: resistor a1 a3');

    expect(nets[0]).toMatchObject({ name: 'VIN' });
  });

  test('numbers a net that no port names', () => {
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor a3 a5');

    expect(nets.map((net) => net.name)).toEqual(['N1', 'N2', 'N3']);
  });

  test('never gives two nets the same name', () => {
    // ポートを N1 と名付けても、別のネットに N1 を振らない
    // (同じ名前が 2 つあるとテキストで突き合わせられない)。
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor b1 b3', '  N1: port b1');

    expect(new Set(nets.map((net) => net.name)).size).toBe(nets.length);
    expect(nets.some((net) => net.refs.includes('N1'))).toBe(true);
  });

  test('leaves GND to the ground even when a port is called that', () => {
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor b1 b3', '  GND: port b1', '  G1: ground a3');

    expect(new Set(nets.map((net) => net.name)).size).toBe(nets.length);
  });

  test('joins two cells that a wire connects', () => {
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor a5 a7', 'wires:', '  - a3 -- a5');

    expect(nets.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2', 'R2.1'], ['R2.2']]);
  });

  test('treats every ground symbol as the same node, the way a schematic does', () => {
    const nets = netsOf(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor b1 b3',
      '  G1: ground a3',
      '  G2: ground b3',
    );

    // 並びは部品を書いた順。
    const ground = nets.find((net) => net.name === 'GND');
    expect(ground?.refs).toEqual(['R1.2', 'R2.2', 'G1', 'G2']);
    expect(nets.filter((net) => net.name === 'GND')).toHaveLength(1);
  });

  test('calls a grounded net GND even when a port also names it', () => {
    const nets = netsOf('parts:', '  VSS: port c3', '  G1: ground c3', '  R1: resistor a3 c3');

    expect(nets.find((net) => net.refs.includes('G1'))?.name).toBe('GND');
  });

  test('follows a chain of wires through several cells', () => {
    const nets = netsOf(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor a7 a9',
      'wires:',
      '  - a3 -- a5',
      '  - a5 -- a7',
    );

    expect(nets.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2', 'R2.1'], ['R2.2']]);
  });

  test('joins the cells a slanted wire connects', () => {
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor c5 c7', 'wires:', '  - a3 -- c5');

    expect(nets[1]?.refs).toEqual(['R1.2', 'R2.1']);
  });

  test('returns nothing for a circuit with no parts', () => {
    expect(netsOf('wires:', '  - a1 -- a3')).toEqual([]);
  });
});

describe('computeNets の折れた配線', () => {
  test('joins the two ends of a bent wire', () => {
    const nets = netsOf('parts:', '  R1: resistor a1 a3', '  R2: resistor c5 c7', 'wires:', '  - a3 -| c5');

    expect(nets[1]?.refs).toEqual(['R1.2', 'R2.1']);
  });

  test('takes in whatever sits on the corner it turns at', () => {
    // 曲がり角 a5 に乗っている端も同じネット。
    const nets = netsOf(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor a5 a7',
      '  R3: resistor c5 c7',
      'wires:',
      '  - a3 -| c5',
    );

    const net = nets.find((candidate) => candidate.refs.includes('R1.2'));
    expect(net?.refs).toEqual(['R1.2', 'R2.1', 'R3.1']);
  });
});

describe('computeNets の T 字', () => {
  test('joins a part terminal that lands in the middle of a wire', () => {
    // R2 の上端 b3 が、配線 b1 -- b5 の途中に乗る。
    const nets = netsOf(
      'parts:',
      '  R1: resistor b1 d1',
      '  R2: resistor b3 d3',
      'wires:',
      '  - b1 -- b5',
    );

    const net = nets.find((candidate) => candidate.refs.includes('R1.1'));
    expect(net?.refs).toContain('R2.1');
  });

  test('leaves a plain crossing as two nets', () => {
    // 縦と横が交わるだけで、どちらの端でもない。
    const nets = netsOf(
      'parts:',
      '  R1: resistor a3 c3',
      '  R2: resistor b1 b5',
    );

    expect(nets.every((net) => net.refs.length === 1)).toBe(true);
  });
});

describe('電源レールの名前', () => {
  test('names a net after the power rail that hangs off it', () => {
    // レールは端子と同じで、乗っているネットに名前を与える。
    const nets = netsOf('parts:', '  V5: vcc a1', '  R1: resistor a1 a3');

    expect(nets[0]).toMatchObject({ name: 'V5', refs: ['V5', 'R1.1'] });
  });

  test('keeps two rails apart until they are wired', () => {
    // グラウンドだけが「離して描いても同じ節点」。レールは自動でつながない
    // (5V と 3V3 を同じネットにしてしまうため)。
    const nets = netsOf('parts:', '  V5: vcc a1', '  V3: vcc c1', '  R1: resistor a1 a3');

    expect(nets.map((net) => net.name)).toEqual(['V5', 'V3', 'N1']);
  });
});
