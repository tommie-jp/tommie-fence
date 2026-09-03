import { describe, expect, test } from 'vitest';
import { checkFenceEditor, paletteTwoEnds, paletteTypes } from './contract.ts';
import type { ContractFixture } from './contract.ts';
import type { EditResult, FenceEditor } from './fenceEditor.ts';

/**
 * **網そのものを試す。** 契約のテストは 3 つのフェンスで通り続けるので、
 * 網が破れていても黙って通る。わざと壊した実装を通して、言うべきことを
 * 言うかどうかを見る。
 *
 * 見本のフェンスは「1 行 = 1 部品」だけの、いちばん薄い形
 * (`R1: resistor a1 a3`)。3 つのフェンスの共通部分そのもの。
 */

const FIXTURE: ContractFixture = { source: 'R1: resistor a1 a3\n', room: 'b1', part: 'R1', moveTo: 'c1' };

const ok = (lines: readonly { readonly kind: 'insert' | 'delete'; readonly line: number; readonly text?: string }[]): EditResult =>
  ({ ok: true, value: { lines: lines.map((one) => (one.kind === 'insert'
    ? { kind: 'insert' as const, line: one.line, text: one.text ?? '' }
    : { kind: 'delete' as const, line: one.line })), diff: { lost: [], gained: [] } } });

const no = (message: string): EditResult => ({ ok: false, error: { message, line: null } });

/** 行の中の穴 (`R1: resistor a1 a3` の `a1 a3`)。 */
const cellsOn = (line: string): readonly string[] => line.trim().split(/\s+/).slice(2);

const lineOf = (source: string, id: string): string | null =>
  source.split('\n').find((text) => text.startsWith(`${id}:`)) ?? null;

/** 契約を満たす、いちばん薄い実装。ここから 1 つずつ壊す。 */
function fakeEditor(over: Partial<FenceEditor> = {}): FenceEditor {
  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [],
    fenceAt: () => null,
    firstFence: () => null,
    // 掴むための印は殻が読むので、偽物にも本物と同じものを持たせる。
    view: () => ({
      map: '<svg>'
        + '<rect class="cf-cell" data-address="a1"/>'
        + '<g class="cf-chip" data-part="R1"></g>'
        + '<g class="cf-wire" data-line="3"><line class="cf-wire-hit" data-line="3"/></g>'
        + '</svg>',
      issues: '',
    }),
    aimAt: () => null,
    spansOf: (source, _what, id) => (lineOf(source, id) === null ? [] : [{ line: 1, column: 0, length: 2 }]),
    fieldsOf: (source, handle) => (lineOf(source, handle) === null
      ? null
      : { id: handle, type: 'resistor', value: '', label: '', color: '', can: ['type'] }),
    nameOf: (handle) => handle,
    nextId: (_source, type) => (type === 'resistor' || type === 'led' ? 'X1' : null),
    cellsOf: (source, handle) => {
      const line = lineOf(source, handle);
      return line === null ? [] : cellsOn(line);
    },
    foldsWire: false,
    // `a1` の形。行は 1 字、列は数。
    step: (cell, rows, cols) => {
      const found = /^([a-z])(\d+)$/.exec(cell);
      if (found === null) return null;
      const row = String.fromCharCode((found[1] ?? 'a').charCodeAt(0) + rows);
      const col = Number(found[2]) + cols;
      return row < 'a' || row > 'z' || col < 1 ? null : `${row}${col}`;
    },
    palette: () => '<button data-type="resistor" data-ends="2"></button><button data-type="led"></button>',
    typeNames: () => '',
    colorNames: () => '',
    movePart: (source, handle, to) => (lineOf(source, handle) === null
      ? no(`${handle} がありません`)
      : ok([{ kind: 'delete', line: 1 }, { kind: 'insert', line: 1, text: `${handle}: resistor ${to} a3` }])),
    movePoint: () => ok([]),
    addPart: (_source, part) => ok([
      { kind: 'insert', line: 2, text: `${part.id}: ${part.type} ${part.at.join(' ')}` },
    ]),
    duplicate: (source, handle, id) => (lineOf(source, handle) === null
      ? no(`${handle} がありません`)
      : ok([{ kind: 'insert', line: 2, text: `${id}: resistor b1 b3` }])),
    addWire: () => ok([]),
    deletePart: (source, handle) => (lineOf(source, handle) === null
      ? no(`${handle} がありません`)
      : ok([{ kind: 'delete', line: 1 }])),
    deleteWire: () => ok([]),
    rename: () => ok([]),
    setField: () => ok([]),
    turn: () => ok([]),
    flip: () => ok([]),
  };
  return { ...editor, ...over };
}

describe('paletteTypes / paletteTwoEnds', () => {
  test('reads the same marks the webview reads', () => {
    const markup = fakeEditor().palette();

    expect(paletteTypes(markup)).toEqual(['resistor', 'led']);
    expect(paletteTwoEnds(markup, 'resistor')).toBe(true);
    expect(paletteTwoEnds(markup, 'led')).toBe(false);
  });
});

describe('checkFenceEditor', () => {
  test('says nothing about an editor that keeps the contract', () => {
    expect(checkFenceEditor(fakeEditor(), FIXTURE)).toEqual([]);
  });

  test('catches a type that is offered but cannot be named', () => {
    const broken = fakeEditor({ nextId: (_source, type) => (type === 'led' ? null : 'X1') });

    expect(checkFenceEditor(broken, FIXTURE)).toEqual(['led: パレットに出ているのに名前を付けられません']);
  });

  test('catches a type that is offered but refuses one hole — the bug that lived through a release', () => {
    // 3 本足が「穴を 3 つ書きます」と断っていたのがこれ (52 の docs/16)。
    const broken = fakeEditor({
      addPart: (_source, part) => (part.at.length === 1 && part.type === 'led'
        ? no('led は穴を 2 つ書きます')
        : ok([{ kind: 'insert', line: 2, text: `${part.id}: ${part.type} ${part.at.join(' ')}` }])),
    });

    expect(checkFenceEditor(broken, FIXTURE))
      .toEqual(['led: 穴 1 つで置けません (led は穴を 2 つ書きます)']);
  });

  test('catches a part that is placed but reports no holes, so the ghost would light nothing', () => {
    const broken = fakeEditor({ cellsOf: (_source, handle) => (handle === 'X1' ? [] : ['a1', 'a3']) });

    // 置いたとき・動かしたとき・消したときの全部で言う (穴を返せないと
    // ゴーストがどこも光らず、消えたかどうかも分からない)。
    expect(checkFenceEditor(broken, FIXTURE)).toEqual([
      'resistor: 置いたのに X1 の穴を返しません',
      'led: 置いたのに X1 の穴を返しません',
      'R1 を動かしたのに c1 を返しません',
      'R1 を消したのに、まだ穴を返します',
    ]);
  });

  test('catches a trial that writes something else than the real thing', () => {
    const broken = fakeEditor({
      addPart: (_source, part) => ok([{
        kind: 'insert',
        line: 2,
        text: `${part.id}: ${part.type} ${part.preview === true ? 'z9' : part.at.join(' ')}`,
      }]),
    });

    expect(checkFenceEditor(broken, FIXTURE)).toContain('resistor: 試し当てと本番で書く行が違います');
  });

  test('catches a two-ended type that cannot take the span it advertises', () => {
    const broken = fakeEditor({
      addPart: (_source, part) => (part.at.length === 2
        ? no('穴は 1 つです')
        : ok([{ kind: 'insert', line: 2, text: `${part.id}: ${part.type} ${part.at.join(' ')}` }])),
    });

    expect(checkFenceEditor(broken, FIXTURE)).toContain('resistor: 2 端子なのに穴 2 つで置けません');
  });

  test('catches a part that cannot be moved or deleted', () => {
    const stuck = fakeEditor({ movePart: () => no('動かせません'), deletePart: () => no('消せません') });

    expect(checkFenceEditor(stuck, FIXTURE)).toEqual([
      'R1 を c1 へ動かせません (動かせません)',
      'R1 を消せません (消せません)',
    ]);
  });

  test('catches a delete that leaves the part behind', () => {
    const broken = fakeEditor({ deletePart: () => ok([]) });

    expect(checkFenceEditor(broken, FIXTURE)).toEqual(['R1 を消したのに、まだ穴を返します']);
  });

  test('catches a grab mark the webview would read but the map does not carry', () => {
    // 外の `g` にだけ行番号を付けると、掴んでも配線を選べない (実機で踏んだ)。
    const noMark = fakeEditor({
      view: () => ({
        map: '<svg><rect class="cf-cell" data-address="a1"/><g class="cf-chip" data-part="R1"></g>'
          + '<g class="cf-wire" data-line="3"><line class="cf-wire-hit"/></g></svg>',
        issues: '',
      }),
    });

    expect(checkFenceEditor(noMark, FIXTURE)).toContain('配線の掴み手 (.cf-wire-hit) に data-line がありません');
  });

  test('catches a missing map, fields, spans, palette or foldsWire', () => {
    expect(checkFenceEditor(fakeEditor({ view: () => ({ map: '', issues: '' }) }), FIXTURE))
      .toContain('見本の図が空です');
    expect(checkFenceEditor(fakeEditor({ fieldsOf: () => null }), FIXTURE)).toContain('R1 の欄がありません');
    expect(checkFenceEditor(fakeEditor({ spansOf: () => [] }), FIXTURE))
      .toContain('R1 を書いている場所が分かりません');
    expect(checkFenceEditor(fakeEditor({ palette: () => '' }), FIXTURE))
      .toContain('パレットに置ける種類がありません');
    expect(checkFenceEditor(fakeEditor({ foldsWire: undefined as unknown as boolean }), FIXTURE))
      .toContain('foldsWire が真偽値ではありません');
  });
});
