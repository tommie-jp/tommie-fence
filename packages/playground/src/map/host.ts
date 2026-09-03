import { changesForFence, createSession } from 'fence-kit';
import type { DocLike, FenceEditor, Outgoing, Session } from 'fence-kit';
import { DOC_URI, applyChanges, bodyOf, docOver, linesOf, replaceLines } from './doc.ts';
import type { Kind } from '../kinds.ts';

/**
 * マップの殻 (fence-kit の `session.ts`) に、頁を VS Code の代わりとして渡す。
 * **殻も文法も 1 行も変えない** — 拡張と同じ経路で書き換わる。
 *
 * 拡張の `vscodeHost.ts` に当たるもの。あちらが持っている「どのエディタが
 * 前に出ているか」「どの文書が開いているか」は、こちらには 1 つしかない。
 */

export type MapPort = {
  readonly kind: Kind;
  readonly editor: FenceEditor;
  /** いまのフェンスの本文。 */
  readonly body: () => string;
  /** 書き換わった本文を頁へ返す。 */
  readonly setBody: (next: string) => void;
  /** webview (iframe) へ送る。 */
  readonly post: (message: Outgoing) => void;
};

export function createMapSession(port: MapPort): Session {
  const document = docOver(port.kind, port.body);
  // 文書は 1 つで、いつでも「前に出ている」。カーソルは本文の頭に置く
  // (フェンスの中に居れば、殻はそのフェンスに結び付く)。
  const editor = { document, selection: { active: { line: 1, character: 0 } } };

  const write = (lines: readonly string[] | null): boolean => {
    if (lines === null) return false;
    port.setBody(bodyOf(lines));
    return true;
  };

  return createSession<DocLike>(
    {
      post: port.post,
      activeEditor: () => editor,
      openDocument: (uri) => (uri === DOC_URI ? document : null),
      // **当てる前の照合は `applyChanges` の中**。控えと合わなければ false を
      // 返し、殻が「当てられませんでした」と言う (拡張と同じ約束)。
      applyEdits: (target, fenceLine, edits) =>
        Promise.resolve(
          write(applyChanges(linesOf(port.kind, port.body()), changesForFence(target, fenceLine, edits))),
        ),
      replaceBody: (_target, fenceLine, count, body) =>
        Promise.resolve(write(replaceLines(linesOf(port.kind, port.body()), fenceLine, count, body))),
      // **光らせる先が無い。** 拡張はエディタの行に色を付けるが、頁にあるのは
      // テキスト欄 1 つで、掴んでいる最中に選択を動かすと打鍵の邪魔になる。
      highlight: () => {},
    },
    port.editor,
    // 文書は 1 つに固定する (カスタムエディタと同じ形)。
    { pinned: document },
  );
}
