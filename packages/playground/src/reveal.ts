/**
 * テキスト欄の中の、ある範囲を見せる (52 の docs/48)。**DOM を触るだけ** —
 * どの範囲を見せるかは `document.ts` の `changedSpan` が決める。
 */

/** 字の位置の範囲。 */
export type Offsets = { readonly start: number; readonly end: number };

/** 写しに移す字の組み方。**折り返しを同じにする**のに要るものだけ。 */
const TYPESET = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'wordSpacing', 'tabSize', 'textIndent', 'paddingTop', 'paddingRight', 'paddingLeft',
] as const;

/**
 * 欄の中で、その位置が字の組みの上から何 px か。
 *
 * **折り返しも数える。** 行番号 × 行の高さでは、長い行が折り返した文書で下へ
 * ずれる (散文の行は狭い画面でたいてい折り返す)。欄と同じ幅・同じ字の写しを
 * 作って、その位置までの字を流し込んで測る。写しは測ったらすぐ消す。
 */
function topOf(area: HTMLTextAreaElement, offset: number): number {
  const style = getComputedStyle(area);
  const copy = document.createElement('div');
  for (const name of TYPESET) copy.style[name] = style[name];
  // **幅は字の組める幅** (`clientWidth` は余白を含み、巻き取りの棒を含まない)。
  copy.style.boxSizing = 'border-box';
  copy.style.width = `${area.clientWidth}px`;
  copy.style.whiteSpace = 'pre-wrap';
  copy.style.overflowWrap = 'break-word';
  copy.style.position = 'absolute';
  copy.style.visibility = 'hidden';
  copy.style.left = '-9999px';
  copy.style.top = '0';

  copy.textContent = area.value.slice(0, offset);
  const mark = document.createElement('span');
  // 幅の無い字。**位置の印**にする (空の span は行の高さを持たないことがある)。
  mark.textContent = '\u200b';
  copy.append(mark);

  document.body.append(copy);
  const top = mark.offsetTop;
  copy.remove();
  return top;
}

/**
 * 範囲を選び、**欄の上から 3 分の 1 の所へ寄せる** (前後の行も読めるように)。
 *
 * `focus` は**マウスのある端末だけ**立てる。指で触る端末で焦点を移すと
 * キーボードが出て、窓の中の図が隠れる (52 の docs/41 の「試す」と同じ理由)。
 * 焦点を移さなくても範囲は選んでおく — 触ったときに、その所から始まる。
 */
export function showSpan(area: HTMLTextAreaElement, span: Offsets, { focus }: { readonly focus: boolean }): void {
  area.setSelectionRange(span.start, span.end);
  // **焦点を先に移す。** ブラウザは焦点が来たときに自分でカーソルへ寄せるので、
  // 後から寄せ直さないと、こちらの位置が負ける。頁は動かさない。
  if (focus) area.focus({ preventScroll: true });
  area.scrollTop = Math.max(0, topOf(area, span.start) - area.clientHeight / 3);
}
