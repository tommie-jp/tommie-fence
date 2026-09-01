import { describe, expect, test } from 'vitest';
import { changesOf, createHistory, invert } from './history.ts';
import type { Step } from './history.ts';

const step = (label: string): Step => ({
  label,
  changes: [{ line: 3, from: { column: 6, text: 'a1' }, to: { column: 6, text: 'b2' } }],
});

describe('invert', () => {
  test('swaps what was there for what was written, so it can be put back', () => {
    expect(invert(step('R1')).changes[0]).toEqual({
      line: 3, from: { column: 6, text: 'b2' }, to: { column: 6, text: 'a1' },
    });
  });

  test('carries each side with its own column, since a longer spelling shifts the rest', () => {
    // `a9 b9` を `a10 b10` にすると、行の後ろの綴りは 1 桁ずれた場所にある。
    const shifted: Step = {
      label: 'R1',
      changes: [{ line: 0, from: { column: 16, text: 'b9' }, to: { column: 17, text: 'b10' } }],
    };

    expect(invert(shifted).changes[0]).toEqual({
      line: 0, from: { column: 17, text: 'b10' }, to: { column: 16, text: 'b9' },
    });
  });

  test('keeps the label, so the panel can say what it is undoing', () => {
    expect(invert(step('R1 を b2 へ')).label).toBe('R1 を b2 へ');
  });
});

describe('createHistory', () => {
  test('has nothing to undo or redo when it starts', () => {
    expect(createHistory().state()).toEqual({ canUndo: false, canRedo: false });
  });

  test('offers the last move to undo', () => {
    const history = createHistory();
    history.push(step('one'));
    history.push(step('two'));

    expect(history.takeUndo()?.label).toBe('two');
    expect(history.state().canUndo).toBe(true);
  });

  test('moves an undone step over to redo, only once it is committed', () => {
    const history = createHistory();
    history.push(step('one'));

    // **当ててから動かす。** 先に動かすと、当てられなかったとき履歴が嘘になる。
    expect(history.state()).toEqual({ canUndo: true, canRedo: false });
    history.commitUndo();

    expect(history.state()).toEqual({ canUndo: false, canRedo: true });
    expect(history.takeRedo()?.label).toBe('one');
  });

  test('puts a redone step back on the undo side', () => {
    const history = createHistory();
    history.push(step('one'));
    history.commitUndo();
    history.commitRedo();

    expect(history.state()).toEqual({ canUndo: true, canRedo: false });
  });

  test('drops a step that could not be applied, rather than offering it again', () => {
    const history = createHistory();
    history.push(step('one'));
    history.dropUndo();

    expect(history.state()).toEqual({ canUndo: false, canRedo: false });
  });

  test('forgets the redo side once a new move is made', () => {
    // 分かれた先に戻る道は無い。普通のエディタと同じ。
    const history = createHistory();
    history.push(step('one'));
    history.commitUndo();
    history.push(step('two'));

    expect(history.state()).toEqual({ canUndo: true, canRedo: false });
  });

  test('keeps the history bounded, so a long session cannot grow without end', () => {
    const history = createHistory(2);
    history.push(step('one'));
    history.push(step('two'));
    history.push(step('three'));

    history.commitUndo();
    history.commitUndo();

    expect(history.state().canUndo).toBe(false);
    expect(history.takeRedo()?.label).toBe('two');
  });

  test('forgets everything when the panel moves to another document', () => {
    const history = createHistory();
    history.push(step('one'));
    history.clear();

    expect(history.state()).toEqual({ canUndo: false, canRedo: false });
  });
});

describe('changesOf', () => {
  test('keeps both sides at the same column when nothing changes length', () => {
    const changes = changesOf([{ line: 4, column: 13, before: 'a1', after: 'b1' }]);

    expect(changes[0]).toEqual({ line: 4, from: { column: 13, text: 'a1' }, to: { column: 13, text: 'b1' } });
  });

  test('shifts what follows on the line when a spelling gets longer', () => {
    // `R1: resistor a9 b9` を a10 へ。当てたあと `b10` は 1 桁右にいる。
    const changes = changesOf([
      { line: 0, column: 13, before: 'a9', after: 'a10' },
      { line: 0, column: 16, before: 'b9', after: 'b10' },
    ]);

    expect(changes[1]?.from.column).toBe(16);
    expect(changes[1]?.to.column).toBe(17);
  });

  test('shifts back when a spelling gets shorter', () => {
    const changes = changesOf([
      { line: 0, column: 13, before: 'a10', after: 'a9' },
      { line: 0, column: 17, before: 'b10', after: 'b9' },
    ]);

    expect(changes[1]?.to.column).toBe(16);
  });

  test('does not let one line shift another', () => {
    const changes = changesOf([
      { line: 0, column: 13, before: 'a9', after: 'a10' },
      { line: 1, column: 13, before: 'b9', after: 'b10' },
    ]);

    expect(changes[1]?.to.column).toBe(13);
  });
});
