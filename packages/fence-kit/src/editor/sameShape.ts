/**
 * 2 つの値が同じ中身か。**オブジェクトの鍵の並びに依らない** (`{ ...part, value }`
 * と読み直した部品では、鍵の並びが違うことがある)。
 *
 * 欄を書き換えたあと**読み直して、狙った中身になったか**を確かめるのに使う。
 * 行の中の範囲は字面から決めているので、読み違えたときに壊した字を書かない
 * ための見張り (perfboard の置く操作の `landed` と同じ考え方)。
 */
export const sameShape = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) => (
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner
  ));
