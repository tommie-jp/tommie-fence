import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  test('defaults to all three fences, text, no top', () => {
    expect(parseArgs(['book'])).toEqual({ ok: true, value: { targets: ['book'], json: false, only: ['circuit', 'breadboard', 'perfboard'], min: null, top: 0 } });
  });

  test('reads every option', () => {
    const parsed = parseArgs(['--json', 'a.md', '--only', 'circuit,perfboard', '--min', '2.5', '--top', '20', 'b']);
    expect(parsed).toEqual({ ok: true, value: { targets: ['a.md', 'b'], json: true, only: ['circuit', 'perfboard'], min: 2.5, top: 20 } });
  });

  test.each([
    [[], '1 つ以上'],
    [['a', '--only', 'scope'], '--only'],
    [['a', '--min', '-1'], '0 以上'],
    [['a', '--top'], '値がありません'],
    [['a', '--fix'], '知らない指定'],
  ])('refuses %j', (argv, message) => {
    const parsed = parseArgs(argv);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(message);
  });
});
