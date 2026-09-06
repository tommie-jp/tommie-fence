import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **置けない所を指していても、持っている物の姿を見せる。**
 *
 * 動かすときは図にある絵をそのまま写せるので、置けない所でも赤い影が出ていた。
 * 置くときは図にまだ部品が無く、拡張が切り出して渡している — その切り出しを
 * 「置けたときだけ」やっていたので、回して置けない向きにすると影ごと消えた
 * (実機で「回転して置けない場合でもシャドウを赤で表示して」)。
 *
 * 姿は種類と向きと足の数で決まり、**場所では変わらない**。だからどこか置ける穴に
 * 試し当てて絵を切り出し、指した穴までの差を添えれば、置けない場所にも出せる。
 */

const MARKDOWN = ['```fake', 'R1: resistor a1 a3', '```', ''].join('\n');
const SOURCE = 'R1: resistor a1 a3\n';

const ok = { ok: true as const, value: { edits: [], diff: { lost: [], gained: [] } } };
const no = (why: string) => ({ ok: false as const, error: { message: why, line: null } });

/** 升の綴り (`b3`) を行と列に。張りぼての盤は 1〜9 行・1〜9 列。 */
const readCell = (cell: string): { readonly rows: number; readonly cols: number } | null => {
  const found = /^([a-i])([1-9])$/.exec(cell);
  return found === undefined || found === null
    ? null
    : { rows: found[1]!.charCodeAt(0) - 'a'.charCodeAt(0) + 1, cols: Number(found[2]) };
};

const writeCell = (rows: number, cols: number): string | null =>
  (rows < 1 || rows > 9 || cols < 1 || cols > 9
    ? null
    : `${String.fromCharCode('a'.charCodeAt(0) + rows - 1)}${cols}`);

/**
 * 張りぼての盤。**`c` 行から下にしか置けない** ことにして、上の縁で
 * 「回すと外へ出る」と同じ形の断りを作る。
 */
const open = (over: Partial<FenceEditor> = {}) => {
  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [{ line: 1, title: null }],
    fenceAt: (_markdown, line) => (line >= 1 && line <= 3 ? { line: 1, source: SOURCE, indents: [] } : null),
    firstFence: () => ({ line: 1, source: SOURCE, indents: [] }),
    view: () => ({ map: '<svg><g class="cf-chip" data-part="X1"><rect/></g></svg>', issues: '' }),
    aimAt: () => null,
    spansOf: () => [],
    fieldsOf: () => null,
    colorNames: () => '',
    nameOf: (handle) => handle,
    nextId: () => 'X1',
    cellsOf: (_source, handle) => (handle === 'X1' ? ['c4', 'd4'] : []),
    foldsWire: false,
    fine: null,
    step: (cell, rows, cols) => {
      const at = readCell(cell);
      return at === null ? null : writeCell(at.rows + rows, at.cols + cols);
    },
    stepsTo: (from, to) => {
      const start = readCell(from);
      const end = readCell(to);
      return start === null || end === null
        ? null
        : { rows: end.rows - start.rows, cols: end.cols - start.cols };
    },
    palette: () => '<button data-type="resistor"></button>',
    typeNames: () => '',
    // **c 行より上には置けない** 盤。回すと縁を踏む部品と同じ断りになる。
    addPart: (_source, part) => {
      const at = readCell(part.at[0] ?? '');
      return at !== null && at.rows >= 3 ? ok : no('回すと板の外へ出ます');
    },
    movePart: () => ok,
    movePoint: () => ok,
    duplicate: () => ok,
    addWire: () => ok,
    deletePart: () => ok,
    deleteWire: () => ok,
    rename: () => ok,
    setField: () => ok,
    turn: () => ok,
    flip: () => ok,
    ...over,
  };
  const doc = {
    uri: { toString: () => 'file:///a.md' },
    getText: () => MARKDOWN,
    lineCount: MARKDOWN.split('\n').length,
    lineAt: (line: number) => ({ text: MARKDOWN.split('\n')[line] ?? '' }),
  };
  const sent: Outgoing[] = [];
  const host = {
    post: (message: Outgoing) => sent.push(message),
    documents: () => [doc],
    activeEditor: () => null,
    openDocument: () => doc,
    applyEdits: async () => true,
    replaceBody: async () => true,
    highlight: () => {},
  };
  const session = createSession(host as never, [editor], { pinned: doc as never });
  const ghost = () => [...sent].reverse().find((one) => one.kind === 'ghost');
  return { session, ghost };
};

const place = (to: string) =>
  ({ kind: 'preview', key: 'k', what: 'place', type: 'resistor', to, turn: 1, flip: false } as const);

describe('置けない所のゴースト', () => {
  test('still draws the part, so a turn that cannot be placed is visible in red', async () => {
    const { session, ghost } = open();

    await session.handle(place('a4'));

    const answer = ghost();
    expect(answer?.ok).toBe(false);
    expect(answer?.why).toContain('板の外');
    expect(answer?.chip).toContain('data-part="X1"');
  });

  test('shifts the drawing to the hole under the cursor, and lights the holes it would take', async () => {
    const { session, ghost } = open();

    await session.handle(place('a4'));

    // 足場は c4 (絵はそこで切り出した)。指したのは a4 なので 2 行ぶん上へ。
    expect(ghost()?.from).toEqual(['c4', 'd4']);
    expect(ghost()?.cells).toEqual(['a4', 'b4']);
    expect(ghost()?.shift).toEqual({ rows: -2, cols: 0 });
  });

  test('keeps lighting the hole in red when no room can be found for the drawing', async () => {
    // どこにも置けない持ち物 (種類が違う、盤が埋まっている)。**影は出ないが、
    // 断りと赤い穴は今までどおり出る** — 何も出ないより手がかりになる。
    const { session, ghost } = open({ addPart: () => no('置けません') });

    await session.handle(place('a4'));

    expect(ghost()?.ok).toBe(false);
    expect(ghost()?.chip).toBeUndefined();
    expect(ghost()?.cells).toEqual(['a4']);
  });

  test('does not hunt for room while the span is being dragged, since that changes the shape', async () => {
    // 間隔をドラッグで選んでいる最中は穴が 2 つ来る。ずらすと間隔そのものが
    // 変わってしまうので、姿を描かない。
    const { session, ghost } = open();

    await session.handle({ ...place('a4'), from: 'a2' });

    expect(ghost()?.chip).toBeUndefined();
  });
});
