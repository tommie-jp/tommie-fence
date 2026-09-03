/**
 * 組み上がった図から、部品 1 つぶんの markup を切り出す。
 *
 * **置く前のゴーストに実物の姿を見せる**ために要る。動かすときは図にある絵を
 * webview が写せばよいが、**置く前の部品は図にまだ無い**ので、試し当てで作った
 * 写しの図から切り出して渡す (`session.ts` の `preview`)。
 *
 * **入れ子の `g` があるので、正規表現で閉じ札を探さない。** perfboard の
 * 3 本足は姿勢の `g` を内側に持っていて、最初の `</g>` は部品の終わりではない。
 */

/**
 * 掴む印の付いた `g` の始まり。**`class` と `data-part` はどちらが先でもよい** —
 * 並びはフェンスが決めることなので、こちらで決め打ちにしない。
 */
const opensChip = (tag: string, id: string): boolean =>
  /\bclass="[^"]*\bcf-chip\b[^"]*"/.test(tag) && tag.includes(`data-part="${id}"`);

/**
 * 図の中の部品 1 つを、開き札から対応する閉じ札まで丸ごと返す。
 * 見つからなければ null (ゴーストを出さないだけで、図は正しく出る)。
 */
export function chipOf(map: string, id: string): string | null {
  let from = -1;
  let depth = 0;
  // `<g` と `</g>` を数えて、深さが 0 に戻った所が対応する閉じ札。
  // **数え始めるのは見つけた開き札から。** 図の頭から数えると、外側の `g` の
  // ぶんだけ深さがずれて、閉じ札を 1 つ余計に拾う (実際に踏んだ)。
  const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
  for (let tag = tags.exec(map); tag !== null; tag = tags.exec(map)) {
    if (from < 0) {
      if (tag[0] === '</g>' || !opensChip(tag[0], id)) continue;
      from = tag.index;
      // 中身の無い部品 (`<g ... />`) はその 1 札で終わり。
      if (tag[1] === '/') return tag[0];
      depth = 1;
      continue;
    }
    if (tag[0] === '</g>') depth -= 1;
    else if (tag[1] !== '/') depth += 1;
    if (depth === 0) return map.slice(from, tag.index + tag[0].length);
  }
  return null;
}
