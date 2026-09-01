import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  test('reads a command and its targets', () => {
    expect(parseArgs(['render', 'examples'])).toEqual({
      ok: true,
      value: { command: 'render', targets: ['examples'], outDir: null },
    });
  });

  test('reads where to write', () => {
    const result = parseArgs(['render', 'examples', '--out', 'examples/out']);

    expect(result.ok && result.value.outDir).toBe('examples/out');
  });

  test('takes more than one target', () => {
    const result = parseArgs(['check', 'a.md', 'b.md']);

    expect(result.ok && result.value.targets).toEqual(['a.md', 'b.md']);
  });

  test('refuses --out on check, which writes nothing', () => {
    expect(parseArgs(['check', 'examples', '--out', 'x']).ok).toBe(false);
  });

  test('refuses --out with nothing after it', () => {
    expect(parseArgs(['render', 'examples', '--out']).ok).toBe(false);
    expect(parseArgs(['render', 'examples', '--out', '--force']).ok).toBe(false);
  });

  test('refuses an option it does not know, instead of taking it as a file', () => {
    const result = parseArgs(['render', '--force', 'examples']);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('--force');
  });

  test('refuses a command it does not know', () => {
    expect(parseArgs(['draw', 'examples']).ok).toBe(false);
    expect(parseArgs([]).ok).toBe(false);
  });

  test('refuses a command with nothing to draw', () => {
    expect(parseArgs(['render']).ok).toBe(false);
  });
});
