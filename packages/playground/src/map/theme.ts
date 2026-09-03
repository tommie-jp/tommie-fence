/**
 * マップの殻は **VS Code の色の変数**で書かれている (`--vscode-*`)。
 * 頁にはそれを配る人が居ないので、ここで配る。**頁の側の役** —
 * VS Code がテーマとしてやっていることを、同じ名前で肩代わりする。
 *
 * 明暗は `prefers-color-scheme` に従う (頁の他の部分と同じ)。
 */
export const THEME_CSS = `
  :root {
    color-scheme: light dark;
    --vscode-font-family: ui-sans-serif, system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
    --vscode-editor-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --vscode-foreground: #1f2328;
    --vscode-descriptionForeground: #59636e;
    --vscode-editor-background: #ffffff;
    --vscode-sideBar-background: #f6f8fa;
    --vscode-editorWidget-background: #ffffff;
    --vscode-editorWidget-border: #d1d9e0;
    --vscode-panel-border: #d1d9e0;
    --vscode-focusBorder: #0969da;
    --vscode-charts-blue: #0969da;
    --vscode-charts-green: #1a7f37;
    --vscode-charts-orange: #bc4c00;
    --vscode-editorError-foreground: #b3261e;
    --vscode-editorWarning-foreground: #9a6700;
    --vscode-inputValidation-errorBackground: #ffebe9;
    --vscode-inputValidation-warningBackground: #fff8c5;
    --vscode-editor-findMatchHighlightBackground: #fff8c5;
    --vscode-editor-inactiveSelectionBackground: #eaeef2;
    --vscode-input-background: #ffffff;
    --vscode-input-foreground: #1f2328;
    --vscode-input-border: #d1d9e0;
    --vscode-dropdown-background: #ffffff;
    --vscode-dropdown-foreground: #1f2328;
    --vscode-dropdown-border: #d1d9e0;
    --vscode-list-hoverBackground: #eaeef2;
    --vscode-list-activeSelectionBackground: #0969da;
    --vscode-list-activeSelectionForeground: #ffffff;
    --vscode-statusBar-background: #f6f8fa;
    --vscode-statusBar-foreground: #59636e;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --vscode-foreground: #e6edf3;
      --vscode-descriptionForeground: #9198a1;
      --vscode-editor-background: #0d1117;
      --vscode-sideBar-background: #151b23;
      --vscode-editorWidget-background: #151b23;
      --vscode-editorWidget-border: #3d444d;
      --vscode-panel-border: #3d444d;
      --vscode-focusBorder: #4493f8;
      --vscode-charts-blue: #4493f8;
      --vscode-charts-green: #3fb950;
      --vscode-charts-orange: #ec8e2c;
      --vscode-editorError-foreground: #ff8080;
      --vscode-editorWarning-foreground: #d29922;
      --vscode-inputValidation-errorBackground: #3c1618;
      --vscode-inputValidation-warningBackground: #3a2d12;
      --vscode-editor-findMatchHighlightBackground: #3a2d12;
      --vscode-editor-inactiveSelectionBackground: #21262d;
      --vscode-input-background: #0d1117;
      --vscode-input-foreground: #e6edf3;
      --vscode-input-border: #3d444d;
      --vscode-dropdown-background: #151b23;
      --vscode-dropdown-foreground: #e6edf3;
      --vscode-dropdown-border: #3d444d;
      --vscode-list-hoverBackground: #21262d;
      --vscode-list-activeSelectionBackground: #1f6feb;
      --vscode-list-activeSelectionForeground: #ffffff;
      --vscode-statusBar-background: #151b23;
      --vscode-statusBar-foreground: #9198a1;
    }
  }
`;
