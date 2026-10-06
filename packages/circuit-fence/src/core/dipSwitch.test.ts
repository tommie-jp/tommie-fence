import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gridMap } from './edit/map.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin } from './parts.ts';

/**
 * DIP スイッチ (`dip-switch4` / `dip-switch8`)。**ピンの名前と DIP の番号はブレッドボードとユニバーサル基板と
 * 同じ表** (fence-kit) — k 番のスイッチは `Ak` (k 番) と `Bk` (2n+1−k 番) の間の開いた接点。
 * 記号は開閉スイッチを連の数だけ並べた箱で、左に A、右に B。
 */

const circuit = (...lines: string[]): string => [...lines, ''].join('\n');

describe('表', () => {
  test('takes a leg by its name or by its DIP number, as the boards do', () => {
    const four = lookupPartType('dip-switch4')!;
    const eight = lookupPartType('dip-switch8')!;

    expect(lookupPin(four, 'A1')).toBe(lookupPin(four, '1'));
    expect(lookupPin(four, 'B1')).toBe(lookupPin(four, '8'));
    expect(lookupPin(four, 'b4')).toBe(lookupPin(four, '5'));
    expect(lookupPin(four, 'A5')).toBeNull();
    expect(lookupPin(eight, 'B1')).toBe(lookupPin(eight, '16'));
    expect(PART_NAMES['dip-switch4']).toBe('DIP スイッチ');
    expect(PART_PREFIXES['dip-switch8']).toBe('SW');
  });
});

describe('図とネットリスト', () => {
  test('declares a box of open switches and keeps the two legs of a switch apart', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  SW1: dip-switch4 5,4',
      '  R1: resistor 9,1 11,1 10k',
      'wires:',
      '  - SW1.B1 -| 9,1',
    ), { erc: true });

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('pgfdeclareshape{dipsw4}');
    const netOf = (ref: string) => result.netlist.find((net) => net.refs.includes(ref));
    expect(netOf('R1.1')?.refs).toContain('SW1.B1');
    expect(netOf('SW1.B1')?.refs).not.toContain('SW1.A1');
    // 使わないスイッチは言わない (4 連のうち 1 つだけ使うこともある)。
    expect(result.erc.map((one) => one.message).join('\n')).not.toContain('SW1');
  });

  test('declares one shape per count, only for the counts in the figure', () => {
    const tex = compileCircuit(circuit('parts:', '  SW1: dip-switch8 5,4')).tex ?? '';

    expect(tex).toContain('pgfdeclareshape{dipsw8}');
    expect(tex).not.toContain('pgfdeclareshape{dipsw4}');
    expect(tex).toContain('\\anchor{pin 16}');
  });

  test('lays A1〜A4 down the left side and B1〜B4 down the right on the map', () => {
    const pins = gridMap(circuit('parts:', '  SW1: dip-switch4 5,4')).chips[0]?.pins ?? [];

    expect(pins.filter((pin) => pin.side === 'left').map((pin) => pin.name)).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(pins.filter((pin) => pin.side === 'right').map((pin) => pin.name)).toEqual(['B1', 'B2', 'B3', 'B4']);
  });
});
