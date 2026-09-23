import { DEFAULT_LED_COLOR, ledColor } from '../colors.ts';
import type { BodyPart } from './ink.ts';

/**
 * 足の印と LED の色の読み方。**差し込み型の胴 (`bodies.ts`) と面実装の胴
 * (`smdDraw.ts`) が同じ規則で読む** — 片方だけ直すと、同じ `(K)` がチップと
 * 砲弾型で反対の端を指す。
 */

/**
 * 印が付く側の足。**片方にしか印が無くても、2 本足なら反対側が決まる**。
 *
 * どちらにも印が無ければ**先に書いた穴が + 側 (アノード)** とする。
 * これはフェンス全体にかかる 1 文の規則で、コンデンサの `(+)` `(-)` も
 * ダイオードの `(A)` `(K)` も同じ規則の別の顔。**片方だけ見て決めると、
 * 反対側だけを書いた図 (`diode a5 a10(A)`) が逆向きに描かれる。**
 *
 * @param whenBare どちらの印も無いときに返す足 (0 = 先に書いた穴)
 */
export function markedIndex(part: BodyPart, mark: string, opposite: string, whenBare: number): number {
  const names = part.pins.map((pin) => pin.name.toUpperCase());
  const found = names.indexOf(mark);
  if (found !== -1) return found;
  const other = names.indexOf(opposite);
  if (other !== -1) return 1 - other;
  return whenBare;
}

/** カソード側の足。ダイオードの帯と LED の平らな面がここを見る。 */
export const cathodeIndex = (part: BodyPart): number => markedIndex(part, 'K', 'A', 1);

/** LED の色。書かれた値から引き、知らない色でも既定で描く。 */
export const ledLook = (part: BodyPart): { readonly color: string; readonly name?: string } => {
  const written = part.value ?? '';
  const found = ledColor(written);
  return found === null ? { color: DEFAULT_LED_COLOR } : { color: found, name: written.toLowerCase() };
};
