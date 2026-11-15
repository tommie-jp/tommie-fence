import type { FenceEditor } from '../../editor/fenceEditor.ts';
import { withCards } from './scope.ts';
import type { CardTable } from './types.ts';

/** 殻にカードを渡す口 (52 の docs/158 の 3-5)。開いている文書のカードを、操作のたびに訊く。 */
export type CardSource = () => CardTable | null | undefined;

/**
 * 殻の**全部の操作**を `withCards` で包む。殻は拡張ホストの側で図も編集も組むので
 * (webview は HTML を映すだけ)、ここで包めばマップのエディタでもカードの部品が名前つきで出る。
 * 操作は同期の関数なので、表は呼んでいる間だけ有効にして戻せる。
 */
export function editorWithCards<E extends FenceEditor>(editor: E, cards: CardSource | undefined): E {
  if (cards === undefined) return editor;
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(editor)) {
    wrapped[key] = typeof value === 'function'
      ? (...args: unknown[]) => withCards(cards(), () => (value as (...inner: unknown[]) => unknown)(...args))
      : value;
  }
  return wrapped as E;
}
