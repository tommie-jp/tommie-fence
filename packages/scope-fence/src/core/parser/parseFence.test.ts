import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

const messages = (source: string): readonly string[] => parseFence(source).errors.map((error) => error.message);

describe('parseFence — 段 0', () => {
  test('says an empty fence is empty and where to start', () => {
    expect(parseFence('').errors).toEqual([{ message: 'scope フェンスが空です (ch1: から書き始めます)', line: null }]);
    expect(parseFence('').doc.time).toBeNull();
  });

  test('names an unknown key with its line and the keys it takes', () => {
    const [error] = parseFence('title: x\ntimebase: 1ms/div').errors;
    expect(error?.line).toBe(2);
    expect(error?.token).toBe('timebase');
    expect(error?.message).toContain('知らないキーです: timebase');
    expect(error?.message).toContain('view / title / time / trigger / ch1 / ch2 / ch3 / ch4');
  });

  test('names the later of two time: keys', () => {
    const errors = parseFence('time: 1ms/div\ntime: 2ms/div').errors;
    expect(errors).toEqual([{ message: 'time: が 2 つあります (1 つにまとめます)', line: 2, token: 'time' }]);
    expect(parseFence('time: 1ms/div\ntime: 2ms/div').doc.time?.perDiv).toBe(1e-3);
  });

  test('reads title and time', () => {
    const { doc, errors } = parseFence('title: 図3 RC の充電\ntime: 200us/div');
    expect(errors).toEqual([]);
    expect(doc.title).toBe('図3 RC の充電');
    expect(doc.time?.perDiv).toBeCloseTo(200e-6, 15);
    expect(doc.time?.line).toBe(2);
  });

  test('asks for /div on time:', () => {
    expect(messages('time: 1ms')).toEqual(['time: は 1ms/div / 200us/div のように /div を付けます']);
    expect(messages('time: 1/div')).toEqual(['time: は 1ms/div / 200us/div のように /div を付けます']);
    expect(messages('time: 100s/div')).toEqual(['time: は 1ns/div〜60s/div です']);
  });

  test('reads view: time and turns away the views it does not know', () => {
    expect(messages('view: time')).toEqual([]);
    expect(messages('view: fft')).toEqual(['view: は time か xy です']);
  });

  test('says the outside must be a map', () => {
    expect(messages('- a\n- b')).toEqual(['フェンスの一番外側は `キーと値` の並びにします (`ch1: ...` から)']);
  });

  test('reports a YAML syntax error on its line, once', () => {
    const { errors } = parseFence('title: [x\n');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/^YAML の構文エラー/);
  });

  test('reads style: like vna', () => {
    expect(parseFence('style: dark').doc.style.theme).toBe('dark');
    expect(messages('style:\n  theme: blue')).toEqual(['知らないテーマです: blue (light / dark / mono)']);
  });
});

describe('parseFence — 段 1', () => {
  const FIVE_ONE = [
    'title: 図3 RC の充電',
    'time: 1ms/div',
    'trigger: ch1 rising 1V',
    'ch1: square 100Hz 1V offset 1V',
    'ch2: ch1 | rc 1ms',
    'cursors: [0, 1ms]',
    'measure: [vpp, freq]',
  ].join('\n');

  test('reads the 5-1 fence', () => {
    const { doc, errors } = parseFence(FIVE_ONE);
    expect(errors).toEqual([]);
    expect(doc.channels.map((channel) => [channel.name, channel.source.kind, channel.line])).toEqual([['ch1', 'wave', 4], ['ch2', 'ref', 5]]);
    expect(doc.trigger).toEqual({ source: 'ch1', edge: 'rising', level: 1, position: 0, line: 3 });
    expect(doc.cursors).toEqual([{ t: 0, line: 6 }, { t: 1e-3, line: 6 }]);
    expect(doc.measures).toEqual(['vpp', 'freq']);
  });

  test('reads channels in ch order, whatever order they are written in', () => {
    const { doc, errors } = parseFence('ch2: ch1 | abs\nch1: sine 1kHz 1V');
    expect(errors).toEqual([]);
    expect(doc.channels.map((channel) => channel.name)).toEqual(['ch1', 'ch2']);
  });

  test('refuses a reference to a later channel, and a reference to one that did not read', () => {
    expect(messages('ch1: ch2\nch2: sine 1kHz 1V')).toEqual(['ch1 は波で書きます (前に参照できる ch がありません。例: ch1: sine 1kHz 1V)']);
    expect(messages('ch1: sine 1000 1\nch2: ch1 | rc 1ms')).toEqual([
      '周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます',
      'ch1 が読めないので ch2 も描けません',
    ]);
  });

  test('reads the map form with range and position', () => {
    const { doc, errors } = parseFence('ch1: {wave: square 100Hz 1V offset 1V, range: 500mV/div, position: -2div}');
    expect(errors).toEqual([]);
    expect(doc.channels[0]).toMatchObject({ range: 0.5, position: -2 });
    expect(messages('ch1: {range: 1V/div}')).toEqual(['ch1: を並びで書くときは wave: が要ります (例: {wave: sine 1kHz 1V, range: 500mV/div})']);
    expect(messages('ch1: {wave: sine 1kHz 1V, range: 1V}')).toEqual(['range: は 500mV/div / 2V/div のように /div を付けます']);
    expect(messages('ch1: {wave: sine 1kHz 1V, position: 2}')).toEqual(['position: は 0 V の基準の位置を -2div のように書きます (中央が 0、上が正)']);
    expect(messages('ch1: {wave: sine 1kHz 1V, color: red}')).toEqual(['知らない項目です: color (書けるのは wave / range / position)']);
  });

  test('says a filled-in default as a notice on the channel line', () => {
    const { errors } = parseFence('ch1: pulse 1kHz 1V');
    expect(errors).toEqual([{ message: 'pulse の duty は既定の 25% で描いています', line: 1, notice: true }]);
  });

  test('checks the trigger source is a channel that was written and read', () => {
    expect(messages('ch1: sine 1kHz 1V\ntrigger: ch3 rising')).toEqual(['trigger: の ch3 が書かれていません']);
    expect(messages('ch1: sine 1kHz\ntrigger: ch1 rising')).toEqual([
      'sine は周波数と振幅を書きます (例: sine 1kHz 1V)',
      'trigger: の ch1 が読めないので、トリガを合わせられません',
    ]);
    expect(messages('trigger: ch1 up')).toEqual(['trigger: の向きは rising か falling です']);
  });

  test('reads cursors and measure in their short forms, and refuses the rest', () => {
    expect(parseFence('cursors: 1ms').doc.cursors).toEqual([{ t: 1e-3, line: 1 }]);
    expect(parseFence('measure: vpp freq').doc.measures).toEqual(['vpp', 'freq']);
    expect(messages('cursors: [0, 1ms, 2ms]')).toEqual(['カーソルは 2 本までです (X1 と X2)']);
    expect(messages('cursors: [0.5]')).toEqual(['カーソルは 0 / 1ms / -500us のように単位を付けます']);
    expect(messages('cursors: {a: 1}')).toEqual(['cursors: は [0, 1ms] か `- 1ms` の並びで書きます']);
    expect(messages('measure: []')).toEqual(['measure: は [vpp, freq] のように並べます']);
    expect(messages('measure: [vpp, amp]')[0]).toContain('知らない測り方です: amp');
  });

  test('reads the name of data: and refuses a path', () => {
    expect(parseFence('data: 5-1-rc.csv').doc.data).toEqual({ name: '5-1-rc.csv', line: 1 });
    for (const bad of ['../x.csv', '/etc/passwd', 'a/b.csv', 'x.s2p']) {
      expect(messages(`data: ${bad}`)[0]).toContain('data: には .md と同じ場所の WaveForms の CSV');
    }
  });

  test('reads notes: (stage 3b)', () => {
    expect(messages('notes:\n  - text 1ms 1V: x')).toEqual([]);
    expect(parseFence('notes:\n  - text 1ms 1V: x').doc.notes).toHaveLength(1);
  });

  test('asks for a wave on an empty channel', () => {
    expect(messages('ch1:')).toEqual(['ch1: には波を 1 行で書きます (例: ch1: sine 1kHz 1V)']);
  });
});
