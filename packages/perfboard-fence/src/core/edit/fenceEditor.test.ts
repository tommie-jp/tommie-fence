import { describe, expect, test } from 'vitest';
import { createPerfboardEditor } from './fenceEditor.ts';

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
    expect(editor.fieldsOf(LED, 'R1')?.can).toEqual(['id', 'type', 'value']);
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
    // 軸は足の真ん中なので、回った先が板に収まる所に置く。
    const room = 'board: 12x9\nparts:\n  R1: resistor e2 e6 10k\n';

    expect(editor.turn(room, 'R1', 1).ok).toBe(true);
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

    expect(result.ok && result.value.edits?.[0]?.text).toBe(' r90');
  });

  test('draws the band the map shows under the drawing', () => {
    const broken = 'board: 12x7\nparts:\n  R1: resistr b2 b6\n';

    expect(editor.view(broken, 1).issues).toContain('cf-issue');
  });

  test('says the Markdown line in the band, the same line a click jumps to', () => {
    // Arrange — フェンスの開き記号が Markdown の 10 行目、読めない行はその中の 3 行目。
    const broken = 'board: 12x7\nparts:\n  R1: resistr b2 b6\n';

    // Act
    const band = editor.view(broken, 10).issues;

    // Assert — 中の 1 行目が 11 行目なので、読めない行は 13 行目。押すとそこへ
    // 飛び、文面も 13 行目と言う (プレビュー・CLI・circuit と同じ)。
    expect(band).toContain('data-line="13"');
    expect(band).toContain('13 行目');
    expect(band).not.toMatch(/(?<!\d)3 行目/);
    expect(band).not.toContain('12 行目');
  });

  test('gives the Problems panel the same rows as the band, ERC only when asked', () => {
    // Arrange — 読めない行 (中の 4 行目) と、つないでいない抵抗 (ERC)。
    // **ERC は読めているときだけ掛ける**ので、見本を分ける (52 の docs/00)。
    const broken = 'board: 12x7\nparts:\n  R1: resistor b2 b6 1k\n  R2: resistr d2 d6\n';
    const loose = 'board: 12x7\nparts:\n  R1: resistor b2 b6 1k\n';

    // Act
    const unread = editor.problems?.(broken, 10, { erc: false }) ?? [];
    const quiet = editor.problems?.(loose, 10, { erc: false }) ?? [];
    const loud = editor.problems?.(loose, 10, { erc: true }) ?? [];

    // Assert
    expect(unread.filter((row) => row.kind === 'error').map((row) => row.line)).toEqual([14]);
    expect(unread).toHaveLength(editor.view(broken, 10).issues.split('<li').length - 1);
    expect(quiet.some((row) => row.kind === 'erc')).toBe(false);
    expect(loud.some((row) => row.kind === 'erc' && row.text.includes('つながっていません'))).toBe(true);
    expect(loud.filter((row) => row.kind === 'erc')).toHaveLength(editor.view(loose, 10).erc?.count ?? -1);
    for (const row of [...unread, ...loud]) expect(row.text).not.toContain('perfboard:');
  });

  test('hides notices under style: debug: off in the band and the Problems panel, like the preview', () => {
    // Arrange — 胴が重なる 2 つ (当たり判定のお知らせ)。
    const loud = 'board: 12x7\nparts:\n  R1: resistor b2 b6 1k\n  R2: resistor b3 b7 1k\n';
    const quiet = `style:\n  debug: off\n${loud}`;

    // Act / Assert
    expect(editor.problems?.(loud, 1, { erc: false }).some((row) => row.kind === 'notice')).toBe(true);
    expect(editor.problems?.(quiet, 1, { erc: false })).toEqual([]);
    expect(editor.view(quiet, 1).issues).toBe('');
  });

  test('still lists ERC under debug: off when the Problems panel asks for it', () => {
    // ERC は自分から頼んで見るもの (circuit の ercOf と同じ。debug: off は図に添える帯の話)。
    const quiet = 'style:\n  debug: off\nboard: 12x7\nparts:\n  R1: resistor b2 b6 1k\n';

    expect(editor.problems?.(quiet, 1, { erc: true }).some((row) => row.kind === 'erc')).toBe(true);
  });
});

/**
 * 交点の間へ置けるのは注釈だけ。**升目は既定で 1/10 升**を送ってくるので、
 * 刻めない相手に落ちたら**書き込む前に断る** (実機で「フェンス editor すべてで
 * 1/10 単位をデフォルトにする」)。
 */
describe('交点の間 (1/10 升)', () => {
  const SOURCE = [
    'board: 12x8',
    'points:',
    '  VCC: a1',
    'parts:',
    '  R1: resistor b3 b7 10k',
    'wires:',
    '  - a1 -- b3',
    'notes:',
    '  - text d3: ここ',
    '',
  ].join('\n');

  test('says the map may cut a cell into tenths', () => {
    expect(createPerfboardEditor().fine).toBe(10);
    expect(createPerfboardEditor().fineFor).toBe('note');
  });

  test('moves a note between crossings', () => {
    const moved = createPerfboardEditor().movePart(SOURCE, 'note:9', 'e5c3');

    expect(moved.ok).toBe(true);
    expect(moved.ok && (moved.value.edits ?? []).some((edit) => edit.text.includes('e5c3'))).toBe(true);
  });

  test('refuses a part, a wire end and a point between crossings', () => {
    const editor = createPerfboardEditor();

    expect(editor.movePart(SOURCE, 'R1', 'c5c3').ok).toBe(false);
    expect(editor.movePoint(SOURCE, 'a1', 'c5c3').ok).toBe(false);
    expect(editor.addWire(SOURCE, 'b3', 'c5c3', '--').ok).toBe(false);
  });
});
