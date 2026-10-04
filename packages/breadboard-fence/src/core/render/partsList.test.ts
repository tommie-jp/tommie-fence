import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { DEFAULT_BOARD } from '../types.ts';
import type { Board, PlacedPart } from '../types.ts';
import { boardRow, partsListHeight, renderPartsList } from './partsList.ts';
import { DEFAULT_THEME } from './theme.ts';

const part = (id: string, type: string, value: string | null = null, label: string | null = null): PlacedPart => ({
  id, type, written: type, variant: null, kind: 'two-lead', pins: [], bridges: [], value, label, at: null, line: 1,
});

const theme = DEFAULT_THEME;
const HEAD = ['部品', '種類', '値', '色・記号'];


// 見える字だけ。縁だけを描く写し (aria-hidden) は数えない。
const allTexts = (svg: string): string[] => [...svg.matchAll(/<text(?![^>]*aria-hidden)[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');
// 見出しの字は除く (幅の足りない欄は見出しごと落ちるので、数ではなく字で除く)。
const texts = (svg: string): string[] => allTexts(svg).filter((text) => !HEAD.includes(text));
// 字の要素から、見出しの行を除いたもの。
const bodyCells = (svg: string): string[] =>
  [...svg.matchAll(/<text(?![^>]*aria-hidden)[^>]*>([^<]*)<\/text>/g)]
    .filter((match) => !HEAD.includes(match[1] ?? ''))
    .map((match) => match[0]);

const render = (parts: readonly PlacedPart[]): string => renderPartsList(parts, 14, 400, 636, theme);

const boardOf = (size: Board['size'], rails: Board['rails'] = DEFAULT_BOARD.rails): Board => ({ ...DEFAULT_BOARD, size, rails, columns: 30 });

describe('boardRow', () => {
  test('names the size with its hole count', () => {
    expect(boardRow(boardOf('half')).value).toBe('half (400 穴)');
    expect(boardRow(boardOf('full')).value).toBe('full (830 穴)');
  });

  test('says nothing of the rails when they are the default for the size', () => {
    expect(boardRow(boardOf('mini', null)).value).toBe('mini (170 穴)');
  });

  test('says so when the rails differ from the default for the size', () => {
    expect(boardRow(boardOf('half', null)).value).toBe('half (400 穴) レール無し');
    expect(boardRow(boardOf('mini')).value).toBe('mini (170 穴) レール有り');
  });

  test('is listed first and does not count against the part limit', () => {
    const parts = Array.from({ length: LIMITS.listedParts }, (_, i) => part(`R${i + 1}`, 'resistor'));
    const shown = texts(renderPartsList(parts, 14, 400, 636, theme, boardOf('half')));

    expect(shown[0]).toBe('基板');
    expect(shown).not.toContain(expect.stringContaining('ほかに'));
    expect(partsListHeight(parts, theme, boardOf('half'))).toBeGreaterThan(partsListHeight(parts, theme));
  });
});

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

  test('lists the id, the type and the value of every part, sorted by name', () => {
    const svg = render([part('R1', 'resistor', '330'), part('D1', 'led', 'red')]);

    expect(texts(svg)).toEqual(['D1', 'led', 'red', 'R1', 'resistor', '330']);
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
    const baselines = bodyCells(svg).map((text) => Number(/ y="([\d.]+)"/.exec(text)?.[1]));

    // C1 は胴の記号 (476) まで 4 欄、R1 は帯の色を四角で描くので字は 3 欄。
    expect(baselines).toHaveLength(7);
    for (const baseline of baselines) {
      expect(baseline).toBeGreaterThan(top);
      expect(baseline).toBeLessThan(bottom);
    }
    // 基板の下には、続く帯との間の余白だけが残る。
    expect(partsListHeight(parts, theme)).toBeGreaterThan(bottom - top);
  });

  test('lines the three columns up so the list can be read down', () => {
    const svg = render([part('R1', 'resistor', '330'), part('C1', 'capacitor', '47uF')]);
    const columns = bodyCells(svg).map((text) => Number(/x="([\d.]+)"/.exec(text)?.[1]));

    // C1 は 4 欄 (記号 476 まで)、R1 は字が 3 欄。
    expect(columns.slice(0, 3)).toEqual(columns.slice(4, 7));
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
    const cells = bodyCells(svg).map((text) => /x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</.exec(text) ?? []);
    const [, valueX = '', size = '', shown = ''] = cells[2] ?? [];

    // 全角なので 1 文字ぶんの幅は字の大きさそのまま。基板は x=14 から 636 幅。
    expect(Number(valueX) + [...shown].length * Number(size)).toBeLessThanOrEqual(14 + 636);
  });

  test('keeps astral full width characters inside the plate too (emoji, CJK ext B)', () => {
    // サロゲートペアの文字。BMP だけを見る幅の見積もりでは半角に数えてはみ出す。
    for (const wide of ['\u{20BB7}', '\u{1F50B}']) {
      const svg = render([part('R1', 'resistor', wide.repeat(200))]);
      const cells = bodyCells(svg).map((text) => /x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</.exec(text) ?? []);
      const [, valueX = '', size = '', shown = ''] = cells[2] ?? [];

      expect(shown.endsWith('…')).toBe(true);
      expect(Number(valueX) + [...shown].length * Number(size)).toBeLessThanOrEqual(14 + 636);
    }
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
    // 値の列が残らないので値は諦める。基板の外に字を置いてはいけない。
    for (const cellX of [...svg.matchAll(/<text(?![^>]*aria-hidden)[^>]*x="([\d.]+)"/g)].map((match) => Number(match[1]))) {
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

  test('adds what an IC does after its model, so the list says which chip is which', () => {
    const svg = render([part('U1', 'dip14', 'CD4081'), part('R1', 'resistor', '330')]);

    expect(texts(svg)).toEqual(['R1', 'resistor', '330', 'U1', 'dip14', 'CD4081 (2 入力 AND ×4)']);
  });

  test('finds the role of a chip whose model is written as its label, as a DIP is placed', () => {
    const svg = render([part('U1', 'dip14', null, 'CD4071')]);

    expect(texts(svg)).toContain('CD4071 (2 入力 OR ×4)');
  });

  test('sorts the rows by name, numbers as numbers', () => {
    // 表から部品を探すので名前の順に並べる (書いた順だと U1 の後に R1 が来て探しにくかった)。
    const svg = render([part('U1', 'dip14', 'CD4081'), part('R10', 'resistor', '1k'), part('R2', 'resistor', '330'), part('A', 'switch')]);
    const ids = texts(svg).filter((text) => ['A', 'R2', 'R10', 'U1'].includes(text));

    expect(ids).toEqual(['A', 'R2', 'R10', 'U1']);
  });

  test('writes the list in solid black on a light plate, not in the gray of the board print', () => {
    const svg = render([part('R1', 'resistor', '330')]);
    const fills = [...svg.matchAll(/<text [^>]*fill="(#[0-9a-f]+)"(?![^>]*aria-hidden)[^>]*>/g)].map((m) => m[1]);

    expect(new Set(fills)).toEqual(new Set(['#000000']));
    expect(svg).not.toMatch(/<text (?![^>]*aria-hidden)[^>]*opacity="0\.7"/);
  });

  test('writes the list in white on a dark plate', () => {
    const dark = { ...theme, palette: { ...theme.palette, plate: '#2b3038' } };
    const svg = renderPartsList([part('R1', 'resistor', '330')], 14, 400, 636, dark);

    expect(svg).toContain('fill="#ffffff"');
  });

  test('backs the text with the same halo the drawing puts behind its captions', () => {
    const ink = { ...theme, palette: { ...theme.palette, partText: '#ffffff', textHalo: '#000000' } };
    const svg = renderPartsList([part('R1', 'resistor', '330')], 14, 400, 636, ink);

    expect(svg).toContain('stroke="#000000"');
    // 図の名札と同じく、縁は半分透かす。
    expect(svg).toContain('opacity="0.5"');
  });

  test('still shows a short type column, which is narrower than the room a column needs', () => {
    expect(texts(render([part('D1', 'led', 'red')]))).toEqual(['D1', 'led', 'red']);
  });

  test('gives up the columns that no longer fit, rather than pushing them off the plate', () => {
    const big = { ...theme, metrics: { ...theme.metrics, textSize: 24 } };
    const wide = part('SUPPLY_DECOUPLE_CAP_NEAR_U1', `dip${'0'.repeat(300)}8`, '100uF');
    const shown = texts(renderPartsList([wide], 14, 400, 636, big));

    // ID は丸ごと残し、種類は基板の端で切り、値は図のキャプションに任せて落とす。
    expect(shown[0]).toBe('SUPPLY_DECOUPLE_CAP_NEAR_U1');
    expect(shown[1]?.endsWith('…')).toBe(true);
    expect(shown).toHaveLength(2);
  });

  test('holds back a type long enough to run off the plate', () => {
    const svg = render([part('U1', `dip${'0'.repeat(300)}8`, '100uF')]);
    const cells = bodyCells(svg).map((text) => /x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</.exec(text) ?? []);
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

  test('heads the list with the names of its columns', () => {
    const svg = render([part('R1', 'resistor', '10k')]);

    expect(allTexts(svg).slice(0, 4)).toEqual(HEAD);
  });

  test('draws the colour code of a resistor as swatches in the last column', () => {
    const svg = render([part('R1', 'resistor', '10k')]);
    const fills = [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]+)"[^>]*stroke-width="0.5"/g)].map((m) => m[1]);

    // 茶・黒・橙・茶の 4 本。
    expect(fills).toHaveLength(4);
  });

  test('prints the three digit code of a ceramic capacitor, and none for an electrolytic', () => {
    expect(texts(render([part('C1', 'capacitor', '100n')]))).toContain('104');
    const electrolytic: PlacedPart = { ...part('C1', 'capacitor', '10u'), variant: 'electrolytic' };
    expect(texts(render([electrolytic]))).toEqual(['C1', 'capacitor/electrolytic', '10u']);
  });

  test('escapes markup that a value smuggles into the list', () => {
    const svg = render([part('R1', 'resistor', '</svg><script>alert(1)</script>')]);

    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('</svg>');
  });
});
