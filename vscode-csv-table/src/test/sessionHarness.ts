/**
 * 驱动真实 `CsvTableSession` 的测试替身。
 *
 * 真实 VS Code 里 webview 的 DOM 在扩展宿主里看不到，所以这里用替身面板接住会话
 * 发出的消息，并让 `applyEdit` 真的改掉那份替身文档的文本——「拖动行列」这类
 * 先写回文档、再推一次更新的链路，只有文档内容确实变了才能端到端跑起来。
 *
 * 文档文本与待落盘的修改放在模块级：`vscode` 模块在整个进程里只被替换一次
 * （`require` 有缓存），同一个测试文件里后建的替身仍然会用到最先那个 mock。
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const require_ = createRequire(__filename);

/** 每份替身文档当前的内容，按 URI 索引。 */
const documents = new Map<string, { text: string }>();
/** `WorkspaceEdit.replace` 记下的待落盘文本，按 URI 索引。 */
const pendingEdits = new Map<string, string>();

/** 替身面板收到的消息。 */
export interface Posted {
  readonly type: string;
  readonly row?: number;
  readonly column?: number;
  readonly [key: string]: unknown;
}

/** 一份替身表格视图。 */
export interface FakeView {
  readonly uri: string;
  readonly messages: Posted[];
  readonly session: unknown;
  /** 触发视图发来的消息（例如右键「定位到引用表」、拖动行列后回传 op）。 */
  send(message: unknown): Promise<void>;
  /** 这份视图当前看到的文档文本。 */
  text(): string;
  /** 视图是否已经被激活过。 */
  focused: boolean;
  /** 释放会话（模拟关闭页签）。 */
  close(): void;
}

/** 一个能跑真实会话的宿主替身。 */
export interface SessionHarness {
  /**
   * 打开一份表格视图。
   *
   * @param fsPath - 文档的绝对路径。
   * @returns 该视图的替身。
   */
  open(fsPath: string): FakeView;
  /** 宿主打开过哪些被引用的文件。 */
  openedPaths(): string[];
  /** 清空「打开过哪些文件」的记录。 */
  resetOpened(): void;
}

/**
 * 组装一个能跑真实会话的宿主替身。
 *
 * @returns 可以按路径打开表格视图的替身。
 */
export function createSessionHarness(): SessionHarness {
  const panels: { messages: Posted[]; postMessage(message: Posted): void; reveal(): void }[] = [];
  /** 每个文档的「视图 → 宿主」回调。 */
  const listeners: ((message: unknown) => void)[] = [];
  let opened: string[] = [];

  const uriOf = (fsPath: string) => {
    const normalized = fsPath.replace(/\\/g, '/');
    return {
      fsPath,
      path: normalized,
      scheme: 'file',
      toString: () => `file:///${normalized.replace(/^\//, '')}`,
    };
  };
  // 模拟 `vscode.Uri.joinPath`：按 URI 路径段拼接，`..` 退一级（会话靠它取到
  // 本文件所在目录，再拼出被引用文件的候选路径）。
  const joinPath = (uri: { fsPath: string }, ...parts: string[]): unknown => {
    let segments = uri.fsPath.replace(/\\/g, '/').split('/');
    for (const part of parts) {
      for (const piece of part.split('/')) {
        if (piece === '' || piece === '.') {
          continue;
        }
        if (piece === '..') {
          segments = segments.slice(0, Math.max(1, segments.length - 1));
          continue;
        }
        segments.push(piece);
      }
    }
    return uriOf(segments.join('/'));
  };

  const vscodeMock = {
    Uri: { file: uriOf, parse: uriOf, joinPath },
    RelativePattern: class {},
    Position: class {},
    Range: class {},
    Selection: class {},
    WorkspaceEdit: class {
      /** 会话改写文档时把新文本记下来，交给 `applyEdit` 真正落盘。 */
      public replace(uri: { toString(): string }, _range: unknown, text: string): void {
        pendingEdits.set(uri.toString(), text);
      }
    },
    ConfigurationTarget: { Global: 1 },
    ViewColumn: { Active: -1, One: 1, Two: 2 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    TabInputCustom: class {},
    TabInputText: class {},
    TabInputNotebook: class {},
    TabInputTextDiff: class {},
    window: {
      showWarningMessage: async (): Promise<void> => undefined,
      showErrorMessage: async (): Promise<void> => undefined,
      showInformationMessage: async (): Promise<void> => undefined,
      tabGroups: { all: [], activeTabGroup: { activeTab: undefined } },
      onDidChangeActiveTextEditor: () => ({ dispose: () => undefined }),
    },
    workspace: {
      getConfiguration: () => ({
        get: <T>(_key: string, fallback: T): T => fallback,
        update: async (): Promise<void> => undefined,
      }),
      /** 把待落盘的文本写进替身文档；真实编辑器里这一步会触发改动事件。 */
      applyEdit: async (): Promise<boolean> => {
        for (const [key, text] of pendingEdits) {
          const document = documents.get(key);
          if (document !== undefined) {
            document.text = text;
          }
        }
        pendingEdits.clear();
        return true;
      },
      onDidChangeTextDocument: (listener: (event: unknown) => void) => {
        void listener;
        return { dispose: () => undefined };
      },
      onDidChangeConfiguration: (listener: (event: unknown) => void) => {
        void listener;
        return { dispose: () => undefined };
      },
      createFileSystemWatcher: () => ({
        onDidChange: (): void => undefined,
        onDidCreate: (): void => undefined,
        onDidDelete: (): void => undefined,
        dispose: (): void => undefined,
      }),
      fs: {
        stat: async (uri: { fsPath: string }): Promise<unknown> => {
          // 只认真实存在的文件，让 FormulaFiles.resolve 走真实路径判断。
          readFileSync(uri.fsPath);
          return {};
        },
        readFile: async (uri: { fsPath: string }): Promise<Uint8Array> =>
          new Uint8Array(readFileSync(uri.fsPath)),
      },
      textDocuments: [],
      workspaceFolders: undefined,
      openTextDocument: async (): Promise<unknown> => ({}),
    },
    commands: {
      executeCommand: async (): Promise<unknown> => undefined,
      registerCommand: (): { dispose(): void } => ({ dispose: () => undefined }),
    },
    env: { clipboard: { readText: async () => '', writeText: async () => undefined } },
  };

  // 在加载会话模块**之前**把 `vscode` 换成替身：会话模块在顶层 require 它。
  // `vscode` 不是真实存在的包，所以直接拦 Module._load。
  const loader = require_('node:module') as {
    _load(request: string, parent: unknown, isMain: boolean): unknown;
  };
  const original = loader._load;
  loader._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
    if (request === 'vscode') {
      return vscodeMock;
    }
    return original.call(this, request, parent, isMain);
  };

  const { CsvTableSession, normalizeViewState } = require_(
    path.join(PACKAGE_ROOT, 'out', 'editor', 'session.js'),
  ) as {
    CsvTableSession: new (
      context: unknown,
      document: unknown,
      panel: unknown,
      state: unknown,
      openTarget: (uri: unknown) => Promise<boolean>,
      revealInTextEditor: (uri: unknown, row: number) => Promise<void>,
    ) => { dispose(): void };
    normalizeViewState: (raw: unknown) => unknown;
  };

  const open = (fsPath: string): FakeView => {
    const uri = uriOf(fsPath);
    const key = uri.toString();
    documents.set(key, { text: readFileSync(fsPath, 'utf8') });
    const messages: Posted[] = [];
    const panel = {
      viewColumn: 1,
      webview: {
        options: {},
        html: '',
        postMessage: (message: Posted): void => {
          messages.push(message);
        },
        onDidReceiveMessage: (listener: (message: unknown) => void) => {
          listeners.push(listener);
          return { dispose: () => undefined };
        },
      },
      onDidDispose: () => ({ dispose: () => undefined }),
      reveal: (): void => undefined,
    };
    const document = {
      uri,
      getText: () => documents.get(key)?.text ?? '',
      // `applyOperation` 用整篇文档的范围去 replace，这里只要是个对象即可。
      positionAt: () => new vscodeMock.Position(),
    };
    const context = { workspaceState: { get: () => undefined, update: async () => undefined } };
    const session = new CsvTableSession(
      context,
      document,
      panel,
      normalizeViewState(undefined),
      async (target: unknown) => {
        opened.push((target as { fsPath: string }).fsPath);
        return true;
      },
      async () => undefined,
    );
    const view: FakeView = {
      uri: key,
      messages,
      session,
      focused: false,
      text: () => documents.get(key)?.text ?? '',
      send: async (message: unknown) => {
        for (const listener of listeners) {
          listener(message);
        }
        // 会话把消息排进队列里串行处理，这里等一下让它跑完。
        await new Promise(resolve => setTimeout(resolve, 20));
      },
      close: () => session.dispose(),
    };
    panels.push(panel as never);
    return view;
  };

  return {
    open,
    openedPaths: () => opened,
    resetOpened: () => {
      opened = [];
    },
  };
}
