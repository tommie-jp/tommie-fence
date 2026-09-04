import { describe, expect, test } from 'vitest';
import { boardPartNames } from 'fence-kit';
import { partTypeNames } from './parts.ts';

/**
 * 3 つのフェンスの部品表を突き合わせる (52 の docs/21 の手順 8)。
 *
 * **揃えるのは実物として在る部品だけ。** `ground` や論理ゲートは回路図の
 * 記法であって物ではないので、実体配線図には置き場が無い。
 */
describe('実体配線図と同じ綴りで書けること', () => {
  const known = new Set(partTypeNames());

  test('has every part the boards can place, so the same circuit can be drawn either way', () => {
    // **板の 2 つが置ける物**。片方に足したらこちらが落ちる。
    const onBoards = [
      'resistor', 'capacitor', 'led', 'diode', 'inductor', 'crystal', 'buzzer',
      'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
      'zener', 'schottky', 'photodiode', 'fuse', 'lamp', 'sma',
      'potentiometer', 'thyristor', 'triac', 'slide-switch', 'regulator',
      'dip4', 'dip6', 'dip8', 'dip14', 'dip16', 'dip18', 'dip20', 'dip24', 'dip28', 'dip40',
      'sip2', 'sip3', 'sip4', 'sip5', 'sip6', 'sip8', 'sip10', 'sip20', 'sip40',
      ...boardPartNames(),
    ];

    expect(onBoards.filter((type) => !known.has(type))).toEqual([]);
  });

  test('leaves out the one the boards call by a name the schematic cannot choose', () => {
    // 板の `transistor` は総称。回路図は npn / pnp / FET を選ぶもので、
    // 総称の記号が無い — 別名にすると「置いたら勝手に npn になった」ことになる。
    expect(known.has('transistor')).toBe(false);
    expect(known.has('npn')).toBe(true);
  });
});
