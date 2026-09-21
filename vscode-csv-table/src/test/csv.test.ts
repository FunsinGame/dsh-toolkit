/**
 * 解析器与序列化器的行为。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectDelimiter, parseCsv, serializeCsv, type CsvDialect } from '../csv/csv';

/**
 * 为序列化测试构造一个书写方式。
 *
 * @param overrides - 要覆盖的字段。
 * @returns 该书写方式。
 */
function dialect(overrides: Partial<CsvDialect> = {}): CsvDialect {
  return {
    delimiter: ',',
    eol: '\n',
    bom: false,
    trailingEol: true,
    detected: true,
    ...overrides,
  };
}

test('解析普通表格', () => {
  const table = parseCsv('a,b,c\n1,2,3\n');
  assert.deepEqual(table.rows, [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
  assert.equal(table.dialect.delimiter, ',');
  assert.equal(table.dialect.eol, '\n');
  assert.equal(table.dialect.trailingEol, true);
});

test('缺少结尾换行也能正确解析', () => {
  const table = parseCsv('a,b\n1,2');
  assert.deepEqual(table.rows, [
    ['a', 'b'],
    ['1', '2'],
  ]);
  assert.equal(table.dialect.trailingEol, false);
});

test('读取含分隔符、引号与换行的带引号字段', () => {
  const text = 'name,note\n"Smith, Ann","said ""hi""\nthen left"\n';
  const table = parseCsv(text);
  assert.deepEqual(table.rows, [
    ['name', 'note'],
    ['Smith, Ann', 'said "hi"\nthen left'],
  ]);
});

test('未加引号的字段里的引号按字面处理', () => {
  const table = parseCsv('a,b\n12"x,3\n');
  assert.deepEqual(table.rows[1], ['12"x', '3']);
});

test('检测 CRLF 并在往返中保留', () => {
  const text = 'a,b\r\n1,2\r\n';
  const table = parseCsv(text);
  assert.equal(table.dialect.eol, '\r\n');
  assert.equal(serializeCsv(table.rows, table.dialect), text);
});

test('检测字节顺序标记并在写回时保留', () => {
  const text = '\uFEFFa,b\n1,2\n';
  const table = parseCsv(text);
  assert.equal(table.dialect.bom, true);
  assert.deepEqual(table.rows[0], ['a', 'b']);
  assert.equal(serializeCsv(table.rows, table.dialect), text);
});

test('空文档没有任何行', () => {
  const table = parseCsv('');
  assert.deepEqual(table.rows, []);
  assert.equal(serializeCsv(table.rows, table.dialect), '');
});

test('保留真正的空行', () => {
  const table = parseCsv('a,b\n\n1,2\n');
  assert.deepEqual(table.rows, [['a', 'b'], [''], ['1', '2']]);
});

test('保持参差不齐的行不被补齐', () => {
  const table = parseCsv('a,b,c\n1,2\n');
  assert.deepEqual(table.rows[1], ['1', '2']);
});

test('字段中含逗号时检测出分号', () => {
  const text = 'name;amount\n"Doe, John";1.5\n"Roe, Jane";2.5\n';
  assert.equal(detectDelimiter(text), ';');
  assert.equal(parseCsv(text).dialect.delimiter, ';');
});

test('检测制表符', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');
});

test('单列文件回退为逗号', () => {
  assert.equal(detectDelimiter('name\nfoo\nbar\n'), ',');
});

test('配置的分隔符优先于自动检测', () => {
  const table = parseCsv('a;b\n1;2\n', { delimiter: ';' });
  assert.equal(table.dialect.detected, false);
  assert.deepEqual(table.rows[1], ['1', '2']);
  const forced = parseCsv('a;b\n1;2\n', { delimiter: ',' });
  assert.deepEqual(forced.rows[1], ['1;2']);
});

test('只为确有需要的字段加引号', () => {
  const text = serializeCsv(
    [['plain', 'with,comma', 'with"quote', 'with\nbreak']],
    dialect({ trailingEol: false }),
  );
  assert.equal(text, 'plain,"with,comma","with""quote","with\nbreak"');
});

test('使用配置的换行符写出', () => {
  const text = serializeCsv(
    [
      ['a', 'b'],
      ['1', '2'],
    ],
    dialect({ eol: '\r\n' }),
  );
  assert.equal(text, 'a,b\r\n1,2\r\n');
});

test('解析与序列化的往返是稳定的', () => {
  const text = 'x,"y,z",w\n"multi\nline",2,3\n';
  const first = parseCsv(text);
  const again = parseCsv(serializeCsv(first.rows, first.dialect));
  assert.deepEqual(again.rows, first.rows);
  assert.equal(again.dialect.delimiter, first.dialect.delimiter);
  assert.equal(again.dialect.eol, first.dialect.eol);
});
