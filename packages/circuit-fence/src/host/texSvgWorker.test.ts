import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { createWorkerRenderer } from './texSvgWorker.ts';
import type { RenderOutcome } from './renderQueue.ts';

/**
 * TeX を別のスレッドで描く段取り。**本物の Worker は立てない** — 立てると
 * WASM の読み込みで数秒かかり、見たいのは「投げて・受けて・落ちたら逃げる」の
 * 3 つだけ。実物のスレッドが動くことは `texWorker.slow.test.ts` が見る。
 */

/** 張りぼての Worker。受けた問い合わせを覚えて、テストが好きなときに返す。 */
class FakeWorker extends EventEmitter {
  readonly asked: { readonly id: number; readonly tex: string }[] = [];

  unref(): void {}

  postMessage(ask: { id: number; tex: string }): void { this.asked.push(ask); }

  answer(id: number, outcome: RenderOutcome): void { this.emit('message', { id, outcome }); }
}

const svg = (text: string): RenderOutcome => ({ ok: true, svg: text });

const open = (over: { readonly spawn?: () => never } = {}) => {
  const workers: FakeWorker[] = [];
  const fell: string[] = [];
  const render = createWorkerRenderer({
    workerPath: 'tex-worker.cjs',
    fallback: async (tex) => { fell.push(tex); return svg('<svg>同じスレッド</svg>'); },
    spawn: over.spawn ?? (() => {
      const made = new FakeWorker();
      workers.push(made);
      return made as unknown as import('node:worker_threads').Worker;
    }),
  });
  return { render, workers, fell, last: () => workers[workers.length - 1] as FakeWorker };
};

describe('TeX を別のスレッドで描く', () => {
  test('hands the tex to the worker and gives back what it answers', async () => {
    const { render, last } = open();

    const answer = render('\\draw (0,0);');
    last().answer(0, svg('<svg>できた</svg>'));

    expect(await answer).toEqual(svg('<svg>できた</svg>'));
  });

  test('keeps one worker, since starting it loads the WASM every time', async () => {
    const { render, workers, last } = open();

    const first = render('a');
    last().answer(0, svg('<svg>1</svg>'));
    await first;
    const second = render('b');
    last().answer(1, svg('<svg>2</svg>'));
    await second;

    expect(workers).toHaveLength(1);
  });

  test('tells the answers apart when two are in flight', async () => {
    const { render, last } = open();

    const first = render('a');
    const second = render('b');
    // わざと逆の順で返す。
    last().answer(1, svg('<svg>b</svg>'));
    last().answer(0, svg('<svg>a</svg>'));

    expect(await first).toEqual(svg('<svg>a</svg>'));
    expect(await second).toEqual(svg('<svg>b</svg>'));
  });

  test('draws on this thread when the worker cannot be started at all', async () => {
    const { render, fell } = open({ spawn: () => { throw new Error('立てられません'); } });

    expect(await render('a')).toEqual(svg('<svg>同じスレッド</svg>'));
    expect(fell).toEqual(['a']);
  });

  test('answers everyone waiting when the worker dies, rather than leaving them hanging', async () => {
    const { render, last } = open();

    const first = render('a');
    const second = render('b');
    last().emit('error', new Error('落ちました'));

    expect(await first).toMatchObject({ ok: false, kind: 'message' });
    expect(await second).toMatchObject({ ok: false, kind: 'message' });
  });

  test('starts a fresh worker after the old one died', async () => {
    const { render, workers, last } = open();

    const first = render('a');
    last().emit('error', new Error('落ちました'));
    await first;

    const second = render('b');
    last().answer(1, svg('<svg>やり直し</svg>'));

    expect(await second).toEqual(svg('<svg>やり直し</svg>'));
    expect(workers).toHaveLength(2);
  });

  test('answers those waiting when the worker exits on its own', async () => {
    const { render, last } = open();

    const asked = render('a');
    last().emit('exit', 1);

    expect(await asked).toMatchObject({ ok: false, kind: 'message' });
  });
});
