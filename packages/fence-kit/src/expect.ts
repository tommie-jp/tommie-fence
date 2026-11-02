/**
 * 想定どおりのお知らせ (`expect:`) と、指摘でない知らせ (情報)。52 の docs/145。
 *
 * お知らせは「図は出るが、そのとおりには動かない・読みにくい」もの。わざと壊した見本や
 * 範囲の外を見せる図では、出るのが正しい。**黙らせると本当に壊れたときにも何も出ない**ので、
 * 書き手が理由を添えて承知し、ログでは `[想定どおり: 理由]` と言い分ける。
 *
 * ```yaml
 * expect:
 *   - match: 胴が重なって
 *     why: ERC の見本としてわざと重ねた
 * ```
 *
 * - `match` はお知らせの文の一部 (部分一致)。1 つの `match` が何行に当たってもよい
 * - **`why` は必須。** 理由の無い承知は黙らせるのと変わらない
 * - 当たらない `expect:` はお知らせで言う (承知だけが古びて残らない)
 * - **エラーには効かない。** 図が出ないものを想定どおりとは言わない
 *
 * YAML の読み手は各フェンスが持つ (fence-kit は依存を持たない) ので、ここでは
 * `sheets:` と同じく一番外側の `expect:` の塊だけを行で読む。
 */

/** 書き手が承知したお知らせ。`line` はフェンスの中の行 (1 始まり)。 */
export type Expectation = { readonly match: string; readonly why: string; readonly line: number };

export type ExpectProblem = { readonly message: string; readonly line: number };

export type ExpectRead = {
  readonly expectations: readonly Expectation[];
  readonly problems: readonly ExpectProblem[];
};

/** 段を持つ報告。各フェンスの `FenceError` がこの形を満たす。 */
export type Said = {
  readonly message: string;
  readonly line: number | null;
  readonly notice?: boolean;
  /** `expect:` で承知したお知らせの理由。 */
  readonly expected?: string;
  /** 指摘ではない知らせ (計算した値など)。`expect:` は当たらない。 */
  readonly info?: boolean;
};

export type ExpectKit<E> = {
  readonly error: (message: string, line: number | null) => E;
  readonly notice: (message: string, line: number | null) => E;
};

export type ExpectLists<E> = {
  readonly errors: readonly E[];
  readonly notices: readonly E[];
  readonly erc?: readonly E[];
};

const TOP_KEY = /^([A-Za-z_][\w-]*):(.*)$/;
const ITEM = /^(\s*)-(?:\s+|$)/;
const FIELD = /^([A-Za-z_][\w-]*):(.*)$/;
const SHAPE = 'expect: は次の行から「- match: お知らせの文の一部」と「why: 理由」の組を並べて書きます';

const isBlank = (line: string): boolean => line.trim() === '' || line.trim().startsWith('#');

/** 行末の注釈を外し、引用符を外す。引用符の中の `#` は字のまま。 */
const valueOf = (text: string): string => {
  const trimmed = text.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const close = trimmed.indexOf(quote, 1);
    if (close > 0) return trimmed.slice(1, close);
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
};

/** 一番外側の `expect:` を読む。書いていなければ空。 */
export function readExpectations(source: string): ExpectRead {
  const lines = source.split('\n');
  const tops = lines.flatMap((line, index) => {
    const match = TOP_KEY.exec(line);
    return match === null ? [] : [{ key: match[1] ?? '', rest: valueOf(match[2] ?? ''), start: index }];
  });
  const expectations: Expectation[] = [];
  const problems: ExpectProblem[] = [];
  tops.forEach((top, at) => {
    if (top.key !== 'expect') return;
    const end = tops[at + 1]?.start ?? lines.length;
    if (top.rest !== '') {
      problems.push({ message: SHAPE, line: top.start + 1 });
      return;
    }
    const starts: number[] = [];
    let indent: number | null = null;
    for (let index = top.start + 1; index < end; index += 1) {
      const line = lines[index] ?? '';
      const item = ITEM.exec(line);
      if (item !== null && (indent === null || (item[1] ?? '').length === indent)) {
        indent ??= (item[1] ?? '').length;
        starts.push(index);
      } else if (starts.length === 0 && !isBlank(line)) {
        problems.push({ message: SHAPE, line: index + 1 });
        return;
      }
    }
    if (starts.length === 0) {
      problems.push({ message: `${SHAPE} (1 つもありません)`, line: top.start + 1 });
      return;
    }
    starts.forEach((from, i) => {
      const read = readItem(lines, from, starts[i + 1] ?? end);
      if ('problem' in read) problems.push(read.problem);
      else expectations.push(read.expectation);
    });
  });
  return { expectations, problems };
}

function readItem(
  lines: readonly string[], from: number, to: number,
): { readonly expectation: Expectation } | { readonly problem: ExpectProblem } {
  const line = from + 1;
  const fields = new Map<string, string>();
  for (let index = from; index < to; index += 1) {
    const raw = lines[index] ?? '';
    const text = (index === from ? raw.replace(ITEM, '') : raw).trim();
    if (isBlank(text)) continue;
    const field = FIELD.exec(text);
    const key = field?.[1] ?? '';
    if (field === null || (key !== 'match' && key !== 'why')) {
      return { problem: { message: `${SHAPE} (書けるのは match と why だけです)`, line: index + 1 } };
    }
    if (fields.has(key)) return { problem: { message: `expect: の 1 項目に ${key}: が 2 つあります`, line: index + 1 } };
    fields.set(key, valueOf(field[2] ?? ''));
  }
  const match = fields.get('match') ?? '';
  const why = fields.get('why') ?? '';
  if (match === '') return { problem: { message: 'expect: の項目に match: がありません (承知するお知らせの文の一部を書きます)', line } };
  if (why === '') {
    return { problem: { message: `expect: の「${match}」に why: がありません (理由の無い承知は黙らせるのと変わりません)`, line } };
  }
  return { expectation: { match, why, line } };
}

/** 想定どおりの印を付ける。ログでは行の頭に理由が出る。 */
export const markExpected = <E extends Said>(said: E, why: string): E =>
  ({ ...said, message: `[想定どおり: ${why}] ${said.message}`, expected: why });

/** 指摘でない知らせの印を付ける (計算した値など)。 */
export const markInfo = <E extends Said>(said: E): E =>
  ({ ...said, message: `[情報] ${said.message}`, info: true });

/**
 * フェンスの `expect:` をお知らせに当てる。`offset` は報告の行がフェンスの行からずれている分
 * (Markdown の行に直した後に当てるとき)。読めない `expect:` はエラー、当たらない `expect:` は
 * お知らせとして足す。
 *
 * `reportStale: false` は、検査の一部を走らせていないとき (circuit は ERC を check でしか
 * 走らせない) に使う。走らせていない検査のお知らせは出ないので、当たらなくても古びたとは言えない。
 */
export function applyExpectations<E extends Said>(
  source: string, lists: ExpectLists<E>, kit: ExpectKit<E>, offset = 0, reportStale = true,
): { readonly errors: E[]; readonly notices: E[]; readonly erc: E[] } {
  const read = readExpectations(source);
  const errors = [...lists.errors, ...read.problems.map((problem) => kit.error(problem.message, problem.line + offset))];
  if (read.expectations.length === 0) return { errors, notices: [...lists.notices], erc: [...(lists.erc ?? [])] };

  const hit = new Set<Expectation>();
  const mark = (said: E): E => {
    if (said.info === true || said.expected !== undefined) return said;
    const found = read.expectations.find((one) => said.message.includes(one.match));
    if (found === undefined) return said;
    hit.add(found);
    return markExpected(said, found.why);
  };
  const notices = lists.notices.map(mark);
  const erc = (lists.erc ?? []).map(mark);
  const stale = (reportStale ? read.expectations : []).filter((one) => !hit.has(one)).map((one) => {
    const onError = lists.errors.some((error) => error.message.includes(one.match));
    return kit.notice(onError
      ? `expect: の「${one.match}」に当たるのはエラーです (expect: はエラーには効きません。図が出ないものは直します)`
      : `expect: の「${one.match}」に当たるお知らせが出ていません (直ったなら消します)`, one.line + offset);
  });
  return { errors, notices: [...notices, ...stale], erc };
}
