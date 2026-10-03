import { describe, expect, test } from 'vitest';
import { boardBox, boardChip, dipBox, dipChip, segmentFace, sipBox, sipHeader } from './chips.ts';
import type { ChipInk, ChipPoint } from './chips.ts';
import { lookupBoardPart } from './boards.ts';
import { textWidth as textWidthOf } from '../textFit.ts';

/**
 * パッケージの姿は 2 つの板が共有する (実機で「全ての部品の見た目を
 * breadboard と perfboard で共通にする」)。ここで見るのは**板に依らない
 * 約束**だけ — 切り欠きが 1 番ピンの側に出ること、字が樹脂の外へ出ないこと、
 * **縦に置いても同じ絵になる**こと (breadboard は溝をまたぐので横だけだが、
 * perfboard は回して置ける)。
 */
const INK: ChipInk = {
  body: '#2b2f36',
  pin: '#b9bec7',
  chipText: '#e8ebf0',
  plate: '#efe9d8',
  outside: '#3f4650',
  halo: '#f2efe6',
  haloWidth: 3,
};
const PITCH = 20;

/** 2 列パッケージの足。1 番から並べ、折り返して戻る (実物の DIP と同じ)。 */
function twoRows(count: number, span: number, vertical = false): ChipPoint[] {
  const half = count / 2;
  const along = (index: number): number => index * PITCH;
  const across = span * PITCH;
  const top = Array.from({ length: half }, (_, index) => (vertical
    ? { x: 0, y: along(index) }
    : { x: along(index), y: 0 }));
  const bottom = Array.from({ length: half }, (_, index) => (vertical
    ? { x: across, y: along(half - 1 - index) }
    : { x: along(half - 1 - index), y: across }));
  return [...top, ...bottom];
}

const circles = (svg: string): { x: number; y: number; r: number }[] =>
  [...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/g)]
    .map(([, x, y, r]) => ({ x: Number(x), y: Number(y), r: Number(r) }));

describe('dipChip', () => {
  const names = (count: number): string[] => Array.from({ length: count }, (_, index) => String(index + 1));

  test('puts the notch at the end pin 1 is written at, so the chip is not fitted turned round', () => {
    const points = twoRows(8, 3);
    const box = dipBox(points, PITCH);

    const drawn = dipChip({ points, names: names(8), pinOne: 0, pitch: PITCH, caption: 'U1', scale: 1, ink: INK });
    const turned = dipChip({ points, names: names(8), pinOne: 4, pitch: PITCH, caption: 'U1', scale: 1, ink: INK });

    expect(circles(drawn)[0]?.x).toBeCloseTo(box.x);
    expect(circles(turned)[0]?.x).toBeCloseTo(box.x + box.width);
  });

  test('turns the notch onto the end face when the package stands upright', () => {
    const points = twoRows(8, 3, true);
    const box = dipBox(points, PITCH);

    const notch = circles(dipChip({
      points, names: names(8), pinOne: 0, pitch: PITCH, caption: 'U1', scale: 1, ink: INK,
    }))[0];

    expect(notch?.y).toBeCloseTo(box.y);
    expect(notch?.x).toBeCloseTo(box.x + box.width / 2);
  });

  test('keeps the pin numbers inside the resin, where they name the hole they sit over', () => {
    const points = twoRows(8, 3);
    const box = dipBox(points, PITCH);
    const drawn = dipChip({ points, names: names(8), pinOne: 0, pitch: PITCH, caption: 'U1', scale: 1, ink: INK });

    const ys = [...drawn.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"/g)].map(([, y]) => Number(y));

    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y).toBeGreaterThan(box.y);
      expect(y).toBeLessThan(box.y + box.height);
    }
  });

  describe('番号と名前の 2 段 (52 の docs/95)', () => {
    const TIMER = ['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH', 'VCC'];
    const texts = (svg: string): { x: number; y: number; text: string }[] =>
      [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)]
        .map(([, x, y, text]) => ({ x: Number(x), y: Number(y), text: text ?? '' }));

    test('prints the numbers at the edge and the names outside the body, beyond the pins', () => {
      const points = twoRows(8, 3);
      const drawn = texts(dipChip({
        points, names: TIMER, numbers: names(8), pinOne: 0, pitch: PITCH, caption: 'NE555', scale: 1, ink: INK,
      }));
      const at = (text: string) => drawn.find((one) => one.text === text);

      // 1 番の列は y = 0 (上の列)。外は上向き。
      expect(at('GND')?.x).toBe(at('1')?.x);
      expect(at('GND')!.y).toBeLessThan(at('1')!.y);
      // 向かいの列 (y = 60) は外が下向き。
      expect(at('VCC')!.y).toBeGreaterThan(at('8')!.y);
      expect(drawn.some((one) => one.text === 'NE555')).toBe(true);
    });

    test('lays the halo of the names half see-through, so a wire under a name still shows', () => {
      const svg = dipChip({
        points: twoRows(8, 3), names: TIMER, numbers: names(8), pinOne: 0, pitch: PITCH, caption: 'NE555', scale: 1, ink: INK,
      });
      const halo = /<text [^>]*opacity="0.5"[^>]*aria-hidden="true"[^>]*>TRIG<\/text>/u.exec(svg);
      expect(halo?.[0]).toContain(`fill="${INK.halo}"`);
    });

    test('keeps the numbers inside the resin and the names within a pitch outside it', () => {
      const points = twoRows(8, 3);
      const box = dipBox(points, PITCH);
      const drawn = texts(dipChip({
        points, names: TIMER, numbers: names(8), pinOne: 0, pitch: PITCH, caption: 'NE555', scale: 1, ink: INK,
      }));
      const inside = (one: { x: number; y: number }, margin: number) =>
        one.x > box.x - margin && one.x < box.x + box.width + margin
        && one.y > box.y - margin && one.y < box.y + box.height + margin;
      for (const one of drawn) {
        expect(inside(one, 0), one.text).toBe(!TIMER.includes(one.text));
        expect(inside(one, PITCH), one.text).toBe(true);
      }
    });

    test('writes the names inside an upright body, between the numbers and the caption', () => {
      const points = twoRows(8, 3, true);
      const box = dipBox(points, PITCH);
      const drawn = texts(dipChip({
        points, names: TIMER, numbers: names(8), pinOne: 0, pitch: PITCH, caption: 'NE555', scale: 1, ink: INK,
      }));
      const at = (text: string) => drawn.find((one) => one.text === text)!;
      for (const one of drawn) {
        expect(one.x, one.text).toBeGreaterThan(box.x);
        expect(one.x, one.text).toBeLessThan(box.x + box.width);
      }
      // 1 番の列は x = 0 (左)。名前は番号より内側 (右)。
      expect(at('GND').x).toBeGreaterThan(at('1').x);
      expect(at('VCC').x).toBeLessThan(at('8').x);
      // キャプションは胴の下 (真ん中に寝かせると両側の名前に重なった)。
      expect(at('NE555').y).toBeGreaterThan(box.y + box.height);
    });

    test('draws exactly as before when no numbers are given', () => {
      const points = twoRows(8, 3);
      const options = { points, names: names(8), pinOne: 0, pitch: PITCH, caption: 'U1', scale: 1, ink: INK };
      expect(dipChip({ ...options, numbers: undefined })).toBe(dipChip(options));
      expect(texts(dipChip(options)).filter((one) => /^\d$/.test(one.text))).toHaveLength(8);
    });

    /** 名前 (番号でも縁の写しでもない字) の大きさ。 */
    const nameSizes = (svg: string, wanted: readonly string[]): Map<string, number> => new Map(
      [...svg.matchAll(/<text [^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
        .filter(([whole, , text]) => !whole.includes('aria-hidden') && wanted.includes(text ?? ''))
        .map(([, size, text]) => [text ?? '', Number(size)] as const),
    );
    const two = (count: number, list: readonly string[], caption: string, extra: object = {}) => dipChip({
      points: twoRows(count, 3), names: list, numbers: names(count), pinOne: 0, pitch: PITCH, caption, scale: 1, ink: INK, ...extra,
    });

    test('prints every name on one side of the body at one size', () => {
      const amp = ['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+'];
      // 字を大きくしたテーマ (scale > 1) で、長い名前だけが縮んでいた。
      const sizes = nameSizes(two(8, amp, 'LM358', { scale: 1.4 }), amp);
      expect(sizes.get('V-')).toBe(sizes.get('IN1+'));
      expect(sizes.get('OUT1')).toBe(sizes.get('V-'));
      expect(sizes.get('V+')).toBe(sizes.get('IN2+'));
    });

    test('keeps the full size when a long name sits next to short ones (NE555 RESET)', () => {
      const sizes = nameSizes(two(8, TIMER, 'NE555'), TIMER);
      expect(sizes.get('RESET')).toBe(6);
      expect(sizes.get('GND')).toBe(6);
    });

    test('prints GROUND as GND when the full word would shrink its side (L293D)', () => {
      const driver = ['12EN', '1A', '1Y', 'GROUND', 'GROUND', '2Y', '2A', 'VCC2', '34EN', '3A', '3Y', 'GROUND', 'GROUND', '4Y', '4A', 'VCC1'];
      const svg = two(16, driver, 'L293D');
      expect(svg).not.toContain('>GROUND<');
      expect(nameSizes(svg, ['GND', '1Y']).get('GND')).toBe(6);
      expect(nameSizes(svg, ['GND', '1Y']).get('1Y')).toBe(6);
    });

    test('keeps a slashed name whole while its side stays above the smallest size (MCP3008 CS/SHDN)', () => {
      const adc = ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'DGND', 'CS/SHDN', 'DIN', 'DOUT', 'CLK', 'AGND', 'VREF', 'VDD'];
      const sizes = nameSizes(two(16, adc, 'MCP3008'), adc);
      expect(sizes.get('CS/SHDN')).toBeGreaterThanOrEqual(4.5);
      expect(sizes.get('DGND')).toBe(sizes.get('CS/SHDN'));
      expect(sizes.get('CH0')).toBe(6);
    });

    test('prints the first role of a slashed name that would not fit even at the smallest size (CD4511B LE/STROBE)', () => {
      const decoder = ['INB', 'INC', 'LT', 'BL', 'LE/STROBE', 'IND', 'INA', 'VSS', 'Oe', 'Od', 'Oc', 'Ob', 'Oa', 'Og', 'Of', 'VDD'];
      const svg = two(16, decoder, 'CD4511B');
      expect(svg).not.toContain('LE/STROBE');
      const sizes = nameSizes(svg, [...decoder, 'LE']);
      expect(sizes.get('LE')).toBe(sizes.get('INB'));
      expect(sizes.get('LE')).toBeGreaterThanOrEqual(4.5);
      // 上に線の印の `/` (CD4013B の /Q1) は削らない。
      const flip = ['Q1', '/Q1', 'CLOCK1', 'RESET1', 'D1', 'SET1', 'VSS', 'SET2', 'D2', 'RESET2', 'CLOCK2', '/Q2', 'Q2', 'VDD'];
      expect(two(14, flip, 'CD4013B')).toContain('>/Q1<');
    });

    test('writes the names inside the body, just inside the numbers, when asked (perfboard)', () => {
      const points = twoRows(8, 3);
      const box = dipBox(points, PITCH);
      const drawn = texts(two(8, TIMER, 'NE555', { namesInside: true }));
      const at = (text: string) => drawn.find((one) => one.text === text)!;
      for (const name of TIMER) {
        expect(at(name).y, name).toBeGreaterThan(box.y);
        expect(at(name).y, name).toBeLessThan(box.y + box.height);
      }
      // 1 番の列は y = 0 (上)。名前は番号より内側 (下)、真ん中のキャプションより外側。
      const middle = box.y + box.height / 2;
      expect(at('GND').y).toBeGreaterThan(at('1').y);
      expect(at('GND').y).toBeLessThan(middle - 4);
      expect(at('VCC').y).toBeLessThan(at('8').y);
      expect(at('VCC').y).toBeGreaterThan(middle + 4);
      // 胴の上の字なので縁取りは無い (配線は胴の下を通らない)。
      expect(two(8, TIMER, 'NE555', { namesInside: true })).not.toContain('aria-hidden');
    });

    test('keeps the end names inside the body when they are written inside', () => {
      const points = twoRows(8, 3);
      const box = dipBox(points, PITCH);
      const svg = two(8, TIMER, 'NE555', { namesInside: true });
      const sizes = nameSizes(svg, TIMER);
      const reset = texts(svg).find((one) => one.text === 'RESET')!;
      const half = ((sizes.get('RESET') ?? 0) * textWidthOf('RESET') * 1.25) / 2;
      expect(reset.x + half).toBeLessThanOrEqual(box.x + box.width);
    });

    test('shrinks a long name to the pitch so that it does not run into the next pin', () => {
      const points = twoRows(16, 3);
      const long = ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLOCK', 'RESET', 'VDD'];
      const svg = dipChip({
        points, names: long, numbers: names(16), pinOne: 0, pitch: PITCH, caption: 'CD4017B', scale: 1, ink: INK,
      });
      const size = Number(/font-size="([\d.]+)"[^>]*>CLOCK</.exec(svg)?.[1] ?? 0);
      expect(size).toBeGreaterThan(0);
      expect(size * textWidthOf('CLOCK')).toBeLessThanOrEqual(PITCH);
    });
  });
});

describe('sipHeader', () => {
  const points: ChipPoint[] = [{ x: 0, y: 0 }, { x: PITCH, y: 0 }, { x: 2 * PITCH, y: 0 }];
  const names = ['1', '2', '3'];

  test('writes the pin names outside the bar, on the side it is asked for', () => {
    const bar = sipBox(points, PITCH);
    const below = sipHeader({ points, names, pitch: PITCH, caption: 'J1', scale: 1, nameSide: 1, ink: INK });
    const above = sipHeader({ points, names, pitch: PITCH, caption: 'J1', scale: 1, nameSide: -1, ink: INK });

    const firstName = (svg: string): number =>
      Number(/<text x="0" y="(-?[\d.]+)"[^>]*>1</.exec(svg)?.[1]);

    expect(firstName(below)).toBeGreaterThan(bar.y + bar.height);
    expect(firstName(above)).toBeLessThan(bar.y);
  });

  test('paints the body in the colour of a part that has a look, and prints its mark instead of the caption', () => {
    const look = { body: '#e8842a', edge: '#a85a12', text: '#7a3a08', mark: 'SFU' };
    const plain = sipHeader({ points, names, pitch: PITCH, caption: 'CF1 SFU455B', scale: 1, nameSide: 1, ink: INK });
    const looked = sipHeader({ points, names, pitch: PITCH, caption: 'CF1 SFU455B', scale: 1, nameSide: 1, ink: INK, look });

    expect(plain).not.toContain('#e8842a');
    expect(plain).toContain('CF1 SFU455B');
    expect(looked).toContain('#e8842a');
    expect(looked).toContain('#a85a12');
    expect(looked).toContain('>SFU<');
    expect(looked).not.toContain('CF1 SFU455B');
  });

  test('lays the bar along the pins when the header stands upright', () => {
    const upright: ChipPoint[] = [{ x: 0, y: 0 }, { x: 0, y: PITCH }, { x: 0, y: 2 * PITCH }];

    const bar = sipBox(upright, PITCH);

    expect(bar.height).toBeGreaterThan(bar.width);
  });
});

describe('boardChip', () => {
  const points = twoRows(40, 7);
  const definition = lookupBoardPart('pico');

  const drawn = (pinOne: number): string => boardChip({
    points,
    names: definition?.pins ?? [],
    definition,
    pinOne,
    pitch: PITCH,
    scale: 1,
    ink: INK,
  });

  test('numbers every header pin, so the drawing can be read against a pinout', () => {
    // **番号は足の側の端**。字は足から内側へ伸びるので、向きで前後が入れ替わる。
    // 1 番の列は樹脂の中心より上なので、番号は名前の後ろ (足の側の端)。
    expect(drawn(0)).toContain('GP0 01');
    // 折り返した先の列は伸びる向きが逆になるので、番号が前に来る。
    expect(drawn(0)).toContain('40 VBUS');
  });

  test('moves the usb connector to the end pin 1 is at, since the cable goes in there', () => {
    const usbX = (svg: string): number => Number(/<rect x="(-?[\d.]+)"[^>]*fill="#c9cfd8"/.exec(svg)?.[1]);
    const box = boardBox(points, PITCH);

    expect(usbX(drawn(0))).toBeLessThan(box.x);
    expect(usbX(drawn(20))).toBeGreaterThan(box.x + box.width / 2);
  });

  test('draws the aerial only on the wireless models', () => {
    const wired = drawn(0);
    const wireless = boardChip({
      points,
      names: lookupBoardPart('pico-w')?.pins ?? [],
      definition: lookupBoardPart('pico-w'),
      pitch: PITCH,
      scale: 1,
      ink: INK,
    });

    expect(wired).not.toContain('fill="none"');
    expect(wireless).toContain('fill="none"');
  });
});

describe('7 セグの面', () => {
  test('draws seven bars and a dot, turned so that the top faces up', () => {
    const upright = segmentFace({ centre: { x: 100, y: 100 }, rowGap: 120, up: { x: 0, y: -1 } });
    const sideways = segmentFace({ centre: { x: 100, y: 100 }, rowGap: 120, up: { x: 1, y: 0 } });

    expect(upright.match(/<rect /g)).toHaveLength(7);
    expect(upright).toContain('<circle');
    expect(upright).toContain('rotate(0)');
    expect(sideways).toContain('rotate(90)');
  });
});
