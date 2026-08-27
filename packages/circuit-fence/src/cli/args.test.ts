import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.ts';

const parse = (...argv: string[]) => parseArgs(argv);

/** 描く・調べる指定として読めたときの中身。版だけを答える指定はここには来ない。 */
const commandOf = (...argv: string[]) => {
  const result = parse(...argv);
  if (!result.ok) throw new Error(result.message);
  if (result.value.command === 'version') throw new Error('版を答える指定でした');
  return result.value;
};

describe('parseArgs', () => {
  test('reads the files to draw', () => {
    expect(parse('render', 'examples')).toEqual({
      ok: true,
      value: { command: 'render', targets: ['examples'], outDir: null, emitTex: false },
    });
  });

  test('reads several files', () => {
    expect(commandOf('render', 'a.md', 'b.md').targets).toEqual(['a.md', 'b.md']);
  });

  test('reads where to write the drawings', () => {
    expect(commandOf('render', 'examples', '--out', 'examples/out').outDir).toBe('examples/out');
  });

  test('reads the switch that writes latex instead of drawing', () => {
    expect(commandOf('render', 'examples', '--emit-tex').emitTex).toBe(true);
  });

  test('draws unless it is told to write latex', () => {
    expect(commandOf('render', 'examples').emitTex).toBe(false);
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

describe('parseArgs の check', () => {
  test('reads the command that only validates', () => {
    expect(parse('check', 'examples')).toEqual({
      ok: true,
      value: { command: 'check', targets: ['examples'], outDir: null, emitTex: false },
    });
  });

  test('asks for something to check', () => {
    expect(parse('check').ok).toBe(false);
  });

  test('refuses the options that only make sense when drawing', () => {
    // 何も書き出さないコマンドなので、書き出し先を受けると嘘になる。
    expect(parse('check', 'a.md', '--out', 'tex').ok).toBe(false);
    expect(parse('check', 'a.md', '--emit-tex').ok).toBe(false);
  });

  test('still reads render as before', () => {
    expect(parse('render', 'examples')).toEqual({
      ok: true,
      value: { command: 'render', targets: ['examples'], outDir: null, emitTex: false },
    });
  });
});

describe('parseArgs の --version', () => {
  test('reads the switch that only prints the version', () => {
    expect(parse('--version')).toEqual({ ok: true, value: { command: 'version' } });
    expect(parse('-v')).toEqual({ ok: true, value: { command: 'version' } });
  });

  test('takes it as a command only when it comes first', () => {
    // どこに書いても効くことにすると、`check docs -v` が何も調べずに
    // 0 で終わり、CI の関門が黙って通る。
    expect(parse('check', 'docs', '-v').ok).toBe(false);
    expect(parse('render', 'examples', '--version').ok).toBe(false);
  });

  test('says which option it did not know when the version flag came late', () => {
    const result = parse('check', 'docs', '-v');

    expect(result.ok === false && result.message).toContain('-v');
  });

  test('still asks for a command when none is given', () => {
    expect(parse().ok).toBe(false);
  });
});
