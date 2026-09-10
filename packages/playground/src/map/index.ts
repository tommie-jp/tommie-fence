import { makeNonce, panelHtml } from 'fence-kit';
import type { FenceEditor, Incoming, Outgoing, Session } from 'fence-kit';
import { createBreadboardEditor } from 'breadboard-fence/editor';
import { createPerfboardEditor } from 'perfboard-fence/editor';
import { createCircuitEditor } from 'circuit-fence/editor';
import { createMapSession } from './host.ts';
import { KINDS } from '../kinds.ts';
import type { Kind } from '../kinds.ts';

/**
 * 図を掴んで動かすマップを頁に開く。**iframe を webview の代わりにする** —
 * 拡張では VS Code が webview を用意し、拡張ホストと postMessage で話す。
 * その形をそのまま写すと、殻も中身も 1 行も変えずに動く。
 */

const EDITORS: Readonly<Record<Kind, () => FenceEditor>> = {
  breadboard: createBreadboardEditor,
  perfboard: createPerfboardEditor,
  circuit: createCircuitEditor,
};

export type MapHandle = {
  /** 本文が外で変わったときに、マップを組み直す。 */
  readonly refresh: () => void;
  /** 片付ける (聞き耳を外す)。 */
  readonly close: () => void;
};

export type MapOptions = {
  readonly frame: HTMLIFrameElement;
  /** いまの文書の全文 (Markdown)。 */
  readonly text: () => string;
  /** 書き換わった全文を頁へ返す。 */
  readonly setText: (next: string) => void;
  /** いま見せているフェンスの本文の 1 行目 (0 始まり)。 */
  readonly fenceLine: () => number;
  /** 殻が掴むフェンスを変えたとき (中の一覧で選び直した)。 */
  readonly onBind: (line: number) => void;
  /**
   * 殻が中の帯へ出す一言。**頁のログにも落とす**ため (52 の docs/45)。
   * 「R1 を a7 へ動かしました」など、何が起きたかの記録になる。
   */
  readonly onStatus: (text: string) => void;
};

export function openMap({ frame, text, setText, fenceLine, onBind, onStatus }: MapOptions): MapHandle {
  // **3 つの言語ぜんぶを渡す。** 文書に何が書いてあるかは開くまで分からず、
  // 1 つの `.md` に 2 つの言語が混ざっていることもある (52 の docs/43)。
  const editors = KINDS.map((kind) => EDITORS[kind]());

  // 中の頁ができるまでは送れないので、溜めておいて `load` で流す。
  let ready = false;
  const waiting: Outgoing[] = [];
  const post = (message: Outgoing): void => {
    // **通り道で覗く。** 中の帯へ出る一言は、頁のログにも残す。
    if (message.kind === 'status' && typeof message.text === 'string') onStatus(message.text);
    if (!ready) {
      waiting.push(message);
      return;
    }
    frame.contentWindow?.postMessage(message, '*');
  };

  const session: Session = createMapSession({ editors, text, setText, fenceLine, onBind, post });

  const onLoad = (): void => {
    ready = true;
    for (const message of waiting.splice(0)) frame.contentWindow?.postMessage(message, '*');
  };

  // **中から来たものだけ聞く。** 頁には他にも postMessage の相手が居うる。
  const onMessage = (event: MessageEvent<Incoming>): void => {
    if (event.source !== frame.contentWindow) return;
    void session.handle(event.data);
  };

  frame.addEventListener('load', onLoad);
  window.addEventListener('message', onMessage);

  frame.srcdoc = panelHtml({
    // 中は about:srcdoc なので、`'self'` はこの頁の出所を指す。
    cspSource: "'self'",
    nonce: makeNonce(),
    scriptUri: 'map.js',
    view: session.view(),
    // VS Code の undo は届かないので、殻に自前の履歴を持たせる (パネルと同じ)。
    undo: 'own',
  });

  return {
    refresh: () => session.refresh(),
    close: () => {
      frame.removeEventListener('load', onLoad);
      window.removeEventListener('message', onMessage);
      session.dispose();
      frame.srcdoc = '';
    },
  };
}
