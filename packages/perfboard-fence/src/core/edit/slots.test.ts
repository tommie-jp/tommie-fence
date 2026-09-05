import { describe, expect, test } from 'vitest';
import { createPerfboardEditor } from './fenceEditor.ts';

const SLOTS = 'board:\n  size: 12x7\n  slots: on\nparts:\n  R1: resistor c2 c6\n';
const PLAIN = 'board: 12x7\nparts:\n  R1: resistor c2 c6\n';
const cells = (src: string): string[] =>
  [...createPerfboardEditor().view(src, 1).map.matchAll(/class="cf-cell" data-address="([^"]+)"/g)].map((m) => m[1] ?? '');

describe('スロットの銅箔', () => {
  test('掴める升がスロットにも立つ (書いた板だけ)', () => {
    expect(cells(SLOTS)).toContain('a0');
    expect(cells(SLOTS)).toContain('a13');
    expect(cells(SLOTS)).toContain('g0');
    expect(cells(PLAIN)).not.toContain('a0');
  });

  test('配線はスロットへ引ける', () => {
    const editor = createPerfboardEditor();
    expect(editor.addWire(SLOTS, 'c2', 'a0', '--').ok).toBe(true);
    // 銅箔の無い板では今までどおり断る。
    expect(editor.addWire(PLAIN, 'c2', 'a0', '--').ok).toBe(false);
    // 板の外はどちらでも断る。
    expect(editor.addWire(SLOTS, 'c2', 'a99', '--').ok).toBe(false);
  });

  test('部品はスロットに挿さらない (穴が無い)', () => {
    const editor = createPerfboardEditor();
    const placed = editor.addPart(SLOTS, { id: 'R2', type: 'resistor', at: ['a0'] });

    expect(placed.ok).toBe(false);
  });
});
