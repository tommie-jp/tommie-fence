import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { THEME } from './render/theme.ts';

/**
 * 板の外に置いたものが、題・画布の縁・列の名前とぶつからないこと。
 * 実物の図 (USB 電源スイッチ。板の上に注釈 3 つと、`-a10` に置いた機器) で
 * 題に字が食い込み、機器の箱と配線が列の名前を隠していた。
 */

type Text = { readonly x: number; readonly y: number; readonly content: string };

const textsOf = (svg: string): Text[] =>
  [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)]
    .map(([, x, y, content]) => ({ x: Number(x), y: Number(y), content: content ?? '' }));

const textNamed = (svg: string, content: string): Text => {
  const found = textsOf(svg).find((one) => one.content === content);
  if (found === undefined) throw new Error(`字が見つかりません: ${content}`);
  return found;
};

const canvasOf = (svg: string): { readonly width: number; readonly height: number } => {
  const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
  return { width: Number(width), height: Number(height) };
};

const plateY = (svg: string): number =>
  Number(new RegExp(`<rect x="[^"]+" y="([^"]+)"[^>]*fill="${THEME.palette.plate}"`).exec(svg)?.[1]);

const SIZE = THEME.metrics.textSize;
/** 字の上端と下端。縁取り (太さ 3) の半分も字の一部として数える。 */
const topOf = (text: Text): number => text.y - SIZE * 0.72 - 1.5;
const bottomOf = (text: Text): number => text.y + SIZE * 0.2 + 1.5;

describe('板の外に置いた注釈', () => {
  test('keeps a note written above the board clear of the title', () => {
    const { svg } = renderPerfboard('board: 20x4\ntitle: 図01 題\nnotes:\n  - text -a1: 上のレールへ');
    const title = textNamed(svg, '図01 題');

    expect(topOf(textNamed(svg, '上のレールへ'))).toBeGreaterThan(title.y + 13.5 * 0.2);
  });

  test('keeps a note written as far above the board as allowed inside the canvas', () => {
    // 板の外へ出られるのは 4 つ先まで (`-c` は 0・-a・-b の次)。
    const { svg } = renderPerfboard('board: 20x4\nnotes:\n  - text -c1: 上');

    expect(topOf(textNamed(svg, '上'))).toBeGreaterThanOrEqual(0);
  });

  test('keeps a note written below the board inside the canvas', () => {
    const { svg } = renderPerfboard('board: 20x4\nnotes:\n  - text g1 mirror: 下');

    expect(bottomOf(textNamed(svg, '下'))).toBeLessThanOrEqual(canvasOf(svg).height);
  });

  test('leaves the board where it was for notes written on the board', () => {
    const bare = renderPerfboard('board: 20x4\ntitle: 図01 題');
    const noted = renderPerfboard('board: 20x4\ntitle: 図01 題\nnotes:\n  - text a1: 上\n  - mark d4');

    expect(plateY(noted.svg)).toBe(plateY(bare.svg));
    expect(canvasOf(noted.svg)).toEqual(canvasOf(bare.svg));
  });
});

describe('列の名前', () => {
  const DEVICE = [
    'board: 12x6',
    'parts:',
    '  PWR:',
    '    type: device',
    '    at: -c3',
    '    label: 5V',
    '    pins: + -',
    'wires:',
    '  - PWR.+ -- a3 red',
    '  - PWR.- -- a4 black',
  ].join('\n');

  test('is drawn over the device and its wires, so a wire crossing it does not hide it', () => {
    const { svg } = renderPerfboard(DEVICE);
    const label = svg.search(new RegExp(`fill="${THEME.palette.label}"[^>]*>3</text>`));
    const box = svg.indexOf(`fill="${THEME.palette.body}"`);

    expect(box).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(box);
  });
});

describe('番地で置いた機器の箱', () => {
  const device = (at: string): string => [
    'board: 20x4',
    'parts:',
    '  USB:',
    '    type: device',
    `    at: ${at}`,
    '    pins: "- +"',
  ].join('\n');

  test('says so when the box comes down over the board, and where it would clear it', () => {
    const said = renderPerfboard(device('-a10')).notices.map((one) => one.message).join('\n');

    expect(said).toMatch(/USB の箱が板に重なっています/);
    expect(said).toMatch(/-b10/);
  });

  test('keeps quiet when the box clears the board', () => {
    const said = renderPerfboard(device('-b10')).notices.map((one) => one.message).join('\n');

    expect(said).not.toMatch(/重なっています/);
  });
});

describe('列の名前の縁取り', () => {
  test('rings the names in the page colour, so a dark wire under a name does not swallow it', () => {
    const { svg } = renderPerfboard('board: 12x6');
    const name = /<text [^>]*>3<\/text>/.exec(svg)?.[0] ?? '';

    expect(name).toContain('stroke="#ffffff"');
    expect(name).toContain('paint-order="stroke"');
  });

  test('rings them in the canvas colour when the theme paints one', () => {
    const { svg } = renderPerfboard('board: 12x6\nstyle: dark');
    const name = /<text [^>]*>3<\/text>/.exec(svg)?.[0] ?? '';

    expect(name).not.toContain('stroke="#ffffff"');
    expect(name).toContain('paint-order="stroke"');
  });
});
