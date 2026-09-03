import { COLOR_LIST_ID, TYPE_LIST_ID, makeNonce, panelHtml } from 'fence-kit';
import type { FenceEditor, Incoming, Outgoing, Session } from 'fence-kit';
import { createBreadboardEditor } from 'breadboard-fence/editor';
import { createPerfboardEditor } from 'perfboard-fence/editor';
import { createCircuitEditor } from 'circuit-fence/editor';
import { createMapSession } from './host.ts';
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
  readonly kind: Kind;
  readonly frame: HTMLIFrameElement;
  readonly body: () => string;
  readonly setBody: (next: string) => void;
};

export function openMap({ kind, frame, body, setBody }: MapOptions): MapHandle {
  const editor = EDITORS[kind]();

  // 中の頁ができるまでは送れないので、溜めておいて `load` で流す。
  let ready = false;
  const waiting: Outgoing[] = [];
  const post = (message: Outgoing): void => {
    if (!ready) {
      waiting.push(message);
      return;
    }
    frame.contentWindow?.postMessage(message, '*');
  };

  const session: Session = createMapSession({ kind, editor, body, setBody, post });

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
    chrome: {
      palette: editor.palette(),
      typeNames: editor.typeNames(TYPE_LIST_ID),
      colorNames: editor.colorNames(COLOR_LIST_ID),
    },
    // VS Code の undo は届かないので、殻に自前の履歴を持たせる (パネルと同じ)。
    undo: 'own',
    foldsWire: editor.foldsWire,
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
