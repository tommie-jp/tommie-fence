import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { routeWire, routeWires } from './route.ts';

const layout = createLayout(createBoard('half'));
const at = (text: string) => layout.point(parseAddress(text)!);

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
  const request = (from: string, to: string) => ({ from: at(from), to: at(to), hints: [] });

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
