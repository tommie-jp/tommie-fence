import { describe, expect, test } from 'vitest';
import {
  PART_ALIASES, PART_TYPES,
  closestPartType, lookupPartType, lookupPin, optionsFor, partTypeNames, pinHint,
  resolvePartTypeName, symbolFor,
} from './parts.ts';

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

describe('PART_ALIASES', () => {
  test('reads an abbreviation as the type it stands for', () => {
    expect(resolvePartTypeName('r')).toBe('resistor');
    expect(resolvePartTypeName('l')).toBe('inductor');
    expect(resolvePartTypeName('gnd')).toBe('ground');
    // 電源は綴りではなく回路図の言葉で略す (直流 / 交流)。
    expect(resolvePartTypeName('dc')).toBe('vsource');
    expect(resolvePartTypeName('ac')).toBe('sine');
  });

  test('lets a full name through unchanged', () => {
    expect(resolvePartTypeName('resistor')).toBe('resistor');
    expect(resolvePartTypeName('thermistor-ntc')).toBe('thermistor-ntc');
  });

  test('points every abbreviation at a type that exists', () => {
    for (const [alias, name] of Object.entries(PART_ALIASES)) {
      expect(lookupPartType(name), alias).not.toBeNull();
    }
  });

  test('never shadows a full name', () => {
    // 同じ綴りが 2 つの意味を持つと、書いたほうも読むほうも当てにできない。
    for (const alias of Object.keys(PART_ALIASES)) {
      expect(partTypeNames()).not.toContain(alias);
    }
  });

  test('keeps the abbreviations out of the list of types', () => {
    // 「使えるのは…」の羅列は種類の数だけでも長い。略記まで並べると読めなくなる。
    expect(partTypeNames()).not.toContain('r');
    expect(partTypeNames()).toContain('resistor');
  });

  test('does not answer for something that is not a type', () => {
    expect(resolvePartTypeName('toString')).toBeNull();
    expect(resolvePartTypeName('__proto__')).toBeNull();
    expect(resolvePartTypeName('relay')).toBeNull();
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
    for (const name of ['resistor-var', 'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc']) {
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
    for (const name of ['ammeter', 'voltmeter', 'ohmmeter', 'wattmeter', 'speaker', 'mic']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('draws every meter as one circle with one letter in it', () => {
    // 回路図の慣習は丸に字だけ。circuitikz の ammeter / voltmeter は指針の矢が
    // 入り、ohmmeter は Ω が**太字の数式**でフォントが無くて落ちる (実測)。
    // 3 つとも矢の無い rmeter に字を渡して、見た目を揃える。
    expect(lookupPartType('ammeter')?.symbol).toBe('rmeter');
    expect(lookupPartType('ammeter')?.options).toEqual(['t={$\\mathrm{A}$}']);
    expect(lookupPartType('voltmeter')?.options).toEqual(['t={$\\mathrm{V}$}']);
    expect(lookupPartType('ohmmeter')?.options).toEqual(['t={$\\Omega$}']);
    expect(lookupPartType('wattmeter')?.options).toEqual(['t={$\\mathrm{W}$}']);
  });

  test('draws the transformer with the core the usual symbol carries', () => {
    // circuitikz の transformer は**空芯**。よく見るのは鉄芯の 2 本が入るほう。
    expect(lookupPartType('transformer')?.symbol).toBe('transformer core');
  });

  test('turns the variable resistor arrow the way it is usually drawn', () => {
    // フェンスの circuitikz 1.0 は矢先を左下に描く。上下を返すと右上を向く。
    // 手元の LaTeX (1.6.6 で確認) は最初から右上なので、そちらには足さない。
    const type = lookupPartType('resistor-var');

    expect(type?.symbol).toBe('vR');
    expect(type?.options).toEqual(['mirror']);
    expect(type?.latexOptions).toEqual([]);
  });

  test('tells the NTC and the PTC thermistor apart with letters', () => {
    // 記号の中の θ は tiny の数式フォントが無くて `#` で出る (実測)。
    // 素のサーミスタの記号にして、区別はラベルの下の行に書く。
    expect(lookupPartType('thermistor-ntc')?.symbol).toBe('thR');
    expect(lookupPartType('thermistor-ntc')?.mark).toBe('NTC');
    expect(lookupPartType('thermistor-ptc')?.mark).toBe('PTC');
    // 素のサーミスタには何も足さない。
    expect(lookupPartType('thermistor')?.mark).toBeUndefined();
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

    expect(symbols).not.toContain('ammeter');
    expect(symbols).not.toContain('voltmeter');
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

describe('ロジックゲート', () => {
  test('carries the two input gates', () => {
    for (const name of ['and', 'or', 'nand', 'nor', 'xor', 'xnor']) {
      const type = lookupPartType(name);

      expect(type?.kind).toBe('multi-terminal');
      expect(lookupPin(type!, '1')).toBe('in 1');
      expect(lookupPin(type!, 'b')).toBe('in 2');
      expect(lookupPin(type!, 'out')).toBe('out');
    }
  });

  test('carries the one input gates', () => {
    for (const name of ['not', 'buffer']) {
      const type = lookupPartType(name);

      expect(lookupPin(type!, 'in')).toBe('in');
      expect(lookupPin(type!, 'out')).toBe('out');
      // 入力が 1 本しかないので、番号では呼ばせない。
      expect(lookupPin(type!, '2')).toBeNull();
    }
  });
});

describe('DIP の IC', () => {
  test('numbers the pins of the package', () => {
    const type = lookupPartType('dip8');

    expect(type?.kind).toBe('multi-terminal');
    expect(lookupPin(type!, '1')).toBe('pin 1');
    expect(lookupPin(type!, '8')).toBe('pin 8');
    expect(lookupPin(type!, '9')).toBeNull();
    expect(type?.options).toEqual(['num pins=8', 'font=\\scriptsize']);
  });

  test('writes the part number inside the box', () => {
    expect(lookupPartType('dip8')?.valueInside).toBe(true);
  });

  test('shows the range instead of every pin number', () => {
    // 40 本を並べると読めない。数字だけの足は範囲でまとめる。
    expect(pinHint(lookupPartType('dip40')!)).toBe('1〜40');
    expect(pinHint(lookupPartType('npn')!)).toBe('b / base / c / collector / e / emitter');
  });
});

describe('そのほかの多端子', () => {
  test('carries the IGBT', () => {
    expect(lookupPin(lookupPartType('nigbt')!, 'g')).toBe('gate');
    expect(lookupPin(lookupPartType('pigbt')!, 'c')).toBe('collector');
    expect(lookupPin(lookupPartType('nigbt')!, 'e')).toBe('emitter');
  });

  test('carries the changeover switch', () => {
    const type = lookupPartType('spdt');

    expect(lookupPin(type!, 'in')).toBe('in');
    expect(lookupPin(type!, '1')).toBe('out 1');
    expect(lookupPin(type!, '2')).toBe('out 2');
  });
});

/**
 * 約束 7 の見張り。フェンス向けと `.tex` 向けの違いは、フェンス側の制約が
 * 強いる分だけにする — それ以外を変えると、プレビューで位置を確かめてから
 * 書き出す使い方が壊れる。
 *
 * 表に 1 行足すだけで的ごとの違いを増やせてしまうので、**違う種類の顔ぶれ
 * そのもの**を押さえる。増やすときはここを直すことになり、そのとき理由を
 * 書き残すことになる。
 */
describe('フェンス向けと .tex 向けの違い', () => {
  const named = partTypeNames();

  test('only the opamp draws a different symbol', () => {
    // フェンスの TeX には op amp の中の小さな ± のフォントが無い (実測)。
    const different = named.filter((name) => symbolFor(name, 'fence') !== symbolFor(name, 'latex'));

    expect(different).toEqual(['opamp']);
  });

  test('only the variable resistor carries different options', () => {
    // circuitikz 1.0 だけ矢先が左下を向く。出る図は同じ形になるので、
    // 「3 つの違い」には数えない (綴りだけが違う)。
    const different = named.filter(
      (name) => optionsFor(name, 'fence').join() !== optionsFor(name, 'latex').join(),
    );

    expect(different).toEqual(['resistor-var']);
  });
});
