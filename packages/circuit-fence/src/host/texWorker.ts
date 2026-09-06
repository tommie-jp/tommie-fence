import { parentPort } from 'node:worker_threads';
import { renderTex } from './texSvg.ts';

/**
 * TeX を**別のスレッドで**描く側の入口。`texSvgWorker.ts` が立てる。
 *
 * node-tikzjax は WASM を**呼んだスレッドで回す** (Worker を持っていない)。
 * 拡張ホストは全部の拡張で 1 つのプロセスなので、1 枚描くあいだ
 * 0.4〜3.3 秒すべてが止まる — その間マップからの知らせも、ほかの拡張の
 * タイマーも待たされる (52 の docs/27 の実測。「マウス反応が鈍いときがある」の
 * 正体の 1 つで、circuit の図を直しているときだけ起きる)。
 *
 * **ここでは受けて返すだけ。** 描くのは今までどおり `texSvg.ts` で、
 * 拡張ホストとこのスレッドで同じ絵になる。
 */

type Ask = { readonly id: number; readonly tex: string };

parentPort?.on('message', (ask: Ask) => {
  void renderTex(ask.tex).then(
    (outcome) => { parentPort?.postMessage({ id: ask.id, outcome }); },
    (error: unknown) => {
      // **落ちても黙らない。** 返さないと呼ぶ側が待ち続ける。
      parentPort?.postMessage({
        id: ask.id,
        outcome: { ok: false, kind: 'message', message: error instanceof Error ? error.message : String(error) },
      });
    },
  );
});
