/**
 * 「定位到引用表」的宿主侧链路：用 `vscode` 的替身直接驱动真实会话。
 *
 * 这里覆盖的关键分歧是「被引用的表**已经打开**」这一支：那张表不会再新建会话、
 * 也不会再发 `ready`，宿主必须找到它已经存在的会话，把定位投过去。真实 VS Code
 * 里 webview 的 DOM 在扩展宿主里看不到，所以这里用替身面板接住宿主发出的消息，
 * 断言它到底发给了哪一份视图、带的是什么行列（替身见 `sessionHarness.ts`）。
 */

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

import { parseCsv, serializeCsv } from '../csv/csv';
import { createSessionHarness } from './sessionHarness';

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const SAMPLES = path.join(PACKAGE_ROOT, 'samples', '测试', 'Datas');

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
  const harness = createSessionHarness();
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
  const harness = createSessionHarness();
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
  const harness = createSessionHarness();
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
  const harness = createSessionHarness();
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
