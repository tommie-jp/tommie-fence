import { describe, expect, test } from 'vitest';
import { UNTITLED, asTyped, docFrom, isCrlf, nameOf, withNewlines } from './files.ts';

/**
 * **改行の形を保つ。** テキスト欄は値を LF に均すので、開いた時点で
 * 見分けておかないと、Windows で書いた `.md` を開いて保存しただけで
 * 全行が変更扱いになる。
 */
describe('改行', () => {
  test('CRLF で書かれているか見分ける', () => {
    expect(isCrlf('a\r\nb\r\n')).toBe(true);
    expect(isCrlf('a\nb\n')).toBe(false);
    expect(isCrlf('')).toBe(false);
  });

  test('欄に入れるときは LF に均す', () => {
    expect(asTyped('a\r\nb\r\n')).toBe('a\nb\n');
  });

  test('CRLF で開いたものは CRLF で書き戻す', () => {
    expect(withNewlines('a\nb\n', true)).toBe('a\r\nb\r\n');
  });

  test('LF で開いたものは LF のまま', () => {
    expect(withNewlines('a\nb\n', false)).toBe('a\nb\n');
  });

  test('往復しても増えない (CR が二重にならない)', () => {
    const was = 'a\r\nb\r\n';

    expect(withNewlines(asTyped(was), isCrlf(was))).toBe(was);
  });
});

describe('nameOf', () => {
  test('URL の末尾を名前にする', () => {
    expect(nameOf('https://example.test/docs/01-led.md')).toBe('01-led.md');
    expect(nameOf('https://example.test/a/b/x.md?v=2#top')).toBe('x.md');
  });

  test('日本語の名前も読める', () => {
    expect(nameOf('https://example.test/%E5%9B%B301.md')).toBe('図01.md');
  });

  /** 書き戻すときの名前になるので、拡張子の無い名前は付けない。 */
  test('.md でなければ既定の名前', () => {
    expect(nameOf('https://example.test/docs/')).toBe(UNTITLED);
    expect(nameOf('https://example.test/x.txt')).toBe(UNTITLED);
  });
});

/** **外から来た字**なので、開きに行く先は綴りで絞る。 */
describe('docFrom', () => {
  const HERE = 'https://tommie-jp.github.io/tommie-fence/';

  test('http(s) の行き先を返す', () => {
    expect(docFrom('?doc=https://example.test/x.md', HERE)).toBe('https://example.test/x.md');
  });

  test('相対の道も受ける (同じ出所の .md)', () => {
    expect(docFrom('?doc=examples/breadboard/01-led.md', HERE))
      .toBe('https://tommie-jp.github.io/tommie-fence/examples/breadboard/01-led.md');
  });

  test('http(s) でない綴りは断る', () => {
    expect(docFrom('?doc=javascript:alert(1)', HERE)).toBeNull();
    expect(docFrom('?doc=file:///etc/passwd', HERE)).toBeNull();
    expect(docFrom('?doc=data:text/plain,x', HERE)).toBeNull();
  });

  test('無ければ null', () => {
    expect(docFrom('', HERE)).toBeNull();
    expect(docFrom('?dev', HERE)).toBeNull();
    expect(docFrom('?doc=', HERE)).toBeNull();
  });
});
