import { createCircuitEditor } from 'circuit-fence/editor';
import { createBreadboardEditor } from 'breadboard-fence/editor';
import { createPerfboardEditor } from 'perfboard-fence/editor';
import type { FenceEditor } from 'fence-kit';
import { mapLook } from './mapLook.ts';

/**
 * この拡張が扱うフェンス。**殻はいくつでも受け取れる** (52 の docs/19 の手順 1) ので、
 * ここに並べるだけで 1 つの editor が 3 つの言語を掴める。
 *
 * **並びが既定の順**。文書にどのフェンスも無いときのお知らせと、
 * 言語をまたぐ一覧の並びがこの順になる。
 */
export const fenceEditors = (): readonly FenceEditor[] => [
  createCircuitEditor(mapLook),
  createBreadboardEditor(),
  createPerfboardEditor(),
];
