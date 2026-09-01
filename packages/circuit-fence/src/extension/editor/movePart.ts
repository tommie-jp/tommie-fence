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
  /** 確認。**接続が変わるときだけ**呼ぶ。 */
  readonly confirm: (message: string) => Promise<boolean>;
  /** フェンスの中の編集を、Markdown の行へずらして当てる。 */
  readonly apply: (fenceLine: number, edits: readonly Edit[]) => Promise<boolean>;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
};

/** 接続の変化を、確認に出せる 1 文にする。無変化なら null。 */
export function describeDiff(diff: NetDiff): string | null {
  const parts: string[] = [];
  if (diff.lost.length > 0) {
    parts.push(`離れる接続: ${diff.lost.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  if (diff.gained.length > 0) {
    // 同じ番地に 2 部品は**この文法では接続**。禁止ではなく、つながるというお知らせ。
    parts.push(`つながる接続: ${diff.gained.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  return parts.length === 0 ? null : parts.join(' / ');
}

/**
 * カーソルのあるフェンスの部品を 1 つ選び、移動先の番地を打たせて書き換える。
 *
 * **接続が変わるときだけ確認する。** 変わらない移動でいちいち止めると、
 * 番地の振り直しという本来の用途で邪魔になる。
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

  const changed = describeDiff(result.value.diff);
  if (changed !== null && !(await port.confirm(`${partId} を ${written.trim()} へ。${changed}`))) return;

  // 編集はフェンスの中の行番号。Markdown の行へずらすのは port の仕事。
  if (await port.apply(fence.line, result.value.edits)) {
    port.info(`${partId} を ${written.trim()} へ動かしました`);
  }
}
