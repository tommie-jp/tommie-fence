import { movableNodes, movePoint } from '../../core/edit/point.ts';
import type { NodeRef } from '../../core/edit/point.ts';
import { fenceAt } from '../../core/edit/map.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';
import { describeDiff } from './movePart.ts';
import type { EditorPort } from './movePart.ts';

/**
 * 「節点を動かす」の段取り。**掴む物が部品とは違う** — その交点に来ている
 * ものを丸ごと運ぶので、接続は保たれる (部品を動かすほうは 1 つだけ運んで
 * 接続の変化を確かめさせる)。
 *
 * `movePart.ts` と同じ `EditorPort` を使う。**外の世界に触るものは全部
 * 渡してもらう**ので、そのままユニットテストに掛かる。
 */

/** 一覧に出す 1 行。名前が付いていれば見せる (直すのがその 1 行だけになるため)。 */
export const labelOf = (node: NodeRef): string => {
  const address = formatAddress(node.address);
  const name = node.name === null ? '' : ` (${node.name})`;
  return `${address}${name} — ${node.uses} か所`;
};

export async function runMovePoint(port: EditorPort): Promise<void> {
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

  const nodes = movableNodes(fence.source);
  if (nodes.length === 0) {
    port.warn('このフェンスに動かせる節点がありません (フェンスを読めないときも出ません)');
    return;
  }

  const labels = nodes.map(labelOf);
  const picked = await port.pick(labels, '動かす節点');
  if (picked === null) return;

  const node = nodes[labels.indexOf(picked)];
  if (!node) {
    port.warn(`選ばれた節点が分かりません: ${picked}`);
    return;
  }

  const here = formatAddress(node.address);
  const written = await port.prompt('移動先の番地 (例: b3)', here);
  if (written === null) return;

  const to = parseAddress(written.trim());
  if (to === null) {
    port.warn(`番地として読めません: ${written}`);
    return;
  }

  const result = movePoint(fence.source, node.address, to);
  if (!result.ok) {
    port.warn(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    port.info(`節点はすでに ${here} にあります`);
    return;
  }

  // **確認では止めない** (2026-09-02 の決め)。節点ごと動かせば接続は保たれ、
  // 寄せた先で何かとつながったときだけ、動かしたあとのお知らせに添える。
  // **当たらなかったときは黙らない** (`movePart` と同じ扱い)。
  if (!await port.apply(fence.line, result.value.edits)) {
    port.warn('書き換えられませんでした (そのあと文書が書き換わったかもしれません)');
    return;
  }
  // 名前があっても、生の綴りで書いた場所が混ざっていれば 1 行では済まない。
  const how = node.name !== null && result.value.edits.length === 1
    ? `${node.name} の 1 行を書き換えました`
    : `${result.value.edits.length} か所を書き換えました`;
  const changed = describeDiff(result.value.diff);
  port.info(`${here} の節点を ${written.trim()} へ動かしました (${how})${changed === null ? '' : `。${changed}`}`);
}
