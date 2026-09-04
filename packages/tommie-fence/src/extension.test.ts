import { beforeEach, describe, expect, test } from 'vitest';
import MarkdownIt from 'markdown-it';
import { registered } from '../test/vscodeStub.ts';
import { activate } from './extension.ts';

/**
 * 畳んだ入口が**本当に 3 つぶんを登録するか**。型は通っても、命令の綴りや
 * 登録の数は型に出ない (52 の docs/19 — 3 つを 1 つに畳む)。
 */
const context = { subscriptions: [] as { dispose(): void }[], extensionUri: 'file:///x' };

describe('畳んだ拡張の入口', () => {
  beforeEach(() => {
    registered.commands.length = 0;
    registered.editors.length = 0;
  });

  test('registers one custom editor for all three fences', () => {
    activate(context as never);

    expect(registered.editors).toEqual(['tommie-fence.map']);
  });

  test('keeps the old command ids working, so key bindings survive the fold', () => {
    activate(context as never);

    for (const id of [
      'tommie-fence.openMap',
      'circuit-fence.openMap', 'breadboard-fence.openMap', 'perfboard-fence.openMap',
      'circuit-fence.movePart', 'circuit-fence.movePoint',
    ]) {
      expect(registered.commands, id).toContain(id);
    }
  });

  test('renders all three fences through one markdown-it', () => {
    // **プレビューは 1 つの `extendMarkdownIt` で 3 つとも受け持つ** —
    // VS Code は拡張ごとに 1 回しか呼ばない。
    const md = activate(context as never).extendMarkdownIt(new MarkdownIt());
    const out = md.render([
      '```circuit', 'parts:', '  R1: resistor a1 a3 1k', '```', '',
      '```breadboard', 'board: half', 'parts:', '  R1: resistor a5 a10 330', '```', '',
      '```perfboard', 'board: 20x10', 'parts:', '  R1: resistor b3 b6 1k', '```', '',
    ].join('\n'));

    // どれも「コードのまま」ではなく図として組まれている。
    expect(out).not.toContain('<code');
    for (const mark of ['circuit', 'breadboard', 'perfboard']) expect(out, mark).toContain(mark);
  });
});
