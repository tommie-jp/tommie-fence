import { describe, expect, test } from 'vitest';
import { isMathLabel, mathInnerOf, mathLabelTex } from './mathLabel.ts';

const texOf = (inner: string): string => {
  const read = mathLabelTex(inner);
  if (!read.ok) throw new Error(`読めませんでした: ${read.message}`);
  return read.tex;
};

const messageOf = (inner: string): string => {
  const read = mathLabelTex(inner);
  if (read.ok) throw new Error(`読めてしまいました: ${read.tex}`);
  return read.message;
};

describe('$…$ で書いたラベル', () => {
  test('$ で囲んであるかを見分ける', () => {
    expect(isMathLabel('$E$')).toBe(true);
    expect(isMathLabel('RL')).toBe(false);
    expect(isMathLabel('$')).toBe(false);
    expect(mathInnerOf('$E$')).toBe('E');
  });

  test('英数字はそのまま組む', () => {
    expect(texOf('E')).toBe('E');
    expect(texOf('R2')).toBe('R2');
  });

  test('フェーザの点を組む', () => {
    expect(texOf('\\dot{E}')).toBe('\\dot{E}');
  });

  test('立体で 2 字以上の本体を組む', () => {
    expect(texOf('\\mathrm{SW}')).toBe('\\mathrm{SW}');
  });

  test('添字は 1 文字でも {…} で包んで組む (組み方を 1 通りにする)', () => {
    expect(texOf('R_1')).toBe('R_{1}');
    expect(texOf('v_C')).toBe('v_{C}');
    expect(texOf('R_{12}')).toBe('R_{12}');
  });

  test('点と添字、立体の添字を組み合わせられる', () => {
    expect(texOf('\\dot{Z}_L')).toBe('\\dot{Z}_{L}');
    expect(texOf('R_\\mathrm{L}')).toBe('R_{\\mathrm{L}}');
  });

  // 生の TeX を通すと、フォントの無い数式で**プロセスごと落ちる** (約束 3・6)。
  // 知らない綴りは書ける形を添えて返し、行番号つきのエラーにする。
  test('知らない命令は書ける形を添えて返す', () => {
    const message = messageOf('\\frac{1}{2}');

    expect(message).toContain('frac');
    expect(message).toContain('dot');
    expect(message).toContain('mathrm');
  });

  test('TeX の記法として読まれる字を通さない', () => {
    for (const inner of ['E^2', 'a&b', 'a#b', 'a~b', '\\\\']) {
      expect(mathLabelTex(inner).ok).toBe(false);
    }
  });

  test('括弧の釣り合いが取れていないものを通さない', () => {
    expect(messageOf('\\dot{E')).toContain('}');
    expect(messageOf('E}')).toContain('{');
  });

  test('中身の無いものを通さない', () => {
    expect(messageOf('')).toContain('中身');
    expect(messageOf('\\dot{}')).toContain('中身');
  });

  test('添字を付ける字が無いものを通さない', () => {
    expect(messageOf('_1')).toContain('添字');
  });

  // `x_1_2` は TeX が「添字が 2 つ」と言って止まる。読めたことにすると、
  // 図が描けずログも行番号に引き戻せない (この道具が避けたい落ち方そのもの)。
  test('添字を 2 つ続けたものを通さない', () => {
    expect(messageOf('R_1_2')).toContain('添字');
    expect(mathLabelTex('\\dot{E}_1_2').ok).toBe(false);
  });

  test('添字を分けて書いたものは通す', () => {
    expect(texOf('R_1S_2')).toBe('R_{1}S_{2}');
  });

  // `${}$` は TeX としては通るが、名前の無い部品が描かれる。
  // ID に落ちてもくれないので、読めなかったことにする。
  test('中身の無いまとまりを通さない', () => {
    expect(messageOf('{}')).toContain('中身');
    expect(messageOf('R_{}')).toContain('中身');
  });

  test('命令に {…} が無いものを通さない', () => {
    expect(messageOf('\\dot E')).toContain('{');
  });
});
