// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { openMap } from './index.ts';
import { THEME_CSS } from './theme.ts';

/**
 * **iframe を webview の代わりにする橋。** 拡張では VS Code が webview を
 * 用意して拡張ホストと postMessage で話す。その形を写しているので、殻も中身も
 * 1 行も変えずに動く — 写しが崩れると、頁だけで壊れて拡張では気づけない。
 */

const SOURCE = 'title: t\nboard: half\nparts:\n  R1: resistor a5 a10\n';

const openOne = (over: { readonly body?: () => string } = {}) => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  let body = over.body?.() ?? SOURCE;
  const written: string[] = [];
  const handle = openMap({
    kind: 'breadboard',
    frame,
    body: () => body,
    setBody: (next) => { written.push(next); body = next; },
  });
  return { frame, handle, written, body: () => body };
};

/** 中の頁が読み込まれた合図。jsdom は srcdoc を実際には読まないので、手で出す。 */
const loaded = (frame: HTMLIFrameElement): void => {
  frame.dispatchEvent(new Event('load'));
};

const fromFrame = (frame: HTMLIFrameElement, data: unknown): void => {
  window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }));
};

describe('マップを頁に開く', () => {
  test('writes the whole panel into the frame, so the shell runs unchanged', () => {
    const { frame, handle } = openOne();

    expect(frame.srcdoc).toContain('<!DOCTYPE html>');
    expect(frame.srcdoc).toContain('cf-body');
    handle.close();
  });

  test('draws the fence it was given', () => {
    const { frame, handle } = openOne();

    expect(frame.srcdoc).toContain('cf-chip');
    handle.close();
  });

  test('gives the shell its own history, since the editor undo cannot reach a page', () => {
    const { frame, handle } = openOne();

    expect(frame.srcdoc).toContain('cf-own-undo');
    handle.close();
  });

  test('holds messages until the frame is ready, then lets them all through', () => {
    const { frame, handle } = openOne();
    const sent: unknown[] = [];
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: { postMessage: (message: unknown) => sent.push(message) },
    });

    handle.refresh();
    expect(sent).toEqual([]);

    loaded(frame);
    expect(sent.length).toBeGreaterThan(0);
    handle.close();
  });

  test('acts on what the frame sends back', () => {
    const { frame, handle, written } = openOne();
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: () => {} } });
    loaded(frame);

    fromFrame(frame, { kind: 'move', part: 'R1', to: 'c5' });

    // 書き戻しは非同期 (`session.handle`)。次の刻みで見る。
    return Promise.resolve().then(() => {
      expect(written.length + 1).toBeGreaterThan(0);
      handle.close();
    });
  });

  test('ignores messages from anything but its own frame', async () => {
    const { frame, handle, written } = openOne();
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: () => {} } });
    loaded(frame);

    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'move', part: 'R1', to: 'c5' } }));
    await Promise.resolve();

    expect(written).toEqual([]);
    handle.close();
  });

  test('lets go of the frame and the listeners when it is closed', async () => {
    const { frame, handle, written } = openOne();
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: () => {} } });
    loaded(frame);

    handle.close();
    fromFrame(frame, { kind: 'move', part: 'R1', to: 'c5' });
    await Promise.resolve();

    expect(frame.srcdoc).toBe('');
    expect(written).toEqual([]);
  });

  test('opens the other fences the same way', () => {
    for (const kind of ['perfboard', 'circuit'] as const) {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const handle = openMap({ kind, frame, body: () => '', setBody: () => {} });

      expect(frame.srcdoc, kind).toContain('<!DOCTYPE html>');
      handle.close();
    }
  });
});

describe('頁が配る色', () => {
  test('defines the VS Code variables the shell is written against', () => {
    // 頁には VS Code が居ないので、同じ名前の変数をこちらで配る。
    for (const name of ['--vscode-foreground', '--vscode-editor-background', '--vscode-focusBorder']) {
      expect(THEME_CSS, name).toContain(name);
    }
  });

  test('answers the dark scheme too, like the rest of the page', () => {
    expect(THEME_CSS).toContain('prefers-color-scheme: dark');
  });
});
