import { describe, expect, test } from 'vitest';
import { computeNets } from './nets.ts';

const member = (ref: string, strip: string) => ({ ref, strip });

describe('computeNets', () => {
  test('joins the strips a wire connects into one net', () => {
    const nets = computeNets({
      members: [member('R1.1', 'a'), member('R2.1', 'b')],
      links: [['a', 'b']],
    });

    expect(nets).toHaveLength(1);
    expect([...(nets[0]?.refs ?? [])].sort()).toEqual(['R1.1', 'R2.1']);
    expect([...(nets[0]?.strips ?? [])].sort()).toEqual(['a', 'b']);
  });

  test('leaves strips no wire joined as separate nets', () => {
    const nets = computeNets({ members: [member('R1.1', 'a'), member('R2.1', 'b')], links: [] });

    expect(nets).toHaveLength(2);
  });

  test('drops a net no part pin sits on, because that is wire in mid-air', () => {
    const nets = computeNets({ members: [member('R1.1', 'a')], links: [['b', 'c']] });

    expect(nets.map((net) => net.refs)).toEqual([['R1.1']]);
  });

  test('numbers the nets it was given no name for', () => {
    const nets = computeNets({ members: [member('R1.1', 'a'), member('R2.1', 'b')], links: [] });

    expect(nets.map((net) => net.name).sort()).toEqual(['N1', 'N2']);
  });

  test('uses a name that was written for one of the strips', () => {
    const nets = computeNets({
      members: [member('R1.1', 'a'), member('R2.1', 'b')],
      links: [['a', 'b']],
      names: [['b', 'VCC']],
    });

    expect(nets[0]?.name).toBe('VCC');
  });

  test('takes the first written name when two land on the same net', () => {
    const nets = computeNets({
      members: [member('R1.1', 'a')],
      links: [['a', 'b']],
      names: [['a', 'FIRST'], ['b', 'SECOND']],
    });

    expect(nets[0]?.name).toBe('FIRST');
  });

  test('never gives a numbered net a name that was already written', () => {
    // 名前が重なると「図と意図した回路の突き合わせ」がそこで成立しなくなる。
    const nets = computeNets({
      members: [member('R1.1', 'a'), member('R2.1', 'b')],
      links: [],
      names: [['a', 'N1']],
    });

    expect(new Set(nets.map((net) => net.name)).size).toBe(2);
    expect(nets.map((net) => net.name)).toContain('N1');
    expect(nets.map((net) => net.name)).toContain('N2');
  });

  test('lets the board name a net, over any written name', () => {
    // ブレッドボードの電源レールがこれ。板が持っている名前のほうが強い。
    const nets = computeNets({
      members: [member('R1.1', 'a')],
      links: [['a', 'rail:+t']],
      names: [['a', 'WRITTEN']],
      preferredName: (strips) => (strips.includes('rail:+t') ? '+t' : null),
    });

    expect(nets[0]?.name).toBe('+t');
  });

  test('falls back when the board has no name for the net', () => {
    const nets = computeNets({
      members: [member('R1.1', 'a')],
      links: [],
      preferredName: () => null,
    });

    expect(nets[0]?.name).toBe('N1');
  });

  test('returns nothing for nothing', () => {
    expect(computeNets({ members: [], links: [] })).toEqual([]);
  });
});
