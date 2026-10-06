import { describe, expect, test } from 'vitest';
import { hasSheets, mergeNetlists, renderSheets, sourceLineOf, splitSheets, stackSheets } from './sheets.ts';
import type { Net } from './nets.ts';

const SOURCE = [
  'board: 5x5',            // 1
  'sheets:',               // 2
  '  - name: 電源',         // 3
  '    parts:',            // 4
  '      - R1: resistor a1 a3', // 5
  '  - name: アンプ',        // 6
  '    style:',            // 7
  '      theme: dark',     // 8
  '    parts:',            // 9
  '      - R2: resistor b1 b3', // 10
  'links:',                // 11
  '  - 電源.GND アンプ.GND', // 12
].join('\n');

describe('hasSheets', () => {
  test('returns true only when sheets: is a top-level key', () => {
    expect(hasSheets(SOURCE)).toBe(true);
    expect(hasSheets('board: 5x5\nparts:\n  - R1: resistor a1 a3')).toBe(false);
    expect(hasSheets('# sheets:\nboard: 5x5')).toBe(false);
    expect(hasSheets('parts:\n  - sheets: x')).toBe(false);
  });
});

describe('splitSheets', () => {
  test('cuts each sheet out with its indent removed and keeps line numbers mappable', () => {
    const split = splitSheets(SOURCE);
    expect(split.problems).toEqual([]);
    expect(split.sheets.map((sheet) => sheet.name)).toEqual(['電源', 'アンプ']);
    const [power, amp] = split.sheets;
    expect(power?.text.split('\n').slice(0, 3)).toEqual(['title: "電源"', 'parts:', '  - R1: resistor a1 a3']);
    expect(power?.firstLine).toBe(3);
    // 3 行目 (元の 5 行目) の R1 は枚の 3 行目
    expect(sourceLineOf(power!, 3)).toBe(5);
    expect(amp?.firstLine).toBe(6);
    expect(sourceLineOf(amp!, 5)).toBe(10);
  });

  test('adds the shared board: to a sheet that does not write one, and not to one that does', () => {
    const split = splitSheets('board: 5x5\nsheets:\n  - name: a\n  - name: b\n    board: 7x5cm');
    expect(split.sheets[0]?.text).toContain('board: 5x5');
    expect(split.sheets[1]?.text).not.toContain('board: 5x5');
    // 足した行の誤りは共通の board: の行へ寄る
    expect(sourceLineOf(split.sheets[0]!, 99)).toBe(1);
  });

  test('lets a fence name more shared keys', () => {
    const split = splitSheets('f: 2.4G\nsheets:\n  - name: a', { shared: ['f'] });
    expect(split.problems).toEqual([]);
    expect(split.sheets[0]?.text).toContain('f: 2.4G');
    expect(splitSheets('f: 2.4G\nsheets:\n  - name: a').problems[0]?.message).toContain('f');
  });

  test('keeps a sheet title: over the sheet name', () => {
    const split = splitSheets('sheets:\n  - name: a\n    title: 題');
    expect(split.sheets[0]?.text).not.toContain('title: "a"');
    expect(split.sheets[0]?.text).toContain('title: 題');
  });

  test('puts the top-level title in front of each sheet title', () => {
    const split = splitSheets('title: 図01 アンプ\nsheets:\n  - name: 電源\n  - parts:\n      - R1: x');
    expect(split.problems).toEqual([]);
    expect(split.sheets[0]?.text).toContain('title: "図01 アンプ・電源"');
    expect(split.sheets[1]?.text).toContain('title: "図01 アンプ (2/2)"');
  });

  test('names unnamed sheets sheetN', () => {
    const split = splitSheets('sheets:\n  - parts:\n      - R1: resistor a1 a3\n  - board: 5x5');
    expect(split.sheets.map((sheet) => sheet.name)).toEqual(['sheet1', 'sheet2']);
  });

  test('reports unknown top-level keys, duplicate names, bad names and an empty sheets:', () => {
    const unknown = splitSheets('sheets:\n  - name: a\nparts:\n  - x');
    expect(unknown.problems[0]?.message).toContain('parts');
    expect(unknown.problems[0]?.line).toBe(3);
    expect(splitSheets('sheets:\n  - name: a\n  - name: a').problems[0]?.message).toContain('重なって');
    expect(splitSheets('sheets:\n  - name: a b').problems[0]?.message).toContain('空白');
    expect(splitSheets('sheets:').problems[0]?.message).toContain('1 つもありません');
    expect(splitSheets('sheets: [a]').problems[0]?.message).toContain('次の行から');
  });
});

const net = (name: string, refs: string[]): Net => ({ name, strips: [`${name}-s`], refs });

describe('mergeNetlists', () => {
  test('names every net with its sheet and keeps same-named nets of different sheets apart', () => {
    const merged = mergeNetlists([
      { sheet: 'a', nets: [net('N1', ['R1'])] },
      { sheet: 'b', nets: [net('N1', ['R2'])] },
    ], []);
    expect(merged.netlist.map((one) => one.name)).toEqual(['a.N1', 'b.N1']);
    expect(merged.netlist[0]?.strips).toEqual(['a/N1-s']);
  });

  test('joins nets named by a link and calls them by the shared name', () => {
    const merged = mergeNetlists([
      { sheet: 'a', nets: [net('GND', ['R1']), net('N1', ['R1'])] },
      { sheet: 'b', nets: [net('GND', ['R2'])] },
    ], [{ tokens: ['a.GND', 'b.GND'], line: 9 }]);
    expect(merged.problems).toEqual([]);
    expect(merged.netlist.map((one) => one.name)).toEqual(['GND', 'a.N1']);
    expect(merged.netlist[0]?.refs).toEqual(['R1', 'R2']);
  });

  test('joins nets with different names under the first one written', () => {
    const merged = mergeNetlists([
      { sheet: 'a', nets: [net('OUT', ['R1'])] },
      { sheet: 'b', nets: [net('IN', ['R2'])] },
    ], [{ tokens: ['a.OUT', 'b.IN'], line: 1 }]);
    expect(merged.netlist).toHaveLength(1);
    expect(merged.netlist[0]?.name).toBe('a.OUT');
  });

  test('reports links that name no sheet, no net, or fewer than two ends', () => {
    const parts = [{ sheet: 'a', nets: [net('GND', ['R1'])] }];
    expect(mergeNetlists(parts, [{ tokens: ['x.GND', 'a.GND'], line: 4 }]).problems[0]?.message).toContain('枚がありません');
    const missing = mergeNetlists(parts, [{ tokens: ['a.VCC', 'a.GND'], line: 4 }]).problems[0];
    expect(missing?.message).toContain('節点が a にありません');
    expect(missing?.message).toContain('GND');
    expect(mergeNetlists(parts, [{ tokens: ['a.GND'], line: 4 }]).problems[0]?.message).toContain('2 つ以上');
    expect(mergeNetlists(parts, [{ tokens: ['GND', 'a.GND'], line: 4 }]).problems[0]?.message).toContain('枚の名前.節点の名前');
  });
});

describe('stackSheets', () => {
  const svg = (w: number, h: number, body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-x-fence="1.0" role="img">${body}</svg>`;

  test('stacks sheets vertically with a gap and keeps the root marks of the first sheet', () => {
    const out = stackSheets([svg(100, 50, '<g/>'), svg(80, 40, '<g/>')]);
    expect(out).toContain('viewBox="0 0 100 106"');
    expect(out).toContain('data-x-fence="1.0"');
    expect(out).toContain('<svg x="0" y="66" width="80" height="40" viewBox="0 0 80 40">');
  });

  test('gives each sheet its own ids so that two sheets do not share one pattern', () => {
    const body = (id: string): string => `<defs><pattern id="${id}"/></defs><rect fill="url(#${id})"/>`;
    const out = stackSheets([svg(10, 10, body('h1')), svg(10, 10, body('h1'))]);
    expect(out).toContain('id="s0-h1"');
    expect(out).toContain('url(#s1-h1)');
    expect(out).not.toContain('id="h1"');
  });

  test('returns an empty string when no sheet drew anything', () => {
    expect(stackSheets(['', ''])).toBe('');
  });
});

describe('renderSheets', () => {
  type E = { message: string; line: number | null; notice?: boolean };
  const fake = (text: string, options: { offset: number }) => ({
    svg: `<svg viewBox="0 0 10 10" width="10" height="10"></svg>`,
    netlist: [{ name: 'GND', strips: ['s'], refs: [/R\d/.exec(text)?.[0] ?? 'R0'] }] as Net[],
    errors: text.includes('bad') ? [{ message: 'bad', line: 2 + options.offset }] : ([] as E[]),
    notices: [] as E[],
    erc: [] as E[],
    errorHtml: '',
  });
  const kit = {
    makeError: (message: string, line: number | null, notice: boolean): E => ({ message, line, ...(notice ? { notice } : {}) }),
    banner: (errors: readonly E[]): string => `[${errors.length}]`,
  };

  test('passes each sheet its line offset so that errors come back in fence lines', () => {
    const source = 'sheets:\n  - name: a\n    parts: R1\n  - name: b\n    bad: R2';
    const result = renderSheets(source, { offset: 10 }, fake, kit);
    // 枚 b は元の 4 行目から。枚の中の 2 行目 = 元の 5 行目、それに fence の 10 行
    expect(result.errors).toEqual([{ message: 'bad', line: 15 }]);
    expect(result.netlist.map((one) => one.name)).toEqual(['a.GND', 'b.GND']);
  });

  test('merges linked nets and reports a part name used on two sheets', () => {
    const source = 'sheets:\n  - name: a\n    parts: R1\n  - name: b\n    parts: R1\nlinks:\n  - a.GND b.GND';
    const result = renderSheets(source, {}, fake, kit);
    expect(result.netlist).toHaveLength(1);
    expect(result.netlist[0]?.name).toBe('GND');
    expect(result.notices.some((one) => one.message.includes('R1'))).toBe(true);
    expect(result.errorHtml).toBe('[1]');
  });

  test('reports link mistakes as errors with the link line', () => {
    const source = 'sheets:\n  - name: a\n    parts: R1\nlinks:\n  - a.GND z.GND';
    const result = renderSheets(source, { offset: 3 }, fake, kit);
    expect(result.errors).toEqual([expect.objectContaining({ line: 8 })]);
  });
});
