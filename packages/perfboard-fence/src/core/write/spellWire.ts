import type { WireSpec } from '../types.ts';

/**
 * 仕様から**配線の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * 読む側 (`parser/wires.ts`) と**同じ形**で書く: `穴 -- 穴 [色]`。
 *
 * **この板の配線は 1 行 1 本。** 端点を 3 つ以上つなぐ書き方 (鎖) も、
 * 迂回ヒントも無いので、ほかの 2 つのような行ごとのまとめ直しが要らない。
 * 端は読んだときのまま (`from` / `to` が書かれた綴りで、名前の解決は
 * `wiring/` が別に持つ) なので、控えも足さずに済んでいる。
 */
export function spellWire(wire: WireSpec): string {
  return [wire.from, '--', wire.to, ...(wire.color === null ? [] : [wire.color])].join(' ');
}
