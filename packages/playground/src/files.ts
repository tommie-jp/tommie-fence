/**
 * 外にあるファイルを開いて、書き戻すための決め事 (52 の docs/43)。
 *
 * fence-editor は「外にある `.md` を開く → 中のフェンスを直す → `.md` に
 * 書き戻す」道具で、頁はその手順のデモをする。**開く口と書き戻す口は
 * 動く所によって違う**が、決め方はここに集める (DOM は知らない)。
 *
 * **その文書がどこにあるか**もここが持つ (`linkTo`)。アドレス欄と QR は
 * 同じ答えを使う — 2 通りに数えると、配った QR と手元の URL が食い違う。
 */

/** 名前が分からないときの呼び名。 */
export const UNTITLED = 'fence.md';

/**
 * その字は CRLF で書かれているか。
 *
 * **テキスト欄は値を LF に均す**ので、開いた時点で見分けて覚えておかないと、
 * Windows で書いた `.md` を開いて保存しただけで**全行が変更扱い**になる
 * (git の差分が真っ赤になる)。
 */
export const isCrlf = (text: string): boolean => text.includes('\r\n');

/** 書き戻す形に直す。開いたときが CRLF なら CRLF で返す。 */
export const withNewlines = (text: string, crlf: boolean): string =>
  (crlf ? text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n') : text.replaceAll('\r\n', '\n'));

/** 開いた字を欄に入れる形 (欄が均すのと同じ形に、こちらでも均しておく)。 */
export const asTyped = (text: string): string => text.replaceAll('\r\n', '\n');

/**
 * URL からファイル名を採る。`.md` で終わらないものは既定の名前にする —
 * **書き戻すときの名前**になるので、拡張子の無い名前は付けない。
 */
export function nameOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const last = decodeURIComponent(path.split('/').pop() ?? '');
  return last.toLowerCase().endsWith('.md') ? last : UNTITLED;
}

/**
 * `?doc=` の行き先。**http(s) だけ受ける** — 外から来た字なので、
 * `javascript:` や `file:` を開きに行かせない。読めなければ null。
 *
 * `base` は相対の道を解く基準 (頁の URL)。**ここから外を見に行かない** —
 * 決め事は DOM も `location` も知らない所に置く (約束 5)。
 *
 * 相手が CORS を許していなければ取れないが、それは取りに行ってから分かる
 * (ここでは綴りだけ見る)。
 */
export function docFrom(search: string, base: string): string | null {
  const asked = new URLSearchParams(search).get('doc');
  if (asked === null || asked === '') return null;
  try {
    const url = new URL(asked, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * その場のファイルへ書き戻せる掴み手 (File System Access)。
 *
 * **持てるのは Chromium の PC だけ。** iOS には picker そのものが無く、
 * OPFS はあるがそれは頁の中の倉庫で「web の外」ではない。持てないときは
 * 同じ名前でダウンロードする — それが今のブラウザでできる「外へ書く」。
 *
 * 型を自前で書いているのは、`lib.dom` の版によって有ったり無かったりする
 * ため (**組み立てる TypeScript の版に頁の動きを預けない**)。
 */
export type FileHandle = {
  readonly name: string;
  readonly getFile: () => Promise<File>;
  readonly createWritable: () => Promise<{
    readonly write: (data: string) => Promise<void>;
    readonly close: () => Promise<void>;
  }>;
};

/** 掴み手を持てる窓か。 */
export const canHold = (view: unknown): boolean =>
  typeof view === 'object' && view !== null && 'showOpenFilePicker' in view;

/**
 * ファイルを共有シートに出せる窓か (52 の docs/45)。
 *
 * **保存先を知らせられないなら、選ばせる。** ダウンロードの行き先を頁に
 * 教える API は無いので、「どこへ入ったか」は言えない。共有シートなら
 * 人が場所を決めるので、**選んだ人が知っている**。
 *
 * **名乗り (UA) で決めない** — 見て分岐すると次の版で外れる。
 * `canShare` は中身も見るので、渡すファイルそのもので訊く。
 */
export function canSend(view: unknown, file: File): boolean {
  const asked = (view as { navigator?: { canShare?: (data: unknown) => boolean } } | null)?.navigator;
  if (typeof asked?.canShare !== 'function') return false;
  try {
    return asked.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * 問い合わせに置ける形にする。**`/` と `:` は戻す** — どちらも問い合わせに
 * 置いてよい字で、`%2F` に化けると URL が長く、読み合わせにくくなる
 * (QR の窓に出す字でもある)。
 */
export const asQuery = (text: string): string =>
  encodeURIComponent(text).replaceAll('%2F', '/').replaceAll('%3A', ':');

/**
 * **いま開いている文書を指すリンク。** アドレス欄にも QR にもこれを使う。
 *
 * `base` は頁そのもの (問い合わせも `#` も無い形)。`docUrl` はその文書の
 * 置き場で、**手元のファイルには無い** (ディスクの上にしか無く、相手の端末に
 * は存在しない) ので、そのときは**頁の URL だけ**を返す。
 *
 * 同じ置き場の下にあるものは**相対の道**にする — `?doc=examples/…` の形。
 * 短くなるうえ、手元 (`/`) と Pages (`/tommie-fence/`) の 2 つある置き場の
 * どちらでも同じ字になる。
 */
export function linkTo(base: string, docUrl: string | null): string {
  if (docUrl === null || docUrl === '') return base;
  const path = docUrl.startsWith(base) ? docUrl.slice(base.length) : docUrl;
  return `${base}?doc=${asQuery(path)}`;
}
