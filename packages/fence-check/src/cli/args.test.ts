import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  test('defaults to all three fences, text, no top', () => {
    expect(parseArgs(['book'])).toEqual({ ok: true, value: { targets: ['book'], json: false, only: ['circuit', 'breadboard', 'perfboard'], min: null, top: 0, tex: false, baseline: null, allow: null, write: false } });
  });

  test('reads every option', () => {
    const parsed = parseArgs(['--json', 'a.md', '--only', 'circuit,perfboard', '--min', '2.5', '--top', '20', '--tex', 'b']);
    expect(parsed).toEqual({ ok: true, value: { targets: ['a.md', 'b'], json: true, only: ['circuit', 'perfboard'], min: 2.5, top: 20, tex: true, baseline: null, allow: null, write: false } });
  });

  test('reads the baseline, the allow list and --write', () => {
    const parsed = parseArgs(['.', '--baseline', 'fence-check.json', '--allow', 'fence-check-allow.json', '--write']);
    expect(parsed.ok && parsed.value).toMatchObject({ baseline: 'fence-check.json', allow: 'fence-check-allow.json', write: true });
  });

  test.each([
    [[], '1 つ以上'],
    [['a', '--only', 'scope'], '--only'],
    [['a', '--min', '-1'], '0 以上'],
    [['a', '--top'], '値がありません'],
    [['a', '--fix'], '知らない指定'],
    [['a', '--write'], '--baseline'],
    [['a', '--allow', 'allow.json'], '--baseline'],
    [['a', '--baseline'], '値がありません'],
  ])('refuses %j', (argv, message) => {
    const parsed = parseArgs(argv);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(message);
  });
});
