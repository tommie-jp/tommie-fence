/**
 * `vscode` の代わり。**拡張の入口を node のテストで動かす**ためだけのもの。
 *
 * 畳んだ入口 (`activate`) が本当に 3 つのフェンスを登録するかは、組み上がった
 * ものを動かさないと分からない — 型は通っても、命令の綴りや登録の順は
 * 型に出ない。ここで受け止めた登録を、テストが数える。
 */
export const registered: { commands: string[]; editors: string[] } = { commands: [], editors: [] };

export const commands = {
  registerCommand(id: string, _run: unknown) {
    registered.commands.push(id);
    return { dispose() {} };
  },
  executeCommand() {
    return Promise.resolve();
  },
};

export class ThemeColor {
  constructor(public id: string) {}
}

export const window = {
  createTextEditorDecorationType(options: unknown) {
    return { key: 'stub', dispose() {}, options };
  },
  registerCustomEditorProvider(viewType: string, _provider: unknown, _options?: unknown) {
    registered.editors.push(viewType);
    return { dispose() {} };
  },
  createWebviewPanel() {
    throw new Error('テストではパネルを開かない');
  },
  showWarningMessage() {},
  showErrorMessage() {},
  get activeTextEditor() {
    return undefined;
  },
  onDidChangeActiveTextEditor() {
    return { dispose() {} };
  },
  onDidChangeTextEditorSelection() {
    return { dispose() {} };
  },
};

export const workspace = {
  onDidChangeTextDocument() {
    return { dispose() {} };
  },
  onDidCloseTextDocument() {
    return { dispose() {} };
  },
  getConfiguration() {
    return { get: () => undefined };
  },
  applyEdit() {
    return Promise.resolve(true);
  },
};

export const ViewColumn = { Beside: 2 };
export const Uri = { joinPath: (...parts: unknown[]) => ({ toString: () => parts.join('/') }) };
export class EventEmitter {
  event = () => ({ dispose() {} });
  fire() {}
  dispose() {}
}
export class WorkspaceEdit {
  replace() {}
}
export class Range {}
export class Position {}
export class Selection {}
