import { describe, expect, test } from 'vitest';
import { placeableTypes } from '../../breadboard-fence/src/core/placement/footprints.ts';
import { placeableNames } from '../../perfboard-fence/src/core/parts/types.ts';
import { partTypeNames } from '../../circuit-fence/src/core/parts.ts';

/**
 * 3 つの部品表を突き合わせる (52 の docs/21 の手順 8)。
 *
 * **ここが 3 つを一度に見られる唯一の場所。** 各パッケージは互いを import
 * しないので、片方だけの表からは「もう片方に無い」ことが分からない
 * (circuit の `parity.test.ts` は板の表を写しで持つしかない)。
 * playground は 3 つとも読むので、写しを持たずに突き合わせられる。
 */
describe('3 つのフェンスの部品表', () => {
  const bb = new Set(placeableTypes());
  const pf = new Set(placeableNames());

  test('lets the two boards place exactly the same parts', () => {
    // **板の 2 つは完全に揃える** (52 の docs/21 の決め 2)。どちらも実体配線図で、
    // 片方に置けてもう片方に置けない理由が無い。片方に足したらここが落ちる。
    expect([...bb].filter((type) => !pf.has(type))).toEqual([]);
    expect([...pf].filter((type) => !bb.has(type))).toEqual([]);
  });

  test('lets the schematic write every part the boards can place', () => {
    // **板に在る物は回路図にも在る。** 同じ回路をどちらでも書けるようにするため。
    // 例外は総称の `transistor` — 回路図は npn / pnp / FET を選ぶもので、
    // 総称の記号が無い (別名にすると「置いたら勝手に npn になった」ことになる)。
    const known = new Set(partTypeNames());

    expect([...bb].filter((type) => !known.has(type))).toEqual(['transistor']);
  });
});
