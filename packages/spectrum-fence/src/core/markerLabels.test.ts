import { describe, expect, test } from 'vitest';
import { renderSpectrum } from './index.ts';
import { parseFence } from './parser/parseFence.ts';

/**
 * マーカーの名札 (`- 7.26M: 字`)。読み値の表に名札の欄、画面にはマーカーの点の隣に注釈の色で。
 * 名札の無い図は今までと 1 字も変わらない。
 */
const SHORTWAVE = [
  'device: tinysa-ultra',
  'sweep: 7.0M-7.5M 450',
  'rbw: 3kHz',
  'lna: on',
  'ref: -60dBm',
  'signal:',
  '  - sine 7.26MHz -71dBm',
  '  - sine 7.325MHz -81dBm',
  '  - sine 7.41MHz -76dBm',
].join('\n');

const withMarkers = (...items: readonly string[]): string => `${SHORTWAVE}\nmarkers:\n${items.map((item) => `  - ${item}`).join('\n')}`;

const messages = (source: string): readonly string[] => parseFence(source).errors.map((error) => error.message);

describe('markers: — labels (parser)', () => {
  test('reads a label after a colon, and leaves bare markers as they were', () => {
    const { doc, errors } = parseFence(withMarkers('7.26M: 強い短波放送の例', '7.325M', 'peak: いちばん高い線'));
    expect(errors).toEqual([]);
    expect(doc.markers).toEqual([
      { kind: 'f', f: 7.26e6, line: 11, label: '強い短波放送の例' },
      { kind: 'f', f: 7.325e6, line: 12 },
      { kind: 'peak', line: 13, label: 'いちばん高い線' },
    ]);
  });

  test('keeps the flow form unchanged', () => {
    const { doc, errors } = parseFence(`${SHORTWAVE}\nmarkers: [7.26M, 7.1M]`);
    expect(errors).toEqual([]);
    expect(doc.markers).toEqual([{ kind: 'f', f: 7.26e6, line: 10 }, { kind: 'f', f: 7.1e6, line: 10 }]);
  });

  test('refuses an empty label, saying how to write it', () => {
    const said = messages(withMarkers('7.26M:'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('名札が空です');
    expect(said[0]).toContain('- 7.26M: 字');
    expect(parseFence(withMarkers('7.26M: ""')).doc.markers).toEqual([]);
  });

  test('drops invisible characters and clamps a long label to 24 characters', () => {
    const { doc } = parseFence(withMarkers('7.26M: 強い‮放送​', `7.325M: ${'あ'.repeat(30)}`));
    expect(doc.markers[0]).toMatchObject({ label: '強い放送' });
    expect(doc.markers[1]).toMatchObject({ label: `${'あ'.repeat(24)}…` });
  });

  test('still refuses a marker it cannot read, even with a label', () => {
    expect(messages(withMarkers('foo: 字'))[0]).toContain('peak で書きます');
    expect(messages(withMarkers('delta 1kHz: 字'))[0]).toContain('delta はまだ書けません');
  });
});

describe('markers: — labels (drawing)', () => {
  test('draws no label column and no label without labels (the same output as before)', () => {
    const bare = renderSpectrum(withMarkers('7.26M', '7.325M'));
    expect(bare.readings.rows[0]).toEqual(['M', '周波数', 'レベル']);
    expect(bare.svg).not.toContain('data-marker-label');
  });

  test('adds a label column to the readings and the CLI lines, and draws the label in the note colour', () => {
    const result = renderSpectrum(withMarkers('7.26M: 強い短波放送の例', '7.325M', '7.1M: 局の無い所'));
    expect(result.errors).toEqual([]);
    expect(result.readings.rows[0]).toEqual(['M', '周波数', 'レベル', '名札']);
    expect(result.readings.rows[1]?.[3]).toBe('強い短波放送の例');
    expect(result.readings.rows[2]?.[3]).toBe('');
    expect(result.readingLines.some((line) => line.includes('強い短波放送の例'))).toBe(true);
    expect(result.readingLines.every((line) => line === line.trimEnd())).toBe(true);
    const labels = [...result.svg.matchAll(/<text\b[^>]*data-marker-label="(\d)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[1], m[2]]);
    expect(labels).toEqual([['1', '強い短波放送の例'], ['3', '局の無い所']]);
    expect(result.svg).toMatch(/data-marker-label="1"[^>]*fill="#c0392b"|fill="#c0392b"[^>]*data-marker-label="1"/);
  });

  test('escapes the label', () => {
    const result = renderSpectrum(withMarkers('7.26M: "<b>強い</b> & 弱い"'));
    expect(result.svg).not.toContain('<b>');
    expect(result.svg).toContain('&lt;b&gt;強い&lt;/b&gt; &amp; 弱い');
  });

  test('names the label column in English with lang: en', () => {
    const result = renderSpectrum(`${withMarkers('7.26M: strong')}\nlang: en`);
    expect(result.readings.rows[0]).toEqual(['M', 'Frequency', 'Level', 'Label']);
  });

  test('never drops a crowded label: draws it anyway and says so', () => {
    const crowded = renderSpectrum([
      'device: tinysa-ultra', 'sweep: 7.0M-7.5M 450', 'rbw: 3kHz', 'ref: -60dBm', 'signal: sine 7.26MHz -71dBm',
      'markers:',
      `  - 7.26M: ${'長'.repeat(24)}`,
      `  - 7.261M: ${'長'.repeat(24)}`,
      `  - 7.262M: ${'長'.repeat(24)}`,
      `  - 7.263M: ${'長'.repeat(24)}`,
    ].join('\n'));
    expect(crowded.errors).toEqual([]);
    expect([...crowded.svg.matchAll(/data-marker-label=/g)]).toHaveLength(4);
    const said = crowded.notices.map((notice) => notice.message).filter((message) => message.includes('置く空きが無く'));
    expect(said.length).toBeGreaterThan(0);
    expect(said[0]).toMatch(/^マーカー \d の名札「/);
  });
});
