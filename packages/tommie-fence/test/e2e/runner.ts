/**
 * **本物の VS Code の中で回す試験の runner。** mocha を入れない — 見るのは数本で、
 * web 版 (ブラウザの拡張ホスト) でも同じものが動く形にしたいので、Node にしか
 * 無いもの (`node:assert` など) も使わない。
 *
 * 1 本ずつ順に回し (VS Code の窓は 1 つなので、並べると取り合う)、落ちたものを
 * 全部集めてから投げる。投げると `@vscode/test-electron` / `@vscode/test-web` が
 * 0 以外で終わる。
 */
export type Case = {
  readonly name: string;
  readonly run: () => Promise<void>;
};

/** 1 本の持ち時間。VS Code を立てた直後は拡張の起き上がりを待つので長め。 */
const CASE_TIMEOUT_MS = 30_000;

/** 条件が満たされるまで待つ。満たされなければ `message` で投げる。 */
export async function until(check: () => boolean | Promise<boolean>, message: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`待っても満たされません: ${message}`);
}

/** 満たされなければ投げる。 */
export function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const withTimeout = (work: Promise<void>, name: string): Promise<void> =>
  Promise.race([
    work,
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${name}: ${CASE_TIMEOUT_MS} ms で終わりません`)), CASE_TIMEOUT_MS);
    }),
  ]);

export async function runCases(cases: readonly Case[]): Promise<void> {
  const failures: string[] = [];
  for (const one of cases) {
    try {
      await withTimeout(one.run(), one.name);
      console.log(`  ok   ${one.name}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`  FAIL ${one.name}: ${reason}`);
      failures.push(`${one.name}: ${reason}`);
    }
  }
  console.log(`${cases.length - failures.length} / ${cases.length} passed`);
  if (failures.length > 0) throw new Error(`${failures.length} 本が落ちました\n${failures.join('\n')}`);
}
