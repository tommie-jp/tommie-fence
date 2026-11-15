import { describe, expect, test } from 'vitest';
import { lookupBoardPart } from './boards.ts';
import { boardChip, boardUsbPort } from './chips.ts';
import { drawDeviceLook, lookPinX, lookUsbPort, lookupUsbKind } from './deviceLooks.ts';
import { deviceLookOf, deviceSilk, deviceWireColor, lookupModule, resolveDeviceModel } from './modules.ts';
import { drawUsbCable, usbCableBox, usbCableMinLength } from './usbCable.ts';

/** Raspberry Pi Debug Probe と USB ケーブル (52 の docs/157)。 */
describe('Debug Probe の表', () => {
  test('names the pins as the probe sees them, the two grounds apart', () => {
    expect(lookupModule('RPI-DEBUG-PROBE')?.names).toEqual(['TX', 'UGND', 'RX', 'SC', 'DGND', 'SD']);
    expect(lookupModule('raspberry-pi-debug-probe')?.models[0]).toBe('RPI-DEBUG-PROBE');
  });

  test('refuses the bare DEBUG-PROBE, which would not say whose probe it is', () => {
    const result = resolveDeviceModel('DEBUG-PROBE', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('RPI-DEBUG-PROBE');
  });

  test('prints GND on both grounds and keeps the other names as written', () => {
    expect(deviceSilk('RPI-DEBUG-PROBE', 'UGND')).toBe('GND');
    expect(deviceSilk('RPI-DEBUG-PROBE', 'DGND')).toBe('GND');
    expect(deviceSilk('RPI-DEBUG-PROBE', 'TX')).toBe('TX');
    expect(deviceSilk(null, 'UGND')).toBe('UGND');
    expect(deviceSilk('NRF24L01+', 'GND')).toBe('GND');
  });

  test('gives the official cable colours: orange TX/SC, black GND, yellow RX/SD', () => {
    expect(['TX', 'UGND', 'RX', 'SC', 'DGND', 'SD'].map((pin) => deviceWireColor('rpi-debug-probe', pin)))
      .toEqual(['orange', 'black', 'yellow', 'orange', 'black', 'yellow']);
    expect(deviceWireColor('NRF24L01+', 'GND')).toBeNull();
    expect(deviceWireColor('RPI-DEBUG-PROBE', 'constructor')).toBeNull();
  });

  test('has a look, other modules do not', () => {
    expect(deviceLookOf('RPI-DEBUG-PROBE')).toBe('rpi-debug-probe');
    expect(deviceLookOf('NRF24L01+')).toBeNull();
    expect(deviceLookOf(null)).toBeNull();
  });
});

describe('Debug Probe の姿', () => {
  const rect = { x: 100, y: 10, width: 200, height: 62 };

  test('puts U on the left and D on the right, each orange-black-yellow from the left, when on top', () => {
    const xs = ['TX', 'UGND', 'RX', 'SC', 'DGND', 'SD'].map((pin) => lookPinX('rpi-debug-probe', pin, rect, 'top') ?? Number.NaN);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[2] ?? 0).toBeLessThan(200);
    expect(xs[3] ?? 0).toBeGreaterThan(200);
  });

  test('turns the whole probe round when it sits below the board', () => {
    const top = lookPinX('rpi-debug-probe', 'TX', rect, 'top') ?? 0;
    const bottom = lookPinX('rpi-debug-probe', 'TX', rect, 'bottom') ?? 0;
    expect(top - rect.x).toBeCloseTo(rect.x + rect.width - bottom);
    expect(lookPinX('rpi-debug-probe', 'VCC', rect, 'top')).toBeNull();
  });

  test('puts the micro-B port on the edge away from the board', () => {
    expect(lookUsbPort('rpi-debug-probe', rect, 'top')).toMatchObject({ dir: 'up', kind: 'micro-b' });
    expect(lookUsbPort('rpi-debug-probe', rect, 'top').y).toBeLessThan(rect.y);
    expect(lookUsbPort('rpi-debug-probe', rect, 'bottom')).toMatchObject({ dir: 'down', kind: 'micro-b' });
  });

  test('draws the case, the U and D marks and the name, and no logo', () => {
    const svg = drawDeviceLook('rpi-debug-probe', { rect, side: 'top', label: 'Debug Probe', scale: 1 });
    expect(svg).toContain('cf-look-case');
    expect(svg).toContain('>U<');
    expect(svg).toContain('>D<');
    expect(svg).toContain('>Debug Probe<');
    expect(svg).not.toMatch(/raspberry|logo/i);
  });
});

describe('USB の種類', () => {
  test('reads the three spellings in any case and nothing else', () => {
    expect(lookupUsbKind('USB-C')).toBe('usb-c');
    expect(lookupUsbKind('micro-b')).toBe('micro-b');
    expect(lookupUsbKind('usb-a')).toBe('usb-a');
    expect(lookupUsbKind('lightning')).toBeNull();
  });

  test('knows Pico boards are micro-B and the Tang Nano 9K is USB-C', () => {
    expect(['pico', 'pico-w', 'pico2', 'pico2-w'].map((type) => lookupBoardPart(type)?.usb)).toEqual(['micro-b', 'micro-b', 'micro-b', 'micro-b']);
    expect(lookupBoardPart('tang-nano-9k')?.usb).toBe('usb-c');
  });

  const pico = lookupBoardPart('pico2');
  const row = Array.from({ length: 20 }, (_, index) => ({ x: 20 * index, y: 0 }));
  const points = [...row, ...[...row].reverse().map((point) => ({ x: point.x, y: 140 }))];

  test('prints the kind next to the usb end of a Pico', () => {
    if (pico === null) throw new Error('pico2 が表に無い');
    const svg = boardChip({
      points, names: pico.pins, definition: pico, pitch: 20, scale: 1,
      ink: { body: '#1e7a46', pin: '#ddd', chipText: '#fff' } as never,
    });
    expect(svg).toContain('>micro-B<');
  });

  test('finds the port at the pin 1 end, pointing out of the board', () => {
    if (pico === null) throw new Error('pico2 が表に無い');
    const port = boardUsbPort(points, 20, pico);
    expect(port).toMatchObject({ dir: 'left', kind: 'micro-b' });
    expect(port?.x ?? 0).toBeLessThan(0);
    expect(boardUsbPort(points, 20, pico, 20)?.dir).toBe('right');
  });
});

describe('USB ケーブル', () => {
  const port = { x: 0, y: 0, dir: 'left', kind: 'micro-b' } as const;

  test('prints the kind on both plugs', () => {
    const svg = drawUsbCable({ port, far: 'usb-c', length: 200, scale: 1 });
    expect(svg).toContain('>micro-B<');
    expect(svg).toContain('>USB-C<');
  });

  test('never draws a cable too short to see', () => {
    expect(usbCableBox({ port, far: 'usb-c', length: 5 }).width).toBe(usbCableMinLength('usb-c'));
    expect(usbCableBox({ port, far: 'usb-c', length: 200 })).toMatchObject({ x: -200, width: 200 });
    expect(usbCableBox({ port: { ...port, dir: 'up' }, far: 'usb-a', length: 150 })).toMatchObject({ y: -150, height: 150 });
  });
});
