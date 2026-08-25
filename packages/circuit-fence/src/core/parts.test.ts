import { describe, expect, test } from 'vitest';
import { PART_TYPES, closestPartType, lookupPartType, lookupPin, partTypeNames } from './parts.ts';

describe('PART_TYPES', () => {
  test('carries the two terminal parts a schematic is drawn with', () => {
    for (const name of ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'zener']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('draws the electrolytic capacitor with the curved plate symbol', () => {
    // eC はフォントが無くてプロセスごと落ちる。曲板の cC は実機で通る (実測)。
    expect(lookupPartType('ecap')?.kind).toBe('two-terminal');
    expect(lookupPartType('ecap')?.symbol).toBe('cC');
    expect(lookupPartType('ecap')?.unitTex).toBe('\\mathrm{F}');
  });

  test('carries the sources and the parts that break a circuit', () => {
    for (const name of ['vsource', 'sine', 'isource', 'battery', 'switch', 'fuse', 'lamp']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('keeps the one terminal symbols', () => {
    expect(lookupPartType('port')?.kind).toBe('one-terminal');
    expect(lookupPartType('ground')?.kind).toBe('one-terminal');
  });

  test('gives a unit only where the value has one', () => {
    expect(lookupPartType('resistor')?.unitTex).toBe('\\Omega');
    expect(lookupPartType('inductor')?.unitTex).toBe('\\mathrm{H}');
    expect(lookupPartType('vsource')?.unitTex).toBe('\\mathrm{V}');
    expect(lookupPartType('isource')?.unitTex).toBe('\\mathrm{A}');
    // ダイオードの値は型番なので単位を足さない。
    expect(lookupPartType('diode')?.unitTex).toBeNull();
    expect(lookupPartType('switch')?.unitTex).toBeNull();
  });

  test('never uses a symbol the fence TeX cannot draw', () => {
    // eC はフォントが無く、例外ではなくプロセスごと落ちる (実機で確認)。
    const symbols = Object.values(PART_TYPES).map((type) => type.symbol);

    expect(symbols).not.toContain('eC');
    expect(symbols.some((symbol) => symbol.includes('op amp'))).toBe(false);
  });

  test('lists every type it knows', () => {
    expect(partTypeNames()).toContain('resistor');
    expect(partTypeNames().length).toBeGreaterThan(10);
  });

  test('does not answer for something that is not a type', () => {
    expect(lookupPartType('toString')).toBeNull();
    expect(lookupPartType('__proto__')).toBeNull();
  });
});

describe('closestPartType', () => {
  test('finds the type behind a typo', () => {
    expect(closestPartType('resistr')).toBe('resistor');
    expect(closestPartType('capasitor')).toBe('capacitor');
    expect(closestPartType('LED')).toBe('led');
  });

  test('finds the type behind a name that was cut short', () => {
    expect(closestPartType('induct')).toBe('inductor');
  });

  test('says nothing when there is nothing close', () => {
    // リレーは (まだ) 無い種類。近いものが無ければ黙る。
    expect(closestPartType('relay')).toBeNull();
    expect(closestPartType('')).toBeNull();
  });

  test('does not guess wildly at a short name', () => {
    // 2 文字違えば別物。`coil` に `led` を勧めない。
    expect(closestPartType('coil')).toBeNull();
  });
});

describe('FET', () => {
  /** 接合型・エンハンスメント型・デプレッション型。どれも足の名前は同じ。 */
  const FETS = ['njfet', 'pjfet', 'nmos-e', 'pmos-e', 'nmos-d', 'pmos-d'];

  test('carries the junction and the insulated gate FETs', () => {
    for (const name of FETS) {
      expect(lookupPartType(name)?.kind).toBe('multi-terminal');
    }
  });

  test('names the legs of every FET the same way', () => {
    for (const name of [...FETS, 'nmos', 'pmos']) {
      const type = lookupPartType(name);
      expect(type).not.toBeNull();
      expect(lookupPin(type!, 'g')).toBe('gate');
      expect(lookupPin(type!, 'drain')).toBe('drain');
      expect(lookupPin(type!, 'S')).toBe('source');
    }
  });

  test('spells the written name out into the circuitikz symbol', () => {
    // 書くほうは回路図の言葉、描くほうは circuitikz の綴り (igfet)。
    expect(lookupPartType('njfet')?.symbol).toBe('njfet');
    expect(lookupPartType('nmos-e')?.symbol).toBe('nigfete');
    expect(lookupPartType('pmos-e')?.symbol).toBe('pigfete');
    expect(lookupPartType('nmos-d')?.symbol).toBe('nigfetd');
    expect(lookupPartType('pmos-d')?.symbol).toBe('pigfetd');
  });

  test('leaves the simplified MOSFET where it was', () => {
    // 既存の図が動かないように、簡易記号は nmos / pmos のまま。
    expect(lookupPartType('nmos')?.symbol).toBe('nmos');
    expect(lookupPartType('pmos')?.symbol).toBe('pmos');
  });

  test('suggests the FET behind a name that was cut short', () => {
    expect(closestPartType('njf')).toBe('njfet');
  });
});

describe('記事によく出る部品', () => {
  test('carries the diodes a hobby article draws', () => {
    for (const name of ['schottky', 'photodiode', 'varicap', 'diac']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('carries the resistors that sense something', () => {
    for (const name of ['resistor-var', 'photoresistor', 'thermistor']) {
      // 抵抗の仲間なので、値には Ω が付く。
      expect(lookupPartType(name)?.unitTex).toBe('\\Omega');
    }
    // バリスタの値は型番か動作電圧なので、単位を足さない。
    expect(lookupPartType('varistor')?.unitTex).toBeNull();
  });

  test('carries the switches a panel has', () => {
    for (const name of ['button', 'button-nc', 'switch-nc', 'reed']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
      expect(lookupPartType(name)?.unitTex).toBeNull();
    }
  });

  test('gives the crystal its own unit', () => {
    // 水晶の値は周波数。`X1: crystal a1 a3 16M` が 16 MHz になる。
    expect(lookupPartType('crystal')?.unitTex).toBe('\\mathrm{Hz}');
    expect(lookupPartType('crystal')?.unitSi).toBe('\\hertz');
  });

  test('carries the sources by the shape of their wave', () => {
    for (const name of ['square', 'triangle', 'solar']) {
      expect(lookupPartType(name)?.unitTex).toBe('\\mathrm{V}');
    }
  });

  test('carries the meters and the parts that make a sound', () => {
    for (const name of ['ammeter', 'voltmeter', 'speaker', 'mic']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('keeps the power rails as one terminal symbols', () => {
    expect(lookupPartType('vcc')?.kind).toBe('one-terminal');
    expect(lookupPartType('vee')?.kind).toBe('one-terminal');
    // 名前は記号の中に書く (端子は白丸の横、グラウンドは名前を出さない)。
    expect(lookupPartType('vcc')?.idLabel).toBe('inside');
    expect(lookupPartType('port')?.idLabel).toBe('beside');
    expect(lookupPartType('ground')?.idLabel).toBeUndefined();
  });

  test('never uses a symbol whose glyphs the fence TeX cannot draw', () => {
    // 抵抗計は Ω の字形が要り、eC と同じく**プロセスごと落ちる**。
    // NTC / PTC サーミスタは落ちないが、中の θ が `#` で出る (どちらも実測)。
    const symbols = Object.values(PART_TYPES).map((type) => type.symbol);

    expect(symbols).not.toContain('ohmmeter');
    expect(symbols).not.toContain('thRn');
    expect(symbols).not.toContain('thRp');
  });
});

describe('足のある 2 端子部品', () => {
  test('carries the potentiometer with its wiper', () => {
    const type = lookupPartType('potentiometer');

    expect(type?.kind).toBe('two-terminal');
    expect(lookupPin(type!, 'w')).toBe('wiper');
    expect(lookupPin(type!, 'WIPER')).toBe('wiper');
    // 抵抗の仲間なので値には Ω が付く。
    expect(type?.unitTex).toBe('\\Omega');
  });

  test('carries the thyristor and the triac with their gate', () => {
    for (const name of ['thyristor', 'triac']) {
      const type = lookupPartType(name);

      expect(type?.kind).toBe('two-terminal');
      expect(lookupPin(type!, 'g')).toBe('gate');
      expect(lookupPin(type!, 'gate')).toBe('gate');
    }
  });

  test('gives no leg to a part that has none', () => {
    expect(lookupPin(lookupPartType('resistor')!, 'w')).toBeNull();
  });
});
