import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { Session } from 'fence-kit';
import { listeners } from '../../test/vscodeStub.ts';
import { FOLLOW_DELAY_MS, attachSession } from './vscodeHost.ts';

/**
 * カーソルを追う段取りだけを見る。**マウスで文字を選ぶと出来事は 1 秒に何十回も
 * 来る**ので、そのたびに組み直さないことを確かめる (52 の docs/27)。
 */

/** 数えるだけのセッション。中身は `session.ts` のテストが見ている。 */
const countingSession = (): { session: Session; refreshes: () => number } => {
  let refreshes = 0;
  const session = {
    view: () => ({ html: '', picker: '', issues: '', chrome: {} }),
    refresh: () => { refreshes += 1; },
    handle: () => Promise.resolve(),
    isBoundTo: () => true,
    follows: () => true,
    dispose: () => {},
  } as unknown as Session;
  return { session, refreshes: () => refreshes };
};

/** 開いたことにするだけのパネル。閉じる手を返す。 */
const fakePanel = (): { panel: vscode.WebviewPanel; close: () => void } => {
  let closing: (() => void) | null = null;
  const panel = {
    webview: { onDidReceiveMessage: () => ({ dispose() {} }) },
    onDidDispose: (listen: () => void) => {
      closing = listen;
      return { dispose() {} };
    },
  } as unknown as vscode.WebviewPanel;
  return { panel, close: () => closing?.() };
};

const cursorMoved = (languageId = 'markdown'): unknown => ({
  textEditor: { document: { languageId, uri: { toString: () => 'file:///note.md' } } },
});

describe('attachSession のカーソル追従', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.selection = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('続けて来たカーソルの移動は 1 回の組み直しにまとめる', () => {
    // Arrange
    const { session, refreshes } = countingSession();
    const { panel } = fakePanel();
    attachSession(panel, session);

    // Act — マウスで文字を選んでいるあいだの出来事。
    for (let move = 0; move < 20; move += 1) {
      for (const listen of listeners.selection) listen(cursorMoved());
    }

    // Assert — まとめている間は 1 回も組み直さない。
    expect(refreshes()).toBe(0);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    expect(refreshes()).toBe(1);
  });

  test('待ち時間を過ぎたら、次の移動はまた組み直す', () => {
    // Arrange
    const { session, refreshes } = countingSession();
    const { panel } = fakePanel();
    attachSession(panel, session);

    // Act
    for (const listen of listeners.selection) listen(cursorMoved());
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    for (const listen of listeners.selection) listen(cursorMoved());
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);

    // Assert
    expect(refreshes()).toBe(2);
  });

  test('Markdown 以外のカーソルは追わない', () => {
    // Arrange
    const { session, refreshes } = countingSession();
    const { panel } = fakePanel();
    attachSession(panel, session);

    // Act
    for (const listen of listeners.selection) listen(cursorMoved('typescript'));
    vi.advanceTimersByTime(FOLLOW_DELAY_MS * 2);

    // Assert
    expect(refreshes()).toBe(0);
  });

  test('閉じたあとに予約が残らない', () => {
    // Arrange — 残すと、閉じたセッションを組み直しにいく。
    const { session, refreshes } = countingSession();
    const { panel, close } = fakePanel();
    attachSession(panel, session);

    // Act
    for (const listen of listeners.selection) listen(cursorMoved());
    close();
    vi.advanceTimersByTime(FOLLOW_DELAY_MS * 2);

    // Assert
    expect(refreshes()).toBe(0);
  });
});
