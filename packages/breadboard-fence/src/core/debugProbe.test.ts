import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { DEFAULT_WIRE_COLOR, wireColor } from './render/palette.ts';

/** Raspberry Pi Debug Probe の姿と線の色、USB ケーブル (52 の docs/157)。 */
const fence = (...lines: string[]): string => ['board: full', ...lines, ''].join('\n');

const probe = (at = 'top', pins = ''): string[] => [
  '  PROBE:',
  '    type: device',
  '    model: RPI-DEBUG-PROBE',
  '    label: Debug Probe',
  `    at: ${at}`,
  ...(pins === '' ? [] : [`    pins: ${pins}`]),
];

const strokes = (svg: string): string[] => [...svg.matchAll(/stroke="(#[0-9a-fA-F]{6})"/g)].map((match) => match[1] ?? '');

describe('Debug Probe', () => {
  test('draws the look instead of a box, with GND printed on both grounds', () => {
    const { svg, errors } = renderBreadboard(fence('parts:', '  MCU: pico2 @ g15', ...probe()));
    expect(errors).toEqual([]);
    expect(svg).toContain('cf-look-case');
    expect(svg).not.toContain('>UGND<');
    expect(svg).not.toContain('>DGND<');
    expect(svg.match(/>GND</g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('colours the wires after the cables when no colour is written, and keeps a written colour', () => {
    const plain = renderBreadboard(fence('parts:', '  MCU: pico2 @ g15', ...probe('top', '[TX, UGND, RX]'),
      'wires:', '  - PROBE.TX -- j16', '  - PROBE.UGND -- j17', '  - PROBE.RX -- j15')).svg;
    for (const name of ['orange', 'black', 'yellow']) expect(strokes(plain)).toContain(wireColor(name));
    const written = renderBreadboard(fence('parts:', '  MCU: pico2 @ g15', ...probe('top', '[TX]'),
      'wires:', '  - PROBE.TX -- j16 blue')).svg;
    expect(strokes(written)).toContain(wireColor('blue'));
    expect(strokes(written)).not.toContain(wireColor('orange'));
  });

  test('leaves other devices with the default wire colour', () => {
    const { svg } = renderBreadboard(fence('parts:', '  BAT:', '    type: device', '    pins: [P, N]', 'wires:', '  - BAT.P -- a5'));
    expect(strokes(svg)).toContain(DEFAULT_WIRE_COLOR);
  });

  test('refuses the bare DEBUG-PROBE', () => {
    const { errors } = renderBreadboard(fence('parts:', '  P:', '    type: device', '    model: DEBUG-PROBE'));
    expect(errors.map((one) => one.message).join('\n')).toContain('RPI-DEBUG-PROBE');
  });
});

describe('USB ケーブル', () => {
  test('plugs into a Pico and prints both kinds, listing the cable as a part', () => {
    const { svg, errors, netlist } = renderBreadboard(fence('parts:', '  MCU: pico2 @ g15', '  W1:', '    type: usb-cable', '    from: MCU.USB'));
    expect(errors).toEqual([]);
    expect(svg).toContain('cf-usb-cable');
    expect(svg).toContain('>USB-C – micro-B<');
    expect(svg).toContain('>USB-C<');
    expect(netlist.flatMap((net) => net.refs).some((ref) => ref.startsWith('W1'))).toBe(false);
  });

  test('takes the far plug from plug:', () => {
    const { svg } = renderBreadboard(fence('parts:', '  MCU: pico2 @ g15', '  W1:', '    type: usb-cable', '    from: MCU.USB', '    plug: usb-a'));
    expect(svg).toContain('>USB-A – micro-B<');
  });

  test('makes room above the band for a cable from the probe', () => {
    const height = (source: string): number => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(renderBreadboard(source).svg)?.[1]);
    const without = height(fence('parts-list: none', 'parts:', ...probe()));
    const withCable = height(fence('parts-list: none', 'parts:', ...probe(), '  W1:', '    type: usb-cable', '    from: PROBE.USB'));
    expect(withCable).toBeGreaterThan(without + 100);
  });

  test.each([
    [['    from: R1.USB'], 'R1 に USB の口がありません'],
    [['    from: R1.VCC'], '「部品の ID.USB」'],
    [['    from: NOPE.USB'], 'NOPE という部品はありません'],
    [['    from: R1.USB', '    plug: lightning'], 'plug: は'],
    [['    from: R1.USB', '    to: X.USB'], '書ける項目は'],
    [[], 'from: に挿す口'],
  ])('refuses %j', (lines, message) => {
    const { errors } = renderBreadboard(fence('parts:', '  R1: resistor a1 a5 1k', '  W1:', '    type: usb-cable', ...lines));
    expect(errors.map((one) => one.message).join('\n')).toContain(message);
  });

  test('shares the id space with parts', () => {
    const { errors } = renderBreadboard(fence('parts:', '  W1: resistor a1 a5 1k', '  W1:', '    type: usb-cable', '    from: W1.USB'));
    expect(errors.map((one) => one.message).join('\n')).toContain('二重');
  });
});

describe('大きさ (size:)', () => {
  const width = (source: string): number => Number(/viewBox="0 0 ([\d.]+) [\d.]+"/.exec(renderBreadboard(source).svg)?.[1]);
  const height = (source: string): number => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(renderBreadboard(source).svg)?.[1]);
  const withSize = (size: string): string => fence('parts-list: none', 'parts:', ...probe(), `    size: ${size}`);

  test('makes the band taller as the probe grows: small < medium (the default) < large', () => {
    const small = height(withSize('small'));
    const medium = height(fence('parts-list: none', 'parts:', ...probe()));
    expect(height(withSize('medium'))).toBe(medium);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(height(withSize('large')));
    expect(width(withSize('large'))).toBeGreaterThan(0);
  });

  test('shortens the cable out of the probe as the size goes down', () => {
    const cable = (size: string): number => height(fence('parts-list: none', 'parts:', ...probe(),
      '  W1:', '    type: usb-cable', '    from: PROBE.USB', `    size: ${size}`));
    expect(cable('small')).toBeLessThan(cable('medium'));
    expect(cable('medium')).toBeLessThan(cable('large'));
  });

  test.each([
    [['  PROBE:', '    type: device', '    model: RPI-DEBUG-PROBE', '    size: huge'], 'size は large / medium / small'],
    [['  BAT:', '    type: device', '    pins: [P, N]', '    size: small'], '姿のある機器'],
    [['  MCU: pico2 @ h15', '  W1:', '    type: usb-cable', '    from: MCU.USB', '    size: tiny'], 'size: は large / medium / small'],
  ])('refuses %j', (lines, message) => {
    const { errors } = renderBreadboard(fence('parts:', ...lines));
    expect(errors.map((one) => one.message).join('\n')).toContain(message);
  });
});
