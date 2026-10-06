/**
 * `data:` に渡す実測のファイル (CSV・Touchstone)。**頁の中だけで持つ** (52 の docs/120)。
 *
 * コアはファイルを開かず、名前を渡すと中身を返す口 (`DataSource`) だけを受け取る。
 * 頁は文書の隣に手が届かないので、人が選んだファイルと、例が配る隣のファイルを
 * 名前で引ける表にして渡す。**どこにも送らず、保存もしない。**
 *
 * ここは DOM を知らない。ファイルを選ぶ釦は `page/data.ts`。
 */

/** 1 ファイルの上限。コアの `data:` の上限 (1 MB) と同じ。 */
export const ATTACH_MAX_BYTES = 1_000_000;

/** 受ける拡張子。scope・graph・spectrum は CSV、vna は Touchstone。 */
const EXTENSIONS = ['.csv', '.s1p', '.s2p', '.txt'] as const;

/** `data:` の名前の形。**コアが断る `/` `\` `..` を、こちらでも先に断る。** */
const SAFE_NAME = /^[^\s/\\]+$/;

const hasExtension = (name: string): boolean => {
  const lower = name.toLowerCase();
  return EXTENSIONS.some((ext) => lower.endsWith(ext));
};

/** 名前として受けられるか。`..` を含む名前は断る。 */
const isSafeName = (name: string): boolean => SAFE_NAME.test(name) && !name.includes('..');

/**
 * 添付してよいか。**よければ null、だめなら人に読ませる理由。**
 * 外から来たファイルなので、名前と大きさを境界で確かめる。
 */
export function checkAttachment(name: string, bytes: number): string | null {
  // 名前に空白を含む実ファイルもある (`5-1 rc.txt`) ので、空白は断らず、`/` `\` `..` だけ断る。
  const clean = !name.includes('/') && !name.includes('\\') && !name.includes('..') && name !== '';
  if (!clean) return `${name} は名前に / や \\ や .. を含むので添えられません`;
  if (!hasExtension(name)) return `${name} は ${EXTENSIONS.join(' ')} のどれかで終わる名前だけ添えられます`;
  if (bytes > ATTACH_MAX_BYTES) return `${name} は 1 MB を超えているので添えられません`;
  return null;
}

/** フェンスの最上位の `data: ファイル名 [凡例の名前]` の行 (字下げ・コメントは拾わない)。 */
const DATA_LINE = /^data:[ \t]*([^\s#]+)/gm;

/** フェンス本文が指す `data:` のファイル名。**行の順・重複なし。読めない名前は除く。** */
export function dataNamesIn(source: string): readonly string[] {
  const names: string[] = [];
  for (const found of source.matchAll(DATA_LINE)) {
    const name = found[1] ?? '';
    if (isSafeName(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

export type Attachments = ReadonlyMap<string, string>;

/** 1 つ足した新しい表 (元は変えない)。同じ名前は置き換える。 */
export const withAttachment = (files: Attachments, name: string, text: string): Attachments =>
  new Map([...files, [name, text]]);

/** コアの `DataSource` の形に直す。**名前で引くだけ** (継承した名前は引かない)。 */
export const sourceOf = (files: Attachments) => (name: string): string | null => files.get(name) ?? null;

/**
 * 図の下に足す案内。**添えていない名前があるときだけ**、何をすれば実測が重なるかを言う
 * (コアの断りは「この宿主では読めません」で、頁の釦までは教えてくれない)。
 */
export function missingNote(source: string, files: Attachments): string | null {
  const missing = dataNamesIn(source).filter((name) => !files.has(name));
  if (missing.length === 0) return null;
  return `添えていないデータ: ${missing.join(', ')} (「データを添える」で選ぶと実測が重なります。頁の外へは送りません)`;
}
