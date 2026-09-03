import { describe, expect, test } from 'vitest';
import { createPerfboardEditor } from './perfboardEditor.ts';

/**
 * マップと webview の**約束**。webview (fence-kit) が探す印を、フェンスが
 * 実際に出しているかを見る。
 *
 * **ここが食い違うと全部が黙って動かなくなる** — 掴めない、置けない、
 * 光らない。どれもエラーにならないので、テストで押さえておく。
 */

const editor = createPerfboardEditor();

const LED = `board: 12x7
points:
  IN: a1
parts:
  R1: resistor b2 b6 10k
wires:
  - a2 -- b2
`;

const NOTE = ['# ノート', '', '```perfboard', ...LED.split('\n'), '```', ''].join('\n');

describe('マップが出す印 (webview との約束)', () => {
  const { map } = editor.view(LED, 3);

  test('marks the holes the webview drops onto', () => {
    // `map.ts` は `.cf-cell[data-address="…"]` で置き先を引く。
    expect(map).toContain('class="cf-cell" data-address="b2"');
  });

  test('marks the parts the webview grabs', () => {
    expect(map).toContain('class="cf-chip" data-part="R1"');
  });

  test('marks the nodes the webview grabs', () => {
    expect(map).toContain('class="cf-dot" data-node="b2"');
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
    const result = editor.movePart(LED, 'R1', 'c2');

    expect(result.ok).toBe(true);
  });

  test('refuses an address it cannot read, in words', () => {
    const result = editor.movePart(LED, 'R1', 'zz');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('読めません');
  });

  test('says which fields can be written, so the shell need not know the grammar', () => {
    // **ラベルの欄はこの文法に無い。** 字を添えたいときは注釈で書く。
    expect(editor.fieldsOf(LED, 'R1')?.can).toEqual(['type', 'value']);
  });

  test('places a part from the palette', () => {
    expect(editor.addPart(LED, { id: 'R2', type: 'resistor', at: ['c2', 'c6'] }).ok).toBe(true);
  });

  test('offers a palette and the type names the fields can use', () => {
    expect(editor.palette()).toContain('data-type="resistor" data-ends="2"');
    expect(editor.typeNames('cf-type-names')).toContain('<option value="resistor"/>');
  });

  test('names a new part by its prefix', () => {
    expect(editor.nextId(LED, 'led')).toBe('D1');
  });

  test('turns a two lead part by its addresses, with no grammar change', () => {
    expect(editor.turn(LED, 'R1', 1).ok).toBe(true);
    expect(editor.flip(LED, 'R1').ok).toBe(true);
  });

  test('turns a three lead part too, since its holes are all written', () => {
    const three = 'board: 12x7\nparts:\n  Q1: transistor d2 d3 d4 2SC1815\n';

    expect(editor.turn(three, 'Q1', 1).ok).toBe(true);
  });

  test('turns a part placed by one anchor by writing the word, so R is one action', () => {
    // 掴む人にとって「回す」は 1 つの操作。番地で回すか語で書くかは中で分ける。
    const dip = 'board: 16x16\nparts:\n  U1: dip8 h8 NE555\n';
    const result = editor.turn(dip, 'U1', 1);

    expect(result.ok && result.value.edits[0]?.text).toBe(' r90');
  });

  test('draws the band the map shows under the drawing', () => {
    const broken = 'board: 12x7\nparts:\n  R1: resistr b2 b6\n';

    expect(editor.view(broken, 1).issues).toContain('cf-issue');
  });
});
