/**
 * 侧边栏文件树的层级模型。
 *
 * 这里只有纯函数：没有文件系统访问，也没有 `vscode.TreeItem`，输入是扫描出来的
 * 条目，输出是「某个节点下面有哪些子节点」。渲染留给 `csvTreeProvider.ts`，
 * 所以这一层可以直接用单元测试断言。
 */

import type * as vscode from 'vscode';

/** 一个将被列进树里的 CSV 文件。 */
export interface CsvEntry {
  /** 它属于哪个工作区文件夹。 */
  readonly folder: vscode.WorkspaceFolder;
  /** 相对所属工作区文件夹的路径，用 `/` 分隔。 */
  readonly relativePath: string;
  /** 稳定标识，也是 `TreeItem.id`。 */
  readonly key: string;
}

/** 树上的一层文件夹。 */
export interface FolderNode {
  readonly kind: 'folder';
  readonly key: string;
  readonly folder: vscode.WorkspaceFolder;
  /** 相对工作区的目录路径；工作区根目录是空串。 */
  readonly path: string;
  /** 显示在树上的名字。 */
  readonly label: string;
}

/** 树上的一个文件。 */
export interface FileNode {
  readonly kind: 'file';
  /** 扫描时该文件的资源字符串，同时也是 `TreeItem.id`。 */
  readonly key: string;
  readonly folder: vscode.WorkspaceFolder;
  readonly relativePath: string;
  readonly label: string;
}

/** 占位节点：正在扫描、一个 CSV 都没有，或者压根没打开工作区。 */
export interface StateNode {
  readonly kind: 'state';
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  /** 点击占位节点要执行的命令；纯提示时为 `undefined`。 */
  readonly command?: vscode.Command;
}

/** 树上的一个节点。 */
export type CsvTreeNode = FolderNode | FileNode | StateNode;

/** 扫描中 / 空工作区的占位节点标识前缀。 */
export const STATE_NODE_KEY = 'dshCsv:state';

/**
 * 把路径拆成各段。
 *
 * @param relativePath - 相对工作区、以 `/` 分隔的路径。
 * @returns 去掉空段之后的路径分段。
 */
export function segmentsOf(relativePath: string): string[] {
  return relativePath.split('/').filter(segment => segment !== '');
}

/**
 * 去掉路径的最后一段。
 *
 * @param relativePath - 相对工作区、以 `/` 分隔的路径。
 * @returns 父目录路径；已经在顶层时返回空串。
 */
export function parentPath(relativePath: string): string {
  const segments = segmentsOf(relativePath);
  segments.pop();
  return segments.join('/');
}

/**
 * 取出路径的最后一段。
 *
 * @param relativePath - 相对工作区、以 `/` 分隔的路径。
 * @returns 文件或文件夹的名字。
 */
export function baseName(relativePath: string): string {
  const segments = segmentsOf(relativePath);
  return segments.length > 0 ? segments[segments.length - 1] : relativePath;
}

/**
 * 生成文件夹节点的稳定标识。
 *
 * @param folder - 工作区文件夹。
 * @param path - 目录路径。
 * @returns 用于 `TreeItem.id` 的字符串。
 */
export function folderKey(folder: vscode.WorkspaceFolder, path: string): string {
  return `dshCsv:folder:${folder.uri.toString()}:${path}`;
}

/**
 * 生成占位节点的标识。
 *
 * @param reason - 为什么显示这个占位节点。
 * @returns 用于 `TreeItem.id` 的字符串。
 */
export function stateKey(reason: string): string {
  return `${STATE_NODE_KEY}:${reason}`;
}

/**
 * 判断路径分段是否以给定前缀开头。
 *
 * @param segments - 完整路径分段。
 * @param prefix - 前缀分段。
 * @returns 是否匹配。
 */
function startsWithSegments(segments: readonly string[], prefix: readonly string[]): boolean {
  if (segments.length < prefix.length) {
    return false;
  }
  return prefix.every((segment, index) => segments[index] === segment);
}

/**
 * 判断一个条目是不是某个目录的直接子项。
 *
 * 更深的层级不算，否则整棵子树都会挤在同一层。
 *
 * @param entry - 待判断的条目。
 * @param folderPath - 目录路径；工作区根目录用空串。
 * @returns 是否直接位于该目录下。
 */
export function isDirectChild(entry: CsvEntry, folderPath: string): boolean {
  return parentPath(entry.relativePath) === folderPath;
}

/**
 * 收集某个目录下的直接子文件夹路径。
 *
 * @param entries - 该工作区文件夹下的全部条目。
 * @param folderPath - 目录路径；工作区根目录用空串。
 * @returns 去重后的子目录路径。
 */
export function childFolderPaths(entries: readonly CsvEntry[], folderPath: string): string[] {
  const prefix = segmentsOf(folderPath);
  const paths = new Set<string>();
  for (const entry of entries) {
    const segments = segmentsOf(entry.relativePath);
    // 直接躺在这个目录里的文件不构成子目录；更深的目录只登记紧邻的一层，
    // 再深的等它自己展开时再登记。
    if (!startsWithSegments(segments, prefix) || segments.length <= prefix.length + 1) {
      continue;
    }
    paths.add(segments.slice(0, prefix.length + 1).join('/'));
  }
  return [...paths];
}

/**
 * 按中文、不区分大小写的顺序排列同一层节点。
 *
 * 文件夹始终排在文件前面。
 *
 * @param nodes - 同一层的节点。
 * @returns 排好序的新数组。
 */
export function sortNodes<T extends CsvTreeNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort((left, right) => {
    const leftRank = left.kind === 'folder' ? 0 : 1;
    const rightRank = right.kind === 'folder' ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.label.localeCompare(right.label, 'zh-CN', { numeric: true, sensitivity: 'base' });
  });
}

/**
 * 计算某个文件夹节点下的直接子节点。
 *
 * @param entries - 全部已扫描到的条目。
 * @param folder - 所属工作区文件夹。
 * @param folderPath - 目录路径；工作区根目录用空串。
 * @returns 排好序的子节点。
 */
export function childNodesOf(
  entries: readonly CsvEntry[],
  folder: vscode.WorkspaceFolder,
  folderPath: string,
): CsvTreeNode[] {
  const own = entries.filter(entry => entry.folder === folder);
  const folders: FolderNode[] = childFolderPaths(own, folderPath).map(path => ({
    kind: 'folder',
    key: folderKey(folder, path),
    folder,
    path,
    label: baseName(path),
  }));
  const files: FileNode[] = own
    .filter(entry => isDirectChild(entry, folderPath))
    .map(entry => ({
      kind: 'file',
      key: entry.key,
      folder,
      relativePath: entry.relativePath,
      label: baseName(entry.relativePath),
    }));
  return sortNodes([...folders, ...files]);
}

/**
 * 顶层节点：每个有 CSV 的工作区文件夹一个根。
 *
 * @param entries - 全部已扫描到的条目。
 * @returns 排好序的顶层节点。
 */
export function rootNodes(entries: readonly CsvEntry[]): CsvTreeNode[] {
  const folders = new Map<string, FolderNode>();
  for (const entry of entries) {
    const key = folderKey(entry.folder, '');
    if (!folders.has(key)) {
      folders.set(key, {
        kind: 'folder',
        key,
        folder: entry.folder,
        path: '',
        label: entry.folder.name,
      });
    }
  }
  return sortNodes([...folders.values()]);
}

/**
 * 判断相对路径转换成绝对路径后是否仍是绝对路径。
 *
 * @param value - `asRelativePath` 的返回值。
 * @returns 该值看起来是不是一个绝对路径。
 */
export function pathIsAbsolute(value: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(value);
}

/**
 * 从资源路径里取出相对工作区文件夹的路径。
 *
 * 比较必须是**大小写不敏感**的：在 Windows 上 `findFiles` 返回的路径是
 * `/c:/…`（盘符小写），而 `workspaceFolder.uri.path` 被规范化成 `/C:/…`
 * （盘符大写），严格比较会把所有文件都判成「不在工作区里」。
 *
 * @param uriPath - 文件的 `uri.path`（以 `/` 分隔，可能带百分号编码）。
 * @param folderPath - 工作区文件夹的 `uri.path`。
 * @returns 解码后的相对路径；不在该文件夹下时返回 `undefined`。
 */
export function relativeUriPath(uriPath: string, folderPath: string): string | undefined {
  const from = folderPath.replace(/\/+$/, '').toLowerCase();
  const prefix = `${from}/`;
  if (!uriPath.toLowerCase().startsWith(prefix)) {
    return undefined;
  }
  const relative = uriPath.slice(prefix.length);
  if (relative === '') {
    return undefined;
  }
  try {
    return decodeURIComponent(relative);
  } catch {
    return relative;
  }
}

/**
 * 从绝对路径里取出相对工作区文件夹的路径。
 *
 * 即使某个平台给出反斜杠，也在这里统一成 `/`。
 *
 * @param fsPath - 文件路径。
 * @param folderFsPath - 工作区文件夹路径。
 * @returns 相对路径；不在该工作区下时返回 `undefined`。
 */
export function relativeToFolder(fsPath: string, folderFsPath: string): string | undefined {
  const file = fsPath.replace(/\\/g, '/');
  const folder = folderFsPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const prefix = `${folder}/`;
  if (!file.startsWith(prefix)) {
    return undefined;
  }
  const relative = file.slice(prefix.length);
  return relative === '' ? undefined : relative;
}
