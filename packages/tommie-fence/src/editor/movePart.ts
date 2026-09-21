import { anchorOf, movePart, movablePartIds } from 'circuit-fence/src/core/edit/move.ts';
import type { Edit } from 'circuit-fence/src/core/edit/move.ts';
import { describeDiff } from 'fence-kit';
import { fenceAt } from 'circuit-fence/src/core/edit/map.ts';
import { formatAddress, parseAddress } from 'circuit-fence/src/core/model/address.ts';

/**
 * 「部品を動かす」の段取り。**vscode を知らない** — 外の世界に触るものは
 * すべて `EditorPort` から渡してもらうので、そのままユニットテストに掛かる
 * (拡張の組み立てが `activateWith` で外を注入しているのと同じ流儀)。
 */

export type DocumentView = {
  /** Markdown 全体。 */
  readonly text: string;
  /** カーソルのある行 (1 始まり)。 */
  readonly line: number;
};

export type EditorPort = {
  readonly document: () => DocumentView | null;
  /** 一覧から 1 つ選ばせる。閉じられたら null。 */
  readonly pick: (items: readonly string[], placeholder: string) => Promise<string | null>;
  /** 文字を打たせる。閉じられたら null。 */
  readonly prompt: (placeholder: string, value: string) => Promise<string | null>;
  /** フェンスの中の編集を、Markdown の行へずらして当てる。 */
  readonly apply: (fenceLine: number, edits: readonly Edit[]) => Promise<boolean>;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  /**
   * 文を訳す (`vscode.l10n.t`)。**元の文は英語**で、日本語は
   * `l10n/bundle.l10n.ja.json`。`{0}` は後ろの引数で埋まる。
   */
  readonly t: (message: string, ...args: readonly (string | number)[]) => string;
};

/**
 * カーソルのあるフェンスの部品を 1 つ選び、移動先の番地を打たせて書き換える。
 *
 * **確認では止めない** (2026-09-02 の決め。毎回モーダルが出て、動かすという
 * 本来の用途で邪魔になった)。接続の変化は動かしたあとのお知らせに添える —
 * 黙らせはしない。戻したければ Ctrl+Z (書き換えは普通の編集として当たる)。
 */
export async function runMovePart(port: EditorPort): Promise<void> {
  const view = port.document();
  if (!view) {
    port.warn(port.t('Put the cursor inside a circuit fence in a Markdown editor, then run this again'));
    return;
  }

  const fence = fenceAt(view.text, view.line);
  if (!fence) {
    port.warn(port.t('There is no circuit fence at the cursor'));
    return;
  }

  const ids = movablePartIds(fence.source);
  if (ids.length === 0) {
    port.warn(port.t('This fence has no part to move'));
    return;
  }

  const partId = await port.pick(ids, port.t('Part to move'));
  if (partId === null) return;

  const anchor = anchorOf(fence.source, partId);
  const written = await port.prompt(port.t('Address to move to (e.g. b3)'), anchor === null ? '' : formatAddress(anchor));
  if (written === null) return;

  const to = parseAddress(written.trim());
  if (to === null) {
    port.warn(port.t('Not an address: {0}', written));
    return;
  }

  const result = movePart(fence.source, partId, to);
  if (!result.ok) {
    port.warn(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    port.info(port.t('{0} is already at {1}', partId, written.trim()));
    return;
  }

  // 編集はフェンスの中の行番号。Markdown の行へずらすのは port の仕事。
  // **当たらなかったときは黙らない。** 選んで番地まで打った人が、成功も失敗も
  // 分からずに終わる (`session.ts` の `run` と同じ扱いにする)。
  if (!await port.apply(fence.line, result.value.edits)) {
    port.warn(port.t('Could not rewrite the fence (the document may have changed in the meantime)'));
    return;
  }
  const changed = describeDiff(result.value.diff);
  port.info(changed === null
    ? port.t('Moved {0} to {1}', partId, written.trim())
    : port.t('Moved {0} to {1}. {2}', partId, written.trim(), changed));
}
