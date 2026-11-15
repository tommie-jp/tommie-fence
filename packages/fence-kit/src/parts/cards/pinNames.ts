import type { CardIssue } from './types.ts';

/**
 * ピンの名前の決まり (`pinouts.ts` の頭のコメント) のうち、**機械で見られる分**。
 * 並びが正しいかは見られない — それは焼いた図とデータシートの端子図を人が見比べる。
 */

/** 書ける字。印字の `QH'` `CS/SHDN` `IN+` `3V3_EN` を通し、空白・`,`・en dash を断る。 */
const TYPEABLE = /^[A-Za-z0-9_+\-/.'#*~]+$/;

/** 何本にあってもよい名前 (どこにも結ばない・同じ電源や GND)。 */
const SHARED = /^(NC|N\.C\.|GND|GROUND|VSS|VCC|VDD|VEE|V\+|V-)$/i;

const issue = (index: number, message: string, severity: CardIssue['severity'] = 'error'): CardIssue => (
  { path: ['pins', index], message, severity }
);

function nameProblem(name: string): string | null {
  if (name === '') return 'ピンの名前が空です';
  if (/[‐-―−]/.test(name)) return `ピンの名前 ${name} に – (en dash など) があります。ASCII の - で書きます (IN-)`;
  if (/\s/.test(name)) return `ピンの名前 ${name} に空白があります。略して詰めます (CARRY OUT → CO)`;
  if (name.includes(',')) return `ピンの名前 ${name} に , があります。落とします (1,2EN → 12EN)`;
  if (/^\d+$/.test(name)) return `ピンの名前 ${name} が数字だけです。ピンの番号と取り違えるので字を前に付けます (0 → Q0)`;
  if (!TYPEABLE.test(name)) return `ピンの名前 ${name} にキーボードで打てない字があります (書けるのは英数字と _ + - / . ' # * ~)`;
  return null;
}

/** `pins:` の名前を決まりで検める。 */
export function checkPinNames(names: readonly string[]): readonly CardIssue[] {
  const issues: CardIssue[] = [];
  names.forEach((name, index) => {
    const problem = nameProblem(name);
    if (problem !== null) issues.push(issue(index, problem));
  });

  // 大文字と小文字だけが違う 2 本は、回路図が同じピンに読む (ピンの名前を大文字小文字を問わず引く)。
  const seen = new Map<string, { readonly name: string; readonly index: number }>();
  names.forEach((name, index) => {
    const key = name.toUpperCase();
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, { name, index });
      return;
    }
    if (first.name !== name) {
      issues.push(issue(index, `ピンの名前 ${first.name} (${first.index + 1} 番) と ${name} (${index + 1} 番) は大文字と小文字だけが違います。回路図は同じピンに読むので、両方を変えます (A と a → INA と Oa)`));
    } else if (!SHARED.test(name)) {
      issues.push(issue(index, `ピンの名前 ${name} が ${first.index + 1} 番と ${index + 1} 番にあります。名前では指せません。2 本を別々に結ぶなら番号を後ろに付けます (GAIN → GAIN1 GAIN8)`, 'notice'));
    }
  });
  return issues;
}
