import { describe, expect, test } from 'vitest';
import {
  CONNECTOR_LOOKS, MIN_CONNECTOR_PINS, connectorBox, connectorFacing, connectorNames, connectorPinNames,
  drawConnector, lookupConnector,
} from './connectors.ts';
import type { ConnectorShape } from './connectors.ts';

/**
 * 基板に載せるコネクタ (USB)。**表と姿を 3 つのフェンスで分け合う** (52 の docs/58)。
 * 足の名前は表の順 (`VBUS GND D+ D-`) で、書いた穴の数だけ使う。
 */

const PITCH = 20;

/** 横一列に並んだ足。`y` を変えると板の上下どちらの縁に近いかが変わる。 */
const row = (count: number, y = 100, x0 = 100): { x: number; y: number }[] =>
  Array.from({ length: count }, (_, index) => ({ x: x0 + index * PITCH, y }));

const shape = (over: Partial<ConnectorShape> = {}): ConnectorShape => ({
  type: 'usb-c', variant: null, points: row(4), pitch: PITCH, facing: 'up', ...over,
});

/** 描いた矩形 (`<rect x= y= width= height=`) を全部拾う。 */
const rectsOf = (svg: string): { x: number; y: number; width: number; height: number }[] =>
  [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map(([, x = '0', y = '0', width = '0', height = '0']) =>
      ({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) }));

describe('コネクタの表', () => {
  test('knows the two usb kinds, and nothing it has not been told about', () => {
    expect(connectorNames()).toEqual(['usb-a', 'usb-c']);
    expect(lookupConnector('usb-c')?.name).toBe('USB Type-C');
    // 種類名は入力から来るので、自分の持ち物だけを引く (`boards.ts` と同じ理由)。
    expect(lookupConnector('constructor')).toBeNull();
    expect(lookupConnector('usb-b')).toBeNull();
  });

  test('puts the power pair first on type-a, and gives type-c the four pins of its breakout', () => {
    expect(lookupConnector('usb-a')?.pins).toEqual(['VBUS', 'GND', 'D+', 'D-']);
    expect(lookupConnector('usb-a')?.minPins).toBe(2);
    expect(lookupConnector('usb-c')?.pins).toEqual(['GND', 'D+', 'D-', 'VBUS']);
    // Type-C の変換基板は 4 本とも書く。
    expect(lookupConnector('usb-c')?.minPins).toBe(4);
    expect(MIN_CONNECTOR_PINS).toBe(2);
  });

  test('names only the pins that were written', () => {
    expect(connectorPinNames('usb-a', 2)).toEqual(['VBUS', 'GND']);
    expect(connectorPinNames('usb-c', 4)).toEqual(['GND', 'D+', 'D-', 'VBUS']);
    expect(connectorPinNames('usb-a', 4)).toEqual(['VBUS', 'GND', 'D+', 'D-']);
    // 表より多く書いた足には名前が無い (呼ぶ側が断る)。
    expect(connectorPinNames('usb-a', 5)).toEqual(['VBUS', 'GND', 'D+', 'D-']);
    expect(connectorPinNames('dip8', 2)).toEqual([]);
  });

  test('offers a plug and a receptacle, the receptacle being what a board usually carries', () => {
    expect(CONNECTOR_LOOKS).toEqual(['male', 'female']);
  });
});

describe('差し込み口の向き', () => {
  const centre = { x: 200, y: 200 };

  test('faces the nearer edge across the row of pins', () => {
    expect(connectorFacing(row(2, 50), centre)).toBe('up');
    expect(connectorFacing(row(2, 350), centre)).toBe('down');
  });

  test('faces sideways when the pins run down a column', () => {
    const column = (x: number) => [{ x, y: 100 }, { x, y: 120 }, { x, y: 140 }];
    expect(connectorFacing(column(20), centre)).toBe('left');
    expect(connectorFacing(column(380), centre)).toBe('right');
  });

  test('reads the row from all the pins, not the first two', () => {
    // 表の順に穴を書くので、1 番と 2 番が隣とは限らない (`c3 c6 c4 c5`)。
    const shuffled = [{ x: 100, y: 50 }, { x: 160, y: 50 }, { x: 120, y: 50 }, { x: 140, y: 50 }];
    expect(connectorFacing(shuffled, centre)).toBe('up');
  });
});

describe('外形', () => {
  test('draws the Type-C breakout a board five holes tall (12.7 mm) and 9.2 mm wide, the metal sticking out past it', () => {
    const pitch = 25.4;
    const box = connectorBox({ ...shape({ facing: 'up', points: row(4) }), pitch });
    const mm = pitch / 2.54;

    expect(box.width / mm).toBeCloseTo(9.2, 1);
    // 基板が 12.7mm で、金物が縁から 0.5mm 出る。
    expect(box.height / mm).toBeCloseTo(13.2, 1);
  });

  test('grows from the pins toward the side it faces', () => {
    const up = connectorBox(shape({ facing: 'up' }));
    const down = connectorBox(shape({ facing: 'down' }));

    expect(up.y).toBeLessThan(100 - PITCH);
    // 実寸のある Type-C の基板は、足の列の後ろにパッドの帯を持つ (3 ピッチまで)。
    expect(up.y + up.height).toBeLessThan(100 + 3 * PITCH);
    expect(down.y + down.height).toBeGreaterThan(100 + PITCH);
    expect(down.y).toBeGreaterThan(100 - 3 * PITCH);
  });

  test('holds every pin inside it', () => {
    for (const facing of ['up', 'down'] as const) {
      const box = connectorBox(shape({ facing, points: row(4) }));
      for (const point of row(4)) {
        expect(point.x).toBeGreaterThan(box.x);
        expect(point.x).toBeLessThan(box.x + box.width);
        expect(point.y).toBeGreaterThan(box.y);
        expect(point.y).toBeLessThan(box.y + box.height);
      }
    }
  });

  test('turns with the row when the pins run down a column', () => {
    const column = [{ x: 100, y: 100 }, { x: 100, y: 120 }];
    const right = connectorBox(shape({ points: column, facing: 'right' }));
    const left = connectorBox(shape({ points: column, facing: 'left' }));

    expect(right.x + right.width).toBeGreaterThan(100 + PITCH * 2);
    expect(left.x).toBeLessThan(100 - PITCH * 2);
  });

  test('is as big as the real thing: type-a is wider and deeper than type-c', () => {
    const a = connectorBox(shape({ type: 'usb-a' }));
    const c = connectorBox(shape({ type: 'usb-c' }));
    // USB-A の受け口は 13.1mm 幅・14mm 奥行き、Type-C は 8.94mm・7.35mm。
    expect(a.width).toBeGreaterThan(c.width);
    expect(a.height).toBeGreaterThan(c.height);
    expect(c.width).toBeGreaterThanOrEqual((8.94 * PITCH) / 2.54);
  });

  test('lets the plug stick out farther than the receptacle', () => {
    // Type-C の受け口は実寸の基板 (パッドから 12.7mm) に載るので、実寸の無い Type-A で比べる。
    const male = connectorBox(shape({ type: 'usb-a', variant: 'male' }));
    const female = connectorBox(shape({ type: 'usb-a', variant: 'female' }));
    expect(male.y).toBeLessThan(female.y);
  });

  test('draws the receptacle when no look is written', () => {
    expect(connectorBox(shape({ variant: null }))).toEqual(connectorBox(shape({ variant: 'female' })));
    expect(drawConnector(shape({ variant: null }))).toBe(drawConnector(shape({ variant: 'female' })));
  });
});

describe('姿', () => {
  test('draws a different picture for every kind and look', () => {
    const drawn = connectorNames().flatMap((type) =>
      CONNECTOR_LOOKS.map((variant) => drawConnector(shape({ type, variant }))));
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  test('prints the name of every written pin, and no more', () => {
    const two = drawConnector(shape({ type: 'usb-a', points: row(2) }));
    expect(two).toContain('>VBUS<');
    expect(two).toContain('>GND<');
    expect(two).not.toContain('>D+<');

    const four = drawConnector(shape({ points: row(4) }));
    for (const name of ['GND', 'D+', 'D-', 'VBUS']) expect(four).toContain(`>${name}<`);
    expect(four).not.toContain('>CC1<');
  });

  test('keeps every shape it draws inside the outline it reports', () => {
    const cases: ConnectorShape[] = connectorNames().flatMap((type) => CONNECTOR_LOOKS.flatMap((variant) =>
      (['up', 'down'] as const).map((facing) => shape({ type, variant, facing, points: row(4) }))));
    const column = [{ x: 100, y: 100 }, { x: 100, y: 120 }, { x: 100, y: 140 }];
    const sideways = (['left', 'right'] as const).map((facing) => shape({ facing, points: column }));

    for (const one of [...cases, ...sideways]) {
      const box = connectorBox(one);
      for (const rect of rectsOf(drawConnector(one))) {
        const where = `${one.type}/${one.variant} ${one.facing}`;
        expect(rect.x, where).toBeGreaterThanOrEqual(box.x - 0.01);
        expect(rect.y, where).toBeGreaterThanOrEqual(box.y - 0.01);
        expect(rect.x + rect.width, where).toBeLessThanOrEqual(box.x + box.width + 0.01);
        expect(rect.y + rect.height, where).toBeLessThanOrEqual(box.y + box.height + 0.01);
      }
    }
  });

  test('makes the pads of the type-c breakout its feet: a pad sits on every written hole, and no gold land', () => {
    // 実物の変換基板は、後ろの縁の四角いパッドが足。配線はパッドへ届く。
    const points = row(4);
    const drawn = drawConnector(shape({ points }));
    const pad = (1.5 * PITCH) / 2.54;
    const centres = rectsOf(drawn)
      .filter((rect) => Math.abs(rect.width - pad) < 0.01 && Math.abs(rect.height - pad) < 0.01)
      .map((rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));

    expect(centres).toHaveLength(points.length);
    points.forEach((point, index) => {
      expect(centres[index]?.x).toBeCloseTo(point.x, 1);
      expect(centres[index]?.y).toBeCloseTo(point.y, 1);
    });
    expect(drawn).not.toContain('<circle');
    // 実寸の無い Type-A は、ランドとピンヘッダの頭のまま。
    expect(drawConnector(shape({ type: 'usb-a' }))).toContain('<circle');
  });

  test('keeps the type-c breakout at its real length, starting just behind the pads', () => {
    const points = row(4);
    const box = connectorBox(shape({ points, facing: 'down' }));
    const mm = PITCH / 2.54;
    // 後ろの縁はパッドの 0.5mm 後ろ。基板 12.7mm の先に金物が 0.5mm 出る。
    expect(box.y).toBeCloseTo(100 - 1.25 * mm, 1);
    expect(box.height).toBeCloseTo(13.2 * mm, 1);
  });

  test('lets a black-and-white figure repaint every colour', () => {
    const plain = drawConnector(shape());
    const mono = drawConnector({ ...shape(), ink: { paint: () => '#000000' } });
    const colours = (svg: string) => new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1]));

    expect(colours(plain).size).toBeGreaterThan(2);
    expect([...colours(mono)]).toEqual(['#000000']);
  });

  test('draws nothing for a kind it does not know', () => {
    expect(drawConnector(shape({ type: 'nonsense' }))).toBe('');
  });
});
