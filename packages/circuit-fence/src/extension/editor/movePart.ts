import { anchorOf, movePart, movablePartIds } from '../../core/edit/move.ts';
import type { Edit, NetDiff } from '../../core/edit/move.ts';
import { fenceAt } from '../../core/edit/map.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';

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
};

/** 接続の変化を、動かしたあとのお知らせに添える 1 文にする。無変化なら null。 */
export function describeDiff(diff: NetDiff): string | null {
  const parts: string[] = [];
  if (diff.lost.length > 0) {
    parts.push(`離れた接続: ${diff.lost.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  if (diff.gained.length > 0) {
    // 同じ番地に 2 部品は**この文法では接続**。禁止ではなく、つながったというお知らせ。
    parts.push(`つながった接続: ${diff.gained.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  return parts.length === 0 ? null : parts.join(' / ');
}

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
    port.warn('Markdown のエディタで、circuit フェンスの中にカーソルを置いてから実行します');
    return;
  }

  const fence = fenceAt(view.text, view.line);
  if (!fence) {
    port.warn('カーソルの位置に circuit フェンスがありません');
    return;
  }

  const ids = movablePartIds(fence.source);
  if (ids.length === 0) {
    port.warn('このフェンスに動かせる部品がありません (フェンスを読めないときも出ません)');
    return;
  }

  const partId = await port.pick(ids, '動かす部品');
  if (partId === null) return;

  const anchor = anchorOf(fence.source, partId);
  const written = await port.prompt('移動先の番地 (例: b3)', anchor === null ? '' : formatAddress(anchor));
  if (written === null) return;

  const to = parseAddress(written.trim());
  if (to === null) {
    port.warn(`番地として読めません: ${written}`);
    return;
  }

  const result = movePart(fence.source, partId, to);
  if (!result.ok) {
    port.warn(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    port.info(`${partId} はすでに ${written.trim()} にあります`);
    return;
  }

  // 編集はフェンスの中の行番号。Markdown の行へずらすのは port の仕事。
  if (await port.apply(fence.line, result.value.edits)) {
    const changed = describeDiff(result.value.diff);
    port.info(`${partId} を ${written.trim()} へ動かしました${changed === null ? '' : `。${changed}`}`);
  }
}
