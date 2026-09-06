/**
 * 直近いくつかの答えを覚える包み。**同じ入力なら数え直さない。**
 *
 * フェンスの読み取り (`parseFence`) は 1 回 0.3〜1.1 ms かかり、マップの
 * 試し当て (`session.ts` の `preview`) は 1 回のうちに同じ本文を何度も読む —
 * 行き先を数える (`cellsOf`) → 書き換えを作る (`movePart`) → 元の穴を読む
 * (`cellsOf`) → 当てたあとを読む (`cellsOf`)。カーソルが穴をまたぐたびに
 * 4 回払うと、拡張ホストがそれで埋まる (52 の docs/27 の実測)。
 *
 * **覚えるのは 2 つ。** 試し当ては「元の本文」と「当てたあとの本文」を交互に
 * 読み、当てたあとは動かすたびに変わる。1 つしか覚えないと毎回入れ替わって
 * 当たらない。引いたものは新しい側へ寄せる (使っているほうから落とさない)。
 *
 * **答えを書き換えない使い手にだけ掛ける。** 覚えた答えは次の呼び出しと
 * 同じ物が返るので、受け取った側が書き換えると前の使い手に伝わる。
 * 3 つの `FenceDocument` は読み取り専用の型で、書き換える所は無い。
 */
export function rememberRecent<A, R>(compute: (arg: A) => R, keep = 2): (arg: A) => R {
  const seen = new Map<A, R>();

  return (arg: A): R => {
    if (seen.has(arg)) {
      const known = seen.get(arg) as R;
      // 引いたものは新しい側へ移す (Map は入れた順に並ぶ)。
      seen.delete(arg);
      seen.set(arg, known);
      return known;
    }

    const answer = compute(arg);
    seen.set(arg, answer);
    // 見ていない期間が最も長いものから落とす。
    while (seen.size > keep) {
      const oldest = seen.keys().next();
      if (oldest.done === true) break;
      seen.delete(oldest.value);
    }
    return answer;
  };
}
