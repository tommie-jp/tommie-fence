/**
 * CLI が標準出力へ出す形。**3 つのフェンスで同じもの**を使う
 * (実測して引き上げた — `reportNetlist` は 3 つとも 1 字も違わなかった)。
 */

/** ネットリスト 1 件。フェンスごとの `Net` がそのまま当てはまる形にしてある。 */
export type NetLine = { readonly name: string; readonly refs: readonly string[] };

/**
 * ネットリストを標準出力へ。**名前を揃えて並べる** — 幅が揃っていないと、
 * どの足がどのネットに乗っているかを目で追えない。
 */
export function reportNetlist(netlist: readonly NetLine[]): void {
  if (netlist.length === 0) return;
  console.log('  ネットリスト:');
  const width = Math.max(...netlist.map((net) => net.name.length));
  for (const net of netlist) console.log(`    ${net.name.padEnd(width)} : ${net.refs.join(', ')}`);
}
