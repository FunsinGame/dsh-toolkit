/**
 * 侧边栏文件树的分层逻辑。
 *
 * 这一层不碰文件系统也不碰 `vscode.TreeItem`，因此可以直接断言「扫到这些文件
 * 之后，树上每一层应该出现什么」。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type * as vscode from 'vscode';

import {
  baseName,
  childFolderPaths,
  childNodesOf,
  folderKey,
  isDirectChild,
  parentPath,
  relativeToFolder,
  relativeUriPath,
  rootNodes,
  segmentsOf,
  sortNodes,
  stateKey,
  type CsvEntry,
  type FileNode,
  type FolderNode,
} from '../views/treeModel';

/**
 * 造一个只带名字和路径的工作区文件夹。
 *
 * @param name - 文件夹名字。
 * @param path - 文件夹路径。
 * @returns 满足模型需要的最小对象。
 */
function folder(name: string, path: string): vscode.WorkspaceFolder {
  return {
    uri: { toString: () => `file://${path}`, path, scheme: 'file' },
    name,
    index: 0,
  } as unknown as vscode.WorkspaceFolder;
}

/**
 * 造一个条目。
 *
 * @param owner - 所属工作区文件夹。
 * @param relativePath - 相对路径。
 * @returns 该文件在树模型里的条目。
 */
function entry(owner: vscode.WorkspaceFolder, relativePath: string): CsvEntry {
  return {
    folder: owner,
    relativePath,
    key: `file://${owner.uri.path}/${relativePath}`,
  };
}

/**
 * 取出某一层的显示名字。
 *
 * @param nodes - 该层节点。
 * @returns 名字数组，顺序即显示顺序。
 */
function labels(nodes: readonly { readonly label: string }[]): string[] {
  return nodes.map(node => node.label);
}

test('路径分段与父路径', () => {
  assert.deepEqual(segmentsOf('a/b/c.csv'), ['a', 'b', 'c.csv']);
  assert.deepEqual(segmentsOf('c.csv'), ['c.csv']);
  assert.equal(parentPath('a/b/c.csv'), 'a/b');
  assert.equal(parentPath('c.csv'), '');
  assert.equal(baseName('a/b/c.csv'), 'c.csv');
  assert.equal(baseName('c.csv'), 'c.csv');
});

test('只有直接子项才算某个目录的孩子', () => {
  const owner = folder('samples', '/ws/samples');
  assert.equal(isDirectChild(entry(owner, 'a.csv'), ''), true);
  assert.equal(isDirectChild(entry(owner, 'cfg/a.csv'), ''), false);
  assert.equal(isDirectChild(entry(owner, 'cfg/a.csv'), 'cfg'), true);
  assert.equal(isDirectChild(entry(owner, 'cfg/deep/a.csv'), 'cfg'), false);
});

test('子目录逐层登记，而不是把整棵子树摊平', () => {
  const owner = folder('samples', '/ws/samples');
  const entries = [
    entry(owner, 'top.csv'),
    entry(owner, 'cfg/a.csv'),
    entry(owner, 'cfg/deep/b.csv'),
    entry(owner, 'other/c.csv'),
  ];
  assert.deepEqual(childFolderPaths(entries, '').sort(), ['cfg', 'other']);
  assert.deepEqual(childFolderPaths(entries, 'cfg'), ['cfg/deep']);
  assert.deepEqual(childFolderPaths(entries, 'cfg/deep'), []);
});

test('同一层里文件夹排在文件前面，其余按中文顺序', () => {
  const owner = folder('samples', '/ws/samples');
  const nodes = childNodesOf(
    [entry(owner, 'b.csv'), entry(owner, 'a.csv'), entry(owner, '配置/z.csv')],
    owner,
    '',
  );
  assert.deepEqual(labels(nodes), ['配置', 'a.csv', 'b.csv']);
  assert.equal(nodes[0].kind, 'folder');
});

test('数字后缀按数值排序，而不是按字符', () => {
  const owner = folder('samples', '/ws/samples');
  const nodes = childNodesOf(
    [entry(owner, 'item10.csv'), entry(owner, 'item2.csv')],
    owner,
    '',
  );
  assert.deepEqual(labels(nodes), ['item2.csv', 'item10.csv']);
});

test('一棵树按工作区逐层展开', () => {
  const owner = folder('samples', '/ws/samples');
  const entries = [
    entry(owner, 'people.csv'),
    entry(owner, '配置/技能.csv'),
    entry(owner, '配置/深层/掉落.csv'),
  ];

  const roots = rootNodes(entries);
  assert.equal(roots.length, 1);
  assert.deepEqual(labels(roots), ['samples']);

  const top = childNodesOf(entries, owner, '');
  assert.deepEqual(labels(top), ['配置', 'people.csv']);
  assert.equal((top[0] as FolderNode).path, '配置');

  const second = childNodesOf(entries, owner, '配置');
  assert.deepEqual(labels(second), ['深层', '技能.csv']);

  const third = childNodesOf(entries, owner, '配置/深层');
  assert.deepEqual(labels(third), ['掉落.csv']);
  assert.equal((third[0] as FileNode).relativePath, '配置/深层/掉落.csv');
});

test('文件节点的键与扫描结果一致，根节点按工作区去重', () => {
  const owner = folder('samples', '/ws/samples');
  const entries = [entry(owner, 'a.csv'), entry(owner, 'b.csv')];
  const roots = rootNodes(entries);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].key, folderKey(owner, ''));

  const top = childNodesOf(entries, owner, '');
  assert.deepEqual(
    top.map(node => node.key),
    entries.map(item => item.key),
  );
});

test('多工作区互不串层', () => {
  const first = folder('one', '/ws/one');
  const second = folder('two', '/ws/two');
  const entries = [entry(first, 'cfg/a.csv'), entry(second, 'b.csv')];

  assert.deepEqual(labels(rootNodes(entries)), ['one', 'two']);
  assert.deepEqual(labels(childNodesOf(entries, first, '')), ['cfg']);
  assert.deepEqual(labels(childNodesOf(entries, second, '')), ['b.csv']);
  assert.deepEqual(labels(childNodesOf(entries, first, 'cfg')), ['a.csv']);
});

test('空条目没有根节点', () => {
  assert.deepEqual(rootNodes([]), []);
  assert.deepEqual(childNodesOf([], folder('samples', '/ws/samples'), ''), []);
});

test('排序不会改动原数组，占位节点排最后', () => {
  const owner = folder('samples', '/ws/samples');
  const nodes = childNodesOf([entry(owner, 'a.csv'), entry(owner, 'cfg/b.csv')], owner, '');
  const snapshot = [...nodes];
  const sorted = sortNodes([...nodes].reverse());
  assert.deepEqual(labels(sorted), labels(nodes));
  assert.deepEqual(labels(nodes), labels(snapshot));
});

test('相对路径按工作区文件夹切分', () => {
  assert.equal(relativeToFolder('C:\\ws\\samples\\a.csv', 'C:\\ws\\samples'), 'a.csv');
  assert.equal(relativeToFolder('/ws/samples/cfg/a.csv', '/ws/samples'), 'cfg/a.csv');
  assert.equal(relativeToFolder('/ws/samples/', '/ws/samples'), undefined);
  assert.equal(relativeToFolder('/ws/other/a.csv', '/ws/samples'), undefined);
});

test('资源路径的大小写差异不影响归属判断（Windows 盘符大小写回归）', () => {
  // findFiles 返回的是小写盘符，workspaceFolder.uri.path 是大写盘符。
  assert.equal(
    relativeUriPath(
      '/c:/g-workspace/deepseek-harness/测试/Datas/buff_效果.csv',
      '/C:/g-workspace/deepseek-harness/测试',
    ),
    'Datas/buff_效果.csv',
  );
  assert.equal(relativeUriPath('/C:/ws/one/a.csv', '/C:/WS/one'), 'a.csv');
  // 百分号编码会被解码，树上的名字才是中文而不是 %E6%B5%8B%E8%AF%95。
  assert.equal(
    relativeUriPath('/c%3A/ws/%E6%B5%8B%E8%AF%95/a.csv', '/c%3a/ws/%E6%B5%8B%E8%AF%95'),
    'a.csv',
  );
});

test('不属于该文件夹的资源会被排除', () => {
  assert.equal(relativeUriPath('/c:/ws/other/a.csv', '/C:/ws/one'), undefined);
  assert.equal(relativeUriPath('/C:/ws/one', '/C:/ws/one'), undefined);
  assert.equal(relativeUriPath('/C:/ws/one/a.csv', '/C:/ws/one/'), 'a.csv');
});

test('占位节点标识带原因', () => {
  assert.notEqual(stateKey('scanning'), stateKey('empty'));
});
