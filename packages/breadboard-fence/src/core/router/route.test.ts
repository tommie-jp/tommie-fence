import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { LIMITS } from '../limits.ts';
import type { Point } from '../types.ts';
import { pathHitsAny } from './geometry.ts';
import { countCrossings } from './crossings.test-utils.ts';
import { routeWire, routeWires } from './route.ts';

const layout = createLayout(createBoard('half'));
const at = (text: string) => layout.point(parseAddress(text)!);
const request = (from: string, to: string) => ({ from: at(from), to: at(to), hints: [] });

describe('routeWire', () => {
  test('returns a straight two point path when both ends share a column', () => {
    const path = routeWire(at('a5'), at('j5'), layout);

    expect(path).toEqual([at('a5'), at('j5')]);
  });

  test('starts at the source hole and ends at the target hole', () => {
    const path = routeWire(at('a5'), at('b12'), layout);

    expect(path[0]).toEqual(at('a5'));
    expect(path.at(-1)).toEqual(at('b12'));
  });

  test('connects two nearby holes directly instead of going out to a lane', () => {
    const path = routeWire(at('d5'), at('d6'), layout);

    expect(path).toEqual([at('d5'), at('d6')]);
  });

  test('still uses a lane once the two holes are far apart', () => {
    const path = routeWire(at('d5'), at('d20'), layout);

    expect(path).toHaveLength(4);
  });

  test('routes through the ravine when the wire crosses between the blocks', () => {
    const path = routeWire(at('e5'), at('f20'), layout);
    const laneY = path[1]?.y;

    expect(laneY).toBeGreaterThan(layout.rowY('e'));
    expect(laneY).toBeLessThan(layout.rowY('f'));
  });

  test('travels along a single lane so the middle points share one height', () => {
    const path = routeWire(at('a5'), at('j20'), layout);

    expect(path).toHaveLength(4);
    expect(path[1]?.y).toBe(path[2]?.y);
  });

  test('keeps every point inside the canvas', () => {
    const path = routeWire(at('+t1'), at('+b30'), layout);

    for (const point of path) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(layout.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(layout.height);
    }
  });

  test('shifts the lane when an offset is given so parallel wires do not overlap', () => {
    const straight = routeWire(at('a5'), at('a20'), layout);
    const shifted = routeWire(at('a5'), at('a20'), layout, { offset: 6 });

    expect(shifted[1]?.y).not.toBe(straight[1]?.y);
  });

  test('reaches a point that sits off the board such as a device pin', () => {
    const deviceLayout = createLayout(createBoard('half'), { deviceTop: true });
    const band = deviceLayout.deviceBands.top!;
    const pin = { x: band.x + 20, y: band.y + band.height };

    const path = routeWire(pin, deviceLayout.point(parseAddress('a5')!), deviceLayout);

    expect(path[0]).toEqual(pin);
    expect(path.at(-1)).toEqual(deviceLayout.point(parseAddress('a5')!));
  });

  test('follows a routing hint instead of the lane it would pick by itself', () => {
    const from = at('j20');
    const path = routeWire(from, at('j26'), layout, { hints: [{ axis: 'v', delta: -30 }] });

    expect(path[0]).toEqual(from);
    expect(path[1]).toEqual({ x: from.x, y: from.y - 30 });
    expect(path.at(-1)).toEqual(at('j26'));
  });

  test('follows several hints in the order they are written', () => {
    const from = at('a5');
    const path = routeWire(from, at('e20'), layout, {
      hints: [{ axis: 'v', delta: -20 }, { axis: 'h', delta: 40 }],
    });

    expect(path[1]).toEqual({ x: from.x, y: from.y - 20 });
    expect(path[2]).toEqual({ x: from.x + 40, y: from.y - 20 });
  });

  test('turns the corner after the last hint so the wire arrives square on', () => {
    const path = routeWire(at('a5'), at('e20'), layout, { hints: [{ axis: 'v', delta: -20 }] });

    // 最後の指示が縦なので、次は横に振ってから縦に降りる。
    const [, , corner, end] = path;
    expect(corner?.y).toBe(path[1]?.y);
    expect(corner?.x).toBe(end?.x);
  });
});

describe('routeWires', () => {
  test('keeps parallel wires that share a lane apart', () => {
    const [first, second] = routeWires([request('a5', 'a20'), request('b6', 'b19')], layout);

    expect(first?.[1]?.y).not.toBe(second?.[1]?.y);
  });

  test('reuses the same height for wires that never overlap', () => {
    const [first, second] = routeWires([request('a1', 'a5'), request('a20', 'a25')], layout);

    expect(first?.[1]?.y).toBe(second?.[1]?.y);
  });

  test('returns one path per wire in the order they were given', () => {
    const paths = routeWires([request('a5', 'a20'), request('a5', 'j5'), request('b6', 'b19')], layout);

    expect(paths).toHaveLength(3);
    expect(paths[1]).toEqual([at('a5'), at('j5')]);
  });

  test('avoids a lane that would cross a part when another lane is free', () => {
    const ravine = { x: 0, y: layout.ravineY - 8, width: layout.width, height: 16 };

    const [plain] = routeWires([request('+t5', 'j20')], layout);
    const [avoiding] = routeWires([request('+t5', 'j20')], layout, [ravine]);

    expect(plain?.[1]?.y).toBe(layout.ravineY);
    expect(avoiding?.[1]?.y).not.toBe(layout.ravineY);
  });

  test('still routes when every lane is blocked', () => {
    const everywhere = { x: 0, y: 0, width: layout.width, height: layout.height };

    const [path] = routeWires([request('a5', 'a20')], layout, [everywhere]);

    expect(path?.[0]).toEqual(at('a5'));
    expect(path?.at(-1)).toEqual(at('a20'));
  });
});

/** レーンを走る区間 (経路のいちばん長い横の区間)。 */
function longestRun(path: readonly { x: number; y: number }[]) {
  let best = { y: path[0]!.y, left: path[0]!.x, right: path[0]!.x };
  for (let index = 1; index < path.length; index += 1) {
    const [a, b] = [path[index - 1]!, path[index]!];
    const span = Math.abs(b.x - a.x);
    if (a.y === b.y && span > best.right - best.left) {
      best = { y: a.y, left: Math.min(a.x, b.x), right: Math.max(a.x, b.x) };
    }
  }
  return best;
}

describe('routeWires keeping wires from crossing each other', () => {
  // どちらも -t と a の間のレーン (y=67) を通り、x も重なる。
  // 一方はレーンの上の穴から、もう一方は下の穴から来る。
  const fromAbove = request('-t3', '-t20');
  const fromBelow = request('a3', 'a20');

  test('sends wires that come from opposite sides to opposite sides of the lane', () => {
    const [above, below] = routeWires([fromAbove, fromBelow], layout);

    expect(above?.[1]?.y).not.toBe(below?.[1]?.y);
    expect(countCrossings([above!, below!])).toBe(0);
  });

  test('does not care which of the two was written first', () => {
    const [below, above] = routeWires([fromBelow, fromAbove], layout);

    expect(countCrossings([above!, below!])).toBe(0);
  });

  test('still runs a lone wire down the middle of its lane', () => {
    const [only] = routeWires([fromBelow], layout);
    const lane = layout.lanes.find((candidate) => candidate.y === only?.[1]?.y);

    expect(lane).toBeDefined();
  });

  test('gives the same answer every time it is asked', () => {
    const wires = [request('a5', 'a20'), request('b6', 'b19'), fromAbove, fromBelow];

    expect(routeWires(wires, layout)).toEqual(routeWires(wires, layout));
  });

  /** 全部が重なる配線を、溝のレーンに n 本集める。 */
  const crowd = (count: number) =>
    Array.from({ length: count }, (_, index) => request(`f${index + 1}`, `f${28 - index}`));

  const sameHeightPairs = (paths: readonly (readonly Point[])[]) => {
    const runs = paths.map(longestRun);
    const pairs: [number, number][] = [];
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        const [a, b] = [runs[i]!, runs[j]!];
        if (a.y === b.y && Math.min(a.right, b.right) > Math.max(a.left, b.left)) pairs.push([i, j]);
      }
    }
    return pairs;
  };

  test('uses every slot the lane can hold before letting any two wires share a height', () => {
    // 溝のレーンの厚みで持てるのは 5 段。5 本までは 1 本も重ならない。
    const paths = routeWires(crowd(5), layout);

    expect(new Set(paths.map((path) => longestRun(path).y)).size).toBe(5);
    expect(sameHeightPairs(paths)).toEqual([]);
  });

  test('doubles up only as much as it must once the lane is full', () => {
    // 6 本目からは重ねるしかない。**増えるのは 1 組ずつ**で、
    // 塞がっている範囲を上書きして「空いている」ことにしてしまうと一気に崩れる。
    expect(sameHeightPairs(routeWires(crowd(6), layout))).toHaveLength(1);
    expect(sameHeightPairs(routeWires(crowd(7), layout))).toHaveLength(2);
  });

  test('routes a figure at the wire limit with parts in the way', () => {
    const many = Array.from({ length: LIMITS.wires }, (_, index) => {
      const column = (index % 28) + 1;
      return request(`a${column}`, `j${column + 2}`);
    });
    // 部品を置かないと、よけ道を探す繰り返しが一度も走らない。
    const parts = Array.from({ length: 40 }, (_, index) => ({
      x: layout.colX(index % 20 + 1) - 12, y: layout.rowY('a') - layout.pitch * 1.8,
      width: 24, height: layout.pitch,
    }));

    const paths = routeWires(many, layout, parts);

    // 速さは測らない。壁時計は CI の混み具合で動くので、落ちても直せる情報にならない。
    // ここで見るのは、上限いっぱいでも全部の配線が端点をつないで返ってくること。
    expect(paths).toHaveLength(LIMITS.wires);
    paths.forEach((path, index) => {
      expect(path[0]).toEqual(many[index]!.from);
      expect(path.at(-1)).toEqual(many[index]!.to);
    });
  });
});

describe('routeWires around parts standing in the way', () => {
  /**
   * ある穴の真上 (レーンへ出ていく縦の道) に立つ部品。
   * 穴からは 1 行ぶん空けてある — 実物の部品は挿さっている穴の上に胴を持つので、
   * 隣の穴から出る配線には穴 1 つぶんの逃げしろが残る。
   */
  const above = (hole: string) => ({
    x: at(hole).x - 12,
    y: layout.rowY('a') - layout.pitch * 1.8,
    width: 24,
    height: layout.pitch,
  });

  test('steps aside instead of running the wire through a part on its way out', () => {
    const blocker = above('a5');

    const [path] = routeWires([request('a5', 'a20')], layout, [blocker]);

    expect(pathHitsAny(path!, [blocker], 0)).toBe(false);
  });

  test('still starts and ends at the two holes after stepping aside', () => {
    const blocker = above('a5');

    const [path] = routeWires([request('a5', 'a20')], layout, [blocker]);

    expect(path?.[0]).toEqual(at('a5'));
    expect(path?.at(-1)).toEqual(at('a20'));
  });

  test('leaves the wire alone when nothing stands in its way', () => {
    const [plain] = routeWires([request('a5', 'a20')], layout);
    const [elsewhere] = routeWires([request('a5', 'a20')], layout, [above('a25')]);

    expect(elsewhere).toEqual(plain);
  });

  test('keeps the detour close to the hole rather than wandering off', () => {
    const blocker = above('a5');

    const [path] = routeWires([request('a5', 'a20')], layout, [blocker]);
    const detour = Math.max(...path!.map((point) => Math.abs(point.x - at('a5').x)));

    expect(detour).toBeLessThanOrEqual(Math.abs(at('a20').x - at('a5').x));
  });

  test('goes straight through when the part is too wide to step around', () => {
    const wall = { x: 0, y: layout.rowY('a') - layout.pitch * 1.4, width: layout.width, height: layout.pitch };

    const [path] = routeWires([request('a5', 'a20')], layout, [wall]);

    // 逃げ場が無いときは今までどおり突き抜ける (部品を上に描いて読ませる)。
    expect(path).toHaveLength(4);
  });

  test('climbs between two hole columns so the detour does not read as a connection', () => {
    const [path] = routeWires([request('a5', 'a20')], layout, [above('a5')]);
    const columns = new Set(Array.from({ length: 30 }, (_, index) => layout.colX(index + 1)));

    // 寄り道した縦の道は穴の列と列の間を通る。列の真上を走ると、
    // 通り道の穴に挿さっているように見えてしまう。
    const climb = path!.filter((point) => point.x !== at('a5').x && point.x !== at('a20').x);
    expect(climb.length).toBeGreaterThan(0);
    for (const point of climb) expect(columns.has(point.x)).toBe(false);
  });

  test('sends two wires that both have to step aside up different columns', () => {
    const blockers = [above('a5'), above('a8')];

    const [first, second] = routeWires([request('a5', 'a20'), request('a8', 'a25')], layout, blockers);
    const climbX = (path: readonly { x: number }[], hole: string) =>
      path.map((point) => point.x).filter((x) => x !== at(hole).x);

    // 同じ列を登ると 2 本が 1 本に見えて、どの穴とどの穴がつながっているか読めなくなる。
    const shared = climbX(first!, 'a5').filter((x) => climbX(second!, 'a8').includes(x));
    expect(shared).toEqual([]);
  });

  test('keeps the detour on the board even for a hole at the very edge', () => {
    const blocker = above('a1');

    const [path] = routeWires([request('a1', 'a20')], layout, [blocker]);

    for (const point of path!) {
      expect(point.x).toBeGreaterThanOrEqual(layout.board.x);
      expect(point.x).toBeLessThanOrEqual(layout.board.x + layout.board.width);
    }
  });

  test('does not drag its lane run over a second part while dodging the first', () => {
    // 立ちふさがる胴と、レーンの上にだけ乗っている小さな部品。寄り道で横に伸びた
    // 区間が 2 つ目に乗ると、1 つ目をよけた意味がなくなる。
    const body = above('a5');
    const onLane = { x: at('a5').x - 40, y: layout.lanes[0]!.y - 4, width: 13, height: 8 };

    const [path] = routeWires([request('a5', 'a20')], layout, [body, onLane]);

    expect(pathHitsAny(path!, [body, onLane], 0)).toBe(false);
  });

  test('climbs between hole columns even from a pin that is not on the hole grid', () => {
    // 板の外の機器のピンは穴の格子に乗っていない。端点からずらすと列を踏む。
    const deviceLayout = createLayout(createBoard('half'), { deviceTop: true });
    const band = deviceLayout.deviceBands.top!;
    const pin = { x: band.x + 118, y: band.y + band.height };
    const hole = deviceLayout.point(parseAddress('a20')!);
    const blocker = { x: pin.x - 12, y: pin.y + 14, width: 24, height: 10 };

    const [path] = routeWires([{ from: pin, to: hole, hints: [] }], deviceLayout, [blocker]);
    const columns = new Set(Array.from({ length: 30 }, (_, index) => deviceLayout.colX(index + 1)));

    const climb = path!.filter((point) => point.x !== pin.x && point.x !== hole.x);
    expect(climb.length).toBeGreaterThan(0);
    for (const point of climb) expect(columns.has(point.x)).toBe(false);
  });

  test('does not step around the part the wire is plugged into', () => {
    // 真ん中の足から出る配線は、自分の胴の中から始まる。避けようがないので曲げない。
    const own = { x: at('a5').x - 20, y: layout.rowY('a') - 20, width: 40, height: 40 };

    const [path] = routeWires([request('a5', 'a20')], layout, [own]);

    expect(path).toHaveLength(4);
  });
});
