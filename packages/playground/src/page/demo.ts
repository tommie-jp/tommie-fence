import { nudge, nudgesFor } from '../demo.ts';
import { changedSpan, replaceFence } from '../document.ts';
import { els } from './els.ts';
import { say } from './log.ts';
import { revealSpan } from './markdown.ts';
import { changed, ws } from './workspace.ts';

/**
 * 「試す」の帯。**当たる釦だけを出す** — 押しても何も起きない釦を並べると、
 * 触った人は「壊れている」と読む (`demo.ts` の `nudge` が null で教える)。
 */

/**
 * 字を入れ替える。`reveal` なら、変わった行を欄の中で見える所へ寄せる —
 * **字と図が同時に変わるのが「試す」の値打ち** (52 の docs/41)。例の文書は
 * 散文が長く、寄せないと変わった行が欄の外にある。焦点は移さない。
 */
function apply(next: string, reveal: boolean): void {
  const before = ws.text();
  ws.setText(next);
  changed('text');
  if (!reveal) return;
  const span = changedSpan(before, next);
  if (span !== null) revealSpan(span, false);
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const one = document.createElement('button');
  one.type = 'button';
  one.textContent = label;
  one.className = className;
  one.addEventListener('click', onClick);
  return one;
}

export function renderTry(): void {
  const fence = ws.current();
  // **探すのはいまのフェンスの中だけ。** 文書の全文を探すと、別のフェンスの
  // 同じ字に当たって、見ていない図が変わる。
  const rows = fence === null
    ? []
    : nudgesFor(fence.kind, fence.title ?? '').filter((one) => nudge(fence.source, one) !== null);
  const back = ws.pristine !== '' && ws.dirty();

  els.try.replaceChildren();
  els.try.hidden = rows.length === 0 && !back;
  if (els.try.hidden) return;

  const lead = document.createElement('span');
  lead.textContent = '試す:';
  els.try.append(lead);

  for (const one of rows) {
    els.try.append(button(one.label, () => {
      const target = ws.current();
      if (target === null) return;
      const next = nudge(target.source, one);
      // 押した瞬間に当たらなくなっていたら何もしない (欄を手で直した後)。
      if (next === null) return;
      apply(replaceFence(ws.text(), target, next), true);
      say(one.said);
    }));
  }

  if (!back) return;
  // 元に戻す釦は控えめに (押す順は「試す」が先)。戻すときは欄を動かさない。
  els.try.append(button('元に戻す', () => {
    apply(ws.pristine, false);
    say('開いたときの字に戻した');
  }, 'back'));
}
