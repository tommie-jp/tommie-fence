import { ATTACH_MAX_BYTES, checkAttachment, dataNamesIn, withAttachment } from '../data.ts';
import type { Attachments } from '../data.ts';
import { els } from './els.ts';
import { reason, say, warn } from './log.ts';
import { changed } from './workspace.ts';

/**
 * `data:` に重ねる実測のファイル (52 の docs/120)。**頁の中の表だけで持つ** —
 * どこにも送らず、保存にも共有リンクにも載せない。文書を開き直したら捨てる
 * (前の文書の同じ名前のデータが、別の文書の図に黙って重なるのを避ける)。
 */

let files: Attachments = new Map();

/** いま添えているデータ。図を描くときに `data:` の読み口へ渡す。 */
export const attached = (): Attachments => files;

/** 文書を開き直すとき。 */
export function clearAttached(): void {
  files = new Map();
}

/** 外のファイルを受け取る。**名前と大きさを確かめ、断った理由は黙らず言う。** */
async function take(list: readonly File[]): Promise<number> {
  let taken = 0;
  const refused: string[] = [];
  for (const file of list) {
    const why = checkAttachment(file.name, file.size);
    if (why !== null) {
      warn(why);
      refused.push(why);
      continue;
    }
    try {
      files = withAttachment(files, file.name, await file.text());
      taken += 1;
    } catch (error) {
      const why = `${file.name} を読めませんでした: ${reason(error)}`;
      warn(why);
      refused.push(why);
    }
  }
  // **窓の中にも出す** (帯の一言とログは、開いている窓の後ろに隠れる)。
  els.attachSaid.textContent = refused.join(' / ');
  return taken;
}

/** 選んだ (落とした) ファイルを添える。添えたら図を描き直す。 */
export async function attachFiles(list: readonly File[]): Promise<void> {
  const taken = await take(list);
  if (taken === 0) return;
  say(`${taken} 個のデータを添えました (頁の中だけで持ちます)`);
  changed('view');
}

/** 落としたファイルがデータの名前か (`.md` ではなく、添えるほうへ回す)。 */
export const isDataFile = (file: File): boolean => /\.(csv|s1p|s2p|txt)$/i.test(file.name);

/**
 * 文書の隣のデータを取りに行く。**本文の `data:` が指す名前だけ** (同じ場所のほかの
 * ファイルは取らない)。**頁と同じ出所の文書だけ** — 外の URL の隣へは取りに行かない
 * (外部参照をしない。52 の docs/120)。見つからなくても文書は開く (添付で補える)。
 * 取れたものがあれば図を描き直す。
 */
export async function attachSiblings(documentUrl: string, sources: readonly string[]): Promise<void> {
  const base = new URL(documentUrl, location.href);
  if (base.origin !== location.origin) return;
  const before = files.size;
  const dir = new URL('.', base).href;
  const names = [...new Set(sources.flatMap((source) => dataNamesIn(source)))];
  for (const name of names) {
    try {
      const response = await fetch(`${dir}${name}`);
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length > ATTACH_MAX_BYTES) continue;
      files = withAttachment(files, name, text);
    } catch {
      // 取れなかった名前は添えないまま。図の側が「添えていないデータ」と案内する。
    }
  }
  if (files.size > before) changed('view');
}

export function listenAttach(): void {
  els.attach.addEventListener('click', () => els.attachFile.click());
  els.attachFile.addEventListener('change', () => {
    const list = [...(els.attachFile.files ?? [])];
    // **同じファイルをもう一度選べるようにする** (値が同じだと change が鳴らない)。
    els.attachFile.value = '';
    void attachFiles(list);
  });
}
