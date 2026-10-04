import { describe, expect, test } from 'vitest';
import { renderCopper } from './index.ts';
import { parseFence } from './parser/parseFence.ts';
import { faceOf, placeDevice } from './parts/device.ts';
import { createBoard } from './model/board.ts';

const BOARD = ['board: 40x20mm', 'copper:', '  VCC: pad 10,5 4x4mm', '  G1: pad 30,15 4x4mm', '  L1: line 0,10 8,10 2mm'];
const PWR = ['  PWR:', '    type: device', '    at: -10,10', '    label: 電源 5V', '    pins: + -'];
const doc = (lines: readonly string[]): string => lines.join('\n');
const withDevice = (extra: readonly string[] = [], device: readonly string[] = PWR): string =>
  doc([...BOARD, 'parts:', ...device, ...extra]);

describe('device parser', () => {
  test('reads a nested device with a centre, a label and pin names', () => {
    const { doc: read, errors } = parseFence(withDevice());
    expect(errors).toEqual([]);
    expect(read.devices).toEqual([expect.objectContaining({ id: 'PWR', at: { x: -10, y: 10 }, label: '電源 5V', pins: ['+', '-'], face: null })]);
  });

  test('takes a YAML list of pins and an explicit face', () => {
    const { doc: read } = parseFence(withDevice([], ['  D:', '    type: device', '    at: 5,-9', '    pins: [CH1, 2]', '    face: Bottom']));
    expect(read.devices[0]).toMatchObject({ label: 'D', pins: ['CH1', '2'], face: 'bottom' });
  });

  test.each([
    [['  X:', '    at: 1,1', '    pins: a'], /入れ子で書けるのは基板の外の機器だけ/],
    [['  X:', '    type: device', '    pins: a'], /at に箱の中心/],
    [['  X:', '    type: device', '    at: 1.234,1', '    pins: a'], /点として読めません/],
    [['  X:', '    type: device', '    at: 1,1'], /ピンの名前を pins/],
    [['  X:', '    type: device', '    at: 1,1', '    pins: a a'], /ピンの名前が重なっています/],
    [['  X:', '    type: device', '    at: 1,1', '    pins: a', '    face: up'], /face は/],
    [['  X:', '    type: device', '    at: 1,1', '    pins: a', '    size: 3'], /知らない機器の項目/],
  ])('refuses a malformed device %#', (device, message) => {
    const { errors } = parseFence(withDevice([], device));
    expect(errors[0]?.message).toMatch(message);
  });

  test('shares the name space with islands and parts', () => {
    const { errors } = parseFence(withDevice([], [...PWR, '  VCC:', '    type: device', '    at: 1,1', '    pins: a']));
    expect(errors[0]?.message).toMatch(/名前が重なっています/);
  });
});

describe('device placement', () => {
  const board = createBoard(40, 20);
  test('turns the pins towards the board', () => {
    expect(faceOf({ x: -10, y: 10 }, board)).toBe('right');
    expect(faceOf({ x: 50, y: 10 }, board)).toBe('left');
    expect(faceOf({ x: 20, y: -10 }, board)).toBe('bottom');
    expect(faceOf({ x: 20, y: 30 }, board)).toBe('top');
  });

  test('puts pin tips outside the box edge that faces the board', () => {
    const placed = placeDevice({ id: 'D', at: { x: -10, y: 10 }, label: 'D', pins: ['a', 'b'], face: null, line: null }, board);
    expect(placed.pins[0]?.base.x).toBe(placed.box.x + placed.box.width);
    expect(placed.pins[0]?.tip.x).toBeGreaterThan(placed.pins[0]?.base.x ?? 0);
    expect(placed.pins[0]?.tip.y).toBeLessThan(placed.pins[1]?.tip.y ?? 0);
  });
});

describe('device wiring', () => {
  test('puts a device pin into the net of the island it is wired to', () => {
    const result = renderCopper(withDevice(['wires:', '  - PWR.+ -- VCC red', '  - PWR.- -- G1 black']));
    expect(result.errors).toEqual([]);
    expect(result.erc).toEqual([]);
    expect(result.netlist).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'VCC', refs: ['PWR.+'] }),
    ]));
    expect(JSON.stringify(result.netlist)).toContain('PWR.-');
  });

  test('joins the nets of two islands through a device wired to both', () => {
    const result = renderCopper(withDevice(['wires:', '  - PWR.+ -- VCC', '  - PWR.- -- G1', '  - PWR.+ -- PWR.-']));
    expect(result.netlist).toHaveLength(1);
  });

  test('wires to a line by its point nearest to the pin', () => {
    const result = renderCopper(withDevice(['wires:', '  - PWR.+ -- L1', '  - PWR.- -- G1']));
    expect(result.errors).toEqual([]);
    expect(result.erc).toEqual([]);
  });

  test('says so when a pin is wired nowhere', () => {
    const result = renderCopper(withDevice(['wires:', '  - PWR.+ -- VCC']));
    expect(result.erc.map((said) => said.message)).toEqual([expect.stringMatching(/PWR\.- のピンがどこにもつながっていません/)]);
  });

  test('names a wire that ends where there is no copper', () => {
    const result = renderCopper(withDevice(['wires:', '  - PWR.+ -- 20,2', '  - PWR.- -- G1']));
    expect(result.erc.map((said) => said.message)).toEqual(['機器から引いた配線の端 (20,2) の下に銅がありません']);
  });

  test('refuses an unknown device and an unknown pin', () => {
    const missing = renderCopper(withDevice(['wires:', '  - NOPE.+ -- VCC']));
    expect(missing.errors[0]?.message).toMatch(/そんな機器はありません: NOPE/);
    const pin = renderCopper(withDevice(['wires:', '  - PWR.x -- VCC']));
    expect(pin.errors[0]?.message).toMatch(/PWR に x というピンはありません \(\+ \/ -\)/);
  });

  test('refuses a device too far from the board, and stays quiet about its wires', () => {
    const far = withDevice(['wires:', '  - PWR.+ -- VCC'], ['  PWR:', '    type: device', '    at: -100,10', '    pins: + -']);
    const result = renderCopper(far);
    expect(result.errors.map((said) => said.message)).toEqual([expect.stringMatching(/PWR が基板から離れすぎです/)]);
  });

  test('warns when the box overlaps the board', () => {
    const result = renderCopper(withDevice([], ['  PWR:', '    type: device', '    at: 20,10', '    pins: +']));
    expect(result.notices.map((said) => said.message)).toEqual([expect.stringMatching(/箱が基板に重なっています/)]);
  });

  test('does not ask for copper under a device pin', () => {
    expect(renderCopper(withDevice(['wires:', '  - PWR.+ -- VCC', '  - PWR.- -- G1'])).erc).toEqual([]);
  });
});

describe('device drawing', () => {
  const svg = (): string => renderCopper(withDevice(['wires:', '  - PWR.+ -- VCC red', '  - PWR.- -- G1 black'])).svg;

  test('draws the box with its label and pin names, and coloured wires', () => {
    const drawn = svg();
    expect(drawn).toContain('data-device="PWR"');
    expect(drawn).toContain('電源 5V');
    expect(drawn.match(/class="cf-device"/g)).toHaveLength(1);
    expect(drawn).toMatch(/<line[^>]*stroke="#[0-9a-f]{6}"/);
  });

  test('draws the wires after the device parts of the board and not in the back view', () => {
    const drawn = svg();
    expect(drawn.match(/data-device=/g)).toHaveLength(1);
    expect(drawn.indexOf('cf-device')).toBeGreaterThan(drawn.indexOf('stroke-linecap="round"'));
  });

  test('widens the canvas to hold a device outside the board', () => {
    const [plain, wide] = [renderCopper(doc(BOARD)).svg, svg()];
    const width = (text: string): number => Number(/width="(\d+)"/.exec(text)?.[1]);
    expect(width(wide)).toBeGreaterThan(width(plain));
  });

  test('escapes the label', () => {
    const drawn = renderCopper(withDevice([], ['  PWR:', '    type: device', '    at: -10,10', '    label: <b>x</b>', '    pins: +'])).svg;
    expect(drawn).not.toContain('<b>x</b>');
  });
});

describe('editor with a device in the fence', () => {
  test('adds a part and picks a name that does not collide with the device', async () => {
    const { addPart, nextId } = await import('./edit/place.ts');
    const source = withDevice(['  R1: resistor VCC G1', 'wires:', '  - PWR.+ -- VCC']);
    expect(nextId(source, 'resistor')).toBe('R2');
    const result = addPart(source, { id: 'C1', type: 'capacitor/1608', at: ['20,10'] });
    expect(result.ok).toBe(true);
  });
});
