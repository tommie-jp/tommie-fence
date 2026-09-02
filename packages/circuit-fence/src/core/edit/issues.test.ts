import { describe, expect, test } from 'vitest';
import { issuesOf, renderIssues, shiftIssues } from './issues.ts';

const fence = (...lines: readonly string[]): string => lines.join('\n');

describe('issuesOf', () => {
  test('returns nothing for a fence that reads cleanly', () => {
    const source = fence('parts:', '  R1: resistor a1 a3 10k');

    expect(issuesOf(source)).toEqual([]);
  });

  test('reports an unreadable line with its number', () => {
    const source = fence('parts:', '  R1: resistr a1 a3');

    const issues = issuesOf(source);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('error');
    expect(issues[0]?.error.line).toBe(2);
    expect(issues[0]?.error.message).toContain('resistr');
  });

  test('keeps the content of the offending line so the band can show it', () => {
    const source = fence('parts:', '  R1: resistor z0 a3');

    expect(issuesOf(source)[0]?.error.text).toBe('  R1: resistor z0 a3');
  });

  test('reports notices as well, marked apart from errors', () => {
    // `--` で足へ引くと斜めに入る (base は部品と同じ行に乗っている)。
    const source = fence('parts:', '  Q1: npn b2', 'wires:', '  - a1 -- Q1.b');

    expect(issuesOf(source)).toEqual([
      { kind: 'notice', error: expect.objectContaining({ line: 4 }) },
    ]);
  });

  test('silences notices when the fence asked for it, but never errors', () => {
    const source = fence(
      'parts:',
      '  Q1: npn b2',
      '  R1: resistr a1 a3',
      'wires:',
      '  - a1 -- Q1.b',
      'style:',
      '  debug: off',
    );

    expect(issuesOf(source).map((issue) => issue.kind)).toEqual(['error']);
  });

  test('reports the reason when the fence cannot be read at all', () => {
    const issues = issuesOf('parts: [');

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.kind === 'error')).toBe(true);
  });
});

describe('shiftIssues', () => {
  test('moves fence lines onto the Markdown lines they came from', () => {
    const issues = issuesOf(fence('parts:', '  R1: resistr a1 a3'));

    expect(shiftIssues(issues, 10)[0]?.error.line).toBe(12);
  });

  test('moves the related line too, so it points at the Markdown line', () => {
    const issues = issuesOf(fence('parts:', '  R1: resistor a1 a3', '  R2: resistor a1 a3'));

    const shifted = shiftIssues(issues, 10);

    expect(shifted[0]?.error.line).toBe(13);
    expect(shifted[0]?.error.related).toBe(12);
  });

  test('leaves an issue that has no line alone', () => {
    const issues = [{ kind: 'error' as const, error: { message: '読めません', line: null } }];

    expect(shiftIssues(issues, 10)[0]?.error.line).toBeNull();
  });
});

describe('renderIssues', () => {
  test('draws nothing when there is nothing to say', () => {
    expect(renderIssues([])).toBe('');
  });

  test('carries the line as a handle so the row can be clicked', () => {
    const issues = shiftIssues(issuesOf(fence('parts:', '  R1: resistr a1 a3')), 10);

    const html = renderIssues(issues);

    expect(html).toContain('data-line="12"');
    expect(html).toContain('12 行目');
  });

  test('tells errors and notices apart by class', () => {
    const source = fence('parts:', '  Q1: npn b2', '  R1: resistr a1 a3', 'wires:', '  - a1 -- Q1.b');

    const html = renderIssues(issuesOf(source));

    expect(html).toContain('cf-issue cf-error');
    expect(html).toContain('cf-issue cf-notice');
  });

  test('escapes the content of the offending line', () => {
    const issues = [{
      kind: 'error' as const,
      error: { message: '読めません', line: 1, text: '  R1: <script>' },
    }];

    const html = renderIssues(issues);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('marks the offending spelling inside the line', () => {
    const issues = [{
      kind: 'error' as const,
      error: { message: '読めません', line: 1, text: 'R1: resistr a1', column: 5, span: 7 },
    }];

    expect(renderIssues(issues)).toContain('<mark>resistr</mark>');
  });

  test('folds a long list so the band cannot outgrow the map', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      kind: 'error' as const,
      error: { message: `だめ ${index}`, line: index + 1 },
    }));

    const html = renderIssues(many);

    expect(html).toContain('ほかに');
    expect(html.match(/data-line=/g)).toHaveLength(12);
  });

  test('gives a row without a line no handle to click', () => {
    const html = renderIssues([{ kind: 'error' as const, error: { message: '読めません', line: null } }]);

    expect(html).not.toContain('data-line');
    expect(html).toContain('読めません');
  });
});
