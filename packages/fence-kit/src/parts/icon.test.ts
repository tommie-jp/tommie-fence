import { describe, expect, test } from 'vitest';
import { partIcon } from './icon.ts';

/**
 * パレットに出す部品の絵。**図と同じ関数で描く**ので、ここで見るのは
 * 「小さな画布に載って、種類ごとに違うものが出る」ことだけ。
 * 姿そのものは `bodies` と `packages` の受け持ち。
 */

describe('パレットの絵', () => {
  test('draws a two lead part inside a small canvas with its leads showing', () => {
    const drawn = partIcon('resistor');

    expect(drawn).toContain('class="cf-icon"');
    expect(drawn).toContain('viewBox=');
    expect(drawn).toContain('<line');
  });

  test('draws a different picture for each kind, so the name is not the only clue', () => {
    expect(partIcon('resistor')).not.toBe(partIcon('capacitor'));
    expect(partIcon('led')).not.toBe(partIcon('diode'));
  });

  test('follows the variant, since that is what the picture is for', () => {
    expect(partIcon('capacitor', { variant: 'electrolytic' })).not.toBe(partIcon('capacitor'));
    expect(partIcon('transistor', { variant: 'to220' })).not.toBe(partIcon('transistor'));
  });

  test('draws the packaged kinds as their package, since their legs come from the shape', () => {
    for (const type of ['transistor', 'potentiometer', 'slide-switch', 'thyristor', 'triac', 'regulator']) {
      expect(partIcon(type), type).toContain('class="cf-icon"');
    }
  });

  test('says nothing for a kind it cannot draw, rather than dropping the row', () => {
    // 絵が無いことより、行が消えるほうが困る (呼ぶ側が名前だけで並べる)。
    expect(partIcon('dip8')).toBeNull();
    expect(partIcon('device')).toBeNull();
  });

  test('lets the palette hand it its own colours', () => {
    // 胴の色はどのパッケージにも効く。板の色 (`plate`) を使うのはねじ穴を
    // 抜く形だけなので、そちらは TO-220 で見る。
    expect(partIcon('transistor', { chip: '#654321' })).toContain('#654321');
    expect(partIcon('transistor', { variant: 'to220', plate: '#123456' })).toContain('#123456');
  });

  test('lets the theme repaint the body it draws', () => {
    const painted = partIcon('resistor', { ink: { paint: () => '#ff00ff' } });

    expect(painted).toContain('#ff00ff');
  });
});
