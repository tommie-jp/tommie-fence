/**
 * `index.html` の中の、頁が触る要素。**ここでまとめて引く** — 無ければ起動の
 * 時点で止まる (HTML と TS の id の食い違いを、押したときではなく開いたときに
 * 見つける)。
 */

function need<E extends HTMLElement>(id: string): E {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} が index.html にありません`);
  return found as E;
}

export const els = {
  // 帯
  more: need<HTMLButtonElement>('more'),
  docName: need<HTMLButtonElement>('doc-name'),
  example: need<HTMLSelectElement>('example'),
  file: need<HTMLInputElement>('file'),
  open: need<HTMLButtonElement>('open'),
  qr: need<HTMLButtonElement>('qr'),
  save: need<HTMLButtonElement>('save'),
  md: need<HTMLButtonElement>('md'),
  log: need<HTMLDetailsElement>('log'),
  logRows: need('log-rows'),
  said: need('said'),
  // マップ
  map: need<HTMLIFrameElement>('map'),
  // QR の窓
  qrBox: need<HTMLDialogElement>('qr-box'),
  qrUrl: need('qr-url'),
  qrKind: need('qr-kind'),
  qrCode: need('qr-code'),
  // Markdown の窓
  mdBox: need<HTMLDialogElement>('md-box'),
  fence: need<HTMLSelectElement>('fence'),
  source: need<HTMLTextAreaElement>('source'),
  figure: need('figure'),
  try: need('try'),
  note: need('note'),
  tex: need<HTMLDetailsElement>('tex'),
  texBody: need('tex-body'),
  netlist: need('netlist'),
  messages: need('messages'),
  // 見出しと脚註
  leadJa: need('lead-ja'),
  leadEn: need('lead-en'),
  leadLink: need('lead-link'),
  leadTitle: need('lead-title'),
  leadNoteJa: need('lead-note-ja'),
  leadNoteEn: need('lead-note-en'),
  from: need('from'),
  ver: need('ver'),
};
