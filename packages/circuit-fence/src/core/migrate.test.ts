import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { migrateAddresses, migrateCircuitFences } from './migrate.ts';

const fence = (...lines: string[]): string => `${lines.join('\n')}\n`;

describe('migrateAddresses の対応表', () => {
  // 52 の docs/126 §4 の表 (行 a=1 … z=26、aa=27)。
  test.each([
    ['a1', '1,1'], ['c5', '5,3'], ['a1a5', '1.5,1'], ['a1f0', '1,1.5'], ['a1f5', '1.5,1.5'],
    ['a2c0f0', '2,1.25'], ['b3h0', '3,2.7'], ['z1', '1,26'], ['aa1', '1,27'], ['az3', '3,52'],
    ['ba1', '1,53'], ['cu99', '99,99'], ['A1', '1,1'],
  ])('%s → %s', (old, spelled) => {
    const { text, changed } = migrateAddresses(fence('wires:', `  - ${old} -- e9`));
    expect(text).toBe(fence('wires:', `  - ${spelled} -- 9,5`));
    expect(changed).toBe(2);
  });
});

describe('migrateAddresses — 部品の行', () => {
  test('rewrites the two addresses of a two terminal part and leaves the value alone', () => {
    const { text } = migrateAddresses(fence('parts:', '  R1: resistor a1 c5 10k'));
    expect(text).toBe(fence('parts:', '  R1: resistor 1,1 5,3 10k'));
  });

  test('leaves a part ID that is also an old address alone', () => {
    // `C1` も `A1` も旧い読み手では番地として読めた。ID はキーなので番地ではない。
    const { text } = migrateAddresses(fence('parts:', '  C1: capacitor a1 a3 100n', '  A1: resistor b1 b3'));
    expect(text).toBe(fence('parts:', '  C1: capacitor 1,1 3,1 100n', '  A1: resistor 1,2 3,2'));
  });

  test('leaves a value that looks like an old address alone', () => {
    // 2 端子の 3 語め以降は値と札。番地の形でも番地ではない。
    const { text } = migrateAddresses(fence('parts:', '  R1: resistor a1 a3 C10', '  R2: resistor b1 b3 l=a5'));
    expect(text).toBe(fence('parts:', '  R1: resistor 1,1 3,1 C10', '  R2: resistor 1,2 3,2 l=a5'));
  });

  test('rewrites only the place of a multi terminal part, not its turn or part number', () => {
    // `r90` は旧い読み手では番地 (行 r の 90 列) としても読めた。向きの語なので残す。
    const { text } = migrateAddresses(fence(
      'parts:', '  Q1: npn d8 r90 BC547', '  U1: opamp c5 +up mirror', '  U2: ic e9 NE555', '  Q2: nmos f3 C10',
    ));
    expect(text).toBe(fence(
      'parts:', '  Q1: npn 8,4 r90 BC547', '  U1: opamp 5,3 +up mirror', '  U2: ic 9,5 NE555', '  Q2: nmos 3,6 C10',
    ));
  });

  test('rewrites the place of a one terminal part and leaves its volts and turn alone', () => {
    const { text } = migrateAddresses(fence('parts:', '  VCC: vcc d3 5V', '  G1: ground c3 r180', '  P1: port a1'));
    expect(text).toBe(fence('parts:', '  VCC: vcc 3,4 5V', '  G1: ground 3,3 r180', '  P1: port 1,1'));
  });

  test('rewrites the at: of a device written as a map, and nothing else in it', () => {
    const { text } = migrateAddresses(fence(
      'parts:', '  U1:', '    type: device', '    at: d5', '    label: a1', '    pins: [a1, b2]',
    ));
    expect(text).toBe(fence(
      'parts:', '  U1:', '    type: device', '    at: 5,4', '    label: a1', '    pins: [a1, b2]',
    ));
  });

  test('leaves a part of a kind it does not know alone, since it cannot tell the places', () => {
    const { text, changed } = migrateAddresses(fence('parts:', '  R1: resistr a1 a3'));
    expect(text).toBe(fence('parts:', '  R1: resistr a1 a3'));
    expect(changed).toBe(0);
  });

  test('keeps the quotes of a quoted line', () => {
    const { text } = migrateAddresses(fence('parts:', '  R1: "resistor a1 a3 10k"', "  R2: 'resistor b1 b3'"));
    expect(text).toBe(fence('parts:', '  R1: "resistor 1,1 3,1 10k"', "  R2: 'resistor 1,2 3,2'"));
  });

  test('quotes a line written in the flow form, where the comma would split it', () => {
    const { text } = migrateAddresses(fence('parts: { R1: resistor a1 a3 10k, R2: "capacitor b1 b3" }'));
    expect(text).toBe(fence('parts: { R1: "resistor 1,1 3,1 10k", R2: "capacitor 1,2 3,2" }'));
  });
});

describe('migrateAddresses — 配線', () => {
  test('rewrites every address of a chained wire and leaves the pins alone', () => {
    const { text } = migrateAddresses(fence('wires:', '  - a1 -- a3 -| c5', '  - U1.5 -- e5', '  - R1.2 |- Q1.B', '  - a1--b1'));
    expect(text).toBe(fence('wires:', '  - 1,1 -- 3,1 -| 5,3', '  - U1.5 -- 5,5', '  - R1.2 |- Q1.B', '  - 1,1--1,2'));
  });

  test('leaves a pin whose part ID looks like an old address alone', () => {
    const { text } = migrateAddresses(fence('wires:', '  - C1.1 -- a1.5'));
    expect(text).toBe(fence('wires:', '  - C1.1 -- a1.5'));
  });

  test('quotes the wires of a flow list', () => {
    const { text } = migrateAddresses(fence('wires: [a1 -- a3, U1.out -- b3]'));
    expect(text).toBe(fence('wires: ["1,1 -- 3,1", "U1.out -- 3,2"]'));
  });
});

describe('migrateAddresses — 番地の名前', () => {
  test('rewrites where a name points and leaves the names alone', () => {
    const { text } = migrateAddresses(fence(
      'points:', '  vin: a1', '  out: c5f0', 'parts:', '  R1: resistor vin out', 'wires:', '  - vin -- a5',
    ));
    expect(text).toBe(fence(
      'points:', '  vin: 1,1', '  out: 5,3.5', 'parts:', '  R1: resistor vin out', 'wires:', '  - vin -- 5,1',
    ));
  });

  test('quotes where a name points in the flow form', () => {
    const { text } = migrateAddresses(fence('points: { vin: a1, out: c5 }'));
    expect(text).toBe(fence('points: { vin: "1,1", out: "5,3" }'));
  });
});

describe('migrateAddresses — 注釈', () => {
  test('rewrites a mark that points at a place, and leaves one that points at a part', () => {
    // 旧い読み手は**部品を先に**引いた。`C1` という部品がある図の `circle C1` は部品。
    const { text } = migrateAddresses(fence(
      'parts:', '  C1: capacitor a1 a3', 'notes:', '  - circle C1', '  - circle c1', '  - circle b2 blue',
    ));
    expect(text).toBe(fence(
      'parts:', '  C1: capacitor 1,1 3,1', 'notes:', '  - circle C1', '  - circle 1,3', '  - circle 2,2 blue',
    ));
  });

  test('rewrites the places of boxes, arrows, lines and source, and leaves their words alone', () => {
    const { text } = migrateAddresses(fence(
      'parts:', '  R1: resistor a1 a3',
      'notes:', '  - box a1 c3 blue solid', '  - arrow a5 R1 red', '  - line a1 a5', '  - source a6 blue tiny',
    ));
    expect(text).toBe(fence(
      'parts:', '  R1: resistor 1,1 3,1',
      'notes:', '  - box 1,1 3,3 blue solid', '  - arrow 5,1 R1 red', '  - line 1,1 5,1', '  - source 6,1 blue tiny',
    ));
  });

  test('rewrites the place of a text and leaves its words and body alone', () => {
    const { text } = migrateAddresses(fence('notes:', '  - text b1 blue r90: "R1: resistor a1 a3"', '  - text c2 small: "a1 の点"'));
    expect(text).toBe(fence('notes:', '  - text 1,2 blue r90: "R1: resistor a1 a3"', '  - text 2,3 small: "a1 の点"'));
  });

  test('quotes a text key written in the flow form', () => {
    const { text } = migrateAddresses(fence('notes:', '  - { text b1: ここ }'));
    expect(text).toBe(fence('notes:', '  - { "text 1,2": ここ }'));
  });
});

describe('migrateAddresses — そのほか', () => {
  test('rewrites grid-to, quoting it in the flow form', () => {
    expect(migrateAddresses(fence('style:', '  grid-to: e12')).text).toBe(fence('style:', '  grid-to: 12,5'));
    expect(migrateAddresses(fence('style: { grid: on, grid-to: e12 }')).text)
      .toBe(fence('style: { grid: on, grid-to: "12,5" }'));
  });

  test('leaves the title, the comments and the words of style alone', () => {
    const source = fence('title: a1 から c5 へ', '# a1 は左上', 'style:', '  theme: dark', 'parts:', '  R1: resistor a1 a3 # a1');
    expect(migrateAddresses(source).text).toBe(fence(
      'title: a1 から c5 へ', '# a1 は左上', 'style:', '  theme: dark', 'parts:', '  R1: resistor 1,1 3,1 # a1',
    ));
  });

  test('keeps a trailing comment where it was, eating the spaces the longer spelling needs', () => {
    const { text } = migrateAddresses(fence('parts:', '  VCC: vcc a1      # 電源', '  R1: resistor a1 a3 # 1 つだけ'));
    expect(text).toBe(fence('parts:', '  VCC: vcc 1,1     # 電源', '  R1: resistor 1,1 3,1 # 1 つだけ'));
  });

  test('leaves a fence already in the new spelling as it is', () => {
    const source = fence('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 1,1 -- 1,3');
    expect(migrateAddresses(source)).toEqual({ text: source, changed: 0, skipped: [] });
  });

  test('leaves what the old reader could not read, and says so', () => {
    const { text, changed, skipped } = migrateAddresses(fence('parts:', '  R1: resistor a0 a3', 'wires:', '  - zz1 -- a1'));
    expect(text).toBe(fence('parts:', '  R1: resistor a0 3,1', 'wires:', '  - zz1 -- 1,1'));
    expect(changed).toBe(2);
    expect(skipped).toEqual(['a0', 'zz1']);
  });

  test('leaves text that is not YAML at all as it is', () => {
    expect(migrateAddresses('parts: [').text).toBe('parts: [');
    expect(migrateAddresses('').text).toBe('');
  });

  test('draws the same circuit before and after', () => {
    const before = fence(
      'points:', '  vin: a1',
      'parts:', '  V1: battery vin c1 5', '  R1: resistor a1 a3 1k', '  D1: led a3 c3', '  G1: ground c1',
      'wires:', '  - c1 -- c3',
    );
    const { text } = migrateAddresses(before);
    const result = compileCircuit(text);
    expect(result.errors).toEqual([]);
    expect(result.netlist.map((net) => net.name)).toContain('vin');
  });
});

describe('migrateCircuitFences', () => {
  test('rewrites only the circuit fences of a document', () => {
    const markdown = [
      '# a1 の図', '', '```circuit', 'parts:', '  R1: resistor a1 a3', '```', '',
      '```breadboard', 'parts:', '  R1: resistor a1 a5', '```', '',
      '- 箇条書きの中', '  ```circuit', '  wires:', '    - a1 -- c5', '  ```', '',
    ].join('\n');
    const { text, changed } = migrateCircuitFences(markdown);
    expect(text).toBe([
      '# a1 の図', '', '```circuit', 'parts:', '  R1: resistor 1,1 3,1', '```', '',
      '```breadboard', 'parts:', '  R1: resistor a1 a5', '```', '',
      '- 箇条書きの中', '  ```circuit', '  wires:', '    - 1,1 -- 5,3', '  ```', '',
    ].join('\n'));
    expect(changed).toBe(4);
  });

  test('keeps the line endings of a CRLF document', () => {
    const markdown = '```circuit\r\nwires:\r\n  - a1 -- a3\r\n```\r\n';
    expect(migrateCircuitFences(markdown).text).toBe('```circuit\r\nwires:\r\n  - 1,1 -- 3,1\r\n```\r\n');
  });
});
