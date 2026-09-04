import { element, escapeMarkup } from 'fence-kit';
import { PART_ALIASES, PART_NAMES, lookupPartType, partTypeNames } from '../parts.ts';
import type { PartTypeName } from '../parts.ts';
import { drawGlyph, glyphOf } from './mapGlyphs.ts';

/**
 * 置く部品を選ぶパレット。**core が組む** — 何が置けるかは部品の表そのもので、
 * webview 側に写しを持つと種類を足したときに片方が古くなる。
 *
 * 形はマップと同じ記号 (`mapGlyphs.ts`)。**回路図になるべく寄せてある**が、
 * 正確さそのものは TeX の仕事。よく使う 12 種を絵だけの並びで先に出し、
 * 残りは名前の前に記号を添えた一覧から引く — 77 種を絵だけで並べても選べない。
 */

/** 絵だけの並びに出す代表。**置く回数が多い順**で、形の数とは別に選ぶ。 */
const FEATURED: readonly string[] = [
  'resistor', 'capacitor', 'inductor', 'diode', 'led', 'vsource',
  'switch', 'npn', 'opamp', 'ground', 'port', 'vcc',
];

/** 2 端子か (交点から交点へドラッグする。ほかは 1 回の押しで置く)。 */
const twoEnds = (type: string): boolean => lookupPartType(type)?.kind === 'two-terminal';

/** その種類を指せる略記 (`r` → resistor)。検索で引けるようにする。 */
function aliasesOf(type: string): readonly string[] {
  return Object.entries(PART_ALIASES)
    .filter(([, name]) => name === type)
    .map(([alias]) => alias);
}

/** ボタン 1 つに載せる目印。**置き方は種類で決まる**ので、印も一緒に持たせる。 */
const marks = (type: string): Record<string, string> => ({
  'data-type': type,
  ...(twoEnds(type) ? { 'data-ends': '2' } : {}),
});

/** 2 端子の胴から出る足。似顔絵は胴だけなので、線を足して形を読みやすくする。 */
const LEADS = element('path', { class: 'cf-glyph-line', d: 'M-13,0 L-9,0 M9,0 L13,0' });

/** 短絡は線だけの「記号を持たない」種類。空の枠にせず、線を引く。 */
const WIRE = element('path', { class: 'cf-glyph-line', d: 'M-10,0 L10,0' });

function icon(type: string): string {
  const glyph = glyphOf(type);
  const shape = drawGlyph(glyph.name) || WIRE;
  const mark = glyph.mark === null
    ? ''
    : element('text', { class: 'cf-mark', x: 0, y: 3, 'text-anchor': 'middle' }, escapeMarkup(glyph.mark));
  return element(
    'svg',
    // 記号が縁で削れないだけの余白を取る (反転の丸と LED の矢が端に届く)。
    { class: 'cf-icon', viewBox: '-15 -11 30 22' },
    (twoEnds(type) ? LEADS : '') + shape + mark,
  );
}

/**
 * パレットの markup。**折り畳める**ので、閉じているあいだは升目が全幅になる
 * (パネルはエディタの横に細く置かれる)。
 */
export function renderPalette(): string {
  const featured = FEATURED.map((type) => element(
    'button',
    { type: 'button', class: 'cf-pick', title: `${PART_NAMES[type as PartTypeName]} (${type})`, ...marks(type) },
    icon(type),
  )).join('');

  const rows = partTypeNames().map((type) => {
    const name = PART_NAMES[type as PartTypeName];
    // 検索は**種類名・略記・和名**の 3 通りで引ける (覚えている呼び方が人による)。
    const find = [type, ...aliasesOf(type), name].join(' ');
    return element('li', {}, element(
      'button',
      { type: 'button', class: 'cf-pick', 'data-find': escapeMarkup(find.toLowerCase()), ...marks(type) },
      // **名前の前に記号を出す。** よく使うものだけ絵で並べていたが、
      // 一覧のほうも記号が出ていれば名前を覚えていなくても選べる。
      icon(type) + `${escapeMarkup(name)} ${element('code', {}, escapeMarkup(type))}`,
    ));
  }).join('');

  return element(
    'details',
    { class: 'cf-palette' },
    element('summary', {}, '部品を置く')
      + element('p', { class: 'cf-icons' }, featured)
      + element('input', { type: 'search', class: 'cf-search', placeholder: '種類・略記・名前で探す' })
      + element('ul', { class: 'cf-types' }, rows),
  );
}

/**
 * 欄で種類を打つときの候補。**パレットと同じ表から**出すので、
 * 選べる種類と打てる種類が食い違わない。
 */
export const renderTypeOptions = (id: string): string =>
  element(
    'datalist',
    { id },
    partTypeNames().map((type) => element('option', { value: type })).join(''),
  );
