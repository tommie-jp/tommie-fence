import { describe, expect, test } from 'vitest';
import { movableNodes, movePoint } from './point.ts';
import { applyEdits } from './shared.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';

const at = (written: string): Address => parseAddress(written) as Address;

const NAMED = [
  'title: t',
  'points:',
  '  fb: 3,3',
  'parts:',
  '  R2: resistor fb 3,4 1k',
  '  R3: resistor fb 5,3 10k',
  'wires:',
  '  - fb -- 1,3',
  '',
].join('\n');

const BARE = [
  'parts:',
  '  R1: resistor 1,1 1,2 1k',
  '  R2: resistor 1,1 1,3 2k',
  '  R3: resistor 1,4 2,4 3k',
  'wires:',
  '  - 1,1 -- 5,1',
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

    expect(nodes).toContain('1,1');
    expect(nodes).toContain('1,2');
    expect(nodes).toContain('5,1');
  });

  test('names a node that points: gave a name', () => {
    const fb = movableNodes(NAMED).find((node) => formatAddress(node.address) === '3,3');

    expect(fb?.name).toBe('fb');
  });

  test('counts how many places write the node, so the map can weight the dot', () => {
    const a1 = movableNodes(BARE).find((node) => formatAddress(node.address) === '1,1');

    // R1 の端・R2 の端・配線の端で 3 か所。
    expect(a1?.uses).toBe(3);
  });

  test('is empty when the fence cannot be read, rather than showing a made-up grid', () => {
    expect(movableNodes('parts:\n  R1: nonsuch 1,1 1,2\nbroken: [')).toEqual([]);
  });
});

describe('movePoint (名前のある節点)', () => {
  test('rewrites the one points: line, so everything that named it follows', () => {
    const result = movePoint(NAMED, at('3,3'), at('4,3'));

    expect(result.ok && result.value.edits).toHaveLength(1);
    expect(result.ok && result.value.edits[0]?.line).toBe(3);
  });

  test('leaves the parts and wires that wrote the name untouched', () => {
    expect(moved(NAMED, '3,3', '4,3')).toContain('  fb: 4,3');
    expect(moved(NAMED, '3,3', '4,3')).toContain('  R2: resistor fb 3,4 1k');
  });

  test('keeps the comments and the spacing that were written by hand', () => {
    const written = 'points:\n  # 帰還の節点\n  fb:  3,3\nparts:\n  R2: resistor fb 3,4\n';

    expect(moved(written, '3,3', '4,3')).toContain('# 帰還の節点');
    expect(moved(written, '3,3', '4,3')).toContain('  fb:  4,3');
  });
});

describe('movePoint (名前のない節点)', () => {
  test('rewrites every place the address was written', () => {
    const after = moved(BARE, '1,1', '2,1');

    expect(after).toContain('  R1: resistor 2,1 1,2 1k');
    expect(after).toContain('  R2: resistor 2,1 1,3 2k');
    expect(after).toContain('  - 2,1 -- 5,1');
  });

  test('does not touch a part name that is spelled like the address', () => {
    // `C1:` は番地 `c1` としても読めるので、鍵まで書き換えると部品の名前が変わる。
    const written = 'parts:\n  C1: capacitor 1,3 3,4 1u\n';

    expect(moved(written, '1,3', '2,3')).toContain('  C1: capacitor 2,3 3,4 1u');
  });

  test('refuses a move that would squash a part to nothing', () => {
    // `R1 a1 b1` の a1 を b1 へ寄せると `b1 -- b1` になり、部品が長さ 0 になる。
    const result = movePoint(BARE, at('1,1'), at('1,2'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R1');
  });

  test('says which connections the move makes, so the caller can confirm', () => {
    // d1 には R3 の端が来ている。同じ交点 = 接続なので、寄せるとつながる。
    const result = movePoint(BARE, at('1,1'), at('1,4'));

    expect(result.ok && result.value.diff.gained.length).toBeGreaterThan(0);
  });

  test('refuses a move that would squash a wire to nothing', () => {
    const result = movePoint(BARE, at('1,1'), at('5,1'));

    expect(result.ok).toBe(false);
  });
});

describe('movePoint (名前と生の綴りが混ざった節点)', () => {
  const MIXED = [
    'points:',
    '  fb: 3,3',
    'parts:',
    '  R1: resistor fb 3,4',
    '  R2: resistor 3,3 3,5',
    '',
  ].join('\n');

  test('takes the bare spellings along, so the node moves whole', () => {
    const after = moved(MIXED, '3,3', '4,3');

    expect(after).toContain('  fb: 4,3');
    expect(after).toContain('  R2: resistor 4,3 3,5');
  });

  test('keeps every connection, which is the promise of moving a node', () => {
    const result = movePoint(MIXED, at('3,3'), at('4,3'));

    expect(result.ok && result.value.diff).toEqual({ lost: [], gained: [] });
  });
});

describe('movePoint が触らないところ', () => {
  test('leaves the title alone even when it spells the address', () => {
    const written = 'title: 1,1 から見る\nparts:\n  R1: resistor 1,1 1,2\n';
    const after = moved(written, '1,1', '2,1');

    expect(after).toContain('title: 1,1 から見る');
    expect(after).toContain('  R1: resistor 2,1 1,2');
  });

  test('leaves notes alone — a note may spell a part name like an address', () => {
    // `circle C1 red` の C1 は部品の名前。番地 `c1` としても読めるが、書き換えると
    // 注釈の指し先が壊れる。
    const written = 'parts:\n  C1: capacitor 1,3 3,4 1u\n  R1: resistor 1,3 1,5 1k\nnotes:\n  - circle C1 red\n';
    const after = moved(written, '1,3', '2,3');

    expect(after).toContain('  - circle C1 red');
    expect(after).toContain('  C1: capacitor 2,3 3,4 1u');
    expect(after).toContain('  R1: resistor 2,3 1,5 1k');
  });

  test('leaves a positional note where it was written (注釈は紙面に付く)', () => {
    const written = 'parts:\n  R1: resistor 1,1 1,2\nnotes:\n  - source 1,1 blue\n';

    expect(moved(written, '1,1', '2,1')).toContain('  - source 1,1 blue');
  });

  test('leaves style values alone even when they spell an address', () => {
    const written = 'style:\n  grid: on\n  grid-to: 5,5\nparts:\n  R1: resistor 1,1 5,5\n';
    const after = moved(written, '5,5', '6,5');

    expect(after).toContain('  grid-to: 5,5');
    expect(after).toContain('  R1: resistor 1,1 6,5');
  });

  test('leaves a comment on the part line alone', () => {
    const written = 'parts:\n  R1: resistor 1,1 1,2 # 1,1 の脇\n';
    const after = moved(written, '1,1', '2,1');

    expect(after).toContain('# 1,1 の脇');
    expect(after).toContain('  R1: resistor 2,1 1,2');
  });
});

describe('movePoint (書き方のゆれ)', () => {
  test('moves a node written in a flow-style wire list', () => {
    // 1 行に独立した配線が 2 本。数珠つなぎと取り違えると 1,2 が取り残される。
    // フロー形式では `,` が区切りになるので、番地を書いた項目は引用符で囲む。
    const written = 'parts:\n  R1: resistor 1,2 1,3\nwires: ["1,1 -- 3,1", "1,2 -- 5,2"]\n';
    const result = movePoint(written, at('1,2'), at('2,2'));

    expect(result.ok && result.value.diff).toEqual({ lost: [], gained: [] });
    const after = moved(written, '1,2', '2,2');
    expect(after).toContain('  R1: resistor 2,2 1,3');
    expect(after).toContain('wires: ["1,1 -- 3,1", "2,2 -- 5,2"]');
  });

  test('lists a flow-style wire endpoint as a movable node', () => {
    const written = 'wires: ["1,1 -- 3,1", "1,2 -- 5,2"]\n';
    const nodes = movableNodes(written).map((node) => formatAddress(node.address));

    expect(nodes).toContain('1,2');
  });

  test('moves a node even when the wire line has a comment with a colon', () => {
    // 行の頭の `:` を探して端子より右へ出てしまうと、正しい移動が断られる。
    const written = 'parts:\n  R1: resistor 1,1 1,2\nwires:\n  - 1,1 -- 3,1 # 分岐: 上へ\n';
    const after = moved(written, '1,1', '2,1');

    expect(after).toContain('  R1: resistor 2,1 1,2');
    expect(after).toContain('  - 2,1 -- 3,1 # 分岐: 上へ');
  });

  test('moves a node written in a space-free wire chain', () => {
    // パーサは `1,1--3,1|-5,3` を通す。空白で切るだけでは 1 つの綴りに見える。
    const written = 'wires:\n  - 1,1--3,1|-5,3\n';

    expect(moved(written, '3,1', '3,2')).toContain('  - 1,1--3,2|-5,3');
  });
});

describe('movePoint (1 行に 2 つ以上)', () => {
  test('rewrites both parts written on one flow-style line', () => {
    // 行ごとに探し直すと、2 つ目の部品の綴りを取り逃す。
    const written = 'parts: {R1: "resistor 1,1 1,2", R2: "resistor 1,1 1,3"}\n';

    expect(moved(written, '1,1', '2,1')).toBe('parts: {R1: "resistor 2,1 1,2", R2: "resistor 2,1 1,3"}\n');
  });

  test('rewrites both ends when two flow wires share a crossing', () => {
    // 数珠つなぎ (`a1 -- a3 -- b5`) とはモデルの上で同じ形になる。綴りが 1 つか
    // 2 つかは行の字を見ないと決まらない。
    const written = 'wires: ["1,1 -- 3,1", "3,1 -- 5,2"]\n';

    expect(moved(written, '3,1', '3,2')).toBe('wires: ["1,1 -- 3,2", "3,2 -- 5,2"]\n');
  });

  test('still rewrites a chained wire once, where the spelling appears once', () => {
    expect(moved('wires:\n  - 1,1 -- 3,1 -- 5,2\n', '3,1', '3,2')).toContain('  - 1,1 -- 3,2 -- 5,2');
  });

  test('counts each written spelling, so the list does not promise the wrong number', () => {
    // 数珠つなぎは真ん中が 1 つ、フロー形式は 2 つ。書き換える数と揃える。
    const chained = movableNodes('wires:\n  - 1,1 -- 3,1 -- 5,2\n');
    const flow = movableNodes('wires: ["1,1 -- 3,1", "3,1 -- 5,2"]\n');
    const usesAt = (nodes: ReturnType<typeof movableNodes>, at: string) =>
      nodes.find((node) => formatAddress(node.address) === at)?.uses;

    expect(usesAt(chained, '3,1')).toBe(1);
    expect(usesAt(flow, '3,1')).toBe(2);
  });
});

describe('movePoint (定義だけの名前)', () => {
  const DEFINED = 'points:\n  fb: 3,3\nparts:\n  R1: resistor 1,1 1,2\n';

  test('lists a named point nothing references yet', () => {
    const fb = movableNodes(DEFINED).find((node) => formatAddress(node.address) === '3,3');

    expect(fb?.name).toBe('fb');
    expect(fb?.uses).toBe(0);
  });

  test('moves it by rewriting the one points: line', () => {
    const result = movePoint(DEFINED, at('3,3'), at('4,3'));

    expect(result.ok && result.value.edits).toHaveLength(1);
    expect(moved(DEFINED, '3,3', '4,3')).toContain('  fb: 4,3');
  });
});

describe('movableNodes の並び', () => {
  test('orders columns numerically, so 2,1 comes before 10,1', () => {
    const written = 'wires:\n  - 10,1 -- 10,2\n  - 2,1 -- 2,2\n';
    const nodes = movableNodes(written).map((node) => formatAddress(node.address));

    expect(nodes.indexOf('2,1')).toBeLessThan(nodes.indexOf('10,1'));
  });
});

describe('movePoint (数珠つなぎの配線)', () => {
  test('rewrites a chained wire once per written spelling', () => {
    // `a1 -- a3 -- a5` の a3 は 1 回しか書かれていない。配線のモデルは
    // 2 本 (a1--a3, a3--a5) になるが、書き換えは 1 か所でなければならない。
    const written = 'parts:\n  R1: resistor 1,1 1,2\nwires:\n  - 1,1 -- 3,1 -- 5,1\n';

    expect(moved(written, '3,1', '3,2')).toContain('  - 1,1 -- 3,2 -- 5,1');
  });

  test('counts a chain middle once, since it is written once', () => {
    const written = 'parts:\n  R1: resistor 1,1 1,2\nwires:\n  - 1,1 -- 3,1 -- 5,1\n';
    const a3 = movableNodes(written).find((node) => formatAddress(node.address) === '3,1');

    expect(a3?.uses).toBe(1);
  });
});

describe('movePoint が断るとき', () => {
  test('will not move a node off the grid', () => {
    expect(movePoint(BARE, at('1,1'), { row: -1, col: 0 }).ok).toBe(false);
    expect(movePoint(BARE, at('1,1'), { row: 0, col: -1 }).ok).toBe(false);
  });

  test('will not move a crossing nothing was written at', () => {
    const result = movePoint(BARE, at('9,26'), at('8,26'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('9,26');
  });

  test('does nothing when the node is already there', () => {
    expect(movePoint(BARE, at('1,1'), at('1,1'))).toEqual({ ok: true, value: { edits: [], diff: { lost: [], gained: [] } } });
  });

  test('will not guess on a fence it cannot read', () => {
    expect(movePoint('parts: [', at('1,1'), at('2,1')).ok).toBe(false);
  });
});

describe('movePoint (CRLF)', () => {
  test('moves a named node written with Windows newlines', () => {
    // 正規化した字でパースして元の字から切り出すと、桁が改行のぶんずれる。
    const written = 'points:\r\n  fb: 3,3\r\nparts:\r\n  R1: resistor fb 3,4\r\n';
    const result = movePoint(written, at('3,3'), at('4,3'));

    expect(result.ok && applyEdits(written, result.value.edits)).toContain('  fb: 4,3');
  });
});
