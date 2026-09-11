import { render } from '../fences.ts';
import type { NetRow, Output } from '../fences.ts';
import type { DocFence } from '../document.ts';
import { els } from './els.ts';
import { reason } from './log.ts';

/**
 * Markdown の窓の右側 — いまのフェンス 1 本の**公開する図**と、TeX・
 * ネットリスト・読めなかった行。**文書の状態は持たない** (何を描くかは呼ぶ側が
 * 渡す)。持つのは描きかけの番号だけ。
 */

/** フェンスの無い文書に出す断り。 */
const NO_FENCE = 'この文書に circuit / breadboard / perfboard のフェンスがありません';

/**
 * 図の上に出す一言 (circuit の描画の進み具合と、描けなかった理由)。
 * null で消す。
 */
function showNote(text: string | null): void {
  els.note.hidden = text === null;
  els.note.textContent = text ?? '';
}

/**
 * **いま何枚目を描いているか。** 打鍵のたびに増える。描き上がったときに
 * 番号が変わっていたら、その図はもう古いので捨てる (TeX は 1 枚 1 秒前後かかる)。
 */
let drawing = 0;

/**
 * circuit の図。TeX を WASM で走らせるので**非同期**で、資材 (4.8 MB) は
 * 初めて描くときだけ落ちる。描き上がるまでは、前の図を消して一言だけ出す。
 */
const drawTex = async (
  tex: string,
  finishing: NonNullable<Output['finishing']>,
  say: (text: string) => void,
): Promise<string> => {
  // **要るときに読む。** TeX を描く一式はここでしか使わないので、
  // breadboard と perfboard しか見ない人には落とさせない。
  const engine = await import('../tex/index.ts');
  return engine.drawTex(tex, finishing, say);
};

function paintCircuit(output: Output): void {
  const token = (drawing += 1);
  els.figure.replaceChildren();

  if (output.tex === null || output.finishing === null) {
    showNote('読めなかったので、図を組むところまで行けませんでした');
    return;
  }

  const say = (text: string): void => {
    if (token === drawing) showNote(text);
  };

  drawTex(output.tex, output.finishing, say).then(
    (svg) => {
      if (token !== drawing) return;
      els.figure.innerHTML = svg;
      showNote(null);
    },
    (error: unknown) => {
      if (token !== drawing) return;
      showNote(`図を描けませんでした: ${reason(error)}`);
    },
  );
}

/** ネットリストを表にする。**中身は生のデータ**なので textContent で入れる。 */
export function paintNetlist(netlist: readonly NetRow[]): void {
  els.netlist.replaceChildren();
  if (netlist.length === 0) return;

  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = 'ネットリスト (図から導いたもの)';
  table.append(caption);

  for (const net of netlist) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = net.name;
    const refs = document.createElement('td');
    refs.textContent = net.refs.join(', ');
    row.append(name, refs);
    table.append(row);
  }
  els.netlist.append(table);
}

/** 描くものが無いとき (フェンスの無い文書) の姿。`missing` はその断り。 */
function paintEmpty(missing: string | null): void {
  drawing += 1;
  els.figure.replaceChildren();
  els.tex.hidden = true;
  paintNetlist([]);
  els.messages.hidden = true;
  showNote(missing);
}

type PaintOptions = {
  /** Markdown の窓が開いているか。**閉じているあいだは描かない。** */
  readonly open: boolean;
  /** 文書を開いているか。開いていて 1 本も無いときだけ断る (何も無い頁では黙る)。 */
  readonly hasDoc: boolean;
};

/**
 * **いまのフェンス 1 本**を描く。文書の他の行は図に出ない。
 *
 * **Markdown の窓が閉じているあいだは図を描かない** (52 の docs/48)。
 * 図の役はマップがしている。circuit の TeX (8.3 MB) を、窓を開かない人に
 * 落とさせないため。描きかけの図は番号を進めて捨てる (閉じた窓に後から
 * 割り込ませない)。
 */
export function paintFence(fence: DocFence | null, { open, hasDoc }: PaintOptions): void {
  if (!open) {
    drawing += 1;
    return;
  }
  if (fence === null) {
    paintEmpty(hasDoc ? NO_FENCE : null);
    return;
  }

  const output = render(fence.kind, fence.source);

  // SVG は各コアが**それ自体で完結した形**で返し、フェンスから来た字は
  // 組む前にエスケープしてある (拡張のプレビューも同じものを貼っている)。
  els.figure.innerHTML = output.svg;

  // circuit だけは図が非同期で来る。**別のフェンスへ移った時点で番号を進めて**、
  // 描きかけの図が後から割り込まないようにする。
  if (fence.kind === 'circuit') {
    paintCircuit(output);
  } else {
    drawing += 1;
    showNote(null);
  }

  els.tex.hidden = output.tex === null;
  els.texBody.textContent = output.tex ?? '';
  paintNetlist(output.netlist);
  els.messages.hidden = output.messages.length === 0;
  els.messages.textContent = output.messages.join('\n\n');
}
