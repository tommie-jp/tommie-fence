import { describe, expect, test } from 'vitest';
import { createBreadboardEditor } from './fenceEditor.ts';

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

  test('reaches a fence written with the short spelling ```bread', () => {
    const note = NOTE.replace('```breadboard', '```bread');

    expect(editor.language).toBe('bread');
    expect(editor.fenceAt(note, 6)?.line).toBe(3);
    expect(editor.fences(note).map((one) => one.line)).toEqual([3]);
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
    expect(editor.fieldsOf(LED, 'R1')?.can).toEqual(['id', 'type', 'value', 'label']);
  });

  test('places a part from the palette', () => {
    const result = editor.addPart(LED, { id: 'R2', type: 'resistor', at: ['c5', 'c10'] });

    expect(result.ok).toBe(true);
  });

  test('offers a palette and the type names the fields can use', () => {
    // **何が置けるかは部品の表そのもの。** webview 側に写しを持たない。
    expect(editor.palette()).toContain('data-type="resistor" data-ends="2"');
    expect(editor.typeNames('cf-type-names')).toContain('<option value="resistor"/>');
  });

  test('names a new part by its prefix', () => {
    expect(editor.nextId(LED, 'led')).toBe('D1');
  });

  test('turns a two lead part by its addresses, with no grammar change', () => {
    // 軸は足の真ん中なので、回った先が板に収まる所に置く。
    const room = 'board: half\nparts:\n  R1: resistor c5 c10 330\n';

    expect(editor.turn(room, 'R1', 1).ok).toBe(true);
    expect(editor.flip(LED, 'R1').ok).toBe(true);
  });

  test('turns a three lead part too, since its holes are all written', () => {
    const three = 'board: half\nparts:\n  Q1: transistor h9 h10 h11 2SC1815\n';

    expect(editor.turn(three, 'Q1', 1).ok).toBe(true);
  });

  test('turns a part placed by one anchor by writing the word, so R is one action', () => {
    // 掴む人にとって「回す」は 1 つの操作。番地で回すか語で書くかは中で分ける。
    const dip = 'board: half\nparts:\n  U1: dip8 @ e5 NE555\n';
    const result = editor.turn(dip, 'U1', 1);

    expect(result.ok && result.value.edits?.[0]?.text).toBe(' r180');
  });

  test('refuses to flip a DIP, since a real chip cannot go in upside down', () => {
    // 以前はアンカーを溝の向こうへ書き直していたが、それは実物の鏡像だった (52 の docs/71)。
    const dip = 'board: half\nparts:\n  U1: dip8 @ e5 NE555\n';
    const result = editor.flip(dip, 'U1');

    expect(result.ok).toBe(false);
  });

  test('draws the band the map shows under the drawing', () => {
    const broken = 'board: half\nparts:\n  R1: resistr a5 a10\n';

    expect(editor.view(broken, 1).issues).toContain('cf-issue');
  });

  test('says the Markdown line in the band, the same line a click jumps to', () => {
    // Arrange — フェンスの開き記号が Markdown の 10 行目、読めない行はその中の 3 行目。
    const broken = 'board: half\nparts:\n  R1: resistr a5 a10\n';

    // Act
    const band = editor.view(broken, 10).issues;

    // Assert — 中の 1 行目が 11 行目なので、読めない行は 13 行目。押すとそこへ
    // 飛び、文面も 13 行目と言う (プレビュー・CLI・circuit と同じ)。
    expect(band).toContain('data-line="13"');
    expect(band).toContain('13 行目');
    expect(band).not.toMatch(/(?<!\d)3 行目/);
    expect(band).not.toContain('12 行目');
  });

  test('gives the Problems panel the same rows as the band, and no ERC on this board', () => {
    // Arrange — 読めない行 (中の 4 行目)。この板は ERC を持たない。
    const source = 'board: half\nparts:\n  R1: resistor a5 a10 330\n  R2: resistr c5 c10\n';

    // Act
    const rows = editor.problems?.(source, 10, { erc: true }) ?? [];

    // Assert
    expect(rows.filter((row) => row.kind === 'error').map((row) => row.line)).toEqual([14]);
    expect(rows.some((row) => row.kind === 'erc')).toBe(false);
    expect(rows).toHaveLength(editor.view(source, 10).issues.split('<li').length - 1);
    for (const row of rows) expect(row.text).not.toContain('bread:');
  });

  test('hides notices under style: debug: off in the band and the Problems panel, like the preview', () => {
    // Arrange — 字の大きさが範囲の外 (お知らせ)。読めない行は無い。
    const loud = 'board: half\nstyle:\n  text-size: 99\nparts:\n  R1: resistor a5 a10 330\n';
    const quiet = loud.replace('style:\n', 'style:\n  debug: off\n');

    // Act / Assert — 伏せないときは 1 件、伏せると帯も Problems も空 (circuit と同じ)。
    expect(editor.problems?.(loud, 1, { erc: false }).map((row) => row.kind)).toEqual(['notice']);
    expect(editor.view(loud, 1).issues).toContain('cf-notice');
    expect(editor.problems?.(quiet, 1, { erc: false })).toEqual([]);
    expect(editor.view(quiet, 1).issues).toBe('');
  });

  test('never hides a line it could not read, even under debug: off', () => {
    const broken = 'board: half\nstyle:\n  debug: off\nparts:\n  R1: resistr a5 a10\n';

    expect(editor.problems?.(broken, 1, { erc: false }).map((row) => row.kind)).toEqual(['error']);
  });
});
