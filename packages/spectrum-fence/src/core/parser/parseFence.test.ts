import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

const messages = (source: string): readonly string[] => parseFence(source).errors.map((error) => error.message);

describe('parseFence — device:', () => {
  test('refuses a fence without device:, naming all five spellings', () => {
    const [said] = messages('title: x');
    expect(said).toBe('device: は ad2 / ad3 / tinysa / tinysa-ultra / generic のどれかを書きます (計算の仕方が変わります)');
  });

  test('refuses a device it does not know, pointing at the spelling', () => {
    const { errors, doc } = parseFence('device: ultra');
    expect(doc.device).toBeNull();
    expect(errors[0]).toMatchObject({ line: 1, token: 'ultra' });
    expect(errors[0]?.message).toContain('tinysa-ultra');
  });

  test('reads each of the five devices', () => {
    for (const name of ['ad2', 'ad3', 'tinysa', 'tinysa-ultra', 'generic']) {
      const { doc, errors } = parseFence(`device: ${name}`);
      expect(doc.device).toBe(name);
      expect(errors).toEqual([]);
    }
  });

  test('says an empty fence is empty, and what to write first', () => {
    expect(messages('')[0]).toContain('device: は ad2');
  });
});

describe('parseFence — keys', () => {
  test('names the keys it takes when a key is unknown', () => {
    expect(messages('device: ad2\nfoo: 1')[0]).toMatch(/^知らないキーです: foo \(書けるのは device \/ title/);
  });

  test('refuses the same key twice', () => {
    expect(messages('device: ad2\ntitle: a\ntitle: b')).toEqual(['title: が 2 つあります (1 つにまとめます)']);
  });

  test('keeps the title and the style', () => {
    const { doc } = parseFence('device: ad2\ntitle: 図1\nstyle: dark');
    expect(doc.title).toBe('図1');
    expect(doc.style.theme).toBe('dark');
  });

  test('refuses a fence that is not a map', () => {
    expect(messages('- a\n- b')[0]).toContain('キーと値');
  });
});
