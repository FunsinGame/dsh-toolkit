import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * webview 布局与交互的「不变量」测试。
 *
 * 这里的断言很朴素（读源码文本），但它们各自对应一个真实踩过的坑：
 *
 * 1. flex 布局必须挂在 `#app` 上。写在 `body` 上而元素都在 `#app` 里时，
 *    `.panel{flex:1}`/`.player{flex:0}` 全部失效——内容少时播放栏浮在页面中间，
 *    内容多时被裁掉（播放栏消失）。
 * 2. 「加入收藏夹」浮层必须有 `max-height`，否则收藏夹一多，确定/取消被顶出可视区。
 * 3. 点击播放必须先 `pause()` 当前音频再请求，否则用户点了没反应（旧歌继续响）。
 */

const root = process.cwd();
const css = readFileSync(join(root, 'media', 'sidebar.css'), 'utf8');
const js = readFileSync(join(root, 'media', 'sidebar.js'), 'utf8');

/** 取出某个选择器的规则体（够用即可，不做完整 CSS 解析）。 */
function ruleBody(source: string, selector: string): string {
  const index = source.indexOf(`${selector} {`);
  assert.notEqual(index, -1, `CSS 里找不到 ${selector} 规则`);
  const end = source.indexOf('}', index);
  return source.slice(index, end);
}

test('flex 布局挂在 #app 上，而不是 body', () => {
  const app = ruleBody(css, '#app');
  assert.match(app, /display:\s*flex/);
  assert.match(app, /flex-direction:\s*column/);
  assert.match(app, /height:\s*100%/);
  assert.match(app, /min-height:\s*0/);

  const body = ruleBody(css, 'body');
  assert.doesNotMatch(body, /display:\s*flex/, 'body 不该再承载布局');
});

test('面板占满剩余空间、播放栏固定在底部', () => {
  assert.match(ruleBody(css, '.panel'), /flex:\s*1 1 auto/);
  assert.match(ruleBody(css, '.panel'), /min-height:\s*0/);
  assert.match(ruleBody(css, '.player'), /flex:\s*0 0 auto/);
  // 播放栏不能靠 absolute 定位（否则会飘）。
  assert.doesNotMatch(ruleBody(css, '.player'), /position:\s*absolute/);
});

test('「加入收藏夹」浮层高度受限、按钮固定、列表自己滚动', () => {
  const overlay = ruleBody(css, '.overlay');
  assert.match(overlay, /max-height:/, '没有高度上限时按钮会被顶出可视区');
  assert.match(overlay, /display:\s*flex/);
  assert.match(ruleBody(css, '.overlay .results'), /overflow-y:\s*auto/);
  assert.match(ruleBody(css, '.overlay-actions'), /flex:\s*0 0 auto/);
  // 按钮那一行必须在滚动区之外
  assert.match(js, /class="row overlay-actions"/);
});

test('点击播放先停当前音频，再请求宿主（用户立刻有反馈）', () => {
  const start = js.indexOf('function play(track, list) {');
  assert.notEqual(start, -1, 'play(track, list) 的签名变了？');
  const body = js.slice(start, js.indexOf('\n}', start));
  const pauseAt = body.indexOf('audio.pause()');
  const postAt = body.indexOf("post({ type: 'play', track");
  assert.notEqual(pauseAt, -1, '必须先暂停当前音频');
  assert.notEqual(postAt, -1, '必须把播放请求发给宿主');
  assert.ok(pauseAt < postAt, '暂停要发生在请求之前');
  assert.match(body, /loadingTrack = track/, '要记住正在加载的是哪一首');
  // 列表里点歌要把整份列表交给宿主当队列，否则「下一首」没有意义。
  assert.match(body, /queue: list/, '要带上来源列表作为播放队列');
});

test('加载态在成功与失败两条路径上都会被清掉', () => {
  // playerSource 到达：清掉等待态
  const sourceCase = js.slice(js.indexOf("case 'playerSource':"));
  assert.match(sourceCase.slice(0, 800), /loadingTrack = null/);
  // 出错 toast：也要清掉，否则会一直转圈
  const toastCase = js.slice(js.indexOf("case 'toast':"));
  assert.match(toastCase.slice(0, 600), /loadingTrack = null/);
});

test('设置页提供缓存占用与清空入口', () => {
  // 五个页签里有「设置」，面板与按钮都在
  assert.match(js, /data-tab="settings"/);
  assert.match(js, /id="panel-settings"/);
  assert.match(js, /id="cache-usage"/);
  assert.match(js, /id="cache-clear"/);
  assert.match(js, /id="cache-bar"/);
  // 切到设置页时去要一次数据
  assert.match(js, /command === 'showTab'/);
  assert.match(js, /if \(target === 'settings'\) post\(\{ type: 'settings\.get' \}\)/);
  // 清空前必须走原生确认
  const clearHandler = js.slice(js.indexOf("$('cache-clear')"));
  assert.match(clearHandler.slice(0, 400), /requestConfirm/);
  assert.match(clearHandler.slice(0, 400), /post\(\{ type: 'cache\.clear' \}\)/);
  // 占用条要有样式
  assert.match(ruleBody(css, '.bar'), /height:/);
  assert.match(ruleBody(css, '.bar-fill'), /width:/);
});

test('播放栏提供音量与倍速控制（与控制按钮同一行）', () => {
  // 三个控件都在播放栏里
  assert.match(js, /id="volume"[^>]*type="range"/);
  assert.match(js, /id="mute-toggle"/);
  assert.match(js, /id="rate"/);
  // 音量与倍速并进控制行，不再单独占一行（省高度）
  const controls = ruleBody(css, '.controls');
  assert.match(controls, /display:\s*flex/);
  assert.match(controls, /flex-wrap:\s*nowrap|gap:\s*4px/, '控制行要紧凑');
  assert.match(ruleBody(css, '.controls #volume'), /flex:\s*1 1 56px/, '音量滑块占据剩余宽度');
  assert.doesNotMatch(js, /id="player-extra"/, '不该再有单独的第三行容器');
  assert.doesNotMatch(css, /grid-template-areas:[^}]*extra extra/, '网格里不该再有 extra 行');
  // 时间挪到标题行右侧
  const meta = ruleBody(css, '.meta');
  assert.match(meta, /display:\s*flex/);
  assert.match(ruleBody(css, '.meta-text'), /flex:\s*1 1 auto/);
  // 「恢复声音」提示单独一行
  assert.match(ruleBody(css, '.unmute'), /grid-area:\s*hint/);
  assert.match(ruleBody(css, '.player'), /'hint hint'/);

  // 音量拖动即时生效并防抖写回设置
  const volumeHandler = js.slice(js.indexOf("$('volume').addEventListener"));
  assert.match(volumeHandler.slice(0, 600), /audio\.volume = value \/ 100/);
  assert.match(volumeHandler.slice(0, 600), /scheduleVolumePersist/);
  assert.match(js, /key: 'volume'/);
  // 倍速写回设置并即时应用
  const rateHandler = js.slice(js.indexOf("$('rate').addEventListener"));
  assert.match(rateHandler.slice(0, 400), /applyRate\(value\)/);
  assert.match(rateHandler.slice(0, 400), /playbackRate/);
  // 换 src 之后速率可能被重置，loadedmetadata 上要重新应用
  const loaded = js.slice(js.indexOf("audio.addEventListener('loadedmetadata'"));
  assert.match(loaded.slice(0, 300), /applyRate\(configuredRate\)/);
  assert.match(loaded.slice(0, 300), /applyVolume\(configuredVolume\)/);
});

test('列表行不给整行绑点击：按钮各管各的', () => {
  // 整行绑点击会让「+」没点准时变成「播放并接管整个列表」——用户以为只加了一首。
  assert.doesNotMatch(
    js,
    /li\.addEventListener\('click', \(\) => play\(track, tracks\)\)/,
    '搜索结果行不该整行绑播放',
  );
  assert.doesNotMatch(
    js,
    /li\.addEventListener\('click', \(\) => play\(track, favoriteItems\)\)/,
    '收藏夹行不该整行绑播放',
  );
  // 改为只绑缩略图与标题区
  assert.match(js, /const playArea = \[li\.querySelector\('\.thumb'\), li\.querySelector\('\.info'\)\]/);
  // 「+」只发单首入队，且带诊断日志（便于区分「加一首」与「接管整列」）
  const addHandler = js.slice(js.indexOf("li.querySelector('.add-one').addEventListener"));
  assert.match(addHandler.slice(0, 400), /enqueue\(track\)/);
  assert.match(addHandler.slice(0, 400), /加入队列（单首/);
});

test('收藏夹勾选面板：只有用户点 ★ 才弹出', () => {
  // 操作完成后的状态刷新不能把面板再弹出来（这正是「点确定后又弹一次」的原因）
  assert.match(js, /let membershipWantOpen = false/);
  assert.match(js, /if \(membershipWantOpen\) \{/);
  const closeHandler = js.slice(js.indexOf('function closeMembership()'));
  assert.match(closeHandler.slice(0, 400), /membershipWantOpen = false/);
  const favHandler = js.slice(js.indexOf("li.querySelector('.fav-one').addEventListener"));
  assert.match(favHandler.slice(0, 300), /membershipWantOpen = true/);
});
