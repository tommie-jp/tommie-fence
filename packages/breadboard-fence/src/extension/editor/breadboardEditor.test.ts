import { describe, expect, test } from 'vitest';
import { createBreadboardEditor } from './breadboardEditor.ts';

/**
 * マップと webview の**約束**。webview (fence-kit) が探す印を、フェンスが
 * 実際に出しているかを見る。
 *
 * **ここが食い違うと全部が黙って動かなくなる** — 掴めない、置けない、
 * 光らない。どれもエラーにならないので、テストで押さえておく。
 */

const editor = createBreadboardEditor();

const LED = `board: half
points:
  vin: a5
parts:
  R1: resistor a5 a10 330
wires:
  - a10 -- b12
`;

const NOTE = ['# ノート', '', '```breadboard', ...LED.split('\n'), '```', ''].join('\n');

describe('マップが出す印 (webview との約束)', () => {
  const { map } = editor.view(LED, 3);

  test('marks the holes the webview drops onto', () => {
    // `map.ts` は `.cf-cell[data-address="…"]` で置き先を引く。
    expect(map).toContain('class="cf-cell" data-address="a5"');
  });

  test('marks the parts the webview grabs', () => {
    expect(map).toContain('class="cf-chip" data-part="R1"');
  });

  test('marks the nodes the webview grabs', () => {
    expect(map).toContain('class="cf-dot" data-node="a5"');
  });

  test('marks the wires by their line, which is how they are selected', () => {
    expect(map).toContain('class="cf-wire" data-line="7"');
  });

  test('separates the layer that is grabbed from the layer that is dropped onto', () => {
    // 部品の升にも節点は立つ。層が分かれていないと、掴んだつもりと違うものが動く。
    expect(map).toContain('<g class="cf-hits">');
    expect(map).toContain('<g class="cf-marks">');
  });
});

describe('殻が呼ぶ口 (FenceEditor)', () => {
  test('finds the fence a cursor sits in, and the first one in a document', () => {
    expect(editor.fenceAt(NOTE, 6)?.line).toBe(3);
    expect(editor.firstFence(NOTE)?.line).toBe(3);
    expect(editor.fences(NOTE).map((one) => one.line)).toEqual([3]);
  });

  test('points at what the cursor is on', () => {
    expect(editor.aimAt(LED, 5, 4)).toEqual({ kind: 'part', id: 'R1' });
  });

  test('lights up where a part is written', () => {
    expect(editor.spansOf(LED, 'part', 'R1')).toHaveLength(2);
  });

  test('moves a part by the written address, not by a parsed one', () => {
    // **殻は文字列で話す。** 番地の綴りを知るのはこちら側だけ。
    const result = editor.movePart(LED, 'R1', 'c5');

    expect(result.ok).toBe(true);
  });

  test('refuses an address it cannot read, in words', () => {
    const result = editor.movePart(LED, 'R1', 'zz');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('読めません');
  });

  test('says which fields can be written, so the shell need not know the grammar', () => {
    expect(editor.fieldsOf(LED, 'R1')?.can).toEqual(['type', 'value', 'label']);
  });

  test('says so for what it cannot do yet, instead of doing nothing', () => {
    // 黙って何もしないと、押しても動かない道具ができる。
    const result = editor.addPart(LED, { id: 'R2', type: 'resistor', at: ['c5'] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('まだ');
  });

  test('draws the band the map shows under the drawing', () => {
    const broken = 'board: half\nparts:\n  R1: resistr a5 a10\n';

    expect(editor.view(broken, 1).issues).toContain('cf-issue');
  });
});
