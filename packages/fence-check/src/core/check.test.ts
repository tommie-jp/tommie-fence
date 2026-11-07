import type { Scene, SceneBody, SceneWire } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { checkScene } from './check.ts';

const body = (id: string, cx: number, cy: number, width: number, height: number, pins: { x: number; y: number }[] = []): SceneBody =>
  ({ id, rect: { cx, cy, width, height, angle: 0 }, pins, line: null });
const wire = (id: string, points: [number, number][], line: number | null = null): SceneWire =>
  ({ id, points: points.map(([x, y]) => ({ x, y })), line });
const scene = (over: Partial<Scene>): Scene => ({
  fence: 'breadboard', sheet: null, parts: [], wires: [], captions: [], approximate: false, skipped: 0, ...over,
});
const kinds = (found: readonly { kind: string }[]) => found.map((one) => one.kind);

describe('1. overlapping bodies', () => {
  test('reports the pair with the depth in px', () => {
    const found = checkScene(scene({ parts: [body('R1', 0, 0, 40, 10), body('C1', 30, 0, 30, 10)] }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'overlap', a: 'R1', b: 'C1', amount: 5, unit: 'px', grade: 'sure' });
  });

  test('keeps quiet below the threshold', () => {
    const found = checkScene(scene({ parts: [body('R1', 0, 0, 40, 10), body('C1', 34.6, 0, 30, 10)] }));
    expect(found).toEqual([]);
  });

  test('marks findings on approximate scenes as uncertain', () => {
    const found = checkScene(scene({ fence: 'circuit', approximate: true, parts: [body('R1', 0, 0, 40, 10), body('C1', 30, 0, 30, 10)] }));
    expect(found[0]?.grade).toBe('uncertain');
  });
});

describe('2. wires through bodies', () => {
  test('reports how far a wire runs inside a body', () => {
    const found = checkScene(scene({ parts: [body('U1', 0, 0, 40, 20)], wires: [wire('wire#1', [[-50, 0], [50, 0]], 7)] }));
    expect(found).toEqual([expect.objectContaining({ kind: 'wire-part', a: 'wire#1', b: 'U1', amount: 40, line: 7 })]);
  });

  test('lets a wire reach a pin of the part', () => {
    const pin = { x: 10, y: 0 };
    const found = checkScene(scene({ parts: [body('U1', 0, 0, 40, 20, [pin])], wires: [wire('wire#1', [[50, 0], [10, 0]])] }));
    expect(found).toEqual([]);
  });

  test('does not count a lead against its own body', () => {
    const found = checkScene(scene({ parts: [body('R1', 0, 0, 40, 10)], wires: [{ ...wire('R1', [[-50, 0], [50, 0]]), lead: true }] }));
    expect(found).toEqual([]);
  });
});

describe('3. crossings and four-way junctions', () => {
  test('counts a plus-shaped crossing between two wires', () => {
    const found = checkScene(scene({ wires: [wire('wire#1', [[-10, 0], [10, 0]]), wire('wire#2', [[0, -10], [0, 10]])] }));
    expect(found).toEqual([expect.objectContaining({ kind: 'crossing', a: 'wire#1', b: 'wire#2', amount: 1, unit: 'point' })]);
  });

  test('a T is not a crossing', () => {
    const found = checkScene(scene({ wires: [wire('wire#1', [[-10, 0], [10, 0]]), wire('wire#2', [[0, 0], [0, 10]])] }));
    expect(found).toEqual([]);
  });

  test('on a schematic, four arms meeting at one end point is a four-way junction', () => {
    const found = checkScene(scene({
      fence: 'circuit',
      wires: [wire('wire#1', [[-10, 0], [10, 0]]), wire('wire#2', [[0, 0], [0, 10]]), wire('wire#3', [[0, 0], [0, -10]])],
    }));
    expect(kinds(found)).toEqual(['junction4']);
  });

  test('a ladder node (two straight arms and two diagonals) is not a cross', () => {
    // コッククロフト・ウォルトンの梯子の節点 (52 の docs/149 で、よく見る定型として外した)。
    const found = checkScene(scene({
      fence: 'circuit',
      wires: [
        wire('C1', [[-10, 0], [0, 0]]), wire('C3', [[0, 0], [10, 0]]),
        wire('D1', [[-10, 10], [0, 0]]), wire('D2', [[0, 0], [10, 10]]),
      ],
    }));
    expect(found).toEqual([]);
  });

  test('a T on a schematic is fine', () => {
    const found = checkScene(scene({ fence: 'circuit', wires: [wire('wire#1', [[-10, 0], [10, 0]]), wire('wire#2', [[0, 0], [0, 10]])] }));
    expect(found).toEqual([]);
  });

  test('boards do not look for four-way junctions (holes join wires there)', () => {
    const found = checkScene(scene({
      wires: [wire('wire#1', [[-10, 0], [0, 0]]), wire('wire#2', [[10, 0], [0, 0]]), wire('wire#3', [[0, 10], [0, 0]]), wire('wire#4', [[0, -10], [0, 0]])],
    }));
    expect(found).toEqual([]);
  });
});

describe('4. captions', () => {
  const caption = (owner: string, cx: number, cy: number, width = 30, height = 10) =>
    ({ owner, rect: { cx, cy, width, height, angle: 0 } });

  test('a caption sitting on its own body is reported against the body', () => {
    const found = checkScene(scene({ parts: [body('P2', 0, 0, 10, 38)], captions: [caption('P2', 0, 20)] }));
    expect(found).toEqual([expect.objectContaining({ kind: 'caption', a: 'caption:P2', b: 'P2(body)' })]);
  });

  test('two captions on top of each other', () => {
    const found = checkScene(scene({ captions: [caption('R1', 0, 0), caption('D1', 10, 2)] }));
    expect(found).toEqual([expect.objectContaining({ kind: 'caption', a: 'caption:R1', b: 'caption:D1' })]);
  });

  test('a wire struck through a caption', () => {
    const found = checkScene(scene({ captions: [caption('R2', 0, 0)], wires: [wire('wire#9', [[0, -20], [0, 20]])] }));
    expect(found).toEqual([expect.objectContaining({ kind: 'caption', a: 'caption:R2', b: 'wire#9', amount: 10 })]);
  });

  test('a caption clear of everything is not reported', () => {
    const found = checkScene(scene({ parts: [body('R1', 0, 0, 30, 10)], captions: [caption('R1', 0, 20)] }));
    expect(found).toEqual([]);
  });
});
