import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import type { PlacedPart } from '../types.ts';
import { partsListHeight, renderPartsList } from './partsList.ts';
import { DEFAULT_THEME } from './theme.ts';

const part = (id: string, type: string, value: string | null = null, label: string | null = null): PlacedPart => ({
  id, type, kind: 'two-lead', pins: [], bridges: [], value, label, at: null, line: 1,
});

const theme = DEFAULT_THEME;

const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');

const render = (parts: readonly PlacedPart[]): string => renderPartsList(parts, 14, 400, 636, theme);

describe('partsListHeight', () => {
  test('takes no room when there is nothing to list', () => {
    expect(partsListHeight([], theme)).toBe(0);
  });

  test('grows with the number of parts', () => {
    const one = partsListHeight([part('R1', 'resistor')], theme);
    const three = partsListHeight([part('R1', 'resistor'), part('R2', 'resistor'), part('C1', 'capacitor')], theme);

    expect(one).toBeGreaterThan(0);
    expect(three).toBeGreaterThan(one);
  });
});

describe('renderPartsList', () => {
  test('draws nothing when there is nothing to list', () => {
    expect(render([])).toBe('');
  });

  test('lists the id, the type and the value of every part in the order they were written', () => {
    const svg = render([part('R1', 'resistor', '330'), part('D1', 'led', 'red')]);

    expect(texts(svg)).toEqual(['R1', 'resistor', '330', 'D1', 'led', 'red']);
  });

  test('falls back to the label when a part has no value', () => {
    const svg = render([part('AD2', 'device', null, 'Analog Discovery 2')]);

    expect(texts(svg)).toContain('Analog Discovery 2');
  });

  test('leaves out the value column for a part that has neither value nor label', () => {
    expect(texts(render([part('R1', 'resistor')]))).toEqual(['R1', 'resistor']);
  });

  test('keeps every row inside the plate it draws', () => {
    const parts = [part('R1', 'resistor', '330'), part('C1', 'capacitor', '47uF')];
    const svg = render(parts);

    const plate = /<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
    const top = Number(plate?.[1]);
    const bottom = top + Number(plate?.[2]);
    const baselines = [...svg.matchAll(/<text[^>]*y="([\d.]+)"/g)].map((match) => Number(match[1]));

    expect(baselines).toHaveLength(6);
    for (const baseline of baselines) {
      expect(baseline).toBeGreaterThan(top);
      expect(baseline).toBeLessThan(bottom);
    }
    // 板の下には、続く帯との間の余白だけが残る。
    expect(partsListHeight(parts, theme)).toBeGreaterThan(bottom - top);
  });

  test('lines the three columns up so the list can be read down', () => {
    const svg = render([part('R1', 'resistor', '330'), part('C1', 'capacitor', '47uF')]);
    const columns = [...svg.matchAll(/<text[^>]*x="([\d.]+)"/g)].map((match) => Number(match[1]));

    expect(columns.slice(0, 3)).toEqual(columns.slice(3, 6));
    // 左から ID・種類・値の順に並ぶ。
    expect(columns[0]).toBeLessThan(columns[1] as number);
    expect(columns[1]).toBeLessThan(columns[2] as number);
  });

  test('shortens a value that would otherwise run off the right edge of the plate', () => {
    const long = 'あ'.repeat(200);
    const svg = render([part('R1', 'resistor', long)]);

    const shown = texts(svg)[2] ?? '';
    expect(shown.length).toBeLessThan(long.length);
    expect(shown.endsWith('…')).toBe(true);
  });

  test('keeps a full width value inside the plate, where a half width guess would let it run off', () => {
    const svg = render([part('R1', 'resistor', 'あ'.repeat(200))]);
    const cells = [...svg.matchAll(/<text[^>]*x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
    const [, valueX = '', size = '', shown = ''] = cells[2] ?? [];

    // 全角なので 1 文字ぶんの幅は字の大きさそのまま。板は x=14 から 636 幅。
    expect(Number(valueX) + [...shown].length * Number(size)).toBeLessThanOrEqual(14 + 636);
  });

  test('lists a long id in full, so two parts that share a prefix stay apart', () => {
    const ids = ['SUPPLY_DECOUPLE_A', 'SUPPLY_DECOUPLE_B'];
    const shown = texts(render(ids.map((id) => part(id, 'capacitor', '100uF'))));

    for (const id of ids) {
      expect(shown).toContain(id);
    }
    expect(shown).toContain('100uF');
  });

  test('never shortens an id, even when big text squeezes the columns', () => {
    const ids = ['SUPPLY_DECOUPLE_CAP_NEAR_U1', 'SUPPLY_DECOUPLE_CAP_NEAR_U2'];
    const big = { ...theme, metrics: { ...theme.metrics, textSize: 24 } };
    const svg = renderPartsList(ids.map((id) => part(id, 'capacitor', '100uF')), 14, 400, 636, big);

    for (const id of ids) {
      expect(texts(svg)).toContain(id);
    }
    // 値の列が残らないので値は諦める。板の外に字を置いてはいけない。
    for (const cellX of [...svg.matchAll(/<text[^>]*x="([\d.]+)"/g)].map((match) => Number(match[1]))) {
      expect(cellX).toBeLessThan(14 + 636);
    }
  });

  test('names a device the way the drawing labels its box, not by its value', () => {
    const device: PlacedPart = { ...part('AD2', 'device', '波形発生器', 'Analog Discovery 2'), kind: 'device' };

    expect(texts(render([device]))).toContain('Analog Discovery 2');
  });

  test('leaves a device with no label at two columns, since its box only shows the id', () => {
    const device: PlacedPart = { ...part('AD2', 'device', 'SIG'), kind: 'device' };

    expect(texts(render([device]))).toEqual(['AD2', 'device']);
  });

  test('backs the text with the same halo the drawing puts behind its captions', () => {
    const ink = { ...theme, palette: { ...theme.palette, partText: '#ffffff', textHalo: '#000000' } };
    const svg = renderPartsList([part('R1', 'resistor', '330')], 14, 400, 636, ink);

    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('paint-order="stroke"');
  });

  test('still shows a short type column, which is narrower than the room a column needs', () => {
    expect(texts(render([part('D1', 'led', 'red')]))).toEqual(['D1', 'led', 'red']);
  });

  test('gives up the columns that no longer fit, rather than pushing them off the plate', () => {
    const big = { ...theme, metrics: { ...theme.metrics, textSize: 24 } };
    const wide = part('SUPPLY_DECOUPLE_CAP_NEAR_U1', `dip${'0'.repeat(300)}8`, '100uF');
    const shown = texts(renderPartsList([wide], 14, 400, 636, big));

    // ID は丸ごと残し、種類は板の端で切り、値は図のキャプションに任せて落とす。
    expect(shown[0]).toBe('SUPPLY_DECOUPLE_CAP_NEAR_U1');
    expect(shown[1]?.endsWith('…')).toBe(true);
    expect(shown).toHaveLength(2);
  });

  test('holds back a type long enough to run off the plate', () => {
    const svg = render([part('U1', `dip${'0'.repeat(300)}8`, '100uF')]);
    const cells = [...svg.matchAll(/<text[^>]*x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
    const [, typeX = '', size = '', shown = ''] = cells[1] ?? [];

    expect(shown.endsWith('…')).toBe(true);
    expect(Number(typeX) + [...shown].length * Number(size)).toBeLessThanOrEqual(14 + 636);
  });

  test('sums up the parts that do not fit instead of growing without end', () => {
    const many = Array.from({ length: LIMITS.listedParts + 7 }, (_, index) => part(`R${index}`, 'resistor'));
    const shown = texts(render(many));

    expect(shown.filter((text) => text === 'resistor')).toHaveLength(LIMITS.listedParts);
    expect(shown).toContain('ほかに 7 件');
    // 部品が増えても高さは頭打ちになる。
    expect(partsListHeight([...many, part('X1', 'led')], theme)).toBe(partsListHeight(many, theme));
  });

  test('escapes markup that a value smuggles into the list', () => {
    const svg = render([part('R1', 'resistor', '</svg><script>alert(1)</script>')]);

    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('</svg>');
  });
});
