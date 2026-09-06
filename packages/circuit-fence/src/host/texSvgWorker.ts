import { Worker } from 'node:worker_threads';
import type { RenderOutcome, TexRenderer } from './renderQueue.ts';

/**
 * TeX を**別のスレッドで**描く。`renderQueue` の `TexRenderer` に差せる形で返す
 * (Phase 3 で口を開けてあったところ)。
 *
 * なぜ要るか: node-tikzjax は WASM を呼んだスレッドで回すので、拡張ホストで
 * 直に呼ぶと **1 枚に 0.4〜3.3 秒、そのあいだプロセスごと止まる**
 * (52 の docs/27 の実測)。拡張ホストは全部の拡張で 1 つなので、マップの
 * 知らせもほかの拡張のタイマーも待たされる。
 *
 * **1 本だけ立てて使い回す。** 立ち上げに WASM の読み込みが要るので、
 * 1 枚ごとに立てると描くより待つほうが長くなる。順番待ちは呼ぶ側
 * (`renderQueue`) が持っているので、ここは 1 つずつ受ければ足りる。
 *
 * **立てられなければ今までどおり同じスレッドで描く。** 図が出ないより、
 * 遅くても出るほうがよい (web 版や、Worker を使えない置き方のため)。
 */

type Reply = { readonly id: number; readonly outcome: RenderOutcome };

export type WorkerOptions = {
  /** Worker の入口 (`dist/tex-worker.cjs`)。 */
  readonly workerPath: string;
  /** 立てられなかったときの逃げ道。**同じスレッドで描く実物**を渡す。 */
  readonly fallback: TexRenderer;
  /** Worker を立てる人。テストが偽物を差せるように外に出す。 */
  readonly spawn?: (path: string) => Worker;
};

export function createWorkerRenderer({ workerPath, fallback, spawn }: WorkerOptions): TexRenderer {
  const start = spawn ?? ((path: string) => new Worker(path));
  let worker: Worker | null = null;
  /** 答えを待っている問い合わせ。**Worker が落ちたら全部に返す** (待たせない)。 */
  const waiting = new Map<number, (outcome: RenderOutcome) => void>();
  let nextId = 0;

  /** 待っている全員に同じ答えを返して、Worker を捨てる。 */
  const giveUp = (message: string): void => {
    worker = null;
    const pending = [...waiting.values()];
    waiting.clear();
    for (const settle of pending) settle({ ok: false, kind: 'message', message });
  };

  function running(): Worker | null {
    if (worker !== null) return worker;
    try {
      const started = start(workerPath);
      started.on('message', (reply: Reply) => {
        const settle = waiting.get(reply.id);
        waiting.delete(reply.id);
        settle?.(reply.outcome);
      });
      // **黙って止まらせない。** 落ちた Worker を抱えたままだと、次からの図が
      // ぜんぶ返ってこなくなる。捨てて、次は立て直す (ついでに同じスレッドへ落ちる)。
      started.on('error', (error: Error) => { giveUp(`TeX のスレッドが落ちました: ${error.message}`); });
      started.on('exit', (code: number) => {
        if (waiting.size > 0) giveUp(`TeX のスレッドが終わりました (${code})`);
        worker = null;
      });
      started.unref();
      worker = started;
      return started;
    } catch {
      return null;
    }
  }

  return async (tex: string): Promise<RenderOutcome> => {
    const running_ = running();
    if (running_ === null) return fallback(tex);

    const id = nextId;
    nextId += 1;
    return new Promise<RenderOutcome>((settle) => {
      waiting.set(id, settle);
      running_.postMessage({ id, tex });
    });
  };
}
