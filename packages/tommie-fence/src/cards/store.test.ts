import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCardStore } from './store.ts';

/** ワークスペースの部品カードの控え (52 の docs/158 の 3-1)。 */

const CARD = (model: string) => `models: [${model}]\npackage: dip8\nrole: r\npins: [1A, 1B, 1Y, GND, 2Y, 2A, 2B, VCC]\nsource: s\n`;

let root = '';
let parts = '';
let document = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cards-store-'));
  parts = join(root, '.tommie-fence', 'parts');
  mkdirSync(parts, { recursive: true });
  mkdirSync(join(root, 'docs'));
  document = join(root, 'docs', 'a.md');
  writeFileSync(document, '');
  writeFileSync(join(parts, 'a.part.yaml'), CARD('XA1'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('createCardStore', () => {
  test('finds the cards of the document and keeps them until cleared', () => {
    const store = createCardStore({ stopFor: () => root, enabled: () => true });
    expect(store.tableFor(document)?.pinouts.map((row) => row.models[0])).toEqual(['XA1']);
    writeFileSync(join(parts, 'b.part.yaml'), CARD('XB1'));
    expect(store.tableFor(document)?.pinouts).toHaveLength(1);
    store.clear();
    expect(store.tableFor(document)?.pinouts).toHaveLength(2);
  });

  test('returns the same table object while nothing changes (the parser memo keys on it)', () => {
    const store = createCardStore({ stopFor: () => root, enabled: () => true });
    expect(store.tableFor(document)).toBe(store.tableFor(document));
  });

  test('reads nothing in an untrusted workspace', () => {
    expect(createCardStore({ stopFor: () => root, enabled: () => false }).tableFor(document)).toBeUndefined();
  });

  test('reads nothing outside a workspace folder', () => {
    expect(createCardStore({ stopFor: () => null, enabled: () => true }).tableFor(document)).toBeUndefined();
  });
});
