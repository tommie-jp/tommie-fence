import { COLOR_LIST_ID, TYPE_LIST_ID, panelHtml } from 'fence-kit';
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
  const open = () => {
    let now = body;
    const sent: Outgoing[] = [];
    const editor = make();
    const session = createMapSession({
      kind,
      editor,
      body: () => now,
      setBody: (next) => {
        now = next;
      },
      post: (message) => sent.push(message),
    });
    return { session, editor, sent, now: () => now };
  };

  test('マップの HTML を組める', () => {
    // Arrange
    const { session, editor } = open();

    // Act
    const html = panelHtml({
      cspSource: "'self'",
      nonce: 'test',
      scriptUri: 'map.js',
      view: session.view(),
      chrome: {
      palette: editor.palette(),
      typeNames: editor.typeNames(TYPE_LIST_ID),
      colorNames: editor.colorNames(COLOR_LIST_ID),
    },
      undo: 'own',
      foldsWire: editor.foldsWire,
    });

    // Assert
    expect(html).toContain('<svg');
    expect(html).toContain('cf-status');
  });

  test('掴んで動かすと本文が書き換わる', async () => {
    // Arrange
    const { session, now } = open();

    // Act
    await session.handle({ kind: 'move', part, to });

    // Assert
    expect(now()).toContain(to);
    expect(now()).not.toBe(body);
  });

  test('戻すと元の本文に返る', async () => {
    const { session, now } = open();
    await session.handle({ kind: 'move', part, to });

    await session.handle({ kind: 'undo' });

    expect(now()).toBe(body);
  });
});
