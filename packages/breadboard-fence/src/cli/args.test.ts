import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  test('reads the check command, which writes nothing', () => {
    expect(parseArgs(['check', 'examples'])).toEqual({
      ok: true,
      value: { command: 'check', targets: ['examples'], outDir: null },
    });
  });

  test('refuses an output directory for check, since it writes nothing', () => {
    const result = parseArgs(['check', 'examples', '--out', 'dist']);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('--out');
  });

  test('reads the targets of a render command', () => {
    const result = parseArgs(['render', 'examples']);

    expect(result.ok && result.value).toEqual({ command: 'render', targets: ['examples'], outDir: null });
  });

  test('keeps every target when no output directory is given', () => {
    const result = parseArgs(['render', 'one.md', 'two.md']);

    expect(result.ok && result.value.targets).toEqual(['one.md', 'two.md']);
  });

  test('takes the output directory out of the targets', () => {
    const result = parseArgs(['render', 'examples', '--out', 'build']);

    expect(result.ok && result.value).toEqual({ command: 'render', targets: ['examples'], outDir: 'build' });
  });

  test('accepts the output directory before the targets', () => {
    const result = parseArgs(['render', '--out', 'build', 'a.md', 'b.md']);

    expect(result.ok && result.value).toEqual({ command: 'render', targets: ['a.md', 'b.md'], outDir: 'build' });
  });

  test('reports a command it does not know', () => {
    expect(parseArgs(['draw', 'a.md']).ok).toBe(false);
    expect(parseArgs([]).ok).toBe(false);
  });

  test('reports an output option with no directory after it', () => {
    expect(parseArgs(['render', 'a.md', '--out']).ok).toBe(false);
  });

  test('reports a render command with nothing to render', () => {
    expect(parseArgs(['render']).ok).toBe(false);
    expect(parseArgs(['render', '--out', 'build']).ok).toBe(false);
  });

  test('reports an option that the command does not have', () => {
    const result = parseArgs(['render', 'a.md', '--force']);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('--force');
  });
});
