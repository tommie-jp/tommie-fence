// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { layDom, nextFrame } from './domFixture.ts';
import type { Posted } from './domFixture.ts';
import { panelHtml } from '../panelHtml.ts';

/**
 * **webview の段取り** (`map.ts`)。カーソルの下を読み、状態遷移へ流し、
 * 出てきた印を図に付け、拡張へ知らせを送るところ。
 *
 * ここが node のテストから見えていなかったので、実機で踏んだ不具合
 * (右クリックの一覧が効かない・影がカーソルに付いてこない) を誰も見張って
 * いなかった (52 の docs/28)。幾何は `domFixture` が埋める。
 *
 * 見るのは**送った知らせと、図に付いた印**。座標や色は見ない (そこは実機と
 * playground で見る)。
 */

/** 升 1 つの大きさ。足場の当たり判定に使うだけなので、切りのいい数にする。 */
const CELL = 20;

/** 図の中の升 1 つ。`data-box` が当たり判定 (足場が読む)。 */
const cell = (address: string, col: number, row: number): string =>
  `<rect class="cf-cell" data-address="${address}"`
  + ` data-box="${col * CELL},${row * CELL},${CELL},${CELL}"></rect>`;

const chip = (id: string, col: number, row: number, note = false): string =>
  `<g class="cf-chip" data-part="${id}"${note ? ' data-note="1"' : ''}`
  + ` data-box="${col * CELL + 2},${row * CELL + 2},${CELL - 4},${CELL - 4}"><rect/></g>`;

const wire = (line: string, col: number, row: number): string =>
  `<g class="cf-wire" data-line="${line}" data-box="${col * CELL},${row * CELL},${CELL * 2},${CELL}">`
  + `<line class="cf-wire-hit" data-line="${line}" data-box="${col * CELL},${row * CELL},${CELL * 2},${CELL}"/>`
  + `<circle class="cf-wire-end" data-line="${line}" data-end="from"`
  + ` data-box="${col * CELL},${row * CELL},4,4"/>`
  + `<circle class="cf-wire-end" data-line="${line}" data-end="to"`
  + ` data-box="${col * CELL + CELL * 2 - 4},${row * CELL},4,4"/></g>`;

/**
 * 張りぼての図。**升は 3 つ、部品は 2 つ、配線は 1 本、注釈は 1 つ。**
 * 段取りを見るのに要る最小限で、増やしても見えるものは増えない。
 */
const MAP = `<svg data-box="0,0,400,200">`
  + cell('a1', 1, 1) + cell('a2', 2, 1) + cell('a3', 3, 1) + cell('b1', 1, 2)
  + chip('R1', 1, 1) + chip('D1', 3, 1) + chip('note:9', 1, 2, true)
  + wire('7', 5, 1)
  + `</svg>`;

const bodyHtml = (): string => {
  const whole = panelHtml({
    cspSource: 'vscode-resource:',
    nonce: 'n',
    scriptUri: 'map.js',
    undo: 'own',
    view: {
      html: MAP,
      picker: '',
      issues: '',
      chrome: {
        palette: '<button class="cf-pick" data-type="resistor" data-ends="2" data-find="resistor"></button>',
        typeNames: '',
        colorNames: '',
        swatches: '<button type="button" class="cf-swatch" data-color="red"><span></span>red</button>',
        foldsWire: false,
        fine: null,
        fineFor: 'all',
      },
    },
  });
  return whole.slice(whole.indexOf('<body'), whole.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
};

/** 升の真ん中の画面座標。 */
const at = (col: number, row: number) => ({ clientX: col * CELL + CELL / 2, clientY: row * CELL + CELL / 2 });

let posted: Posted[];

/** 出来事を 1 つ。**`map.ts` は `document` で受ける**ので、そこへ送る。 */
const fire = (kind: string, detail: Record<string, unknown> = {}): void => {
  const { target, ...rest } = detail;
  const event = new Event(kind, { bubbles: true, cancelable: true });
  // `target` は読み取り専用なので載せない — 流す先で決まる。
  Object.assign(event, {
    clientX: 0, clientY: 0, button: 0, buttons: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    ...rest,
  });
  ((target as Element | undefined) ?? document.querySelector('.cf-body svg') ?? document.body).dispatchEvent(event);
};

/** ゴーストの答えを返す (門は 1 つずつしか送らないので、返さないと次が出ない)。 */
const answerGhost = async (over: Record<string, unknown> = {}): Promise<void> => {
  const asked = [...posted].reverse().find((one) => one.kind === 'preview');
  if (asked === undefined) return;
  window.dispatchEvent(new MessageEvent('message', {
    data: { kind: 'ghost', key: asked['key'], cells: ['a2'], ok: true, why: '', from: ['a1'], ...over },
  }));
  await nextFrame();
};

/** その札を押す。**`click` で受けているもの**を見るとき (道具・ボタン)。 */
const click = (selector: string): void => {
  document.querySelector(selector)?.dispatchEvent(new Event('click', { bubbles: true }));
};

const key = (name: string, detail: Record<string, unknown> = {}): void => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...detail });
  document.body.dispatchEvent(event);
};

const sentKinds = (): readonly string[] => posted.map((one) => one.kind);
const lastOf = (kind: string): Posted | undefined => [...posted].reverse().find((one) => one.kind === kind);
const status = (): string => document.querySelector('.cf-status')?.textContent ?? '';
/** いまのズーム率 (%)。帯に出ている字から読む。 */
const zoom = (): number => Number((document.querySelector('.kc-zoom')?.textContent ?? '0').replace(/[^0-9]/g, ''));
/** 長押しと見なすまでの待ち (`map.ts` と揃える)。 */
const LONG_PRESS = 500;
const marked = (className: string): readonly string[] =>
  [...document.querySelectorAll(`.${className}`)].map((one) => one.getAttribute('data-part')
    ?? one.getAttribute('data-line') ?? one.getAttribute('data-address') ?? one.className.toString());

beforeEach(async () => {
  const laid = layDom(bodyHtml());
  posted = laid.posted;
  // **読み込みは 1 度きり**なので、毎回モジュールの記憶を捨てて入れ直す。
  const { resetModules } = await import('vitest').then((one) => ({ resetModules: one.vi.resetModules }));
  resetModules();
  await import('./map.ts');
  await nextFrame();
  posted.length = 0;
});

describe('カーソルの下', () => {
  test('marks the part under the cursor, so the keys show what they will hit', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    expect(marked('cf-hover')).toContain('R1');
    expect(status()).toContain('R1');
  });

  test('says what the keys do when nothing is under the cursor', async () => {
    fire('pointermove', { clientX: 380, clientY: 190 });
    await nextFrame();

    expect(status()).toContain('A 部品を置く');
  });

  test('reads the wire under the cursor, not only the parts', async () => {
    fire('pointermove', at(5, 1));
    await nextFrame();

    expect(status()).toContain('7 行目の配線');
  });
});

describe('選ぶ', () => {
  test('tells the extension what was clicked, so the panel can show its fields', () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));

    expect(lastOf('select')).toMatchObject({ what: 'part', id: 'R1' });
  });

  test('lets go when the empty board is clicked', () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    posted.length = 0;

    fire('pointermove', { clientX: 380, clientY: 190 });
    fire('pointerdown', { clientX: 380, clientY: 190 });
    fire('pointerup', { clientX: 380, clientY: 190 });

    expect(lastOf('select')).toEqual({ kind: 'select' });
  });

  test('adds to the group with Shift, so a scattered set can be built', () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', { ...at(1, 1), shiftKey: true });
    fire('pointermove', at(3, 1));
    fire('pointerdown', { ...at(3, 1), shiftKey: true });

    expect(status()).toContain('2 個');
  });
});

describe('鍵', () => {
  test('turns and flips what the cursor is over', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('r');
    key('x');

    expect(posted).toContainEqual({ kind: 'turn', part: 'R1', quarters: 1 });
    expect(posted).toContainEqual({ kind: 'flip', part: 'R1' });
  });

  test('turns the other way with Shift', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('R', { shiftKey: true });

    expect(lastOf('turn')).toMatchObject({ quarters: -1 });
  });

  test('deletes the part under the cursor', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('Delete');

    expect(lastOf('delete')).toMatchObject({ what: 'part', id: 'R1' });
  });

  test('duplicates with Ctrl+D, which the panel has to catch itself', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('d', { ctrlKey: true });

    expect(lastOf('duplicate')).toMatchObject({ part: 'R1' });
  });

  test('undoes and redoes for the panel, since VS Code cannot reach it there', () => {
    key('z', { ctrlKey: true });
    key('z', { ctrlKey: true, shiftKey: true });

    expect(sentKinds()).toContain('undo');
    expect(sentKinds()).toContain('redo');
  });

  test('copies the words of a note', async () => {
    fire('pointermove', at(1, 2));
    await nextFrame();

    key('c');

    expect(lastOf('copyText')).toMatchObject({ part: 'note:9' });
  });

  test('nudges with the arrows, letting the fence count the step', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('ArrowRight');

    expect(lastOf('nudge')).toMatchObject({ part: 'R1', rows: 0, cols: 1 });
  });
});

describe('持ち上げて動かす', () => {
  test('asks for a ghost as soon as the part is lifted', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    key('m');
    await nextFrame();

    expect(lastOf('preview')).toMatchObject({ what: 'move', part: 'R1' });
    expect(status()).toContain('動かしています');
  });

  test('asks again when the cursor crosses into the next hole', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('m');
    await nextFrame();
    // **門は 1 つずつ送る** ので、答えないと次の問い合わせは出ない。
    await answerGhost();
    posted.length = 0;

    fire('pointermove', at(2, 1));
    await nextFrame();

    expect(lastOf('preview')).toMatchObject({ to: 'a2' });
  });

  test('drops it where it was clicked', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('m');
    await nextFrame();

    fire('pointermove', at(2, 1));
    fire('pointerdown', at(2, 1));
    fire('pointerup', at(2, 1));

    expect(lastOf('move')).toMatchObject({ part: 'R1', to: 'a2' });
  });

  test('puts it back on Escape, without telling the extension anything', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('m');
    await nextFrame();
    posted.length = 0;

    key('Escape');
    await nextFrame();

    expect(sentKinds()).not.toContain('move');
  });
});

describe('置く', () => {
  test('picks a part from the palette and carries it', async () => {
    const pick = document.querySelector('.cf-pick') as HTMLElement;
    pick.dispatchEvent(new Event('click', { bubbles: true }));
    await nextFrame();

    expect(status()).toContain('resistor を置きます');
  });

  test('asks for the ghost of what it carries, with the turn it was given', async () => {
    (document.querySelector('.cf-pick') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    fire('pointermove', at(1, 1));
    await nextFrame();
    await answerGhost();
    key('r');
    await nextFrame();

    expect(lastOf('preview')).toMatchObject({ what: 'place', type: 'resistor', turn: 1 });
  });

  test('places it where it was clicked, orientation and all', async () => {
    (document.querySelector('.cf-pick') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('x');
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));

    expect(lastOf('addPart')).toMatchObject({ type: 'resistor', at: ['a1'], flip: true });
  });
});

/**
 * 狭い画面の引き出し。**属性と部品の一覧は普段しまってある**ので、
 * 開け閉ての段取りだけがここの受け持ち (畳み方そのものは CSS)。
 */
describe('属性の引き出し', () => {
  test('opens and closes from the button in the top bar', () => {
    click('.kc-props-toggle');
    expect(document.body.classList.contains('kc-drawer')).toBe(true);

    click('.kc-props-toggle');
    expect(document.body.classList.contains('kc-drawer')).toBe(false);
  });

  test('closes when the figure is touched, since the drawer sits over it', () => {
    click('.kc-props-toggle');
    fire('pointerdown', at(1, 1));

    expect(document.body.classList.contains('kc-drawer')).toBe(false);
  });

  test('stays open while the panel itself is being used', () => {
    click('.kc-props-toggle');
    fire('pointerdown', { target: document.querySelector('.kc-props') });

    expect(document.body.classList.contains('kc-drawer')).toBe(true);
  });
});

/**
 * 指の操作 (52 の docs/32)。**1 本の意味はマウスと同じ**に保ち、
 * 移動と拡大は 2 本へ寄せる。1 本と 2 本は混じらないので取り合いにならない。
 */
describe('指で触る', () => {
  const touch = (kind: string, id: number, x: number, y: number, more: Record<string, unknown> = {}): void => {
    fire(kind, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, buttons: 1, ...more });
  };

  test('pans with two fingers, which one finger never does', () => {
    const box = document.querySelector('.kc-canvas') as HTMLElement;
    box.scrollLeft = 100;
    box.scrollTop = 100;

    touch('pointerdown', 1, 200, 200);
    touch('pointerdown', 2, 240, 200);
    touch('pointermove', 1, 170, 180);
    touch('pointermove', 2, 210, 180);

    // 2 本の真ん中が (-30, -20) 動いたので、図はその逆へスクロールする。
    expect(box.scrollLeft).toBe(130);
    expect(box.scrollTop).toBe(120);
  });

  test('zooms on a pinch, by how much the two fingers spread', () => {
    const before = zoom();

    touch('pointerdown', 1, 200, 200);
    touch('pointerdown', 2, 300, 200);
    touch('pointermove', 2, 400, 200);

    expect(zoom()).toBeGreaterThan(before);
  });

  /**
   * **指は同時には動かず、出来事は 1 本ずつ来る。** 前の出来事との比で拡大すると、
   * 片方が動いた瞬間だけ間合いが伸びて倍率が揺れる。始めからの比で決める。
   */
  test('holds the zoom while both fingers travel together, one event at a time', () => {
    const before = zoom();

    touch('pointerdown', 1, 200, 200);
    touch('pointerdown', 2, 260, 200);
    for (let step = 1; step <= 4; step += 1) {
      touch('pointermove', 1, 200 - step * 10, 200);
      touch('pointermove', 2, 260 - step * 10, 200);
    }

    expect(zoom()).toBe(before);
  });

  test('takes back what one finger had started when a second one lands', () => {
    // なぞり始めてから 2 本目を足すことがある。囲みかけのまま移動に移ると帯が残る。
    touch('pointerdown', 1, 200, 200);
    touch('pointermove', 1, 260, 240);
    expect(document.querySelector('.kc-band-select')).not.toBeNull();

    touch('pointerdown', 2, 300, 200);

    expect(document.querySelector('.kc-band-select')).toBeNull();
  });

  test('opens the menu on a long press, since iOS never sends contextmenu', async () => {
    touch('pointerdown', 1, ...[at(1, 1).clientX, at(1, 1).clientY] as [number, number]);
    await new Promise((done) => { setTimeout(done, LONG_PRESS + 40); });

    expect((document.querySelector('.kc-menu') as HTMLElement).hidden).toBe(false);
  });

  test('takes a long press back when the finger moves, which means a drag', async () => {
    touch('pointerdown', 1, 200, 200);
    touch('pointermove', 1, 240, 230);
    await new Promise((done) => { setTimeout(done, LONG_PRESS + 40); });

    expect((document.querySelector('.kc-menu') as HTMLElement).hidden).toBe(true);
  });

  test('leaves the mouse alone: one pointer still selects and drags', () => {
    fire('pointerdown', { ...at(1, 1), pointerId: 1, pointerType: 'mouse', buttons: 1 });
    fire('pointermove', { clientX: 200, clientY: 200, pointerId: 1, pointerType: 'mouse', buttons: 1 });

    expect(document.querySelector('.kc-band-select')).toBeNull();
    expect(lastOf('select')).toBeDefined();
  });
});

describe('配線', () => {
  test('draws from the first hole to the second', async () => {
    key('w');
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    fire('pointermove', at(3, 1));
    fire('pointerdown', at(3, 1));
    fire('pointerup', at(3, 1));

    expect(lastOf('addWire')).toMatchObject({ from: 'a1', to: 'a3', operator: '--' });
  });

  /**
   * 触れている穴の印。**穴を塗り潰していた**ので、カーソルの下の穴が
   * 升と同じ大きさの四角に隠れていた (実機で「■で穴が隠れる」)。
   * 升より小さい輪に替えたことを、大きさで見張る。
   */
  test('rings the hole it is touching, smaller than the hole square', async () => {
    key('w');
    fire('pointermove', at(1, 1));
    await nextFrame();

    const ring = document.querySelector('.cf-hole-mark');
    expect(ring).not.toBeNull();
    expect(Number(ring?.getAttribute('r')) * 2).toBeLessThan(CELL);
  });

  test('leaves the holes alone while nothing is being drawn or carried', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();

    expect(document.querySelector('.cf-hole-mark')).toBeNull();
  });

  test('shows the line before it is drawn, so the second click is aimed', async () => {
    key('w');
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    fire('pointermove', at(3, 1));
    await nextFrame();

    expect(document.querySelector('.cf-ghost-wire')).not.toBeNull();
  });

  test('shows the colour swatches while the wire tool is out, and paints with the one pressed', async () => {
    key('w');
    await nextFrame();
    expect((document.querySelector('.cf-colors') as HTMLElement).hidden).toBe(false);

    (document.querySelector('.cf-swatch') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    await nextFrame();
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    fire('pointermove', at(3, 1));
    fire('pointerdown', at(3, 1));
    fire('pointerup', at(3, 1));

    expect(lastOf('addWire')).toMatchObject({ color: 'red' });
  });

  test('drags one end of a wire, and shows the line it would become', async () => {
    // 端の的は線より小さい (`data-box` の 4 × 4)。その真ん中を押す。
    const grab = { clientX: 5 * CELL + 2, clientY: CELL + 2 };
    fire('pointermove', grab);
    fire('pointerdown', grab);
    fire('pointermove', { clientX: 5 * CELL + 60, clientY: CELL * 1.5, buttons: 1 });
    await nextFrame();

    expect(status()).toContain('引き直しています');
    expect(marked('cf-lifted')).toContain('7');
  });
});

describe('右クリックの一覧', () => {
  test('opens where it was pressed', () => {
    fire('pointermove', at(1, 1));
    fire('contextmenu', at(1, 1));

    expect((document.querySelector('.kc-menu') as HTMLElement).hidden).toBe(false);
  });

  test('keeps hold of what the cursor was over while the pointer walks the list', async () => {
    // **一覧は図の上に重ねて出す。** 項目まで下りる途中でカーソルの下を捨てると、
    // 押した瞬間に対象が消える (実機で「右メニューが効かない」)。
    fire('pointermove', at(1, 1));
    fire('contextmenu', at(1, 1));
    const item = document.querySelector('.kc-menu .kc-tool[data-key="r"]') as HTMLElement;
    fire('pointermove', { clientX: 999, clientY: 999, target: item });
    await nextFrame();

    expect(status()).toContain('R1');
  });

  test('runs the item the same way the key would', () => {
    fire('pointermove', at(1, 1));
    fire('contextmenu', at(1, 1));
    const item = document.querySelector('.kc-menu .kc-tool[data-key="r"]') as HTMLElement;
    item.dispatchEvent(new Event('click', { bubbles: true }));

    expect(lastOf('turn')).toMatchObject({ part: 'R1' });
    expect((document.querySelector('.kc-menu') as HTMLElement).hidden).toBe(true);
  });

  test('does not let go of the selection when the list itself is pressed', () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    fire('contextmenu', at(1, 1));
    posted.length = 0;
    const item = document.querySelector('.kc-menu .kc-tool[data-key="r"]') as HTMLElement;
    fire('pointerdown', { clientX: 999, clientY: 999, target: item });

    expect(lastOf('select')).toBeUndefined();
  });

  test('closes when the map is pressed instead', () => {
    fire('pointermove', at(1, 1));
    fire('contextmenu', at(1, 1));
    fire('pointerdown', at(3, 1));

    expect((document.querySelector('.kc-menu') as HTMLElement).hidden).toBe(true);
  });
});

describe('拡張からの知らせ', () => {
  test('takes a new map and paints it', async () => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { kind: 'map', html: MAP.replace('R1', 'R9'), picker: '', issues: '' },
    }));
    await nextFrame();

    expect(document.querySelector('.cf-chip[data-part="R9"]')).not.toBeNull();
  });

  test('lights the holes the ghost answered for', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('m');
    await nextFrame();
    const asked = String(lastOf('preview')?.['key'] ?? '');

    window.dispatchEvent(new MessageEvent('message', {
      data: { kind: 'ghost', key: asked, cells: ['a2'], ok: true, why: '', from: ['a1'] },
    }));
    await nextFrame();

    expect(marked('cf-ghost')).toContain('a2');
  });

  test('paints the ghost red when the answer says it cannot be placed', async () => {
    fire('pointermove', at(1, 1));
    await nextFrame();
    key('m');
    await nextFrame();
    const asked = String(lastOf('preview')?.['key'] ?? '');

    window.dispatchEvent(new MessageEvent('message', {
      data: { kind: 'ghost', key: asked, cells: ['a2'], ok: false, why: '置けません', from: ['a1'] },
    }));
    await nextFrame();

    expect(marked('cf-ghost-bad')).toContain('a2');
    expect(status()).toContain('置けません');
  });

  test('shows the fields the extension sent', async () => {
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        kind: 'fields',
        part: { id: 'R1', type: 'resistor', value: '330', label: '', color: '', can: ['id', 'type', 'value', 'label'] },
      },
    }));
    await nextFrame();

    expect((document.querySelector('.cf-inspector') as HTMLElement).hidden).toBe(false);
    expect((document.querySelector('.cf-field[name="value"]') as HTMLInputElement).value).toBe('330');
  });
});
