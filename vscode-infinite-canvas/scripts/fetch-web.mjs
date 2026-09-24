/**
 * 把上游 infinite-canvas 的 web 前端构建产物同步到本扩展的 web/ 目录。
 *
 * 用法：
 *   node scripts/fetch-web.mjs                        # 克隆/更新上游默认分支并构建
 *   node scripts/fetch-web.mjs --ref v0.1.0           # 指定分支或 tag
 *   node scripts/fetch-web.mjs --repo <url>           # 指定 fork
 *   node scripts/fetch-web.mjs --source <目录>        # 直接用本地已克隆的仓库（不联网）
 *   node scripts/fetch-web.mjs --skip-build           # 只同步源码，不构建（调试用）
 *
 * `--source` 可以指向仓库根目录（自动用其下的 web/），也可以直接指向前端目录（含 package.json）。
 *
 * 构建需要 git 与 bun（上游 web/ 使用 bun）。
 * 产物写入 web/，并生成 web/vscode-infinite-canvas.json 记录版本与 commit。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webOutput = path.join(extensionRoot, "web");
const upstreamRepo = "https://github.com/basketikun/infinite-canvas.git";

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const repo = readFlag("--repo", upstreamRepo);
const ref = readFlag("--ref", "");
const workDir = readFlag("--workdir", path.join(os.tmpdir(), "vscode-infinite-canvas-upstream"));
const localSource = readFlag("--source", "");
const skipBuild = hasFlag("--skip-build");

/** 执行命令并在失败时抛出可读错误。 */
function run(command, commandArgs, cwd, label = command) {
    console.log(`[fetch:web] ${label}`);
    const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) throw new Error(`${label} 启动失败：${result.error.message}`);
    if (result.status !== 0) throw new Error(`${label} 失败，退出码 ${result.status}`);
}

function capture(command, commandArgs, cwd) {
    return execFileSync(command, commandArgs, { cwd, encoding: "utf8" }).trim();
}

/** 确认外部命令可用。 */
function requireCommand(command, hint) {
    const probe = spawnSync(command, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    if (probe.error || probe.status !== 0) {
        throw new Error(`找不到可用的 ${command}。${hint}`);
    }
}

/**
 * 解析本地克隆：既支持指向仓库根目录，也支持直接指向前端目录。
 */
function resolveLocalSource(value) {
    const resolved = path.resolve(value);
    if (!existsSync(resolved)) {
        throw new Error(`--source 指向的目录不存在：${resolved}`);
    }
    if (existsSync(path.join(resolved, "web", "package.json"))) {
        return { repoRoot: resolved, webSource: path.join(resolved, "web") };
    }
    if (existsSync(path.join(resolved, "package.json"))) {
        return { repoRoot: path.dirname(resolved), webSource: resolved };
    }
    throw new Error(`--source 目录里找不到 web/package.json：${resolved}`);
}

/** 克隆或更新上游仓库。 */
function syncUpstream() {
    requireCommand("git", "请先安装 git。");
    const gitDir = path.join(workDir, ".git");
    if (existsSync(gitDir)) {
        run("git", ["fetch", "--all", "--tags", "--prune"], workDir, "更新上游仓库");
        run("git", ["checkout", "--force", ref || "HEAD"], workDir, `检出 ${ref || "默认分支"}`);
        if (!ref) run("git", ["pull", "--ff-only"], workDir, "拉取最新提交");
    } else {
        mkdirSync(workDir, { recursive: true });
        const cloneArgs = ["clone", "--depth", "1"];
        if (ref) cloneArgs.push("--branch", ref);
        cloneArgs.push(repo, workDir);
        run("git", cloneArgs, undefined, `克隆 ${repo}`);
    }
    return capture("git", ["rev-parse", "HEAD"], workDir);
}

/** 读取某个仓库的当前 commit，读不到时返回 undefined。 */
function readCommit(repoRoot) {
    try {
        return capture("git", ["rev-parse", "HEAD"], repoRoot);
    } catch {
        return undefined;
    }
}

/** 构建上游 web 并复制产物。 */
function buildWeb(webSource) {
    if (!existsSync(path.join(webSource, "package.json"))) {
        throw new Error(`上游目录结构不符合预期，找不到 ${webSource}/package.json`);
    }

    if (!skipBuild) {
        requireCommand("bun", "上游 web/ 使用 bun 安装与构建，请先安装 bun：https://bun.sh");
        run("bun", ["install"], webSource, "安装前端依赖");
        run("bun", ["run", "build"], webSource, "构建前端");
    }

    const dist = path.join(webSource, "dist");
    if (!existsSync(path.join(dist, "index.html"))) {
        throw new Error(`构建产物缺失：${dist}/index.html`);
    }

    rmSync(webOutput, { recursive: true, force: true });
    cpSync(dist, webOutput, { recursive: true });
    console.log(`[fetch:web] 产物已写入 ${webOutput}`);
}

/** 读取上游 VERSION 文件。 */
function readUpstreamVersion(repoRoot) {
    const versionFile = path.join(repoRoot, "VERSION");
    return existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : undefined;
}

try {
    const local = localSource ? resolveLocalSource(localSource) : undefined;
    if (local) console.log(`[fetch:web] 使用本地克隆：${local.webSource}`);
    const repoRoot = local ? local.repoRoot : workDir;
    const commit = local ? readCommit(local.repoRoot) : syncUpstream();
    buildWeb(local ? local.webSource : path.join(workDir, "web"));
    const manifest = {
        // 只记录上游仓库地址，不写本地路径：manifest 会随产物一起分发，避免泄漏本机目录结构。
        repository: local ? upstreamRepo : repo,
        source: local ? "local-clone" : "remote-clone",
        commit: commit ? commit.slice(0, 12) : undefined,
        upstreamVersion: readUpstreamVersion(repoRoot),
        builtAt: new Date().toISOString(),
    };
    writeFileSync(path.join(webOutput, "vscode-infinite-canvas.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[fetch:web] 完成：${JSON.stringify(manifest)}`);
    console.log("[fetch:web] 提示：上游 README 声明数据格式可能随时变化，升级后请先导出画布备份。");
} catch (error) {
    console.error(`[fetch:web] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
