import { asDocument, fencesIn, labelOf } from '../document.ts';
import { UNTITLED, asTyped, canHold, canSend, isCrlf, nameOf, withNewlines } from '../files.ts';
import type { FileHandle } from '../files.ts';
import type { Kind } from '../kinds.ts';
import { decodeShare } from '../share.ts';
import type { Shared } from '../share.ts';
import type { Doc } from '../workspace.ts';
import { els } from './els.ts';
import { reason, say, warn } from './log.ts';
import { changed, ws } from './workspace.ts';

/**
 * 外の `.md` を開いて、書き戻す (52 の docs/43)。**開く口はどれも `openDoc`
 * へ来る** (例・釦・落とす・`?doc=`・配ってあるリンク)。決め事 (改行の形、
 * 名前、どの口が使えるか) は `files.ts` にあり、ここは窓と欄を触るだけ。
 */

/**
 * その場に書き戻せる掴み手。**持てたときだけ**入る (Chromium の PC)。
 * 文書を開き直すたびに落とす — 前の文書の掴み手に書くと、別のファイルを
 * 上書きすることになる。
 */
let held: FileHandle | null = null;

/** 人が窓を閉じただけか (失敗ではないので、何も言わない)。 */
const isCancelled = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** 取りに行く。**200 番台でなければ理由ごと投げる** (呼ぶ側が名前を添えて言う)。 */
export async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} で返りました`);
  return response;
}

/** 文書を開く。**ここが唯一の入口** — 例もリンクも手元のファイルも通る。 */
function openDoc(doc: Doc, text: string): void {
  // **前の文書の掴み手は捨てる。** 残すと、別のファイルを上書きしてしまう。
  held = null;
  ws.open(doc, text);
  changed('open');
}

/**
 * 外の `.md` を開く。改行の形は開いたときのものを覚えておき、書き戻すときに
 * 揃える。**手元のファイルには置き場が無い** — 呼ぶ側が知っていれば `over` で渡す。
 */
export function openText(name: string, text: string, over: Partial<Doc> = {}): void {
  openDoc({
    name: name === '' ? UNTITLED : name,
    title: name,
    from: null,
    url: null,
    fromLink: false,
    crlf: isCrlf(text),
    ...over,
  }, asTyped(text));
}

/**
 * 配ってあるリンクを開く。**フェンス 1 本を、それだけの文書に仕立てる** —
 * 以降の道は普通の `.md` と同じ (52 の docs/43)。
 */
function openLink(kind: Kind, source: string): void {
  const text = asDocument(kind, source);
  const fence = fencesIn(text)[0];
  openDoc({
    name: 'リンクの図.md',
    title: fence === undefined ? 'リンクの図' : labelOf(fence),
    from: null,
    url: null,
    fromLink: true,
    crlf: false,
  }, text);
}

/**
 * `#` に配ってあるリンクがあれば開く。読めたかどうかは返すので、呼ぶ側が
 * 断りを言う (開いたときと、開いたままの頁に貼られたときで言い方が違う)。
 */
export function openShared(hash: string): Shared | null {
  const shared = decodeShare(hash);
  if (shared !== null && shared.ok) openLink(shared.kind, shared.source);
  return shared;
}

/** 手元のファイルを開く (釦でも、落としても、ここへ来る)。 */
async function openFile(file: File, handle: FileHandle | null = null): Promise<void> {
  try {
    openText(file.name, await file.text());
    // **開いた後に持たせる** (`openDoc` が掴み手を落とすので、順は逆にできない)。
    held = handle;
    if (handle !== null) say(`${file.name} は保存で上書きします`);
  } catch (error) {
    warn(`${file.name} を読めませんでした: ${reason(error)}`);
  }
}

/** 窓の側の口。**lib.dom の版に頁の動きを預けない**ので、こちらで名を付ける。 */
type Picker = {
  showOpenFilePicker: (options?: unknown) => Promise<readonly FileHandle[]>;
};

/**
 * 掴み手ごと開く (File System Access)。**2 回目からは窓を出さずに上書き**
 * できる — 直す道具として当たり前の形。持てない窓では釦が `<input>` を押す。
 */
async function pickFile(): Promise<void> {
  try {
    const [handle] = await (window as unknown as Picker).showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
    if (handle === undefined) return;
    await openFile(await handle.getFile(), handle);
  } catch (error) {
    if (isCancelled(error)) return;
    warn(`開けませんでした: ${reason(error)}`);
  }
}

/**
 * `?doc=` の `.md` を開く。**取れなければそう言う** — 相手が CORS を
 * 許していないことがあり、黙って既定の例を出すと「別の文書が出た」としか
 * 見えない (約束 6)。
 */
export async function openUrl(url: string): Promise<boolean> {
  try {
    openText(nameOf(url), await (await fetchOk(url)).text(), { url });
    return true;
  } catch (error) {
    warn(`${url} を開けませんでした: ${reason(error)}`);
    return false;
  }
}

/** 書き戻せたときの後始末。**「元に戻す」の行き先もここへ進む。** */
function kept(typed: string, message: string): void {
  ws.kept(typed);
  changed('kept');
  say(message);
}

/** その場に書く。書けなかったら false (落とす道へ)。 */
async function writeInPlace(handle: FileHandle, text: string): Promise<boolean> {
  try {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (error) {
    // **書けなかったら落とす道へ。** 許しを取り消された・別の窓が掴んで
    // いる、などがある。黙って何も起きないのが一番困る。
    warn(`その場に書けませんでした (${reason(error)})。落とします`);
    return false;
  }
}

/** 共有シートに出す。**人が閉じたのと、出せなかったのは別** — 後者は落とす道へ。 */
async function sendToSheet(file: File): Promise<'sent' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'sent';
  } catch (error) {
    if (isCancelled(error)) return 'cancelled';
    warn(`共有シートに出せませんでした (${reason(error)})。落とします`);
    return 'failed';
  }
}

/** 同じ名前でダウンロードに落とす。 */
function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 書き戻す。道は 3 段 (52 の docs/45): 掴み手があればその場に書く →
 * 掴み手を持てない窓 (iPhone など) で共有シートが使えるならそちらへ →
 * 同じ名前でダウンロード。iOS はダウンロードが Files に落ちるので、そこから戻せる。
 */
async function saveDoc(): Promise<void> {
  const { name, crlf } = ws.doc;
  if (name === '') return;
  const typed = ws.text();
  const text = withNewlines(typed, crlf);

  if (held !== null) {
    if (await writeInPlace(held, text)) {
      kept(typed, `${name} に書きました`);
      return;
    }
    held = null;
  }

  const file = new File([text], name, { type: 'text/markdown' });

  // **保存先を知らせられないなら、選ばせる。** 共有シートの「ファイルに保存」で
  // 人が場所を決めるので、**選んだ人が知っている**。掴み手を持てる窓では
  // 使わない (その場に書くほうが速い)。
  if (!canHold(window) && canSend(window, file)) {
    const sent = await sendToSheet(file);
    if (sent === 'cancelled') return;
    if (sent === 'sent') {
      kept(typed, `${name} を共有シートに出しました (保存先はそちらで選んでください)`);
      return;
    }
  }

  download(file);
  // **落とせたものとして扱う。** ブラウザは落とし終わりを教えないので、
  // ここで印を解く。**どこへ入ったかは言えない** (頁に教える API が無い) ので、
  // 代わりに**どこを見ればよいか**を言う。
  kept(typed, `${name} をダウンロードに入れました (ブラウザの履歴から開けます)`);
}

/** **落として開く。** 受け皿は頁ぜんぶ (どこへ落としても同じ)。 */
function listenDrop(): void {
  for (const kind of ['dragenter', 'dragover'] as const) {
    document.addEventListener(kind, (event) => {
      if (event.dataTransfer === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      document.body.classList.add('dropping');
    });
  }
  document.addEventListener('dragleave', (event) => {
    // 頁の外へ出たときだけ消す (中の要素をまたぐたびに鳴るため)。
    if (event.relatedTarget === null) document.body.classList.remove('dropping');
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('dropping');
    const item = event.dataTransfer?.items[0];
    const file = event.dataTransfer?.files[0];
    if (file === undefined) return;

    // **落としたものからも掴み手を取れる** (Chromium)。取れれば、そのまま
    // その場に書き戻せる。取れなければダウンロードに落ちるだけ。
    const asHandle = (item as { getAsFileSystemHandle?: () => Promise<FileHandle | null> } | undefined)
      ?.getAsFileSystemHandle;
    if (asHandle === undefined) {
      void openFile(file);
      return;
    }
    void asHandle.call(item).then(
      (handle) => openFile(file, handle),
      () => openFile(file),
    );
  });
}

export function listenFiles(): void {
  // **掴めるなら picker で開く** (2 回目からその場に上書きできる)。
  // 持てない窓 (iOS など) では今までどおり `<input>` を押す。
  els.open.addEventListener('click', () => {
    if (canHold(window)) void pickFile();
    else els.file.click();
  });
  els.file.addEventListener('change', () => {
    const file = els.file.files?.[0];
    if (file !== undefined) void openFile(file);
    // **同じファイルをもう一度選べるようにする。** 値が同じだと change が
    // 鳴らないので、読み終わったら空に戻す。
    els.file.value = '';
  });
  els.save.addEventListener('click', () => { void saveDoc(); });

  // **⌘S / Ctrl+S でも落とす。** 直す道具として当たり前の鍵で、押すと
  // ブラウザが「頁を保存」を出してしまうので、こちらで受け取る。
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 's') return;
    event.preventDefault();
    void saveDoc();
  });

  // **直したまま閉じさせない。** 頁を閉じると字は消える (預け先が無い)。
  window.addEventListener('beforeunload', (event) => {
    if (!ws.dirty()) return;
    event.preventDefault();
  });

  listenDrop();
}
