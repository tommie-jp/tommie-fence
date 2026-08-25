import { describe, expect, test, vi } from 'vitest';
import { createRenderQueue } from './renderQueue.ts';
import type { TexRenderer } from './renderQueue.ts';

const lineMap = new Map([[9, 3]]);

const drawn = (svg: string): TexRenderer => async () => ({ ok: true, svg });

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};

describe('createRenderQueue', () => {
  test('has nothing before anything was drawn', () => {
    const queue = createRenderQueue({ render: drawn('<svg/>'), onDrawn: () => {} });

    expect(queue.lookup('abc')).toBeUndefined();
  });

  test('keeps the drawing so the next preview can pick it up', async () => {
    const queue = createRenderQueue({ render: drawn('<svg/>'), onDrawn: () => {} });

    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    expect(queue.lookup('abc')).toEqual({ svg: '<svg/>' });
  });

  test('draws the same figure once however often the preview asks', async () => {
    const render = vi.fn(drawn('<svg/>'));
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('abc', '\\draw', lineMap);
    queue.enqueue('abc', '\\draw', lineMap);
    await settle();
    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    expect(render).toHaveBeenCalledTimes(1);
  });

  test('draws one figure at a time, which the engine requires', async () => {
    let running = 0;
    let overlapped = false;
    const render: TexRenderer = async () => {
      running += 1;
      overlapped ||= running > 1;
      await Promise.resolve();
      running -= 1;
      return { ok: true, svg: '<svg/>' };
    };
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('a', '\\draw a', lineMap);
    queue.enqueue('b', '\\draw b', lineMap);
    await settle();

    expect(overlapped).toBe(false);
    expect(queue.lookup('b')).toEqual({ svg: '<svg/>' });
  });

  test('tells the preview to refresh once the drawing is ready', async () => {
    const onDrawn = vi.fn();
    const queue = createRenderQueue({ render: drawn('<svg/>'), onDrawn });

    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    expect(onDrawn).toHaveBeenCalled();
  });

  test('turns a failed compile into errors on the line the writer wrote', async () => {
    const render: TexRenderer = async () => ({
      ok: false,
      kind: 'tex-log',
      log: '! Undefined control sequence.\nl.10 \\draw',
      preambleLines: 1,
    });
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    expect(queue.lookup('abc')).toEqual({
      errors: [{ message: expect.stringContaining('Undefined control sequence'), line: 3 }],
    });
  });

  test('passes on a host that cannot draw at all without blaming TeX', async () => {
    const render: TexRenderer = async () => ({
      ok: false,
      kind: 'message',
      message: 'web 版では図を描けません',
    });
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    expect(queue.lookup('abc')).toEqual({ errors: [{ message: 'web 版では図を描けません', line: null }] });
  });

  test('keeps drawing after the refresh callback throws', async () => {
    // 1 度の例外で列が止まると、以降どのフェンスも「描いています」で固まる。
    let first = true;
    const onDrawn = () => {
      if (first) {
        first = false;
        throw new Error('プレビューが閉じている');
      }
    };
    const queue = createRenderQueue({ render: drawn('<svg/>'), onDrawn });

    queue.enqueue('a', '\\a', lineMap);
    await settle();
    queue.enqueue('b', '\\b', lineMap);
    await settle();

    expect(queue.lookup('b')).toEqual({ svg: '<svg/>' });
  });

  test('keeps the fence usable when the engine throws', async () => {
    const render: TexRenderer = async () => {
      throw new Error('WASM が落ちた');
    };
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('abc', '\\draw', lineMap);
    await settle();

    const entry = queue.lookup('abc');
    expect(entry && 'errors' in entry && entry.errors[0]?.message).toContain('WASM が落ちた');
  });

  test('goes on to the next figure after one of them failed', async () => {
    const render: TexRenderer = async (tex) => {
      if (tex === '\\bad') throw new Error('落ちた');
      return { ok: true, svg: '<svg/>' };
    };
    const queue = createRenderQueue({ render, onDrawn: () => {} });

    queue.enqueue('bad', '\\bad', lineMap);
    queue.enqueue('good', '\\good', lineMap);
    await settle();

    expect(queue.lookup('good')).toEqual({ svg: '<svg/>' });
  });

  test('drops the figure it has not looked at for longest once it is full', async () => {
    const queue = createRenderQueue({ render: drawn('<svg/>'), onDrawn: () => {}, limit: 2 });

    queue.enqueue('a', '\\a', lineMap);
    queue.enqueue('b', '\\b', lineMap);
    await settle();
    queue.lookup('a');
    queue.enqueue('c', '\\c', lineMap);
    await settle();

    expect(queue.lookup('a')).toBeDefined();
    expect(queue.lookup('b')).toBeUndefined();
    expect(queue.lookup('c')).toBeDefined();
  });
});
