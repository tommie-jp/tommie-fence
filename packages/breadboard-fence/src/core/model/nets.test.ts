import { describe, expect, test } from 'vitest';
import { computeNets } from './nets.ts';

describe('computeNets', () => {
  test('merges two strips joined by a wire into one net', () => {
    const nets = computeNets({
      members: [
        { ref: 'R1.1', strip: 'top:5' },
        { ref: 'D1.A', strip: 'top:12' },
      ],
      links: [['top:5', 'top:12']],
    });

    expect(nets).toHaveLength(1);
    expect(nets[0]?.refs).toEqual(['R1.1', 'D1.A']);
  });

  test('keeps strips that no wire joins in separate nets', () => {
    const nets = computeNets({
      members: [
        { ref: 'R1.1', strip: 'top:5' },
        { ref: 'D1.A', strip: 'top:12' },
      ],
      links: [],
    });

    expect(nets).toHaveLength(2);
  });

  test('names a net after the power rail it contains', () => {
    const nets = computeNets({
      members: [{ ref: 'R1.1', strip: 'rail:+t' }],
      links: [],
    });

    expect(nets[0]?.name).toBe('+t');
  });

  test('joins the rail names when a wire bridges two rails', () => {
    const nets = computeNets({
      members: [{ ref: 'AD2.GND', strip: 'rail:-t' }],
      links: [['rail:-t', 'rail:-b']],
    });

    expect(nets[0]?.name).toBe('-t/-b');
  });

  test('numbers anonymous nets in the order their members appear', () => {
    const nets = computeNets({
      members: [
        { ref: 'R1.1', strip: 'top:5' },
        { ref: 'R2.1', strip: 'top:9' },
      ],
      links: [],
    });

    expect(nets.map((net) => net.name)).toEqual(['N1', 'N2']);
  });

  test('keeps a single member net so an unconnected pin stays visible', () => {
    const nets = computeNets({
      members: [{ ref: 'U1.6', strip: 'bottom:8' }],
      links: [],
    });

    expect(nets).toEqual([{ name: 'N1', strips: ['bottom:8'], refs: ['U1.6'] }]);
  });

  test('drops a net that a wire creates but no part pin sits on', () => {
    const nets = computeNets({ members: [], links: [['top:5', 'top:12']] });

    expect(nets).toEqual([]);
  });
});
