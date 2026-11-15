import { describe, expect, test } from 'vitest';
import { FIXTURE_CARDS } from 'fence-kit';
import { stringify } from 'yaml';
import { previewFences } from './fences.ts';
import { checkCardText } from './run.ts';

/** `part-card check` (52 の docs/158 の 2-5)。 */

const textOf = (index: number): string => stringify(FIXTURE_CARDS[index]);

describe('checkCardText', () => {
  test.each([0, 1, 2, 3, 4])('reads fixture card %i and draws it with nothing said', (index) => {
    const checked = checkCardText(textOf(index), `card${index}.part.yaml`);
    expect(checked.lines).toEqual([]);
    expect(checked.figures.length).toBeGreaterThan(0);
    for (const figure of checked.figures) expect(figure.svg ?? figure.tex).not.toBeNull();
  });

  test('draws the board only where boards exist', () => {
    expect(checkCardText(textOf(4), 'b.part.yaml').figures.map((figure) => figure.fence)).toEqual(['breadboard', 'perfboard']);
  });

  test('passes on what the fence says about an unknown look', () => {
    const text = textOf(1).replace('transistor/to92', 'transistor/to999');
    const checked = checkCardText(text, 'q.part.yaml');
    expect(checked.lines.some((line) => line.severity === 'error' && line.text.includes('breadboard の図'))).toBe(true);
  });

  test('gives the line of a broken card and draws nothing', () => {
    const checked = checkCardText('models: [XB]\npackage: dip8\npins: [A]\nrole: r\nsource: s\n', 'x.part.yaml');
    expect(checked.figures).toEqual([]);
    expect(checked.lines[0]?.text).toBe('x.part.yaml:3: 誤り: ピンの数が合いません (package: は 8 本、pins: は 1 本)');
  });

  test('says when a model is already bundled', () => {
    const checked = checkCardText(textOf(0).replace('XY1234', 'NE555'), 'n.part.yaml');
    expect(checked.lines.map((line) => line.text).join('\n')).toContain('同梱の表にあります');
  });
});

describe('previewFences', () => {
  test('adds the ic box to the schematic when the card has ic:', () => {
    const fences = previewFences(checkCardText(textOf(0), 'c.part.yaml').card!);
    expect(fences.find((fence) => fence.fence === 'circuit')?.source).toContain('U2: ic 9,3 XY1234');
  });
});
