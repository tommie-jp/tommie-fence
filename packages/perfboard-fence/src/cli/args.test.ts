import { describe, expect, test } from 'vitest';
import { USAGE, parseArgs } from './args.ts';

/**
 * **読み取りの規則は fence-kit のテストが見張る** (`cli/args.test.ts`)。
 * ここで見るのは、このフェンスがその口に繋がっていることと、
 * 使い方の字がこのフェンスの綴りで書かれていること。
 */
describe('parseArgs', () => {
  test('goes through the shared reader, so render and check work the same way', () => {
    const rendered = parseArgs(['render', 'docs', '--out', 'out']);
    const checked = parseArgs(['check', 'docs']);

    expect(rendered.ok && rendered.value).toEqual({
      command: 'render', targets: ['docs'], outDir: 'out', flags: new Set(),
    });
    expect(checked.ok && checked.value.command).toBe('check');
  });

  test('answers the version, the way the other fences do', () => {
    const result = parseArgs(['--version']);

    expect(result.ok && result.value.command).toBe('version');
  });

  test('refuses an option it does not know, instead of taking it as a file', () => {
    expect(parseArgs(['render', 'a.md', '--emit-tex'])).toEqual({
      ok: false, message: '知らないオプションです: --emit-tex',
    });
  });
});

describe('USAGE', () => {
  test('names this fence and every command it takes', () => {
    for (const line of ['perfboard-fence render', 'perfboard-fence check', 'perfboard-fence --version']) {
      expect(USAGE).toContain(line);
    }
    expect(USAGE).toContain('```perfboard');
  });
});
