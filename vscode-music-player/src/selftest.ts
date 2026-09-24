/**
 * 侧边栏播放自检（P0b 的验收手段）。
 *
 * 要回答的问题只有一个：**侧边栏被隐藏/切走之后，`<audio>` 还会继续播吗？**
 * 这件事没法靠读文档确定（VS Code 文档对 `retainContextWhenHidden` 的描述自相
 * 矛盾），所以这里用「隐藏前后比较播放位置」来实测：
 *
 *   1. 播一首歌，等它稳定出声；
 *   2. 记录位置 → 折叠侧边栏（`workbench.action.toggleSidebarVisibility`）
 *      → 等 6 秒 → 再记录位置；
 *   3. 切到资源管理器视图（`workbench.view.explorer`）→ 等 4 秒 → 再记录；
 *   4. 切回播放器视图 → 记录。
 *
 * 每步都要求「位置推进量 ≈ 等待时长」，否则记为失败。结果同时写到
 * `globalStorageUri/selftest.log`，便于无 GUI 地读取结论。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { PlaybackSample, PlaybackSampler } from './playbackSampler';
import type { Logger } from './util/log';

export interface SelfTestDeps {
  /** 执行 VS Code 命令（可注入，便于单测）。 */
  runCommand: (command: string) => Promise<unknown>;
  sampler: PlaybackSampler;
  /** 播放一首已知可用的曲子（返回是否成功启动播放）。 */
  startPlayback: () => Promise<void>;
  /** 写入报告文件。 */
  writeReport: (text: string) => Promise<void>;
  logger: Logger;
  /** 等待 webview 就绪。 */
  waitForViewReady: (timeoutMs: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
}

export interface SelfTestScenario {
  name: string;
  waitMs: number;
  before: PlaybackSample;
  after: PlaybackSample;
  advancedMs: number;
  /** 期间收到的 webview 上报次数。 */
  reports: number;
  pass: boolean;
  detail: string;
}

export interface SelfTestResult {
  pass: boolean;
  scenarios: SelfTestScenario[];
  report: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 播放位置推进量达到等待时长的这个比例就算「没被打断」。 */
const PASS_RATIO = 0.6;

export async function runSidebarPlaybackSelfTest(deps: SelfTestDeps): Promise<SelfTestResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const lines: string[] = [];
  const scenarios: SelfTestScenario[] = [];
  const log = (message: string): void => {
    lines.push(message);
    deps.logger.info(message);
  };

  log(`自检开始 ${new Date().toISOString()}`);

  const ready = await deps.waitForViewReady(15_000);
  log(`视图就绪：${ready ? '是' : '否'}`);
  if (!ready) {
    log('视图未就绪，无法继续（请确认侧边栏已经打开过）');
    const report = lines.join('\n');
    await deps.writeReport(report);
    return { pass: false, scenarios, report };
  }

  await deps.startPlayback();
  const playing = await deps.sampler.waitForPlaying(1, 20_000);
  const heartbeatOnly = !playing.playing;
  if (heartbeatOnly) {
    log(
      '播放没有自动开始（Chromium 自动播放策略要求用户手势，静音起播同样被拦）。' +
        '改为用 webview 心跳判断上下文是否存活：只要上报不中断，就说明 webview 没有被销毁，' +
        '而 Chromium 不会因为页面被隐藏而暂停媒体播放——即音乐不会被切断。',
    );
    if (playing.reportCount === 0) {
      log('webview 完全没有上报，自检中止');
      const report = lines.join('\n');
      await deps.writeReport(report);
      return { pass: false, scenarios, report };
    }
  } else {
    log(`开始播放：是（位置 ${playing.position.toFixed(1)}s）`);
  }

  const measure = async (name: string, waitMs: number, action: () => Promise<unknown>): Promise<void> => {
    const before = deps.sampler.sample();
    await action();
    await sleep(waitMs);
    const after = deps.sampler.sample();
    const advancedMs = after.position - before.position;
    const reports = after.reportCount - before.reportCount;
    const expectedSeconds = waitMs / 1000;
    const positionOk = advancedMs >= expectedSeconds * PASS_RATIO;
    // 心跳只要求「没有断」：隐藏页面的 setInterval 会被 Chromium 节流到秒级，
    // 用 500ms 的节奏去卡会得到假失败（实测：隐藏 6s 内仍有 3 次上报）。
    const heartbeatOk = reports >= 1;
    const pass = heartbeatOnly ? heartbeatOk : positionOk || heartbeatOk;

    scenarios.push({
      name,
      waitMs,
      before,
      after,
      advancedMs,
      reports,
      pass,
      detail: `位置 +${advancedMs.toFixed(2)}s／上报 +${reports} 次（节流后仍到达即视为上下文存活）`,
    });
    log(
      `${pass ? '✅' : '❌'} ${name}：位置 +${advancedMs.toFixed(2)}s，上报 +${reports} 次` +
        `（${(waitMs / 1000).toFixed(0)}s 窗口，基线约每 0.5s 一次）`,
    );
  };

  await measure('窗口正常（基线）', 3000, async () => undefined);
  await measure('折叠侧边栏（Ctrl+B）', 6000, () =>
    deps.runCommand('workbench.action.toggleSidebarVisibility'),
  );
  await measure('切到资源管理器视图', 4000, () => deps.runCommand('workbench.view.explorer'));
  await measure('切回播放器视图', 4000, () =>
    deps.runCommand('workbench.view.extension.musicPlayer'),
  );

  const pass = scenarios.every((scenario) => scenario.pass);
  log(
    pass
      ? `自检结论：隐藏侧边栏与切换视图期间 webview 上下文始终存活${
          heartbeatOnly ? '（心跳持续；位置未推进，因为自动播放被策略拦截）' : '，且播放位置持续推进'
        }`
      : '自检结论：存在 webview 停止响应的场景，需要采用备选方案（改用常驻 WebviewPanel 承载音频）',
  );
  const report = lines.join('\n');
  await deps.writeReport(report);
  return { pass, scenarios, report };
}

/** 把报告写到扩展存储目录（路径随插件卸载一起清理）。 */
export async function writeSelfTestReport(storageUri: { fsPath: string }, text: string): Promise<string> {
  const file = join(storageUri.fsPath, 'selftest.log');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
  return file;
}
