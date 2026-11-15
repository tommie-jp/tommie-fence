import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRenderQueue } from './renderQueue.ts';
import { createDiskStore, texCacheKey } from './texCache.ts';

/** 描いた回路図をディスクに控える (52 の docs/163 の段 1・2)。 */

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tex-cache-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

describe('createDiskStore', () => {
  test('keeps a figure across two stores on the same folder', () => {
    createDiskStore(dir, 'k1').put('abc12345', SVG);
    expect(createDiskStore(dir, 'k1').get('abc12345')).toBe(SVG);
  });

  test('does not hand a figure of another version, and removes its folder', () => {
    createDiskStore(dir, 'k1').put('abc12345', SVG);
    expect(createDiskStore(dir, 'k2').get('abc12345')).toBeUndefined();
    expect(existsSync(join(dir, 'k1'))).toBe(false);
  });

  test('refuses a key that is not a hash, so nothing is written outside the folder', () => {
    const store = createDiskStore(dir, 'k1');
    store.put('../../evil', SVG);
    expect(store.get('../../evil')).toBeUndefined();
    expect(readdirSync(dir)).toEqual(['k1']);
    expect(readdirSync(join(dir, 'k1'))).toEqual([]);
  });

  test('does not hand a file that was cut short', () => {
    mkdirSync(join(dir, 'k1'), { recursive: true });
    writeFileSync(join(dir, 'k1', 'abc12345.svg'), '<svg><path');
    expect(createDiskStore(dir, 'k1').get('abc12345')).toBeUndefined();
  });

  test('drops the oldest figures beyond the limit when it opens', () => {
    const first = createDiskStore(dir, 'k1', 2);
    for (const [index, hash] of ['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3'].entries()) {
      first.put(hash, SVG);
      utimesSync(join(dir, 'k1', `${hash}.svg`), 1000 + index, 1000 + index);
    }
    const second = createDiskStore(dir, 'k1', 2);
    expect(second.get('aaaaaaa1')).toBeUndefined();
    expect(second.get('aaaaaaa3')).toBe(SVG);
  });

  test('works as a store that keeps nothing when the folder cannot be made', () => {
    writeFileSync(join(dir, 'file'), '');
    const store = createDiskStore(join(dir, 'file'), 'k1');
    store.put('abc12345', SVG);
    expect(store.get('abc12345')).toBeUndefined();
  });

  test('makes a key that is safe as a folder name', () => {
    expect(texCacheKey('0.53.0')).toBe('v1-0.53.0');
    expect(texCacheKey('../x')).not.toContain('/');
  });
});

describe('createRenderQueue と置き場', () => {
  test('takes a figure from the store without drawing, and stores what it draws', async () => {
    const store = createDiskStore(dir, 'k1');
    store.put('kept0001', SVG);
    let drawn = 0;
    let done: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => { done = resolve; });
    const queue = createRenderQueue({
      render: async () => { drawn += 1; return { ok: true, svg: '<svg>new</svg>' }; },
      onDrawn: () => done(),
      store,
    });
    expect(queue.lookup('kept0001')).toEqual({ svg: SVG });
    queue.enqueue('kept0001', 'tex', new Map());
    expect(drawn).toBe(0);

    expect(queue.lookup('fresh001')).toBeUndefined();
    queue.enqueue('fresh001', 'tex', new Map());
    await finished;
    expect(drawn).toBe(1);
    expect(createDiskStore(dir, 'k1').get('fresh001')).toBe('<svg>new</svg>');
  });

  test('does not store a figure that failed', async () => {
    const store = createDiskStore(dir, 'k1');
    let done: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => { done = resolve; });
    const queue = createRenderQueue({ render: async () => ({ ok: false, kind: 'message', message: 'x' }), onDrawn: () => done(), store });
    queue.enqueue('bad00001', 'tex', new Map());
    await finished;
    expect(store.get('bad00001')).toBeUndefined();
  });
});
