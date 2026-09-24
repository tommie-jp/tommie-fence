import { LIMITS } from '../limits.ts';
import { safeToken } from '../errors.ts';
import { parsePoint, parseSize, pointProblem } from '../model/point.ts';
import { resolveKind } from '../parts/catalog.ts';
import type { Mm, PartSpec, Side } from '../types.ts';
import { takeOrient } from './orient.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

const valueOf = (words: readonly string[]): string | null => {
  const joined = words.join(' ').trim();
  if (joined === '') return null;
  const characters = [...joined];
  return characters.length > LIMITS.labelLength ? `${characters.slice(0, LIMITS.labelLength).join('')}…` : joined;
};

function readAt(word: string | undefined, example: string): Mm | string {
  if (word === undefined) return `中心を x,y (mm) で書きます (例: ${example})`;
  return parsePoint(word) ?? pointProblem(word) ?? `中心として読めません: ${safeToken(word)} (x,y を mm で書きます)`;
}

/**
 * `parts:` の 1 行。置き方は種類で決まる。
 *
 * | 種類 | 書き方 |
 * | --- | --- |
 * | 同軸 | `sma left 10 [値]` — 辺と、辺に沿った位置 (mm) |
 * | 面実装 | `capacitor/1608 12,10 [r90] [値]` — 中心の点 |
 * | 箱 | `box 20,10 5x5 6 [r90] [値]` — 中心・大きさ・足の数 |
 * | 足のある部品 | `resistor P1 P2 [値]` — 端 2 つ (島の名前か点) |
 */
export function parsePartLine(id: string, text: string): LineResult<PartSpec> {
  const words = wordsOf(text);
  const head = words[0];
  if (head === undefined) return fail(`${safeToken(id)} の中身が書かれていません (例: capacitor/1608 20,10 10p)`);
  const kind = resolveKind(head);
  if (!kind.ok) return fail(kind.reason, head);
  const common = { id, value: null, line: null } as const;

  switch (kind.value.kind) {
    case 'edge': {
      const sideWord = (words[1] ?? '').toLowerCase();
      if (!(SIDES as readonly string[]).includes(sideWord)) {
        return fail(`SMA は載せる辺を書きます (${SIDES.join(' / ')}。例: sma left 10)`, words[1]);
      }
      const offsetWord = words[2];
      const offset = offsetWord === undefined ? null : Number(offsetWord);
      if (offsetWord === undefined || offset === null || !/^\d{1,3}(?:\.\d{1,2})?$/.test(offsetWord)) {
        return fail('辺に沿った位置 (mm) を書きます (例: sma left 10)', offsetWord);
      }
      return ok({
        ...common, kind: 'edge', type: 'sma', variant: kind.value.variant,
        side: sideWord as Side, offset, value: valueOf(words.slice(3)),
      });
    }
    case 'chip':
    case 'sot': {
      const at = readAt(words[1], `${head} 20,10`);
      if (typeof at === 'string') return fail(at, words[1]);
      const { orient, rest } = takeOrient(words.slice(2));
      return ok({
        ...common, kind: kind.value.kind, type: kind.value.type, variant: kind.value.variant,
        at, orient, value: valueOf(rest),
      });
    }
    case 'box': {
      const at = readAt(words[1], 'box 20,10 5x5 6');
      if (typeof at === 'string') return fail(at, words[1]);
      const size = words[2] === undefined ? null : parseSize(words[2]);
      if (size === null || [size.width, size.height].some((side) => side < LIMITS.sizeMin || side > LIMITS.sizeMax)) {
        return fail(`箱の大きさを 幅x高さ (mm、${LIMITS.sizeMin}〜${LIMITS.sizeMax}) で書きます (例: box 20,10 5x5 6)`, words[2]);
      }
      const pinsWord = words[3];
      const pins = pinsWord !== undefined && /^\d{1,2}$/.test(pinsWord) ? Number(pinsWord) : null;
      if (pins === null || pins < 1 || pins > LIMITS.boxPins) {
        return fail(`箱の足の数を書きます (1〜${LIMITS.boxPins}。例: box 20,10 5x5 6)`, pinsWord);
      }
      const { orient, rest } = takeOrient(words.slice(4));
      return ok({
        ...common, kind: 'box', type: 'box', variant: null,
        at, width: size.width, height: size.height, pins, orient, value: valueOf(rest),
      });
    }
    case 'leaded': {
      const [from, to] = [words[1], words[2]];
      if (from === undefined || to === undefined) {
        return fail(`${kind.value.type} は端を 2 つ書きます (島の名前か x,y。例: ${kind.value.type} P1 P2)`);
      }
      for (const end of [from, to]) {
        const problem = end.includes(',') && parsePoint(end) === null ? pointProblem(end) : null;
        if (problem !== null) return fail(problem, end);
      }
      return ok({
        ...common, kind: 'leaded', type: kind.value.type, variant: kind.value.variant,
        ends: [from, to], value: valueOf(words.slice(3)),
      });
    }
  }
}

