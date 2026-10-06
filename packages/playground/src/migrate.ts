import { migrateCircuitFences } from 'circuit-fence/src/core';

/**
 * 旧い番地の綴り (`a1` `a1f5`) の回路図を `x,y` に書き換える申し出 (52 の docs/126 の段 9)。
 * 共有リンクや手元の古い文書は旧い綴りのままで、circuit-fence 0.35.0 からは読めない。
 * **書き換えるのは ```circuit フェンスの中だけ** (ブレッドボードの穴 `a5` は触らない)。
 * 中身は core の `migrateCircuitFences` (拡張のクイックフィックスと同じ物)。
 */
export type MigrateOffer = { readonly label: string; readonly next: string; readonly changed: number };

/** 書き換える所があれば、釦の字と書き換えた全文。無ければ null (釦を出さない)。 */
export function migrateOffer(text: string): MigrateOffer | null {
  const result = migrateCircuitFences(text);
  if (result.changed === 0) return null;
  return { label: `番地を x,y に書き換える (${result.changed} か所)`, next: result.text, changed: result.changed };
}
