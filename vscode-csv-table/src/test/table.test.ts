/**
 * 表格操作：修改、排序、过滤与表头识别。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyOp,
  columnCount,
  compareCellValues,
  detectHeader,
  EMPTY_FILTER,
  filterRows,
  sortRows,
  toNumber,
  withDelimiter,
  type RowFilter,
} from '../csv/table';

/**
 * 为测试构造过滤条件。
 *
 * @param overrides - 要覆盖的字段。
 * @returns 该过滤条件。
 */
function filter(overrides: Partial<RowFilter> = {}): RowFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

const TABLE = [
  ['name', 'age', 'city'],
  ['ann', '31', 'berlin'],
  ['bob', '9', 'amsterdam'],
  ['cid', '105', 'Ankara'],
];

test('setCell 替换一个值并补齐该行', () => {
  const rows = applyOp([['a']], { kind: 'setCell', row: 0, column: 2, value: 'z' });
  assert.deepEqual(rows, [['a', '', 'z']]);
});

test('setCell 忽略越界的行', () => {
  const rows = applyOp([['a']], { kind: 'setCell', row: 5, column: 0, value: 'z' });
  assert.deepEqual(rows, [['a']]);
});

test('setRow 替换整行', () => {
  const rows = applyOp(TABLE, { kind: 'setRow', row: 1, values: ['x'] });
  assert.deepEqual(rows[1], ['x']);
  assert.deepEqual(TABLE[1], ['ann', '31', 'berlin'], '入参不会被改动');
});

test('insertRows 在指定位置插入空行', () => {
  const rows = applyOp(TABLE, { kind: 'insertRows', index: 1, count: 2, width: 3 });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[1], ['', '', '']);
  assert.deepEqual(rows[2], ['', '', '']);
  assert.deepEqual(rows[3], ['ann', '31', 'berlin']);
});

test('insertRows 把越界的序号夹到末尾', () => {
  const rows = applyOp([['a']], { kind: 'insertRows', index: 9, count: 1, width: 1 });
  assert.deepEqual(rows, [['a'], ['']]);
});

test('deleteRows 只删除一次并忽略重复序号', () => {
  const rows = applyOp(TABLE, { kind: 'deleteRows', indices: [1, 1, 3, 99] });
  assert.deepEqual(rows, [TABLE[0], TABLE[2]]);
});

test('deleteRows 没有有效序号时返回副本', () => {
  const rows = applyOp(TABLE, { kind: 'deleteRows', indices: [-1] });
  assert.deepEqual(rows, TABLE);
  assert.notEqual(rows, TABLE);
});

test('moveRow 调整一行的位置', () => {
  const rows = applyOp(TABLE, { kind: 'moveRow', from: 3, to: 1 });
  assert.deepEqual(
    rows.map(row => row[0]),
    ['name', 'cid', 'ann', 'bob'],
  );
});

test('moveRows 把多行整体移到目标位置', () => {
  const rows = applyOp(TABLE, { kind: 'moveRows', indices: [1, 2], to: 4 });
  assert.deepEqual(
    rows.map(row => row[0]),
    ['name', 'cid', 'ann', 'bob'],
  );
});

test('moveRows 支持移动到最前面', () => {
  const rows = applyOp(TABLE, { kind: 'moveRows', indices: [2, 3], to: 0 });
  assert.deepEqual(
    rows.map(row => row[0]),
    ['bob', 'cid', 'name', 'ann'],
  );
});

test('moveRows 忽略越界与重复序号', () => {
  const rows = applyOp(TABLE, { kind: 'moveRows', indices: [4, -1, 1, 1], to: 3 });
  assert.deepEqual(
    rows.map(row => row[0]),
    ['name', 'bob', 'ann', 'cid'],
  );
});

test('moveRows 没有有效序号时返回副本', () => {
  const rows = applyOp(TABLE, { kind: 'moveRows', indices: [9], to: 0 });
  assert.deepEqual(rows, TABLE);
  assert.notEqual(rows, TABLE);
});

test('insertColumns 拓宽每一行，包括较短的行', () => {
  const rows = applyOp([['a', 'b'], ['c']], { kind: 'insertColumns', index: 1, count: 1 });
  assert.deepEqual(rows, [
    ['a', '', 'b'],
    ['c', ''],
  ]);
});

test('deleteColumns 从每一行删除该列', () => {
  const rows = applyOp(TABLE, { kind: 'deleteColumns', indices: [1] });
  assert.deepEqual(rows[0], ['name', 'city']);
  assert.deepEqual(rows[3], ['cid', 'Ankara']);
});

test('moveColumns 把整列移到新的位置', () => {
  const rows = applyOp(TABLE, { kind: 'moveColumns', indices: [0], to: 2 });
  assert.deepEqual(rows[0], ['age', 'name', 'city']);
  assert.deepEqual(rows[3], ['105', 'cid', 'Ankara']);
});

test('moveColumns 可以一次移动多列', () => {
  const rows = applyOp(TABLE, { kind: 'moveColumns', indices: [0, 1], to: 3 });
  assert.deepEqual(rows[0], ['city', 'name', 'age']);
  assert.deepEqual(rows[1], ['berlin', 'ann', '31']);
});

test('moveColumns 会像插入列一样为较短的行补空', () => {
  const rows = applyOp([['a', 'b', 'c'], ['x']], { kind: 'moveColumns', indices: [2], to: 0 });
  assert.deepEqual(rows, [
    ['c', 'a', 'b'],
    ['', 'x', ''],
  ]);
});

test('initGrid 生成一个空的矩形', () => {
  assert.deepEqual(applyOp([], { kind: 'initGrid', columns: 2, rows: 2 }), [
    ['', ''],
    ['', ''],
  ]);
});

test('clearRange 清空一个矩形区域', () => {
  const rows = applyOp(TABLE, {
    kind: 'clearRange',
    rowStart: 1,
    rowEnd: 2,
    columnStart: 1,
    columnEnd: 1,
  });
  assert.deepEqual(rows[1], ['ann', '', 'berlin']);
  assert.deepEqual(rows[2], ['bob', '', 'amsterdam']);
  assert.deepEqual(rows[3], TABLE[3], '区域之外的行不受影响');
});

test('setDelimiter 不改动任何单元格', () => {
  assert.deepEqual(applyOp(TABLE, { kind: 'setDelimiter', delimiter: ';' }), TABLE);
});

test('columnCount 返回最宽的一行', () => {
  assert.equal(columnCount([['a'], ['a', 'b', 'c', 'd'], []]), 4);
});

test('toNumber 接受普通数字与科学计数法', () => {
  assert.equal(toNumber(' 12.5 '), 12.5);
  assert.equal(toNumber('-3'), -3);
  assert.equal(toNumber('1e3'), 1000);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('1,000'), null);
  assert.equal(toNumber('1.2.3'), null);
});

test('compareCellValues 数字按数值、文本按自然顺序比较', () => {
  assert.ok(compareCellValues('9', '10') < 0);
  assert.ok(compareCellValues('item2', 'item10') < 0);
  assert.ok(compareCellValues('5', 'apple') < 0, '数字排在文本之前');
});

test('sortRows 按数值而不是文本排序', () => {
  const rows = sortRows(TABLE, 1, 'asc', true);
  assert.deepEqual(
    rows.map(row => row[1]),
    ['age', '9', '31', '105'],
  );
});

test('sortRows 固定表头，并按方向反转', () => {
  const rows = sortRows(TABLE, 1, 'desc', true);
  assert.deepEqual(rows[0], TABLE[0]);
  assert.deepEqual(
    rows.map(row => row[1]),
    ['age', '105', '31', '9'],
  );
});

test('sortRows 在无表头时对所有行排序', () => {
  const rows = sortRows(
    [
      ['b', '2'],
      ['a', '1'],
    ],
    0,
    'asc',
    false,
  );
  assert.deepEqual(rows, [
    ['a', '1'],
    ['b', '2'],
  ]);
});

test('sortRows 在两个方向上都把空单元格排在最后', () => {
  const rows = [['k'], ['b'], [''], ['a']];
  assert.deepEqual(
    sortRows(rows, 0, 'asc', false).map(row => row[0]),
    ['a', 'b', 'k', ''],
  );
  assert.deepEqual(
    sortRows(rows, 0, 'desc', false).map(row => row[0]),
    ['k', 'b', 'a', ''],
  );
});

test('sortRows 对相同的键保持稳定', () => {
  const rows = [
    ['k', 'id'],
    ['same', '1'],
    ['same', '2'],
    ['same', '3'],
  ];
  assert.deepEqual(
    sortRows(rows, 0, 'asc', true).map(row => row[1]),
    ['id', '1', '2', '3'],
  );
});

test('filterRows 用「包含」匹配每一列', () => {
  const result = filterRows(TABLE, filter({ query: 'a' }), 1);
  assert.deepEqual(result.indices, [1, 2, 3]);
  assert.equal(result.error, undefined);
});

test('filterRows 默认不区分大小写', () => {
  assert.deepEqual(filterRows(TABLE, filter({ query: 'ANKARA' }), 1).indices, [3]);
  assert.deepEqual(
    filterRows(TABLE, filter({ query: 'ANKARA', caseSensitive: true }), 1).indices,
    [],
  );
});

test('filterRows 支持「等于」与「开头是」', () => {
  assert.deepEqual(filterRows(TABLE, filter({ query: 'bob', mode: 'equals' }), 1).indices, [2]);
  assert.deepEqual(
    filterRows(TABLE, filter({ query: 'b', mode: 'startsWith' }), 1).indices,
    [1, 2],
  );
});

test('filterRows 报告非法的正则表达式', () => {
  const result = filterRows(TABLE, filter({ query: '([', mode: 'regex' }), 1);
  assert.deepEqual(result.indices, []);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

test('单列过滤只约束该列', () => {
  const result = filterRows(TABLE, filter({ columns: { 2: 'a' } }), 1);
  assert.deepEqual(result.indices, [2, 3]);
});

test('单列过滤会收窄公共关键词的匹配', () => {
  const result = filterRows(TABLE, filter({ query: 'ann', columns: { 2: 'berlin' } }), 1);
  assert.deepEqual(result.indices, [1]);
  const missed = filterRows(TABLE, filter({ query: 'bob', columns: { 2: 'berlin' } }), 1);
  assert.deepEqual(missed.indices, []);
});

test('表头行永远不会被匹配', () => {
  const result = filterRows(TABLE, filter({ query: 'name' }), 1);
  assert.deepEqual(result.indices, []);
});

test('detectHeader 能识别数字数据之上的文本首行', () => {
  assert.equal(detectHeader(TABLE), true);
  assert.equal(detectHeader([['1', '2'], ['3', '4']]), false);
  assert.equal(detectHeader([['only']]), false);
  assert.equal(detectHeader([]), false);
});

test('withDelimiter 会把书写方式标记为已选定', () => {
  const dialect = withDelimiter(
    { delimiter: ',', eol: '\n', bom: false, trailingEol: true, detected: true },
    ';',
  );
  assert.equal(dialect.delimiter, ';');
  assert.equal(dialect.detected, false);
});
