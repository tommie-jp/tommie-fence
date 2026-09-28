import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { parseFence } from './parseFence.ts';
import { parseNoteLine } from './notes.ts';

const fence = (...notes: readonly string[]): string => ['ch1: sine 1kHz 1V', 'notes:', ...notes.map((note) => `  - ${note}`)].join('\n');

describe('parseNoteLine', () => {
  test('reads the four kinds; the voltage goes on ch1 unless a channel is named', () => {
    expect(parseNoteLine('mark 1ms 1.26V', null)).toEqual({ ok: true, value: { kind: 'mark', channel: 'ch1', t: 1e-3, volts: 1.26 } });
    expect(parseNoteLine('text ch2 1ms -500mV', ' 1 τ で 63 % ')).toEqual({ ok: true, value: { kind: 'text', channel: 'ch2', t: 1e-3, volts: -0.5, text: '1 τ で 63 %' } });
    expect(parseNoteLine('band 0 1ms', '充電')).toEqual({ ok: true, value: { kind: 'band', from: 0, to: 1e-3, text: '充電' } });
    expect(parseNoteLine('band -1ms 1ms', null)).toEqual({ ok: true, value: { kind: 'band', from: -1e-3, to: 1e-3, text: null } });
    expect(parseNoteLine('source', null)).toEqual({ ok: true, value: { kind: 'source' } });
  });

  test.each([
    ['mark 1 1V', null, '時刻に単位がありません: 1 (0 / 1ms / -500us)', '1'],
    ['mark 1ms 1.26', null, '電圧に単位がありません: 1.26 (1.26V / -500mV)', '1.26'],
    ['mark 1ms 2Vpp', null, '電圧が読めません: 2Vpp (1.26V / -500mV)', '2Vpp'],
    ['mark 1ms', null, 'mark は「mark 1ms 1.26V」(時刻 電圧) の形で書きます', 'mark'],
    ['mark ch5 1ms 1V', null, '注釈の ch は ch1〜ch4 です', 'ch5'],
    ['mark 1ms 1V', 'x', 'mark には字を書きません (字は text で)', 'mark'],
    ['text 1ms 1V', null, 'text はコロンの後ろに字を書きます (- text 1ms 1.26V: 字)', 'text'],
    ['band 1ms 0', null, 'band の終わりは始めより後にします', '0'],
    ['band 0', null, 'band は「band 0 1ms」(始めと終わりの時刻) の形で書きます', 'band'],
    ['band 0 1', null, '時刻に単位がありません: 1 (0 / 1ms / -500us)', '1'],
    ['source', '電験 3-6', 'source の後ろには何も書きません (フェンスの中身をそのまま図の下に書き出します)', 'source'],
    ['arrow 1ms 1V', null, '注釈は「- mark 1ms 1.26V」「- text 1ms 1.26V: 字」「- band 0 1ms: 字」「- source」の形で書きます', 'arrow'],
  ])('%s is refused with how to write it', (head, body, message, token) => {
    expect(parseNoteLine(head, body)).toEqual({ ok: false, error: { message, line: null, token } });
  });

  test('drops invisible characters (bidi overrides) and cuts the text to the limit', () => {
    const read = parseNoteLine('text 0 0V', `‮abc${'あ'.repeat(100)}`);
    expect(read.ok && 'text' in read.value && read.value.text).toBe(`abc${'あ'.repeat(LIMITS.noteLength - 3)}`);
  });
});

describe('parseFence — notes:', () => {
  test('reads a list with the text after the colon, keeping line numbers', () => {
    const { doc, errors } = parseFence(fence('band 0 1ms: 充電', 'text 1ms 1.26V: 1 τ で 63 %', 'mark ch1 0 0V', 'source'));
    expect(errors).toEqual([]);
    expect(doc.notes.map((note) => [note.kind, note.line])).toEqual([['band', 3], ['text', 4], ['mark', 5], ['source', 6]]);
  });

  test('refuses notes: that is not a list, and a list item it cannot read', () => {
    expect(parseFence('ch1: sine 1kHz 1V\nnotes: mark 1ms 1V').errors.map((error) => error.message))
      .toEqual(['notes: は `- text 1ms 1.26V: 字` のような並びにします']);
    expect(parseFence(fence('{a: 1, b: 2}')).errors[0]?.message).toMatch(/^注釈は「- mark/);
  });

  test('stops at the limit and says so', () => {
    const { doc, errors } = parseFence(fence(...Array.from({ length: LIMITS.notes + 5 }, () => 'mark 0 0V')));
    expect(doc.notes).toHaveLength(LIMITS.notes);
    expect(errors.map((error) => error.message)).toEqual([`注釈が多すぎます (${LIMITS.notes} 個まで)`]);
  });

  test('refuses notes: under view: xy with the reason, and drops them', () => {
    const { doc, errors } = parseFence(['view: xy', 'ch1: sine 1kHz 1V', 'ch2: sine 2kHz 1V', 'notes:', '  - mark 0 0V'].join('\n'));
    expect(doc.notes).toEqual([]);
    expect(errors.map((error) => error.message)).toContain('view: xy では notes: は書けません (注釈の番地は「時刻 電圧」なので時間の画面 (view: time) にだけ置けます)');
  });
});
