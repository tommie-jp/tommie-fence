import { fail, ok, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import type { Address, Board, FenceError, HoleRow, PartSpec, PlacedPart, PlacedPin, Result } from '../types.ts';
import { knownPartTypes, lookupFootprint } from './footprints.ts';

export type PlaceResult = { readonly parts: readonly PlacedPart[]; readonly errors: readonly FenceError[] };

/**
 * 部品を穴に落とし込む。1 つ失敗しても残りは描けるように、
 * 失敗した部品だけを捨てて errors に積む。
 */
export function placeParts(specs: readonly PartSpec[], board: Board): PlaceResult {
  const parts: PlacedPart[] = [];
  const errors: FenceError[] = [];
  const owners = new Map<string, string>();

  for (const spec of specs) {
    const placed = placePart(spec, board);
    if (!placed.ok) {
      errors.push(placed.error);
      continue;
    }

    const conflict = findConflict(placed.value, owners);
    if (conflict) {
      errors.push(conflict);
      continue;
    }

    for (const pin of placed.value.pins) {
      if (pin.address) owners.set(formatAddress(pin.address), placed.value.id);
    }
    parts.push(placed.value);
  }

  return { parts, errors };
}

function findConflict(part: PlacedPart, owners: Map<string, string>): FenceError | null {
  const own = new Set<string>();

  for (const pin of part.pins) {
    if (!pin.address) continue;
    const address = formatAddress(pin.address);

    const owner = owners.get(address);
    if (owner) return { message: `${address} は部品 ${safeToken(owner)} が使っています`, line: part.line };
    // 同じ部品の 2 本の足が同じ穴に入る = 部品を短絡させている。
    if (own.has(address)) {
      return { message: `部品 ${safeToken(part.id)} の足が 2 本とも ${address} に入っています`, line: part.line };
    }
    own.add(address);
  }

  return null;
}

function placePart(spec: PartSpec, board: Board): Result<PlacedPart> {
  const footprint = lookupFootprint(spec.type);
  if (!footprint) {
    return fail(
      `知らない部品の種類です: ${safeToken(spec.type)} (使えるのは ${knownPartTypes().join(', ')})`,
      spec.line,
    );
  }

  const base = {
    id: spec.id,
    type: spec.type,
    value: spec.value,
    label: spec.label,
    at: spec.at,
    line: spec.line,
  };

  if (footprint.kind === 'device') {
    if (!spec.pins || spec.pins.length === 0) {
      return fail(`部品 ${safeToken(spec.id)}: ボード外の機器には pins (ピン名の配列) が要ります`, spec.line);
    }
    return ok({
      ...base,
      kind: 'device',
      at: spec.at ?? 'top',
      pins: spec.pins.map((name) => ({ name, address: null })),
    });
  }

  if (footprint.kind === 'two-lead' || footprint.kind === 'three-lead') {
    const legs = footprint.kind === 'two-lead' ? 2 : 3;
    if (spec.holes.length !== legs) {
      return fail(
        `部品 ${safeToken(spec.id)}: 穴番地を ${legs} つ書きます (今は ${spec.holes.length} つ)`,
        spec.line,
      );
    }
    const pins: PlacedPin[] = [];
    for (const hole of spec.holes) {
      const address = resolveHole(hole.addr, board, spec.line);
      if (!address.ok) return address;
      // 同じ名前が 2 本あると `D1.A` がどちらを指すか決まらない。
      if (pins.some((pin) => pin.name === hole.tag)) {
        return fail(`部品 ${safeToken(spec.id)}: ピン名 ${safeToken(hole.tag)} が 2 回出てきます`, spec.line);
      }
      pins.push({ name: hole.tag, address: address.value });
    }
    return ok({ ...base, kind: footprint.kind, pins });
  }

  return placeDip(spec, board, footprint.pins, base);
}

function placeDip(
  spec: PartSpec,
  board: Board,
  pinCount: number,
  base: Omit<PlacedPart, 'kind' | 'pins'>,
): Result<PlacedPart> {
  const anchorRef = spec.holes[0];
  if (spec.holes.length !== 1 || !anchorRef) {
    return fail(`部品 ${safeToken(spec.id)}: dip はピン 1 の穴だけを書きます (例: dip8 @ e5)`, spec.line);
  }

  const anchor = resolveHole(anchorRef.addr, board, spec.line);
  if (!anchor.ok) return anchor;
  if (anchor.value.kind !== 'hole' || (anchor.value.row !== 'e' && anchor.value.row !== 'f')) {
    return fail(`部品 ${safeToken(spec.id)}: dip は溝をまたぐので e 行か f 行に置きます`, spec.line);
  }

  const half = pinCount / 2;
  const lastCol = anchor.value.col + half - 1;
  if (lastCol > board.columns) {
    return fail(`部品 ${safeToken(spec.id)}: ボードの右端 (${board.columns} 列) をはみ出します`, spec.line);
  }

  const anchorRow: HoleRow = anchor.value.row;
  const oppositeRow: HoleRow = anchorRow === 'e' ? 'f' : 'e';
  const pins: PlacedPin[] = Array.from({ length: pinCount }, (_, index) => {
    const pin = index + 1;
    const onAnchorRow = pin <= half;
    return {
      name: String(pin),
      address: {
        kind: 'hole',
        row: onAnchorRow ? anchorRow : oppositeRow,
        col: onAnchorRow ? anchor.value.col + pin - 1 : anchor.value.col + (pinCount - pin),
      } satisfies Address,
    };
  });

  return ok({ ...base, kind: 'dip', pins });
}

function resolveHole(text: string, board: Board, line: number): Result<Address> {
  const address = parseAddress(text);
  if (!address) return fail(`穴番地として読めません: ${safeToken(text)} (a5 や +t5 のように書きます)`, line);
  if (!isOnBoard(board, address)) {
    return fail(`${formatAddress(address)} はボードの外です (1〜${board.columns} 列)`, line);
  }
  return ok(address);
}
