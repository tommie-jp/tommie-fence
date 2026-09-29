import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

const messages = (source: string): readonly string[] => parseFence(source).errors.map((error) => error.message);

describe('parseFence — device:', () => {
  test('refuses a fence without device:, naming all five spellings', () => {
    const [said] = messages('title: x');
    expect(said).toBe('device: は ad2 / ad3 / tinysa / tinysa-ultra / generic のどれかを書きます (計算の仕方が変わります)');
  });

  test('refuses a device it does not know, pointing at the spelling', () => {
    const { errors, doc } = parseFence('device: ultra');
    expect(doc.device).toBeNull();
    expect(errors[0]).toMatchObject({ line: 1, token: 'ultra' });
    expect(errors[0]?.message).toContain('tinysa-ultra');
  });

  test('reads each of the five devices', () => {
    for (const name of ['ad2', 'ad3', 'tinysa', 'tinysa-ultra', 'generic']) {
      const { doc, errors } = parseFence(`device: ${name}`);
      expect(doc.device).toBe(name);
      expect(errors).toEqual([]);
    }
  });

  test('says an empty fence is empty, and what to write first', () => {
    expect(messages('')[0]).toContain('device: は ad2');
  });
});

describe('parseFence — keys', () => {
  test('names the keys it takes when a key is unknown', () => {
    expect(messages('device: ad2\nfoo: 1')[0]).toMatch(/^知らないキーです: foo \(書けるのは device \/ title/);
  });

  test('refuses the same key twice', () => {
    expect(messages('device: ad2\ntitle: a\ntitle: b')).toEqual(['title: が 2 つあります (1 つにまとめます)']);
  });

  test('keeps the title and the style', () => {
    const { doc } = parseFence('device: ad2\ntitle: 図1\nstyle: dark');
    expect(doc.title).toBe('図1');
    expect(doc.style.theme).toBe('dark');
  });

  test('refuses a fence that is not a map', () => {
    expect(messages('- a\n- b')[0]).toContain('キーと値');
  });
});

describe('parseFence — keys of the other kind of instrument', () => {
  test('refuses rbw: on ad2, saying what sets the resolution now', () => {
    expect(messages('device: ad2\nsweep: 0-20kHz\nrbw: 1kHz')).toEqual([
      'ad2 では rbw: は書けません (分解能は samples: と掃引の幅で決まります。いまは 6.250 Hz)',
    ]);
  });

  test('refuses window: on tinysa, and the other swept-only or fft-only keys', () => {
    expect(messages('device: tinysa\nwindow: hann')).toEqual(['tinysa では window: は書けません (掃引型に窓はありません)']);
    expect(messages('device: tinysa-ultra\nsamples: 8192')[0]).toContain('samples: は書けません');
    for (const key of ['points: 101', 'atten: 10dB', 'lna: on']) {
      expect(messages(`device: ad3\n${key}`)[0]).toMatch(/^ad3 では (points|atten|lna): は書けません/);
    }
  });

  test('refuses floor: where the floor comes from the instrument, and lna: on where there is no LNA', () => {
    expect(messages('device: tinysa-ultra\nfloor: -90dBm')[0]).toContain('tinysa-ultra では floor: は書けません');
    expect(messages('device: tinysa\nlna: on')[0]).toContain('LNA がありません');
    expect(parseFence('device: tinysa-ultra\nlna: on').doc.lna?.value).toBe(true);
    expect(parseFence('device: generic\nfloor: -120dBm').doc.floor?.value).toEqual({ value: -120, unit: 'dBm' });
  });

  test('refuses points in sweep: on an FFT instrument', () => {
    expect(messages('device: ad2\nsweep: 0-20kHz 101')[0]).toContain('sweep: に点数は書けません');
  });
});

describe('parseFence — values', () => {
  test('reads 11-4 without a word', () => {
    const { doc, errors } = parseFence('device: tinysa-ultra\nsweep: 0-960M 450\nrbw: 300kHz\nref: -10dBm\nsignal: square 100MHz -10dBm\nmarkers: [100M, 300M, 500M]');
    expect(errors).toEqual([]);
    expect(doc.sweep?.value).toEqual({ start: 0, stop: 960e6, points: 450, centered: false });
    expect(doc.rbw?.value).toBe(300e3);
    expect(doc.ref?.value).toEqual({ value: -10, unit: 'dBm' });
    expect(doc.signal).toHaveLength(1);
    expect(doc.markers.map((marker) => (marker.kind === 'f' ? marker.f : marker.kind))).toEqual([100e6, 300e6, 500e6]);
  });

  test('reads center: + span:, and refuses them beside sweep: or alone', () => {
    expect(parseFence('device: tinysa-ultra\ncenter: 30MHz\nspan: 2MHz').doc.sweep?.value).toEqual({ start: 29e6, stop: 31e6, points: null, centered: true });
    expect(messages('device: tinysa-ultra\nsweep: 0-1M\ncenter: 30MHz\nspan: 2MHz')).toEqual(['sweep: と center: + span: は片方だけ書きます']);
    expect(messages('device: tinysa-ultra\ncenter: 30MHz')[0]).toContain('対で書きます');
    expect(messages('device: tinysa-ultra\ncenter: 30MHz\nspan: 0')[0]).toContain('ゼロスパン');
    expect(messages('device: tinysa-ultra\ncenter: 30\nspan: 2MHz')[0]).toContain('単位か接頭辞');
  });

  test('refuses numbers without a unit', () => {
    expect(messages('device: tinysa-ultra\nrbw: 300')[0]).toContain('単位を付けます');
    expect(messages('device: tinysa-ultra\nref: -10')[0]).toBe('ref: は -10dBm / 0dBV のように単位を付けます');
    expect(messages('device: tinysa-ultra\natten: 20')[0]).toBe('atten: は 10dB のように dB を付けます');
    expect(messages('device: tinysa-ultra\nsignal: sine 1000 1')[0]).toBe('周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます');
    expect(messages('device: tinysa-ultra\nmarkers: [1000]')[0]).toContain('単位か接頭辞');
  });

  test('refuses operations in signal:, sending them to scope', () => {
    expect(messages('device: ad2\nsignal: square 1kHz 1V | rc 1ms')).toEqual(['spectrum の signal: に操作は書けません (加工した波は scope で描きます)']);
  });

  test('refuses a fifth marker, and delta / noise for now', () => {
    expect(messages('device: ad2\nmarkers: [1kHz, 2kHz, 3kHz, 4kHz, 5kHz]')).toEqual(['マーカーは 4 つまでです (M1〜M4)']);
    expect(messages('device: ad2\nmarkers:\n  - delta 1kHz')[0]).toContain('delta はまだ書けません');
    expect(messages('device: ad2\nmarkers: [foo]')[0]).toContain('peak で書きます');
  });

  test('reads a list of waves, up to sixteen, and says the pulse duty it assumed', () => {
    const { doc, errors } = parseFence('device: ad2\nsignal:\n  - sine 1kHz 1V\n  - pulse 2kHz 1V');
    expect(doc.signal).toHaveLength(2);
    expect(errors).toEqual([{ message: 'pulse の duty は既定の 25% で描いています', line: 4, notice: true }]);
    const many = Array.from({ length: 17 }, () => '  - sine 1kHz 1V').join('\n');
    expect(messages(`device: ad2\nsignal:\n${many}`)).toEqual(['signal: の波は 16 本までです']);
    expect(messages('device: ad2\nsignal:\n  - ""')[0]).toContain('波を 1 行で');
  });

  test('checks samples:, window:, unit:, scale: and lna:', () => {
    expect(messages('device: ad2\nsamples: 1000')[0]).toContain('2 の冪');
    expect(messages('device: ad2\nwindow: kaiser')[0]).toBe('window: は rect / hann / flattop のどれかです');
    expect(messages('device: ad2\nunit: W')[0]).toBe('unit: は dBm か dBV です');
    expect(messages('device: ad2\nscale: 100dB')[0]).toBe('scale: は 0.1〜50 dB です');
    expect(messages('device: tinysa-ultra\nlna: maybe')[0]).toBe('lna: は on か off で書きます');
    expect(messages('device: tinysa-ultra\nref: -300dBm')[0]).toContain('-200〜40');
  });

  test('refuses both points in sweep: and points:, and notes: for now', () => {
    expect(messages('device: tinysa-ultra\nsweep: 0-1M 101\npoints: 101')).toEqual(['点数は sweep: か points: の片方に書きます']);
    expect(messages('device: tinysa-ultra\nnotes: []')[0]).toContain('notes: はまだ書けません');
  });

  test('takes a data file name next to the markdown only', () => {
    expect(parseFence('device: tinysa-ultra\ndata: fm.csv').doc.data?.value).toBe('fm.csv');
    expect(messages('device: tinysa-ultra\ndata: ../x.csv')[0]).toContain('/ や .. は書けません');
  });
});

describe('parseFence — hold:', () => {
  const read = (extra: string, device = 'tinysa-ultra') => parseFence(`device: ${device}\n${extra}`);

  test('reads one line, a list of lines and a nested list as snapshots', () => {
    const { doc, errors } = read('hold:\n  - sine 90MHz -50dBm\n  - [sine 80MHz -60dBm, sine 82MHz -60dBm]\n  - sine 74M..102M -54dBm');
    expect(errors).toEqual([]);
    expect(doc.hold.map((entry) => entry.kind)).toEqual(['waves', 'waves', 'tune']);
    const nested = doc.hold[1];
    expect(nested?.kind === 'waves' ? nested.waves : []).toHaveLength(2);
    expect(doc.hold[0]?.line).toBe(3);
  });

  test('takes a single line without a list', () => {
    expect(read('hold: sine 74M..102M -54dBm').doc.hold).toHaveLength(1);
  });

  test('is allowed on every device, and the FFT type asks for a step', () => {
    expect(read('hold: sine 1kHz 1V', 'ad2').errors).toEqual([]);
    const { errors } = read('hold: sine 1kHz..9kHz 1V', 'ad2');
    expect(errors[0]).toMatchObject({ line: 2, token: '1kHz..9kHz' });
    expect(errors[0]?.message).toContain('刻み');
  });

  test('says which line of the list is unreadable, and keeps the rest', () => {
    const { doc, errors } = read('hold:\n  - sine 90MHz -50dBm\n  - sine 90 -50dBm');
    expect(doc.hold).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
  });

  test('refuses a range inside a nested snapshot', () => {
    const { errors } = read('hold:\n  - [sine 74M..80M -50dBm, sine 90MHz -50dBm]');
    expect(errors[0]?.message).toContain('範囲');
    expect(errors[0]?.line).toBe(3);
  });

  test('refuses an item that is not a wave line', () => {
    expect(read('hold:\n  - {a: 1}').errors[0]?.message).toContain('hold:');
  });

  test('refuses more entries than the limit', () => {
    const lines = Array.from({ length: 65 }, () => '  - sine 90MHz -50dBm').join('\n');
    expect(read(`hold:\n${lines}`).errors.some((error) => error.message.includes('64'))).toBe(true);
  });

  test('refuses hold: together with data:, keeping the measured trace', () => {
    const { doc, errors } = read('data: a.csv\nhold: sine 90MHz -50dBm');
    expect(doc.hold).toEqual([]);
    expect(errors[0]?.message).toContain('data:');
    expect(errors[0]?.message).toContain('hold:');
  });

  test('says a wave the duty was assumed for, once for a range', () => {
    const { errors } = read('hold: pulse 74MHz..80MHz -50dBm');
    expect(errors.filter((error) => error.notice === true)).toHaveLength(1);
  });
});
