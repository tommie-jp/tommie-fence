import { describe, expect, test } from 'vitest';
import { renderPerfboard } from '../core/index.ts';
import { saidOf } from './said.ts';

/** R2 の片足 (e7) と R1 の片足 (c7) がどこにもつながっていない板。 */
const LOOSE = [
  'board: 12x8',
  'parts:',
  '  R1: resistor c3 c7 10k',
  '  R2: resistor e3 e7 10k',
  'wires:',
  '  - c3 -- e3',
].join('\n');

const messagesOf = (source: string): string[] => saidOf(renderPerfboard(source)).map((said) => said.message);

describe('saidOf', () => {
  test('says the ERC, which the core returns apart from the notices', () => {
    const result = renderPerfboard(LOOSE);

    expect(result.erc.length).toBeGreaterThan(0);
    expect(saidOf(result)).toEqual([...result.notices, ...result.erc]);
    expect(messagesOf(LOOSE).join('\n')).toMatch(/R1 の 1 本の足がどこにもつながっていません/);
  });

  test('puts what could not be read ahead of everything else', () => {
    const result = renderPerfboard(`${LOOSE}\n  - c3 -- zz`);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(saidOf(result).slice(0, result.errors.length)).toEqual(result.errors);
  });

  test('says no ERC for a figure that turns the check off', () => {
    const quiet = messagesOf(`${LOOSE}\nstyle:\n  check: off`);

    expect(quiet.join('\n')).not.toMatch(/つながっていません/);
  });
});
