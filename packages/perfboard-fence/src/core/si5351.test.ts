import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * Si5351A のクロック発生器のモジュール 2 種。1 列 7 本の Adafruit 2045 (と紫の互換基板) は `sip7`、
 * DIP8 形の秋月 AE-Si5351A-B は `dip8` に型番を添える。配線はピンの名前で指す。
 */
const fence = (...lines: string[]): string => ['board: 24x12', 'style:', '  check: off', ...lines, ''].join('\n');
const refsOf = (...lines: string[]): string[] => renderPerfboard(fence(...lines)).netlist.flatMap((net) => net.refs);

describe('Si5351A のモジュール', () => {
  test('names the seven pins of the breakout from the left: 0 1 2 SCL SDA GND VIN', () => {
    // 配線は穴で書く (この基板の流儀)。1 番 (c5) が CLK0、7 番 (c11) が VIN。
    const result = renderPerfboard(fence(
      'parts:', '  U1: sip7 c5 ADAFRUIT-2045', '  R1: resistor f5 f9 1k', '  R2: resistor f11 f15 1k',
      'wires:', '  - c5 -- f5', '  - c11 -- f11',
    ));

    expect(result.errors).toEqual([]);
    const netOf = (ref: string): readonly string[] => result.netlist.find((net) => net.refs.includes(ref))?.refs ?? [];
    expect(netOf('U1.CLK0')).toContain('R1.1');
    expect(netOf('U1.VIN')).toContain('R2.1');
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(
      expect.arrayContaining(['U1.CLK0', 'U1.CLK1', 'U1.CLK2', 'U1.SCL', 'U1.SDA', 'U1.GND', 'U1.VIN']),
    );
  });

  test('reads the purple clone by its own name, with the same pins', () => {
    expect(refsOf('parts:', '  U1: sip7 c5 CJMCU-5351')).toEqual(refsOf('parts:', '  U1: sip7 c5 ADAFRUIT-2045'));
  });

  test('places the Akizuki module as a DIP-8 with its own names', () => {
    expect(refsOf('parts:', '  U1: dip8 c5 AE-Si5351A-B')).toEqual(
      expect.arrayContaining(['U1.VDDO', 'U1.SCL', 'U1.SDA', 'U1.GND', 'U1.CLK0', 'U1.CLK1', 'U1.CLK2', 'U1.VDD']),
    );
  });
});
