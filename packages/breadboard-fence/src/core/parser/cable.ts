import { readUsbCable } from 'fence-kit';
import { safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import type { CableSpec } from '../types.ts';

export { USB_CABLE_TYPE as CABLE_TYPE } from 'fence-kit';

export type CableValidation =
  | { readonly ok: true; readonly value: CableSpec }
  | { readonly ok: false; readonly message: string; readonly token?: string };

/** USB ケーブル (`type: usb-cable`、52 の docs/157)。決まりは fence-kit の `readUsbCable` (perf と同じ)。 */
export function validateCable(id: string, raw: Record<string, unknown>, line: number): CableValidation {
  const read = readUsbCable(raw, safeToken);
  if (!read.ok) return read;
  const label = read.label === null ? null : clampText(read.label, LIMITS.labelLength);
  return { ok: true, value: { id, partId: read.partId, far: read.far, label, line } };
}
