import { describe, expect, test } from 'vitest';
import { lookupBoardPart, pinLabel, readPinUses } from './boards.ts';
import { boardChip, boardUsbPort } from './chips.ts';
import { drawDeviceLook, lookPinX, lookSize, lookUsbPort, lookupPartSize, lookupUsbKind, pxPerMmOf } from './deviceLooks.ts';
import { deviceLookOf, deviceProductName, deviceSilk, deviceWireColor, lookupModule, resolveDeviceModel } from './modules.ts';
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

  test('knows the full product name', () => {
    expect(deviceProductName('rpi-debug-probe')).toBe('Raspberry Pi Debug Probe');
    expect(deviceProductName('NRF24L01+')).toBeNull();
  });

  test('has a look, other modules do not', () => {
    expect(deviceLookOf('RPI-DEBUG-PROBE')).toBe('rpi-debug-probe');
    expect(deviceLookOf('NRF24L01+')).toBeNull();
    expect(deviceLookOf(null)).toBeNull();
  });
});

describe('Debug Probe の姿', () => {
  const px = pxPerMmOf(20);
  const size = lookSize('rpi-debug-probe', px, 'large');
  const rect = { x: 100, y: 10, ...size };

  test('is drawn to scale: the case is 31 × 37 mm', () => {
    expect(size.width / px).toBeCloseTo(31);
    expect(size.height / px).toBeCloseTo(37);
  });

  test('puts the pins 1 mm apart and the ports 7.6 mm apart, as in the drawings', () => {
    const x = (pin: string): number => lookPinX('rpi-debug-probe', pin, rect, 'top', px, 'large') ?? Number.NaN;
    expect((x('UGND') - x('TX')) / px).toBeCloseTo(1);
    expect((x('DGND') - x('UGND')) / px).toBeCloseTo(7.6);
  });

  test('puts U on the left and D on the right, each orange-black-yellow from the left, when on top', () => {
    const xs = ['TX', 'UGND', 'RX', 'SC', 'DGND', 'SD'].map((pin) => lookPinX('rpi-debug-probe', pin, rect, 'top', px, 'large') ?? Number.NaN);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[2] ?? 0).toBeLessThan(rect.x + rect.width / 2);
    expect(xs[3] ?? 0).toBeGreaterThan(rect.x + rect.width / 2);
  });

  test('turns the whole probe round when it sits below the board', () => {
    const top = lookPinX('rpi-debug-probe', 'TX', rect, 'top', px, 'large') ?? 0;
    const bottom = lookPinX('rpi-debug-probe', 'TX', rect, 'bottom', px, 'large') ?? 0;
    expect(top - rect.x).toBeCloseTo(rect.x + rect.width - bottom);
    expect(lookPinX('rpi-debug-probe', 'VCC', rect, 'top', px)).toBeNull();
  });

  test('puts the micro-B port on the edge away from the board', () => {
    expect(lookUsbPort('rpi-debug-probe', rect, 'top', px, 'large')).toMatchObject({ dir: 'up', kind: 'micro-b' });
    expect(lookUsbPort('rpi-debug-probe', rect, 'top', px, 'large').y).toBeLessThan(rect.y + 2 * px);
    expect(lookUsbPort('rpi-debug-probe', rect, 'bottom', px, 'large')).toMatchObject({ dir: 'down', kind: 'micro-b' });
  });

  test('draws the case, the U and D marks, the pin names and the name, and no logo', () => {
    const pins = [{ name: 'UGND', text: 'GND' }];
    const svg = drawDeviceLook('rpi-debug-probe', { rect, side: 'top', label: 'Debug Probe', scale: 1, pxPerMm: px, pins, pinFont: 8.5, size: 'large' });
    expect(svg).toContain('font-size="8.5"');
    expect(svg).toContain('>GND<');
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
  const pxPerMm = pxPerMmOf(20);

  test('prints the kind on both plugs', () => {
    const svg = drawUsbCable({ port, far: 'usb-c', length: 200, scale: 1, pxPerMm });
    expect(svg).toContain('>micro-B<');
    expect(svg).toContain('>USB-C<');
  });

  test('never draws a cable too short to see: both plug bodies, the far tip and a bit of cord', () => {
    const shortest = usbCableMinLength('micro-b', 'usb-c', pxPerMm, 'large');
    expect(shortest).toBeCloseTo((25.6 + 35 + 6.65) * pxPerMm + 24);
    expect(usbCableBox({ port, far: 'usb-c', length: 5, pxPerMm, size: 'large' }).width).toBeCloseTo(shortest);
    expect(usbCableBox({ port, far: 'usb-c', length: 1000, pxPerMm })).toMatchObject({ x: -1000, width: 1000 });
    expect(usbCableBox({ port: { ...port, dir: 'up' }, far: 'usb-a', length: 1000, pxPerMm })).toMatchObject({ y: -1000, height: 1000 });
  });

  test('makes medium the default: connectors to scale, the whole smaller', () => {
    const px = pxPerMm;
    expect(lookSize('rpi-debug-probe', px).width / px).toBeCloseTo(21);
    expect(lookSize('rpi-debug-probe', px).height / px).toBeCloseTo(27);
    const rectM = { x: 0, y: 0, ...lookSize('rpi-debug-probe', px) };
    const x = (pin: string): number => lookPinX('rpi-debug-probe', pin, rectM, 'top', px) ?? Number.NaN;
    expect((x('UGND') - x('TX')) / px).toBeCloseTo(1);
    expect((x('DGND') - x('UGND')) / px).toBeCloseTo(7.6);
    // ケーブルは胴の長さを縮めるが、胴の幅は実寸 (USB-A 15.7 mm)。
    expect(usbCableMinLength('micro-b', 'usb-c', px)).toBeLessThan(usbCableMinLength('micro-b', 'usb-c', px, 'large'));
    expect(usbCableBox({ port: { x: 0, y: 0, dir: 'up', kind: 'micro-b' }, far: 'usb-a', length: 1000, pxPerMm: px }).width / px).toBeCloseTo(15.7);
  });

  test('makes small smaller still, connectors too', () => {
    const px = pxPerMm;
    expect(lookSize('rpi-debug-probe', px, 'small').width).toBeLessThan(lookSize('rpi-debug-probe', px).width);
    const rectS = { x: 0, y: 0, ...lookSize('rpi-debug-probe', px, 'small') };
    const x = (pin: string): number => lookPinX('rpi-debug-probe', pin, rectS, 'top', px, 'small') ?? Number.NaN;
    expect((x('UGND') - x('TX')) / px).toBeCloseTo(0.7);
    expect(usbCableMinLength('micro-b', 'usb-c', px, 'small')).toBeLessThan(usbCableMinLength('micro-b', 'usb-c', px));
  });

  test('reads the three sizes and nothing else', () => {
    expect(['LARGE', 'medium', 'small', 'huge'].map(lookupPartSize)).toEqual(['large', 'medium', 'small', null]);
  });

  test('draws the plugs to scale: a USB-A body is 15.7 mm wide', () => {
    const box = usbCableBox({ port: { ...port, dir: 'up' }, far: 'usb-a', length: 1000, pxPerMm, size: 'large' });
    expect(box.width / pxPerMm).toBeCloseTo(15.7);
  });
});

describe('マイコンボードの使う機能 (use=)', () => {
  test('reads pin:function pairs, with _ for the space', () => {
    expect(readPinUses('pico2', 'GP0:UART0_TX,GP27:ADC1')).toEqual({ ok: true, uses: { GP0: 'UART0 TX', GP27: 'ADC1' } });
  });

  test('takes a bare function when only one pin has it', () => {
    expect(readPinUses('pico', 'ADC2')).toEqual({ ok: true, uses: { GP28: 'ADC2' } });
  });

  test.each([
    ['I2C0_SDA', 'ピンを書きます'],
    ['GP2:ADC0', 'GP2 に ADC0 はありません'],
    ['GP0:UART0_TX,GP0:I2C0_SDA', '2 回'],
    ['HDMI', 'という機能はありません'],
  ])('refuses %s', (written, message) => {
    const read = readPinUses('pico2', written);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.message).toContain(message);
  });

  test('refuses a board without the table and leaves other pins as they are', () => {
    expect(readPinUses('tang-nano-9k', 'ADC0').ok).toBe(false);
    expect(pinLabel('GP27', { GP27: 'ADC1' })).toBe('ADC1');
    expect(pinLabel('GP26', { GP27: 'ADC1' })).toBe('GP26');
  });
});
