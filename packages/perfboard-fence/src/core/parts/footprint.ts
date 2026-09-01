import type { Address } from '../types.ts';
import { isThreeLead, isTwoLead } from './types.ts';

/**
 * 部品の形。**何個の穴を書くか**と、**足がどこに来るか**の 2 つを決める。
 *
 * 2 本足と 3 本足は**書かれた穴がそのまま足**。実物の足は曲げられるので、
 * 列に並べても三角に開いても挿さり、どちらで書いたかは図に出したい。
 *
 * DIP と SIP は**アンカー 1 つだけ書く**。足の位置はパッケージが決めていて、
 * 書く人が選べないため — 16 個の穴を書かせるのは、選べないものを書かせること。
 */

export type FootprintKind = 'two-lead' | 'three-lead' | 'dip' | 'sip';

export type Footprint = {
  readonly kind: FootprintKind;
  /** 足の数。 */
  readonly pins: number;
  /** フェンスに書く穴の数。 */
  readonly holes: number;
};

/** DIP の 2 列の間隔 (穴の数)。300 mil = 7.62mm = 3 ピッチ。 */
export const DIP_ROW_SPAN = 3;

const DIP = /^dip([0-9]{1,2})$/;
const SIP = /^sip([0-9]{1,2})$/;

const DIP_MIN_PINS = 4;
const DIP_MAX_PINS = 40;
/** 1 本のヘッダは部品として意味を持たない。上限は dip に合わせる。 */
const SIP_MIN_PINS = 2;
const SIP_MAX_PINS = 40;

/** 種類から形を引く。置けない種類は null。 */
export function footprintOf(type: string): Footprint | null {
  if (isTwoLead(type)) return { kind: 'two-lead', pins: 2, holes: 2 };
  if (isThreeLead(type)) return { kind: 'three-lead', pins: 3, holes: 3 };

  const dip = DIP.exec(type);
  if (dip) {
    const pins = Number(dip[1]);
    // 奇数の DIP は無い (2 列に分かれる)。
    if (pins >= DIP_MIN_PINS && pins <= DIP_MAX_PINS && pins % 2 === 0) {
      return { kind: 'dip', pins, holes: 1 };
    }
    return null;
  }

  const sip = SIP.exec(type);
  if (sip) {
    const pins = Number(sip[1]);
    if (pins >= SIP_MIN_PINS && pins <= SIP_MAX_PINS) return { kind: 'sip', pins, holes: 1 };
  }
  return null;
}

/**
 * 書かれた穴から足の位置を出す。
 *
 * DIP は**パッケージの番号の付き方どおり**に反時計回り — pin 1 が左上、
 * そこから右へ数えて、折り返して下の列を左へ戻る。実物のノッチと同じ向きで、
 * ここを変えるとデータシートのピン番号と図が食い違う。
 */
export function pinsOf(footprint: Footprint, holes: readonly Address[]): readonly Address[] {
  const anchor = holes[0];
  if (!anchor) return [];

  if (footprint.kind === 'two-lead' || footprint.kind === 'three-lead') {
    return holes.slice(0, footprint.pins);
  }

  if (footprint.kind === 'sip') {
    return Array.from({ length: footprint.pins }, (_, index) => ({
      row: anchor.row,
      col: anchor.col + index,
    }));
  }

  const perSide = footprint.pins / 2;
  const top = Array.from({ length: perSide }, (_, index) => ({
    row: anchor.row,
    col: anchor.col + index,
  }));
  const bottom = Array.from({ length: perSide }, (_, index) => ({
    row: anchor.row + DIP_ROW_SPAN,
    col: anchor.col + perSide - 1 - index,
  }));
  return [...top, ...bottom];
}
