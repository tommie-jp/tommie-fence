import { describe, expect, test } from 'vitest';
import { render } from './fences.ts';

/**
 * 描画そのものは各パッケージのテストが覆っている。ここで確かめるのは
 * **3 つを同じ形で返せているか** (画面はこの形だけを見て組み立てる)。
 */
describe('render', () => {
  test('breadboard は図とネットリストを返す', () => {
    // Arrange
    const source = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';

    // Act
    const output = render('breadboard', source);

    // Assert
    expect(output.svg).toMatch(/^<svg /);
    expect(output.tex).toBeNull();
    expect(output.netlist.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2']]);
    expect(output.broken).toBe(false);
  });

  test('perfboard も同じ形で返す', () => {
    const output = render('perfboard', 'board: 12x7\nparts:\n  R1: resistor b2 b6 10k\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.tex).toBeNull();
    expect(output.broken).toBe(false);
  });

  test('circuit は図の代わりに TeX を返す (ブラウザでは描けない)', () => {
    const output = render('circuit', 'parts:\n  R1: resistor a1 a2 10k\n');

    expect(output.svg).toBe('');
    expect(output.tex).toContain('circuitikz');
    expect(output.broken).toBe(false);
  });

  test('読めなかった行は CLI と同じ文面で返る (行番号・行の中身・印)', () => {
    const output = render('breadboard', 'board: half\nparts:\n  R1: resistr a5 a10\n');

    expect(output.broken).toBe(true);
    expect(output.messages[0]).toContain('3 行目');
    expect(output.messages[0]).toContain('R1: resistr a5 a10');
    expect(output.messages[0]).toContain('^^^^^^^');
  });

  test('circuit の報告も行の中身まで付く', () => {
    const output = render('circuit', 'parts:\n  R1: resistr a1 a2\n');

    expect(output.broken).toBe(true);
    expect(output.messages[0]).toContain('2 行目');
    expect(output.messages[0]).toContain('R1: resistr a1 a2');
  });
});
