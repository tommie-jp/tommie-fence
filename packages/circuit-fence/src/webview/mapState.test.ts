import { describe, expect, test } from 'vitest';
import { start, step } from './mapState.ts';
import type { Event, Picked, State } from './mapState.ts';

const PANEL = start(true);
const R1: Picked = { kind: 'part', id: 'R1' };
const WIRE: Picked = { kind: 'wire', id: '5' };

const after = (state: State, ...events: readonly Event[]): State =>
  events.reduce((now, event) => step(now, event).state, state);

const press = (on: Picked | null, onMap = true): Event => ({ kind: 'press', on, x: 10, y: 10, onMap });
const release = (cell: string | null, far = true): Event =>
  ({ kind: 'release', x: far ? 60 : 10, y: 10, cell });
const key = (name: string, over: Partial<Extract<Event, { kind: 'key' }>> = {}): Event =>
  ({ kind: 'key', key: name, shift: false, modifier: false, typing: false, ...over });

describe('掴む', () => {
  test('picks what was pressed and asks the editor to light it', () => {
    const { state, send, status } = step(PANEL, press(R1));

    expect(state.picked).toEqual(R1);
    expect(send).toEqual([{ kind: 'select', what: 'part', id: 'R1' }]);
    expect(status).toContain('R1');
  });

  test('lets go when the empty part of the map is pressed', () => {
    const held = after(PANEL, press(R1));

    const { state, send } = step(held, press(null));

    expect(state.picked).toBeNull();
    expect(send).toEqual([{ kind: 'select' }]);
  });

  test('keeps what it holds when the press was outside the map', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, press(null, false)).state.picked).toEqual(R1);
  });
});

describe('置く', () => {
  test('sends the move when the pointer travelled and landed on a cell', () => {
    const held = after(PANEL, press(R1));

    const { state, send } = step(held, release('b3'));

    expect(send).toEqual([{ kind: 'move', part: 'R1', to: 'b3' }]);
    expect(state.picked).toBeNull();
  });

  test('moves a node by its own message, since the move means something else', () => {
    const held = after(start(true), { kind: 'mode', mode: 'node' }, press({ kind: 'node', id: 'a1' }));

    expect(step(held, release('b3')).send).toEqual([{ kind: 'moveNode', from: 'a1', to: 'b3' }]);
  });

  test('does not move when the pointer was let go where it was pressed', () => {
    // 選んだあとの何気ないクリックが移動になると、置くつもりのない所へ飛ぶ。
    const held = after(PANEL, press(R1));

    expect(step(held, release('b3', false)).send).toEqual([]);
    expect(step(held, release('b3', false)).state.picked).toEqual(R1);
  });

  test('never moves a wire, which has no place to be put', () => {
    const held = after(PANEL, press(WIRE));

    expect(step(held, release('b3')).send).toEqual([]);
  });

  test('forgets the press when the pointer is cancelled', () => {
    const held = after(PANEL, press(R1), { kind: 'cancel' });

    expect(step(held, release('b3')).send).toEqual([]);
  });
});

describe('打鍵', () => {
  test('lets go on Escape', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, key('Escape')).state.picked).toBeNull();
  });

  test('deletes the part it holds', () => {
    const held = after(PANEL, press(R1));

    const { send, state, handled } = step(held, key('Delete'));

    expect(send).toEqual([{ kind: 'delete', what: 'part', id: 'R1' }]);
    expect(state.picked).toBeNull();
    expect(handled).toBe(true);
  });

  test('deletes the wire it holds, which is a whole line', () => {
    const held = after(PANEL, press(WIRE));

    expect(step(held, key('Delete')).send).toEqual([{ kind: 'delete', what: 'wire', id: '5' }]);
  });

  test('does not delete a node, which is a crossing rather than a thing', () => {
    const held = after(start(true), { kind: 'mode', mode: 'node' }, press({ kind: 'node', id: 'a1' }));

    expect(step(held, key('Delete')).send).toEqual([]);
  });

  test('turns with R and back with Shift+R, the keys KiCad uses', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, key('r')).send).toEqual([{ kind: 'turn', part: 'R1', quarters: 1 }]);
    expect(step(held, key('R', { shift: true })).send).toEqual([{ kind: 'turn', part: 'R1', quarters: -1 }]);
  });

  test('flips with M', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, key('m')).send).toEqual([{ kind: 'flip', part: 'R1' }]);
  });

  test('keeps holding what it turned, so it can be turned again', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, key('r')).state.picked).toEqual(R1);
  });

  test('does nothing with the keys while nothing is held', () => {
    expect(step(PANEL, key('Delete')).send).toEqual([]);
    expect(step(PANEL, key('r')).handled).toBe(false);
  });

  test('leaves the keys alone while a control has focus', () => {
    // 一覧は頭文字で選べる。横取りすると選べなくなる。
    const held = after(PANEL, press(R1));

    expect(step(held, key('r', { typing: true })).handled).toBe(false);
  });

  test('takes Ctrl+Z itself when the panel keeps its own history', () => {
    expect(step(PANEL, key('z', { modifier: true })).send).toEqual([{ kind: 'undo' }]);
    expect(step(PANEL, key('z', { modifier: true, shift: true })).send).toEqual([{ kind: 'redo' }]);
    expect(step(PANEL, key('y', { modifier: true })).send).toEqual([{ kind: 'redo' }]);
  });

  test('lets Ctrl+Z through when VS Code holds the history', () => {
    // タブそのものがマップのときは、その文書へ VS Code の undo が届く。
    const tab = start(false);

    expect(step(tab, key('z', { modifier: true })).send).toEqual([]);
    expect(step(tab, key('z', { modifier: true })).handled).toBe(false);
  });
});

describe('持ち方と入れ替え', () => {
  test('lets go when the way of grabbing changes', () => {
    const held = after(PANEL, press(R1));

    const { state, send } = step(held, { kind: 'mode', mode: 'node' });

    expect(state.mode).toBe('node');
    expect(state.picked).toBeNull();
    expect(send).toEqual([{ kind: 'select' }]);
  });

  test('lets go when the map is drawn again, because the elements are new', () => {
    const held = after(PANEL, press(R1));

    expect(step(held, { kind: 'refresh' }).state.picked).toBeNull();
  });

  test('only grabs what the current way of grabbing allows', () => {
    // 部品の升にも節点は立つ。どちらも掴めると、掴んだつもりと違うものが動く。
    const nodes = after(start(true), { kind: 'mode', mode: 'node' });

    expect(step(nodes, press(R1)).state.picked).toBeNull();
  });
});
