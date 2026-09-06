import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PATIENCE_MS, createPreviewGate } from './previewGate.ts';
import type { Message } from './mapState.ts';

const preview = (key: string): Message => ({ kind: 'preview', key, what: 'move', to: key });

describe('createPreviewGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('最初の試し当てはそのまま送る', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));

    // Act
    gate.post(preview('a'));

    // Assert
    expect(sent).toEqual([preview('a')]);
  });

  test('答えを待っているあいだは送らず、最新の 1 つだけ覚える', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));

    // Act
    gate.post(preview('b'));
    gate.post(preview('c'));
    gate.post(preview('d'));

    // Assert — 途中の穴は通り過ぎたので訊かない。
    expect(sent).toEqual([preview('a')]);
  });

  test('答えが来たら、待たせていた最新の 1 つを送る', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));
    gate.post(preview('b'));
    gate.post(preview('c'));

    // Act
    gate.answered('a');

    // Assert
    expect(sent).toEqual([preview('a'), preview('c')]);
  });

  test('札が合わない答えでも解錠する', () => {
    // Arrange — 古い札の答えは `mapState` が捨てるが、1 つ返ってきたことに変わりはない。
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));
    gate.post(preview('b'));

    // Act
    gate.answered('よその札');

    // Assert
    expect(sent).toEqual([preview('a'), preview('b')]);
  });

  test('カーソルが元の穴へ戻っていたら、同じことを訊き直さない', () => {
    // Arrange — a を訊いている間に b へ行き、a へ戻ってきた。
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));
    gate.post(preview('b'));
    gate.post(preview('a'));

    // Act — いま返ってきたのは、待たせていたものと同じ場所の答え。
    gate.answered('a');

    // Assert
    expect(sent).toEqual([preview('a')]);
  });

  test('答えが来ないままでも、しばらくすれば次を送る', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));
    gate.post(preview('b'));

    // Act — 知らせが通らなかったとき、門が閉じたままにならない。
    vi.advanceTimersByTime(PATIENCE_MS);

    // Assert
    expect(sent).toEqual([preview('a'), preview('b')]);
  });

  test('待たせるものが無ければ、しばらく待っても何も送らない', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));

    // Act
    vi.advanceTimersByTime(PATIENCE_MS * 3);

    // Assert
    expect(sent).toEqual([preview('a')]);
  });

  test('試し当て以外はいつでもそのまま送る', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));

    // Act
    gate.post({ kind: 'select', what: 'part', id: 'R1' });

    // Assert
    expect(sent).toEqual([preview('a'), { kind: 'select', what: 'part', id: 'R1' }]);
  });

  test('確定の知らせが出たら、待たせていた試し当ては捨てる', () => {
    // Arrange — 放して書き換えが始まると、その前の試し当ての答えは古くなる。
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));
    gate.post(preview('a'));
    gate.post(preview('b'));

    // Act
    gate.post({ kind: 'move', part: 'R1', to: 'b3' });
    gate.answered('a');

    // Assert
    expect(sent).toEqual([preview('a'), { kind: 'move', part: 'R1', to: 'b3' }]);
  });

  test('答えが来ていないのに解錠を頼まれても、何も送らない', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));

    // Act
    gate.answered('a');

    // Assert
    expect(sent).toEqual([]);
  });

  test('2 巡目も 1 つずつ送る', () => {
    // Arrange
    const sent: Message[] = [];
    const gate = createPreviewGate((message) => sent.push(message));

    // Act
    gate.post(preview('a'));
    gate.post(preview('b'));
    gate.answered('a');       // b が出る
    gate.post(preview('c'));  // b の答え待ちなので待たせる
    gate.post(preview('d'));
    gate.answered('b');       // d が出る

    // Assert
    expect(sent).toEqual([preview('a'), preview('b'), preview('d')]);
  });
});
