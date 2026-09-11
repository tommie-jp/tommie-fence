/**
 * 釦から開く `<dialog>`。**開いているあいだ釦の `aria-expanded` を立て、閉じたら
 * 下ろす** — QR の窓と Markdown の窓で同じ作法にする。
 */

export function openDialog(box: HTMLDialogElement, button: HTMLElement): void {
  box.showModal();
  button.setAttribute('aria-expanded', 'true');
}

export function listenDialog(box: HTMLDialogElement, button: HTMLElement): void {
  box.addEventListener('close', () => { button.setAttribute('aria-expanded', 'false'); });
}
