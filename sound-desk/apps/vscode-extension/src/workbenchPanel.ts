/**
 * The workbench panel (a normal editor tab) and the reusable reveal-opener.
 */

import * as vscode from 'vscode';

import type { EngineHost } from './engineHost.ts';
import { WebviewSession } from './webviewSession.ts';

export const PANEL_VIEW_TYPE = 'soundDesk.workbench';

export class WorkbenchPanel {
  private static current: WorkbenchPanel | null = null;

  private readonly session: WebviewSession;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, host: EngineHost, extensionUri: vscode.Uri, deepLink?: Record<string, string | number>) {
    this.panel = panel;
    this.panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg'),
    };
    this.session = new WebviewSession({
      host,
      extensionUri,
      title: 'SoundDesk',
      ...(deepLink ? { deepLink } : {}),
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    void this.session.attach(this.panel.webview);
  }

  static open(host: EngineHost, extensionUri: vscode.Uri, deepLink?: Record<string, string | number>): WorkbenchPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (WorkbenchPanel.current) {
      WorkbenchPanel.current.panel.reveal(column);
      return WorkbenchPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, 'SoundDesk', column, {
      enableScripts: true,
      // Recreating a webview on every tab switch would restart playback and
      // re-fetch the waveform, so keep the DOM alive while hidden.
      retainContextWhenHidden: true,
    });

    WorkbenchPanel.current = new WorkbenchPanel(panel, host, extensionUri, deepLink);
    return WorkbenchPanel.current;
  }

  /** Used by the audio custom editor to hand off to the full workbench. */
  static reveal(host: EngineHost, extensionUri: vscode.Uri, deepLink?: Record<string, string | number>): void {
    WorkbenchPanel.open(host, extensionUri, deepLink);
  }

  dispose(): void {
    if (WorkbenchPanel.current === this) WorkbenchPanel.current = null;
    this.session.dispose();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.panel.dispose();
  }
}
