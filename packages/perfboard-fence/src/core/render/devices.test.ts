import { describe, expect, test } from 'vitest';
import { layoutDevices, renderDevices } from './devices.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import type { DeviceSpec } from '../types.ts';

const device = (id: string, pins: readonly string[], at: 'top' | 'bottom' = 'top'): DeviceSpec =>
  ({ id, at, label: id, pins, line: 3 });

const layoutFor = (devices: readonly DeviceSpec[], cols = 16) => createLayout(
  createBoard({ cols, rows: 8 }),
  {
    deviceTop: devices.some((one) => one.at === 'top'),
    deviceBottom: devices.some((one) => one.at === 'bottom'),
  },
);

const place = (devices: readonly DeviceSpec[], cols = 16) =>
  layoutDevices(devices, layoutFor(devices, cols));

describe('layoutDevices', () => {
  test('places nothing when no device was written', () => {
    expect(place([]).placed).toEqual([]);
  });

  test('puts a device in the band on the side it asked for', () => {
    const devices = [device('BAT', ['+', '-']), device('SPK', ['1', '2'], 'bottom')];
    const layout = layoutFor(devices);
    const { placed } = layoutDevices(devices, layout);

    const bat = placed.find((one) => one.device.id === 'BAT')!;
    const spk = placed.find((one) => one.device.id === 'SPK')!;
    expect(bat.box.y).toBeLessThan(layout.board.y);
    expect(spk.box.y).toBeGreaterThan(layout.board.y + layout.board.height);
  });

  test('turns the legs towards the board, so a wire reads as reaching it', () => {
    const devices = [device('BAT', ['+', '-']), device('SPK', ['1', '2'], 'bottom')];
    const { placed } = layoutDevices(devices, layoutFor(devices));

    const bat = placed.find((one) => one.device.id === 'BAT')!;
    const spk = placed.find((one) => one.device.id === 'SPK')!;
    expect(bat.pins.get('+')!.y).toBeGreaterThan(bat.box.y);
    expect(spk.pins.get('1')!.y).toBeLessThan(spk.box.y);
  });

  test('keeps every box inside the canvas, however many are written', () => {
    // viewBox の外に描いた箱は**黙って切れる**。切れた図は間違いに見えない。
    const devices = ['A', 'B', 'C', 'D'].map((id) => device(id, ['1', '2']));
    const layout = layoutFor(devices, 10);
    const { placed } = layoutDevices(devices, layout);

    for (const one of placed) {
      expect(one.box.x).toBeGreaterThanOrEqual(0);
      expect(one.box.x + one.box.width).toBeLessThanOrEqual(layout.width);
    }
  });

  test('says so when a device is squeezed past reading, rather than drawing it anyway', () => {
    const { notices } = place([device('U', Array.from({ length: 40 }, (_, i) => String(i + 1)))], 10);

    expect(notices).toHaveLength(1);
    expect(notices[0]?.line).toBe(3);
    expect(notices[0]?.notice).toBe(true);
  });

  test('keeps quiet when the devices fit', () => {
    expect(place([device('BAT', ['+', '-'])]).notices).toEqual([]);
  });
});

describe('renderDevices', () => {
  test('draws the box, the legs and the names', () => {
    const svg = renderDevices(place([device('BAT', ['+', '-'])]).placed, THEME);

    expect(svg).toContain('<rect');
    expect(svg).toContain('<line');
    expect(svg).toContain('>+<');
  });

  test('escapes the label, which came from the fence', () => {
    const one = { ...device('BAT', ['+']), label: '<img src=x>' };
    const svg = renderDevices(place([one]).placed, THEME);

    expect(svg).toContain('&lt;img');
    expect(svg).not.toContain('<img');
  });
});
