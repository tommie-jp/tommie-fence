import { describe, expect, test } from 'vitest';
import { NOTHING, hint, start, step } from './mapState.ts';
import type { Event, State, Under } from './mapState.ts';

const PANEL = start(true);
const over = (part: Partial<Under>): Under => ({ ...NOTHING, ...part });
const ON_R1 = over({ cell: 'a1', part: 'R1' });
const ON_WIRE = over({ cell: 'a2', wire: '5' });
const ON_NODE = over({ cell: 'a3', node: 'a3' });
const AT_B3 = over({ cell: 'b3' });

const after = (state: State, ...events: readonly Event[]): State =>
  events.reduce((now, event) => step(now, event).state, state);

const hover = (under: Under): Event => ({ kind: 'hover', under });
const press = (under: Under, onMap = true): Event => ({ kind: 'press', under, x: 10, y: 10, onMap });
const drag = (under: Under, far = true): Event => ({ kind: 'drag', under, x: far ? 60 : 10, y: 10 });
const release = (under: Under, far = true, shift = false): Event =>
  ({ kind: 'release', under, x: far ? 60 : 10, y: 10, shift });
const key = (name: string, extra: Partial<Extract<Event, { kind: 'key' }>> = {}): Event =>
  ({ kind: 'key', key: name, shift: false, modifier: false, typing: false, ...extra });
const place = (type: string, twoEnds = false): Event => ({ kind: 'place', type, twoEnds });

describe('カーソルの下が対象 (KiCad の型 1)', () => {
  test('turns the part under the cursor without selecting it first', () => {
    const hovering = after(PANEL, hover(ON_R1));

    expect(step(hovering, key('r')).send).toEqual([{ kind: 'turn', part: 'R1', quarters: 1 }]);
    expect(step(hovering, key('R', { shift: true })).send).toEqual([{ kind: 'turn', part: 'R1', quarters: -1 }]);
    expect(step(hovering, key('x')).send).toEqual([{ kind: 'flip', part: 'R1' }]);
  });

  test('prefers what is selected over what is hovered, so a sequence of keys sticks to one part', () => {
    const held = after(PANEL, press(ON_R1), release(ON_R1, false), hover(over({ cell: 'c1', part: 'R2' })));

    expect(step(held, key('r')).send).toEqual([{ kind: 'turn', part: 'R1', quarters: 1 }]);
  });

  test('deletes the hovered part or wire, and never a node', () => {
    expect(step(after(PANEL, hover(ON_R1)), key('Delete')).send).toEqual([{ kind: 'delete', what: 'part', id: 'R1' }]);
    expect(step(after(PANEL, hover(ON_WIRE)), key('Backspace')).send).toEqual([{ kind: 'delete', what: 'wire', id: '5' }]);
    expect(step(after(PANEL, hover(ON_NODE)), key('Delete')).send).toEqual([]);
  });

  test('says what the keys would do to the thing under the cursor', () => {
    expect(hint(after(PANEL, hover(ON_R1)))).toContain('R1');
    expect(hint(after(PANEL, hover(ON_R1)))).toContain('M 動かす');
    expect(hint(after(PANEL, hover(ON_NODE)))).toContain('G 引きずる');
    expect(hint(PANEL)).toContain('A 部品');
  });

  test('shows the name, not the handle, when a handle carries a number', () => {
    expect(hint(after(PANEL, hover(over({ cell: 'a1', part: 'VCC#2' }))))).toContain('VCC:');
  });
});

describe('選ぶ', () => {
  test('selects the part that was clicked and asks the editor to light it', () => {
    const { state, send } = step(PANEL, press(ON_R1));

    expect(state.selected).toEqual({ kind: 'part', id: 'R1' });
    expect(send).toEqual([{ kind: 'select', what: 'part', id: 'R1' }]);
  });

  test('picks a part before a wire before a node when they share the spot', () => {
    expect(step(PANEL, press(over({ cell: 'a1', part: 'R1', node: 'a1', wire: '3' }))).state.selected?.kind).toBe('part');
    expect(step(PANEL, press(over({ cell: 'a1', node: 'a1', wire: '3' }))).state.selected?.kind).toBe('wire');
    expect(step(PANEL, press(over({ cell: 'a1', node: 'a1' }))).state.selected?.kind).toBe('node');
  });

  test('lets go when the empty part of the map is pressed, but not outside the map', () => {
    const held = after(PANEL, press(ON_R1), release(ON_R1, false));

    expect(step(held, press(AT_B3)).state.selected).toBeNull();
    expect(step(held, press(NOTHING, false)).state.selected).toEqual({ kind: 'part', id: 'R1' });
  });

  test('a click alone never moves anything', () => {
    const held = after(PANEL, press(ON_R1), release(ON_R1, false));

    expect(step(held, release(AT_B3, false)).send).toEqual([]);
    expect(after(held, press(AT_B3), release(AT_B3, false)).selected).toBeNull();
  });

  test('opens the fields on a double click and on E', () => {
    expect(step(PANEL, { kind: 'dblclick', under: ON_R1 }).focus).toBe('id');
    expect(step(after(PANEL, hover(ON_R1)), key('e')).focus).toBe('id');
    expect(step(after(PANEL, hover(ON_R1)), key('e')).state.selected).toEqual({ kind: 'part', id: 'R1' });
  });
});

describe('持ち上げて、置く所で 1 クリック (KiCad の型 2)', () => {
  test('M lifts the part under the cursor and asks for a ghost where the cursor is', () => {
    const { state, send } = step(after(PANEL, hover(ON_R1)), key('m'));

    expect(state.carry).toEqual({ kind: 'move', part: 'R1', byPointer: false });
    expect(send).toEqual([{ kind: 'preview', key: 'move:R1:a1', what: 'move', part: 'R1', to: 'a1' }]);
  });

  test('a lifted part follows the cursor and is put down by a click', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'), hover(AT_B3));

    expect(step(lifted, press(AT_B3)).send).toEqual([]);
    const { state, send } = step(after(lifted, press(AT_B3)), release(AT_B3, false));
    expect(send).toEqual([{ kind: 'move', part: 'R1', to: 'b3' }]);
    expect(state.carry).toBeNull();
  });

  test('dragging a selected part lifts it too, and drops it where the pointer is let go', () => {
    const dragged = after(PANEL, press(ON_R1), drag(AT_B3));

    expect(dragged.carry).toEqual({ kind: 'move', part: 'R1', byPointer: true });
    expect(step(dragged, release(AT_B3)).send).toEqual([{ kind: 'move', part: 'R1', to: 'b3' }]);
  });

  test('a drag let go where it started, or off the holes, only selects', () => {
    const dragged = after(PANEL, press(ON_R1), drag(AT_B3));

    expect(step(dragged, release(ON_R1)).send).toEqual([]);
    expect(step(dragged, release(over({}))).state.carry).toBeNull();
  });

  test('G drags the node under the cursor, keeping its connections, by its own message', () => {
    const lifted = after(PANEL, hover(ON_NODE), key('g'));

    expect(lifted.carry).toEqual({ kind: 'drag', node: 'a3', byPointer: false });
    expect(step(after(lifted, hover(AT_B3), press(AT_B3)), release(AT_B3, false)).send)
      .toEqual([{ kind: 'moveNode', from: 'a3', to: 'b3' }]);
  });

  test('a wire is never lifted, since it has no place to be put', () => {
    expect(after(PANEL, press(ON_WIRE), drag(AT_B3)).carry).toBeNull();
  });

  test('Escape puts a lifted part back', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'));

    expect(step(lifted, key('Escape')).state.carry).toBeNull();
  });
});

describe('置く', () => {
  test('a pick from the palette becomes a thing on the cursor, and asks for its ghost', () => {
    const { state, send } = step(after(PANEL, hover(AT_B3)), place('transistor'));

    expect(state.tool).toBe('place');
    expect(state.carry).toEqual({ kind: 'place', type: 'transistor', turn: 0, flip: false, twoEnds: false });
    expect(send).toContainEqual(
      { kind: 'preview', key: 'place:transistor:b3:0:0', what: 'place', type: 'transistor', to: 'b3', turn: 0, flip: false },
    );
  });

  test('asks for a new ghost only when the hole under the cursor changes', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));

    expect(step(carrying, hover(over({ cell: 'b3', part: 'R1' }))).send).toEqual([]);
    expect(step(carrying, hover(over({ cell: 'b4' }))).send).toHaveLength(1);
  });

  test('keeps only the ghost it asked for, and drops a stale answer', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));
    const fresh = { key: 'place:transistor:b3:0:0', cells: ['b3', 'b4', 'b5'], ok: true, why: '' };
    const stale = { ...fresh, key: 'place:transistor:b2:0:0' };

    expect(step(carrying, { kind: 'ghost', ghost: fresh }).state.ghost).toEqual(fresh);
    expect(step(carrying, { kind: 'ghost', ghost: stale }).state.ghost).toBeNull();
  });

  test('places with one click, sending the pressed hole and the orientation', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3), press(AT_B3));

    const { state, send } = step(carrying, release(AT_B3, false));

    expect(send).toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 0, flip: false }]);
    // **道具は置いたあとも続く** (何本も置くのが普通)。
    expect(state.carry?.kind).toBe('place');
    expect(state.lastPlaced).toBe('transistor');
  });

  test('turns and flips the thing on the cursor before it is placed', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));

    const turned = after(carrying, key('r'), key('r'), key('R', { shift: true }), key('x'));

    expect(turned.carry).toEqual({ kind: 'place', type: 'transistor', turn: 1, flip: true, twoEnds: false });
    expect(step(turned, key('r')).send[0]?.key).toBe('place:transistor:b3:2:1');
    expect(step(after(turned, press(AT_B3)), release(AT_B3, false)).send)
      .toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 1, flip: true }]);
  });

  test('lets a two-lead part be dragged for its span, and still places it with a click', () => {
    const carrying = after(PANEL, place('resistor', true), hover(AT_B3));

    expect(step(after(carrying, press(AT_B3)), release(over({ cell: 'b8' }))).send)
      .toEqual([{ kind: 'addPart', type: 'resistor', at: ['b3', 'b8'], turn: 0, flip: false }]);
    expect(step(after(carrying, press(AT_B3)), release(AT_B3, false)).send)
      .toEqual([{ kind: 'addPart', type: 'resistor', at: ['b3'], turn: 0, flip: false }]);
  });

  test('says why when the ghost cannot be placed, before anything is clicked', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));
    const refused = { key: 'place:transistor:b3:0:0', cells: ['b3'], ok: false, why: '右へ 2 穴ぶん要ります' };

    expect(step(carrying, { kind: 'ghost', ghost: refused }).status).toContain('右へ 2 穴ぶん要ります');
  });

  test('Escape drops the thing on the cursor and returns to picking', () => {
    const { state } = step(after(PANEL, place('transistor')), key('Escape'));

    expect(state.carry).toBeNull();
    expect(state.tool).toBe('select');
  });

  test('Insert puts the last placed type back on the cursor', () => {
    const placed = after(PANEL, place('transistor'), hover(AT_B3), press(AT_B3), release(AT_B3, false), key('Escape'));

    expect(step(placed, key('Insert')).state.carry?.kind).toBe('place');
    expect(step(PANEL, key('Insert')).state.carry).toBeNull();
  });

  test('A asks the page to open the chooser', () => {
    expect(step(PANEL, key('a')).focus).toBe('search');
    expect(step(PANEL, { kind: 'tool', tool: 'place' }).focus).toBe('search');
  });
});

describe('配線', () => {
  test('W starts the wire tool; the first click sets the start, the second draws', () => {
    const wiring = after(PANEL, key('w'));
    expect(wiring.tool).toBe('wire');

    const started = after(wiring, press(AT_B3), release(AT_B3, false));
    expect(started.wireFrom).toBe('b3');
    expect(hint(started)).toContain('b3 から');

    const { state, send } = step(after(started, press(over({ cell: 'b8' }))), release(over({ cell: 'b8' }), false));
    expect(send).toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--' }]);
    expect(state.wireFrom).toBeNull();
  });

  test('a drag from hole to hole draws in one gesture', () => {
    const wiring = after(PANEL, key('w'), press(AT_B3));

    expect(step(wiring, release(over({ cell: 'b8' }))).send).toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--' }]);
  });

  test('folds with Shift only where the fence can write a fold', () => {
    const folding = after(start(true, true), key('w'), press(AT_B3));
    const straight = after(start(true, false), key('w'), press(AT_B3));

    expect(step(folding, release(over({ cell: 'b8' }), true, true)).send[0]?.operator).toBe('-|');
    expect(step(straight, release(over({ cell: 'b8' }), true, true)).send[0]?.operator).toBe('--');
    expect(hint(after(start(true, true), key('w'), press(AT_B3), release(AT_B3, false)))).toContain('Shift');
    expect(hint(after(start(true, false), key('w'), press(AT_B3), release(AT_B3, false)))).not.toContain('Shift');
  });

  test('Escape first forgets the start, then leaves the tool', () => {
    const started = after(PANEL, key('w'), press(AT_B3), release(AT_B3, false));

    const forgot = step(started, key('Escape')).state;
    expect(forgot.wireFrom).toBeNull();
    expect(forgot.tool).toBe('wire');
    expect(step(forgot, key('Escape')).state.tool).toBe('select');
  });
});

describe('戻す・やり直す', () => {
  test('asks the extension on Ctrl+Z / Ctrl+Y when the panel keeps its own history', () => {
    expect(step(PANEL, key('z', { modifier: true })).send).toEqual([{ kind: 'undo' }]);
    expect(step(PANEL, key('Z', { modifier: true, shift: true })).send).toEqual([{ kind: 'redo' }]);
    expect(step(PANEL, key('y', { modifier: true })).send).toEqual([{ kind: 'redo' }]);
  });

  test('lets Ctrl+Z through to VS Code when the tab itself is the map', () => {
    expect(step(start(false), key('z', { modifier: true })).send).toEqual([]);
  });
});

describe('打鍵を横取りしない', () => {
  test('ignores keys typed into a field', () => {
    expect(step(after(PANEL, hover(ON_R1)), key('r', { typing: true })).send).toEqual([]);
  });

  test('forgets the press and the pointer-lifted thing when the pointer is cancelled', () => {
    const dragged = after(PANEL, press(ON_R1), drag(AT_B3));

    expect(step(dragged, { kind: 'cancel' }).state.carry).toBeNull();
    expect(step(after(PANEL, hover(ON_R1), key('m')), { kind: 'cancel' }).state.carry?.kind).toBe('move');
  });

  test('keeps the thing on the cursor across a redraw, but drops the selection', () => {
    const carrying = after(PANEL, place('transistor'), press(ON_R1));

    const { state } = step(carrying, { kind: 'refresh' });

    expect(state.carry?.kind).toBe('place');
    expect(state.selected).toBeNull();
  });
});
