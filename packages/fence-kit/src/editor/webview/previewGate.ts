import type { Message } from './mapState.ts';

/**
 * 拡張への送り口の門。**試し当て (`preview`) は 1 つずつ送る。**
 *
 * 持ち物があるあいだ、カーソルが動くたびに「この穴に置けるか」を拡張へ訊く。
 * 訊くたびに送ると、**マウスの速さで往復が決まる** — circuit は升を 1/10 に
 * 刻む (52 の docs/23) ので、升の中で 1 段動くだけで 1 往復になり、
 * 図の上を掃くと秒 60 往復になった (52 の docs/27 の実測)。
 *
 * 往復はただの ms ではない。**VS Code の UI スレッドと、Remote 越しなら
 * その中継も通る**ので、詰まると窓全体が引っかかる。
 *
 * だから**答えが返るまで次を送らず、最新の 1 つだけ覚えておく**。
 * 往復の数が「マウスの速さ」ではなく「答えの速さ」で決まるようになり、
 * 往復が遅い所ほど効く。**速い所では今までと同じ** — 次のカーソルの動きより
 * 先に答えが返れば、待たせるものが無い。
 *
 * 覚えるのは**最新の 1 つだけ**でよい。途中の穴の答えは、通り過ぎた時点で
 * もう要らない (古い札の答えを捨てる仕組みは `mapState.ts` の `onGhost` に
 * もともとある)。
 */

/** 答えが来ないときに諦めて次を送るまで。**通らなかった知らせで固まらせない**ための保険。 */
export const PATIENCE_MS = 300;

export type PreviewGate = {
  /** 拡張へ 1 つ送る。試し当ては門を通り、ほかはそのまま抜ける。 */
  readonly post: (message: Message) => void;
  /**
   * 試し当ての答えが来た。待たせていたものがあれば送る。
   * **札が合っていなくても解錠する** — 合わない答えは捨てるが、
   * 「1 つ返ってきた」ことに変わりはない。
   */
  readonly answered: (key: unknown) => void;
};

/** 試し当ての知らせか。**ほかの知らせは待たせない** (掴んだ・置いた・消したは即座に伝える)。 */
const isPreview = (message: Message): boolean => message.kind === 'preview';

export function createPreviewGate(send: (message: Message) => void): PreviewGate {
  /** 答えを待っている札。待っていなければ null。 */
  let asked: unknown = null;
  let waiting = false;
  let patience: ReturnType<typeof setTimeout> | null = null;
  /** 待っているあいだに起きた、最新の試し当て。 */
  let held: Message | null = null;

  const ask = (message: Message): void => {
    waiting = true;
    asked = message['key'];
    if (patience !== null) clearTimeout(patience);
    patience = setTimeout(release, PATIENCE_MS);
    send(message);
  };

  function release(): void {
    if (patience !== null) clearTimeout(patience);
    patience = null;
    waiting = false;
    asked = null;
    const next = held;
    held = null;
    if (next !== null) ask(next);
  }

  return {
    post: (message) => {
      if (!isPreview(message)) {
        // **確定の知らせが出たら、待たせていた試し当ては捨てる。**
        // 本文がこれから変わるので、その答えはもう古い。
        held = null;
        send(message);
        return;
      }
      if (waiting) {
        held = message;
        return;
      }
      ask(message);
    },

    answered: (key) => {
      if (!waiting) return;
      // 待たせていたものが、いま返ってきた答えと同じ場所を訊いていたら、
      // もう一度訊かない (カーソルが元の穴へ戻ったとき)。
      if (held !== null && held['key'] === key && key === asked) held = null;
      release();
    },
  };
}
