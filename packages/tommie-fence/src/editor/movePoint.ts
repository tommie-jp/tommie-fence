import { describeDiff } from 'fence-kit';
import { movableNodes, movePoint } from 'circuit-fence/src/core/edit/point.ts';
import type { NodeRef } from 'circuit-fence/src/core/edit/point.ts';
import { fenceAt } from 'circuit-fence/src/core/edit/map.ts';
import { formatAddress, parseAddress } from 'circuit-fence/src/core/model/address.ts';
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
export const labelOf = (node: NodeRef, t: EditorPort['t']): string => {
  const address = formatAddress(node.address);
  const name = node.name === null ? '' : ` (${node.name})`;
  return t('{0}{1} — used in {2} places', address, name, node.uses);
};

export async function runMovePoint(port: EditorPort): Promise<void> {
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

  const nodes = movableNodes(fence.source);
  if (nodes.length === 0) {
    port.warn(port.t('This fence has no node to move'));
    return;
  }

  const labels = nodes.map((node) => labelOf(node, port.t));
  const picked = await port.pick(labels, port.t('Node to move'));
  if (picked === null) return;

  const node = nodes[labels.indexOf(picked)];
  if (!node) {
    port.warn(port.t('Unknown node: {0}', picked));
    return;
  }

  const here = formatAddress(node.address);
  const written = await port.prompt(port.t('Address to move to (e.g. b3)'), here);
  if (written === null) return;

  const to = parseAddress(written.trim());
  if (to === null) {
    port.warn(port.t('Not an address: {0}', written));
    return;
  }

  const result = movePoint(fence.source, node.address, to);
  if (!result.ok) {
    port.warn(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    port.info(port.t('The node is already at {0}', here));
    return;
  }

  // **確認では止めない** (2026-09-02 の決め)。節点ごと動かせば接続は保たれ、
  // 寄せた先で何かとつながったときだけ、動かしたあとのお知らせに添える。
  // **当たらなかったときは黙らない** (`movePart` と同じ扱い)。
  if (!await port.apply(fence.line, result.value.edits)) {
    port.warn(port.t('Could not rewrite the fence (the document may have changed in the meantime)'));
    return;
  }
  // 名前があっても、生の綴りで書いた場所が混ざっていれば 1 行では済まない。
  const how = node.name !== null && result.value.edits.length === 1
    ? port.t('Rewrote the one line of {0}', node.name)
    : port.t('Rewrote {0} places', result.value.edits.length);
  const changed = describeDiff(result.value.diff);
  port.info(changed === null
    ? port.t('Moved the node at {0} to {1} ({2})', here, written.trim(), how)
    : port.t('Moved the node at {0} to {1} ({2}). {3}', here, written.trim(), how, changed));
}
