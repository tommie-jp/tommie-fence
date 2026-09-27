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

  test('passes on the default it filled in', () => {
    const pulse = parseChannelLine('ch1', 'pulse 1kHz 1V', []);
    expect(pulse.ok && pulse.value.assumed).toEqual(['pulse の duty は既定の 25% で描いています']);
  });

  test.each([
    ['ch1', 'sine 1000 1', [], '周波数は 1kHz / 100Hz のように単位を付けます', '1000'],
    ['ch1', 'cosine 1kHz 1V', [], '波は sine / square / triangle / sawtooth / pulse / dc のどれかです', 'cosine'],
    ['ch1', 'ch2 | rc 1ms', [], 'ch1 は波で書きます (前に参照できる ch がありません。例: ch1: sine 1kHz 1V)', 'ch2'],
    ['ch2', 'ch3', ['ch1'], 'ch2 が参照できるのは前の ch1 だけです', 'ch3'],
    ['ch2', 'ch5', ['ch1'], 'ch は ch1〜ch4 です', 'ch5'],
    ['ch2', 'ch1 | lowpass 1ms', ['ch1'], '操作は rc / clip / offset / gain / abs のどれかです', 'lowpass'],
    ['ch2', 'ch1 | rc 1', ['ch1'], 'rc は τ を 1ms / 200us のように書きます (例: rc 1ms)', '1'],
    ['ch2', 'ch1 | clip 0.7V -0.7V', ['ch1'], 'clip は下の値を先に書きます (例: clip -0.7V 0.7V)', '0.7V'],
    ['ch2', 'ch1 | clip 0.7', ['ch1'], 'clip は「clip -0.7V 0.7V」(両側) か「clip 0V」(下だけ) の形で書きます', '0.7'],
    ['ch2', 'ch1 | offset 4.3', ['ch1'], 'offset は 4.3V / -0.7V のように単位を付けます', '4.3'],
    ['ch2', 'ch1 | gain 6dB', ['ch1'], 'gain は 0.5 / 2 / -1 のように倍率 (単位なし) で書きます', '6dB'],
    ['ch2', 'ch1 | abs 1V', ['ch1'], 'abs の後ろには何も書きません', '1V'],
    ['ch2', 'ch1 || abs', ['ch1'], '| の後ろに操作を書きます (例: ch1 | rc 1ms)', '|'],
    ['ch1', '= 2V * t', [], '式 (= で始まる行) はまだ書けません (この版は波と操作だけ)', '='],
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
    expect(parseTriggerLine('ch1 rising 1V')).toEqual({ ok: true, value: { source: 'ch1', edge: 'rising', level: 1 } });
    expect(parseTriggerLine('ch2 falling')).toEqual({ ok: true, value: { source: 'ch2', edge: 'falling', level: null } });
  });

  test.each([
    ['ch1', 'trigger: は「ch1 rising 1V」の形で書きます (向きは rising / falling、水準は省けます)', 'ch1'],
    ['ch1 up 1V', 'trigger: の向きは rising か falling です', 'up'],
    ['ch1 rising 1', 'trigger: の水準は 1V / -500mV のように単位を付けます', '1'],
    ['cha rising', 'trigger: は ch1〜ch4 のどれかで合わせます', 'cha'],
    ['ch1 rising 1V 2V', 'trigger: は「ch1 rising 1V」の形で書きます (向きは rising / falling、水準は省けます)', '2V'],
  ])('refuses %s', (text, message, token) => {
    expect(parseTriggerLine(text)).toEqual({ ok: false, error: { message, line: null, token } });
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
