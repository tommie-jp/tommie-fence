import { describe, expect, test } from 'vitest';
import { fenceError, notice } from '../errors.ts';
import { renderErrorBanner, renderErrorCard } from './errorHtml.ts';
import { errorLine, errorText } from './errorText.ts';

const withSource = { ...fenceError('知らない部品', 2, 'resistr'), text: '  R1: resistr a5', at: { column: 6, length: 7 } };

describe('errorLine', () => {
  test('puts the name of the tool in front, so the reader knows who is speaking', () => {
    expect(errorLine(fenceError('だめ', 4))).toBe('breadboard: 4 行目: だめ');
  });

  test('leaves the line out when the place cannot be pinned down', () => {
    expect(errorLine(fenceError('だめ', null))).toBe('breadboard: だめ');
  });
});

describe('errorText', () => {
  test('puts the line under the message and the mark under the spelling', () => {
    expect(errorText(withSource)).toBe(
      ['breadboard: 2 行目: 知らない部品', '      R1: resistr a5', '          ^^^^^^^'].join('\n'),
    );
  });
});

describe('renderErrorBanner', () => {
  test('says nothing when there is nothing to say', () => {
    expect(renderErrorBanner([])).toBe('');
  });

  test('wraps the line and the mark in a pre so the columns line up', () => {
    const html = renderErrorBanner([withSource]);

    expect(html).toContain('breadboard-errors');
    expect(html).toContain('<pre class="breadboard-error-source">');
    expect(html).toContain('^^^^^^^');
  });

  test('marks a notice so it can be read as weaker than what could not be read', () => {
    expect(renderErrorBanner([notice('お知らせ', 2)])).toContain('breadboard-notice');
    expect(renderErrorBanner([fenceError('だめ', 2)])).not.toContain('breadboard-notice');
  });

  test('escapes what came from the fence, since the preview does not sanitise', () => {
    const html = renderErrorBanner([{ ...fenceError('だめ', 1), text: '<script>alert(1)</script>' }]);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('sums up the rest instead of letting the banner outgrow the drawing', () => {
    const many = Array.from({ length: 12 }, (_, index) => fenceError(`だめ ${index}`, index + 1));

    expect(renderErrorBanner(many)).toContain('ほかに 4 件');
  });
});

describe('renderErrorCard', () => {
  test('says that the fence could not be read at all', () => {
    const html = renderErrorCard([fenceError('YAML の構文エラー', 3)]);

    expect(html).toContain('breadboard-error-card');
    expect(html).toContain('読めませんでした');
  });
});
