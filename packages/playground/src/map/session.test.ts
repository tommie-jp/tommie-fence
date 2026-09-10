import { panelHtml } from 'fence-kit';
import type { FenceEditor, Outgoing } from 'fence-kit';
import { createBreadboardEditor } from 'breadboard-fence/editor';
import { createPerfboardEditor } from 'perfboard-fence/editor';
import { createCircuitEditor } from 'circuit-fence/editor';
import { describe, expect, test } from 'vitest';
import { createMapSession } from './host.ts';
import type { Kind } from '../kinds.ts';

/**
 * **殻を頁の側から組めるか。** ここは DOM を要らない (`panelHtml` も
 * `createSession` も字を組むだけ)。iframe の中で動く部分はブラウザで確かめる。
 */

const CASES: readonly { kind: Kind; make: () => FenceEditor; body: string; part: string; to: string }[] = [
  {
    kind: 'breadboard',
    make: createBreadboardEditor,
    body: 'board: half\nparts:\n  R1: resistor a5 a10 330\n',
    part: 'R1',
    to: 'a7',
  },
  {
    kind: 'perfboard',
    make: createPerfboardEditor,
    body: 'board: 16x8\nparts:\n  R1: resistor c3 c7 330\n',
    part: 'R1',
    to: 'c4',
  },
  {
    kind: 'circuit',
    make: createCircuitEditor,
    body: 'parts:\n  R1: resistor a1 a2 10k\n',
    part: 'R1',
    to: 'b1',
  },
];

describe.each(CASES)('$kind のマップ', ({ kind, make, body, part, to }) => {
  /**
   * **文書は Markdown の全文** (52 の docs/43)。散文を前後に置いて、
   * 書き換えがフェンスの行だけに当たることも一緒に見る。
   */
  const open = () => {
    let now = ['# 見出し', '', `\`\`\`${kind}`, body.replace(/\n$/, ''), '```', '', 'あとがき。', ''].join('\n');
    const sent: Outgoing[] = [];
    const editor = make();
    const session = createMapSession({
      editors: [editor],
      text: () => now,
      setText: (next) => {
        now = next;
      },
      // 本文の 1 行目 (見出し 0 / 空 1 / 開き記号 2 → 本文 3)。
      fenceLine: () => 3,
      onBind: () => {},
      post: (message) => sent.push(message),
    });
    return { session, editor, sent, now: () => now };
  };

  test('マップの HTML を組める', () => {
    // Arrange
    const { session } = open();

    // Act
    const html = panelHtml({
      cspSource: "'self'",
      nonce: 'test',
      scriptUri: 'map.js',
      view: session.view(),
      undo: 'own',
    });

    // Assert
    expect(html).toContain('<svg');
    expect(html).toContain('cf-status');
  });

  test('掴んで動かすと文書が書き換わる', async () => {
    // Arrange
    const { session, now } = open();
    const was = now();

    // Act
    await session.handle({ kind: 'move', part, to });

    // Assert
    expect(now()).toContain(to);
    expect(now()).not.toBe(was);
  });

  /** **開いていない行は 1 字も変えない。** 書き戻す先は文書そのもの。 */
  test('散文の行は動かさない', async () => {
    const { session, now } = open();

    await session.handle({ kind: 'move', part, to });

    const lines = now().split('\n');
    expect(lines[0]).toBe('# 見出し');
    expect(lines.at(-2)).toBe('あとがき。');
    expect(now()).toContain(`\`\`\`${kind}`);
  });

  test('戻すと元の文書に返る', async () => {
    const { session, now } = open();
    const was = now();
    await session.handle({ kind: 'move', part, to });

    await session.handle({ kind: 'undo' });

    expect(now()).toBe(was);
  });
});
