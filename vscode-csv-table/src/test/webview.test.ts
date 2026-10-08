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
 * 给一个 window 装上可控的剪贴板。
 *
 * jsdom 默认没有 `navigator.clipboard`，而真实 webview 里它是可用的；这里造一个
 * 便于断言复制与粘贴的行为。
 *
 * @param window - 已载入的视图所在的 window。
 * @returns 记录复制内容、并提供粘贴内容的替身。
 */
function stubClipboard(window: any): { written: string[]; read: string } {
  const written: string[] = [];
  const clipboard = {
    written,
    read: '',
    writeText(text: string) {
      written.push(text);
      return Promise.resolve();
    },
    readText() {
      return Promise.resolve(clipboard.read);
    },
  };
  Object.defineProperty(window.navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
  });
  return clipboard;
}

/**
 * 构造一个只带文本的 `clipboardData` 替身。
 *
 * @param text - 剪贴板里的文本。
 * @returns `getData` / `types` 接口。
 */
function clipboardEventData(text: string): any {
  return {
    types: ['text/plain'],
    getData(type: string) {
      return type === 'text/plain' ? text : '';
    },
  };
}

/**
 * 派发一次带剪贴板内容的 paste 事件。
 *
 * jsdom 的 `ClipboardEvent` 不接受 `clipboardData` 初始化参数，因此这里直接构造
 * 一个带有该属性的事件对象再派发。
 *
 * @param harness - 已载入的视图。
 * @param text - 剪贴板里的文本。
 */
function dispatchPaste(harness: Harness, text: string): void {
  const event: any = new harness.window.Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = clipboardEventData(text);
  harness.window.document.dispatchEvent(event);
}

/**
 * 选中一个单元格。
 *
 * @param harness - 已载入的视图。
 * @param row - 绝对行索引。
 * @param column - 列索引。
 */
function clickCell(harness: Harness, row: number, column: number): void {
  const cell = harness.window.document.querySelector(
    `tbody td.cell[data-row="${row}"][data-col="${column}"]`,
  );
  assert.ok(cell, `找不到单元格 ${row},${column}`);
  cell.dispatchEvent(new harness.window.MouseEvent('mousedown', { bubbles: true }));
  harness.window.document.dispatchEvent(new harness.window.MouseEvent('mouseup', { bubbles: true }));
}

/**
 * 把表格的滚动容器与单元格摆到一套确定的几何上。
 *
 * jsdom 既没有排版也没有命中测试；有了这套矩形，坐标 → 单元格的换算才能像在
 * 真实窗口里一样工作。测试同时把列宽固定成 `columnWidth`，否则自动列宽会按
 * 内容变化，算出来的坐标就对不上了。
 *
 * @param harness - 已载入的视图。
 * @returns 坐标换算需要用到的那几个量。
 */
function stubGridGeometry(harness: Harness): {
  readonly viewport: { width: number; height: number };
  readonly rownumWidth: number;
  readonly columnWidth: number;
  readonly headHeight: number;
  readonly rowHeight: number;
} {
  // 视口要装得下三列，否则拖动到第三列时指针会落到表格之外。
  const viewport = { width: 600, height: 300 };
  const rownumWidth = 56;
  const columnWidth = 140;
  const headHeight = 30;
  const rowHeight = 26;
  const document = harness.window.document;
  const scroll = document.getElementById('scroll');
  Object.defineProperty(scroll, 'clientWidth', { value: viewport.width, configurable: true });
  Object.defineProperty(scroll, 'clientHeight', { value: viewport.height, configurable: true });
  scroll.getBoundingClientRect = () => ({
    top: 0,
    bottom: viewport.height,
    left: 0,
    right: viewport.width,
    width: viewport.width,
    height: viewport.height,
  });
  for (const cell of Array.from(document.querySelectorAll('tbody td.cell')) as any[]) {
    const row = Number(cell.getAttribute('data-row'));
    const column = Number(cell.getAttribute('data-col'));
    cell.getBoundingClientRect = () => ({
      top: headHeight + row * rowHeight,
      bottom: headHeight + (row + 1) * rowHeight,
      left: rownumWidth + column * columnWidth,
      right: rownumWidth + (column + 1) * columnWidth,
      width: columnWidth,
      height: rowHeight,
    });
  }
  return { viewport, rownumWidth, columnWidth, headHeight, rowHeight };
}

/**
 * 单元格中心点的坐标。
 *
 * @param grid - {@link stubGridGeometry} 返回的几何。
 * @param row - 绝对行索引。
 * @param column - 列索引。
 * @returns 该单元格中心的 `[x, y]`。
 */
function centreOf(
  grid: {
    readonly rownumWidth: number;
    readonly columnWidth: number;
    readonly headHeight: number;
    readonly rowHeight: number;
  },
  row: number,
  column: number,
): [number, number] {
  return [
    grid.rownumWidth + column * grid.columnWidth + grid.columnWidth / 2,
    grid.headHeight + row * grid.rowHeight + grid.rowHeight / 2,
  ];
}

/**
 * 在表格上做一次拖拽。
 *
 * @param harness - 已载入的视图。
 * @param from - 按下时的单元格与坐标。
 * @param to - 松开时的坐标。
 */
function dragOnGrid(
  harness: Harness,
  from: { row: number; column: number; x: number; y: number },
  to: { x: number; y: number },
): void {
  const document = harness.window.document;
  const start = document.querySelector(
    `tbody td.cell[data-row="${from.row}"][data-col="${from.column}"]`,
  );
  assert.ok(start, '拖拽的起点单元格必须存在');
  start.dispatchEvent(
    new harness.window.MouseEvent('mousedown', {
      bubbles: true,
      clientX: from.x,
      clientY: from.y,
    }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: to.x, clientY: to.y }),
  );
  document.dispatchEvent(
    new harness.window.MouseEvent('mouseup', { bubbles: true, clientX: to.x, clientY: to.y }),
  );
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

test('公式单元格显示算出来的值，真实内容仍是公式', () => {
  const harness = createHarness();
  const rows = [
    ['name', 'text'],
    ['hero_buff_name_42000001', '=REF("lang.csv", "name", "value")'],
    ['hero_buff_name_42000002', '=LOOKUP("lang.csv", "name", "missing", "value")'],
  ];
  send(
    harness,
    updateMessage(rows, {
      // 第 2 行取到了值，第 3 行没取到（null）→ 显示公式原文。
      resolved: { 1: [null, '庇护', null] },
      formulaErrors: ['第 3 行第 B 列：没有找到匹配的行：missing'],
    }),
  );
  const document = harness.window.document;
  const cell = document.querySelector('tbody td.cell[data-row="1"][data-col="1"]');
  assert.equal(cell.textContent, '庇护', '显示解析出来的多语言文本');
  assert.equal(cell.getAttribute('title'), '=REF("lang.csv", "name", "value")', '悬停看到公式原文');
  assert.equal(cell.getAttribute('data-display'), '庇护');
  assert.equal(cell.classList.contains('selected'), false);

  const unresolved = document.querySelector('tbody td.cell[data-row="2"][data-col="1"]');
  assert.equal(unresolved.textContent, '=LOOKUP("lang.csv", "name", "missing", "value")');
  assert.equal(unresolved.getAttribute('data-display'), null, '没有显示值时不带这个属性');
  assert.match(document.getElementById('banner').textContent, /公式取值失败：第 3 行第 B 列/);
});

test('公式单元格的选区刷新与状态栏都用显示值', () => {
  const harness = createHarness();
  const rows = [
    ['name', 'text'],
    ['hero_buff_name_42000001', '=REF("lang.csv", "name", "value")'],
  ];
  send(harness, updateMessage(rows, { resolved: { 1: [null, '庇护'] } }));
  const document = harness.window.document;
  const cell = document.querySelector('tbody td.cell[data-row="1"][data-col="1"]');
  cell.dispatchEvent(
    new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }),
  );
  document.dispatchEvent(new harness.window.MouseEvent('mouseup', { bubbles: true }));
  assert.equal(cell.textContent, '庇护', '就地刷新选区时不会把显示值换回公式');
  assert.match(document.getElementById('status').textContent, /庇护/);
});

test('双击公式单元格时输入框里是公式原文', () => {
  const harness = createHarness();
  const rows = [
    ['name', 'text'],
    ['hero_buff_name_42000001', '=REF("lang.csv", "name", "value")'],
  ];
  send(harness, updateMessage(rows, { resolved: { 1: [null, '庇护'] } }));
  const document = harness.window.document;
  const cell = document.querySelector('tbody td.cell[data-row="1"][data-col="1"]');
  cell.dispatchEvent(new harness.window.MouseEvent('dblclick', { bubbles: true }));
  const input = cell.querySelector('input.cell-input');
  assert.ok(input !== null, '双击进入编辑');
  assert.equal(input.value, '=REF("lang.csv", "name", "value")', '编辑时写的是公式');
  // 直接失焦提交原样内容时，显示要回到算出来的值。
  input.dispatchEvent(new harness.window.Event('blur', { bubbles: true }));
  assert.equal(cell.textContent, '庇护');
});

test('公式单元格的右键菜单能定位到引用表', () => {
  const harness = createHarness();
  const rows = [
    ['name', 'text'],
    ['hero_buff_name_42000001', '=REF("lang.csv", "name", "value")'],
  ];
  // 这里给的是「目标格在我们视图里的行列」，真实坐标由宿主算好（见公式测试）。
  send(
    harness,
    updateMessage(rows, { resolved: { 1: [null, '庇护'] }, formulaTargets: { 1: [null, [4, 2]] } }),
  );
  const document = harness.window.document;
  const formulaCell = document.querySelector('tbody td.cell[data-row="1"][data-col="1"]');
  const plainCell = document.querySelector('tbody td.cell[data-row="1"][data-col="0"]');
  const itemsOf = (cell: any) => {
    cell.dispatchEvent(
      new harness.window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
    );
    return Array.from(document.querySelectorAll('#menu .menu-item')) as any[];
  };

  const formulaItems = itemsOf(formulaCell);
  const reveal = formulaItems.find(item => item.textContent === '定位到引用表');
  assert.ok(reveal !== undefined, '取到值的公式单元格有「定位到引用表」');
  assert.equal(reveal.disabled, false);

  reveal.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  const message = plain(harness.posted.filter(entry => entry.type === 'reveal').pop()) as any;
  assert.deepEqual(message, {
    type: 'reveal',
    formula: '=REF("lang.csv", "name", "value")',
    row: 1,
    column: 1,
  });

  // 不是公式的格子（宿主没给目标）这一项是灰的。
  const plainItems = itemsOf(plainCell);
  const disabled = plainItems.find(item => item.textContent === '定位到引用表');
  assert.ok(disabled !== undefined, '菜单项始终在，取不到值时置灰');
  assert.equal(disabled.disabled, true);
});

test('收到定位消息后滚动并选中目标单元格', () => {
  const harness = createHarness();
  const rows = [['id', 'value']];
  for (let index = 0; index < 5000; index += 1) {
    rows.push([String(index), 'x']);
  }
  send(harness, updateMessage(rows));
  const document = harness.window.document;
  send(harness, { type: 'reveal', row: 4000, column: 1 });
  const cell = document.querySelector('tbody td.cell[data-row="4000"][data-col="1"]');
  assert.ok(cell !== null, '目标行进入了渲染窗口');
  assert.equal(cell.classList.contains('active-cell'), true, '目标格成为当前格');
  assert.equal(cell.classList.contains('selected'), true, '目标格进入选区');
  assert.match(document.getElementById('status').textContent, /B4001/);
});

test('定位到被过滤掉的行时只提示，不改选区', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  send(harness, { type: 'reveal', row: 99, column: 0 });
  assert.equal(document.querySelectorAll('tbody td.cell.selected').length, 0);
  assert.match(document.getElementById('status').textContent, /定位失败/);
});

test('更新消息里带目标格时，渲染完就选中它', () => {
  const harness = createHarness();
  const rows = [['id', 'value']];
  for (let index = 0; index < 5000; index += 1) {
    rows.push([String(index), 'x']);
  }
  // 宿主打开被引用的表时把目标格随更新一起下发，视图渲染完就该直接选中。
  send(harness, updateMessage(rows, { revealCell: [4000, 1] }));
  const document = harness.window.document;
  const cell = document.querySelector('tbody td.cell[data-row="4000"][data-col="1"]');
  assert.ok(cell !== null, '目标行已渲染');
  assert.equal(cell.classList.contains('active-cell'), true, '目标格成为当前格');
  assert.equal(cell.classList.contains('selected'), true, '目标格进入选区');
  assert.match(document.getElementById('status').textContent, /B4001/);
  // 应用成功要回报，宿主据此停止重推。
  assert.ok(
    harness.posted.some(entry => entry.type === 'revealAck'),
    '视图回传 revealAck',
  );
});

test('点击列号行只选中整列，不触发排序', () => {  const harness = createHarness();
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
  // jsdom 既没有排版也没有命中测试，这里给第 3 行一个确定的矩形并让命中测试落到它上面。
  // 选中行会重建正文，所以每次重建后都要重新给新节点装上替身。
  const mockDropRow = () => {
    const drop = document.querySelectorAll('tbody tr')[2];
    drop.getBoundingClientRect = () => ({
      top: 52,
      bottom: 78,
      height: 26,
      left: 0,
      right: 300,
      width: 300,
    });
    document.elementFromPoint = () => drop.querySelector('td.cell');
  };
  mockDropRow();

  const handle = document.querySelector('tbody td.rownum[data-row="1"]');
  handle.dispatchEvent(
    new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 30 }),
  );
  mockDropRow();
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

test('设定锁定行列后给前几行几列加上粘性偏移', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  const rowsInput = document.getElementById('freeze-rows');
  const columnsInput = document.getElementById('freeze-columns');
  rowsInput.value = '2';
  columnsInput.value = '1';
  rowsInput.dispatchEvent(new harness.window.Event('change', { bubbles: true }));
  columnsInput.dispatchEvent(new harness.window.Event('change', { bubbles: true }));

  const frozenRows = document.querySelectorAll('tbody tr.frozen-row');
  assert.equal(frozenRows.length, 2);
  // 固定表头高 30px，行高 26px；粘性偏移写在单元格上。
  assert.equal(frozenRows[0].querySelector('td').style.top, '30px');
  assert.equal(frozenRows[1].querySelector('td').style.top, '56px');

  const frozenCells = document.querySelectorAll('tbody tr:nth-child(3) td.frozen-column');
  assert.equal(frozenCells.length, 1, '只有第 1 列被锁定');
  assert.equal(frozenCells[0].style.left, '56px', '锁定列固定在行号列右侧');

  const headers = document.querySelectorAll('thead th.head-cell');
  assert.equal(headers[0].style.left, '56px');
  assert.equal(headers[1].style.left, '', '未锁定的列没有粘性偏移');

  // 锁定行整行、锁定列整列都算锁定区域，用于叠加淡色底纹。
  assert.equal(
    document.querySelectorAll('tbody tr:nth-child(1) td.frozen-cell').length,
    4,
    '锁定行的所有单元格（含行号列）都在锁定区域内',
  );
  assert.equal(
    document.querySelectorAll('tbody tr:nth-child(3) td.frozen-cell').length,
    1,
    '普通行里只有锁定列的单元格在锁定区域内',
  );
  assert.equal(document.querySelectorAll('thead th.frozen-cell').length, 1);
});

test('锁定单元格有独立的淡色底纹样式', () => {
  const css = readFileSync(path.join(PACKAGE_ROOT, 'media', 'main.css'), 'utf8');
  assert.match(css, /--frozen-tint: color-mix\(in srgb, var\(--vscode-foreground\)/, '按主题前景色生成叠加色');
  assert.match(css, /--frozen-tint: rgba\(/, '为不支持 color-mix 的引擎保留回退色');
  const start = css.indexOf('.csv-table td.frozen-cell');
  assert.ok(start >= 0, 'main.css 里应有 .frozen-cell 规则');
  const block = css.slice(css.indexOf('{', start), css.indexOf('}', start));
  assert.match(block, /background-image: linear-gradient\(var\(--frozen-tint\)/);
});

test('悬停不给任何行加底色，只有选中才有选中效果', () => {
  const css = readFileSync(path.join(PACKAGE_ROOT, 'media', 'main.css'), 'utf8');
  // 表格行上的 hover 规则一律不再改背景，鼠标划过时也就不会出现"预选中"；
  // 唯一保留的 tr:hover 是拖拽选中过程中的整行高亮，它只作用于已选中的单元格。
  const hoverRules = css.match(/\.csv-table[^{]*tr:hover[^{]*\{[^}]*\}/g) ?? [];
  for (const rule of hoverRules) {
    assert.match(rule, /td\.selected/, `悬停规则只能作用于已选中的单元格：${rule}`);
  }
  assert.equal(hoverRules.length, 1, '只剩拖拽选中期间的那一条 hover 高亮');
  assert.match(hoverRules[0], /\.selecting/);
});

test('选中整行时行号列一起变蓝', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const document = harness.window.document;
  document
    .querySelector('tbody td.rownum[data-row="1"]')
    .dispatchEvent(new harness.window.MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 40 }));
  document.dispatchEvent(new harness.window.MouseEvent('mouseup', { bubbles: true }));

  const rownum = document.querySelector('tbody td.rownum[data-row="1"]');
  assert.ok(rownum.classList.contains('selected'), '行号列属于整行选区');
  assert.equal(document.querySelectorAll('tbody td.cell.selected').length, 3, '该行三个数据单元格都选中');
  assert.equal(
    document.querySelector('tbody td.rownum[data-row="0"]').classList.contains('selected'),
    false,
    '其他行的行号列不受影响',
  );
  // 选中色必须能盖过行号列的粘性底色。
  const css = readFileSync(path.join(PACKAGE_ROOT, 'media', 'main.css'), 'utf8');
  assert.match(css, /\.csv-table td\.rownum\.selected/);
});

test('选中整列时顶部锁定的行一起变蓝', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { frozenRows: 2, frozenColumns: 1 }));
  const document = harness.window.document;
  assert.equal(document.querySelectorAll('tbody tr.frozen-row').length, 2);

  document
    .querySelector('thead th.head-cell[data-col="0"]')
    .dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));

  for (const row of document.querySelectorAll('tbody tr')) {
    assert.ok(
      row.querySelector('td.cell[data-col="0"]').classList.contains('selected'),
      '该列每一行都选中，锁定行也不例外',
    );
  }
  assert.equal(document.querySelectorAll('tbody tr.frozen-row td.frozen-column.selected').length, 2);
  assert.equal(
    document.querySelector('tbody td.cell[data-col="1"]').classList.contains('selected'),
    false,
    '相邻列不受影响',
  );
});

test('锁定行在滚动到很远处时依然渲染在最前面', async () => {
  const harness = createHarness();
  const rows = [['序号', '值']];
  for (let index = 0; index < 200; index += 1) {
    rows.push([String(index), 'x']);
  }
  send(harness, updateMessage(rows));
  const document = harness.window.document;
  const rowsInput = document.getElementById('freeze-rows');
  rowsInput.value = '3';
  rowsInput.dispatchEvent(new harness.window.Event('change', { bubbles: true }));

  const scroll = document.getElementById('scroll');
  scroll.scrollTop = 2000;
  scroll.dispatchEvent(new harness.window.Event('scroll', { bubbles: true }));
  // 滚动渲染用 requestAnimationFrame 节流。
  await new Promise(resolve => setTimeout(resolve, 60));

  const frozen = document.querySelectorAll('tbody tr.frozen-row');
  assert.equal(frozen.length, 3, '锁定的行始终渲染');
  assert.equal(frozen[0].getAttribute('data-display'), '0');
  assert.equal(frozen[2].querySelector('td').style.top, '82px');
  const rendered = document.querySelectorAll('tbody tr').length;
  assert.ok(rendered < 100, `只渲染窗口内的行，实际 ${rendered}`);
});

test('修改锁定数量会写回用户设置，编辑器回推的数量也会被应用', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  const rowsInput = harness.window.document.getElementById('freeze-rows');
  rowsInput.value = '2';
  rowsInput.dispatchEvent(new harness.window.Event('change', { bubbles: true }));
  const posted = harness.posted.filter(entry => entry.type === 'freeze').pop() as any;
  // 锁定数量交给编辑器写入用户设置，下次打开任意 CSV 都会沿用。
  assert.deepEqual(plain(posted), { type: 'freeze', frozenRows: 2, frozenColumns: 0 });

  // 编辑器按用户设置回推锁定数量，视图据此恢复。
  const restored = createHarness();
  send(restored, updateMessage(SAMPLE, { frozenRows: 1, frozenColumns: 2 }));
  assert.equal(restored.window.document.getElementById('freeze-rows').value, '1');
  assert.equal(restored.window.document.getElementById('freeze-columns').value, '2');
  assert.equal(restored.window.document.querySelectorAll('tbody tr.frozen-row').length, 1);
  assert.equal(
    restored.window.document.querySelectorAll('tbody tr:nth-child(2) td.frozen-column').length,
    2,
  );
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

test('Ctrl+C 复制单个选中单元格的内容', () => {
  const harness = createHarness();
  const clipboard = stubClipboard(harness.window);
  send(harness, updateMessage(SAMPLE));
  clickCell(harness, 1, 2);
  harness.window.document.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }),
  );
  assert.deepEqual(clipboard.written, ['berlin']);
});

test('拖动可以选出矩形区域，Ctrl+C 复制为 TSV', () => {
  const harness = createHarness();
  const clipboard = stubClipboard(harness.window);
  const widths: Record<string, number> = { 0: 140, 1: 140, 2: 140 };
  send(harness, updateMessage(SAMPLE, { viewState: { columnWidths: widths } }));
  const grid = stubGridGeometry(harness);
  dragOnGrid(harness, { row: 0, column: 0, x: centreOf(grid, 0, 0)[0], y: centreOf(grid, 0, 0)[1] }, {
    x: centreOf(grid, 2, 2)[0],
    y: centreOf(grid, 2, 2)[1],
  });
  const document = harness.window.document;
  assert.equal(document.querySelectorAll('tbody td.cell.selected').length, 9, '整个 3 × 3 矩形都在选区内');
  assert.equal(
    document.querySelector('tbody td.cell[data-row="2"][data-col="2"]').classList.contains('active-cell'),
    true,
    '焦点落在拖到的那一格上',
  );

  document.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }),
  );
  assert.deepEqual(clipboard.written, ['name\tage\tcity\nann\t31\tberlin\nbob\t9\tamsterdam']);
});

test('拖动之后补发的 click 不会把选区缩回一个单元格', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { viewState: { columnWidths: { 0: 140, 1: 140, 2: 140 } } }));
  const grid = stubGridGeometry(harness);
  dragOnGrid(harness, { row: 0, column: 0, x: centreOf(grid, 0, 0)[0], y: centreOf(grid, 0, 0)[1] }, {
    x: centreOf(grid, 1, 1)[0],
    y: centreOf(grid, 1, 1)[1],
  });
  const document = harness.window.document;
  document
    .querySelector('tbody td.cell[data-row="0"][data-col="0"]')
    .dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
  assert.equal(document.querySelectorAll('tbody td.cell.selected').length, 4, '选区保持在 2 × 2');
});

test('拖动中移动距离不足只算单击', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { viewState: { columnWidths: { 0: 140, 1: 140, 2: 140 } } }));
  const grid = stubGridGeometry(harness);
  const point = centreOf(grid, 1, 1);
  dragOnGrid(harness, { row: 1, column: 1, x: point[0], y: point[1] }, { x: point[0] + 2, y: point[1] });
  assert.equal(
    harness.window.document.querySelectorAll('tbody td.cell.selected').length,
    1,
    '没有超过阈值就还是单个单元格',
  );
});

test('Ctrl+V 直接粘贴到选中的单元格，并作为锚点铺开', async () => {
  const harness = createHarness();
  const clipboard = stubClipboard(harness.window);
  clipboard.read = 'x\ty';
  send(harness, updateMessage(SAMPLE));
  clickCell(harness, 1, 0);
  harness.window.document.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
  );
  // 视图先等浏览器的 paste 事件，等不到再去读剪贴板。
  await new Promise(resolve => setTimeout(resolve, 200));
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), {
    kind: 'setRange',
    row: 1,
    column: 0,
    values: [['x', 'y']],
  });
  // 粘完之后选区正好盖住刚写进去的那块内容。
  assert.equal(
    harness.window.document.querySelector('tbody td.cell[data-row="1"][data-col="1"]').classList.contains('active-cell'),
    true,
  );
});

test('浏览器随 paste 事件给出的文本可以直接粘贴', () => {
  const harness = createHarness();
  stubClipboard(harness.window);
  send(harness, updateMessage(SAMPLE));
  clickCell(harness, 1, 0);
  harness.window.document.dispatchEvent(
    new harness.window.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
  );
  dispatchPaste(harness, 'p\tq\nr\ts');
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), {
    kind: 'setRange',
    row: 1,
    column: 0,
    values: [
      ['p', 'q'],
      ['r', 's'],
    ],
  });
});

test('编辑器回传的剪贴板文本用于粘贴', () => {
  const harness = createHarness();
  stubClipboard(harness.window);
  send(harness, updateMessage(SAMPLE));
  clickCell(harness, 2, 1);
  send(harness, { type: 'clipboardText', text: 'one\ntwo\n' });
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), {
    kind: 'setRange',
    row: 2,
    column: 1,
    values: [['one'], ['two']],
  });
});

test('单值粘贴铺满整个选中区域', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { viewState: { columnWidths: { 0: 140, 1: 140, 2: 140 } } }));
  const grid = stubGridGeometry(harness);
  dragOnGrid(harness, { row: 0, column: 0, x: centreOf(grid, 0, 0)[0], y: centreOf(grid, 0, 0)[1] }, {
    x: centreOf(grid, 1, 1)[0],
    y: centreOf(grid, 1, 1)[1],
  });
  send(harness, { type: 'clipboardText', text: 'full' });
  const op = harness.posted.filter(message => message.type === 'op').pop();
  assert.deepEqual(plain(op?.op), {
    kind: 'setRange',
    row: 0,
    column: 0,
    values: [
      ['full', 'full'],
      ['full', 'full'],
    ],
  });
});

test('没有选区时粘贴只提示，不发出修改', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE));
  send(harness, { type: 'clipboardText', text: 'x' });
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);
  assert.match(harness.window.document.getElementById('status').textContent, /请先选中/);
});

test('只读表格拒绝粘贴', () => {
  const harness = createHarness();
  send(harness, updateMessage(SAMPLE, { truncated: true, readOnly: true }));
  clickCell(harness, 0, 0);
  send(harness, { type: 'clipboardText', text: 'x' });
  assert.deepEqual(plain(harness.posted.filter(message => message.type === 'op')), []);
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
