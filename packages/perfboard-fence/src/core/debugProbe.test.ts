import { wireColor } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/** Raspberry Pi Debug Probe の姿と線の色、USB ケーブル (52 の docs/157)。bread と同じ決まり。 */
const fence = (...lines: string[]): string => ['board: 30x20', 'style:', '  check: off', ...lines, ''].join('\n');

const probe = (at = 'top'): string[] => [
  '  PROBE:', '    type: device', '    model: RPI-DEBUG-PROBE', `    at: ${at}`, '    pins: [TX, UGND, RX]',
];

describe('Debug Probe', () => {
  test('draws the look in the band, prints GND and colours the wires after the cables', () => {
    const { svg, errors } = renderPerfboard(fence('parts:', ...probe(), 'wires:', '  - PROBE.TX -- c5', '  - PROBE.UGND -- c6', '  - PROBE.RX -- c7'));
    expect(errors).toEqual([]);
    expect(svg).toContain('cf-look-case');
    expect(svg).toContain('>GND<');
    expect(svg).not.toContain('>UGND<');
    for (const name of ['orange', 'black', 'yellow']) expect(svg).toContain(`stroke="${wireColor(name)}"`);
  });

  test('keeps a box for a probe placed at an address', () => {
    const { svg } = renderPerfboard(fence('parts:', ...probe('e1').map((line) => line.replace('at: e1', 'at: -c1'))));
    expect(svg).not.toContain('cf-look-case');
  });
});

describe('USB ケーブル', () => {
  test('plugs into a Pico and lists both kinds', () => {
    const { svg, errors } = renderPerfboard(fence('parts:', '  MCU: pico2 e5', '  W1:', '    type: usb-cable', '    from: MCU.USB', 'notes:', '  - parts'));
    expect(errors).toEqual([]);
    expect(svg).toContain('cf-usb-cable');
    expect(svg).toContain('>micro-B<');
    expect(svg).toContain('USB-C – micro-B');
  });

  test('runs a cable from the probe out of the band', () => {
    const { svg, errors } = renderPerfboard(fence('parts:', ...probe(), '  W1:', '    type: usb-cable', '    from: PROBE.USB', '    plug: usb-a'));
    expect(errors.filter((one) => one.notice !== true)).toEqual([]);
    expect(svg).toContain('>USB-A<');
  });

  test.each([
    [['    from: R1.USB'], 'R1 に USB の口がありません'],
    [['    from: R1.VCC'], '「部品の ID.USB」'],
    [['    from: R1.USB', '    plug: lightning'], 'plug: は'],
  ])('refuses %j', (lines, message) => {
    const { errors } = renderPerfboard(fence('parts:', '  R1: resistor a1 a5 1k', '  W1:', '    type: usb-cable', ...lines));
    expect(errors.map((one) => one.message).join('\n')).toContain(message);
  });
});
