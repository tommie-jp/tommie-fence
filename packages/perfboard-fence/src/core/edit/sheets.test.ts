import { describe, expect, test } from 'vitest';
import { applyEdits, applyLineEdits } from 'fence-kit';
import type { EditResult } from 'fence-kit';
import { createPerfboardEditor } from './fenceEditor.ts';

/**
 * `sheets:` の図をマップで 1 枚ずつ掴む (52 の docs/118 の 4.6)。殻からは
 * フェンス全体が来て、書き換えは**元のフェンスの行と桁**で返る。
 */
const BODY = [
  'title: 図01 分圧',     // 1
  'board: 8x5',          // 2
  'sheets:',             // 3
  '  - name: 電源側',     // 4
  '    parts:',          // 5
  '      R1: resistor b2 b6 10k', // 6
  '  - name: 負荷側',     // 7
  '    parts:',          // 8
  '      R2: resistor b2 b6 4k7', // 9
  '',
].join('\n');
const MARKDOWN = `# 題\n\n\`\`\`perf\n${BODY}\`\`\`\n`;
/** 開き記号の行 (Markdown の 3 行目)。 */
const FENCE = 3;

const applied = (source: string, result: EditResult): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyLineEdits(applyEdits(source, result.value.edits ?? []), result.value.lines ?? []);
};

describe('the map on a sheets: figure', () => {
  test('lists one entry per sheet, each titled with its (N枚め)', () => {
    const editor = createPerfboardEditor();
    expect(editor.fences(MARKDOWN)).toEqual([
      { line: FENCE + 4, title: '図01 分圧・電源側 (1枚め)' },
      { line: FENCE + 7, title: '図01 分圧・負荷側 (2枚め)' },
    ]);
  });

  test('shows the sheet whose line was picked, and only that sheet', () => {
    const editor = createPerfboardEditor();
    const block = editor.fenceAt(MARKDOWN, FENCE + 7);
    expect(block?.line).toBe(FENCE);
    const view = editor.view(block!.source, FENCE);
    expect(view.map).toContain('data-part="R2"');
    expect(view.map).not.toContain('data-part="R1"');
  });

  test('moves a part on the second sheet and writes it back at the right line and column', () => {
    const editor = createPerfboardEditor();
    const block = editor.fenceAt(MARKDOWN, FENCE + 8)!;
    const next = applied(block.source, editor.movePart(block.source, 'R2', 'c2'));
    expect(next.split('\n')[8]).toBe('      R2: resistor c2 c6 4k7');
    expect(next.split('\n')[5]).toBe('      R1: resistor b2 b6 10k');
  });

  test('adds a part inside the chosen sheet, indented like the sheet', () => {
    const editor = createPerfboardEditor();
    const block = editor.fenceAt(MARKDOWN, FENCE + 4)!;
    const next = applied(block.source, editor.addPart(block.source, { id: 'R3', type: 'resistor', at: ['d2', 'd6'] }));
    const lines = next.split('\n');
    const at = lines.findIndex((text) => text.includes('R3'));
    expect(at).toBeGreaterThan(5);
    expect(at).toBeLessThan(lines.findIndex((text) => text.includes('負荷側')));
    expect(lines[at]).toMatch(/^ {6}R3: resistor d2 d6/);
  });

  test('points the editor highlight at the line and column in the fence', () => {
    const editor = createPerfboardEditor();
    const block = editor.fenceAt(MARKDOWN, FENCE + 7)!;
    const line = BODY.split('\n')[8] ?? '';
    const spans = editor.spansOf(block.source, 'part', 'R2');
    expect(spans.length).toBeGreaterThan(0);
    // 光らせる先は元のフェンスの 9 行目で、字下げ込みの桁 (`b2` `b6` など書いた綴り)
    for (const span of spans) {
      expect(span.line).toBe(9);
      expect(['R2', 'b2', 'b6', '4k7', 'resistor']).toContain(line.slice(span.column, span.column + span.length));
    }
    expect(editor.aimAt(block.source, 9, line.indexOf('R2'))).toEqual(expect.objectContaining({ id: 'R2' }));
  });

  test('leaves a figure without sheets: as before', () => {
    const editor = createPerfboardEditor();
    const plain = '```perf\nboard: 8x5\nparts:\n  R1: resistor b2 b6\n```\n';
    expect(editor.fences(plain)).toEqual([{ line: 1, title: null }]);
    const block = editor.fenceAt(plain, 2)!;
    expect(applied(block.source, editor.movePart(block.source, 'R1', 'c2'))).toContain('R1: resistor c2 c6');
  });
});
