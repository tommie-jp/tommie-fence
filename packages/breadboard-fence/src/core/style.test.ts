import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';
import { renderBreadboard } from './index.ts';
import { THEMES, THEME_NAMES } from './render/theme.ts';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const led = (style: string): string =>
  [
    'board: half',
    style,
    'parts:',
    '  R1: resistor a5 a10 330',
    '  D1: led b12(A) b13(K) red',
    'wires:',
    '  - +t5 -- a5 red',
    '  - a10 -- b12',
    '  - c13 -- -t13 black',
    '',
  ].join('\n');

/** 図に書き込まれた色をすべて拾う。テーマの取りこぼしは undefined として現れる。 */
const colorsOf = (svg: string): string[] =>
  [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1] ?? '');

const themed = (name: string) => THEMES[name]!;

describe('style', () => {
  test('draws in classic when the fence says nothing about style', () => {
    expect(renderBreadboard(led('')).svg).toBe(renderBreadboard(led('style: classic')).svg);
  });

  test('takes a bare theme name on one line', () => {
    const { svg, errors } = renderBreadboard(led('style: dark'));

    expect(errors).toEqual([]);
    expect(svg).toContain(themed('dark').palette.plate);
  });

  test('takes the same theme written as a map', () => {
    expect(renderBreadboard(led('style:\n  theme: dark')).svg).toBe(renderBreadboard(led('style: dark')).svg);
  });

  test('paints a background of its own in dark so the margin is not the page underneath', () => {
    const { svg } = renderBreadboard(led('style: dark'));

    expect(svg).toContain(`fill="${themed('dark').palette.canvas}"`);
    // classic は透明のまま。貼り先の地の色が透ける今までの見え方を変えない。
    expect(renderBreadboard(led('')).svg).not.toContain('<rect x="0" y="0"');
  });

  test('keeps the colours that carry meaning when the board goes monochrome', () => {
    const { svg } = renderBreadboard(led('style: mono'));

    // 配線の被覆の赤と、330Ω のカラーコード (橙) は実物の色そのものなので残る。
    expect(svg).toContain('#d33a2f');
    expect(svg).toContain('#e07b1e');
    expect(svg).toContain(themed('mono').palette.plate);
  });

  test('lets a single key move the board colour without leaving the old halo behind', () => {
    const { svg, errors } = renderBreadboard(led('style:\n  board-color: "#202020"'));

    expect(errors).toEqual([]);
    expect(svg).toContain('fill="#202020"');
    expect(svg).toContain('stroke="#202020"');
    expect(svg).not.toContain('#f2efe6');
  });

  test('scales the drawing to the width it was asked for without moving the coordinates', () => {
    const { svg, errors } = renderBreadboard(led('style:\n  width: 1256'));
    const plain = renderBreadboard(led('')).svg;

    const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1];
    expect(errors).toEqual([]);
    expect(svg).toContain('width="1256"');
    expect(viewBox).toBe(/viewBox="([^"]*)"/.exec(plain)?.[1]);
    // 外側の大きさだけが変わる = 中の座標も配線の経路もそのまま。
    expect(svg.split('\n').slice(1)).toEqual(plain.split('\n').slice(1));
  });

  test('reports a theme it does not know and draws in classic anyway', () => {
    const { svg, errors } = renderBreadboard(led('style: drak'));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('dark');
    expect(errors[0]?.line).toBe(2);
    expect(svg).toContain(themed('classic').palette.plate);
    expect(svg).not.toContain(themed('dark').palette.plate);
  });

  test('reports the key it could not read and keeps the ones it could', () => {
    const { svg, errors } = renderBreadboard(led('style:\n  theme: dark\n  hole-colour: "#fff"'));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('hole-colour');
    expect(svg).toContain(themed('dark').palette.plate);
  });

  test('points at the line of the key it could not read, not at the style key', () => {
    const source = led(['style:', '  theme: dark', '  wire-width: 4', '  hole-size: "big"'].join('\n'));
    const { errors } = renderBreadboard(source);

    // style: が 2 行目、hole-size は 5 行目。
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(5);
  });

  test('moves the printing to a readable ink when the board colour alone is made dark', () => {
    const { svg } = renderBreadboard(led('style:\n  board-color: "#202020"'));

    // 板だけ暗くして字が暗いまま残ると読めない。近いテーマの明るい印字へ寄せる。
    expect(svg).toContain(themed('dark').palette.partText);
    expect(svg).not.toContain(themed('classic').palette.partText);
  });

  test('keeps the classic ink when the board colour stays light', () => {
    const { svg } = renderBreadboard(led('style:\n  board-color: "#f8f4ec"'));

    expect(svg).toContain(themed('classic').palette.partText);
  });

  test('lets a wire cross another without its halo painting over it', () => {
    const crossing = [
      'style: dark',
      'wires:',
      '  - a5 -- a20 red',
      '  - c12 -- +t12 black',
      '',
    ].join('\n');
    const { svg } = renderBreadboard(crossing);
    const halo = themed('dark').palette.wireHalo!;

    // 縁取りをすべて敷いてから線を重ねる = 最後の縁取りより後ろに線が残っている。
    expect(svg.lastIndexOf(`stroke="${halo}"`)).toBeLessThan(svg.lastIndexOf('stroke="#d33a2f"'));
  });

  test('never writes a colour it did not check into the drawing', () => {
    const { svg, errors } = renderBreadboard(led('style:\n  board-color: red";onload=alert(1)'));

    expect(errors).toHaveLength(1);
    // 読めなかった値は属性にも、エラーの文面にも出さない。板は既定の色のまま。
    expect(svg).not.toContain('onload');
    expect(svg).toContain(themed('classic').palette.plate);
  });

  test('makes the captions bigger in presentation than in classic', () => {
    const sizeOf = (svg: string): number =>
      Number(/<text[^>]*font-size="([\d.]+)"[^>]*>R1 330</.exec(svg)?.[1]);

    expect(sizeOf(renderBreadboard(led('style: presentation')).svg))
      .toBeGreaterThan(sizeOf(renderBreadboard(led('')).svg));
  });
});

describe('every theme on every example', () => {
  const sources = readdirSync(EXAMPLES)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .flatMap((name) =>
      extractBreadboardFences(readFileSync(join(EXAMPLES, name), 'utf8'))
        .map((fence, index) => ({ name: `${name}#${index + 1}`, source: fence.source })),
    );

  const cases = sources.flatMap((example) =>
    THEME_NAMES.map((theme) => ({ label: `${example.name} in ${theme}`, source: example.source, theme })),
  );

  test('has an example to draw', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  // すでに style を書いてある例は、キーごと (ぶら下がった行も含めて) 外してから塗り替える。
  const withoutStyle = (source: string): string => source.replace(/^style:.*(?:\n[ \t]+.*)*\n?/m, '');

  test.each(cases)('$label draws with every colour resolved', ({ source, theme }) => {
    const { svg, errors } = renderBreadboard(`style: ${theme}\n${withoutStyle(source)}`);

    expect(errors).toEqual([]);
    for (const color of colorsOf(svg)) {
      expect(color, `${theme}: ${color}`).toMatch(/^(?:#[0-9a-f]{6}|none)$/i);
    }
  });
});
