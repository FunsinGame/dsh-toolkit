/**
 * 「定位到引用表」的宿主侧链路：用 `vscode` 的替身直接驱动真实会话。
 *
 * 这里覆盖的关键分歧是「被引用的表**已经打开**」这一支：那张表不会再新建会话、
 * 也不会再发 `ready`，宿主必须找到它已经存在的会话，把定位投过去。真实 VS Code
 * 里 webview 的 DOM 在扩展宿主里看不到，所以这里用替身面板接住宿主发出的消息，
 * 断言它到底发给了哪一份视图、带的是什么行列。
 */

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { parseCsv, serializeCsv } from '../csv/csv';

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const SAMPLES = path.join(PACKAGE_ROOT, 'samples', '测试', 'Datas');
const require_ = createRequire(__filename);

/** 替身面板收到的消息。 */
interface Posted {
  readonly type: string;
  readonly row?: number;
  readonly column?: number;
  readonly [key: string]: unknown;
}

/** 一份替身表格视图。 */
interface FakeView {
  readonly uri: string;
  readonly messages: Posted[];
  readonly session: unknown;
  /** 触发视图发来的消息（例如右键「定位到引用表」）。 */
  send(message: unknown): Promise<void>;
  /** 视图是否已经被激活过。 */
  focused: boolean;
  /** 释放会话（模拟关闭页签）。 */
  close(): void;
}

/** 组装一个能跑真实会话的宿主替身。 */
function createHarness() {
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
      public replace(): void {}
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

  /**
   * 打开一份表格视图。
   *
   * @param fsPath - 文档的绝对路径。
   * @returns 该视图的替身。
   */
  const open = (fsPath: string): FakeView => {
    const uri = uriOf(fsPath);
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
      getText: () => readFileSync(fsPath, 'utf8'),
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
      uri: uri.toString(),
      messages,
      session,
      focused: false,
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

const BUFF = path.join(SAMPLES, 'buff_效果.csv');
const LANGUAGE = path.join(SAMPLES, '本地化', 'Language_CN_42_HeroBuff.csv');

/**
 * 取样例里第 5 行 D 列（下标 4,3）的公式原文。
 *
 * @returns 单元格内容。
 */
function formulaAtBuffRow(): string {
  const parsed = parseCsv(readFileSync(BUFF, 'utf8'), { delimiter: 'auto' });
  return parsed.rows[4][3];
}

test('被引用的表还没打开：登记目标格，交给新会话随更新一起选中', async () => {
  const harness = createHarness();
  const buff = harness.open(BUFF);
  await buff.send({ type: 'ready' });

  // 第 5 行（下标 4）D 列（下标 3）是公式。
  await buff.send({
    type: 'reveal',
    formula: formulaAtBuffRow(),
    row: 4,
    column: 3,
  });

  // 宿主打开了被引用的文件；此时还没有那份会话，所以不需要给谁发 reveal 消息。
  assert.equal(harness.openedPaths().length, 1);
  assert.match(harness.openedPaths()[0], /Language_CN_42_HeroBuff\.csv$/);
  assert.equal(
    buff.messages.some(message => message.type === 'reveal'),
    false,
    '目标表还没打开时不由源视图推送定位',
  );

  // 目标表随后被打开：新会话在 `ready` 时取走登记，并随更新消息带上目标格。
  const language = harness.open(LANGUAGE);
  await language.send({ type: 'ready' });
  const updates = language.messages.filter(message => message.type === 'update');
  assert.ok(updates.length > 0, '新会话推送了更新');
  const withReveal = updates.find(message => message.revealCell !== undefined);
  assert.ok(withReveal !== undefined, '至少一条更新带着目标格');
  assert.deepEqual(withReveal.revealCell, [8, 2], '目标格是语言表第 9 行 C 列');
});

test('被引用的表已经打开：直接把定位投给那一份会话', async () => {
  const harness = createHarness();
  // 先把被引用的表打开（模拟用户提前打开了配置表）。
  const language = harness.open(LANGUAGE);
  await language.send({ type: 'ready' });
  language.messages.length = 0;

  const buff = harness.open(BUFF);
  await buff.send({ type: 'ready' });
  buff.messages.length = 0;

  await buff.send({
    type: 'reveal',
    formula: formulaAtBuffRow(),
    row: 4,
    column: 3,
  });

  // 定位应该直接送到已经打开的那份视图上，行列就是语言表里的目标格。
  const reveal = language.messages.find(message => message.type === 'reveal');
  assert.ok(reveal !== undefined, '已打开的视图收到了定位消息');
  assert.equal(reveal.row, 8);
  assert.equal(reveal.column, 2);
  assert.equal(
    buff.messages.some(message => message.type === 'reveal'),
    false,
    '源视图自己不该收到定位',
  );
});

test('公式指向本文件时也把定位投给自己', async () => {
  const harness = createHarness();
  // 造一个「公式指向本文件」的临时 CSV：键列与取值列都是它自己的 name 列。
  const selfPath = path.join(SAMPLES, '__self_ref_demo.csv');
  const parsed = parseCsv(readFileSync(BUFF, 'utf8'), { delimiter: 'auto' });
  const formula = '=REF("__self_ref_demo.csv", "name", %C, "name")';
  parsed.rows[4][3] = formula;
  writeFileSync(selfPath, serializeCsv(parsed.rows, parsed.dialect), 'utf8');

  try {
    const view = harness.open(selfPath);
    await view.send({ type: 'ready' });
    view.messages.length = 0;

    await view.send({ type: 'reveal', formula, row: 4, column: 3 });
    const reveal = view.messages.find(message => message.type === 'reveal');
    assert.ok(reveal !== undefined, '自己收到了定位消息');
    // 键取本行 C 列，在自身 name 列里匹配到的就是本行，取值列同样是 name。
    assert.equal(reveal.row, 4);
    assert.equal(reveal.column, 2);
  } finally {
    rmSync(selfPath, { force: true });
  }
});

test('视图给的公式与文档不一致时只提示，不发定位', async () => {
  const harness = createHarness();
  const buff = harness.open(BUFF);
  await buff.send({ type: 'ready' });
  buff.messages.length = 0;
  harness.resetOpened();

  await buff.send({ type: 'reveal', formula: '=REF("改过了", "id", %C, "value")', row: 4, column: 3 });
  assert.equal(harness.openedPaths().length, 0);
  assert.equal(
    buff.messages.some(message => message.type === 'reveal'),
    false,
    '文档已变化时不动任何页签',
  );
});
