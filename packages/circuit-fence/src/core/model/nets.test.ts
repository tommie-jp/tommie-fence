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
      '  IN:  port 1,1',
      '  R1:  resistor 1,1 3,1 10k',
      '  C1:  capacitor 3,1 3,3 100n',
      '  OUT: port 4,1',
      '  G1:  ground 3,3',
      'wires:',
      '  - 3,1 -- 4,1',
    );

    expect(nets).toEqual([
      { name: 'IN', refs: ['IN', 'R1.1'] },
      { name: 'OUT', refs: ['R1.2', 'C1.1', 'OUT'] },
      { name: 'GND', refs: ['C1.2', 'G1'] },
    ]);
  });

  test('names a net after the port that hangs off it', () => {
    const nets = netsOf('parts:', '  VIN: port 1,1', '  R1: resistor 1,1 3,1');

    expect(nets[0]).toMatchObject({ name: 'VIN' });
  });

  test('numbers a net that no port names', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1');

    expect(nets.map((net) => net.name)).toEqual(['N1', 'N2', 'N3']);
  });

  test('never gives two nets the same name', () => {
    // ポートを N1 と名付けても、別のネットに N1 を振らない
    // (同じ名前が 2 つあるとテキストで突き合わせられない)。
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,2 3,2', '  N1: port 1,2');

    expect(new Set(nets.map((net) => net.name)).size).toBe(nets.length);
    expect(nets.some((net) => net.refs.includes('N1'))).toBe(true);
  });

  test('leaves GND to the ground even when a port is called that', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,2 3,2', '  GND: port 1,2', '  G1: ground 3,1');

    expect(new Set(nets.map((net) => net.name)).size).toBe(nets.length);
  });

  test('joins two cells that a wire connects', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 5,1 7,1', 'wires:', '  - 3,1 -- 5,1');

    expect(nets.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2', 'R2.1'], ['R2.2']]);
  });

  test('treats every ground symbol as the same node, the way a schematic does', () => {
    const nets = netsOf(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 1,2 3,2',
      '  G1: ground 3,1',
      '  G2: ground 3,2',
    );

    // 並びは部品を書いた順。
    const ground = nets.find((net) => net.name === 'GND');
    expect(ground?.refs).toEqual(['R1.2', 'R2.2', 'G1', 'G2']);
    expect(nets.filter((net) => net.name === 'GND')).toHaveLength(1);
  });

  test('calls a grounded net GND even when a port also names it', () => {
    const nets = netsOf('parts:', '  VSS: port 3,3', '  G1: ground 3,3', '  R1: resistor 3,1 3,3');

    expect(nets.find((net) => net.refs.includes('G1'))?.name).toBe('GND');
  });

  test('follows a chain of wires through several cells', () => {
    const nets = netsOf(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 7,1 9,1',
      'wires:',
      '  - 3,1 -- 5,1',
      '  - 5,1 -- 7,1',
    );

    expect(nets.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2', 'R2.1'], ['R2.2']]);
  });

  test('joins the cells a slanted wire connects', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 5,3 7,3', 'wires:', '  - 3,1 -- 5,3');

    expect(nets[1]?.refs).toEqual(['R1.2', 'R2.1']);
  });

  test('returns nothing for a circuit with no parts', () => {
    expect(netsOf('wires:', '  - 1,1 -- 3,1')).toEqual([]);
  });
});

describe('computeNets の折れた配線', () => {
  test('joins the two ends of a bent wire', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 5,3 7,3', 'wires:', '  - 3,1 -| 5,3');

    expect(nets[1]?.refs).toEqual(['R1.2', 'R2.1']);
  });

  test('takes in whatever sits on the corner it turns at', () => {
    // 曲がり角 a5 に乗っている端も同じネット。
    const nets = netsOf(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 5,1 7,1',
      '  R3: resistor 5,3 7,3',
      'wires:',
      '  - 3,1 -| 5,3',
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
      '  R1: resistor 1,2 1,4',
      '  R2: resistor 3,2 3,4',
      'wires:',
      '  - 1,2 -- 5,2',
    );

    const net = nets.find((candidate) => candidate.refs.includes('R1.1'));
    expect(net?.refs).toContain('R2.1');
  });

  test('leaves a plain crossing as two nets', () => {
    // 縦と横が交わるだけで、どちらの端でもない。
    const nets = netsOf(
      'parts:',
      '  R1: resistor 3,1 3,3',
      '  R2: resistor 1,2 5,2',
    );

    expect(nets.every((net) => net.refs.length === 1)).toBe(true);
  });
});

describe('電源レールの名前', () => {
  test('names a net after the power rail that hangs off it', () => {
    // レールは端子と同じで、乗っているネットに名前を与える。
    const nets = netsOf('parts:', '  V5: vcc 1,1', '  R1: resistor 1,1 3,1');

    expect(nets[0]).toMatchObject({ name: 'V5', refs: ['V5', 'R1.1'] });
  });

  test('joins rails that carry the same name, the way a schematic is read', () => {
    // `VCC` を何か所にも描くのは回路図の書き方そのもの。離して描いても
    // 指しているネットは 1 つで、端子は 1 回だけ並ぶ。
    const nets = netsOf(
      'parts:', '  VCC: vcc 1,1', '  VCC: vcc 1,3',
      '  R1: resistor 1,1 3,1', '  R2: resistor 1,3 3,3',
    );

    expect(nets[0]).toMatchObject({ name: 'VCC', refs: ['VCC', 'R1.1', 'R2.1'] });
  });

  test('joins ports of the same name too — the id is the net name for those as well', () => {
    const nets = netsOf('parts:', '  IN: port 1,1', '  IN: port 1,3', '  R1: resistor 1,1 3,1');

    expect(nets[0]).toMatchObject({ name: 'IN' });
    expect(nets.filter((net) => net.name === 'IN')).toHaveLength(1);
  });

  test('keeps two rails apart until they are wired', () => {
    // グラウンドだけが「離して描いても同じ節点」。レールは自動でつながない
    // (5V と 3V3 を同じネットにしてしまうため)。
    const nets = netsOf('parts:', '  V5: vcc 1,1', '  V3: vcc 1,3', '  R1: resistor 1,1 3,1');

    expect(nets.map((net) => net.name)).toEqual(['V5', 'V3', 'N1']);
  });
});

describe('computeNets の番地の名前', () => {
  test('names a net after the point sitting on it', () => {
    const nets = netsOf(
      'points:', '  fb: 3,1',
      'parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1',
    );

    expect(nets.some((net) => net.name === 'fb')).toBe(true);
  });

  test('lets a port keep the name when both are on the net', () => {
    // 名前は図に出ないが、ポートの名前は図に出る。図と突き合わせるための
    // 出力なので、図に見えているほうを優先する。
    const nets = netsOf(
      'points:', '  fb: 1,1',
      'parts:', '  IN: port 1,1', '  R1: resistor 1,1 3,1',
    );

    expect(nets.some((net) => net.name === 'IN')).toBe(true);
    expect(nets.some((net) => net.name === 'fb')).toBe(false);
  });

  test('leaves unnamed nets on the numbered names', () => {
    const nets = netsOf('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1');

    expect(nets.some((net) => net.name.startsWith('N'))).toBe(true);
  });
});

describe('computeNets の T 字 (交点の間)', () => {
  test('joins an end that sits on a wire between the cells', () => {
    // v80j4e1 -- y86c1c9 のちょうど真ん中が x83a3i0。数としては線の上に
    // 乗っているのに、掛け算の丸め (誤差 1e-14) で「乗っていない」と読むと、
    // 図では触れて見えるのにネットリストだけが割れる。
    const nets = netsOf(
      'parts:',
      '  IN: port 80.41,22.94',
      '  R1: resistor 83.3,24.08 1,1',
      'wires:',
      '  - 80.41,22.94 -- 86.19,25.22',
    );

    expect(nets[0]).toMatchObject({ name: 'IN', refs: ['IN', 'R1.1'] });
  });
});
