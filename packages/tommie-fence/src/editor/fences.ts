import { createCircuitEditor } from 'circuit-fence/editor';
import { createBreadboardEditor } from 'breadboard-fence/editor';
import { createPerfboardEditor } from 'perfboard-fence/editor';
import { createCopperEditor } from 'copper-fence/editor';
import type { CardSource, FenceEditor } from 'fence-kit';
import { mapLook } from './mapLook.ts';

/**
 * この拡張が扱うフェンス。**殻はいくつでも受け取れる** (52 の docs/19 の手順 1) ので、
 * ここに並べるだけで 1 つの editor が 3 つの言語を掴める。
 *
 * **並びが既定の順**。文書にどのフェンスも無いときのお知らせと、
 * 言語をまたぐ一覧の並びがこの順になる。
 */
export const fenceEditors = (cards?: CardSource): readonly FenceEditor[] => {
  // 部品カード (52 の docs/158) を読むのは 3 つ。copper は型番を引かない。
  const options = cards === undefined ? {} : { cards };
  return [
    createCircuitEditor(mapLook, options),
    createBreadboardEditor(options),
    createPerfboardEditor(options),
    createCopperEditor(),
  ];
};
