import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin } from './parts.ts';

/**
 * フォトトランジスタ (52 の docs/66 の段 6)。**B を持たない 2 本足** —
 * 砲弾型の実物は 2 本足で、記号も光の矢を受けてベースの線が無い形
 * (circuitikz 1.0 の `npn, photo, nobase`。フェンス側の TeX で確かめた)。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

describe('フォトトランジスタ', () => {
  test('has a collector and an emitter but no base', () => {
    const type = lookupPartType('phototransistor')!;

    expect(lookupPin(type, 'C')).toBe('collector');
    expect(lookupPin(type, 'e')).toBe('emitter');
    expect(lookupPin(type, 'B')).toBeNull();
    expect(PART_NAMES.phototransistor).toBe('フォトトランジスタ');
    expect(PART_PREFIXES.phototransistor).toBe('Q');
  });

  test('draws the npn with light arrows and without the base lead', () => {
    const result = compileCircuit(circuit('parts:', '  Q1: phototransistor c3'));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('\\node[npn, photo, nobase] (part-Q1) at (c3)');
  });

  test('keeps the name off the side the light arrows come from', () => {
    // 足の無い左の辺は空いて見えるが、光の矢が出ている。名札は右へ。
    const upright = compileCircuit(circuit('parts:', '  Q1: phototransistor c3')).tex;
    const turned = compileCircuit(circuit('parts:', '  Q1: phototransistor c3 r90')).tex;

    expect(upright).toContain('\\node[anchor=west] at (part-Q1.east) {$Q_{1}$}');
    // 回すと矢は上から来る (左 → 上)。足は左右なので、名札は下へ。
    expect(turned).not.toMatch(/anchor=south\] at \(part-Q1\.[a-z]+\) \{\$Q_\{1\}\$\}/);
  });

  test('asks for both legs when neither is wired', () => {
    const result = compileCircuit(circuit(
      'parts:', '  Q1: phototransistor c3', '  R1: resistor a1 a3 1k', 'wires:', '  - a1 -- a3',
    ), { erc: true });

    expect(result.erc.map((one) => one.message).join('\n')).toContain('Q1 の足 C、E をどの配線も指していません');
  });
});
