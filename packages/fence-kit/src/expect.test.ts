import { describe, expect, test } from 'vitest';
import { applyExpectations, markInfo, readExpectations } from './expect.ts';
import type { Said } from './expect.ts';

const kit = {
  error: (message: string, line: number | null): Said => ({ message, line }),
  notice: (message: string, line: number | null): Said => ({ message, line, notice: true }),
};

const FENCE = [
  'title: 図01',
  'expect:',
  '  - match: 胴が重なって',
  '    why: ERC の見本としてわざと重ねた',
  '  # 注釈の行は飛ばす',
  "  - match: 'つながっていません'  # 行末の注釈",
  '    why: "配線を書き忘れた例 #1"',
  'parts:',
  '  R1: resistor b3 b7 10k',
].join('\n');

describe('readExpectations', () => {
  test('match と why の組を行つきで読む', () => {
    const read = readExpectations(FENCE);

    expect(read.problems).toEqual([]);
    expect(read.expectations).toEqual([
      { match: '胴が重なって', why: 'ERC の見本としてわざと重ねた', line: 3 },
      { match: 'つながっていません', why: '配線を書き忘れた例 #1', line: 6 },
    ]);
  });

  test('expect: が無ければ空', () => {
    expect(readExpectations('title: x\nparts:\n  R1: resistor a1 a5')).toEqual({ expectations: [], problems: [] });
  });

  test('why の無い項目は断る (理由の無い承知は黙らせるのと変わらない)', () => {
    const read = readExpectations('expect:\n  - match: 胴が重なって');

    expect(read.expectations).toEqual([]);
    expect(read.problems[0]?.message).toContain('why: がありません');
    expect(read.problems[0]?.line).toBe(2);
  });

  test('知らないキー・1 行の書き方・空の並びを断る', () => {
    expect(readExpectations('expect:\n  - match: a\n    because: b').problems[0]?.message).toContain('match と why だけ');
    expect(readExpectations('expect: 胴が重なって').problems[0]?.line).toBe(1);
    expect(readExpectations('expect:\ntitle: x').problems[0]?.message).toContain('1 つもありません');
  });
});

describe('applyExpectations', () => {
  const notices: Said[] = [
    { message: 'R1 と R2 の胴が重なっています', line: 9, notice: true },
    { message: 'R2 の 2 本のピンがどこにもつながっていません', line: 10, notice: true },
    { message: 'R3 のピンの間隔が狭すぎます', line: 11, notice: true },
  ];

  test('当たったお知らせに理由を付け、当たらないお知らせはそのまま', () => {
    const out = applyExpectations(FENCE, { errors: [], notices }, kit);

    expect(out.notices.map((one) => one.message)).toEqual([
      '[想定どおり: ERC の見本としてわざと重ねた] R1 と R2 の胴が重なっています',
      '[想定どおり: 配線を書き忘れた例 #1] R2 の 2 本のピンがどこにもつながっていません',
      'R3 のピンの間隔が狭すぎます',
    ]);
    expect(out.notices[0]?.expected).toBe('ERC の見本としてわざと重ねた');
    expect(out.notices[2]?.expected).toBeUndefined();
  });

  test('ERC の並びにも当てる', () => {
    const out = applyExpectations(FENCE, { errors: [], notices: [notices[0] as Said], erc: [notices[1] as Said] }, kit);

    expect(out.erc[0]?.expected).toBe('配線を書き忘れた例 #1');
  });

  test('当たらない expect: をお知らせで言う (行は offset だけずらす)', () => {
    const out = applyExpectations(FENCE, { errors: [], notices: [notices[0] as Said] }, kit, 100);

    const stale = out.notices.at(-1);
    expect(stale?.message).toBe('expect: の「つながっていません」に当たるお知らせが出ていません (直ったなら消します)');
    expect(stale?.line).toBe(106);
    expect(stale?.notice).toBe(true);
  });

  test('エラーには効かない', () => {
    const error: Said = { message: 'R1 と R2 の胴が重なって読めません', line: 9 };
    const out = applyExpectations(FENCE, { errors: [error], notices: [notices[1] as Said] }, kit);

    expect(out.errors).toEqual([error]);
    expect(out.notices.at(-1)?.message).toContain('当たるのはエラーです');
  });

  test('情報には当てない', () => {
    const info = markInfo<Said>({ message: 'T1: 胴が重なって 約 22 µH', line: 9, notice: true });
    const out = applyExpectations('expect:\n  - match: 胴が重なって\n    why: x', { errors: [], notices: [info] }, kit);

    expect(out.notices[0]?.message).toBe('[情報] T1: 胴が重なって 約 22 µH');
    expect(out.notices.at(-1)?.message).toContain('出ていません');
  });

  test('読めない expect: はエラーにする', () => {
    const out = applyExpectations('expect:\n  - match: a', { errors: [], notices: [] }, kit, 10);

    expect(out.errors[0]?.line).toBe(12);
  });
});
