import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { createCardStore } from './store.ts';
import { setCardLookup } from './cardHooks.ts';

/**
 * 部品カードを VS Code につなぐ (52 の docs/158 の 3-2〜3-6)。**デスクトップだけ** — Node の API で
 * ファイルを読むので、web 版の入口は読み込まない。プレビューと殻が訊く口は `cardHooks.ts`。
 *
 * - 文書から上へ辿って `.tommie-fence/parts/` を探す (ワークスペースのフォルダより上は見ない)
 * - カードのファイルを見張り、変わったらプレビューを描き直し、Problems を組み直す
 * - 信頼されていないワークスペースでは読まない (信頼されたら読む)
 */

const GLOB = '**/.tommie-fence/parts/*.part.yaml';
/** `GLOB` に当たるファイルか (VS Code の操作の知らせを振り分ける)。 */
const isCardFile = (uri: vscode.Uri): boolean => /\/\.tommie-fence\/parts\/[^/]+\.part\.yaml$/.test(uri.path);
const SOURCE = 'tommie-fence (部品カード)';
/** Problems に並べるために探すカードの上限。 */
const MAX_FILES = 2000;

const severityOf = (severity: 'error' | 'notice'): vscode.DiagnosticSeverity =>
  (severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);

const diagnostic = (line: number, message: string, severity: 'error' | 'notice'): vscode.Diagnostic => {
  const at = Math.max(line - 1, 0);
  const item = new vscode.Diagnostic(new vscode.Range(at, 0, at, Number.MAX_SAFE_INTEGER), message, severityOf(severity));
  item.source = SOURCE;
  return item;
};

/**
 * 起動時に呼ぶ。`changed` はカードが変わったときに呼ぶ (プレビューの描き直しと、フェンスの Problems の組み直し)。
 */
export function registerCards(context: vscode.ExtensionContext, changed: () => void): void {
  const own = createCardStore({
    stopFor: (path) => vscode.workspace.getWorkspaceFolder(vscode.Uri.file(path))?.uri.fsPath ?? null,
    enabled: () => vscode.workspace.isTrusted,
  });
  setCardLookup((uri) => (uri.scheme === 'file' ? own.tableFor(uri.fsPath) : undefined));
  const collection = vscode.languages.createDiagnosticCollection('tommie-fence-cards');

  /** カードのファイルそのものの言うことを Problems に出す。 */
  const publish = async (): Promise<void> => {
    collection.clear();
    if (!vscode.workspace.isTrusted) return;
    const files = await vscode.workspace.findFiles(GLOB, '**/node_modules/**', MAX_FILES);
    for (const dir of new Set(files.map((file) => dirname(file.fsPath)))) {
      try {
        const read = own.readDir(dir);
        for (const file of read.files) {
          const items = file.issues.map((issue) => diagnostic(issue.line, issue.message, issue.severity));
          const notices = read.notices.filter((notice) => notice.file === file.name)
            .map((notice) => diagnostic(1, notice.message, 'notice'));
          collection.set(vscode.Uri.file(file.path), [...items, ...notices]);
        }
      } catch (error) {
        void vscode.window.showWarningMessage(`部品カードを読めません: ${dir} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  };

  const reload = (): void => {
    own.clear();
    changed();
    void publish();
  };

  /**
   * ファイルの見張りだけに頼らない。**VS Code は新しいファイルの「作成」の知らせを時々落とす**
   * (落ちる回は 30 秒待っても来ない。後の「変更」は来る)。VS Code の中で作る・保存する・消す・
   * 名前を変える操作は、その操作の知らせでも読み直す。
   */
  const reloadIfCard = (uris: readonly vscode.Uri[]): void => {
    if (uris.some(isCardFile)) reload();
  };

  const watcher = vscode.workspace.createFileSystemWatcher(GLOB);
  context.subscriptions.push(
    collection,
    watcher,
    watcher.onDidCreate(reload),
    watcher.onDidChange(reload),
    watcher.onDidDelete(reload),
    vscode.workspace.onDidCreateFiles((event) => reloadIfCard(event.files)),
    vscode.workspace.onDidDeleteFiles((event) => reloadIfCard(event.files)),
    vscode.workspace.onDidRenameFiles((event) => reloadIfCard(event.files.flatMap((one) => [one.oldUri, one.newUri]))),
    vscode.workspace.onDidSaveTextDocument((document) => reloadIfCard([document.uri])),
    vscode.workspace.onDidGrantWorkspaceTrust(reload),
    vscode.workspace.onDidChangeWorkspaceFolders(reload),
    { dispose: () => setCardLookup(null) },
  );
  void publish();
}
