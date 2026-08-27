import MarkdownIt from 'markdown-it';
import { describe, expect, test, vi } from 'vitest';
import { compileCircuit } from '../core/index.ts';
import { hashOf } from '../host/hash.ts';
import { circuitPlugin } from './markdownItPlugin.ts';
import type { FigureSource } from './markdownItPlugin.ts';

const RC = '```circuit\nparts:\n  R1: resistor a1 a3 10k\n```';

/** 何も描けていない図の置き場。 */
const emptySource = (): FigureSource => ({ lookup: () => undefined, enqueue: () => {} });

const md = (figures: FigureSource = emptySource()) => new MarkdownIt().use(circuitPlugin(figures));

/** 本文と同じ TeX の鍵。プラグインが引く鍵と揃えるために core を通して作る。 */
const hashFor = (fence: string): string => {
  const source = fence.split('\n').slice(1, -1).join('\n');
  return hashOf(compileCircuit(`${source}\n`).tex ?? '');
};

describe('circuitPlugin', () => {
  test('takes over a circuit fence instead of printing it as code', () => {
    const html = md().render(RC);

    expect(html).toMatch(/class="circuit(\s|")/);
    expect(html).not.toContain('<code');
  });

  test('leaves a fence of another language to the default renderer', () => {
    const html = md().render('```yaml\nparts:\n```');

    expect(html).toContain('<code');
    expect(html).not.toMatch(/class="circuit(\s|")/);
  });

  test('leaves a tikz fence alone so the existing extension keeps drawing it', () => {
    const html = md().render('```tikz\n\\begin{document}\n```');

    expect(html).toContain('<code');
    expect(html).not.toMatch(/class="circuit(\s|")/);
  });

  test('shows the reason on the line it was written rather than throwing', () => {
    const html = md().render('```circuit\nparts:\n  R1: resistor a1 a3\n bad: indent\n```');

    expect(html).toContain('行目');
    expect(html).toContain('circuit-error-card');
  });

  test('keeps working when the fence is empty', () => {
    expect(() => md().render('```circuit\n```')).not.toThrow();
  });

  test('counts the line in the markdown file, not inside the fence', () => {
    // 書き手が直しに行くのは Markdown の行。フェンスが下にあるほどずれる。
    const html = md().render(['# title', '', 'text', '', '```circuit', 'parts:', '  R1: resistr a1 a3', '```'].join('\n'));

    expect(html).toContain('7 行目');
  });

  test('asks for the drawing and says it is on its way', () => {
    const enqueue = vi.fn();
    const html = md({ lookup: () => undefined, enqueue }).render(RC);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(html).toContain('circuit-pending');
  });

  test('shows the drawing once it is ready', () => {
    const figures: FigureSource = { lookup: () => ({ svg: '<svg id="drawn"/>' }), enqueue: () => {} };
    const html = md(figures).render(RC);

    expect(html).toContain('id="drawn"');
    expect(html).not.toContain('circuit-pending');
  });

  test('does not ask again for a drawing it already has', () => {
    const enqueue = vi.fn();
    const html = md({ lookup: () => ({ svg: '<svg/>' }), enqueue }).render(RC);

    expect(enqueue).not.toHaveBeenCalled();
    expect(html).toContain('<svg');
  });

  test('looks the drawing up under the same key it was asked for', () => {
    const seen: string[] = [];
    md({
      lookup: (hash) => {
        seen.push(hash);
        return undefined;
      },
      enqueue: () => {},
    }).render(RC);

    expect(seen[0]).toBe(hashFor(RC));
  });

  test('shows why the engine could not draw it, on the line it came from', () => {
    const figures: FigureSource = {
      lookup: () => ({ errors: [{ message: 'TeX が止まりました', line: 2 }] }),
      enqueue: () => {},
    };
    const html = md(figures).render(RC);

    // フェンスの 2 行目 = Markdown の 3 行目。
    expect(html).toContain('3 行目: TeX が止まりました');
  });

  test('shows the netlist next to the drawing', () => {
    const figures: FigureSource = { lookup: () => ({ svg: '<svg/>' }), enqueue: () => {} };
    const html = md(figures).render('```circuit\nparts:\n  IN: port a1\n  R1: resistor a1 a3\n```');

    expect(html).toContain('ネットリスト');
    expect(html).toContain('IN');
  });

  test('keeps the drawing and reports the lines it could not read', () => {
    const figures: FigureSource = { lookup: () => ({ svg: '<svg/>' }), enqueue: () => {} };
    const html = md(figures).render(
      '```circuit\nparts:\n  R1: resistor a1 a3\n  R2: resistr b1 b3\n```',
    );

    expect(html).toContain('<svg');
    expect(html).toContain('4 行目');
  });

  test('paints the drawing with the ink of the theme the fence chose', () => {
    const figures: FigureSource = { lookup: () => ({ svg: '<svg><path stroke="#000"/></svg>' }), enqueue: () => {} };
    const html = md(figures).render('```circuit\nparts:\n  R1: resistor a1 a3\nstyle: dark\n```');

    expect(html).not.toContain('stroke="#000"');
    expect(html).toContain('stroke="#e6edf3"');
  });

  test('follows the editor theme when the fence does not choose one', () => {
    const figures: FigureSource = { lookup: () => ({ svg: '<svg><path stroke="#000"/></svg>' }), enqueue: () => {} };
    const html = md(figures).render(RC);

    expect(html).toContain('stroke="currentColor"');
    // 地の色をエディタに合わせるための目印。
    expect(html).toContain('circuit-auto');
  });

  // プレビューの図は読み手の地の文に合わせる。既定のままだと、注釈の字が
  // 周りの文章より小さく出て読みにくい。
  test('sizes the drawing by the size of the reader\'s own text', () => {
    const figures: FigureSource = {
      lookup: () => ({ svg: '<svg viewBox="0 0 80 40" width="106.667" height="53.333"></svg>' }),
      enqueue: () => {},
    };
    const html = md(figures).render(RC);

    expect(html).toContain('width="10em"');
  });

  // 外寸をドットで書いた図は、書いたとおりの大きさのままにする。
  test('leaves a fence that asked for a width in dots at that width', () => {
    const figures: FigureSource = {
      lookup: () => ({ svg: '<svg viewBox="0 0 80 40" width="106.667" height="53.333"></svg>' }),
      enqueue: () => {},
    };
    const html = md(figures).render('```circuit\nparts:\n  R1: resistor a1 a3\nstyle:\n  width: 200\n```');

    expect(html).toContain('width="200"');
    expect(html).not.toContain('em"');
  });

  test('sizes the drawing to the width the fence asked for', () => {
    const figures: FigureSource = {
      lookup: () => ({ svg: '<svg viewBox="0 0 10 8" width="100" height="80"></svg>' }),
      enqueue: () => {},
    };
    const html = md(figures).render('```circuit\nparts:\n  R1: resistor a1 a3\nstyle:\n  width: 200\n```');

    expect(html).toContain('width="200"');
    expect(html).toContain('viewBox="0 0 10 8"');
  });

  test('does not let the fence content escape into the surrounding html', () => {
    const html = md().render('```circuit\n"</div><img src=x onerror=alert(1)>": resistor a1 a3\n```');

    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=');
    expect(html.match(/<div/g)).toHaveLength(html.match(/<\/div>/g)?.length ?? 0);
  });
});
