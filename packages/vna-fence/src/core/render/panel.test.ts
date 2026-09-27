import { describe, expect, test } from 'vitest';
import { renderVna } from '../index.ts';

const fence = (lines: readonly string[]): string => lines.join('\n');

describe('marker numbers at the ends of the sweep', () => {
  /** 枠の中の番号の字 (`>1<`) の text 要素。 */
  const numbers = (svg: string, label: string): readonly string[] =>
    svg.match(new RegExp(`<text[^>]*>${label}</text>`, 'g')) ?? [];
  const THRU = fence(['sweep: 1M-300M 101', 'dut: series R 0', 'traces:', '  - S21 logmag', 'markers:', '  - 1M', '  - 150M', '  - 300M']);

  test('a marker on the first point writes its number to the right (inside the frame)', () => {
    const [first] = numbers(renderVna(THRU).svg, '1');
    expect(first).toContain('text-anchor="start"');
  });

  test('a marker on the last point writes its number to the left', () => {
    const [last] = numbers(renderVna(THRU).svg, '3');
    expect(last).toContain('text-anchor="end"');
  });

  test('a marker in the middle keeps its number centred', () => {
    const [middle] = numbers(renderVna(THRU).svg, '2');
    expect(middle).toContain('text-anchor="middle"');
  });
});
