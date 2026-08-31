import { describe, expect, test } from 'vitest';
import { parseNoteLine } from './notes.ts';

const noteOf = (head: string, text: string | null = null) => {
  const result = parseNoteLine(head, text, 3);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const errorOf = (head: string, text: string | null = null) => {
  const result = parseNoteLine(head, text, 3);
  if (result.ok) throw new Error('読めてしまった');
  return result.error;
};

describe('parseNoteLine', () => {
  test('reads a circle drawn around a part', () => {
    expect(noteOf('circle R1')).toMatchObject({ kind: 'circle', targets: ['R1'], color: 'red' });
  });

  test('reads a circle drawn around a hole', () => {
    expect(noteOf('circle a5')).toMatchObject({ kind: 'circle', targets: ['a5'] });
  });

  test('reads a box drawn across two holes', () => {
    expect(noteOf('box a5 e12')).toMatchObject({ kind: 'box', targets: ['a5', 'e12'], solid: false });
  });

  test('reads the solid word that turns the dashed box into a drawn one', () => {
    expect(noteOf('box a5 e12 solid')).toMatchObject({ solid: true });
  });

  test('reads an arrow and a line between two targets', () => {
    expect(noteOf('arrow a5 R1')).toMatchObject({ kind: 'arrow', targets: ['a5', 'R1'] });
    expect(noteOf('line +t1 +t30')).toMatchObject({ kind: 'line', targets: ['+t1', '+t30'] });
  });

  test('reads text as a target plus the words, with the string on the value side', () => {
    expect(noteOf('text a5 blue large', 'ここで分圧する')).toMatchObject({
      kind: 'text',
      targets: ['a5'],
      color: 'blue',
      size: 'large',
      text: 'ここで分圧する',
    });
  });

  test('reads the words in any order', () => {
    expect(noteOf('text a5 large blue bold right', 'x')).toMatchObject({
      color: 'blue', size: 'large', align: 'right', bold: true,
    });
  });

  test('reads source, which writes the fence itself onto the drawing', () => {
    expect(noteOf('source a5 tiny tight')).toMatchObject({
      kind: 'source', targets: ['a5'], size: 'tiny', leading: 'tight',
    });
  });

  test('leaves the colour of text alone so it follows the drawing', () => {
    // 印は赤が既定だが、字は図の文字色に従わせる (注釈だと分かる必要が無いため)。
    expect(noteOf('text a5', 'x').color).toBeNull();
    expect(noteOf('circle R1').color).toBe('red');
  });

  test('reports a kind it does not know', () => {
    expect(errorOf('underline R1').message).toContain('circle');
  });

  test('reports the wrong number of targets', () => {
    expect(errorOf('box a5').message).toContain('2');
    expect(errorOf('circle R1 R2').message).toContain('1');
  });

  test('reports a word written twice, instead of quietly taking the last', () => {
    expect(errorOf('text a5 red blue', 'x').message).toContain('色');
  });

  test('reports a word the kind cannot take', () => {
    // 指し棒に大きさは無い。黙って捨てると、書いた人には何も伝わらない。
    expect(errorOf('arrow a5 R1 large').message).toContain('large');
    // 行送りは source だけ。
    expect(errorOf('text a5 tight', 'x').message).toContain('tight');
  });

  test('reports a word it does not know at all', () => {
    expect(errorOf('circle R1 crimson').message).toContain('crimson');
  });

  test('reports text written without the string', () => {
    expect(errorOf('text a5').message).toContain('text');
  });

  test('reports a string given to a kind that draws no text', () => {
    expect(errorOf('circle R1', 'ここ').message).toContain('circle');
  });

  test('reports a target that is neither a hole nor an id', () => {
    expect(errorOf('circle a5!').message).toContain('指し先');
  });

  test('cuts a text that is longer than the limit, instead of dropping it', () => {
    const long = 'あ'.repeat(80);

    expect([...(noteOf('text a5', long).text ?? '')].length).toBeLessThanOrEqual(61);
  });
});
