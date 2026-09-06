import { describe, expect, test } from 'vitest';
import { boardBox, boardChip, dipBox, dipChip, sipBox, sipHeader } from './chips.ts';
import type { ChipInk, ChipPoint } from './chips.ts';
import { lookupBoardPart } from './boards.ts';

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
