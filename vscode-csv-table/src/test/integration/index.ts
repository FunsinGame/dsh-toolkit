/**
 * 扩展宿主测试的入口。
 *
 * `@vscode/test-electron` 会在扩展宿主里载入本模块并调用 `run()`，由它驱动
 * Mocha 执行编译后的集成测试。
 */

import * as path from 'node:path';

import Mocha from 'mocha';

/**
 * 运行集成测试。
 *
 * @returns 只要有用例失败就 reject 的 Promise。
 */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });
  mocha.addFile(path.resolve(__dirname, 'extension.test.js'));
  return new Promise<void>((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} 个集成测试失败。`));
      } else {
        resolve();
      }
    });
  });
}
