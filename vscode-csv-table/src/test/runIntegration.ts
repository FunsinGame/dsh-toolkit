/**
 * 启动一个装了本扩展的 VS Code，并运行扩展宿主集成测试。
 */

import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

/** 针对下载下来的 VS Code 运行集成测试。 */
async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..', '..');
  // 从 VS Code 扩展宿主继承来的终端会带上这两个变量：前者会让被启动的
  // Electron 退化成普通 Node 并拒绝启动参数，后者会让它把这些参数交给那个
  // 已经运行的宿主，而不是自己启动一个新实例。
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.VSCODE_IPC_HOOK_CLI;
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, 'integration', 'index.js'),
    launchArgs: [
      path.resolve(root, 'samples'),
      '--disable-extensions',
      '--disable-workspace-trust',
    ],
  });
}

main().catch(error => {
  console.error('集成测试失败：', error);
  process.exit(1);
});
