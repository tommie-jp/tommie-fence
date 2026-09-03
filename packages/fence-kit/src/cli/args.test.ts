import { describe, expect, test } from 'vitest';
import { parseCliArgs } from './args.ts';

/**
 * 3 つのフェンスが同じ口を持つことを、ここ 1 か所で見る。
 * 各パッケージ側は「自分の綴りが通る」ことだけを見ればよい。
 */
const parsed = (argv: readonly string[]): ReturnType<typeof parseCliArgs> => parseCliArgs(argv);

describe('parseCliArgs', () => {
  test('reads render with targets and an output directory', () => {
    const result = parsed(['render', 'docs', 'a.md', '--out', 'out']);

    expect(result.ok && result.value).toEqual({
      command: 'render', targets: ['docs', 'a.md'], outDir: 'out', flags: new Set(),
    });
  });

  test('reads check without an output directory', () => {
    const result = parsed(['check', 'docs']);

    expect(result.ok && result.value.command).toBe('check');
    expect(result.ok && result.value.outDir).toBe(null);
  });

  test('refuses --out on check, since check writes nothing', () => {
    expect(parsed(['check', 'docs', '--out', 'x'])).toEqual({
      ok: false, message: 'check は何も書き出さないので --out は使えません',
    });
  });

  test('answers the version when asked at the head', () => {
    for (const flag of ['--version', '-v']) {
      const result = parsed([flag]);

      expect(result.ok && result.value.command).toBe('version');
    }
  });

  test('does not let a version flag written later slip past the check', () => {
    // どこに書いても効くことにすると、`check docs -v` が何も調べずに 0 で
    // 終わり、CI の関門が黙って通る。
    const result = parsed(['check', 'docs', '-v']);

    expect(result).toEqual({ ok: false, message: '知らないオプションです: -v' });
  });

  test('raises only the flags the fence says it knows', () => {
    const known = parseCliArgs(['render', 'a.md', '--emit-tex'], ['--emit-tex']);
    const unknown = parseCliArgs(['render', 'a.md', '--emit-tex']);

    expect(known.ok && known.value.flags.has('--emit-tex')).toBe(true);
    expect(unknown).toEqual({ ok: false, message: '知らないオプションです: --emit-tex' });
  });

  test('needs a command and at least one target', () => {
    expect(parsed([])).toEqual({ ok: false, message: 'render か check を指定します' });
    expect(parsed(['render'])).toEqual({ ok: false, message: '描画するファイルかディレクトリを指定します' });
  });

  test('needs a value after --out', () => {
    expect(parsed(['render', 'a.md', '--out'])).toEqual({ ok: false, message: '--out の後ろに出力先を書きます' });
    expect(parsed(['render', 'a.md', '--out', '-x'])).toEqual({
      ok: false, message: '--out の後ろに出力先を書きます',
    });
  });
});
