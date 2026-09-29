import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { fenceEditors } from './editor/fences.ts';
import { MAPLESS_LANGUAGES } from './mapless.ts';
import { FIGURE_LANGUAGES, imageAfterFencePlugin } from './imageAfterFence.ts';
import type { ImageAfterFence } from './imageAfterFence.ts';

/**
 * GitHub 用の画像をプレビューで畳む (52 の docs/101)。フェンスの描画は入れず、
 * トークンの並べ替えだけを見る — フェンスは素のコードブロックのまま出る。
 */
const render = (source: string, mode: ImageAfterFence = 'collapse'): string =>
  new MarkdownIt().use(imageAfterFencePlugin({ mode: () => mode, label: (alt) => `GitHub: ${alt}` })).render(source);

const PAGES = 'https://example.github.io/book/01/circuit/a.svg';
const FIGURE = `\`\`\`circuit\nparts:\n  R1: resistor a1 a3\n\`\`\`\n\n![回路図](${PAGES})\n`;

describe('フェンスの直後の画像を畳む', () => {
  test('wraps the image right after a figure fence in a closed details', () => {
    const html = render(FIGURE);

    expect(html).toContain('<details class="tf-mirror"><summary>GitHub: 回路図</summary>');
    expect(html).not.toContain('<details open');
    expect(html.indexOf('<details')).toBeLessThan(html.indexOf(`<img src="${PAGES}"`));
    expect(html.indexOf(`<img src="${PAGES}"`)).toBeLessThan(html.indexOf('</details>'));
  });

  test('knows every fence the extension draws, in every spelling', () => {
    const languages = [...fenceEditors().map((one) => one.language), ...MAPLESS_LANGUAGES];
    expect([...FIGURE_LANGUAGES].sort()).toEqual([...languages].sort());

    for (const info of ['bread', 'breadboard', 'perfboard', 'vna title=x']) {
      expect(render(`\`\`\`${info}\nx\n\`\`\`\n\n![図](a.svg)\n`), info).toContain('<details');
    }
  });

  test('escapes the alt text in the summary', () => {
    expect(render('```graph\nx\n```\n\n![a<b>&c](a.svg)\n')).toContain('<summary>GitHub: a&lt;b&gt;&amp;c</summary>');
  });

  test('leaves images after other fences alone', () => {
    expect(render('```js\nx\n```\n\n![図](a.svg)\n')).not.toContain('<details');
  });

  test('leaves an image alone when a paragraph sits between it and the fence', () => {
    expect(render(`\`\`\`circuit\nx\n\`\`\`\n\n説明の文。\n\n![図](a.svg)\n`)).not.toContain('<details');
  });

  test('leaves a paragraph alone that holds more than one image', () => {
    expect(render('```circuit\nx\n```\n\n![a](a.svg) ![b](b.svg)\n')).not.toContain('<details');
    expect(render('```circuit\nx\n```\n\n![a](a.svg) の図\n')).not.toContain('<details');
  });

  test('handles each fence of a document on its own', () => {
    const html = render(`${FIGURE}\n本文。\n\n${FIGURE}`);
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain('<p>本文。</p>');
  });

  test('works inside list items too', () => {
    const html = render(`- 手順\n\n  \`\`\`scope\n  x\n  \`\`\`\n\n  ![画面](a.svg)\n`);
    expect(html).toContain('<details');
    expect(html).toContain('<img src="a.svg"');
  });

  test('drops the image when the setting says hide', () => {
    const html = render(FIGURE, 'hide');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<details');
    expect(html).toContain('<pre><code class="language-circuit">');
  });

  test('leaves the image as it is when the setting says show', () => {
    expect(render(FIGURE, 'show')).toBe(new MarkdownIt().render(FIGURE));
  });

  test('reads the setting on every render, so a change needs no reload', () => {
    let mode: ImageAfterFence = 'show';
    const md = new MarkdownIt().use(imageAfterFencePlugin({ mode: () => mode, label: (alt) => alt }));
    expect(md.render(FIGURE)).not.toContain('<details');
    mode = 'collapse';
    expect(md.render(FIGURE)).toContain('<details');
  });
});
