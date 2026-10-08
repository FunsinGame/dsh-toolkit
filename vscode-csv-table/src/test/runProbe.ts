/**
 * 在真实的 VS Code 里跑一个一次性诊断脚本。
 *
 * 用法：`node out/test/runProbe.js [工作区目录] [脚本名，默认 scanProbe]`
 *
 * 与集成测试的区别在于工作区：集成测试固定用 `samples/`，而这里可以把任意目录
 * 当作工作区打开，用来复现「某个目录下的 CSV 扫不到」这类问题。
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runTests } from '@vscode/test-electron';

/**
 * 启动 VS Code 并载入诊断脚本。
 *
 * @returns 诊断脚本执行完毕时兑现的 Promise。
 */
async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..', '..');
  const workspace = path.resolve(process.argv[2] ?? path.join(root, 'samples'));
  const scenario = process.argv[3] ?? 'scanProbe';
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.VSCODE_IPC_HOOK_CLI;

  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: pathToFileURL(path.join(__dirname, 'probe', `${scenario}.js`)).toString(),
    launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'],
  });
}

main().catch(error => {
  console.error('诊断失败：', error);
  process.exit(1);
});
