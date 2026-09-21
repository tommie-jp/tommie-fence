import { beforeEach, describe, expect, test } from 'vitest';
import { configuration } from '../../test/vscodeStub.ts';
import { mapLook } from './mapLook.ts';

/**
 * 升目の見た目の設定。**名前を `tommieFence.map` に改めた**が、畳む前の
 * `circuitFence.map` を書いた人の設定も効き続ける (命令 id と同じ流儀 —
 * 一度公開した名前は消さない。52 の docs/57)。
 */
describe('升目の見た目の設定 (noteFrame)', () => {
  beforeEach(() => {
    for (const section of Object.keys(configuration)) delete configuration[section];
  });

  test('reads the new name', () => {
    // Arrange
    configuration['tommieFence.map'] = { noteFrame: true };

    // Act / Assert
    expect(mapLook().noteFrame).toBe(true);
  });

  test('falls back to the old name when only the old one is written', () => {
    // Arrange
    configuration['circuitFence.map'] = { noteFrame: true };

    // Act / Assert
    expect(mapLook().noteFrame).toBe(true);
  });

  test('is off when neither name is written', () => {
    expect(mapLook().noteFrame).toBe(false);
  });

  test('lets the new name win, even when it says false', () => {
    // Arrange — 新しい名前で「切る」と書いた人は、古い設定を上書きしたつもりでいる。
    configuration['tommieFence.map'] = { noteFrame: false };
    configuration['circuitFence.map'] = { noteFrame: true };

    // Act / Assert
    expect(mapLook().noteFrame).toBe(false);
  });
});
