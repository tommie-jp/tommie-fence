import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

/**
 * Si5351A のクロック発生器のモジュール 2 種。1 列 7 本の Adafruit 2045 (と紫の互換基板) は `sip7`、
 * DIP8 形の秋月 AE-Si5351A-B は `dip8` に型番を添える。配線はピンの名前で指す。
 */
const fence = (...lines: string[]): string => ['title: t', ...lines, ''].join('\n');
const messages = (result: { readonly errors: readonly { message: string }[]; readonly notices: readonly { message: string }[] }): string =>
  [...result.errors, ...result.notices].map((one) => one.message).join('\n');
const refsOf = (...lines: string[]): string[] => renderBreadboard(fence(...lines)).netlist.flatMap((net) => net.refs);

describe('Si5351A のモジュール', () => {
  test('names the seven pins of the breakout from the left: 0 1 2 SCL SDA GND VIN', () => {
    const result = renderBreadboard(fence(
      'parts:', '  U1: sip7 @ a5 ADAFRUIT-2045', '  R1: resistor e5 e20 1k',
      'wires:', '  - U1.CLK0 -- c25', '  - U1.SCL -- c21', '  - U1.SDA -- c22', '  - U1.GND -- -t8', '  - U1.VIN -- +t11',
    ));

    expect(messages(result)).toBe('');
    // 1 番 (a5 の列) が CLK0 — 同じ列の e5 に挿した R1 の 1 番とつながる。
    expect(result.netlist.find((net) => net.refs.includes('U1.CLK0'))?.refs).toContain('R1.1');
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['U1.CLK0', 'U1.SCL', 'U1.SDA', 'U1.GND', 'U1.VIN']));
  });

  test('reads the purple clone by its own name, with the same pins', () => {
    expect(refsOf('parts:', '  U1: sip7 @ a5 CJMCU-5351')).toEqual(refsOf('parts:', '  U1: sip7 @ a5 ADAFRUIT-2045'));
  });

  test('places the Akizuki module as a DIP-8 with its own names', () => {
    const refs = refsOf(
      'parts:', '  U1: dip8 @ e5 AE-Si5351A-B',
      'wires:', '  - U1.VDDO -- +t3', '  - U1.VDD -- +t5', '  - U1.GND -- -t8', '  - U1.CLK0 -- h20',
    );

    expect(refs).toEqual(expect.arrayContaining(['U1.VDDO', 'U1.VDD', 'U1.GND', 'U1.CLK0']));
  });
});
