/**
 * フェンスを図に書き出すとき (`- source` の注釈) の**切り方**。
 *
 * 実測して引き上げた: breadboard と perfboard が同じ数式を持ち、circuit だけが
 * 「長すぎるので書き出さない」と断っていた。**断られるより、途中まで出て
 * 切れたと分かるほうが直しやすい**ので、切る形に 3 つとも揃えた。
 *
 * 上限そのものは各パッケージが持つ (`limits.ts`)。図の高さの都合はフェンスごとに
 * 違い、circuit は 1 行ごとに TeX の節点が増えるぶん重い。
 */

/**
 * 書き出す行。**末尾の空行は落とす** (フェンスに書かれていたものではなく、
 * 改行を揃えるときに増える)。上限を超えたら**切ったことを最後の行に書く** —
 * 黙って消えると、書き出しが本文と違うことに気づけない。
 */
export function keptSourceLines(source: string, limit: number): readonly string[] {
  const lines = source.split('\n');
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();

  const kept: string[] = lines.slice(0, limit);
  if (lines.length > kept.length) kept.push(`… ほかに ${lines.length - kept.length} 行`);
  return kept;
}
