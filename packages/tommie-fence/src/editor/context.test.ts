import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { executed, listeners, state } from '../../test/vscodeStub.ts';
import { FOLLOW_DELAY_MS } from './delay.ts';
import { HAS_FENCE, watchFenceContext } from './context.ts';

/**
 * 題の右の釦を出す文脈の鍵 (`tommieFence.hasFence`)。**フェンスのある `.md` の
 * ときだけ立つ**こと、打鍵のたびに立て直さないことを見る (52 の docs/57)。
 */
const FENCE = '```circuit\nparts:\n  R1: resistor a1 a3 1k\n```\n';

const editorOf = (text: string, languageId = 'markdown'): unknown => {
  const document = { languageId, getText: () => text, uri: { toString: () => 'file:///note.md' } };
  return { document };
};

const settings = (): readonly unknown[] =>
  executed.filter((call) => call[0] === 'setContext' && call[1] === HAS_FENCE).map((call) => call[2]);

const makeContext = (): { context: vscode.ExtensionContext; dispose: () => void } => {
  const subscriptions: { dispose(): void }[] = [];
  return {
    context: { subscriptions } as unknown as vscode.ExtensionContext,
    dispose: () => { for (const one of subscriptions) one.dispose(); },
  };
};

describe('watchFenceContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    executed.length = 0;
    listeners.activeEditor = [];
    listeners.document = [];
    state.activeTextEditor = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('sets the key right away for the editor already open', () => {
    // Arrange
    state.activeTextEditor = editorOf(FENCE);

    // Act
    watchFenceContext(makeContext().context, ['circuit']);

    // Assert
    expect(settings()).toEqual([true]);
  });

  test('clears the key when a markdown file without fences becomes active', () => {
    // Arrange
    state.activeTextEditor = editorOf(FENCE);
    watchFenceContext(makeContext().context, ['circuit']);

    // Act
    const plain = editorOf('# ただの文書\n');
    state.activeTextEditor = plain;
    for (const listen of listeners.activeEditor) listen(plain);

    // Assert
    expect(settings()).toEqual([true, false]);
  });

  test('clears the key for a file that is not markdown, even with a fence in it', () => {
    // Arrange
    watchFenceContext(makeContext().context, ['circuit']);

    // Act
    const other = editorOf(FENCE, 'plaintext');
    state.activeTextEditor = other;
    for (const listen of listeners.activeEditor) listen(other);

    // Assert — 最初の false だけ (同じ値は立て直さない)。
    expect(settings()).toEqual([false]);
  });

  test('keeps the key when the active editor is not a text editor (the map tab, an image)', () => {
    // Arrange
    state.activeTextEditor = editorOf(FENCE);
    watchFenceContext(makeContext().context, ['circuit']);

    // Act — カスタムエディタや webview が前に出ると activeTextEditor は無くなる。
    state.activeTextEditor = undefined;
    for (const listen of listeners.activeEditor) listen(undefined);

    // Assert — 横の組の .md の題から釦が消えないように、前の値のまま。
    expect(settings()).toEqual([true]);
  });

  test('re-reads the active document once per burst of typing', () => {
    // Arrange
    const editor = editorOf('# 書き始め\n') as { document: { getText: () => string } };
    state.activeTextEditor = editor;
    watchFenceContext(makeContext().context, ['circuit']);
    let text = '# 書き始め\n';
    editor.document.getText = () => text;

    // Act — フェンスを 1 字ずつ打つ。
    for (const typed of ['`', '``', '```', '```circuit']) {
      text = `# 書き始め\n${typed}\n`;
      for (const listen of listeners.document) listen({ document: editor.document });
    }

    // Assert — まとめている間は立て直さない。待ち時間のあとに 1 回。
    expect(settings()).toEqual([false]);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(settings()).toEqual([false, true]);
  });

  test('ignores edits to documents that are not active', () => {
    // Arrange
    state.activeTextEditor = editorOf('# 前の文書\n');
    watchFenceContext(makeContext().context, ['circuit']);

    // Act
    const elsewhere = editorOf(FENCE) as { document: unknown };
    for (const listen of listeners.document) listen({ document: elsewhere.document });
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);

    // Assert
    expect(settings()).toEqual([false]);
  });

  test('stops listening and drops a pending check when disposed', () => {
    // Arrange
    const editor = editorOf('# 書き始め\n') as { document: { getText: () => string } };
    state.activeTextEditor = editor;
    const { context, dispose } = makeContext();
    watchFenceContext(context, ['circuit']);
    editor.document.getText = () => FENCE;
    for (const listen of listeners.document) listen({ document: editor.document });

    // Act
    dispose();
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);

    // Assert
    expect(listeners.activeEditor).toEqual([]);
    expect(listeners.document).toEqual([]);
    expect(settings()).toEqual([false]);
  });
});
