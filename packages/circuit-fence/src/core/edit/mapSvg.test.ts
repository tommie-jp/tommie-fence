import { describe, expect, test } from 'vitest';
import { gridMap } from './map.ts';
import { renderMapHtml } from './mapSvg.ts';

const draw = (source: string): string => renderMapHtml(gridMap(source));

describe('renderMapHtml が描くもの', () => {
  test('draws one svg that scales to the panel', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 ');
  });

  test('draws a line for every wire', () => {
    expect(draw('wires:\n  - a1 -- a3\n')).toContain('class="cf-wire"');
  });

  test('dashes a wire whose end was only approximated', () => {
    // ピンの足の位置は TeX しか知らない。実線で引くと嘘の精度になる。
    const svg = draw('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a4\n');

    expect(svg).toContain('cf-approx');
  });

  test('draws the part between its two ends, not in one cell', () => {
    // 2 端子は両端の間に胴を置いて回す。片方の升に押し込めない。
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-lead"');
    expect(svg).toMatch(/rotate\(/);
  });

  test('names every part next to its shape', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('>R1</text>');
  });

  test('marks the crossings, so the grid reads as places to drop on', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('cf-grid-dot');
  });

  test('labels the rows and columns, so an address can be counted off', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-axis"');
    expect(svg).toContain('>a</text>');
  });

  test('lays a drop target over every crossing', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-cell" data-address="a1"');
    expect(svg).toContain('data-address="b2"');
  });

  test('offsets two parts spanning the same pair, so neither hides the other', () => {
    // 並列の RC は普通に書く。ぴったり重ねると後ろの 1 つを掴めない。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor a1 c1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(bodies).toHaveLength(2);
    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets a pair written end-for-end, which is the same two crossings', () => {
    // `a1 a3` と `a3 a1` は同じ 2 交点。並びで鍵を作ると別物になり、重なる。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor c1 a1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets two standing parts on one crossing, so neither hides the other', () => {
    const svg = draw('parts:\n  IN: port a1\n  G1: ground a1\n');

    expect(svg).toContain('data-part="IN"');
    expect(svg).toContain('data-part="G1"');
    expect(svg).toContain('translate(0,7)');
  });

  test('escapes what came from the fence, in text and in attributes', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3 "<img src=x>"\n');

    expect(svg).not.toContain('<img');
  });

  test('says so when the fence cannot be read, instead of an empty grid', () => {
    expect(draw('parts: [')).toContain('読めません');
  });
});

describe('向き', () => {
  test('draws a stub with its name for each pin of a multi-terminal part', () => {
    const svg = draw('parts:\n  Q1: npn b2\n');

    expect(svg).toContain('class="cf-pin"');
    expect(svg).toContain('>B</text>');
  });

  test('moves the stub to the side the pin turned to', () => {
    // 立っているとベースは左 (x が負) へ、r90 では上 (y が負) へ出る。
    expect(draw('parts:\n  Q1: npn b2\n')).toContain('x2="-20"');
    expect(draw('parts:\n  Q1: npn b2 r90\n')).toContain('y2="-15"');
  });

  test('turns a standing glyph that has no pins, so ground shows its direction', () => {
    expect(draw('parts:\n  G1: ground b2 r90\n')).toContain('rotate(90)');
  });

  test('leaves the box unturned, since its shape says nothing (the pins do)', () => {
    // **箱に落ちる種類で見る。** 記号を持つ種類 (npn) は回して見せる —
    // 形に向きの意味があるので、回さないと書いた向きが図に出ない。
    const svg = draw('parts:\n  U1: dip8 b2 r90\n');

    expect(svg).not.toContain('rotate(90)');
  });
});

describe('読めなかった行の印', () => {
  const badly = (source: string, bad: readonly number[]): string =>
    renderMapHtml(gridMap(source), new Set(bad));

  test('carries the line a part was written on, so the band can point at it', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('data-line="2"');
  });

  test('marks the part written on a line the band complained about', () => {
    const svg = badly('parts:\n  R1: resistor a1 a3\n  C1: capacitor a3 c3\n', [2]);

    expect(svg).toContain('class="cf-chip cf-bad" data-part="R1"');
    expect(svg).toContain('class="cf-chip" data-part="C1"');
  });

  test('marks the wire written on a line the band complained about', () => {
    const svg = badly('wires:\n  - a1 -- a3\n', [2]);

    expect(svg).toContain('cf-wire cf-bad');
  });

  test('marks nothing when the fence reads cleanly', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).not.toContain('cf-bad');
  });
});

describe('注釈', () => {
  const NOTE = 'parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: ここ\n';

  test('shows a text note as the words alone, with no frame around them', () => {
    // 実機で「text に枠は要らない」。字がそのまま読めるものに枠を足すと、
    // 字と枠の幅が食い違ったときに枠のほうが目立つ。
    const svg = draw(NOTE);

    expect(svg).toContain('ここ');
    expect(svg).not.toContain('cf-note-tag');
  });

  test('puts the frame back when the reader asks for it', () => {
    // 好みが分かれるところなので設定で戻せる。**既定は付けない**。
    const svg = renderMapHtml(gridMap(NOTE), undefined, { noteFrame: true });

    expect(svg).toContain('cf-note-tag');
  });

  test('keeps the frame on notes that have no words of their own', () => {
    // `circle` などは種類の名を出すだけなので、枠が「これは札だ」と言う。
    const svg = draw('parts:\n  R1: resistor a1 a3\nnotes:\n  - circle R1\n');

    expect(svg).toContain('cf-note-tag');
  });

  test('keeps the whole note on the tag, since the drawn words are cut', () => {
    const long = `parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: ${'あ'.repeat(30)}\n`;
    const svg = draw(long);

    expect(svg).toContain('…');
    expect(svg).toContain(`<title>${'あ'.repeat(30)}</title>`);
  });
});

describe('配線を掴む', () => {
  test('lays a fat invisible line over each wire, since 1.5px is too thin to hit', () => {
    const svg = draw('wires:\n  - a1 -- a3\n');

    expect(svg).toContain('cf-wire-hits');
    expect(svg).toContain('class="cf-wire-hit" data-line="2"');
  });

  test('puts the grab layer under the parts, so a part still takes the click', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\nwires:\n  - a1 -- c1\n');

    expect(svg.indexOf('cf-wire-hits')).toBeLessThan(svg.indexOf('cf-parts'));
  });
});
