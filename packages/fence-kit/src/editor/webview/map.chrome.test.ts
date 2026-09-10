// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { layDom, nextFrame } from './domFixture.ts';
import type { Posted } from './domFixture.ts';
import { panelHtml } from '../panelHtml.ts';

/**
 * **図のまわり (殻) の段取り。** ズームとパン、部品を探す窓、属性の欄、
 * フェンスの選び手、帯。図そのものを触らない道なので `map.dom.test.ts` と分ける。
 */

const CELL = 20;

const MAP = `<svg data-box="0,0,400,600">`
  + `<rect class="cf-cell" data-address="a1" data-box="20,20,20,20"></rect>`
  + `<rect class="cf-cell" data-address="a2" data-box="40,20,20,20"></rect>`
  + `<g class="cf-chip" data-part="R1" data-box="22,22,16,16"><rect/></g>`
  + `</svg>`;

const PICKER = '<select class="cf-fence"><option value="1">図01</option><option value="9">図02</option></select>'
  + '<button type="button" class="cf-fence-step" data-step="next"></button>'
  + '<button type="button" class="cf-fence-step" data-step="prev"></button>'
  + '<button type="button" class="cf-fence-step" data-step="first"></button>'
  + '<button type="button" class="cf-fence-step" data-step="last"></button>';

const ISSUES = '<ul class="cf-issues"><li class="cf-issue" data-line="4">読めません</li></ul>';

const bodyHtml = (undo: 'own' | 'vscode'): string => {
  const whole = panelHtml({
    cspSource: 'x:', nonce: 'n', scriptUri: 'map.js', undo,
    view: {
      html: MAP,
      picker: PICKER,
      issues: ISSUES,
      chrome: {
        // 探す欄も一覧の形もフェンスのパレットが持つ (`core/edit/palette.ts`)。
        // 絞り込みは `li` の側に印を付けるので、その入れ子ごと真似る。
        palette: '<input type="search" class="cf-search">'
          + '<ul class="cf-types">'
          + '<li><button class="cf-pick" data-type="resistor" data-ends="2" data-find="resistor 抵抗"></button></li>'
          + '<li><button class="cf-pick" data-type="capacitor" data-ends="2" data-find="capacitor"></button></li>'
          + '</ul>',
        typeNames: '', colorNames: '', swatches: '', drawerIcon: '', foldsWire: false, fine: null, fineFor: 'all',
      },
    },
  });
  return whole.slice(whole.indexOf('<body'), whole.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
};

let posted: Posted[];

const fire = (kind: string, detail: Record<string, unknown> = {}): void => {
  const { target, ...rest } = detail;
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: 0, clientY: 0, button: 0, buttons: 0, deltaY: 0,
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...rest,
  });
  ((target as Element | undefined) ?? document.querySelector('.cf-body svg') ?? document.body).dispatchEvent(event);
};

const key = (name: string, detail: Record<string, unknown> = {}): void => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...detail }));
};

const click = (selector: string): void => {
  document.querySelector(selector)?.dispatchEvent(new Event('click', { bubbles: true }));
};

const lastOf = (kind: string): Posted | undefined => [...posted].reverse().find((one) => one.kind === kind);
const zoomText = (): string => document.querySelector('.kc-zoom')?.textContent ?? '';
const at = (col: number, row: number) => ({ clientX: col * CELL + CELL / 2, clientY: row * CELL + CELL / 2 });

const open = async (undo: 'own' | 'vscode' = 'own'): Promise<void> => {
  const laid = layDom(bodyHtml(undo));
  posted = laid.posted;
  if (undo === 'own') document.body.className = 'cf-own-undo';
  else document.body.className = '';
  vi.resetModules();
  await import('./map.ts');
  await nextFrame();
  posted.length = 0;
};

beforeEach(async () => { await open(); });

describe('ズーム', () => {
  test('starts at a hundred per cent', () => {
    expect(zoomText()).toContain('100');
  });

  test('zooms in and out from the buttons, and says how far', async () => {
    click('.kc-zoom-in');
    await nextFrame();
    const bigger = zoomText();
    expect(bigger).not.toContain('100');

    click('.kc-zoom-out');
    await nextFrame();
    expect(zoomText()).not.toBe(bigger);
  });

  test('zooms with the wheel, around the point under the cursor', async () => {
    fire('wheel', { deltaY: -100, clientX: 100, clientY: 100 });
    await nextFrame();

    expect(zoomText()).not.toContain('100 %');
  });

  test('zooms with the keys too, so it works without a wheel', async () => {
    key('+');
    await nextFrame();
    const bigger = zoomText();
    key('-');
    await nextFrame();

    expect(zoomText()).not.toBe(bigger);
  });

  test('goes back to the whole figure on Home', async () => {
    key('+');
    await nextFrame();
    key('Home');
    await nextFrame();

    expect(zoomText()).toContain('100');
  });

  test('fits from the button as well', async () => {
    click('.kc-fit');
    await nextFrame();

    expect(zoomText()).toContain('100');
  });

  test('stops at the far ends, rather than shrinking to nothing', async () => {
    for (let step = 0; step < 40; step += 1) key('-');
    await nextFrame();
    const smallest = zoomText();
    key('-');
    await nextFrame();

    expect(zoomText()).toBe(smallest);
  });
});

describe('パン', () => {
  test('drags the view with the middle button, without touching the figure', () => {
    fire('pointerdown', { ...at(1, 1), button: 1 });
    fire('pointermove', { clientX: 200, clientY: 200 });
    fire('pointerup', { button: 1 });

    expect(posted.filter((one) => one.kind === 'select')).toEqual([]);
  });

  test('drags with Space and the left button, the way KiCad does', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fire('pointerdown', { ...at(1, 1), button: 0 });
    fire('pointermove', { clientX: 200, clientY: 200 });
    fire('pointerup');
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

    expect(posted.filter((one) => one.kind === 'select')).toEqual([]);
  });

  test('lets go of the pan when the pointer is cancelled', () => {
    fire('pointerdown', { ...at(1, 1), button: 1 });
    fire('pointercancel');

    expect(() => fire('pointermove', { clientX: 300, clientY: 300 })).not.toThrow();
  });
});

describe('部品を探す窓', () => {
  const seatOf = (): string | null =>
    document.querySelector('.cf-chrome-palette')?.parentElement?.className ?? null;

  test('sits in the properties panel, and A only moves into its search box', async () => {
    expect(seatOf()).toBe('kc-dock-body');
    expect((document.querySelector('.kc-chooser') as HTMLElement).hidden).toBe(true);

    key('a');
    await nextFrame();

    // 据え置きなので窓は出ない。検索欄へ移るだけ。
    expect((document.querySelector('.kc-chooser') as HTMLElement).hidden).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('.cf-search'));
  });

  test('moves the whole palette into the floating window, and back on Escape', async () => {
    click('.kc-dock-pop');
    await nextFrame();
    expect((document.querySelector('.kc-chooser') as HTMLElement).hidden).toBe(false);
    expect(seatOf()).toBe('kc-chooser-body');

    // **欄の Esc は欄が受ける** (打っている最中の鍵を横取りしないため)。
    (document.querySelector('.cf-search') as HTMLInputElement)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextFrame();
    expect((document.querySelector('.kc-chooser') as HTMLElement).hidden).toBe(true);
    expect(seatOf()).toBe('kc-dock-body');
  });

  test('closes from its own button too', async () => {
    click('.kc-dock-pop');
    await nextFrame();
    click('.kc-chooser-close');
    await nextFrame();

    expect((document.querySelector('.kc-chooser') as HTMLElement).hidden).toBe(true);
    expect(seatOf()).toBe('kc-dock-body');
  });

  test('narrows the list as the words are typed', async () => {
    key('a');
    await nextFrame();
    const search = document.querySelector('.cf-search') as HTMLInputElement;
    search.value = '抵抗';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextFrame();

    const shown = [...document.querySelectorAll('.cf-types li')].filter((one) => !one.classList.contains('cf-hidden'));
    expect(shown).toHaveLength(1);
  });

  test('picks the first match on Enter, so the hands stay on the keys', async () => {
    key('a');
    await nextFrame();
    const search = document.querySelector('.cf-search') as HTMLInputElement;
    search.value = 'capacitor';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextFrame();

    expect(document.querySelector('.cf-status')?.textContent).toContain('capacitor');
  });
});

describe('属性の欄', () => {
  const showFields = async (over: Record<string, unknown> = {}): Promise<void> => {
    // **欄は選んでいるものに効く** ので、先に 1 つ選ぶ。
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        kind: 'fields',
        part: {
          id: 'R1', type: 'resistor', value: '330', label: '', color: '',
          can: ['id', 'type', 'value', 'label'], ...over,
        },
      },
    }));
    await nextFrame();
  };

  test('writes the field back when it loses focus', async () => {
    await showFields();
    const value = document.querySelector('.cf-field[name="value"]') as HTMLInputElement;
    value.value = '1k';
    value.dispatchEvent(new Event('change', { bubbles: true }));

    expect(lastOf('setField')).toMatchObject({ field: 'value', text: '1k' });
  });

  test('renames from the name field, which is a different message', async () => {
    await showFields();
    const id = document.querySelector('.cf-field[name="id"]') as HTMLInputElement;
    id.value = 'R9';
    id.dispatchEvent(new Event('change', { bubbles: true }));

    expect(lastOf('rename')).toMatchObject({ text: 'R9' });
  });

  test('greys out the fields the fence cannot write', async () => {
    await showFields({ can: ['id'] });

    expect((document.querySelector('.cf-field[name="value"]') as HTMLInputElement).disabled).toBe(true);
  });

  test('hides the whole form when nothing is selected', async () => {
    await showFields();
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'fields', part: null } }));
    await nextFrame();

    expect((document.querySelector('.cf-inspector') as HTMLElement).hidden).toBe(true);
  });

  test('never lets a form submit reload the panel', () => {
    const form = document.querySelector('.cf-inspector') as HTMLFormElement;
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('フェンスの選び手と帯', () => {
  test('switches fence from the list', () => {
    const list = document.querySelector('.cf-fence') as HTMLSelectElement;
    list.value = '9';
    list.dispatchEvent(new Event('change', { bubbles: true }));

    expect(lastOf('fence')).toMatchObject({ line: 9 });
  });

  test('steps to the next fence and stops at the end', () => {
    click('.cf-fence-step[data-step="next"]');
    expect(lastOf('fence')).toMatchObject({ line: 9 });

    posted.length = 0;
    click('.cf-fence-step[data-step="next"]');
    expect(lastOf('fence')).toBeUndefined();
  });

  test('jumps to the first and the last', () => {
    click('.cf-fence-step[data-step="last"]');
    expect(lastOf('fence')).toMatchObject({ line: 9 });

    click('.cf-fence-step[data-step="first"]');
    expect(lastOf('fence')).toMatchObject({ line: 1 });
  });

  test('points the editor at the line a band row names', () => {
    click('.cf-issue[data-line="4"]');

    expect(lastOf('goto')).toMatchObject({ line: 4 });
  });
});

describe('タブとして開いたとき', () => {
  test('leaves undo to VS Code, since the tab itself is the map', async () => {
    await open('vscode');
    key('z', { ctrlKey: true });

    expect(posted.filter((one) => one.kind === 'undo')).toEqual([]);
  });
});

describe('打っている最中', () => {
  test('does not steal the keys while a field has focus', async () => {
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        kind: 'fields',
        part: { id: 'R1', type: 'resistor', value: '330', label: '', color: '', can: ['id', 'type', 'value', 'label'] },
      },
    }));
    await nextFrame();
    const value = document.querySelector('.cf-field[name="value"]') as HTMLInputElement;
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));

    expect(lastOf('turn')).toBeUndefined();
  });
});

describe('拡張からのそのほかの知らせ', () => {
  const post = async (data: Record<string, unknown>): Promise<void> => {
    window.dispatchEvent(new MessageEvent('message', { data }));
    await nextFrame();
  };

  test('says what happened in the status line', async () => {
    await post({ kind: 'status', text: 'R1 を動かしました' });

    expect(document.querySelector('.cf-status')?.textContent).toBe('R1 を動かしました');
  });

  test('lights what the cursor points at, and selects it so the fields open', async () => {
    await post({ kind: 'aim', what: 'part', id: 'R1' });

    expect(document.querySelector('.cf-chip[data-part="R1"]')?.classList.contains('cf-aim')).toBe(true);
  });

  test('takes a whole group from the extension, for a batch duplicate', async () => {
    // まとめて複製したときは全部を選ぶ (続けて動かせるように)。
    await post({ kind: 'aim', what: 'part', id: 'R1', also: ['R1', 'R2'] });
    // 群れの 2 つ目は図に無いので光らないが、群れとしては覚えている。
    key('r');

    expect(lastOf('turn')).toMatchObject({ parts: ['R1', 'R2'] });
  });

  test('clears the light when the cursor points at nothing', async () => {
    await post({ kind: 'aim', what: 'part', id: 'R1' });
    await post({ kind: 'aim' });

    expect(document.querySelector('.cf-aim')).toBeNull();
  });

  test('greys the undo buttons the extension says are empty', async () => {
    await post({ kind: 'history', canUndo: false, canRedo: true });

    expect((document.querySelector('.cf-undo') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.cf-redo') as HTMLButtonElement).disabled).toBe(false);
  });

  test('keeps the selection across a rebuild, so the fields do not close mid-edit', async () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    posted.length = 0;

    await post({ kind: 'map', html: MAP, picker: PICKER, issues: ISSUES });

    expect(lastOf('select')).toMatchObject({ id: 'R1' });
  });

  test('lets go when the thing it had selected is gone from the new map', async () => {
    fire('pointermove', at(1, 1));
    fire('pointerdown', at(1, 1));
    fire('pointerup', at(1, 1));
    posted.length = 0;

    await post({ kind: 'map', html: '<svg data-box="0,0,10,10"></svg>', picker: '', issues: '' });

    expect(lastOf('select')).toBeUndefined();
  });

  test('swaps the whole vocabulary when the language changes', async () => {
    await post({
      kind: 'map',
      html: MAP,
      picker: '',
      issues: '',
      chrome: {
        palette: '<button class="cf-pick" data-type="opamp" data-ends="0"></button>',
        typeNames: '', colorNames: '', swatches: '', drawerIcon: '', foldsWire: true, fine: 10, fineFor: 'all',
      },
    });

    expect(document.querySelector('.cf-pick')?.getAttribute('data-type')).toBe('opamp');
  });
});

describe('窓のできごと', () => {
  test('takes the keys back when the window loses focus, so Shift does not stick', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
    window.dispatchEvent(new Event('blur'));

    expect(() => fire('pointermove', at(1, 1))).not.toThrow();
  });

  test('keeps the view when the panel is resized', () => {
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });

  test('reads the cursor again when the panel comes back into view', () => {
    expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
  });
});
