/**
 * 拖动行列移动之后的选区：用 `vscode` 替身直接驱动真实会话。
 *
 * 移动会改掉行 / 列的序号，而视图手里只有移动前的序号；会话必须把「被移动的那
 * 一段现在落在哪」随更新消息下发（`selectRange`），否则视图只能把选区留在原来
 * 那个序号上，用户看到的就变成别的行 / 列了。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';

import { parseCsv } from '../csv/csv';
import { createSessionHarness, type FakeView, type Posted } from './sessionHarness';

/** 临时表的内容：一行表头 + 五行数据。 */
const ROWS = [
  ['id', 'name'],
  ['1', 'ann'],
  ['2', 'bob'],
  ['3', 'cid'],
  ['4', 'dot'],
  ['5', 'eve'],
];

const DIR = mkdtempSync(path.join(os.tmpdir(), 'dsh-csv-move-'));
const FILE = path.join(DIR, 'table.csv');
writeFileSync(FILE, ROWS.map(row => row.join(',')).join('\n') + '\n', 'utf8');

after(() => rmSync(DIR, { recursive: true, force: true }));

/**
 * 打开一份视图并等它就绪。
 *
 * @returns 视图替身；之前那几条消息已经清掉。
 */
async function openView(): Promise<FakeView> {
  const harness = createSessionHarness();
  const view = harness.open(FILE);
  await view.send({ type: 'ready' });
  view.messages.length = 0;
  return view;
}

/**
 * 取最后一条更新消息。
 *
 * @param view - 视图替身。
 * @returns 最后一条 `update` 消息。
 */
function lastUpdate(view: FakeView): Posted {
  const updates = view.messages.filter(message => message.type === 'update');
  assert.ok(updates.length > 0, '会话应当推送更新');
  return updates[updates.length - 1];
}

/**
 * 文档里每一行的第一列。
 *
 * @param view - 视图替身。
 * @returns 各行的 `id` 列，用来确认移动真的写回了文档。
 */
function ids(view: FakeView): string[] {
  return parseCsv(view.text(), { delimiter: ',' }).rows.map(row => row[0]);
}

test('拖动整行移动之后，被移动的行在新的位置上继续是选区', async () => {
  const view = await openView();
  // 文档行：0 表头、1 ann、2 bob、3 cid、4 dot、5 eve。
  // 把 bob 拖到 dot 之后（落点 5）：摘掉自己之后它落在第 4 行。
  await view.send({ type: 'op', opId: 1, op: { kind: 'moveRows', indices: [2], to: 5 } });

  assert.deepEqual(lastUpdate(view).selectRange, { axis: 'row', from: 4, to: 4 });
  assert.deepEqual(ids(view), ['id', '1', '3', '4', '2', '5'], 'bob 真的排到了 dot 后面');
});

test('整块拖动多行时给出被移动的那一段', async () => {
  const view = await openView();
  await view.send({ type: 'op', opId: 1, op: { kind: 'moveRows', indices: [1, 2], to: 5 } });

  assert.deepEqual(lastUpdate(view).selectRange, { axis: 'row', from: 3, to: 4 });
  assert.deepEqual(ids(view), ['id', '3', '4', '1', '2', '5']);
});

test('菜单里的上移 / 下移一行同样给出新的行号', async () => {
  const view = await openView();
  await view.send({ type: 'op', opId: 1, op: { kind: 'moveRow', from: 2, to: 4 } });

  assert.deepEqual(lastUpdate(view).selectRange, { axis: 'row', from: 4, to: 4 });
  assert.deepEqual(ids(view), ['id', '1', '3', '4', '2', '5']);
});

test('拖动整列移动之后给出新的列区间', async () => {
  const view = await openView();
  await view.send({ type: 'op', opId: 1, op: { kind: 'moveColumns', indices: [0], to: 2 } });

  assert.deepEqual(lastUpdate(view).selectRange, { axis: 'column', from: 1, to: 1 });
  assert.deepEqual(parseCsv(view.text(), { delimiter: ',' }).rows[0], ['name', 'id']);
});

test('新区间只在这一次更新里带一次', async () => {
  const view = await openView();
  await view.send({ type: 'op', opId: 1, op: { kind: 'moveRows', indices: [1], to: 3 } });
  assert.notEqual(lastUpdate(view).selectRange, undefined, '移动那一次带着新区间');

  // 紧接着的普通修改与移动无关，不该再顺手改选区。
  view.messages.length = 0;
  await view.send({ type: 'op', opId: 2, op: { kind: 'setCell', row: 1, column: 1, value: 'zoe' } });
  assert.equal(lastUpdate(view).selectRange, undefined);

  // 重新加载文档推的更新也一样。
  view.messages.length = 0;
  await view.send({ type: 'ready' });
  assert.equal(lastUpdate(view).selectRange, undefined);
});
