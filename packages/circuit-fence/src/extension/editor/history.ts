/**
 * マップでの移動の履歴。**vscode を知らない**ので、そのままテストに掛かる
 * (当てるのは `vscodePort` の仕事)。
 *
 * VS Code の `Ctrl+Z` は**エディタにフォーカスが要る**。マップのパネルで
 * 掴んで動かしている間はフォーカスがパネル側にあり、戻すのに一度エディタを
 * 触らないといけなかった。パネルからも戻せるように、当てた書き換えを
 * 覚えておいて逆を当てる。
 *
 * 覚えるのは**マップでの移動だけ**。コマンド (QuickPick) から動かすときは
 * エディタにフォーカスがあるので、そちらは VS Code の `Ctrl+Z` が効く。
 */

/** 書き換えの片側。**桁は側ごとに持つ** (下の `Change` の注記)。 */
export type Side = { readonly column: number; readonly text: string };

/**
 * 文書に当てた 1 か所の書き換え。行も桁も 0 始まり (vscode に合わせる)。
 *
 * **両側がそれぞれ自分の桁を持つ。** 同じ行で先の綴りの長さが変わると、
 * 後ろの綴りは別の桁へ動く (`a9 b9` → `a10 b10` で `b10` は 1 桁右)。
 * 片方の桁だけで覚えると、戻すときに照合が落ちて「手で書き換えられた」と
 * 誤って断ってしまう。
 */
export type Change = {
  readonly line: number;
  /** いまそこにあるはずの字と、その桁。**当てる前に照合する。** */
  readonly from: Side;
  readonly to: Side;
};

/** 1 回の移動。 */
export type Step = { readonly label: string; readonly changes: readonly Change[] };

/** 逆向きの書き換え。戻すのも「やり直す」のも、これを当てるだけ。 */
export const invert = (step: Step): Step => ({
  label: step.label,
  changes: step.changes.map((change) => ({ line: change.line, from: change.to, to: change.from })),
});

/** 当てる前の 1 か所。桁は文書のもの (0 始まり)。 */
export type Replacement = {
  readonly line: number;
  readonly column: number;
  readonly before: string;
  readonly after: string;
};

/**
 * 当てる前の書き換えを、両側の桁つきの `Change` にする。
 *
 * **同じ行で先の綴りの長さが変わると、後ろの綴りは別の桁へ動く**
 * (`a9 b9` → `a10 b10` で `b10` は 1 桁右)。当てたあとの桁を控えないと、
 * 戻すときの照合が落ちて「手で書き換えられた」と誤って断ってしまう。
 */
export function changesOf(replacements: readonly Replacement[]): readonly Change[] {
  const shifts = new Map<number, number>();
  return [...replacements]
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map((one) => {
      const shift = shifts.get(one.line) ?? 0;
      shifts.set(one.line, shift + (one.after.length - one.before.length));
      return {
        line: one.line,
        from: { column: one.column, text: one.before },
        to: { column: one.column + shift, text: one.after },
      };
    });
}

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
