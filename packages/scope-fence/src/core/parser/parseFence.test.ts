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

  test('reads view: time and turns away the views it cannot draw yet', () => {
    expect(messages('view: time')).toEqual([]);
    expect(messages('view: xy')).toEqual(['view: xy はまだ描けません (この版で描けるのは time だけ)']);
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
