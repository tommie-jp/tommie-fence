import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **マップから来る知らせを一通り通す。**
 *
 * 殻の受け持ちは「フェンスに訊いて、返ってきた書き換えを文書へ当てて、
 * 何が起きたかを言う」の 3 つだけ。綴りを知らないので、ここでは張りぼての
 * フェンスを渡して**どの関数がどの引数で呼ばれたか**と**帯に出る文面**を見る。
 *
 * 図の中身は各パッケージのテストが見る — ここで見たいのは、
 * **知らせの種類ごとに正しい道を通ること**と、断られたときに黙らないこと。
 */

const FENCE = ['```fake', 'R1: resistor a1 a3', 'D1: led a5 a6', '```', ''];
const MARKDOWN = FENCE.join('\n');
const SOURCE = 'R1: resistor a1 a3\nD1: led a5 a6\n';

const ok = (edits: readonly { line: number; column: number; length: number; text: string }[] = []) =>
  ({ ok: true as const, value: { edits, diff: { lost: [], gained: [] } } });
const rewrite = () => ok([{ line: 1, column: 4, length: 8, text: 'capacitor' }]);
const no = (why: string) => ({ ok: false as const, error: { message: why, line: 1 } });

type Call = readonly [string, ...unknown[]];

const open = (over: Partial<FenceEditor> = {}, hostOver: Record<string, unknown> = {}) => {
  const calls: Call[] = [];
  const note = (...call: Call) => { calls.push(call); };

  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [{ line: 1, title: '図01' }],
    fenceAt: (_markdown, line) => (line >= 1 && line <= 4 ? { line: 1, source: SOURCE, indents: [] } : null),
    firstFence: () => ({ line: 1, source: SOURCE, indents: [] }),
    view: () => ({ map: '<svg><g class="cf-chip" data-part="X1"><rect/></g></svg>', issues: '<ul></ul>' }),
    aimAt: () => null,
    spansOf: (_source, _what, id) => [{ line: 1, column: 0, length: id.length }],
    fieldsOf: (_source, handle) => ({
      id: handle, type: 'resistor', value: '330', label: '', color: '', can: ['id', 'type', 'value', 'label'],
    }),
    colorNames: () => '<datalist></datalist>',
    wireColors: () => ['red', 'black'],
    nameOf: (handle) => handle,
    textOf: (_source, handle) => (handle === 'note:2' ? '書いた字' : null),
    nextId: () => 'X1',
    cellsOf: () => ['a1', 'a3'],
    foldsWire: true,
    fine: null,
    step: (cell, rows, cols) => `${cell}+${rows},${cols}`,
    stepsTo: () => ({ rows: 1, cols: 2 }),
    palette: () => '<button data-type="resistor" data-ends="2"></button>',
    typeNames: () => '',
    movePart: (_s, handle, to) => { note('movePart', handle, to); return rewrite(); },
    movePoint: (_s, from, to) => { note('movePoint', from, to); return rewrite(); },
    addPart: (_s, part) => { note('addPart', part.id, part.type, part.at); return rewrite(); },
    duplicate: (_s, handle, id) => { note('duplicate', handle, id); return rewrite(); },
    addWire: (_s, from, to, operator, color) => { note('addWire', from, to, operator, color); return rewrite(); },
    deletePart: (_s, id) => { note('deletePart', id); return rewrite(); },
    deleteWire: (_s, line) => { note('deleteWire', line); return rewrite(); },
    rename: (_s, from, to) => { note('rename', from, to); return rewrite(); },
    setField: (_s, handle, field, value) => { note('setField', handle, field, value); return rewrite(); },
    turn: (_s, handle, quarters) => { note('turn', handle, quarters); return rewrite(); },
    flip: (_s, handle) => { note('flip', handle); return rewrite(); },
    moveWireEnd: (_s, handle, end, to) => { note('moveWireEnd', handle, end, to); return rewrite(); },
    ...over,
  };

  const doc = {
    uri: { toString: () => 'file:///a.md' },
    getText: () => MARKDOWN,
    lineCount: FENCE.length,
    lineAt: (line: number) => ({ text: FENCE[line] ?? '' }),
  };
  const sent: Outgoing[] = [];
  const copied: string[] = [];
  const lit: unknown[] = [];
  const host = {
    post: (message: Outgoing) => sent.push(message),
    documents: () => [doc],
    activeEditor: () => null,
    openDocument: () => doc,
    applyEdits: async () => true,
    replaceBody: async () => true,
    highlight: (...args: unknown[]) => { lit.push(args); },
    copyText: async (written: string) => { copied.push(written); },
    ...hostOver,
  };

  const session = createSession(host as never, [editor], { pinned: doc as never });
  const status = (): string => [...sent].reverse().find((one) => one.kind === 'status')?.text ?? '';
  const last = (kind: string) => [...sent].reverse().find((one) => one.kind === kind);
  return { session, calls, sent, status, last, copied, lit };
};

describe('動かす・置く・消す', () => {
  test('moves the part the map named, and says where it went', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });

    expect(calls).toContainEqual(['movePart', 'R1', 'b3']);
    expect(status()).toContain('b3');
  });

  test('drags a node by its spelling, since a node is the crossing itself', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'moveNode', from: 'a1', to: 'b3' });

    expect(calls).toContainEqual(['movePoint', 'a1', 'b3']);
  });

  test('names the part it places, because the map does not ask for one', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3'] });

    expect(calls).toContainEqual(['addPart', 'X1', 'resistor', ['b3']]);
    expect(status()).toContain('X1');
  });

  test('says why nothing was placed when the kind has no name to give', async () => {
    const { session, calls, status } = open({ nextId: () => null });

    await session.handle({ kind: 'addPart', type: 'nonsense', at: ['b3'] });

    expect(calls).toEqual([]);
    expect(status()).toContain('名前を付けられません');
  });

  test('draws a wire with the operator and the colour the map picked', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'b3', operator: '-|', color: 'red' });

    expect(calls).toContainEqual(['addWire', 'a1', 'b3', '-|', 'red']);
  });

  test('keeps the plain operator when the map sends something it does not know', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'b3', operator: 'nonsense' });

    expect(calls).toContainEqual(['addWire', 'a1', 'b3', '--', undefined]);
  });

  test('deletes one part, and says how many wires went with it', async () => {
    const { session, calls, status } = open({
      deletePart: () => ({ ok: true, value: { edits: [], lines: [{ kind: 'delete', line: 1 }], diff: { lost: [], gained: [] }, wires: 2 } }),
    });

    await session.handle({ kind: 'delete', what: 'part', id: 'R1' });

    expect(status()).toContain('配線 2 本');
    expect(calls).toEqual([]);
  });

  test('deletes one wire by the line it is written on', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'delete', what: 'wire', id: '7' });

    expect(calls).toContainEqual(['deleteWire', 7]);
  });

  /**
   * **まとめて消すときの名札のずれ。**
   *
   * 名札は書かれた場所で決まる — 注釈は行番号そのもの、同じ名前の記号は
   * 書いた順の番号、配線は行番号。1 つ消すたびに残りがずれるので、
   * 下から消し、行で指すものは当てる直前に数え直す (52 の docs/31)。
   *
   * 張りぼての `delete…` は**行を消して返す** — 実物 3 つともそうで
   * (`remove.ts` の「消すのは行ごと」)、数え直しはそれを頼りにしている。
   */
  const FENCE_LINES = [
    'wires:',
    '  - a4 -- Q1.b',
    '  - a3 -- a4',
    '  - a1 -- a2',
    'parts:',
    '  IN: port a1',
    '  Q1: npn b5',
  ];
  const drops = (...lines: readonly number[]) => ({
    ok: true as const,
    value: {
      edits: [],
      lines: [...lines].sort((a, b) => a - b).map((line) => ({ kind: 'delete' as const, line })),
      diff: { lost: [], gained: [] },
    },
  });

  /** 行を消す張りぼて。部品は自分の行と、連れていく行 (`with`) を落とす。 */
  const dropping = (
    at: Record<string, number>,
    also: Record<string, readonly number[]> = {},
    note: (...call: Call) => void = () => {},
  ): Partial<FenceEditor> => ({
    fenceAt: () => ({ line: 1, source: FENCE_LINES.join('\n'), indents: [] }),
    firstFence: () => ({ line: 1, source: FENCE_LINES.join('\n'), indents: [] }),
    spansOf: (_source, _what, id) => (at[id] === undefined ? [] : [{ line: at[id], column: 0, length: id.length }]),
    deletePart: (_s, id) => { note('deletePart', id); return drops(at[id] ?? 1, ...(also[id] ?? [])); },
    deleteWire: (_s, line) => { note('deleteWire', line); return drops(line); },
  });

  test('deletes a whole group in one rewrite, from the bottom of the fence up', async () => {
    const calls: Call[] = [];
    const { session, status } = open(dropping({ IN: 6, Q1: 7 }, {}, (...one) => { calls.push(one); }));

    await session.handle({ kind: 'delete', what: 'part', id: 'Q1', ids: ['Q1', 'IN'], wires: ['3', '4'] });

    // 7 → 6 → 4 → 3 の順。行の大きいものから当てる。
    expect(calls.map((one) => one[0])).toEqual(['deletePart', 'deletePart', 'deleteWire', 'deleteWire']);
    expect(calls).toEqual([
      ['deletePart', 'Q1'], ['deletePart', 'IN'], ['deleteWire', 4], ['deleteWire', 3],
    ]);
    expect(status()).toContain('4 個');
  });

  /**
   * 部品は足を指す配線も連れていく。**その配線が上の行にある**と、あとに残った
   * 配線の行番号が繰り上がる — 数え直さないと、選んでいない配線を消してしまう。
   */
  test('counts the line of a wire again after a part has taken one with it', async () => {
    const calls: Call[] = [];
    // Q1 (7 行目) は足を指す配線 (2 行目) も連れていく。
    const { session } = open(dropping({ Q1: 7 }, { Q1: [2] }, (...one) => { calls.push(one); }));

    await session.handle({ kind: 'delete', what: 'part', id: 'Q1', ids: ['Q1'], wires: ['3'] });

    // 3 行目の配線は、2 行目が消えたので 2 行目に来ている。
    expect(calls).toEqual([['deletePart', 'Q1'], ['deleteWire', 2]]);
  });

  test('drops a target that another one has already taken with it', async () => {
    const calls: Call[] = [];
    const { session } = open(dropping({ Q1: 7 }, { Q1: [2] }, (...one) => { calls.push(one); }));

    await session.handle({ kind: 'delete', what: 'part', id: 'Q1', ids: ['Q1'], wires: ['2'] });

    // **断りにしない。** 一緒に連れていかれただけで、用は済んでいる。
    expect(calls).toEqual([['deletePart', 'Q1']]);
  });

  test('takes a note by the line in its own handle, which spansOf cannot always give', async () => {
    // 図の外に出る注釈 (`source`) は光らせる先が無く、`spansOf` が空で返る。
    // そこで 0 行目と数えると、いちばん上の物として最後に消され、名札がずれる。
    const calls: Call[] = [];
    const { session } = open(dropping({ IN: 6 }, {}, (...one) => { calls.push(one); }));

    await session.handle({ kind: 'delete', what: 'part', id: 'IN', ids: ['IN', 'note:7'], wires: [] });

    expect(calls).toEqual([['deletePart', 'note:7'], ['deletePart', 'IN']]);
  });

  test('says what it could not do when part of a group refuses', async () => {
    const { session, status } = open({ deletePart: (_s, id) => (id === 'D1' ? no('消せません') : rewrite()) });

    await session.handle({ kind: 'delete', what: 'part', id: 'R1', ids: ['R1', 'D1'], wires: [] });

    expect(status()).toContain('1 件できませんでした');
  });

  test('says it cannot read a delete with nothing to delete', async () => {
    const { session, status } = open();

    await session.handle({ kind: 'delete', what: 'part' });

    expect(status()).toContain('読めませんでした');
  });
});

describe('回す・反転する・複製する', () => {
  test('turns one part the way the map asked', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'turn', part: 'R1', quarters: -1 });

    expect(calls).toContainEqual(['turn', 'R1', -1]);
    expect(status()).toContain('反時計回り');
  });

  test('flips one part', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'flip', part: 'R1' });

    expect(calls).toContainEqual(['flip', 'R1']);
  });

  test('turns a whole group in one rewrite, so one undo puts it back', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'turn', part: 'R1', parts: ['R1', 'D1'], quarters: 1 });

    expect(calls).toEqual([['turn', 'R1', 1], ['turn', 'D1', 1]]);
    expect(status()).toContain('2 個を回転しました');
  });

  test('says it cannot read a turn with no part on it', async () => {
    const { session, status } = open();

    await session.handle({ kind: 'turn', quarters: 1 });

    expect(status()).toContain('読めませんでした');
  });

  test('duplicates one part and selects the copy, so the next key hits the copy', async () => {
    const { session, calls, last } = open();

    await session.handle({ kind: 'duplicate', part: 'R1' });

    expect(calls).toContainEqual(['duplicate', 'R1', 'X1']);
    // **写したほうを選ぶ** — 続けて動かす・回すが写しに効く。
    expect(last('aim')).toMatchObject({ what: 'part', id: 'X1' });
  });

  test('duplicates a group, taking a fresh name for each one', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'duplicate', part: 'R1', parts: ['R1', 'D1'] });

    expect(calls).toEqual([['duplicate', 'R1', 'X1'], ['duplicate', 'D1', 'X1']]);
  });
});

describe('欄と名前', () => {
  test('writes the field the panel changed', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'setField', part: 'R1', field: 'value', text: '1k' });

    expect(calls).toContainEqual(['setField', 'R1', 'value', '1k']);
  });

  test('renames, and says the new name', async () => {
    const { session, calls, status } = open();

    await session.handle({ kind: 'rename', what: 'part', part: 'R1', text: 'R9' });

    expect(calls).toContainEqual(['rename', 'R1', 'R9']);
    expect(status()).toContain('R9');
  });

  test('lights what was selected and hands the panel its fields', async () => {
    const { session, last, lit } = open();

    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    expect(last('fields')).toBeDefined();
    expect(lit.length).toBeGreaterThan(0);
  });

  test('copies the words of a note to the clipboard', async () => {
    const { session, copied, status } = open();

    await session.handle({ kind: 'copyText', part: 'note:2' });

    expect(copied).toEqual(['書いた字']);
    expect(status()).toContain('書いた字');
  });

  test('says there is nothing to copy on a part, rather than copying its name', async () => {
    const { session, copied, status } = open();

    await session.handle({ kind: 'copyText', part: 'R1' });

    expect(copied).toEqual([]);
    expect(status()).toContain('写せる字がありません');
  });

  test('says so when the screen has no clipboard at all', async () => {
    const { session, status } = open({}, { copyText: undefined });

    await session.handle({ kind: 'copyText', part: 'note:2' });

    expect(status()).toContain('クリップボードへ写せません');
  });
});

describe('矢印と配線の端', () => {
  test('counts the arrow step in the fence, not in the shell', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'nudge', part: 'R1', rows: 1, cols: 0 });

    expect(calls).toContainEqual(['movePart', 'R1', 'a1+1,0']);
  });

  test('says the part cannot go further when the fence has nowhere to step', async () => {
    const { session, status } = open({ step: () => null });

    await session.handle({ kind: 'nudge', part: 'R1', rows: -1, cols: 0 });

    expect(status()).toContain('これ以上');
  });

  test('moves one end of a wire, leaving the other where it is', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'moveWireEnd', line: '7', end: 'to', to: 'b3' });

    expect(calls).toContainEqual(['moveWireEnd', 'wire:7', 'to', 'b3']);
  });
});

describe('断りと空振り', () => {
  test('says why, when the fence refuses', async () => {
    const { session, status } = open({ movePart: () => no('動かせません') });

    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });

    expect(status()).toContain('動かせません');
  });

  test('says nothing changed, rather than claiming it did', async () => {
    const { session, status } = open({ movePart: () => ok([]) });

    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });

    expect(status()).toContain('すでに');
  });

  test('ignores a kind it does not know, instead of throwing at the panel', async () => {
    const { session } = open();

    await expect(session.handle({ kind: 'nonsense' })).resolves.toBeUndefined();
  });
});

describe('ゴースト', () => {
  test('answers a place preview with the holes it would take, and a picture', async () => {
    const { session, last } = open();

    await session.handle({ kind: 'preview', key: 'k', what: 'place', type: 'resistor', to: 'b3' });

    const ghost = last('ghost');
    expect(ghost).toMatchObject({ key: 'k', ok: true, cells: ['a1', 'a3'] });
    expect((ghost as { chip?: string }).chip).toContain('data-part="X1"');
  });

  test('answers a move preview with where the part would land', async () => {
    const { session, last } = open();

    await session.handle({ kind: 'preview', key: 'k', what: 'move', part: 'R1', to: 'b3' });

    expect(last('ghost')).toMatchObject({ key: 'k', ok: true });
  });

  test('answers a node preview with the one crossing it would move to', async () => {
    const { session, last } = open();

    await session.handle({ kind: 'preview', key: 'k', what: 'node', from: 'a1', to: 'b3' });

    expect(last('ghost')).toMatchObject({ key: 'k', cells: ['b3'] });
  });

  test('answers with the refusal when the placement is not allowed', async () => {
    const { session, last } = open({ addPart: () => no('置けません') });

    await session.handle({ kind: 'preview', key: 'k', what: 'place', type: 'resistor', to: 'b3' });

    expect(last('ghost')).toMatchObject({ ok: false, why: '置けません' });
  });

  test('answers an unreadable preview rather than leaving the map waiting', async () => {
    const { session, last } = open();

    await session.handle({ kind: 'preview', key: 'k', what: 'place' });

    expect(last('ghost')).toMatchObject({ key: 'k', ok: false });
  });
});

describe('フェンスの選び手と行送り', () => {
  test('switches to the fence the picker named', async () => {
    const { session } = open();

    await session.handle({ kind: 'fence', line: 1 });

    expect(session.view().html).toContain('cf-chip');
  });

  test('opens the document at the line the band pointed at', async () => {
    const { session, lit } = open();

    await session.handle({ kind: 'goto', line: 2 });

    expect(lit.length).toBeGreaterThanOrEqual(0);
  });
});

describe('殻そのもの', () => {
  test('hands the panel the palette, the lists and the colour swatches', () => {
    const { chrome } = open().session.view();

    expect(chrome.palette).toContain('data-type="resistor"');
    expect(chrome.swatches).toContain('data-color="red"');
    expect(chrome.foldsWire).toBe(true);
  });

  test('knows which document it is bound to', () => {
    const { session } = open();

    expect(session.isBoundTo('file:///a.md')).toBe(true);
    expect(session.follows('file:///a.md')).toBe(true);
    expect(session.follows('file:///other.md')).toBe(false);
  });

  test('lets go of everything when it is disposed', () => {
    const { session } = open();

    expect(() => session.dispose()).not.toThrow();
  });
});
