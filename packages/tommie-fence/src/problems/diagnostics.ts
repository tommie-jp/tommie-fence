import * as vscode from 'vscode';
import type { FenceEditor } from 'fence-kit';
import { collectProblems } from './collect.ts';
import type { Problem } from './collect.ts';

/**
 * 読めなかった行・お知らせ・(設定で) ERC を **Problems パネル**に出す (52 の docs/57)。
 * ここは vscode へ写す配線だけ。何を出すかは `collect.ts` (と各フェンスの `problems`)。
 *
 * **帯 (プレビューとマップ) は残す。** Problems の無い宿主 (playground) があるので、
 * 帯が正で、こちらは写し。
 */

/**
 * 打鍵をまとめる待ち時間。**止まってから**組み直す — Problems は目の端で
 * 見るもので、打っている最中に波線が出たり消えたりするとうるさい。
 * 費用は帯と同じ (compile まで。TeX は通らない) で、打鍵ごとでも足りる重さ。
 */
export const PROBLEMS_DELAY_MS = 300;

/** 設定の節。`package.json` の `contributes.configuration` と同じ字にする。 */
const SECTION = 'tommieFence.problems';

/** Problems の「出どころ」の欄。 */
const SOURCE = 'tommie-fence';

/**
 * 重さ。読めなかった行は直さないと図が出ないので Error、お知らせは読めたが
 * 思ったとおりには出ないので Warning、ERC は組んでも動かないところで、
 * 組んでいる途中は当たり前に出るので Information。
 */
const SEVERITY: Readonly<Record<Problem['kind'], vscode.DiagnosticSeverity>> = {
  error: vscode.DiagnosticSeverity.Error,
  notice: vscode.DiagnosticSeverity.Warning,
  erc: vscode.DiagnosticSeverity.Information,
};

/**
 * ERC も出すか。**既定は出さない** — perfboard は組んでいる途中、足 1 本ごとに
 * 「つながっていません」が出る。Problems に常に並ぶと、直す場所のある報告が
 * 埋もれる (52 の docs/52 / 55 の「普段は OFF、最後に ON」)。
 */
const wantsErc = (): boolean => vscode.workspace.getConfiguration(SECTION).get<boolean>('erc') === true;

function toDiagnostic(document: vscode.TextDocument, problem: Problem): vscode.Diagnostic {
  // **行ぜんぶ。** コアは桁を持っていない。行は文書の中に収める (書き換えの途中で
  // 文書が縮んでいても、範囲の外を指さない)。
  const index = Math.min(Math.max(problem.line - 1, 0), document.lineCount - 1);
  const diagnostic = new vscode.Diagnostic(document.lineAt(index).range, problem.message, SEVERITY[problem.kind]);
  diagnostic.source = SOURCE;
  diagnostic.code = problem.language;
  return diagnostic;
}

export function registerProblems(context: vscode.ExtensionContext, editors: readonly FenceEditor[]): void {
  const collection = vscode.languages.createDiagnosticCollection(SOURCE);
  /** 組み直しの予約 (文書の URI → 予約)。文書ごとに待つ。 */
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== 'markdown') return;
    const problems = collectProblems(document.getText(), editors, { erc: wantsErc() });
    collection.set(document.uri, problems.map((one) => toDiagnostic(document, one)));
  };

  const refreshSoon = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const waiting = pending.get(key);
    if (waiting !== undefined) clearTimeout(waiting);
    pending.set(key, setTimeout(() => {
      pending.delete(key);
      refresh(document);
    }, PROBLEMS_DELAY_MS));
  };

  const forget = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const waiting = pending.get(key);
    if (waiting !== undefined) clearTimeout(waiting);
    pending.delete(key);
    collection.delete(document.uri);
  };

  const refreshAll = (): void => {
    for (const document of vscode.workspace.textDocuments) refresh(document);
  };

  refreshAll();
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'markdown') refreshSoon(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument(forget),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) refreshAll();
    }),
    {
      // **予約も片付ける。** 残すと、閉じたあとに診断を置きにいく。
      dispose: () => {
        for (const waiting of pending.values()) clearTimeout(waiting);
        pending.clear();
      },
    },
  );
}
