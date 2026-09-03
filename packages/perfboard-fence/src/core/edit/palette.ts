import { element, escapeMarkup } from 'fence-kit';
import { PLACEABLE, holesOf, partName } from '../parts/catalog.ts';
import { aliasesFor } from '../parts/types.ts';

/**
 * 置く部品を選ぶパレット。**core が組む** — 何が置けるかは部品の表そのもので、
 * webview 側に写しを持つと種類を足したときに片方が古くなる。
 *
 * **アイコンは出さない。** この図の部品は実物の姿で描かれていて、小さな枠に
 * 落とすと胴の色と帯の位置が読めない別物になる (circuit の似顔絵は記号なので
 * 小さくしても意味が残る)。ここは**名前で選ぶ一覧**にして、検索で引く。
 */

/** その種類を指せる略記 (`r` → resistor)。検索で引けるようにする。 */
const aliasesOf = (type: string): readonly string[] => aliasesFor(type);

/** ボタン 1 つに載せる目印。**置き方は種類で決まる**ので、印も一緒に持たせる。 */
const marks = (type: string): Record<string, string> => ({
  'data-type': type,
  ...(holesOf(type) === 2 ? { 'data-ends': '2' } : {}),
});

/**
 * パレットの markup。**折り畳める**ので、閉じているあいだは図が全幅になる
 * (パネルはエディタの横に細く置かれる)。
 */
export function renderPalette(): string {
  const rows = PLACEABLE().map((type) => {
    const name = partName(type);
    // 検索は**種類名・略記・和名**の 3 通りで引ける (覚えている呼び方が人による)。
    const find = [type, ...aliasesOf(type), name].join(' ');
    return element('li', {}, element(
      'button',
      { type: 'button', class: 'cf-pick', 'data-find': escapeMarkup(find.toLowerCase()), ...marks(type) },
      `${escapeMarkup(name)} ${element('code', {}, escapeMarkup(type))}`,
    ));
  }).join('');

  return element(
    'details',
    { class: 'cf-palette' },
    element('summary', {}, '部品を置く')
      + element('input', { type: 'search', class: 'cf-search', placeholder: '種類・略記・名前で探す' })
      + element('ul', { class: 'cf-types' }, rows),
  );
}

/**
 * 欄で種類を打つときの候補。**パレットと同じ表から**出すので、
 * 選べる種類と打てる種類が食い違わない。
 */
export const renderTypeOptions = (id: string): string =>
  element('datalist', { id }, PLACEABLE().map((type) => element('option', { value: type })).join(''));
