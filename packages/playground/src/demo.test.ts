import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_TITLE, nudge, nudgesFor } from './demo.ts';
import { fencesIn } from './document.ts';
import { KINDS } from './kinds.ts';
import type { Kind } from './kinds.ts';

/**
 * **同じ回路 (LED と抵抗) を描いた種類。** copper は銅張り基板 (RF の治具) の図で、
 * LED と抵抗の例を持たないので釦も無い。
 */
type DemoKind = Exclude<Kind, 'copper' | 'vna'>;
const DEMO_KINDS = KINDS.filter((kind): kind is DemoKind => kind !== 'copper' && kind !== 'vna');

const one = { label: '抵抗を 1k に', find: 'a5 a10 330', replace: 'a5 a10 1k', said: '変えた' };

describe('nudge', () => {
  test('1 か所だけ書き換えて返す', () => {
    // Arrange
    const source = 'parts:\n  R1: resistor a5 a10 330\n';

    // Act
    const next = nudge(source, one);

    // Assert
    expect(next).toBe('parts:\n  R1: resistor a5 a10 1k\n');
  });

  /** もう押した後・手で直した後。**押しても何も起きない釦を出さない**ため。 */
  test('見つからなければ null (釦を出さない印)', () => {
    expect(nudge('parts:\n  R1: resistor a5 a10 1k\n', one)).toBeNull();
  });

  /** どちらを替えるべきか決められないので、触らない。 */
  test('2 か所以上あれば null', () => {
    expect(nudge('a5 a10 330\na5 a10 330\n', one)).toBeNull();
  });

  test('元の字は変えない (新しい字を返すだけ)', () => {
    const source = 'R1: resistor a5 a10 330\n';

    nudge(source, one);

    expect(source).toBe('R1: resistor a5 a10 330\n');
  });
});

describe('nudgesFor', () => {
  test('デモの例にだけ釦を返す', () => {
    expect(nudgesFor('breadboard', DEMO_TITLE).length).toBeGreaterThan(0);
    expect(nudgesFor('breadboard', '図02 テーマ')).toEqual([]);
  });

  test('LED と抵抗の例を持つ 3 つには釦があり、copper には無い', () => {
    for (const kind of DEMO_KINDS) expect(nudgesFor(kind, DEMO_TITLE).length).toBe(2);
    expect(nudgesFor('copper', DEMO_TITLE)).toEqual([]);
    expect(nudgesFor('vna', DEMO_TITLE)).toEqual([]);
  });
});

/**
 * **釦が例に当たり続けるかを見張る。** 釦は例の本文の断片を探すので、
 * 例を直すと黙って死ぬ (押せない釦が消えるだけで、誰も気づかない)。
 * 例の本文をここで読んで、どの釦もちょうど 1 か所に当たることを確かめる。
 */
describe('釦とデモの例', () => {
  const EXAMPLES: Record<DemoKind, string> = {
    circuit: 'circuit-fence/examples/00-led.md',
    breadboard: 'breadboard-fence/examples/01-led.md',
    perfboard: 'perfboard-fence/examples/00-led.md',
  };

  /** **頁と同じ数え方で取り出す** (`fencesIn`)。別々に数えると食い違う。 */
  const fenceOf = (kind: DemoKind): string => {
    const body = readFileSync(join(import.meta.dirname, '../..', EXAMPLES[kind]), 'utf8');
    const found = fencesIn(body)[0];
    if (found === undefined) throw new Error(`${EXAMPLES[kind]} にフェンスがありません`);
    return found.source;
  };

  for (const kind of DEMO_KINDS) {
    test(`${kind} の例は「${DEMO_TITLE}」で、どの釦も 1 か所に当たる`, () => {
      const source = fenceOf(kind);

      expect(source).toContain(`title: ${DEMO_TITLE}`);
      for (const button of nudgesFor(kind, DEMO_TITLE)) {
        expect(nudge(source, button), `${kind}: ${button.label}`).not.toBeNull();
      }
    });
  }
});
