/**
 * 公式引擎：解析、求值，以及用仓库里的样例配表验证真实效果。
 *
 * 除了纯函数层面的用例，这里还直接读 `samples/测试/Datas` 里的
 * `buff_效果.csv` 与 `本地化/Language_CN_42_HeroBuff.csv`，确保「D 列显示语言表
 * 里的 value」这条最常用的链路是通的。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

import { parseCsv } from '../csv/csv';
import {
  bindSites,
  collectFormulaPaths,
  evaluateFormula,
  firstDataRowOf,
  isFormulaText,
  normalizeFormulaPath,
  parseFormula,
  resolveColumnIndex,
  resolveFormulas,
  type FormulaTable,
  type ParsedFormula,
} from '../csv/formula';

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const SAMPLES = path.join(PACKAGE_ROOT, 'samples', '测试', 'Datas');

/**
 * 读一个样例 CSV。
 *
 * @param relative - 相对 `samples/测试/Datas` 的路径。
 * @returns 解析后的表。
 */
function sample(relative: string): FormulaTable {
  const text = readFileSync(path.join(SAMPLES, relative), 'utf8');
  const table = parseCsv(text, { delimiter: 'auto' });
  return { rows: table.rows, firstDataRow: firstDataRowOf(table.rows) };
}

/** 语言表：`##var` 里 id/value 在第 1、2 列，数据从第 4 行开始。 */
const LANGUAGE: FormulaTable = {
  rows: [
    ['##var', 'id', 'value'],
    ['##type', 'string', 'string'],
    ['##group', '', 'c'],
    ['##', '', '文本内容'],
    ['', 'hero_buff_name_42000001', '庇护'],
    ['', 'hero_buff_name_42000002', '天使光环'],
  ],
  firstDataRow: 4,
};

/**
 * 组一个可用的求值上下文。
 *
 * @param tables - 路径 → 表。
 * @returns 上下文。
 */
function contextWith(tables: Record<string, FormulaTable>) {
  return { external: new Map(Object.entries(tables)) };
}

/**
 * 把公式放到本表的一格里求值。
 *
 * @param rows - 本文件的行；公式所在行若没写，会自动补进这一格。
 * @param text - 公式文本。
 * @param row - 公式所在的行。
 * @param column - 公式所在的列。
 * @param tables - 路径 → 被引用的表。
 * @returns 求值结果。
 */
function at(
  rows: readonly (readonly string[])[],
  text: string,
  row: number,
  column: number,
  tables: Record<string, FormulaTable> = { 'lang.csv': LANGUAGE },
) {
  const grid = rows.map(line => line.slice());
  const line = grid[row] ?? [];
  while (line.length <= column) {
    line.push('');
  }
  line[column] = text;
  const site = bindSites(grid).find(entry => entry.row === row && entry.column === column);
  assert.ok(site !== undefined, `应当能绑定公式：${text}`);
  return evaluateFormula(site, contextWith(tables), grid);
}

/**
 * 解析一条公式，解析失败时直接让测试失败。
 *
 * @param text - 公式文本。
 * @returns 解析结果。
 */
function parsed(text: string): ParsedFormula {
  const formula = parseFormula(text);
  assert.ok(formula !== null, `应当能解析：${text}`);
  return formula;
}

test('识别公式文本', () => {
  assert.equal(isFormulaText('=LOOKUP("a", "b", "c", "d")'), true);
  assert.equal(isFormulaText('='), false);
  assert.equal(isFormulaText('普通文本'), false);
  assert.equal(isFormulaText(''), false);
  assert.equal(isFormulaText('a=b'), false);
});

test('归一化公式路径', () => {
  assert.equal(normalizeFormulaPath('.\\本地化\\Language.csv'), '本地化/language.csv');
  assert.equal(normalizeFormulaPath('  ./a/b.csv '), 'a/b.csv');
  assert.equal(normalizeFormulaPath('A\\B.CSV'), 'a/b.csv');
});

test('解析四种引用公式', () => {
  assert.deepEqual(parsed('=LOOKUP("本地化/Language_CN_42_HeroBuff.csv", "id", this, "value")'), {
    kind: 'lookup',
    path: '本地化/Language_CN_42_HeroBuff.csv',
    keyColumn: 'id',
    keyArgument: { kind: 'this' },
    valueColumn: 'value',
  });
  assert.deepEqual(parsed('=LOOKUP("lang.csv", "id", B5, "value")'), {
    kind: 'lookup',
    path: 'lang.csv',
    keyColumn: 'id',
    keyArgument: { kind: 'reference', text: 'B5' },
    valueColumn: 'value',
  });
  assert.deepEqual(parsed('=LOOKUP("lang.csv", "id", "k1", "value")'), {
    kind: 'lookup',
    path: 'lang.csv',
    keyColumn: 'id',
    keyArgument: { kind: 'literal', text: 'k1' },
    valueColumn: 'value',
  });
  assert.deepEqual(parsed('=REF("lang.csv", "id", "value")'), {
    kind: 'ref',
    path: 'lang.csv',
    keyColumn: 'id',
    valueColumn: 'value',
  });
  assert.deepEqual(parsed('=REF("lang.csv", "id", C5, "value")'), {
    kind: 'ref',
    path: 'lang.csv',
    keyColumn: 'id',
    valueColumn: 'value',
    valueArgument: { kind: 'reference', text: 'C5' },
  });
  assert.deepEqual(parsed('=CELL("lang.csv", "B12")'), {
    kind: 'cell',
    path: 'lang.csv',
    cell: 'B12',
  });
  assert.deepEqual(parsed('=SUM("lang.csv", "value", "id", "x")'), {
    kind: 'sum',
    path: 'lang.csv',
    valueColumn: 'value',
    keyColumn: 'id',
    keyArgument: { kind: 'literal', text: 'x' },
  });
  assert.deepEqual(parsed('=FILTER("lang.csv", "value", "id", "x", "{值}({行})")'), {
    kind: 'filter',
    path: 'lang.csv',
    valueColumn: 'value',
    keyColumn: 'id',
    keyArgument: { kind: 'literal', text: 'x' },
    template: '{值}({行})',
  });
});

test('大小写与空白不影响解析', () => {
  assert.deepEqual(parsed('  = lookup( "lang.csv" , "id" , this , "value" )  '), {
    kind: 'lookup',
    path: 'lang.csv',
    keyColumn: 'id',
    keyArgument: { kind: 'this' },
    valueColumn: 'value',
  });
});

test('写错的公式解析为 null，保持原文显示', () => {
  for (const text of [
    '=LOOKUP("a", "b")',
    '=LOOKUP("a", "b", "c", "d", "e")',
    '=UNKNOWN("a")',
    '=LOOKUP',
    '=REF("a")',
    '=REF("a", "b", "c", "d", "e")',
    '=LOOKUP("a", "b", "c"',
    '=CELL("a")',
    '=CELL("a", "不是单元格")',
    '=FILTER("a", "b", "c")',
  ]) {
    assert.equal(parseFormula(text), null, `${text} 应当解析失败`);
  }
});

test('按列名、列标与序号都能定位列', () => {
  assert.equal(resolveColumnIndex(LANGUAGE, 'id'), 1);
  assert.equal(resolveColumnIndex(LANGUAGE, 'value'), 2);
  assert.equal(resolveColumnIndex(LANGUAGE, 'B'), 1);
  assert.equal(resolveColumnIndex(LANGUAGE, '#3'), 2);
  assert.equal(resolveColumnIndex(LANGUAGE, 'nope'), null);
  // 没有 ## 行时退回表头行。
  const plain: FormulaTable = { rows: [['名称', '数量'], ['a', '1']], firstDataRow: 1 };
  assert.equal(resolveColumnIndex(plain, '数量'), 1);
});

test('=LOOKUP 用字面量、this 与本表单元格当键', () => {
  // 公式写在 C 列（放显示结果），`id` 列在 B 列。
  const rows = [
    ['##var', 'id', '名字'],
    ['', 'hero_buff_name_42000002', ''],
  ];
  const literal = '=LOOKUP("lang.csv", "id", "hero_buff_name_42000002", "value")';
  assert.deepEqual(at(rows, literal, 1, 2), { value: '天使光环', error: '' });
  // `this` 指「与本表同名列（id，B 列）在本行的值」，所以不关心公式写在哪一列。
  assert.deepEqual(at(rows, '=LOOKUP("lang.csv", "id", this, "value")', 1, 2), {
    value: '天使光环',
    error: '',
  });
  // 也可以直接引用本表的一格。
  assert.deepEqual(at(rows, '=LOOKUP("lang.csv", "id", B2, "value")', 1, 2), {
    value: '天使光环',
    error: '',
  });
});

test('=REF 用本行本列的值当键', () => {
  // 公式写在 C 列，键列是 B 列（与 id 列同名）。
  const rows = [['##var', 'id', '名字'], ['', 'hero_buff_name_42000001', '']];
  assert.deepEqual(at(rows, '=REF("lang.csv", "id", "value")', 1, 2), {
    value: '庇护',
    error: '',
  });
  const missing = [['##var', 'id', '名字'], ['', '不存在', '']];
  assert.match(at(missing, '=REF("lang.csv", "id", "value")', 1, 2).error, /没有找到匹配的行/);
});

test('=CELL 按文档行号取单元格', () => {
  const rows = [['##var', 'id'], ['', 'x']];
  assert.deepEqual(at(rows, '=CELL("lang.csv", "C5")', 1, 1), { value: '庇护', error: '' });
  assert.match(at(rows, '=CELL("lang.csv", "C99")', 1, 1).error, /单元格越界/);
});

test('%C 只写列：行号取公式所在的行', () => {
  const table: FormulaTable = {
    rows: [
      ['##var', 'id', '名称ID', '名字'],
      ['', '61001', 'hero_buff_name_42000001', '=REF("lang.csv", "id", %C, "value")'],
      ['', '61002', 'hero_buff_name_42000002', '=REF("lang.csv", "id", %C, "value")'],
    ],
    firstDataRow: 1,
  };
  const result = resolveFormulas(table.rows, table.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(result.columns[3], [null, '庇护', '天使光环']);
  assert.deepEqual(result.errors, []);
  // 列名写法等价。
  assert.deepEqual(at(table.rows, '=REF("lang.csv", "id", %"名称ID", "value")', 1, 3), {
    value: '庇护',
    error: '',
  });
  // `=LOOKUP` 的键值参数同样支持。
  assert.deepEqual(at(table.rows, '=LOOKUP("lang.csv", "id", %C, "value")', 2, 3), {
    value: '天使光环',
    error: '',
  });
});

test('%C 写的公式整列一样，行被移动后依然对上', () => {
  const formula = '=REF("lang.csv", "id", %C, "value")';
  const build = (order: number[]): FormulaTable => ({
    rows: [
      ['##var', 'id', '名称ID', '名字'],
      ...order.map(key => ['', String(61000 + key), `hero_buff_name_4200000${key}`, formula]),
    ],
    firstDataRow: 1,
  });

  const before = resolveFormulas(build([1, 2]).rows, 1, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(before.columns[3], [null, '庇护', '天使光环']);

  // 把「天使光环」那一行拖到最前面：公式文本一个字都没改。
  const after = resolveFormulas(build([2, 1]).rows, 1, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(after.columns[3], [null, '天使光环', '庇护']);

  // 对比：写死行号的 `C2` 在行移动之后会读到别的行的键。
  const fixed: FormulaTable = {
    rows: [
      ['##var', 'id', '名称ID', '名字'],
      ['', '61002', 'hero_buff_name_42000002', '=REF("lang.csv", "id", C2, "value")'],
      ['', '61001', 'hero_buff_name_42000001', ''],
    ],
    firstDataRow: 1,
  };
  const fixedResult = resolveFormulas(fixed.rows, fixed.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  assert.equal(fixedResult.columns[3][1], '天使光环', 'C2 永远指向第 2 行');
});

test('=SUM 与 =FILTER 汇总所有匹配行', () => {
  const numbers: FormulaTable = {
    rows: [['##var', 'key', 'amount'], ['', 'a', '1'], ['', 'a', '2'], ['', 'b', '5']],
    firstDataRow: 1,
  };
  const rows = [['##var', 'key'], ['', 'a']];
  assert.deepEqual(
    at(rows, '=SUM("n.csv", "amount", "key", "a")', 1, 1, { 'n.csv': numbers }),
    { value: '3', error: '' },
  );
  assert.deepEqual(
    at(rows, '=FILTER("n.csv", "amount", "key", "a", "{值}")', 1, 1, { 'n.csv': numbers }),
    { value: '1；2', error: '' },
  );
  assert.match(
    at(rows, '=SUM("n.csv", "amount", "key", "zzz")', 1, 1, { 'n.csv': numbers }).error,
    /没有找到匹配的行/,
  );
});

test('引用不到的文件与列给出中文原因', () => {
  const rows = [['##var', 'id'], ['', 'x']];
  assert.match(
    at(rows, '=REF("missing.csv", "id", "value")', 1, 1, {}).error,
    /未找到被引用的文件/,
  );
  assert.match(
    at(rows, '=LOOKUP("lang.csv", "nope", "x", "value")', 1, 1).error,
    /未找到列：nope/,
  );
});

test('collectFormulaPaths 去重并保持书写原样', () => {
  const rows = [
    ['=REF("a.csv", "id", "value")', '=REF("./A.csv", "id", "value")'],
    ['=LOOKUP("b.csv", "id", "x", "value")', ''],
  ];
  assert.deepEqual(collectFormulaPaths(rows), ['a.csv', 'b.csv']);
  assert.deepEqual(collectFormulaPaths([['普通', '文本']]), []);
});

test('叶子公式与列级 =REF 混合时逐格求值', () => {
  const table: FormulaTable = {
    rows: [
      ['##var', 'id', '名字', 'text'],
      ['', 'k1', '=REF("lang.csv", "id", "value")', ''],
      ['', 'k2', '=REF("lang.csv", "id", "value")', ''],
      ['', 'hero_buff_name_42000001', '=LOOKUP("lang.csv", "id", this, "value")', ''],
    ],
    firstDataRow: 1,
  };
  const result = resolveFormulas(table.rows, table.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(result.columns[2], [null, null, null, '庇护']);
  assert.equal(result.errors.length, 2, 'k1 / k2 都取不到，各报一次');
  assert.match(result.errors[0], /第 2 行第 C 列/);
  assert.match(result.errors[1], /第 3 行第 C 列/);
});

test('=REF 的键取「本表里与键列同名的列」的本行值', () => {
  const table: FormulaTable = {
    rows: [
      ['##var', 'id', '名字'],
      ['', 'hero_buff_name_42000001', '=REF("lang.csv", "id", "value")'],
    ],
    firstDataRow: 1,
  };
  const result = resolveFormulas(table.rows, table.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(result.columns[2], [null, '庇护']);
  assert.deepEqual(result.errors, []);

  const missing: FormulaTable = {
    rows: [
      ['##var', 'id', '名字'],
      ['', '不存在', '=REF("lang.csv", "id", "value")'],
    ],
    firstDataRow: 1,
  };
  const missingResult = resolveFormulas(
    missing.rows,
    missing.firstDataRow,
    contextWith({ 'lang.csv': LANGUAGE }),
  );
  assert.equal(missingResult.columns[2][1], null, '取不到时保持公式原文');
  assert.match(missingResult.errors[0], /没有找到匹配的行：不存在/);
});

test('=REF 整列简写：写一格就对该列每一行生效', () => {
  const table: FormulaTable = {
    rows: [
      ['##var', 'id', '名字'],
      ['', 'hero_buff_name_42000001', '=REF("lang.csv", "id", "value")'],
      ['', 'hero_buff_name_42000002', ''],
      ['', '', ''],
    ],
    firstDataRow: 1,
  };
  const result = resolveFormulas(table.rows, table.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  assert.deepEqual(result.columns[2], [null, '庇护', '天使光环', null]);
  // 键为空的那一行报错，其余两行正常。
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /第 4 行第 C 列：引用行为空/);
});

test('4 参数 =REF 用写出来的键值，只作用于自己一格', () => {
  const table: FormulaTable = {
    rows: [
      ['##var', 'id', 'name', 'text'],
      ['', '61001', 'hero_buff_name_42000001', '=REF("lang.csv", "id", C2, "value")'],
      ['', '61002', 'hero_buff_name_42000002', ''],
      [
        '',
        '61003',
        'hero_buff_name_42000003',
        '=REF("lang.csv", "id", "hero_buff_name_42000002", "value")',
      ],
    ],
    firstDataRow: 1,
  };
  const result = resolveFormulas(table.rows, table.firstDataRow, contextWith({ 'lang.csv': LANGUAGE }));
  // 第 1 行：键取自本表第 2 行 C 列；第 3 行：键是字面量。
  assert.deepEqual(result.columns[3], [null, '庇护', null, '天使光环']);
  assert.deepEqual(result.errors, []);
});

test('样例配表：用一列的语言 key 去 Language_CN_42 取 value', () => {
  const buff = sample('buff_效果.csv');
  const language = sample(path.join('本地化', 'Language_CN_42_HeroBuff.csv'));
  // 第一行是列定义（样例里直接写成 `##`，等价于 `##var`），所以 id/name 在第 2、3 列。
  assert.equal(resolveColumnIndex(buff, 'id'), 1);
  assert.equal(resolveColumnIndex(buff, 'name'), 2);
  assert.equal(resolveColumnIndex(language, 'id'), 1);
  assert.equal(resolveColumnIndex(language, 'value'), 2);
  assert.equal(firstDataRowOf(buff.rows), 4, '## 开头的四行是元数据');
  assert.equal(buff.rows[4][2], 'hero_buff_name_42000001', '第一行数据的 name 是语言 key');

  // 拿本行（第 5 行）C 列的 key 去语言表的 id 列里查，取 value 显示。
  const formulaText = '=REF("本地化/Language_CN_42_HeroBuff.csv", "id", C5, "value")';
  const rows = buff.rows.map(row => row.slice());
  rows[4][3] = formulaText;
  const result = resolveFormulas(rows, firstDataRowOf(rows), {
    external: new Map([[normalizeFormulaPath('本地化/Language_CN_42_HeroBuff.csv'), language]]),
  });
  const languageRow = language.rows.find(row => row[1] === buff.rows[4][2]);
  assert.ok(languageRow !== undefined, '语言表里应当有这条 key');
  assert.equal(result.columns[3][4], languageRow[2], 'D 列显示语言表里对应的 value');
  // 整列都是同一份公式，所以每一行都有对应的显示值。
  assert.equal(result.columns[3].length, rows.length);
  assert.equal(result.columns[3][6], '弱攻', '同一列其它行也各取各的');
  assert.equal(result.columns[3][0], null, '元数据行没写公式');
  for (const error of result.errors) {
    assert.match(error, /没有找到匹配的行/);
  }
});

test('样例配表：D 列已经配好 =REF 公式，整列都用 %C 不写行号', () => {
  const buff = sample('buff_效果.csv');
  const language = sample(path.join('本地化', 'Language_CN_42_HeroBuff.csv'));
  const firstData = firstDataRowOf(buff.rows);

  // 仓库里的这份样例已经配好了公式，而且整列是**同一份文本**（`%C` 不写行号）。
  const texts = new Set<string>();
  for (let index = firstData; index < buff.rows.length; index += 1) {
    texts.add(buff.rows[index][3]);
  }
  assert.equal(texts.size, 1, '数据行的 D 列公式完全相同，不随行号变化');
  assert.match(
    [...texts][0],
    /^=REF\("本地化\/Language_CN_42_HeroBuff\.csv", "id", %C, "value"\)$/,
  );
  for (let index = 0; index < firstData; index += 1) {
    assert.doesNotMatch(buff.rows[index][3], /^=/, '元数据行的 D 列没有公式');
  }

  const result = resolveFormulas(buff.rows, firstData, {
    external: new Map([[normalizeFormulaPath('本地化/Language_CN_42_HeroBuff.csv'), language]]),
  });
  const resolved = result.columns[3];
  const localized = resolved.filter(value => typeof value === 'string');
  assert.ok(localized.length > 50, `大部分行都取到了多语言文本，实际 ${localized.length} 行`);
  // 第一行数据的 name 是 hero_buff_name_42000001，语言表里对应「庇护」。
  const languageRow = language.rows.find(row => row[1] === buff.rows[4][2]);
  assert.ok(languageRow !== undefined, '语言表里应当有这条 key');
  assert.equal(resolved[4], languageRow[2]);
  // 元数据行没写公式，保持原文显示。
  assert.equal(resolved[0], null);
});
