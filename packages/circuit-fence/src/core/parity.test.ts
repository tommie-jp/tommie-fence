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
      'zener', 'schottky', 'photodiode', 'varicap', 'diac', 'reed', 'fuse', 'lamp', 'sma',
      'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc', 'button', 'button-nc',
      'potentiometer', 'thyristor', 'triac', 'slide-switch', 'regulator', 'transformer',
      'dip4', 'dip6', 'dip8', 'dip14', 'dip16', 'dip18', 'dip20', 'dip24', 'dip28', 'dip40',
      'sip2', 'sip3', 'sip4', 'sip5', 'sip6', 'sip8', 'sip10', 'sip20', 'sip40',
      ...boardPartNames(),
    ];

    expect(onBoards.filter((type) => !known.has(type))).toEqual([]);
  });

  test('names the schematic-only parts, so the list stays a decision and not an oversight', () => {
    // **回路図にあって板に無い種類。** どれも回路図の記法であって実物ではない
    // — 置き場が無いので板には足さない (52 の docs/21 の決め 1)。
    // 種類を足したらここが落ちる。落ちたら**物か記法か**を決めてから直す。
    const onBoards = new Set([
      'resistor', 'capacitor', 'led', 'diode', 'inductor', 'crystal', 'buzzer',
      'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
      'zener', 'schottky', 'photodiode', 'varicap', 'diac', 'reed', 'fuse', 'lamp', 'sma',
      'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc', 'button', 'button-nc',
      'potentiometer', 'thyristor', 'triac', 'slide-switch', 'regulator', 'transformer',
      'ecap', 'dip4', 'dip6', 'dip8', 'dip14', 'dip16', 'dip18', 'dip20', 'dip24', 'dip28', 'dip40',
      'sip2', 'sip3', 'sip4', 'sip5', 'sip6', 'sip8', 'sip10', 'sip20', 'sip40',
      ...boardPartNames(),
    ]);

    // **並びは表のまま** (`parts.ts` に書いた順)。並べ替えて読みやすくすると、
    // 表のどこを見ればよいかが分からなくなる。
    expect(partTypeNames().filter((type) => !onBoards.has(type))).toEqual([
      // 可変抵抗はポテンショメータを 2 本足で使う書き方。物としては同じ。
      'resistor-var',
      // 電源。実物は電池か機器 (`device`) で、記号のほうは「そこに何かが要る」印。
      'vsource', 'sine', 'square', 'triangle', 'isource',
      // 計器。回路に挿す物ではなく、当てて測る物。
      'ammeter', 'voltmeter', 'ohmmeter', 'wattmeter', 'galvanometer', 'detector',
      // 記法。図の上の印であって、挿す物が無い。
      'short', 'port', 'ground', 'vcc', 'vee',
      // 個別半導体。板は総称の `transistor` 1 つで持ち、姿 (TO-92 / TO-220) で分ける。
      'npn', 'pnp', 'nmos', 'pmos', 'njfet', 'pjfet',
      'nmos-e', 'pmos-e', 'nmos-d', 'pmos-d',
      // 中身が IC のもの。板では `dipN` に化ける。
      'opamp',
      'nigbt', 'pigbt',
      // 切り替えスイッチ。物としてはスライドスイッチと同じ。
      'spdt',
      'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buffer',
    ]);
  });

  test('leaves out the one the boards call by a name the schematic cannot choose', () => {
    // 板の `transistor` は総称。回路図は npn / pnp / FET を選ぶもので、
    // 総称の記号が無い — 別名にすると「置いたら勝手に npn になった」ことになる。
    expect(known.has('transistor')).toBe(false);
    expect(known.has('npn')).toBe(true);
  });
});
