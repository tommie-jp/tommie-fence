import { describe, expect, test } from 'vitest';
import { createHistory, sameBody } from './history.ts';
import type { Step } from './history.ts';

const step = (label: string): Step => ({
  label,
  before: ['parts:', '  R1: resistor a1 a3 10k'],
  after: ['parts:', '  R1: resistor b1 b3 10k'],
});

describe('sameBody', () => {
  test('says yes when the fence still holds what was written', () => {
    expect(sameBody(step('R1').after, ['parts:', '  R1: resistor b1 b3 10k'])).toBe(true);
  });

  test('says no when a line was changed by hand', () => {
    expect(sameBody(step('R1').after, ['parts:', '  R1: resistor b1 b5 10k'])).toBe(false);
  });

  test('says no when a line was added, which is what columns could not see', () => {
    // 桁で覚えていたころは、行が増えると覚えている桁が別の行を指した。
    expect(sameBody(step('R1').after, ['parts:', '  C1: capacitor a1 a3', '  R1: resistor b1 b3 10k'])).toBe(false);
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
