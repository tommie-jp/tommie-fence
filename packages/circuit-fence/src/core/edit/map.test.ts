import { describe, expect, test } from 'vitest';
import { aimAt, fenceAt, gridMap, partCells } from './map.ts';
import { lookupPartType, partTypeNames, pinPlaces } from '../parts.ts';
import { renderMapHtml } from './mapSvg.ts';
import { stepCell, stepsTo } from './move.ts';

const RC = [
  'parts:',
  '  IN:  port a1',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  'wires:',
  '  - a3 -- a4',
  '',
].join('\n');

describe('gridMap', () => {
  test('places a chip for every part, at its anchor', () => {
    const map = gridMap(RC);

    expect(map.chips.map((chip) => chip.id)).toEqual(['IN', 'R1', 'C1']);
    expect(map.chips[1]).toMatchObject({ id: 'R1', row: 0, col: 0, type: 'resistor' });
    expect(map.chips[2]).toMatchObject({ id: 'C1', row: 0, col: 2 });
  });

  test('carries the far end of a two-terminal part, so the map can draw its reach', () => {
    const map = gridMap(RC);

    expect(map.chips[1]?.to).toEqual({ row: 0, col: 2 });
    expect(map.chips[0]?.to).toBeNull();
  });

  test('carries the line each part was written on, so a bad line can be pointed at', () => {
    const map = gridMap(RC);

    expect(map.chips.map((chip) => chip.line)).toEqual([2, 3, 4]);
  });

  test('carries the pins of a multi-terminal part, on the sides they leave by', () => {
    const map = gridMap('parts:\n  Q1: npn b2\n');

    expect(map.chips[0]?.pins).toEqual([
      { name: 'B', side: 'left' },
      { name: 'C', side: 'top' },
      { name: 'E', side: 'bottom' },
    ]);
  });

  test('turns the pins with the symbol, so the map shows which way it faces', () => {
    const map = gridMap('parts:\n  Q1: npn b2 r90\n');

    expect(map.chips[0]?.pins).toEqual([
      { name: 'B', side: 'top' },
      { name: 'C', side: 'right' },
      { name: 'E', side: 'left' },
    ]);
  });

  test('names a pin the way the reference does, not by the shortest alias', () => {
    // `not` の足は `a` / `y` とも書けるが、代表の名前は `in` / `out`。
    expect(gridMap('parts:\n  N1: not b2\n').chips[0]?.pins).toEqual([
      { name: 'in', side: 'left' },
      { name: 'out', side: 'right' },
    ]);
  });

  test('gives a DIP every leg, down the left and up the right as the real part is numbered', () => {
    // 中心線には 1 本も乗っていないが、**升目は掴むための道具**なので
    // 出どころで並べる (実機で「すべての部品の足に接続点を」)。
    const pins = gridMap('parts:\n  U1: dip8 b2\n').chips[0]?.pins ?? [];

    expect(pins.map((pin) => pin.name)).toEqual(['1', '2', '3', '4', '8', '7', '6', '5']);
    expect(pins.slice(0, 4).every((pin) => pin.side === 'left')).toBe(true);
    expect(pins.slice(4).every((pin) => pin.side === 'right')).toBe(true);
  });

  test('turns a DIP legs with the part', () => {
    const pins = gridMap('parts:\n  U1: dip8 b2 r90\n').chips[0]?.pins ?? [];

    expect(pins.slice(0, 4).every((pin) => pin.side === 'top')).toBe(true);
    expect(pins.slice(4).every((pin) => pin.side === 'bottom')).toBe(true);
  });

  test('turns a p-type device over, since the figure draws it upside down', () => {
    // 実機で「S に配線したのに図では上の接続点につながっている」。
    // circuitikz は pnp・p チャネルを記号ごと裏返して描くので、
    // コレクタ / ドレインが下、エミッタ / ソースが上に出る (12 種を図で確かめた)。
    const sideOf = (source: string, name: string): string | undefined =>
      gridMap(source).chips[0]?.pins.find((pin) => pin.name === name)?.side;

    expect(sideOf('parts:\n  Q1: npn b2\n', 'C')).toBe('top');
    expect(sideOf('parts:\n  Q1: pnp b2\n', 'C')).toBe('bottom');
    expect(sideOf('parts:\n  Q1: pnp b2\n', 'E')).toBe('top');
    expect(sideOf('parts:\n  J1: njfet b2\n', 'S')).toBe('bottom');
    expect(sideOf('parts:\n  J1: pjfet b2\n', 'S')).toBe('top');
    expect(sideOf('parts:\n  M1: pmos-d b2\n', 'D')).toBe('bottom');
    expect(sideOf('parts:\n  M1: pigbt b2\n', 'E')).toBe('top');
  });

  test('names the legs the way the figure does, not by the first spelling that fits', () => {
    // レギュレータは名前でも番号でも書けるが、**図には IN / GND / OUT と出る**。
    // `mainPinName` は書ける綴りの先頭を返すので、数字めいた鍵が先に並ぶ
    // JS の決まりのせいで升目だけ番号になっていた (実機で気づいた)。
    const names = gridMap('parts:\n  U1: regulator b2\n').chips[0]?.pins.map((pin) => pin.name);

    expect(names).toEqual(['IN', 'GND', 'OUT']);
  });

  test('gives the opamp inputs a place too, though they sit off the centre line', () => {
    // `pinSide` は「まっすぐ引けるか」の表。置き場は別の表 (`pinRow`) で持つ。
    const pins = gridMap('parts:\n  U1: opamp b2\n').chips[0]?.pins ?? [];

    expect(pins.map((pin) => pin.name).sort()).toEqual(['+', '-', 'out']);
  });

  test('leaves no leg without a place — every pin of every part can be clicked', () => {
    // **実機で数えて 15 種が欠けていた** (オペアンプの ±、ゲートの入力、
    // DIP の全部、トランス、spdt)。足を足したときに置き場を書き忘れると、
    // その足だけ升目から配線できなくなるので、ここで数え続ける。
    const missing = partTypeNames().flatMap((name) => {
      const type = lookupPartType(name);
      if (type === undefined || type === null || type.kind !== 'multi-terminal') return [];
      const legs = new Set(Object.values(type.pins ?? {}));
      const placed = new Set(pinPlaces(type).map((place) => place.anchor));
      return [...legs].filter((leg) => !placed.has(leg)).map((leg) => `${name}.${leg}`);
    });

    expect(missing).toEqual([]);
  });

  test('gives a two-terminal part no pins, since its body already spans two cells', () => {
    expect(gridMap('parts:\n  R1: resistor a1 a3\n').chips[0]?.pins).toEqual([]);
  });

  test('carries the turn itself, so a symbol with no pins can still show it', () => {
    expect(gridMap('parts:\n  G1: ground b2 r90\n').chips[0]?.turn).toEqual({ rotate: 90, mirror: false });
  });

  test('sizes the grid to hold every part, with room to move into', () => {
    const map = gridMap(RC);

    expect(map.rows).toBeGreaterThanOrEqual(3);
    expect(map.cols).toBeGreaterThanOrEqual(4);
  });

  test('is empty for a fence it cannot read, rather than guessing', () => {
    expect(gridMap('parts:\n  R1: [unclosed\n').chips).toEqual([]);
  });

  test('shows a part on a half-step address where it is written, not on a neighbouring cell', () => {
    // 交点の間 (`a_1.5`) も**書かれたところ**に出す。升へ寄せると、掴んで
    // 動かしたとき書いた場所と違うところへ行く — 端数のまま置けば嘘がない。
    const map = gridMap('parts:\n  R1: resistor a_1.5 a_3.5 1k\n');

    expect(map.chips).toHaveLength(1);
    expect(map.chips[0]?.col).toBe(0.5);
    expect(map.chips[0]?.to).toEqual({ row: 0, col: 2.5 });
  });

  test('lets an arrow key move a half-step part without losing the half', () => {
    // 端数のまま 1 升ずらす。整数へ丸めると、押した覚えのない場所へ動く。
    expect(stepCell('a_1.5', 0, 1)).toBe('a_2.5');
    expect(stepsTo('a_1.5', 'a3')).toEqual({ rows: 0, cols: 1.5 });
  });

  test('makes room for the cell a half-step part reaches into', () => {
    // 端数は切り上げて数える (`a_9.5` は 10 列目まで要る)。
    const map = gridMap('parts:\n  R1: resistor a_9.5 a_11.5 1k\n');

    expect(map.cols).toBeGreaterThanOrEqual(12);
  });
});

describe('gridMap の配線', () => {
  const linesOf = (source: string) => gridMap(source).wires;

  test('draws a straight wire between the crossings it joins', () => {
    expect(linesOf('wires:\n  - a1 -- a3\n')).toEqual([
      {
        points: [{ row: 0, col: 0 }, { row: 0, col: 2 }],
        approximate: false, line: 2, fromPin: null, toPin: null,
      },
    ]);
  });

  test('carries a bent wire as one line through its corner', () => {
    // `-|` は先に横。角は from の行・to の列。**1 本で持つ** ので、
    // 描く側が角を両端に合わせられる (足へずらした端でも直角のまま)。
    expect(linesOf('wires:\n  - a1 -| c3\n')).toEqual([
      {
        points: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 2, col: 2 }],
        approximate: false, line: 2, fromPin: null, toPin: null,
      },
    ]);
  });

  test('remembers which leg a wire ends on, so the line can reach the point', () => {
    // 実機で「接続点から配線するように表示すること」。升の真ん中で止めると、
    // 押した丸と線の先が食い違って見える。
    const lines = linesOf('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a5\n');

    expect(lines[0]?.fromPin).toEqual({ part: 'Q1', name: 'C' });
    expect(lines[0]?.toPin).toBeNull();
  });

  test('keeps the corner of a folded wire that ends on a leg', () => {
    // 実機で「pico のピンから出た配線が -| で曲がらない」。角が端と同じ升に
    // 来ると `cornerOf` は「曲がっていない」と答えるが、足は升の上に無いので
    // 図の上では曲がる。
    const lines = linesOf('parts:\n  U1: pico f6\nwires:\n  - U1.GND8 -| f3\n');

    expect(lines[0]?.points).toHaveLength(3);
  });

  test('leaves a wire between two crossings alone, where the addresses decide', () => {
    // 番地どうしなら `cornerOf` の答えが正しい (端に乗る角は角ではない)。
    expect(linesOf('wires:\n  - a1 -| a3\n')[0]?.points).toHaveLength(2);
  });

  test('draws each leg of a chained wire', () => {
    expect(linesOf('wires:\n  - a1 -- a3 -- c3\n')).toHaveLength(2);
  });

  test('keeps a half-step endpoint where it was written', () => {
    expect(linesOf('wires:\n  - a_1.5 -- a3\n')[0]?.points[0]).toEqual({ row: 0, col: 0.5 });
  });

  test('approximates a pin end at the part, since only TeX knows where the leg is', () => {
    const lines = linesOf('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a4\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.points[0]).toEqual({ row: 1, col: 1 });
    expect(lines[0]?.approximate).toBe(true);
  });

  test('leaves out a wire to a part that is not there', () => {
    // 書き間違いはエラーの帯の仕事。ここで当てずっぽうの線を引かない。
    expect(linesOf('wires:\n  - Q9.C -- a4\n')).toEqual([]);
  });

  test('has no wires at all when the fence cannot be read', () => {
    expect(linesOf('parts: [')).toEqual([]);
  });

  test('sizes the grid to hold a wire that reaches past every part', () => {
    const map = gridMap('parts:\n  R1: resistor a1 b1\nwires:\n  - b1 -- b9\n');

    expect(map.cols).toBeGreaterThan(8);
  });
});

describe('renderMapHtml', () => {
  const html = renderMapHtml(gridMap(RC));

  test('draws a cell for every crossing, addressed', () => {
    expect(html).toContain('data-address="a1"');
    expect(html).toContain('data-address="c4"');
  });

  test('draws a chip for every part, named', () => {
    expect(html).toContain('data-part="R1"');
    expect(html).toContain('>R1</');
  });

  test('escapes what came from the fence', () => {
    const map = gridMap('parts:\n  R1: resistor a1 a3 "<img src=x>"\n');

    expect(renderMapHtml(map)).not.toContain('<img');
  });

  test('says so when there is nothing to show', () => {
    expect(renderMapHtml(gridMap('parts:\n  R1: [unclosed\n'))).toContain('読めません');
  });
});

describe('fenceAt', () => {
  const markdown = [
    '# 見出し',            // 1
    '',                    // 2
    '```circuit',          // 3
    'parts:',              // 4
    '  R1: resistor a1 a3',// 5
    '```',                 // 6
    '',                    // 7
    '```circuit',          // 8
    'parts:',              // 9
    '  C1: capacitor a1 a3',
    '```',
    '',
  ].join('\n');

  test('finds the fence the cursor is inside', () => {
    expect(fenceAt(markdown, 5)?.line).toBe(3);
    expect(fenceAt(markdown, 10)?.line).toBe(8);
  });

  test('counts the opening line as inside, so the cursor can rest on it', () => {
    expect(fenceAt(markdown, 3)?.line).toBe(3);
  });

  test('finds nothing outside a fence', () => {
    expect(fenceAt(markdown, 1)).toBeNull();
    expect(fenceAt(markdown, 7)).toBeNull();
  });

  test('gives back the body, so the caller can compile it', () => {
    expect(fenceAt(markdown, 5)?.source).toContain('R1: resistor a1 a3');
  });
});

describe('同じ交点に 2 つ', () => {
  const source = ['parts:', '  IN: port a1', '  R1: resistor a1 a3', ''].join('\n');

  test('keeps both chips, so neither disappears from the map', () => {
    // 同じ番地に 2 部品は**この文法では接続**。片方を隠すと、掴んで
    // 出すこともできなくなる。
    const html = renderMapHtml(gridMap(source));

    expect(html).toContain('data-part="IN"');
    expect(html).toContain('data-part="R1"');
  });
});

describe('節点の点', () => {
  const source = 'points:\n  fb: c3\nparts:\n  R1: resistor a1 b1\n  R2: resistor fb d3\n';

  test('marks every crossing something is written at', () => {
    const dots = gridMap(source).dots.map((dot) => `${dot.row},${dot.col}`);

    expect(dots).toContain('0,0');
    expect(dots).toContain('2,2');
  });

  test('carries the name, so the map can show what a one-line move would touch', () => {
    const fb = gridMap(source).dots.find((dot) => dot.row === 2 && dot.col === 2);

    expect(fb?.name).toBe('fb');
    expect(fb?.uses).toBe(1);
  });

  test('leaves the dot under the chip, so a node on a part is still grabbable', () => {
    const html = renderMapHtml(gridMap(source));

    // 同じ升にチップと点の両方が出る。隠すと名前の付いた節点だけ掴めなくなる。
    expect(html).toContain('cf-dot');
    expect(html).toContain('data-node="c3"');
    expect(html).toContain('cf-chip');
  });

  test('has no dots at all when the fence cannot be read', () => {
    expect(gridMap('parts: [').dots).toEqual([]);
  });

  test('covers a crossing only a wire reaches, so its dot is on the map', () => {
    // 部品は a1〜b1 に収まるが、配線が j9 まで届く。升目が部品だけを見て
    // 決まると、j9 の点が升の外に落ちて掴めなくなる。
    const map = gridMap('parts:\n  R1: resistor a1 b1\nwires:\n  - b1 -- j9\n');

    expect(map.rows).toBeGreaterThan(9);
    expect(map.cols).toBeGreaterThan(8);
    expect(renderMapHtml(map)).toContain('data-node="j9"');
  });
});

describe('同じ名前の記号', () => {
  const TWO_RAILS = 'parts:\n  VCC: vcc a1\n  VCC: vcc e1\n  R1: resistor a1 a3\n';

  test('gives each chip a handle of its own, while showing the same name', () => {
    const map = gridMap(TWO_RAILS);
    const rails = map.chips.filter((chip) => chip.type === 'vcc');

    expect(rails.map((chip) => chip.id)).toEqual(['VCC', 'VCC']);
    expect(rails.map((chip) => chip.handle)).toEqual(['VCC', 'VCC#2']);
  });

  test('hands back the handle of the one the cursor is on, not the first of that name', () => {
    // 3 行目は 2 つ目の VCC。名前で照らすと 1 つ目を拾ってしまう。
    expect(aimAt(TWO_RAILS, 3, 3)).toEqual({ kind: 'part', id: 'VCC#2' });
    expect(aimAt(TWO_RAILS, 2, 3)).toEqual({ kind: 'part', id: 'VCC' });
  });
});

describe('partCells', () => {
  test('lists the crossings a part is written on, in the order they are written', () => {
    const rc = 'parts:\n  R1: resistor a1 a3 10k\n  G1: ground c5\n';

    expect(partCells(rc, 'R1')).toEqual(['a1', 'a3']);
    expect(partCells(rc, 'G1')).toEqual(['c5']);
  });

  test('reads a part the grid map leaves out, since a ghost must light where it lands', () => {
    // 交点の間の番地は升目に載らない (掴めない) が、**置いた先としては正しい**。
    expect(partCells('parts:\n  R1: resistor a_1.5 a3\n', 'R1')).toEqual(['a_1.5', 'a3']);
  });

  test('tells the repeated names apart by their handle', () => {
    const twice = 'parts:\n  VCC: vcc a1\n  VCC: vcc b1\n';

    expect(partCells(twice, 'VCC')).toEqual(['a1']);
    expect(partCells(twice, 'VCC#2')).toEqual(['b1']);
  });

  test('is empty for a part that is not there', () => {
    expect(partCells('parts:\n  R1: resistor a1 a3\n', 'R9')).toEqual([]);
  });
});
