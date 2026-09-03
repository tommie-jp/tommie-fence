import { describe, expect, test } from 'vitest';
import { chipOf } from './chip.ts';

describe('chipOf', () => {
  test('cuts one part out of the drawing, whole', () => {
    const map = '<svg><g class="cf-chip" data-part="R1"><rect/></g><g class="cf-chip" data-part="R2"/></svg>';

    expect(chipOf(map, 'R1')).toBe('<g class="cf-chip" data-part="R1"><rect/></g>');
  });

  test('counts the nested groups, so a posture group does not end the part', () => {
    // perfboard の 3 本足は姿勢の `g` を内側に持つ。最初の `</g>` で切ると
    // 胴だけが出て足とキャプションが落ちる。
    const map = '<svg><g class="cf-chip" data-part="Q1"><g transform="rotate(90)"><circle/></g><text/></g>後ろ</svg>';

    expect(chipOf(map, 'Q1')).toBe('<g class="cf-chip" data-part="Q1"><g transform="rotate(90)"><circle/></g><text/></g>');
  });

  test('reads the marks in either order', () => {
    const map = '<svg><g data-part="C1" class="cf-chip"><rect/></g></svg>';

    expect(chipOf(map, 'C1')).toBe('<g data-part="C1" class="cf-chip"><rect/></g>');
  });

  test('counts from the part, not from the top of the drawing', () => {
    // 図の頭から数えると、外側の `g` のぶんだけ深さがずれて閉じ札を 1 つ
    // 余計に拾う (実際に踏んだ — ゴーストの markup が `</g></g>` で終わっていた)。
    const map = '<svg><g class="cf-parts"><g class="cf-chip" data-part="L1"><path/></g></g></svg>';

    expect(chipOf(map, 'L1')).toBe('<g class="cf-chip" data-part="L1"><path/></g>');
  });

  test('is null for a part that is not in the drawing', () => {
    expect(chipOf('<svg></svg>', 'R1')).toBe(null);
    expect(chipOf('<svg><g class="cf-chip" data-part="R1">', 'R1')).toBe(null);
  });
});
