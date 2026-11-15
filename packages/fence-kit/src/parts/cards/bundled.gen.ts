// 自動で書き出したファイル。手で直さない。
// 元は packages/fence-kit/parts/*.part.yaml、書き出すのは `npm run cards` (52 の docs/158)。
import type { PartCard } from './types.ts';

export const BUNDLED_CARDS: readonly PartCard[] = [
  {
    "kind": "chip",
    "models": [
      "74LS00",
      "SN74LS00",
      "SN74LS00N"
    ],
    "package": "dip14",
    "role": "2 入力 NAND ×4",
    "source": "TI SN74LS00 (SDLS025)、端子図 (N)",
    "note": "TTL。並びは `74HC00` と同じだが、電源は 5 V だけ・静止電流は mA で別の品",
    "pins": [
      "1A",
      "1B",
      "1Y",
      "2A",
      "2B",
      "2Y",
      "GND",
      "3Y",
      "3A",
      "3B",
      "4Y",
      "4A",
      "4B",
      "VCC"
    ]
  }
];
