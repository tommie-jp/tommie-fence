import { changesForFence, createSession, fenceToAppend } from 'fence-kit';
import type { DocLike, FenceEditor, Outgoing, Session } from 'fence-kit';
import { DOC_URI, applyChanges, docOver, replaceLines } from './doc.ts';

/**
 * マップの殻 (fence-kit の `session.ts`) に、頁を VS Code の代わりとして渡す。
 * **殻も文法も 1 行も変えない** — 拡張と同じ経路で書き換わる。
 *
 * 拡張の `vscodeHost.ts` に当たるもの。あちらが持っている「どのエディタが
 * 前に出ているか」「どの文書が開いているか」は、こちらには 1 つしかない。
 * 違うのは**カーソルの居場所**だけ — 頁にカーソルは無いので、
 * 「いま見せているフェンス」の本文の 1 行目を渡す (52 の docs/43)。
 */

export type MapPort = {
  /** 3 つの言語ぜんぶ。**文書に何が書いてあるか分からない**ので、全部渡す。 */
  readonly editors: readonly FenceEditor[];
  /** いまの文書の全文。 */
  readonly text: () => string;
  /** 書き換わった全文を頁へ返す。 */
  readonly setText: (next: string) => void;
  /** いま見せているフェンスの本文の 1 行目 (0 始まり)。 */
  readonly fenceLine: () => number;
  /** 殻が掴むフェンスを変えたとき (一覧で選び直した)。頁の側を揃える。 */
  readonly onBind: (line: number) => void;
  /** webview (iframe) へ送る。 */
  readonly post: (message: Outgoing) => void;
};

export function createMapSession(port: MapPort): Session {
  const document = docOver(port.text);

  /**
   * 文書は 1 つで、いつでも「前に出ている」。**カーソルは頁が選んでいる
   * フェンスの中**に置く — 殻はカーソルのあるフェンスに結び付くので、
   * これが頁と殻の「いまのフェンス」を揃える線になる。
   */
  const activeEditor = (): { document: DocLike; selection: { active: { line: number; character: number } } } => ({
    document,
    selection: { active: { line: port.fenceLine(), character: 0 } },
  });

  const lines = (): string[] => port.text().split('\n');

  const write = (next: readonly string[] | null): boolean => {
    if (next === null) return false;
    port.setText(next.join('\n'));
    return true;
  };

  return createSession<DocLike>(
    {
      post: port.post,
      activeEditor,
      openDocument: (uri) => (uri === DOC_URI ? document : null),
      // **当てる前の照合は `applyChanges` の中**。控えと合わなければ false を
      // 返し、殻が「当てられませんでした」と言う (拡張と同じ約束)。
      applyEdits: (target, fenceLine, edits) =>
        Promise.resolve(write(applyChanges(lines(), changesForFence(target, fenceLine, edits)))),
      replaceBody: (_target, fenceLine, count, body) =>
        Promise.resolve(write(replaceLines(lines(), fenceLine, count, body))),
      /**
       * **フェンスが 1 本も無い文書に 1 本作る** (52 の docs/54 の決め 7)。
       * 頁にカーソルは無いので置き場は文書の終わり。**全文で書き戻す**ので、
       * 頁が持っている「前の字」の控えとも噛み合う (`setText` を通す)。
       */
      createFence: (_target, language) => {
        const text = port.text();
        const made = fenceToAppend(text, language);
        port.setText(`${text}${made.added}`);
        return Promise.resolve(made.line);
      },
      // **光らせる先が無い。** 拡張はエディタの行に色を付けるが、頁にあるのは
      // テキスト欄 1 つで、掴んでいる最中に選択を動かすと打鍵の邪魔になる。
      highlight: () => {},
      onBind: (_uri, line) => port.onBind(line),
    },
    port.editors,
    // 文書は 1 つに固定する (カスタムエディタと同じ形)。
    { pinned: document },
  );
}
