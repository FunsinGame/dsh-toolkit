/**
 * 表格视图的行为：直接驱动真实的 webview 脚本。
 *
 * 测试把 `media/main.js` 载入扩展真正渲染的那套 DOM 骨架，喂给它编辑器消息，
 * 然后断言产生的 DOM 与视图回传的消息。这覆盖了类型检查覆盖不到的部分：
 * 渲染、虚拟滚动、就地编辑，以及菜单和键盘产生的修改。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

import { JSDOM, VirtualConsole } from 'jsdom';

const PACKAGE_ROOT = path.join(__dirname, '..', '..');

/** `main.js` 会在外壳里查找的 id，它们必须出现在真实 HTML 中。 */
const SHELL_IDS = ['app', 'toolbar', 'chips', 'banner', 'scroll', 'status', 'menu'];

/** 视图回传给编辑器的一条消息。 */
interface PostedMessage {
  readonly type: string;
  readonly op?: { readonly kind: string; readonly [key: string]: unknown };
  readonly state?: { readonly filter?: { readonly query?: string } };
}

/** 已载入的视图，以及它回传的消息。 */
interface Harness {
  /** 承载视图的 window。 */
  // jsdom 暴露的 window 没有类型；测试直接断言其结果 DOM。
  readonly window: any;
  readonly posted: PostedMessage[];
}

/**
 * 取出扩展真正渲染的 body 标记。
 *
 * 从 `webviewHtml.ts` 中读取外壳，可以保证测试与真实文档一致，而不是照抄一份
 * 骨架出来。
 *
 * @returns 去掉 script 标签后的 body 标记。
 */
function shellMarkup(): string {
  const source = readFileSync(
    path.join(PACKAGE_ROOT, 'src', 'editor', 'webviewHtml.ts'),
    'utf8',
  );
  for (const id of SHELL_IDS) {
    assert.ok(source.includes(`id="${id}"`), `webviewHtml.ts 必须定义 #${id}`);
  }
  const body = /<body>([\s\S]*?)<\/body>/.exec(source);
  assert.ok(body !== null, 'webviewHtml.ts 必须包含 body');
  return body[1].replace(/<script[\s\S]*?<\/script>/, '');
}

/**
 * 在一个全新的 window 里载入 webview 脚本。
 *
 * @returns 该视图的测试夹具。
 */
function createHarness(): Harness {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${shellMarkup()}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    // jsdom 没有 canvas，无法测量文本宽度；视图会退化为估算，那条提示不算失败。
    virtualConsole: new VirtualConsole(),
  });
  const posted: PostedMessage[] = [];
  dom.window.acquireVsCodeApi = () => ({
    postMessage: (message: PostedMessage) => posted.push(message),
    getState: () => undefined,
    setState: () => undefined,
  });
  dom.window.eval(readFileSync(path.join(PACKAGE_ROOT, 'media', 'main.js'), 'utf8'));
  return { window: dom.window, posted };
}

/**
 * 按编辑器的方式构造一条 update 消息。
 *
 * @param rows - 整张表的所有行，表头在最前。
 * @param overrides - 要覆盖的消息字段。
 * @returns 该 update 消息。
 */
function updateMessage(
  rows: string[][],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const hasHeader = overrides.hasHeader !== false;
  // 顶部固定条只显示列号，文件里的每一行都是数据行。
  const visible: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    visible.push(index);
  }
  return {
    type: 'update',
    revision: 1,
    opId: null,
    documentUri: 'file:///table.csv',
    rows,
    visible,
    hasHeader,
    columnCount: rows.length > 0 ? rows[0].length : 0,
    totalRows: rows.length,
    truncated: false,
    readOnly: false,
    filterError: '',
    delimiter: ',',
    detectedDelimiter: ',',
    delimiterIsAuto: true,
    eol: '\n',
    bom: false,
    columnWidthMax: 480,
    sort: null,
    ...overrides,
  };
}

/**
 * 把一条消息投递给视图。
 *
 * @param harness - 已载入的视图。
 * @param message - 消息内容。
 */
function send(harness: Harness, message: Record<string, unknown>): void {
  harness.window.dispatchEvent(new harness.window.MessageEvent('message', { data: message }));
}

/**
 * 把视图回传的值复制到当前 realm。
 *
 * 视图发出的对象是在 jsdom 的 realm 中创建的，原型也属于那个 realm，严格的
 * 深比较会因此判定不相等。
 *
 * @param value - 视图产生的值。
 * @returns 使用当前 realm 原型的同一份数据。
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 读取某一行中所有单元格的文本。
 *
 * @param harness - 已载入的视图。
 * @param index - 渲染出来的 body 行序号。
 * @returns 单元格文本。
 */
function rowTexts(harness: Harness, index: number): string[] {
  const row = harness.window.document.querySelectorAll('tbody tr')[index];
  return Array.from(row.querySelectorAll('td.cell')).map((cell: any) => cell.textContent);
}

const SAMPLE = [
  ['name', 'age', 'city'],
  ['ann', '31', 'berlin'],
  ['bob', '9', 'amsterdam'],
];

test('渲染列号、数据行与状态栏', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  assert.equal(document.querySelectorAll('thead th.head-cell').length, 3);
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  assert.deepEqual(rowTexts(harness, 2), ['bob', '9', 'amsterdam']);
  assert.match(document.getElementById('status').textContent, /未选中/);
});

test('顶部固定条只显示列号，首行作为数据行渲染', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const headers = document.querySelectorAll('thead th.head-cell');
  assert.equal(headers.length, 3);
  assert.deepEqual(
    Array.from(headers).map((header: any) => header.querySelector('.letter').textContent),
    ['A', 'B', 'C'],
  );
  assert.equal(document.querySelector('thead th.head-cell .text'), null, '表头不再显示首行内容');
  // 文件的三行全部作为数据行渲染，首行不例外。
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  assert.deepEqual(rowTexts(harness, 0), ['name', 'age', 'city']);
  assert.deepEqual(rowTexts(harness, 1), ['ann', '31', 'berlin']);
  assert.deepEqual(rowTexts(harness, 2), ['bob', '9', 'amsterdam']);
});

test('大表格只渲染可见的窗口', () => {
  const harness = createHarness();
  const rows = [['id', 'value']];
  for (let index = 0; index < 5000; index += 1) {
    rows.push([String(index), 'x'.repeat(index % 7)]);
  }
  send(harness, updateMessage(rows));
  const rendered = harness.window.document.querySelectorAll('tbody tr').length;
  assert.ok(rendered > 0 && rendered < 200, `实际渲染了 ${rendered} 行`);
  assert.match(harness.window.document.getElementById('toolbar').textContent, /5001 行/);
});

test('点击列号行只选中整列，不触发排序', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const header = document.querySelector('thead th.head-cell[data-col="1"]');
  header.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);
  // 整列三行都进入选区。
  const selected = document.querySelectorAll('tbody td.cell.selected');
  assert.equal(selected.length, 3);
  assert.deepEqual(
    Array.from(selected).map((cell: any) => cell.getAttribute('data-col')),
    ['1', '1', '1'],
  );
});

test('点击列号右侧的下拉三角弹出排序菜单', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const button = document.querySelector('thead .sort-button[data-col="1"]');
  assert.equal(button.textContent, '▼');
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);

  button.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  const menu = document.getElementById('menu');
  assert.equal(menu.hidden, false, '下拉列表已展开');
  const labels = Array.from(menu.querySelectorAll('.menu-item')).map((item: any) => item.textContent);
  assert.deepEqual(labels.slice(0, 2), ['升序排序', '降序排序']);

  menu.querySelectorAll('.menu-item')[1].dispatchEvent(
    new harness.window.MouseEvent('click', { bubbles: true }),
  );
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), { kind: 'sort', column: 1, direction: 'desc', hasHeader: true });
  assert.equal(menu.hidden, true, '选择后菜单收起');
});

test('已排序的列在下拉三角上显示方向并勾选当前方式', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { sort: { column: 2, direction: 'asc' } }));
  const document = harness.window.document;
  assert.equal(document.querySelector('thead .sort-button[data-col="2"]').textContent, '▲');
  assert.equal(document.querySelector('thead .sort-button[data-col="2"]').className, 'sort-button sorted');
  assert.equal(document.querySelector('thead .sort-button[data-col="0"]').textContent, '▼');

  document
    .querySelector('thead .sort-button[data-col="2"]')
    .dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  const labels = Array.from(document.querySelectorAll('#menu .menu-item')).map(
    (item: any) => item.textContent,
  );
  assert.equal(labels[0], '✓ 升序排序');
  assert.equal(labels[1], '降序排序');
});

test('拖拽行号把选中的行移动到落点', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const rows = document.querySelectorAll('tbody tr');
  // jsdom 既没有排版也没有命中测试，这里给第 3 行一个确定的矩形并让命中测试落到它上面。
  rows[2].getBoundingClientRect = () => ({
    top: 52,
    bottom: 78,
    height: 26,
    left: 0,
    right: 300,
    width: 300,
  });
  document.elementFromPoint = () => rows[2].querySelector('td.cell');

  const handle = document.querySelector('tbody td.rownum[data-row="1"]');
  handle.dispatchEvent(
    new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 30 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 70 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mouseup', { bubbles: true, clientX: 20, clientY: 70 }),
  );

  const op = harness.posted.filter(message => message.type === 'op').pop();
  // 指针在第 3 行的下半部分，落点是它之后（绝对行号 3）。
  assert.deepEqual(plain(op?.op), { kind: 'moveRows', indices: [1], to: 3 });
});

test('拖拽列号把选中的列移动到落点', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const headers = document.querySelectorAll('thead th.head-cell');
  headers[2].getBoundingClientRect = () => ({
    top: 0,
    bottom: 30,
    height: 30,
    left: 200,
    right: 300,
    width: 100,
  });
  document.elementFromPoint = () => headers[2].querySelector('.letter');

  headers[0].dispatchEvent(
    new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: 260, clientY: 10 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mouseup', { bubbles: true, clientX: 260, clientY: 10 }),
  );

  const op = harness.posted.filter(message => message.type === 'op').pop();
  // 指针在第 3 列的右半部分，落点是它之后（列号 3）。
  assert.deepEqual(plain(op?.op), { kind: 'moveColumns', indices: [0], to: 3 });
});

test('按住 Shift 扩展整行选区后可以整块拖动', () => {
  const harness = createHarness();
  send(
    harness,
    updateMessage([['h', 'v'], ['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']]),
  );
  const document = harness.window.document;
  const rowHandle = (row: number) =>
    document.querySelector('tbody td.rownum[data-row="' + row + '"]');
  const press = (element: any, y: number, shiftKey = false) =>
    element.dispatchEvent(
      new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: y, shiftKey }),
    );

  press(rowHandle(1), 30);
  document.dispatchEvent(new harness.window.MouseEvent('mouseup', { bubbles: true }));
  press(rowHandle(2), 56, true);
  document.dispatchEvent(new harness.window.MouseEvent('mouseup', { bubbles: true }));
  assert.equal(
    document.querySelectorAll('tbody tr')[1].querySelectorAll('td.cell.selected').length,
    2,
    'Shift 点击后第 1、2 行整行选中',
  );

  const lastRow = document.querySelectorAll('tbody tr')[4];
  lastRow.getBoundingClientRect = () => ({
    top: 156,
    bottom: 182,
    height: 26,
    left: 0,
    right: 100,
    width: 100,
  });
  document.elementFromPoint = () => lastRow.querySelector('td.cell');

  press(rowHandle(2), 56);
  document.dispatchEvent(
    new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 180 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mouseup', { bubbles: true, clientX: 20, clientY: 180 }),
  );

  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), { kind: 'moveRows', indices: [1, 2], to: 5 });
});

test('只按下不拖动不会产生移动操作', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const handle = document.querySelector('tbody td.rownum[data-row="1"]');
  handle.dispatchEvent(
    new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 30 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 32 }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mouseup', { bubbles: true, clientX: 20, clientY: 32 }),
  );
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);
});

test('编辑单元格会回传新的值', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const target = 'tbody td.cell[data-row="2"][data-col="1"]';
  document.querySelector(target).dispatchEvent(new harness.window.MouseEvent('mousedown', { bubbles: true }));
  // 选中不会重建正文，节点保持有效，双击进入编辑。
  const cell = document.querySelector(target);
  cell.dispatchEvent(new harness.window.MouseEvent('dblclick', { bubbles: true }));
  const input = cell.querySelector('input.cell-input');
  assert.ok(input, '会创建编辑用的输入框');
  assert.equal(input.value, '9');
  input.value = '10';
  input.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), { kind: 'setCell', row: 2, column: 1, value: '10' });
  assert.equal(harness.window.document.querySelector('input.cell-input'), null);
});

test('点击选中的单元格不会重建 DOM 节点', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const target = 'tbody td.cell[data-row="1"][data-col="1"]';
  const before = document.querySelector(target);
  before.dispatchEvent(new harness.window.MouseEvent('mousedown', { bubbles: true }));
  // 两次点击之间一旦换掉单元格节点，浏览器就会把点击计数重置为 1，
  // `dblclick` 永远不会到达，双击进入编辑随之失效。
  assert.equal(document.querySelector(target), before, '选中后必须还是同一个节点');
  assert.equal(before.classList.contains('active-cell'), true, '选中状态画在原节点上');
});

test('按 Escape 取消编辑且不回传任何修改', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const cell = harness.window.document.querySelector('tbody td.cell[data-row="1"][data-col="0"]');
  cell.dispatchEvent(new harness.window.MouseEvent('dblclick', { bubbles: true }));
  const input = cell.querySelector('input.cell-input');
  input.value = 'changed';
  input.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);
});

test('Delete 用一次修改清空选中的区域', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const cell = harness.window.document.querySelector('tbody td.cell[data-row="1"][data-col="0"]');
  cell.dispatchEvent(new harness.window.MouseEvent('mousedown', { bubbles: true }));
  harness.window.document.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
  );
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), {
    kind: 'clearRange',
    rowStart: 1,
    rowEnd: 1,
    columnStart: 0,
    columnEnd: 0,
  });
});

test('过滤输入框会回传视图状态', async () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const search = harness.window.document.querySelector('.search');
  search.value = 'bob';
  search.dispatchEvent(new harness.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 260));
  const message = harness.posted.filter(entry => entry.type === 'view').pop();
  assert.equal(message?.state?.filter?.query, 'bob');
});

test('第一次更新会恢复持久化的视图控件', () => {
  const harness = createHarness();
  send(
    harness,
    updateMessage([['name', 'age'], ['ann', '31']], {
      viewState: {
        delimiter: ';',
        header: 'no',
        filter: { query: 'ann', mode: 'contains', caseSensitive: false, columns: { 1: '31' } },
        columnWidths: { 0: 222 },
        sort: { column: 0, direction: 'desc' },
      },
    }),
  );
  const document = harness.window.document;
  assert.equal(document.getElementById('search').value, 'ann');
  assert.equal(document.getElementById('delimiter').value, ';');
  assert.equal(document.getElementById('header').textContent, '表头：否');
  assert.match(document.querySelector('.chip').textContent, /^列 B: 31/);
});

test('后续更新不会覆盖用户正在输入的控件', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const search = harness.window.document.getElementById('search');
  search.value = 'bob';
  search.dispatchEvent(new harness.window.Event('input', { bubbles: true }));
  send(
    harness,
    updateMessage(SAMPLE, { revision: 2, viewState: { filter: { query: '' }, header: 'auto' } }),
  );
  assert.equal(search.value, 'bob');
});

test('空文档提供创建表格的入口', () => {
  const harness = createHarness();
  send(harness, updateMessage([], { columnCount: 0 }));
  const button = harness.window.document.querySelector('.empty .button');
  assert.ok(button, '空状态会显示一个操作按钮');
  button.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), { kind: 'initGrid', columns: 3, rows: 3 });
});

test('只读文档会禁用行与列的修改', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { truncated: true, readOnly: true }));
  const document = harness.window.document;
  assert.match(document.getElementById('banner').textContent, /只读/);
  // 工具栏按钮顺序：区分大小写、表头、添加行、添加列、自动列宽、撤销、重做。
  assert.equal(document.querySelectorAll('.toolbar .button')[2].disabled, true);
});
