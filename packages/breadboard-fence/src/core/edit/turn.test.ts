import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import { flipPart, turnPart } from './turn.ts';

const LED = `board: half
points:
  vin: a5
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
  Q1: transistor h9(B) h10(C) h11(E) 2SC1815
  SW1: button @ e5
`;

const after = (source: string, result: ReturnType<typeof turnPart>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('turnPart', () => {
  test('swings the far lead a quarter turn around the anchor', () => {
    // a5 → a10 は右へ 5。時計回りに 90 度で下へ 5 (f5)。
    expect(after(LED, turnPart(LED, 'R1', 1))).toContain('R1: resistor a5 f5 330');
  });

  test('turns the other way when asked', () => {
    const flat = 'board: half\nparts:\n  R1: resistor f5 f10 330\n';

    expect(after(flat, turnPart(flat, 'R1', -1))).toContain('R1: resistor f5 a5 330');
  });

  test('leaves the anchor written exactly as it was', () => {
    // **名前で書かれた足を番地に直さない。** 直すと名前が外れ、あとで点を
    // 動かしても部品が付いてこなくなる。
    const named = LED.replace('resistor a5 a10', 'resistor vin a10');

    expect(after(named, turnPart(named, 'R1', 1))).toContain('R1: resistor vin f5 330');
  });

  test('does nothing for a full turn, rather than writing the same text back', () => {
    const result = turnPart(LED, 'R1', 4);

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('refuses a turn that would walk off the board', () => {
    // b12 → b13 は右へ 1。反時計回りに 90 度で上へ 1 → a12 は板の上にある。
    // 上端の行から上へ回すと外れる。
    const top = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';
    const result = turnPart(top, 'R1', -1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('板の外');
  });

  test('refuses to turn a part on a rail, whose row is its polarity', () => {
    const rail = 'board: half\nparts:\n  R1: resistor +t5 a5 330\n';

    expect(!turnPart(rail, 'R1', 1).ok).toBe(true);
  });

  test('says why a part with more than two leads cannot be turned', () => {
    // 向きを書く語が文法に無い。**黙って何もしない**のではなく、そう言う。
    const result = turnPart(LED, 'Q1', 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('2 本足');
  });

  test('says the same for a part placed by one anchor', () => {
    expect(!turnPart(LED, 'SW1', 1).ok).toBe(true);
  });
});

describe('flipPart', () => {
  test('swaps the two leads, which is what a flip is', () => {
    expect(after(LED, flipPart(LED, 'R1'))).toContain('R1: resistor a10 a5 330');
  });

  test('carries the polarity tags along, spelling and all', () => {
    // `(A)` と `(K)` は綴りごと入れ替わる (向きが変わるのだから当然)。
    expect(after(LED, flipPart(LED, 'D1'))).toContain('D1: led b13(K) b12(A) red');
  });

  test('keeps a name written by points:, instead of spelling out the address', () => {
    const named = LED.replace('resistor a5 a10', 'resistor vin a10');

    expect(after(named, flipPart(named, 'R1'))).toContain('R1: resistor a10 vin 330');
  });

  test('says the polarity changed, since a different lead now sits in each hole', () => {
    // 穴どうしのつながりは同じだが、**どちらの足がどちらの穴か**は入れ替わる。
    // 極性のある部品ではそこが意味を持つので、黙らせない。
    const result = flipPart(LED, 'R1');

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });

  test('says why a part with more than two leads cannot be flipped', () => {
    expect(!flipPart(LED, 'Q1').ok).toBe(true);
  });
});
