import { describe, expect, test } from 'vitest';
import { migrateOffer } from './migrate.ts';

/**
 * 旧い番地の綴り (`a1f5`) の文書を開いたときの「書き換える」釦 (52 の docs/126 の段 9)。
 * 共有リンクは旧い綴りのまま世に出ているので、開いた人が 1 操作で直せるようにする。
 */
describe('migrateOffer', () => {
  test('offers to rewrite the circuit fences of an old document, and says how many places', () => {
    const offer = migrateOffer('```circuit\nparts:\n  R1: resistor a1 a3\n```\n\n```bread\nparts:\n  R1: resistor a5 a10\n```\n');

    expect(offer?.label).toBe('番地を x,y に書き換える (2 か所)');
    expect(offer?.next).toBe('```circuit\nparts:\n  R1: resistor 1,1 3,1\n```\n\n```bread\nparts:\n  R1: resistor a5 a10\n```\n');
  });

  test('offers nothing for a document already in the new spelling', () => {
    expect(migrateOffer('```circuit\nparts:\n  R1: resistor 1,1 3,1\n```\n')).toBeNull();
    expect(migrateOffer('# 図の無い文書\n')).toBeNull();
  });
});
