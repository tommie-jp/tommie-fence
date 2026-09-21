import { writeFileSync } from 'node:fs';
import { iconPng } from '../../playground/scripts/icon.mjs';

/**
 * 拡張の絵札 (`icon.png`) を焼く。**手で回す** — `node scripts/icon.mjs`。
 *
 * 図案は playground の絵札と同じ (穴の並んだ板に 1 本の配線)。焼き方も向こうの
 * もの (zlib で PNG に詰める。ラスタライザを足さない)。
 *
 * **焼いたものを git に入れる。** `.vsix` はパッケージ単体を作業場へ写して
 * 詰めるので (52 の docs/03)、そこに playground は居ない。build で焼くと
 * 作業場で落ちる。図案が変わったら `src/contributes.test.ts` が言う。
 */
export const ICON_SIZE = 128;

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../icon.png', import.meta.url), iconPng(ICON_SIZE));
}
