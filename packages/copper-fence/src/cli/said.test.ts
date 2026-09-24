import { describe, expect, test } from 'vitest';
import { renderCopper } from '../core/index.ts';
import { saidOf } from './said.ts';

/** C1 がどの銅にも乗っていない板。 */
const LOOSE = ['board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3', 'parts:', '  C1: capacitor/1608 20,2 10p'].join('\n');

const messagesOf = (source: string): string[] => saidOf(renderCopper(source)).map((said) => said.message);

describe('saidOf', () => {
  test('says the ERC, which the core returns apart from the notices', () => {
    const result = renderCopper(LOOSE);

    expect(result.erc.length).toBeGreaterThan(0);
    expect(saidOf(result)).toEqual([...result.notices, ...result.erc]);
    expect(messagesOf(LOOSE).join('\n')).toMatch(/C1 の 1 番の足 .* の下に銅がありません/);
  });

  test('puts what could not be read ahead of everything else', () => {
    const result = renderCopper(`${LOOSE}\nwires:\n  - L1 -- zz`);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(saidOf(result).slice(0, result.errors.length)).toEqual(result.errors);
  });

  test('says no ERC for a figure that turns the check off', () => {
    expect(messagesOf(`${LOOSE}\nstyle:\n  check: off`).join('\n')).not.toMatch(/銅がありません/);
  });
});
