import { describe, expect, test } from 'vitest';
import { NOTHING, fineOf, hint, start, step } from './mapState.ts';
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
  ({ kind: 'key', key: name, shift: false, modifier: false, ...extra });
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

    expect(state.carry).toEqual({ kind: 'move', part: 'R1', byPointer: false, note: false });
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

    expect(dragged.carry).toEqual({ kind: 'move', part: 'R1', byPointer: true, note: false });
    // **掴んだ升も添える** — アンカーとの差を殻が引く (胴の途中を掴んでも影がずれない)。
    expect(step(dragged, release(AT_B3)).send).toEqual([{ kind: 'move', part: 'R1', from: 'a1', to: 'b3' }]);
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

  test('turns and flips a lifted part, which the docs promise for anything on the cursor', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'));

    expect(step(lifted, key('r')).send).toEqual([{ kind: 'turn', part: 'R1', quarters: 1 }]);
    expect(step(lifted, key('R', { shift: true })).send).toEqual([{ kind: 'turn', part: 'R1', quarters: -1 }]);
    expect(step(lifted, key('x')).send).toEqual([{ kind: 'flip', part: 'R1' }]);
    // 持ったままなので、置く先はまだ決まっていない。
    expect(step(lifted, key('r')).state.carry).toEqual({ kind: 'move', part: 'R1', byPointer: false, note: false });
  });

  test('G takes the selected node over the hovered one, like every other key', () => {
    const chosen = after(PANEL, press(ON_NODE), release(ON_NODE, false), hover(over({ cell: 'b9', node: 'b9' })));

    expect(step(chosen, key('g')).state.carry).toEqual({ kind: 'drag', node: 'a3', byPointer: false });
  });

  test('Escape puts a lifted part back', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'));

    expect(step(lifted, key('Escape')).state.carry).toBeNull();
  });
});

describe('置く', () => {
  test('a pick from the palette becomes a thing on the cursor, and asks for its ghost', () => {
    const { state, send } = step(after(PANEL, hover(AT_B3)), place('transistor'));

    expect(state.carry).toEqual({ kind: 'place', type: 'transistor', turn: 0, flip: false, twoEnds: false });
    expect(send).toContainEqual(
      { kind: 'preview', key: 'place:transistor::b3:0:0', what: 'place', type: 'transistor', to: 'b3', turn: 0, flip: false },
    );
  });

  test('asks for a new ghost only when the hole under the cursor changes', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));

    expect(step(carrying, hover(over({ cell: 'b3', part: 'R1' }))).send).toEqual([]);
    expect(step(carrying, hover(over({ cell: 'b4' }))).send).toHaveLength(1);
  });

  test('keeps only the ghost it asked for, and drops an answer it never asked for', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));
    const fresh = { key: 'place:transistor::b3:0:0', cells: ['b3', 'b4', 'b5'], ok: true, why: '' };
    const stale = { ...fresh, key: 'place:transistor::b2:0:0' };

    expect(step(carrying, { kind: 'ghost', ghost: fresh }).state.ghost).toEqual(fresh);
    expect(step(carrying, { kind: 'ghost', ghost: stale }).state.ghost).toBeNull();
  });

  test('takes the answer it is waiting for even after the cursor has moved on', () => {
    // **往復のあいだにマウスは何升も進む。** カーソルの真下の答えしか採らないと、
    // 影は答えが返るたびに 1 回しか動かない (実機で「移動中の反応が悪い」)。
    // 訊いていた場所を控えておき、そこから進んだ分は絵をずらす側が足す。
    const moved = after(PANEL, place('transistor'), hover(AT_B3), hover(over({ cell: 'b7' })));
    const late = { key: 'place:transistor::b3:0:0', cells: ['b3', 'b4', 'b5'], ok: true, why: '' };
    const asked = { key: 'place:transistor::b3:0:0', at: { cell: 'b3', fine: null } };

    const caught = step(moved, { kind: 'ghost', ghost: late, asked }).state;

    expect(caught.ghost).toEqual(late);
    expect(caught.ghostAt).toEqual({ cell: 'b3', fine: null });
  });

  test('still drops an answer for a carry it is no longer holding', () => {
    const moved = after(PANEL, place('transistor'), hover(AT_B3), hover(over({ cell: 'b7' })));
    const other = { key: 'place:resistor::b3:0:0', cells: ['b3'], ok: true, why: '' };
    const asked = { key: 'place:transistor::b3:0:0', at: { cell: 'b3', fine: null } };

    expect(step(moved, { kind: 'ghost', ghost: other, asked }).state.ghost).toBeNull();
  });

  test('remembers where the answer it took was pointing, so the picture can run ahead', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));
    const fresh = { key: 'place:transistor::b3:0:0', cells: ['b3', 'b4', 'b5'], ok: true, why: '' };

    expect(step(carrying, { kind: 'ghost', ghost: fresh }).state.ghostAt).toEqual({ cell: 'b3', fine: null });
  });

  test('places with one click, sending the pressed hole and the orientation', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3), press(AT_B3));

    const { state, send } = step(carrying, release(AT_B3, false));

    expect(send).toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 0, flip: false }]);
    // **道具は置いたあとも続く** (何本も置くのが普通)。
    expect(state.carry?.kind).toBe('place');
    expect(state.lastPlaced).toEqual({ type: 'transistor', twoEnds: false });
  });

  test('turns and flips the thing on the cursor before it is placed', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));

    const turned = after(carrying, key('r'), key('r'), key('R', { shift: true }), key('x'));

    expect(turned.carry).toEqual({ kind: 'place', type: 'transistor', turn: 1, flip: true, twoEnds: false });
    expect(step(turned, key('r')).send[0]?.key).toBe('place:transistor::b3:2:1');
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

  test('asks for the ghost of the span while it is being dragged, not of the hole alone', () => {
    // ドラッグ中に押した穴を落とすと、緑に光る穴と書かれる穴が食い違う。
    const dragging = after(PANEL, place('resistor', true), hover(AT_B3), press(AT_B3));

    const { send } = step(dragging, drag(over({ cell: 'b8' })));

    expect(send).toEqual([{
      kind: 'preview',
      key: 'place:resistor:b3:b8:0:0',
      what: 'place',
      type: 'resistor',
      to: 'b8',
      turn: 0,
      flip: false,
      from: 'b3',
    }]);
  });

  test('says why when the ghost cannot be placed, before anything is clicked', () => {
    const carrying = after(PANEL, place('transistor'), hover(AT_B3));
    const refused = { key: 'place:transistor::b3:0:0', cells: ['b3'], ok: false, why: '右へ 2 穴ぶん要ります' };

    expect(step(carrying, { kind: 'ghost', ghost: refused }).status).toContain('右へ 2 穴ぶん要ります');
  });

  test('Escape drops the thing on the cursor and returns to picking', () => {
    const { state } = step(after(PANEL, place('transistor')), key('Escape'));

    expect(state.carry).toBeNull();
    expect(state.tool).toBe('select');
  });

  test('Insert puts the last placed type back on the cursor, arity and all', () => {
    const placed = after(PANEL, place('resistor', true), hover(AT_B3), press(AT_B3), release(AT_B3, false), key('Escape'));

    // 足の数まで覚えないと、2 端子なのにドラッグで間隔を選べなくなる。
    expect(step(placed, key('Insert')).state.carry).toEqual(
      { kind: 'place', type: 'resistor', turn: 0, flip: false, twoEnds: true },
    );
    expect(step(PANEL, key('Insert')).state.carry).toBeNull();
  });

  test('A asks the page to open the chooser', () => {
    expect(step(PANEL, key('a')).focus).toBe('search');
    expect(step(PANEL, key('a')).handled).toBe(true);
  });

  test('picking while the wire tool is out drops the half-drawn wire and the tool', () => {
    const wiring = after(PANEL, key('w'), press(AT_B3), release(AT_B3, false));

    const { state } = step(wiring, place('resistor', true));

    expect(state.wireFrom).toBeNull();
    expect(state.tool).toBe('select');
    expect(state.carry?.kind).toBe('place');
  });
});

describe('続けて置く・1 穴ずつ', () => {
  test('nudges the part under the cursor by one hole, letting the fence count the address', () => {
    const hovering = after(PANEL, hover(ON_R1));

    expect(step(hovering, key('ArrowRight')).send).toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: 1 }]);
    expect(step(hovering, key('ArrowUp')).send).toEqual([{ kind: 'nudge', part: 'R1', rows: -1, cols: 0 }]);
    expect(step(hovering, key('ArrowDown')).send).toEqual([{ kind: 'nudge', part: 'R1', rows: 1, cols: 0 }]);
    expect(step(hovering, key('ArrowLeft')).send).toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: -1 }]);
    // 矢印は選んだことにもする (続けて押せる)。
    expect(step(hovering, key('ArrowRight')).state.selected).toEqual({ kind: 'part', id: 'R1' });
  });

  test('nudges by one fine step with a plain arrow, since that is the finer work', () => {
    // 実機で「Ctrl なしでも 1/10 単位で移動するように変更。Ctrl+クリックは廃止」。
    // **細かいほうが既定**で、升ちょうどが Shift 付き。
    const hovering = after(start(true, false, 10), hover(ON_R1));

    expect(step(hovering, key('ArrowRight')).send)
      .toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: 0.1 }]);
    expect(step(hovering, key('ArrowUp')).send)
      .toEqual([{ kind: 'nudge', part: 'R1', rows: -0.1, cols: 0 }]);
    expect(step(hovering, key('ArrowRight')).handled).toBe(true);
  });

  test('nudges by a whole hole while Shift is held, as the modifier now means the grid', () => {
    // 実機で「SHIFT を押しているときには枡単位で動くようにする」。
    const hovering = after(start(true, false, 10), hover(ON_R1));

    expect(step(hovering, key('ArrowRight', { shift: true })).send)
      .toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: 1 }]);
    expect(step(hovering, key('ArrowDown', { shift: true })).send)
      .toEqual([{ kind: 'nudge', part: 'R1', rows: 1, cols: 0 }]);
  });

  test('leaves the arrows on a whole hole on a board, which has no step between holes', () => {
    // 端数を受けないフェンス (板) は Shift の有無にかかわらず 1 穴。
    const hovering = after(PANEL, hover(ON_R1));

    expect(step(hovering, key('ArrowRight')).send).toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: 1 }]);
    expect(step(hovering, key('ArrowRight', { shift: true })).send)
      .toEqual([{ kind: 'nudge', part: 'R1', rows: 0, cols: 1 }]);
  });

  test('no longer steals the arrows for the modifier, since Ctrl lost its meaning', () => {
    const hovering = after(start(true, false, 10), hover(ON_R1));

    expect(step(hovering, key('ArrowRight', { modifier: true })).send).toEqual([]);
    expect(step(hovering, key('ArrowRight', { modifier: true })).handled).toBe(false);
  });

  test('keeps the arrows for the page when there is nothing to nudge', () => {
    expect(step(PANEL, key('ArrowRight')).send).toEqual([]);
    expect(step(PANEL, key('ArrowRight')).handled).toBe(false);
  });

  test('duplicates with Ctrl+D, on the tab as well as in the panel', () => {
    const hovering = after(PANEL, hover(ON_R1));
    const onTab = after(start(false), hover(ON_R1));

    expect(step(hovering, key('d', { modifier: true })).send).toEqual([{ kind: 'duplicate', part: 'R1' }]);
    // 複製は VS Code と鍵を取り合わないので、タブそのものがマップでも効く。
    expect(step(onTab, key('d', { modifier: true })).send).toEqual([{ kind: 'duplicate', part: 'R1' }]);
    expect(step(onTab, key('d', { modifier: true })).handled).toBe(true);
  });

  test('says nothing on Ctrl+D with no part in reach', () => {
    expect(step(PANEL, key('d', { modifier: true })).send).toEqual([]);
  });
});

describe('Shift を押しながら選ぶ', () => {
  const shiftPress = (under: Under): Event =>
    ({ kind: 'press', under, x: 0, y: 0, onMap: true, shift: true });
  const ON_C1 = over({ cell: 'a4', part: 'C1' });

  test('adds the part to the group instead of starting over', () => {
    // 実機で頼まれた。領域で囲むだけでは、飛び飛びの組が作れない。
    const one = after(PANEL, press(ON_R1), release(ON_R1, false));
    const two = after(one, shiftPress(ON_C1));

    expect(two.also.map((one) => one.id)).toEqual(['R1', 'C1']);
  });

  test('takes it back out when it is already in the group', () => {
    const many = after(PANEL, { kind: 'pickMany', parts: ['R1', 'C1', 'D1'] });
    const fewer = after(many, shiftPress(ON_C1));

    expect(fewer.also.map((one) => one.id)).toEqual(['R1', 'D1']);
  });

  test('falls back to the plain one-part shape when only one is left', () => {
    // `also` は 2 つ以上のときだけ持つ (`pickedParts` の約束)。
    const two = after(PANEL, { kind: 'pickMany', parts: ['R1', 'C1'] });
    const one = after(two, shiftPress(ON_C1));

    expect(one.selected).toEqual({ kind: 'part', id: 'R1' });
    expect(one.also).toEqual([]);
  });

  test('ends up with nothing selected when the last one is taken out', () => {
    const one = after(PANEL, press(ON_R1), release(ON_R1, false));

    expect(after(one, shiftPress(ON_R1)).selected).toBeNull();
  });

  test('says how many are in the group, so the count is never a guess', () => {
    const one = after(PANEL, press(ON_R1), release(ON_R1, false));

    expect(step(one, shiftPress(ON_C1)).status).toContain('2 個');
    expect(step(one, shiftPress(ON_R1)).status).toContain('0 個');
  });

  test('leaves the wire tool alone, where Shift already folds', () => {
    const wiring = after(PANEL, key('w'));

    expect(after(wiring, shiftPress(AT_B3)).wireFrom).toEqual({ cell: 'b3', fine: null });
  });
});

describe('テキスト側のカーソルが指したもの', () => {
  test('takes the part the cursor sits on as the selected one, so its fields open', () => {
    // 実機で「カーソルを当てた部品の属性も表示して、変更できるように」。
    const aimed = after(PANEL, { kind: 'aim', picked: { kind: 'part', id: 'R1' } });

    expect(aimed.selected).toEqual({ kind: 'part', id: 'R1' });
  });

  test('says nothing back, since the extension is the one watching the cursor', () => {
    // こちらから「選んだ」と言うと、同じことを 2 度することになる。
    expect(step(PANEL, { kind: 'aim', picked: { kind: 'part', id: 'R1' } }).send).toEqual([]);
  });

  test('leaves a part being placed alone, so the cursor cannot steal it', () => {
    const placing = after(PANEL, key('a'));
    const carried = { ...placing, carry: { kind: 'place', type: 'resistor', twoEnds: true } } as State;

    expect(step(carried, { kind: 'aim', picked: { kind: 'part', id: 'R1' } }).state.selected).toBeNull();
  });

  test('takes the whole group when the extension names more than one', () => {
    // 複製したものを選ばせる道。写しが 2 つ以上なら群れとして持つ。
    const picked = { kind: 'part' as const, id: 'R2' };
    const also = [picked, { kind: 'part' as const, id: 'C2' }];

    expect(after(PANEL, { kind: 'aim', picked, also }).also).toEqual(also);
  });

  test('drops a group selection, since the cursor points at one thing', () => {
    const many = after(PANEL, { kind: 'pickMany', parts: ['R1', 'C1'] });
    expect(many.also).toHaveLength(2);

    expect(after(many, { kind: 'aim', picked: { kind: 'part', id: 'D1' } }).also).toEqual([]);
  });
});

describe('配線', () => {
  test('W starts the wire tool; the first click sets the start, the second draws', () => {
    const wiring = after(PANEL, key('w'));
    expect(wiring.tool).toBe('wire');

    const started = after(wiring, press(AT_B3), release(AT_B3, false));
    expect(started.wireFrom).toEqual({ cell: 'b3', fine: null });
    expect(hint(started)).toContain('b3 から');

    const { state, send } = step(after(started, press(over({ cell: 'b8' }))), release(over({ cell: 'b8' }), false));
    expect(send).toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--' }]);
    expect(state.wireFrom).toBeNull();
  });

  test('a drag from hole to hole draws in one gesture', () => {
    const wiring = after(PANEL, key('w'), press(AT_B3));

    expect(step(wiring, release(over({ cell: 'b8' }))).send).toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--' }]);
  });

  test('takes a leg as an end, so a wire can start or finish on a pin', () => {
    // 足の丸は部品の升の上に重なるので、穴を先に採ると足を押しても穴につながる。
    const onPin = over({ cell: 'b2', part: 'Q1', pin: 'Q1.C' });
    const wiring = after(PANEL, key('w'), press(onPin));

    expect(wiring.wireFrom).toEqual({ cell: 'Q1.C', fine: null });
    expect(step(wiring, release(over({ cell: 'b8' }))).send)
      .toEqual([{ kind: 'addWire', from: 'Q1.C', to: 'b8', operator: '--' }]);
  });

  test('finishes on a leg too', () => {
    const wiring = after(PANEL, key('w'), press(AT_B3));

    expect(step(wiring, release(over({ cell: 'b2', part: 'Q1', pin: 'Q1.E' }))).send)
      .toEqual([{ kind: 'addWire', from: 'b3', to: 'Q1.E', operator: '--' }]);
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

describe('配線の色見本', () => {
  // 実機で「ドロップダウンメニューではなく、固定の色パレット」「色パレットから
  // 色を選択した後、配線するとその色で配線できるようにする」。
  const wiring = after(PANEL, key('w'));

  test('remembers the colour that was picked, so the next wire is drawn in it', () => {
    const inked = after(wiring, { kind: 'ink', color: 'red' });

    expect(inked.ink).toBe('red');
    const drawn = after(inked, press(AT_B3), release(AT_B3, false));
    expect(step(drawn, release(over({ cell: 'b7' }), false)).send).toEqual([
      { kind: 'addWire', from: 'b3', to: 'b7', operator: '--', color: 'red' },
    ]);
  });

  test('writes no colour until one is picked, keeping the fence default', () => {
    const drawn = after(wiring, press(AT_B3), release(AT_B3, false));

    expect(step(drawn, release(over({ cell: 'b7' }), false)).send).toEqual([
      { kind: 'addWire', from: 'b3', to: 'b7', operator: '--' },
    ]);
  });

  test('puts the pen down when the same colour is pressed again', () => {
    const twice = after(wiring, { kind: 'ink', color: 'red' }, { kind: 'ink', color: 'red' });

    expect(twice.ink).toBeNull();
  });

  test('paints the wires that are selected, so the palette acts on what is visible', () => {
    const picked = step(start(false), { kind: 'pickMany', parts: [], wires: ['7', '9'] }).state;

    expect(step(picked, { kind: 'ink', color: 'blue' }).send).toEqual([
      { kind: 'setField', part: 'wire:7', field: 'color', text: 'blue' },
      { kind: 'setField', part: 'wire:9', field: 'color', text: 'blue' },
    ]);
  });
});

describe('まとめて選ぶ (領域選択)', () => {
  const picked = (...ids: string[]) => step(start(false), { kind: 'pickMany', parts: ids });

  test('remembers everything the band caught, and says how many', () => {
    const out = picked('R1', 'R2', 'R3');

    expect(out.state.selected).toEqual({ kind: 'part', id: 'R1' });
    expect(out.state.also).toHaveLength(3);
    expect(out.status).toContain('3 個');
  });

  test('keeps the single case exactly as it was', () => {
    // 1 つのときは並びを持たない — 受け取る側が数で分けなくて済む。
    const out = picked('R1');

    expect(out.state.also).toEqual([]);
    expect(out.status).toContain('R1');
  });

  test('sends the whole group with turn, flip, duplicate and delete', () => {
    const many = picked('R1', 'R2').state;
    const keyed = (key: string, modifier = false) =>
      step(many, { kind: 'key', key, shift: false, modifier }).send[0];

    expect(keyed('r')).toMatchObject({ kind: 'turn', part: 'R1', parts: ['R1', 'R2'] });
    expect(keyed('x')).toMatchObject({ kind: 'flip', parts: ['R1', 'R2'] });
    expect(keyed('d', true)).toMatchObject({ kind: 'duplicate', parts: ['R1', 'R2'] });
    expect(keyed('Delete')).toMatchObject({ kind: 'delete', ids: ['R1', 'R2'] });
  });

  test('catches wires as well as parts, since both are things you delete', () => {
    // 消せるのは部品と配線の 2 つなのに、囲みで選べるのは部品だけだった
    // (実機で「配線も複数選択に対応する」)。
    const out = step(start(false), { kind: 'pickMany', parts: ['R1'], wires: ['7', '9'] });

    expect(out.state.also).toEqual([
      { kind: 'part', id: 'R1' },
      { kind: 'wire', id: '7' },
      { kind: 'wire', id: '9' },
    ]);
    expect(out.status).toContain('3 個');
  });

  test('deletes the wires along with the parts, keeping the two lists apart', () => {
    // 配線は行で指すので、部品の名札と混ぜると殻が引き分けられない。
    const mixed = step(start(false), { kind: 'pickMany', parts: ['R1'], wires: ['7'] }).state;

    expect(step(mixed, { kind: 'key', key: 'Delete', shift: false, modifier: false }).send[0])
      .toMatchObject({ kind: 'delete', ids: ['R1'], wires: ['7'] });
  });

  test('leaves turning to the parts, because a wire has no posture', () => {
    const mixed = step(start(false), { kind: 'pickMany', parts: ['R1', 'R2'], wires: ['7'] }).state;

    expect(step(mixed, { kind: 'key', key: 'r', shift: false, modifier: false }).send[0])
      .toMatchObject({ kind: 'turn', parts: ['R1', 'R2'] });
  });

  test('does not add the list when only one is selected', () => {
    const one = picked('R1').state;
    const command = step(one, { kind: 'key', key: 'r', shift: false, modifier: false }).send[0];

    expect(command).toEqual({ kind: 'turn', part: 'R1', quarters: 1 });
  });

  test('lets go of the group when the selection is cleared', () => {
    const many = picked('R1', 'R2').state;
    const out = step(many, { kind: 'key', key: 'Escape', shift: false, modifier: false });

    expect(out.state.also).toEqual([]);
    expect(out.state.selected).toBe(null);
  });
});

describe('Ctrl で 1/4 升 (52 の docs/23)', () => {
  /** 1/4 升まで刻めるフェンス (circuit)。 */
  const FINE = start(true, false, 4);
  const quarter = (cell: string, rows: number, cols: number, more: Partial<Under> = {}): Under =>
    over({ cell, fine: { rows, cols }, ...more });
  const Q = { rows: 0.25, cols: -0.25 };
  const AT_Q = quarter('b3', 0.25, -0.25);

  test('rounds the pointer offset to the nearest quarter of the cell, centre being 0', () => {
    expect(fineOf(0, 0, 40, 40, 4)).toEqual({ rows: -0.5, cols: -0.5 });
    expect(fineOf(20, 20, 40, 40, 4)).toEqual({ rows: 0, cols: 0 });
    expect(fineOf(30, 20, 40, 40, 4)).toEqual({ rows: 0, cols: 0.25 });
    expect(fineOf(40, 40, 40, 40, 4)).toEqual({ rows: 0.5, cols: 0.5 });
    expect(fineOf(21, 19, 40, 40, 4)).toEqual({ rows: 0, cols: 0 });
  });

  test('clamps within half a cell, and keeps to the steps the fence named', () => {
    expect(fineOf(-5, 45, 40, 40, 4)).toEqual({ rows: 0.5, cols: -0.5 });
    expect(fineOf(30, 20, 40, 40, 2)).toEqual({ rows: 0, cols: 0.5 });
  });

  test('asks for a ghost again when only the quarter changes, and keys the answer by it', () => {
    const carrying = after(FINE, place('transistor'), hover(AT_B3));

    expect(step(carrying, hover(AT_Q)).send).toEqual([{
      kind: 'preview', key: 'place:transistor::b3:0:0::0.25,-0.25', what: 'place', type: 'transistor',
      to: 'b3', turn: 0, flip: false, fine: Q,
    }]);
    // **端数の付いた問い合わせの答えだけ**を受け取る (Ctrl 無しの古い答えを採らない)。
    const asked = step(carrying, hover(AT_Q)).state;
    const answer = { key: 'place:transistor::b3:0:0::0.25,-0.25', cells: ['b2c7f5'], ok: true, why: '' };
    expect(step(asked, { kind: 'ghost', ghost: answer }).state.ghost).toEqual(answer);
    expect(step(asked, { kind: 'ghost', ghost: { ...answer, key: 'place:transistor::b3:0:0' } }).state.ghost).toBeNull();
  });

  test('sends the quarter with addPart, move, moveNode and addWire', () => {
    expect(step(after(FINE, place('transistor'), hover(AT_Q), press(AT_Q)), release(AT_Q, false)).send)
      .toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 0, flip: false, fine: [Q] }]);
    expect(step(after(FINE, hover(ON_R1), key('m')), release(AT_Q, false)).send)
      .toEqual([{ kind: 'move', part: 'R1', to: 'b3', fine: Q }]);
    expect(step(after(FINE, hover(ON_NODE), key('g')), release(AT_Q, false)).send)
      .toEqual([{ kind: 'moveNode', from: 'a3', to: 'b3', fine: Q }]);
    expect(step(after(FINE, key('w'), press(AT_B3)), release(quarter('b8', 0.25, -0.25))).send)
      .toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--', fine: Q }]);
    // 同じ升の中でも、端数が違えば別の交点 (短い配線が引ける)。
    expect(step(after(FINE, key('w'), press(AT_B3)), release(AT_Q)).send)
      .toEqual([{ kind: 'addWire', from: 'b3', to: 'b3', operator: '--', fine: Q }]);
  });

  test('sends nothing extra without Ctrl, so the fence sees the same messages as before', () => {
    // 端数が無ければ 1 バイトも変わらない。
    expect(step(after(FINE, place('transistor'), hover(AT_B3), press(AT_B3)), release(AT_B3, false)).send)
      .toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 0, flip: false }]);
    expect(step(after(FINE, hover(ON_R1), key('m')), release(AT_B3, false)).send)
      .toEqual([{ kind: 'move', part: 'R1', to: 'b3' }]);
    expect(step(after(FINE, key('w'), press(AT_B3)), release(over({ cell: 'b8' }))).send)
      .toEqual([{ kind: 'addWire', from: 'b3', to: 'b8', operator: '--' }]);
  });

  test('ignores the quarter on a fence that has no place between the holes', () => {
    // 板の 2 つ。Ctrl を押していても素のクリック (案内にも出ない)。
    expect(step(after(PANEL, place('transistor'), hover(AT_Q), press(AT_Q)), release(AT_Q, false)).send)
      .toEqual([{ kind: 'addPart', type: 'transistor', at: ['b3'], turn: 0, flip: false }]);
    expect(step(after(PANEL, place('transistor'), hover(AT_B3)), hover(AT_Q)).send).toEqual([]);
  });

  test('a drag put back in the same cell but another quarter is a move, not a re-select', () => {
    const lifted = after(FINE, press(ON_R1), drag(quarter('a1', 0, 0.25)));
    expect(lifted.carry?.kind).toBe('move');

    expect(step(lifted, release(quarter('a1', 0, 0.25))).send)
      .toEqual([{ kind: 'move', part: 'R1', from: 'a1', to: 'a1', fine: { rows: 0, cols: 0.25 } }]);
    expect(step(lifted, release(ON_R1)).send).toEqual([]);
  });

  test('carries the pressed quarter as the first leg of a span', () => {
    const from = quarter('b3', 0, 0.25);
    const dragging = after(FINE, place('resistor', true), hover(from), press(from));

    expect(step(dragging, drag(over({ cell: 'b8' }))).send).toEqual([{
      kind: 'preview', key: 'place:resistor:b3:b8:0:0:0,0.25:', what: 'place', type: 'resistor',
      to: 'b8', turn: 0, flip: false, from: 'b3', fromFine: { rows: 0, cols: 0.25 },
    }]);
    expect(step(dragging, release(over({ cell: 'b8' }))).send).toEqual([{
      kind: 'addPart', type: 'resistor', at: ['b3', 'b8'], turn: 0, flip: false, fine: [{ rows: 0, cols: 0.25 }, null],
    }]);
  });

  test('forgets the quarter when the chrome says the fence has none', () => {
    const carrying = after(FINE, place('transistor'), hover(AT_Q));

    const swapped = step(carrying, { kind: 'chrome', foldsWire: false, fine: null }).state;

    expect(swapped.fine).toBeNull();
    expect(swapped.under.fine).toBeNull();
    expect(step(swapped, press(AT_Q)).state.pressed?.fine ?? null).toBeNull();
  });

  test('says the step only where the fence can take a quarter, and says where the quarter went', () => {
    // 刻みの案内は**能力表から組む**。板 (端数を受けない) では言わない。
    // 既定が 1/4 升で、Shift が升ちょうど (実機で入れ替えを頼まれた)。
    expect(hint(after(FINE, place('transistor'), hover(AT_B3)))).toContain('1/4 升 (Shift で升ちょうど)');
    expect(hint(after(FINE, hover(ON_R1), key('m')))).toContain('1/4 升 (Shift で升ちょうど)');
    expect(hint(after(FINE, key('w')))).toContain('1/4 升 (Shift で升ちょうど)');
    expect(hint(after(PANEL, place('transistor'), hover(AT_B3)))).not.toContain('升 (Shift');
    expect(hint(after(PANEL, key('w')))).not.toContain('升 (Shift');
    // **Ctrl はもう刻みの鍵ではない** (複製の Ctrl+D だけが残る)。
    expect(hint(after(FINE, place('transistor'), hover(AT_B3)))).not.toContain('Ctrl');
    expect(step(after(FINE, place('transistor'), hover(AT_Q), press(AT_Q)), release(AT_Q, false)).status).toContain('1/4 升');
  });

  test('tells the arrows apart by Shift where the fence has a step between holes', () => {
    expect(hint(after(FINE, hover(ON_R1)))).toContain('矢印で 1/4 升 (Shift で 1 穴)');
    expect(hint(after(PANEL, hover(ON_R1)))).toContain('矢印で 1 穴');
  });

  test('takes the abilities from the chrome, so a swapped language brings its own', () => {
    const swapped = step(PANEL, { kind: 'chrome', foldsWire: true, fine: 4 }).state;

    expect(swapped.foldsWire).toBe(true);
    expect(swapped.fine).toBe(4);
  });
});

describe('残りの道', () => {
  // 実機で踏んだ道ではないが、**通っていない分かれ道**を 1 つずつ押さえる。
  const onNode = over({ cell: 'a3', node: 'a3' });

  test('lifts a part by dragging it, without pressing M first', () => {
    const held = after(PANEL, press(ON_R1));

    expect(step(held, drag(AT_B3)).state.carry).toMatchObject({ kind: 'move', part: 'R1', byPointer: true });
  });

  test('drags a node the same way', () => {
    const held = after(PANEL, press(ON_NODE));

    expect(step(held, drag(AT_B3)).state.carry).toMatchObject({ kind: 'drag', node: 'a3' });
  });

  test('does not lift on a small wobble of the hand', () => {
    const held = after(PANEL, press(ON_R1));

    expect(step(held, drag(ON_R1, false)).state.carry).toBeNull();
  });

  test('drags a node with G, from the selection or from under the cursor', () => {
    expect(after(PANEL, hover(onNode), key('g')).carry).toMatchObject({ kind: 'drag', node: 'a3' });
    expect(after(PANEL, hover(AT_B3), key('g')).carry).toBeNull();
  });

  test('drops a dragged node where it was clicked', () => {
    const dragging = after(PANEL, hover(onNode), key('g'), hover(AT_B3));

    expect(step(dragging, release(AT_B3, false)).send).toEqual([{ kind: 'moveNode', from: 'a3', to: 'b3' }]);
  });

  test('places the last thing again on Insert, remembering how many legs it had', () => {
    const placed = after(PANEL, place('resistor', true), hover(AT_B3), press(AT_B3), release(AT_B3, false));

    expect(after(placed, key('Escape'), key('Insert')).carry)
      .toMatchObject({ kind: 'place', type: 'resistor', twoEnds: true });
  });

  test('does nothing on Insert when nothing has been placed yet', () => {
    expect(step(PANEL, key('Insert')).state.carry).toBeNull();
  });

  test('drops the first wire point on Escape, before leaving the tool', () => {
    const started = after(PANEL, key('w'), hover(AT_B3), press(AT_B3), release(AT_B3, false));
    expect(started.wireFrom).not.toBeNull();

    const dropped = after(started, key('Escape'));
    expect(dropped.wireFrom).toBeNull();
    expect(dropped.tool).toBe('wire');
  });

  test('leaves the tool on the next Escape', () => {
    const wiring = after(PANEL, key('w'));

    expect(after(wiring, key('Escape')).tool).toBe('select');
  });

  test('turns and flips a part it is carrying, since the rewrite lands on the text', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'));

    expect(step(lifted, key('r')).send).toEqual([{ kind: 'turn', part: 'R1', quarters: 1 }]);
    expect(step(lifted, key('x')).send).toEqual([{ kind: 'flip', part: 'R1' }]);
  });

  test('ignores the other keys while something is being carried', () => {
    const lifted = after(PANEL, hover(ON_R1), key('m'));

    expect(step(lifted, key('Delete')).send).toEqual([]);
  });

  test('sends the grabbed cell when a part was picked up by the pointer', () => {
    const dragged = after(PANEL, press(ON_R1), drag(AT_B3));

    expect(step(dragged, release(AT_B3)).send[0]).toMatchObject({ kind: 'move', part: 'R1', from: 'a1' });
  });
});
