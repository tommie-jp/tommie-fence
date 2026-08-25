import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

const parse = (...argv: string[]) => parseArgs(argv);

describe('parseArgs', () => {
  test('reads the files to draw', () => {
    expect(parse('render', 'examples')).toEqual({
      ok: true,
      value: { targets: ['examples'], outDir: null, emitTex: false },
    });
  });

  test('reads several files', () => {
    const result = parse('render', 'a.md', 'b.md');

    expect(result.ok && result.value.targets).toEqual(['a.md', 'b.md']);
  });

  test('reads where to write the drawings', () => {
    const result = parse('render', 'examples', '--out', 'examples/out');

    expect(result.ok && result.value.outDir).toBe('examples/out');
  });

  test('reads the switch that writes latex instead of drawing', () => {
    const result = parse('render', 'examples', '--emit-tex');

    expect(result.ok && result.value.emitTex).toBe(true);
  });

  test('draws unless it is told to write latex', () => {
    const result = parse('render', 'examples');

    expect(result.ok && result.value.emitTex).toBe(false);
  });

  test('asks for a command it knows', () => {
    expect(parse('draw', 'a.md')).toMatchObject({ ok: false });
    expect(parse()).toMatchObject({ ok: false });
  });

  test('asks for something to draw', () => {
    expect(parse('render')).toMatchObject({ ok: false });
  });

  test('says which option it does not know', () => {
    const result = parse('render', 'a.md', '--wat');

    expect(result.ok === false && result.message).toContain('--wat');
  });

  test('asks for the directory that --out needs', () => {
    expect(parse('render', 'a.md', '--out')).toMatchObject({ ok: false });
    expect(parse('render', 'a.md', '--out', '--x')).toMatchObject({ ok: false });
  });
});
