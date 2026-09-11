// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { fencesIn } from '../document.ts';

/**
 * 頁の配線のうち、**状態を持たずに DOM へ映すだけ**の 2 つ (ログと図) を、
 * 本物の `index.html` の骨の上で確かめる。`els.ts` が要る id が HTML に
 * 全部あることも、ここで一緒に確かめる (無ければ import で止まる)。
 *
 * 残り (`files` / `map` / `layout` / `markdown` / `examples` / `demo`) は
 * 窓・iframe・ファイルの口が要るので、ブラウザ (Playwright) で確かめる。
 */

const BODY = /<body>([\s\S]*)<\/body>/.exec(readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'))?.[1] ?? '';

beforeAll(() => {
  // `<script>` は jsdom が読まない (app.js は無い)。骨だけを置く。
  document.body.innerHTML = BODY.replace(/<script[\s\S]*?<\/script>/g, '');
});

describe('els', () => {
  test('index.html に、頁が引く id が全部ある', async () => {
    const { els } = await import('./els.ts');

    expect(Object.keys(els).length).toBeGreaterThan(30);
    expect(els.source).toBeInstanceOf(HTMLTextAreaElement);
  });
});

describe('log', () => {
  afterEach(() => { vi.useRealTimers(); });

  test('note は新しいものを上に、最後の 20 行だけ残す', async () => {
    const { note, renderLog } = await import('./log.ts');
    renderLog();
    expect(document.querySelector('#log-rows .none')?.textContent).toBe('まだ何も起きていません');

    for (let i = 1; i <= 25; i += 1) note(`出来事 ${i}`);

    const rows = [...document.querySelectorAll('#log-rows li')].map((li) => li.textContent?.slice(5));
    expect(rows).toHaveLength(20);
    expect(rows[0]).toBe('出来事 25');
    expect(rows[19]).toBe('出来事 6');
  });

  test('say は帯に出して 2 秒で消し、ログにも残す', async () => {
    vi.useFakeTimers();
    const { say } = await import('./log.ts');

    say('保存した');

    const said = document.getElementById('said');
    expect(said?.textContent).toBe('保存した');
    expect(document.querySelector('#log-rows li')?.textContent).toContain('保存した');
    vi.advanceTimersByTime(2_000);
    expect(said?.textContent).toBe('');
  });

  test('holds を立てた一言は消えない', async () => {
    vi.useFakeTimers();
    const { say } = await import('./log.ts');

    say('読めなかった', true);
    vi.advanceTimersByTime(5_000);

    expect(document.getElementById('said')?.textContent).toBe('読めなかった');
  });

  /** しくじりは赤で残り、マップがあればその帯へ、無ければ頁の帯へ。 */
  test('warn はログに赤で残し、出す先が無ければ帯に出す', async () => {
    vi.useFakeTimers();
    const { warn, warnTo } = await import('./log.ts');
    warnTo(null);

    warn('開けなかった');

    expect(document.querySelector('#log-rows li')?.className).toBe('bad');
    expect(document.getElementById('said')?.textContent).toBe('開けなかった');
  });

  test('warn は出す先があればそちらへ (帯には出さない)', async () => {
    const { warn, warnTo } = await import('./log.ts');
    const heard: string[] = [];
    const said = document.getElementById('said');
    if (said) said.textContent = '';
    warnTo((text) => heard.push(text));

    warn('書けなかった');

    expect(heard).toEqual(['書けなかった']);
    expect(said?.textContent).toBe('');
    warnTo(null);
  });
});

describe('paint', () => {
  const [fence] = fencesIn('```breadboard\ntitle: t\nboard: half\nparts:\n  R1: resistor a5 a10 330\n```\n');

  test('ネットリストは表になる。空なら何も出ない', async () => {
    const { paintNetlist } = await import('./paint.ts');

    paintNetlist([{ name: 'N1', refs: ['R1.1', 'D1.A'] }]);
    expect(document.querySelector('#netlist caption')?.textContent).toBe('ネットリスト (図から導いたもの)');
    expect(document.querySelector('#netlist th')?.textContent).toBe('N1');
    expect(document.querySelector('#netlist td')?.textContent).toBe('R1.1, D1.A');

    paintNetlist([]);
    expect(document.getElementById('netlist')?.children).toHaveLength(0);
  });

  test('窓が閉じているあいだは描かない', async () => {
    const { paintFence } = await import('./paint.ts');
    document.getElementById('figure')?.replaceChildren();

    paintFence(fence ?? null, { open: false, hasDoc: true });

    expect(document.getElementById('figure')?.innerHTML).toBe('');
  });

  test('開いていれば、いまのフェンスの図とネットリストが出る', async () => {
    const { paintFence } = await import('./paint.ts');

    paintFence(fence ?? null, { open: true, hasDoc: true });

    expect(document.querySelector('#figure svg')).not.toBeNull();
    expect(document.getElementById('tex')?.hidden).toBe(true);
    expect(document.getElementById('messages')?.hidden).toBe(true);
    expect(document.getElementById('note')?.hidden).toBe(true);
  });

  test('フェンスが無ければ図を消して断りを出す', async () => {
    const { paintFence } = await import('./paint.ts');

    paintFence(null, { open: true, hasDoc: true });

    expect(document.getElementById('figure')?.innerHTML).toBe('');
    expect(document.getElementById('note')?.hidden).toBe(false);
    expect(document.getElementById('note')?.textContent).toContain('フェンスがありません');
  });

  /** 何も開いていない頁 (起動の途中) では、断る相手が居ないので黙る。 */
  test('文書を開いていなければ断らない', async () => {
    const { paintFence } = await import('./paint.ts');

    paintFence(null, { open: true, hasDoc: false });

    expect(document.getElementById('note')?.hidden).toBe(true);
  });
});

describe('labels', () => {
  const doc = { name: '01-led.md', title: 'LED', from: 'packages/x/examples/01-led.md', url: null, fromLink: false, crlf: false };

  test('直したままなら名札に印が付く', async () => {
    const { showDocName } = await import('./labels.ts');

    showDocName(doc, false);
    expect(document.getElementById('doc-name')?.textContent).toBe('01-led.md');

    showDocName(doc, true);
    expect(document.querySelector('#doc-name .dirty')?.textContent).toBe(' — 直したまま');
  });

  test('何も開いていなければ名札は空', async () => {
    const { showDocName } = await import('./labels.ts');

    showDocName({ ...doc, name: '' }, true);

    expect(document.getElementById('doc-name')?.textContent).toBe('');
  });

  test('例なら出どころのリンク、手元のファイルなら無し', async () => {
    const { showFrom } = await import('./labels.ts');

    showFrom(doc);
    expect(document.querySelector('#from a')?.getAttribute('href')).toBe('https://github.com/tommie-jp/tommie-fence/blob/main/packages/x/examples/01-led.md');

    showFrom({ ...doc, from: null });
    expect(document.getElementById('from')?.textContent).toBe('');
  });

  /** リンクで来た人には題を出し、案内の一文は畳む。 */
  test('リンクの図なら、一文の代わりに題を出す', async () => {
    const { syncLead } = await import('./labels.ts');

    syncLead({ ...doc, fromLink: true, title: '図X' });
    expect(document.getElementById('lead-link')?.hidden).toBe(false);
    expect(document.getElementById('lead-title')?.textContent).toBe('図X');
    expect(document.getElementById('lead-ja')?.hidden).toBe(true);
    expect(document.getElementById('lead-en')?.hidden).toBe(true);

    syncLead(doc);
    expect(document.getElementById('lead-link')?.hidden).toBe(true);
    // 2 つの言語のうち片方だけが出る。
    const shown = ['lead-ja', 'lead-en'].filter((id) => document.getElementById(id)?.hidden === false);
    expect(shown).toHaveLength(1);
  });
});

describe('dialog', () => {
  test('開くと釦の aria-expanded が立ち、閉じると下りる', async () => {
    const { listenDialog, openDialog } = await import('./dialog.ts');
    const box = document.createElement('dialog');
    const button = document.createElement('button');
    document.body.append(box, button);
    // jsdom の窓は showModal を持たないことがある。そのときは開いた印だけ真似る。
    box.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
    listenDialog(box, button);

    openDialog(box, button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    box.dispatchEvent(new Event('close'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
