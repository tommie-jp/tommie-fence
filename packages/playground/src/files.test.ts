import { describe, expect, test } from 'vitest';
import { UNTITLED, asTyped, canHold, docFrom, isCrlf, linkTo, nameOf, withNewlines } from './files.ts';

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

/**
 * **掴み手を持てるのは Chromium の PC だけ。** 無いときはダウンロードに
 * 落ちるので、有無を見分けられればよい。
 */
describe('canHold', () => {
  test('showOpenFilePicker のある窓なら持てる', () => {
    expect(canHold({ showOpenFilePicker: () => {} })).toBe(true);
  });

  test('無ければ持てない', () => {
    expect(canHold({})).toBe(false);
    expect(canHold(null)).toBe(false);
    expect(canHold(undefined)).toBe(false);
  });
});

/**
 * **アドレス欄と QR は同じ答えを使う。** 2 通りに数えると、配った QR と
 * 手元の URL が食い違う (52 の docs/44)。
 */
describe('linkTo', () => {
  const BASE = 'https://tommie-jp.github.io/tommie-fence/';

  test('同じ置き場の文書は相対の道で指す', () => {
    expect(linkTo(BASE, `${BASE}examples/breadboard/01-led.md`))
      .toBe(`${BASE}?doc=examples/breadboard/01-led.md`);
  });

  test('別の置き場の文書は URL のまま指す', () => {
    expect(linkTo(BASE, 'https://example.test/x.md'))
      .toBe(`${BASE}?doc=https://example.test/x.md`);
  });

  /**
   * **手元のファイルには URL が無い。** ディスクの上にしか無く、相手の端末
   * には存在しない。頁の URL だけを渡す (実機で「文書がない場合は ?doc=
   * なしで、そのページの URL だけを埋め込む」)。
   */
  test('置き場が無ければ頁の URL だけ', () => {
    expect(linkTo(BASE, null)).toBe(BASE);
    expect(linkTo(BASE, '')).toBe(BASE);
  });

  test('`/` と `:` は化けさせない (読み合わせる字なので)', () => {
    expect(linkTo(BASE, 'https://example.test/a/b.md')).toContain('https://example.test/a/b.md');
  });

  test('問い合わせの区切りは逃がす (行き先を切らない)', () => {
    const link = linkTo(BASE, 'https://example.test/x.md?v=2&y=3');

    expect(link).toContain('%3F');
    expect(link).toContain('%26');
  });

  /** 出した道はそのまま読み直せる (アドレス欄に置いたものを開き直せる)。 */
  test('出したリンクは docFrom で読み直せる', () => {
    const link = linkTo(BASE, `${BASE}examples/circuit/00-led.md`);
    const search = link.slice(link.indexOf('?'));

    expect(docFrom(search, BASE)).toBe(`${BASE}examples/circuit/00-led.md`);
  });
});
