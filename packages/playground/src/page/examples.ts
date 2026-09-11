import { firstDoc, groupLabel, optionLabel, parseExamples, shown } from '../examples.ts';
import type { Example } from '../examples.ts';
import { els } from './els.ts';
import { showSheet } from './layout.ts';
import { reason, warn } from './log.ts';
import { fetchOk, openText } from './files.ts';
import { DEV, pageUrl } from './where.ts';

/**
 * 開ける `.md` の一覧。**例も「外にある `.md`」の 1 つ** (52 の docs/43) —
 * 一覧は名前だけ持ち、中身は選ばれたときに取りに行く。
 */

let examples: readonly Example[] = [];

/** いま並べている例。**欄と `openExample` の番号を揃えるため 1 か所に置く。** */
const mine = (): readonly Example[] => shown(examples, DEV);

/** 開ける `.md` の一覧を組む。種類ごとの小見出しで束ねる。 */
function fillExamples(): void {
  const list = mine();
  els.example.replaceChildren();

  const groups = new Map<string, HTMLOptGroupElement>();
  for (const [index, example] of list.entries()) {
    const label = groupLabel(example);
    let group = groups.get(label);
    if (group === undefined) {
      group = document.createElement('optgroup');
      group.label = label;
      groups.set(label, group);
      els.example.append(group);
    }
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = optionLabel(example);
    group.append(option);
  }
  els.example.disabled = list.length === 0;
  // **組み直した一覧は何も指さない。** 指すのは例を開いたときだけ (`openExample`)。
  unpickExample();
}

export async function loadExamples(): Promise<void> {
  try {
    const { examples: found, dropped } = parseExamples(await (await fetchOk('examples.json')).json());
    examples = found;
    // **落とした数を黙らせない。** 頁と JSON の形が食い違っている印。
    if (dropped > 0) warn(`例を ${dropped} 本読めませんでした`);
  } catch (error) {
    // **残る所に出す** (ログに赤で)。図の下の欄は、閉じた Markdown の窓の
    // 中にある (52 の docs/48)。
    warn(`例を読み込めませんでした: ${reason(error)} (フェンスは手で書けば動きます)`);
  }
  fillExamples();
}

/** 例 (`.md`) を開く。**中身はそのとき取りに行く** (一覧は名前だけ持つ)。 */
async function openExample(index: number): Promise<void> {
  const example = mine()[index];
  if (example === undefined) return;

  try {
    const text = await (await fetchOk(example.path)).text();
    openText(example.name, text, {
      title: example.title,
      from: example.from,
      // **例も置き場のある文書。** 同じ URL を渡せば相手も同じものを開ける。
      url: new URL(example.path, pageUrl()).href,
    });
    // 開けてから指す (開く途中で例ではない文書の印が付くのを避ける)。
    els.example.value = String(index);
  } catch (error) {
    warn(`${example.name} を開けませんでした: ${reason(error)}`);
  }
}

/** 最初に開く例を開く。 */
export const openFirstExample = (): Promise<void> => openExample(firstDoc(mine()));

/**
 * 外から文書を開いた人の欄は、**どれも選ばない形**にする (開いているのは
 * 例ではないので、名前を指したままにすると嘘になる)。
 */
export function unpickExample(): void {
  els.example.selectedIndex = -1;
}

export function listenExamples(): void {
  els.example.addEventListener('change', () => {
    showSheet(false);
    void openExample(Number(els.example.value));
  });
}
