/**
 * マップでの編集の履歴。**vscode を知らない**ので、そのままテストに掛かる
 * (当てるのは host の仕事)。
 *
 * VS Code の `Ctrl+Z` は**エディタにフォーカスが要る**。マップのパネルで
 * 掴んで動かしている間はフォーカスがパネル側にあり、戻すのに一度エディタを
 * 触らないといけなかった。パネルからも戻せるように、書き換えの前後を
 * 覚えておいて戻す。タブそのものがマップのときは VS Code の undo が届くので、
 * この履歴は持たない (`nativeUndo`)。
 *
 * 覚えるのは**マップでの編集だけ**。コマンド (QuickPick) から動かすときは
 * エディタにフォーカスがあるので、そちらは VS Code の `Ctrl+Z` が効く。
 *
 * **控えるのはフェンスの本文そのもの** (桁では覚えない)。桁で覚えると、
 * 部品や配線を足す・消すで行がずれた瞬間に照合が立たなくなり、覚えている
 * 桁が別の行を指す。本文は文書から読んだ生の行なので、字下げも行末の空白も
 * そのまま戻る。
 */

/** 1 回の編集。本文はフェンスの中の生の行 (文書から読んだまま)。 */
export type Step = {
  readonly label: string;
  /** 編集の前にそこにあった本文。戻すときに書き戻す。 */
  readonly before: readonly string[];
  /** 編集の後にそこにあるはずの本文。**当てる前に照合する。** */
  readonly after: readonly string[];
};

/** 本文が控えと同じか。**当てる前に必ず通す** (合わなければ手で書き換えられている)。 */
export const sameBody = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

export type History = {
  readonly push: (step: Step) => void;
  /** 次に戻す 1 歩。**まだ動かさない** — 当ててから `commitUndo` を呼ぶ。 */
  readonly takeUndo: () => Step | null;
  readonly commitUndo: () => void;
  readonly takeRedo: () => Step | null;
  readonly commitRedo: () => void;
  /** 当てられなかった 1 歩を捨てる (文書が変わっていた)。 */
  readonly dropUndo: () => void;
  readonly dropRedo: () => void;
  readonly state: () => { readonly canUndo: boolean; readonly canRedo: boolean };
  readonly clear: () => void;
};

/** 覚えておく歩数。長く開いたままでも際限なく増えないように。 */
const LIMIT = 50;

export function createHistory(limit: number = LIMIT): History {
  let done: readonly Step[] = [];
  let undone: readonly Step[] = [];

  return {
    push: (step) => {
      done = [...done, step].slice(-limit);
      // 分かれた先に戻る道は無い (普通のエディタと同じ)。
      undone = [];
    },
    takeUndo: () => done.at(-1) ?? null,
    commitUndo: () => {
      const step = done.at(-1);
      if (step === undefined) return;
      done = done.slice(0, -1);
      undone = [...undone, step].slice(-limit);
    },
    takeRedo: () => undone.at(-1) ?? null,
    commitRedo: () => {
      const step = undone.at(-1);
      if (step === undefined) return;
      undone = undone.slice(0, -1);
      done = [...done, step].slice(-limit);
    },
    dropUndo: () => { done = done.slice(0, -1); },
    dropRedo: () => { undone = undone.slice(0, -1); },
    state: () => ({ canUndo: done.length > 0, canRedo: undone.length > 0 }),
    clear: () => { done = []; undone = []; },
  };
}
