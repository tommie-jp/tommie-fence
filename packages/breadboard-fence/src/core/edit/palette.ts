import { element, escapeMarkup, partIcon } from 'fence-kit';
import { resolveAlias } from '../parts/aliases.ts';
import { aliasNames } from '../parts/aliases.ts';
import { PLACEABLE, holesOf, partName } from '../parts/catalog.ts';
import { variantsOf } from '../parts/variants.ts';

/**
 * 置く部品を選ぶパレット。**core が組む** — 何が置けるかは部品の表そのもので、
 * webview 側に写しを持つと種類を足したときに片方が古くなる。
 *
 * **名前の前に実物の姿を出す** (`fence-kit` の `partIcon`)。以前は「小さな枠に
 * 落とすと読めない別物になる」として出していなかったが、**胴はもともと小さい**
 * ので縮めずに置ける。図と同じ関数で描くので、姿を直すとここも一緒に直る。
 * 名前と検索はそのまま (覚えている呼び方が人によるため)。
 */

/** その種類を指せる略記 (`r` → resistor)。検索で引けるようにする。 */
const aliasesOf = (type: string): readonly string[] =>
  aliasNames().filter((alias) => resolveAlias(alias) === type);

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
      (partIcon(type) ?? '') + `${escapeMarkup(name)} ${element('code', {}, escapeMarkup(type))}`,
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
 *
 * **姿つきの綴りも並べる** (`crystal/cylinder`)。姿は種類のあとに `/` で書く
 * ので、種類の欄でそのまま選べる — 姿を変えるためだけに本文へ戻らずに済む
 * (実機で頼まれて足した)。
 */
export const renderTypeOptions = (id: string): string => {
  const names = PLACEABLE().flatMap((type) => [type, ...variantsOf(type).map((look) => `${type}/${look}`)]);
  return element('datalist', { id }, names.map((value) => element('option', { value })).join(''));
};
