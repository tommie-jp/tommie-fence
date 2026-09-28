import { describe, expect, test } from 'vitest';
import { parseChannelLine, parseCursor, parseMeasureNames, parsePosition, parseTriggerLine } from './lines.ts';

const reason = (result: { ok: boolean; error?: { message: string } }): string | undefined => result.error?.message;

describe('parseChannelLine', () => {
  test('reads a wave, and a reference with operations', () => {
    const wave = parseChannelLine('ch1', 'square 100Hz 1V offset 1V', []);
    expect(wave.ok && wave.value.source.kind).toBe('wave');
    const ref = parseChannelLine('ch2', 'ch1 | rc 1ms | clip -0.7V 0.7V | offset 4.3V | gain 0.5 | abs', ['ch1']);
    expect(ref.ok && ref.value).toEqual({
      name: 'ch2',
      source: { kind: 'ref', channel: 'ch1' },
      ops: [
        { kind: 'rc', tau: 1e-3 },
        { kind: 'clip', low: -0.7, high: 0.7 },
        { kind: 'offset', volts: 4.3 },
        { kind: 'gain', factor: 0.5 },
        { kind: 'abs' },
      ],
      assumed: [],
    });
    const low = parseChannelLine('ch2', 'ch1 | clip 0V', ['ch1']);
    expect(low.ok && low.value.ops).toEqual([{ kind: 'clip', low: 0, high: null }]);
  });

  test('reads an expression after =, with operations after it', () => {
    const read = parseChannelLine('ch2', '= 2V * (1 - exp(-t/1ms)) | rc 1ms | peak 150ms', ['ch1']);
    expect(read.ok && read.value.source.kind).toBe('expr');
    expect(read.ok && read.value.ops).toEqual([{ kind: 'rc', tau: 1e-3 }, { kind: 'peak', tau: 0.15 }]);
    expect(parseChannelLine('ch2', '= ch1 * 2', ['ch1']).ok).toBe(true);
  });

  test('reads hp, integrate, delay and invert (stage 3b)', () => {
    const read = parseChannelLine('ch2', 'ch1 | hp 1ms | integrate 2ms | delay 250us | delay 0 | invert', ['ch1']);
    expect(read.ok && read.value.ops).toEqual([
      { kind: 'hp', tau: 1e-3 },
      { kind: 'integrate', tau: 2e-3 },
      { kind: 'delay', seconds: 250e-6 },
      { kind: 'delay', seconds: 0 },
      { kind: 'invert' },
    ]);
  });

  test('passes on the default it filled in', () => {
    const pulse = parseChannelLine('ch1', 'pulse 1kHz 1V', []);
    expect(pulse.ok && pulse.value.assumed).toEqual(['pulse の duty は既定の 25% で描いています']);
  });

  test('reads a frequency written with a prefix only, like the other frequency fields', () => {
    const read = parseChannelLine('ch1', 'sine 1k 1V', []);
    expect(read.ok && read.value.source.kind === 'wave' && read.value.source.wave.frequency).toBe(1e3);
  });

  test.each([
    ['ch1', 'sine 1000 1', [], '周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます', '1000'],
    ['ch1', 'cosine 1kHz 1V', [], '波は sine / square / triangle / sawtooth / pulse / dc のどれかです', 'cosine'],
    ['ch1', 'ch2 | rc 1ms', [], 'ch1 は波で書きます (前に参照できる ch がありません。例: ch1: sine 1kHz 1V)', 'ch2'],
    ['ch2', 'ch3', ['ch1'], 'ch2 が参照できるのは前の ch1 だけです', 'ch3'],
    ['ch2', 'ch5', ['ch1'], 'ch は ch1〜ch4 です', 'ch5'],
    ['ch2', 'ch1 | lowpass 1ms', ['ch1'], '操作は rc / hp / peak / lc / integrate / delay / clip / offset / gain / abs / invert のどれかです', 'lowpass'],
    ['ch2', 'ch1 | rc 1', ['ch1'], 'rc の τ は単位を付けます (例: rc 1ms)', '1'],
    ['ch2', 'ch1 | clip 0.7V -0.7V', ['ch1'], 'clip は下の値を先に書きます (例: clip -0.7V 0.7V)', '0.7V'],
    ['ch2', 'ch1 | clip 0.7', ['ch1'], 'clip は「clip -0.7V 0.7V」(両側) か「clip 0V」(下だけ) の形で書きます', '0.7'],
    ['ch2', 'ch1 | offset 4.3', ['ch1'], 'offset は 4.3V / -0.7V のように単位を付けます', '4.3'],
    ['ch2', 'ch1 | gain 6dB', ['ch1'], 'gain は 0.5 / 2 / -1 のように倍率 (単位なし) で書きます', '6dB'],
    ['ch2', `ch1 | gain ${'9'.repeat(320)}`, ['ch1'], 'gain の倍率は ±1000000 までです', '9'.repeat(320)],
    ['ch2', 'ch1 | gain 2000000', ['ch1'], 'gain の倍率は ±1000000 までです', '2000000'],
    ['ch2', 'ch1 | abs 1V', ['ch1'], 'abs の後ろには何も書きません', '1V'],
    ['ch2', 'ch1 || abs', ['ch1'], '| の後ろに操作を書きます (例: ch1 | rc 1ms)', '|'],
    ['ch1', '= 5 * exp(-t/1ms)', [], 'ch1 の式は電圧 (V) にします (いまは 無次元。5V * … のように単位を付けます)', '='],
    ['ch2', '= ch3 * 2', ['ch1'], 'ch3 は参照できません (参照できるのは ch1)', 'ch3'],
    ['ch2', 'ch1 | peak 150', ['ch1'], 'peak の τ は単位を付けます (例: peak 150ms)', '150'],
    ['ch2', 'ch1 | hp 0', ['ch1'], 'hp は τ を 1ms / 200us のように書きます (例: hp 1ms)', '0'],
    ['ch2', 'ch1 | integrate', ['ch1'], 'integrate は τ を 1ms / 200us のように書きます (例: integrate 1ms)', 'integrate'],
    ['ch2', 'ch1 | integrate 1ms 2ms', ['ch1'], 'integrate は τ を 1ms / 200us のように書きます (例: integrate 1ms)', '2ms'],
    ['ch2', 'ch1 | delay 250', ['ch1'], 'delay は 250us / 1ms のように単位を付けます (例: delay 250us)', '250'],
    ['ch2', 'ch1 | delay', ['ch1'], 'delay はずらす時間を 250us / 1ms のように書きます (例: delay 250us)', 'delay'],
    ['ch2', 'ch1 | delay -1ms', ['ch1'], 'delay は 0 以上です (遅らせるだけ。進めるなら trigger: か phase で)', '-1ms'],
    ['ch2', 'ch1 | delay 1000s', ['ch1'], 'delay は 600s までです', '1000s'],
    ['ch2', 'ch1 | invert 2', ['ch1'], 'invert の後ろには何も書きません', '2'],
    ['ch1', 'sine 2GHz 1V', [], '周波数は 1 GHz までです', '2GHz'],
    ['ch1', 'dc 2000kV', [], '電圧は ±1 MV までです', '2000kV'],
  ])('%s: %s is refused with how to write it', (name, text, before, message, token) => {
    const result = parseChannelLine(name as 'ch1', text, before as readonly ('ch1')[]);
    expect(result).toEqual({ ok: false, error: { message, line: null, token } });
  });

  test('refuses a ninth operation', () => {
    const result = parseChannelLine('ch2', `ch1${' | abs'.repeat(9)}`, ['ch1']);
    expect(reason(result)).toBe('操作は 1 つの ch に 8 つまでです');
  });
});

describe('parseTriggerLine', () => {
  test('reads the source, the edge and the level (which may be left out)', () => {
    expect(parseTriggerLine('ch1 rising 1V')).toEqual({ ok: true, value: { source: 'ch1', edge: 'rising', level: 1, position: 0 } });
    expect(parseTriggerLine('ch2 falling')).toEqual({ ok: true, value: { source: 'ch2', edge: 'falling', level: null, position: 0 } });
  });

  test('reads the horizontal position of the trigger point (at, in div, −5 to +5)', () => {
    expect(parseTriggerLine('ch1 rising 0V at -5div')).toEqual({ ok: true, value: { source: 'ch1', edge: 'rising', level: 0, position: -5 } });
    expect(parseTriggerLine('ch1 falling at 2.5div')).toEqual({ ok: true, value: { source: 'ch1', edge: 'falling', level: null, position: 2.5 } });
    expect(parseTriggerLine('ch1 rising 1V at 5div')).toEqual({ ok: true, value: { source: 'ch1', edge: 'rising', level: 1, position: 5 } });
  });

  test.each([
    ['ch1', 'trigger: は「ch1 rising 1V」の形で書きます (向きは rising / falling、水準は省けます)', 'ch1'],
    ['ch1 up 1V', 'trigger: の向きは rising か falling です', 'up'],
    ['ch1 rising 1', 'trigger: の水準は 1V / -500mV のように単位を付けます', '1'],
    ['cha rising', 'trigger: は ch1〜ch4 のどれかで合わせます', 'cha'],
    ['ch1 rising 1V 2V', 'trigger: は「ch1 rising 1V」の形で書きます (向きは rising / falling、水準は省けます)', '2V'],
    ['ch1 rising 0V at -5', 'trigger: の at は -5div / 2div のように目盛 (div) で書きます (-5div〜5div)', '-5'],
    ['ch1 rising 0V at 1ms', 'trigger: の at は -5div / 2div のように目盛 (div) で書きます (-5div〜5div)', '1ms'],
    ['ch1 rising 0V at', 'trigger: の at は -5div / 2div のように目盛 (div) で書きます (-5div〜5div)', 'at'],
    ['ch1 rising 0V at 6div', 'trigger: の at は -5div〜5div です (左端が -5div、右端が 5div)', '6div'],
    ['ch1 rising 0V at -5div 1V', 'trigger: は「ch1 rising 1V at -5div」の形で書きます (at は省けます)', '1V'],
    ['ch1 rising 0V -5div', 'trigger: の位置は at を付けて書きます (例: ch1 rising 0V at -5div)', '-5div'],
  ])('refuses %s', (text, message, token) => {
    expect(parseTriggerLine(text)).toEqual({ ok: false, error: { message, line: null, token } });
  });

  test('does not put a raw unreadable level into the message (control characters could forge terminal output)', () => {
    const result = parseTriggerLine('ch1 rising \x1b[31mFAKE');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).not.toContain('\x1b');
    expect(!result.ok && result.error.message).toContain('FAKE');
  });
});

describe('parseCursor / parseMeasureNames / parsePosition', () => {
  test('reads a cursor time with its unit, and 0 alone', () => {
    expect(parseCursor('1ms')).toEqual({ ok: true, value: 1e-3 });
    expect(parseCursor('0')).toEqual({ ok: true, value: 0 });
    expect(parseCursor('0.5')).toEqual({ ok: false, error: { message: 'カーソルは 0 / 1ms / -500us のように単位を付けます', line: null, token: '0.5' } });
  });

  test('reads measurement names and names the ones it takes', () => {
    expect(parseMeasureNames(['vpp', 'freq'])).toEqual({ ok: true, value: ['vpp', 'freq'] });
    expect(parseMeasureNames(['vpp', 'amplitude'])).toEqual({
      ok: false,
      error: { message: '知らない測り方です: amplitude (書けるのは vpp / vmax / vmin / avg / rms / freq / period / duty / phase / rise)', line: null, token: 'amplitude' },
    });
    expect(parseMeasureNames(['vpp', 'vpp']).ok).toBe(false);
    expect(parseMeasureNames(Array(9).fill('vpp')).ok).toBe(false);
  });

  test('reads a position in divisions', () => {
    expect(parsePosition('-2div')).toBe(-2);
    expect(parsePosition('1.5 div')).toBe(1.5);
    expect(parsePosition('-2')).toBeNull();
  });
});

describe('parseChannelLine — lc', () => {
  test('reads lc f0 Q (the frequency with its unit, Q as a bare number)', () => {
    const result = parseChannelLine('ch2', 'ch1 | lc 1.59kHz 0.7', ['ch1']);
    expect(result.ok && result.value.ops).toEqual([{ kind: 'lc', f0: 1590, q: 0.7 }]);
  });

  const HINT = 'lc は共振周波数と Q を「lc 1.59kHz 0.7」の形で書きます (周波数は単位を付け、Q は単位なし)';
  test.each([
    ['ch1 | lc 1590 0.7', HINT, '1590'],
    ['ch1 | lc', HINT, 'lc'],
    ['ch1 | lc 1.59kHz', HINT, '1.59kHz'],
    ['ch1 | lc 1.59kHz 0.7V', HINT, '0.7V'],
    ['ch1 | lc 1.59kHz 0.7 1', HINT, '1'],
    ['ch1 | lc 0Hz 1', HINT, '0Hz'],
    ['ch1 | lc 2GHz 1', 'lc の周波数は 1 GHz までです', '2GHz'],
    ['ch1 | lc 1kHz 0.05', 'lc の Q は 0.1〜100 です', '0.05'],
    ['ch1 | lc 1kHz 1000', 'lc の Q は 0.1〜100 です', '1000'],
    [`ch1 | lc 1kHz ${'9'.repeat(400)}`, 'lc の Q は 0.1〜100 です', '9'.repeat(400)],
  ])('refuses %s', (text, message, token) => {
    expect(parseChannelLine('ch2', text, ['ch1'])).toEqual({ ok: false, error: { message, line: null, token } });
  });
});
