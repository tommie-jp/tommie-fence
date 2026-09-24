import { describe, expect, test } from 'vitest';
import { fenceNames, isFenceOf } from './fenceNames.ts';

/** 52 の docs/08。短い綴りが正で、長い綴りは期限を切らない別名。 */
describe('fenceNames', () => {
  test('puts the short spelling first, whichever spelling it is asked with', () => {
    expect(fenceNames('bread')).toEqual(['bread', 'breadboard']);
    expect(fenceNames('breadboard')).toEqual(['bread', 'breadboard']);
    expect(fenceNames('perfboard')).toEqual(['perf', 'perfboard']);
  });

  test('gives a fence without an alias just its own name', () => {
    expect(fenceNames('circuit')).toEqual(['circuit']);
    expect(fenceNames('copper')).toEqual(['copper']);
  });
});

describe('isFenceOf', () => {
  test('reads the first word of the info string, in either spelling', () => {
    expect(isFenceOf('bread', 'bread')).toBe(true);
    expect(isFenceOf('  breadboard title=x ', 'bread')).toBe(true);
    expect(isFenceOf('perf', 'perfboard')).toBe(true);
  });

  test('does not take a longer word or another fence for it', () => {
    expect(isFenceOf('breadboards', 'bread')).toBe(false);
    expect(isFenceOf('perf', 'bread')).toBe(false);
    expect(isFenceOf('', 'bread')).toBe(false);
  });
});
