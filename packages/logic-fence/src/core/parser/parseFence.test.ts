import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

const messages = (source: string): string[] => parseFence(source).errors.map((error) => error.message);

const HEAD = 'device: ad3\ntime: 1s/div\n';

describe('parseFence', () => {
  test('reads a whole fence', () => {
    const { doc, errors } = parseFence(`${HEAD}sample: 1kHz
start: -1s
signals:
  CLK: dio0 clock 1Hz
  A: dio1..dio2 counter on CLK rising start 0 wrap 3
buses:
  Address: A1..A0 dec
decode:
  Serial: uart CLK baud 9600 8N1
cursors: [4.5s, 5.5s]
trigger: CLK rising at 0s
style: dark
`);
    expect(errors).toEqual([]);
    expect(doc.device).toBe('ad3');
    expect(doc.time?.value).toEqual({ perDiv: 1, written: 'time' });
    expect(doc.start?.value).toBe(-1);
    expect(doc.sample?.value).toBe(1000);
    expect(doc.signals.map((entry) => entry.name)).toEqual(['CLK', 'A']);
    expect(doc.buses[0]).toMatchObject({ name: 'Address', bits: ['A1', 'A0'], radix: 'dec' });
    expect(doc.decode[0]?.spec).toMatchObject({ lane: 'CLK', baud: 9600 });
    expect(doc.cursors.map((cursor) => cursor.time)).toEqual([4.5, 5.5]);
    expect(doc.trigger).toMatchObject({ lane: 'CLK', edge: 'rising', at: 0 });
    expect(doc.style.theme).toBe('dark');
  });

  test('window: gives ten divisions', () => {
    expect(parseFence('device: ad3\nwindow: 10s\n').doc.time?.value).toEqual({ perDiv: 1, written: 'window' });
  });

  test('asks for the device and lists the spellings', () => {
    expect(messages('time: 1s/div')[0]).toContain('ad3 / generic');
    expect(messages('device: ad4\ntime: 1s/div')[0]).toContain('ad3 / generic');
  });

  test('asks for exactly one of time: and window:', () => {
    expect(messages('device: ad3').join()).toContain('time: 1s/div');
    expect(messages('device: ad3\ntime: 1s/div\nwindow: 10s').join()).toContain('片方だけ');
    expect(messages('device: ad3\ntime: 1s').join()).toContain('/div');
  });

  test('names the keys it accepts when one is unknown', () => {
    const [first] = parseFence(`${HEAD}sampel: 1kHz`).errors;
    expect(first?.message).toContain('知らないキーです: sampel');
    expect(first?.message).toContain('signals');
    expect(first?.line).toBe(3);
  });

  test('refuses a key written twice', () => {
    expect(messages(`${HEAD}time: 2s/div`).join()).toContain('2 つあります');
  });

  test('refuses a bare number for sample, start and the cursors', () => {
    expect(messages(`${HEAD}sample: 1000`).join()).toContain('sample:');
    expect(messages(`${HEAD}start: 1`).join()).toContain('start:');
    expect(messages(`${HEAD}cursors: [1, 2s]`).join()).toContain('カーソル');
  });

  test('allows two cursors at most', () => {
    expect(messages(`${HEAD}cursors: [1s, 2s, 3s]`).join()).toContain('2 つまで');
  });

  test('says where a signal line is wrong, with the accepted kinds', () => {
    const { errors } = parseFence(`${HEAD}signals:\n  CLK: dio0 clok 1Hz\n`);
    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('clock');
  });

  test('refuses a lane name that is not an identifier', () => {
    expect(messages(`${HEAD}signals:\n  "a b": clock 1Hz`).join()).toContain('名前は');
  });

  test('needs a radix at the end of a bus and expands A3..A0', () => {
    expect(messages(`${HEAD}buses:\n  X: A1 A0`).join()).toContain('基数');
    expect(parseFence(`${HEAD}buses:\n  X: D3..D0 hex`).doc.buses[0]?.bits).toEqual(['D3', 'D2', 'D1', 'D0']);
    expect(parseFence(`${HEAD}buses:\n  X: D0..D3 bin`).doc.buses[0]?.bits).toEqual(['D0', 'D1', 'D2', 'D3']);
    expect(messages(`${HEAD}buses:\n  X: A3..B0 hex`).join()).toContain('同じ名前');
  });

  test('needs the trigger edge and reads at', () => {
    expect(messages(`${HEAD}trigger: CLK`).join()).toContain('trigger:');
    expect(parseFence(`${HEAD}trigger: CLK falling`).doc.trigger).toMatchObject({ edge: 'falling', at: null });
    expect(messages(`${HEAD}trigger: CLK rising at 3`).join()).toContain('単位');
  });

  test('still gives a document when the YAML is broken', () => {
    const { doc, errors } = parseFence('device: [ad3');
    expect(doc.device).toBeNull();
    expect(errors[0]?.message).toContain('YAML');
  });

  test('says the fence is empty', () => {
    expect(messages('')[0]).toContain('空です');
  });

  test('says the outside must be key and value', () => {
    expect(messages('- a\n- b')[0]).toContain('一番外側');
  });
});
