import { describe, expect, test } from 'vitest';
import { movableNodes, movePoint } from './point.ts';
import { applyEdits } from './shared.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';

const at = (written: string): Address => parseAddress(written) as Address;

const NAMED = [
  'title: t',
  'points:',
  '  fb: c3',
  'parts:',
  '  R2: resistor fb d3 1k',
  '  R3: resistor fb c5 10k',
  'wires:',
  '  - fb -- c1',
  '',
].join('\n');

const BARE = [
  'parts:',
  '  R1: resistor a1 b1 1k',
  '  R2: resistor a1 c1 2k',
  '  R3: resistor d1 d2 3k',
  'wires:',
  '  - a1 -- a5',
  '',
].join('\n');

const moved = (source: string, from: string, to: string): string => {
  const result = movePoint(source, at(from), at(to));
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('movableNodes', () => {
  test('lists the crossings something is written at', () => {
    const nodes = movableNodes(BARE).map((node) => formatAddress(node.address));

    expect(nodes).toContain('a1');
    expect(nodes).toContain('b1');
    expect(nodes).toContain('a5');
  });

  test('names a node that points: gave a name', () => {
    const fb = movableNodes(NAMED).find((node) => formatAddress(node.address) === 'c3');

    expect(fb?.name).toBe('fb');
  });

  test('counts how many places write the node, so the map can weight the dot', () => {
    const a1 = movableNodes(BARE).find((node) => formatAddress(node.address) === 'a1');

    // R1 の端・R2 の端・配線の端で 3 か所。
    expect(a1?.uses).toBe(3);
  });

  test('is empty when the fence cannot be read, rather than showing a made-up grid', () => {
    expect(movableNodes('parts:\n  R1: nonsuch a1 b1\nbroken: [')).toEqual([]);
  });
});

describe('movePoint (名前のある節点)', () => {
  test('rewrites the one points: line, so everything that named it follows', () => {
    const result = movePoint(NAMED, at('c3'), at('c4'));

    expect(result.ok && result.value.edits).toHaveLength(1);
    expect(result.ok && result.value.edits[0]?.line).toBe(3);
  });

  test('leaves the parts and wires that wrote the name untouched', () => {
    expect(moved(NAMED, 'c3', 'c4')).toContain('  fb: c4');
    expect(moved(NAMED, 'c3', 'c4')).toContain('  R2: resistor fb d3 1k');
  });

  test('keeps the comments and the spacing that were written by hand', () => {
    const written = 'points:\n  # 帰還の節点\n  fb:  c3\nparts:\n  R2: resistor fb d3\n';

    expect(moved(written, 'c3', 'c4')).toContain('# 帰還の節点');
    expect(moved(written, 'c3', 'c4')).toContain('  fb:  c4');
  });
});

describe('movePoint (名前のない節点)', () => {
  test('rewrites every place the address was written', () => {
    const after = moved(BARE, 'a1', 'a2');

    expect(after).toContain('  R1: resistor a2 b1 1k');
    expect(after).toContain('  R2: resistor a2 c1 2k');
    expect(after).toContain('  - a2 -- a5');
  });

  test('does not touch a part name that is spelled like the address', () => {
    // `C1:` は番地 `c1` としても読めるので、鍵まで書き換えると部品の名前が変わる。
    const written = 'parts:\n  C1: capacitor c1 d3 1u\n';

    expect(moved(written, 'c1', 'c2')).toContain('  C1: capacitor c2 d3 1u');
  });

  test('refuses a move that would squash a part to nothing', () => {
    // `R1 a1 b1` の a1 を b1 へ寄せると `b1 -- b1` になり、部品が長さ 0 になる。
    const result = movePoint(BARE, at('a1'), at('b1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R1');
  });

  test('says which connections the move makes, so the caller can confirm', () => {
    // d1 には R3 の端が来ている。同じ交点 = 接続なので、寄せるとつながる。
    const result = movePoint(BARE, at('a1'), at('d1'));

    expect(result.ok && result.value.diff.gained.length).toBeGreaterThan(0);
  });

  test('refuses a move that would squash a wire to nothing', () => {
    const result = movePoint(BARE, at('a1'), at('a5'));

    expect(result.ok).toBe(false);
  });
});

describe('movePoint (名前と生の綴りが混ざった節点)', () => {
  const MIXED = [
    'points:',
    '  fb: c3',
    'parts:',
    '  R1: resistor fb d3',
    '  R2: resistor c3 e3',
    '',
  ].join('\n');

  test('takes the bare spellings along, so the node moves whole', () => {
    const after = moved(MIXED, 'c3', 'c4');

    expect(after).toContain('  fb: c4');
    expect(after).toContain('  R2: resistor c4 e3');
  });

  test('keeps every connection, which is the promise of moving a node', () => {
    const result = movePoint(MIXED, at('c3'), at('c4'));

    expect(result.ok && result.value.diff).toEqual({ lost: [], gained: [] });
  });
});

describe('movePoint が触らないところ', () => {
  test('leaves the title alone even when it spells the address', () => {
    const written = 'title: a1 から見る\nparts:\n  R1: resistor a1 b1\n';
    const after = moved(written, 'a1', 'a2');

    expect(after).toContain('title: a1 から見る');
    expect(after).toContain('  R1: resistor a2 b1');
  });

  test('leaves notes alone — a note may spell a part name like an address', () => {
    // `circle C1 red` の C1 は部品の名前。番地 `c1` としても読めるが、書き換えると
    // 注釈の指し先が壊れる。
    const written = 'parts:\n  C1: capacitor c1 d3 1u\n  R1: resistor c1 e1 1k\nnotes:\n  - circle C1 red\n';
    const after = moved(written, 'c1', 'c2');

    expect(after).toContain('  - circle C1 red');
    expect(after).toContain('  C1: capacitor c2 d3 1u');
    expect(after).toContain('  R1: resistor c2 e1 1k');
  });

  test('leaves a positional note where it was written (注釈は紙面に付く)', () => {
    const written = 'parts:\n  R1: resistor a1 b1\nnotes:\n  - source a1 blue\n';

    expect(moved(written, 'a1', 'a2')).toContain('  - source a1 blue');
  });

  test('leaves style values alone even when they spell an address', () => {
    const written = 'style:\n  grid: on\n  grid-to: e5\nparts:\n  R1: resistor a1 e5\n';
    const after = moved(written, 'e5', 'e6');

    expect(after).toContain('  grid-to: e5');
    expect(after).toContain('  R1: resistor a1 e6');
  });

  test('leaves a comment on the part line alone', () => {
    const written = 'parts:\n  R1: resistor a1 b1 # a1 の脇\n';
    const after = moved(written, 'a1', 'a2');

    expect(after).toContain('# a1 の脇');
    expect(after).toContain('  R1: resistor a2 b1');
  });
});

describe('movePoint (書き方のゆれ)', () => {
  test('moves a node written in a flow-style wire list', () => {
    // 1 行に独立した配線が 2 本。数珠つなぎと取り違えると b1 が取り残される。
    const written = 'parts:\n  R1: resistor b1 c1\nwires: [a1 -- a3, b1 -- b5]\n';
    const result = movePoint(written, at('b1'), at('b2'));

    expect(result.ok && result.value.diff).toEqual({ lost: [], gained: [] });
    const after = moved(written, 'b1', 'b2');
    expect(after).toContain('  R1: resistor b2 c1');
    expect(after).toContain('wires: [a1 -- a3, b2 -- b5]');
  });

  test('lists a flow-style wire endpoint as a movable node', () => {
    const written = 'wires: [a1 -- a3, b1 -- b5]\n';
    const nodes = movableNodes(written).map((node) => formatAddress(node.address));

    expect(nodes).toContain('b1');
  });

  test('moves a node even when the wire line has a comment with a colon', () => {
    // 行の頭の `:` を探して端子より右へ出てしまうと、正しい移動が断られる。
    const written = 'parts:\n  R1: resistor a1 b1\nwires:\n  - a1 -- a3 # 分岐: 上へ\n';
    const after = moved(written, 'a1', 'a2');

    expect(after).toContain('  R1: resistor a2 b1');
    expect(after).toContain('  - a2 -- a3 # 分岐: 上へ');
  });

  test('moves a node written in a space-free wire chain', () => {
    // パーサは `a1--a3|-c5` を通す。空白で切るだけでは 1 つの綴りに見える。
    const written = 'wires:\n  - a1--a3|-c5\n';

    expect(moved(written, 'a3', 'b3')).toContain('  - a1--b3|-c5');
  });
});

describe('movePoint (定義だけの名前)', () => {
  const DEFINED = 'points:\n  fb: c3\nparts:\n  R1: resistor a1 b1\n';

  test('lists a named point nothing references yet', () => {
    const fb = movableNodes(DEFINED).find((node) => formatAddress(node.address) === 'c3');

    expect(fb?.name).toBe('fb');
    expect(fb?.uses).toBe(0);
  });

  test('moves it by rewriting the one points: line', () => {
    const result = movePoint(DEFINED, at('c3'), at('c4'));

    expect(result.ok && result.value.edits).toHaveLength(1);
    expect(moved(DEFINED, 'c3', 'c4')).toContain('  fb: c4');
  });
});

describe('movableNodes の並び', () => {
  test('orders columns numerically, so a2 comes before a10', () => {
    const written = 'wires:\n  - a10 -- b10\n  - a2 -- b2\n';
    const nodes = movableNodes(written).map((node) => formatAddress(node.address));

    expect(nodes.indexOf('a2')).toBeLessThan(nodes.indexOf('a10'));
  });
});

describe('movePoint (数珠つなぎの配線)', () => {
  test('rewrites a chained wire once per written spelling', () => {
    // `a1 -- a3 -- a5` の a3 は 1 回しか書かれていない。配線のモデルは
    // 2 本 (a1--a3, a3--a5) になるが、書き換えは 1 か所でなければならない。
    const written = 'parts:\n  R1: resistor a1 b1\nwires:\n  - a1 -- a3 -- a5\n';

    expect(moved(written, 'a3', 'b3')).toContain('  - a1 -- b3 -- a5');
  });

  test('counts a chain middle once, since it is written once', () => {
    const written = 'parts:\n  R1: resistor a1 b1\nwires:\n  - a1 -- a3 -- a5\n';
    const a3 = movableNodes(written).find((node) => formatAddress(node.address) === 'a3');

    expect(a3?.uses).toBe(1);
  });
});

describe('movePoint が断るとき', () => {
  test('will not move a node off the grid', () => {
    expect(movePoint(BARE, at('a1'), { row: -1, col: 0 }).ok).toBe(false);
    expect(movePoint(BARE, at('a1'), { row: 0, col: -1 }).ok).toBe(false);
  });

  test('will not move a crossing nothing was written at', () => {
    const result = movePoint(BARE, at('z9'), at('z8'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('z9');
  });

  test('does nothing when the node is already there', () => {
    expect(movePoint(BARE, at('a1'), at('a1'))).toEqual({ ok: true, value: { edits: [], diff: { lost: [], gained: [] } } });
  });

  test('will not guess on a fence it cannot read', () => {
    expect(movePoint('parts: [', at('a1'), at('a2')).ok).toBe(false);
  });
});
