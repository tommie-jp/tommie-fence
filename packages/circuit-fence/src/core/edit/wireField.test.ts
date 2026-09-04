import { describe, expect, test } from 'vitest';
import { WIRE_KINDS, setWireField, wireFields } from './wireField.ts';

/**
 * 配線の欄。**直せるのは折れ方だけ** — 掴んで引き直さなくても `--` / `-|` / `|-`
 * を選べるようにした回 (実機で頼まれた)。
 */
const SOURCE = [
  'parts:',
  '  R1: resistor a1 a3',
  'wires:',
  '  - a3 -| c5',
  '  - c5 -- e5',
  '',
].join('\n');

describe('wireFields', () => {
  test('shows the fold that is written, so the form opens on the real value', () => {
    expect(wireFields(SOURCE, 'wire:4')).toMatchObject({ type: '-|', can: ['type'] });
    expect(wireFields(SOURCE, 'wire:5')).toMatchObject({ type: '--' });
  });

  test('offers the three folds the grammar writes', () => {
    expect(wireFields(SOURCE, 'wire:4')?.kinds).toEqual(['--', '-|', '|-']);
    expect(WIRE_KINDS).toEqual(['--', '-|', '|-']);
  });

  test('says nothing for a line that holds no wire', () => {
    expect(wireFields(SOURCE, 'wire:2')).toBeNull();
  });
});

describe('setWireField', () => {
  const kind = (handle: string, text: string) => setWireField(SOURCE, handle, 'type', text);

  test('swaps the fold in place, leaving the two ends where they were written', () => {
    const result = kind('wire:4', '|-');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edits).toEqual([{ line: 4, column: 7, length: 2, text: '|-' }]);
  });

  test('changes nothing when the fold is already the one asked for', () => {
    const result = kind('wire:5', '--');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edits).toEqual([]);
  });

  test('keeps the net as it was, since a fold does not change what is joined', () => {
    const result = kind('wire:4', '--');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff).toEqual({ lost: [], gained: [] });
  });

  test('refuses a fold the grammar cannot write, and says what it can', () => {
    const result = kind('wire:4', '~~');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('|-');
    expect(result.error.line).toBe(4);
  });

  test('refuses any other field, since a circuit wire carries no colour', () => {
    const result = setWireField(SOURCE, 'wire:4', 'color', 'red');

    expect(result.ok).toBe(false);
  });
});
