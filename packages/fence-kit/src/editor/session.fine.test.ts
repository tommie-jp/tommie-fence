import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **端数を綴りにするのは殻の入口で 1 回** (Ctrl で 1/4 升。52 の docs/23)。
 * 綴りを組むのはフェンスの `step` なので、ここでは張りぼての `step` が
 * 何を渡されたかと、そのあとの書き換えに綴りが届くかだけを見る。
 */

const MARKDOWN = ['```fake', 'R1: resistor a1 a3', '```', ''].join('\n');
const SOURCE = 'R1: resistor a1 a3\n';
const Q = { rows: 0.25, cols: -0.25 };

const ok = { ok: true as const, value: { edits: [], diff: { lost: [], gained: [] } } };

const open = (over: Partial<FenceEditor> = {}) => {
  const calls: unknown[][] = [];
  let stepCalls = 0;
  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [{ line: 1, title: null }],
    fenceAt: (_markdown, line) => (line >= 1 && line <= 3 ? { line: 1, source: SOURCE, indents: [] } : null),
    firstFence: () => ({ line: 1, source: SOURCE, indents: [] }),
    view: () => ({ map: '<svg></svg>', issues: '' }),
    aimAt: () => null,
    spansOf: () => [],
    fieldsOf: () => null,
    colorNames: () => '',
    nameOf: (handle) => handle,
    nextId: () => 'X1',
    cellsOf: () => ['x'],
    foldsWire: false,
    fine: 4,
    // 端数の綴りは見えるように残す (`b3@0.25,-0.25`)。
    step: (cell, rows, cols) => {
      stepCalls += 1;
      return `${cell}@${rows},${cols}`;
    },
    stepsTo: () => ({ rows: 0.25, cols: 1.75 }),
    palette: () => '<button data-type="resistor"></button>',
    typeNames: () => '',
    movePart: (_source, handle, to) => { calls.push(['movePart', handle, to]); return ok; },
    movePoint: (_source, from, to) => { calls.push(['movePoint', from, to]); return ok; },
    addPart: (_source, part) => { calls.push(['addPart', part.at]); return ok; },
    duplicate: () => ok,
    addWire: (_source, from, to, operator) => { calls.push(['addWire', from, to, operator]); return ok; },
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
  const status = (): string => [...sent].reverse().find((one) => one.kind === 'status')?.text ?? '';
  const ghost = () => [...sent].reverse().find((one) => one.kind === 'ghost');
  return { session, calls, stepCalls: () => stepCalls, status, ghost };
};

describe('端数を綴りにする (Ctrl で 1/4 升)', () => {
  test('spells the quarter through step before planning, for every message that says where', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3'], fine: [Q] });
    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3', 'b8'], fine: [null, Q] });
    await session.handle({ kind: 'move', part: 'R1', to: 'b3', fine: Q });
    await session.handle({ kind: 'moveNode', from: 'a1', to: 'b3', fine: Q });
    await session.handle({ kind: 'addWire', from: 'a1', to: 'b3', operator: '--', fine: [null, Q] });

    expect(calls).toEqual([
      ['addPart', ['b3@0.25,-0.25']],
      ['addPart', ['b3', 'b8@0.25,-0.25']],
      ['movePart', 'R1', 'b3@0.25,-0.25'],
      ['movePoint', 'a1', 'b3@0.25,-0.25'],
      ['addWire', 'a1', 'b3@0.25,-0.25', '--'],
    ]);
  });

  test('spells a quarter preview the same way, and adds how far the picture must shift', async () => {
    const { session, calls, ghost } = open();

    await session.handle({ kind: 'preview', key: 'k', what: 'move', part: 'R1', to: 'b3', fine: Q });

    expect(calls).toEqual([['movePart', 'R1', 'b3@0.25,-0.25']]);
    // **端数の升は DOM に無い**ので、殻は要素を引けない。差を数で添える (`stepsTo`)。
    expect(ghost()).toMatchObject({ key: 'k', cells: ['x'], ok: true, shift: { rows: 0.25, cols: 1.75 } });
  });

  test('carries the pressed quarter of a span into the first crossing', async () => {
    const { session, calls } = open();

    await session.handle({
      kind: 'preview', key: 'k', what: 'place', type: 'resistor', to: 'b8', turn: 0, flip: false,
      from: 'b3', fromFine: { rows: 0, cols: 0.25 },
    });

    expect(calls).toEqual([['addPart', ['b3@0,0.25', 'b8']]]);
  });

  test('passes messages without a fraction through unchanged, never calling step', async () => {
    const { session, calls, stepCalls } = open();

    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3'] });
    await session.handle({ kind: 'move', part: 'R1', to: 'b3', fine: { rows: 0, cols: 0 } });

    expect(calls).toEqual([['addPart', ['b3']], ['movePart', 'R1', 'b3']]);
    expect(stepCalls()).toBe(0);
  });

  test('refuses a quarter on a fence whose fine is null, in words', async () => {
    const { session, calls, status } = open({ fine: null });

    await session.handle({ kind: 'move', part: 'R1', to: 'b3', fine: Q });

    expect(calls).toEqual([]);
    expect(status()).toContain('穴の間に置けません');
  });

  test('refuses a fraction that is not a multiple of 1/fine, since the fence would round it silently', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'move', part: 'R1', to: 'b3', fine: { rows: 0.125, cols: 0 } });

    expect(calls).toEqual([]);
    expect(status()).toContain('1/4 升');
  });

  test('answers a refused quarter preview as a ghost that cannot be placed, so it shows before the click', async () => {
    const { session, ghost } = open({ fine: null });

    await session.handle({ kind: 'preview', key: 'k', what: 'move', part: 'R1', to: 'b3', fine: Q });

    expect(ghost()).toMatchObject({ key: 'k', cells: [], ok: false, why: 'この盤では穴の間に置けません' });
  });
});
