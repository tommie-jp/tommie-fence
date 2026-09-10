import { describe, expect, test } from 'vitest';
import { decodeShare, shareLabel } from './share.ts';

/**
 * リンクを組む。**頁はもう組まない** (URL は文書ではない。52 の docs/43) ので、
 * 試験の中で持つ。長い字や 256 種のバイトを literal で書けないため。
 * **綴りそのものは下の literal の試験が押さえている。**
 */
const encode = (kind: string, source: string): string => {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  const payload = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${kind}/${payload}`;
};

/** 読めた前提で中身だけ取る (読めなければ落ちる)。 */
const read = (hash: string): string => {
  const said = decodeShare(hash);
  if (said === null || !said.ok) throw new Error(`読めませんでした: ${hash.slice(0, 40)}`);
  return said.source;
};

describe('decodeShare', () => {
  /**
   * **配ってある綴りを literal で押さえる。** 自分で組んだものを自分で読む
   * 試験では、綴りが変わったことを捕まえられない (両方が一緒に動くため)。
   * この字は s.tommie.jp の転送ページ 109 本が指しているものと同じ形。
   */
  test('配ってあるリンクを読む (綴りを literal で押さえる)', () => {
    // Arrange: 「title: 図01 LED と抵抗 / board: half」の base64url。
    const hash = 'breadboard/dGl0bGU6IOWbszAxIExFRCDjgajmirXmipcKYm9hcmQ6IGhhbGYK';

    // Act
    const back = decodeShare(hash);

    // Assert
    expect(back).toEqual({ ok: true, kind: 'breadboard', source: 'title: 図01 LED と抵抗\nboard: half\n' });
  });

  test('往復しても字が変わらない', () => {
    const source = 'title: 図01 LED と抵抗\nboard: half\n';

    expect(decodeShare(encode('breadboard', source))).toEqual({ ok: true, kind: 'breadboard', source });
  });

  test('URL に置けない字を含まない (base64 の + / = を置き換える)', () => {
    // Arrange: base64 に + と / と詰め物が出る並びを作る。
    const source = Array.from({ length: 256 }, (_, code) => String.fromCharCode(code)).join('');

    // Act
    const payload = encode('perfboard', source).split('/')[1] ?? '';

    // Assert
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(read(encode('perfboard', source))).toBe(source);
  });

  test('先頭の # が付いていても読める', () => {
    const hash = encode('breadboard', 'board: half\n');

    expect(read(`#${hash}`)).toBe('board: half\n');
  });

  test('長いフェンスでも落ちない (btoa の引数の上限)', () => {
    const source = 'board: half\n'.repeat(5_000);

    expect(read(encode('breadboard', source))).toBe(source);
  });

  test('短い綴りのリンクも読める', () => {
    // 52 の docs/08 で綴りを短くすると決めてある。正を入れ替える日に
    // 配ってあるリンクが切れないよう、両方を読めるようにしてある。
    const hash = `bread/${encode('breadboard', 'board: half\n').split('/')[1] ?? ''}`;

    expect(decodeShare(hash)).toEqual({ ok: true, kind: 'breadboard', source: 'board: half\n' });
  });

  /**
   * **読めないリンクは黙って捨てない** (約束 6)。既定の例に落ちるだけだと、
   * 渡した相手には「別の図が出た」としか見えない。
   */
  describe('読めなかったとき', () => {
    test('知らない種類は、その綴りを添えて断る', () => {
      const said = decodeShare('vector/eA');

      expect(said).toMatchObject({ ok: false });
      expect(said && !said.ok && said.why).toContain('vector');
    });

    test('種類だけで中身が無ければ断る', () => {
      expect(decodeShare('breadboard/')).toMatchObject({ ok: false });
    });

    test('base64 として読めなければ断る', () => {
      expect(decodeShare('breadboard/****')).toMatchObject({ ok: false });
    });

    test('長すぎる綴りは切って返す (画面を押し流さない)', () => {
      const said = decodeShare(`${'z'.repeat(500)}/eA`);

      expect(said && !said.ok && said.why.length).toBeLessThan(80);
    });
  });

  /**
   * **共有リンクでないものには何も言わない。** ただの `#見出し` へ飛んだだけの
   * ハッシュに「読めません」と出すと、そちらのほうが嘘になる。
   */
  describe('そもそも共有リンクでないもの', () => {
    test('区切りが無ければ null', () => {
      expect(decodeShare('breadboard')).toBeNull();
      expect(decodeShare('midashi')).toBeNull();
    });

    test('空のハッシュは null', () => {
      expect(decodeShare('')).toBeNull();
      expect(decodeShare('#')).toBeNull();
    });
  });
});

/**
 * フェンスの題。**画面のあちこちで図の名前として出す** (例の欄、リンクで
 * 開いたときの一文、「試す」釦の引き当て)。もとは貼ったときの見た目を直す
 * ために足したもの (52 の docs/38)。
 */
describe('フェンスの題', () => {
  test('フェンスの title をそのまま題にする', () => {
    expect(shareLabel('breadboard', 'title: 図01 LED と抵抗\nboard: half\n')).toBe('図01 LED と抵抗');
  });

  test('引用符は外す (YAML の書き方の違いを持ち込まない)', () => {
    expect(shareLabel('circuit', 'title: "図02 RC"\n')).toBe('図02 RC');
    expect(shareLabel('circuit', "title: '図02 RC'\n")).toBe('図02 RC');
  });

  test('題が無ければ種類で言う (無題のリンクにしない)', () => {
    expect(shareLabel('perfboard', 'board: 12x7\n')).toBe('tommie-fence の perfboard 図');
    expect(shareLabel('circuit', 'title:   \n')).toBe('tommie-fence の circuit 図');
  });

  test('字下げした title は拾わない (部品の中の題は図の題ではない)', () => {
    expect(shareLabel('breadboard', 'parts:\n  title: これは部品\n')).toBe('tommie-fence の breadboard 図');
  });

  test('長い題は切る (貼った先で 1 行に収まる長さに)', () => {
    const said = shareLabel('circuit', `title: ${'あ'.repeat(200)}\n`);

    expect(said.length).toBeLessThan(70);
    expect(said.endsWith('…')).toBe(true);
  });
});
