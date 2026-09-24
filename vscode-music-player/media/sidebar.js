/*
 * 侧边栏播放器 UI（P0b 最小可用版）。
 *
 * 这一版的目标只有一个：证明「搜索 → 点播 → 从回环代理出声 → 拖动进度条」这条
 * 链路真的能跑，并把播放状态实时回报给宿主（宿主才是权威状态，侧边栏被隐藏时
 * 也靠这些回报判断音乐有没有被中断）。
 *
 * P1 会把它换成完整界面（搜索 / 收藏夹 / 队列 / 账户四个页签），因此这里刻意
 * 保持最小：一个搜索框、一个结果列表、一个 <audio> 与一条状态栏。
 */
'use strict';

const vscode = acquireVsCodeApi();
const boot = window.__MUSIC_PLAYER_BOOT__ || {};

/* ------------------------------------------------------------------ DOM */

const app = document.getElementById('app');
app.innerHTML = `
  <div class="tabs">
    <button class="tab active" data-tab="search">搜索</button>
    <button class="tab" data-tab="favorites">收藏</button>
    <button class="tab" data-tab="queue">队列</button>
    <button class="tab" data-tab="account">账户</button>
    <button class="tab" data-tab="settings">设置</button>
  </div>

  <div class="panel" id="panel-search">
    <div class="search-row">
      <input id="keyword" type="search" placeholder="搜索 B 站视频 / 粘贴 BV 号" />
      <button id="search" title="搜索">搜索</button>
    </div>
    <div id="prepare" class="prepare hidden"></div>
    <ul id="results" class="results"></ul>
    <div id="empty" class="empty">输入关键词开始搜索</div>
    <div id="fav-add-panel" class="overlay hidden">
      <div class="overlay-title" id="fav-add-title">加入收藏夹</div>
      <ul id="fav-add-list" class="results"></ul>
      <div class="row overlay-actions">
        <button id="fav-add-ok" class="primary">确定</button>
        <button id="fav-add-cancel">取消</button>
      </div>
    </div>
  </div>

  <div class="panel hidden" id="panel-favorites">
    <div class="row">
      <button id="fav-refresh">刷新</button>
      <button id="fav-create-toggle" class="primary">新建收藏夹</button>
      <span class="hint" id="fav-status"></span>
    </div>
    <div id="fav-create-form" class="hidden">
      <input id="fav-title" placeholder="收藏夹名称" />
      <label class="hint checkbox"><input type="checkbox" id="fav-private" /> 私密收藏夹</label>
      <div class="row">
        <button id="fav-create-ok" class="primary">创建</button>
        <button id="fav-create-cancel">取消</button>
      </div>
    </div>
    <ul id="fav-list" class="results"></ul>
    <div id="fav-list-empty" class="empty">还没有收藏夹，或尚未登录</div>

    <div id="fav-contents" class="hidden">
      <div class="row">
        <button id="fav-back">← 返回</button>
        <span class="hint" id="fav-contents-title"></span>
      </div>
      <div class="search-row">
        <input id="fav-keyword" type="search" placeholder="在这个收藏夹里搜索" />
        <button id="fav-keyword-go">搜索</button>
      </div>
      <div class="row">
        <button id="fav-remove-selected">移出选中</button>
        <span class="hint" id="fav-selected-count"></span>
      </div>
      <ul id="fav-items" class="results"></ul>
      <div class="row"><button id="fav-more" class="hidden">加载更多</button></div>
    </div>
  </div>

  <div class="panel hidden" id="panel-queue">
    <div class="row">
      <span class="hint">播放模式</span>
      <button class="mode" data-mode="sequential" title="顺序播放">顺序</button>
      <button class="mode" data-mode="repeat-all" title="列表循环">循环</button>
      <button class="mode" data-mode="repeat-one" title="单曲循环">单曲</button>
      <button class="mode" data-mode="shuffle" title="随机播放">随机</button>
    </div>
    <div class="row">
      <span class="hint" id="queue-summary"></span>
      <button id="queue-clear">清空</button>
    </div>
    <ul id="queue-list" class="results"></ul>
    <div id="queue-empty" class="empty">队列是空的。在搜索或收藏夹里点「+」加入，或直接点一首开始播放。</div>
  </div>

  <div class="panel hidden" id="panel-settings">
    <div class="settings-group">
      <div class="settings-title">音频缓存</div>
      <div class="hint" id="cache-usage">正在读取…</div>
      <div class="bar"><div class="bar-fill" id="cache-bar"></div></div>
      <div class="hint" id="cache-dir"></div>
      <div class="row">
        <button id="cache-refresh">刷新</button>
        <button id="cache-clear">清空缓存</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-title">播放</div>
      <label class="setting">
        <span>音质</span>
        <select id="set-quality">
          <option value="30216">64K</option>
          <option value="30232">132K</option>
          <option value="30280">192K</option>
        </select>
      </label>
      <label class="setting">
        <span>默认播放模式</span>
        <select id="set-mode">
          <option value="sequential">顺序播放</option>
          <option value="repeat-all">列表循环</option>
          <option value="repeat-one">单曲循环</option>
          <option value="shuffle">随机播放</option>
        </select>
      </label>
      <label class="setting">
        <span>音量</span>
        <input id="set-volume" type="range" min="0" max="100" step="1" />
        <span class="hint" id="set-volume-label"></span>
      </label>
      <label class="setting">
        <span>播放速度</span>
        <select id="set-rate">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="1.75">1.75×</option>
          <option value="2">2×</option>
        </select>
      </label>
    </div>

    <div class="settings-group">
      <div class="settings-title">缓存与请求</div>
      <label class="setting">
        <span>启用磁盘缓存</span>
        <input id="set-cache-enabled" type="checkbox" />
      </label>
      <label class="setting">
        <span>缓存上限 (MB)</span>
        <input id="set-cache-max" type="number" min="50" step="50" />
      </label>
      <label class="setting">
        <span>请求间隔 (ms)</span>
        <input id="set-request-interval" type="number" min="0" step="50" />
      </label>
      <div class="hint">间隔调小更快，但更容易触发 B 站风控。</div>
    </div>

    <div class="settings-group">
      <div class="settings-title">界面</div>
      <label class="setting">
        <span>状态栏显示曲目</span>
        <input id="set-status-bar" type="checkbox" />
      </label>
      <label class="setting">
        <span>日志级别</span>
        <select id="set-log-level">
          <option value="off">关闭</option>
          <option value="info">常规</option>
          <option value="debug">详细</option>
        </select>
      </label>
    </div>
  </div>

  <div class="panel hidden" id="panel-account">
    <div id="account-logged-out">
      <p class="hint">用手机 B 站 App 扫码登录，即可浏览与整理你的收藏夹。</p>
      <button id="login" class="primary wide">扫码登录</button>
      <div id="auth-status" class="hint"></div>
      <img id="auth-qr" class="qr hidden" alt="B 站登录二维码" />
      <button id="auth-cancel" class="hidden">取消</button>
    </div>
    <div id="account-logged-in" class="hidden">
      <img id="account-face" class="face" alt="" />
      <div class="account-name" id="account-name"></div>
      <div class="hint" id="account-mid"></div>
      <button id="logout">退出登录</button>
    </div>
  </div>

  <div class="player">
    <div class="cover" id="cover"></div>
    <div class="meta">
      <div class="meta-text">
        <div class="title" id="title">未在播放</div>
        <div class="author" id="author"></div>
      </div>
      <span class="time" id="time">0:00 / 0:00</span>
    </div>
    <div class="controls">
      <button id="prev" title="上一首">⏮</button>
      <button id="toggle" title="播放/暂停" class="primary">▶</button>
      <button id="next" title="下一首">⏭</button>
      <button id="mute-toggle" title="静音 / 取消静音">🔊</button>
      <input id="volume" type="range" min="0" max="100" step="1" title="音量" />
      <select id="rate" title="播放速度">
        <option value="0.5">0.5×</option>
        <option value="0.75">0.75×</option>
        <option value="1">1×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
        <option value="1.75">1.75×</option>
        <option value="2">2×</option>
      </select>
    </div>
    <button id="unmute" class="unmute hidden" title="浏览器要求先点一下才能出声">🔇 点这里恢复声音</button>
    <input id="progress" class="progress" type="range" min="0" max="1000" value="0" step="1" />
    <audio id="audio" preload="auto"></audio>
    <div id="toast" class="toast hidden"></div>
  </div>
`;

const $ = (id) => document.getElementById(id);
const keywordInput = $('keyword');
const resultsList = $('results');
const emptyHint = $('empty');
const prepareBox = $('prepare');
const toastBox = $('toast');
const audio = $('audio');
const progress = $('progress');
const toggleButton = $('toggle');

const TABS = ['search', 'favorites', 'queue', 'account', 'settings'];
let activeTab = 'search';

/** 切换页签（宿主也可以用命令切）。 */
function showTab(tab) {
  const target = TABS.includes(tab) ? tab : 'search';
  activeTab = target;
  for (const name of TABS) {
    $('panel-' + name).classList.toggle('hidden', name !== target);
    const button = document.querySelector('.tab[data-tab="' + name + '"]');
    if (button) button.classList.toggle('active', name === target);
  }
  if (target === 'search') keywordInput.focus();
  if (target === 'favorites' && openFolder === null) post({ type: 'favorites.list' });
  if (target === 'settings') post({ type: 'settings.get' });
}

for (const button of document.querySelectorAll('.tab')) {
  button.addEventListener('click', () => showTab(button.dataset.tab));
}

let tracks = [];
let current = null;
let seeking = false;
let currentUrl = '';
let prefetchTimer = null;
/** 宿主下发的音量设置，避免被 report 时的 audio.volume 覆盖掉。 */
let configuredVolume = 0.8;
/** 宿主下发的播放速度倍率。 */
let configuredRate = 1;
/** 用户自己按的静音（与「自动播放被拦」的静音兜底是两件事）。 */
let userMuted = false;

/** 把音量/静音/倍速反映到界面控件上。 */
function renderAudioControls() {
  const percent = Math.round(audio.volume * 100);
  if (document.activeElement !== $('volume')) $('volume').value = String(percent);
  const effectivelyMuted = audio.muted;
  $('mute-toggle').textContent = effectivelyMuted ? '🔇' : '🔊';
  $('mute-toggle').title = effectivelyMuted ? '取消静音' : '静音';
  if (document.activeElement !== $('rate')) $('rate').value = String(configuredRate);
}

/** 音量/倍速变动时回报一次，便于肉眼与自检确认「设置真的落到媒体元素上了」。 */
let lastApplied = '';
function logAudioControls() {
  const text = `音量 ${Math.round(audio.volume * 100)}%（${audio.muted ? '静音' : '有声'}）／倍速 ${audio.playbackRate}×`;
  if (text === lastApplied) return;
  lastApplied = text;
  post({ type: 'log', level: 'info', message: `播放参数已应用：${text}` });
}

/** 应用宿主下发的音量（0–1）。 */
function applyVolume(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  configuredVolume = Math.min(1, Math.max(0, value));
  // 只在真的不同时写，避免每次播放进度上报都去动媒体元素。
  if (Math.abs(audio.volume - configuredVolume) > 1e-6) audio.volume = configuredVolume;
  renderAudioControls();
  logAudioControls();
}

/** 应用宿主下发的倍速。 */
function applyRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
  configuredRate = value;
  try {
    if (Math.abs(audio.playbackRate - value) > 1e-6) {
      audio.playbackRate = value;
      audio.defaultPlaybackRate = value;
    }
  } catch {
    /* 内核不支持时忽略 */
  }
  renderAudioControls();
  logAudioControls();
}

/* --------------------------------------------------------- 能力探测上报 */

function capabilities() {
  const probe = (type) => {
    try {
      return audio.canPlayType(type) || '';
    } catch {
      return '';
    }
  };
  const raw = {
    'audio/mp4; codecs="mp4a.40.2"': probe('audio/mp4; codecs="mp4a.40.2"'),
    'audio/mp4': probe('audio/mp4'),
    'audio/wav': probe('audio/wav'),
    'audio/x-wav': probe('audio/x-wav'),
    'audio/ogg; codecs="opus"': probe('audio/ogg; codecs="opus"'),
  };
  return {
    aac: raw['audio/mp4; codecs="mp4a.40.2"'] !== '',
    mp4: raw['audio/mp4'] !== '',
    wav: raw['audio/wav'] !== '' || raw['audio/x-wav'] !== '',
    ogg: raw['audio/ogg; codecs="opus"'] !== '',
    raw,
  };
}

function post(message) {
  vscode.postMessage(message);
}

/* ---------------------------------------------------------------- 渲染 */

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function renderResults() {
  resultsList.innerHTML = '';
  emptyHint.classList.toggle('hidden', tracks.length > 0);
  tracks.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'result' + (current && current.bvid === track.bvid ? ' active' : '');
    li.innerHTML = `
      <img class="thumb" alt="" src="${track.cover || ''}" loading="lazy" />
      <div class="info">
        <div class="rtitle"></div>
        <div class="rauthor"></div>
      </div>
      <div class="duration">${formatTime(track.durationSeconds)}</div>
      <button class="add-one" title="加入队列">+</button>
      <button class="fav-one" title="加入收藏夹">★</button>
      <button class="play-one" title="播放">▶</button>
    `;
    // 标题一律用 textContent 写入，避免把 B 站返回的内容当 HTML 执行。
    li.querySelector('.rtitle').textContent = track.title || '(无标题)';
    li.querySelector('.rauthor').textContent = track.author || '';
    // 注意：**不给整行绑点击**。整行绑了以后，`+`/`★` 这种小按钮一旦没点准，
    // 就会落到「点击即播放并接管整个列表」上——用户以为只加了一首，结果整个
    // 列表都进了队列。现在只有缩略图与标题区触发播放，按钮各管各的。
    const playArea = [li.querySelector('.thumb'), li.querySelector('.info')];
    for (const node of playArea) {
      if (node) {
        node.addEventListener('click', () => play(track, tracks));
      }
    }
    li.querySelector('.play-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'log', level: 'info', message: `播放：${track.title}` });
      play(track, tracks);
    });
    li.querySelector('.add-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'log', level: 'info', message: `加入队列（单首）：${track.title}` });
      enqueue(track);
    });
    li.querySelector('.fav-one').addEventListener('click', (event) => {
      event.stopPropagation();
      membershipWantOpen = true;
      membershipBvid = track.bvid;
      post({ type: 'favorites.membership', bvid: track.bvid });
    });
    // 悬停预取：点击后 `play()` 必须落在 5 秒手势窗口内，先把音频下好才来得及。
    li.addEventListener('mouseenter', () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        if (current && current.bvid === track.bvid) return;
        post({ type: 'prepareTrack', track });
      }, 350);
    });
    li.dataset.index = String(index);
    resultsList.appendChild(li);
  });
}

function setPrepare(stage, message, percent) {
  if (!stage || stage === 'ready' || stage === 'queued') {
    prepareBox.classList.add('hidden');
    return;
  }
  prepareBox.classList.remove('hidden');
  prepareBox.textContent = percent === null ? message : `${message} ${percent}%`;
}

let toastTimer = null;
function toast(level, message) {
  toastBox.className = `toast ${level}`;
  toastBox.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastBox.classList.add('hidden'), 6000);
}

/* ---------------------------------------------------------------- 行为 */

/**
 * 播放某一首。
 *
 * 用户点下去必须**立刻**有反馈，所以这里不等宿主把音频准备好：
 *   1. 马上暂停当前音频（否则旧歌会继续放着，用户不知道点击生效没有）；
 *   2. 把该条目标成「加载中」，播放栏标题换成新歌并显示「加载中…」；
 *   3. 等宿主把 `playerSource` 推过来再真正起播（见消息处理里的 playerSource）。
 *
 * 点到正在播放的那一首则不重新加载，直接切换播放/暂停。
 */
let loadingTrack = null;

function renderLoadingState() {
  resultsList.querySelectorAll('.result.loading').forEach((el) => el.classList.remove('loading'));
  $('title').classList.toggle('loading', loadingTrack !== null);
  if (loadingTrack !== null) {
    $('title').textContent = loadingTrack.title || '(无标题)';
    $('author').textContent = loadingTrack.author || '';
    for (const row of resultsList.querySelectorAll('.result')) {
      const index = Number(row.dataset.index);
      const track = tracks[index];
      if (track && track.bvid === loadingTrack.bvid) row.classList.add('loading');
    }
    for (const row of $('fav-items').querySelectorAll('.result')) {
      const index = Number(row.dataset.index);
      const track = favoriteItems[index];
      if (track && track.bvid === loadingTrack.bvid) row.classList.add('loading');
    }
  }
}

function play(track, list) {
  // 点正在播放的那首：只切换播放/暂停，不重新加载。
  if (
    loadingTrack === null &&
    current !== null &&
    current.bvid === track.bvid &&
    currentUrl !== ''
  ) {
    togglePlayback();
    return;
  }

  loadingTrack = track;
  // 立刻停掉当前音频：否则旧歌会继续响，用户无法判断点击是否生效。
  // 只 pause、不置空 src——置空会触发 media error，弹出一个假的「播放失败」。
  try {
    audio.pause();
  } catch {
    /* 忽略 */
  }
  currentUrl = '';
  progress.value = '0';
  $('time').textContent = '0:00 / 0:00';
  setPrepare('fetch', '正在准备…', null);

  current = track;
  renderResults();
  renderLoadingState();

  // 带上来源列表：宿主会把整份列表接管成队列，之后「下一首」才有意义。
  const index = Array.isArray(list) ? list.findIndex((item) => item.bvid === track.bvid) : -1;
  if (Array.isArray(list) && list.length > 0 && index >= 0) {
    post({ type: 'play', track, queue: list, index });
  } else {
    post({ type: 'play', track });
  }
}

function togglePlayback() {
  if (!currentUrl) return;
  if (audio.paused) void audio.play().catch((error) => toast('error', `无法播放：${error.message}`));
  else audio.pause();
}

function updateTimeLabel() {
  const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  $('time').textContent = `${formatTime(position)} / ${formatTime(duration)}`;
  if (!seeking && duration > 0) {
    progress.value = String(Math.round((position / duration) * 1000));
  }
}

/**
 * 起播。
 *
 * Chromium 的自动播放策略要求 `play()` 落在用户点击后的约 5 秒内（transient
 * activation）。正常使用没问题——点击曲目会立刻预取，且在点击后一两秒内就调用
 * `play()`；但网络慢时「下载 + 解码」可能超过 5 秒，这时 `play()` 会被拒。
 *
 * 被拒时**绝不能悄悄静音播放**：那会让用户看到时钟在走却没有声音。因此这里
 * 退化为静音起播（保证有进度可测），同时把 `muted` 状态回报给宿主，并在界面上
 * 挂一个显眼的「点这里恢复声音」按钮——用户点一下（真实手势）就能出声。
 */
let mutedFallback = false;

function showUnmuteHint(show) {
  mutedFallback = show;
  $('unmute').classList.toggle('hidden', !show);
}

async function startPlayback() {
  try {
    await audio.play();
    showUnmuteHint(false);
    return true;
  } catch (error) {
    if (!error || error.name !== 'NotAllowedError') {
      const message = `play() 失败：${error && error.message ? error.message : String(error)}`;
      toast('error', message);
      post({ type: 'report', playing: false, position: 0, duration: 0, error: message });
      return false;
    }
  }

  audio.muted = true;
  try {
    await audio.play();
  } catch (error) {
    const message = `静音起播也失败：${error && error.message ? error.message : String(error)}`;
    toast('error', message);
    post({ type: 'report', playing: false, position: 0, duration: 0, error: message });
    return false;
  }

  // 让宿主把原因写进日志（默认 info 级也能看到）。
  post({
    type: 'log',
    level: 'warn',
    message: '自动播放被策略拦截（点击后超过约 5 秒才 play()），已静音起播',
  });
  showUnmuteHint(true);

  // 试着手动恢复声音；Chromium 在无手势时可能立刻暂停，那就保持静音续播。
  audio.muted = false;
  if (audio.paused) {
    audio.muted = true;
    void audio.play().catch(() => undefined);
  } else {
    showUnmuteHint(false);
  }
  return true;
}

/** 用户点击（真实手势）之后恢复声音。 */
function restoreSound() {
  audio.muted = false;
  userMuted = false;
  if (audio.paused) {
    void audio.play().catch(() => undefined);
  }
  showUnmuteHint(false);
  renderAudioControls();
  report(true);
}

/* -------------------------------------------------------------- 事件绑定 */

$('search').addEventListener('click', () => {
  const keyword = keywordInput.value.trim();
  if (keyword !== '') post({ type: 'search', keyword, page: 1 });
});
keywordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('search').click();
});
toggleButton.addEventListener('click', togglePlayback);
// 上一首/下一首由宿主按队列决定（界面只管请求）。
$('prev').addEventListener('click', () => post({ type: 'player.previous' }));
$('next').addEventListener('click', () => post({ type: 'player.next' }));

/* ------------------------------------------------------ 播放栏：音量与倍速 */

$('volume').addEventListener('input', (event) => {
  // 拖动时立刻生效；写回设置由宿主完成（防抖，避免拖一次发几十条消息）。
  const value = Number(event.target.value);
  audio.volume = value / 100;
  configuredVolume = value / 100;
  if (value > 0 && audio.muted) {
    audio.muted = false;
    userMuted = false;
  }
  renderAudioControls();
  scheduleVolumePersist();
});

let volumePersistTimer = null;
function scheduleVolumePersist() {
  if (volumePersistTimer) clearTimeout(volumePersistTimer);
  volumePersistTimer = setTimeout(() => {
    volumePersistTimer = null;
    post({ type: 'settings.set', key: 'volume', value: configuredVolume });
  }, 300);
}

$('mute-toggle').addEventListener('click', () => {
  userMuted = !audio.muted;
  audio.muted = !audio.muted;
  showUnmuteHint(false);
  renderAudioControls();
  report(true);
});

$('rate').addEventListener('change', (event) => {
  const value = Number(event.target.value);
  applyRate(value);
  post({ type: 'settings.set', key: 'playbackRate', value });
});

progress.addEventListener('input', () => {
  seeking = true;
});
progress.addEventListener('change', () => {
  seeking = false;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  if (duration > 0) {
    audio.currentTime = (Number(progress.value) / 1000) * duration;
    post({ type: 'seek', position: audio.currentTime });
  }
});

audio.addEventListener('play', () => {
  toggleButton.textContent = '⏸';
  report(true);
});
audio.addEventListener('pause', () => {
  toggleButton.textContent = '▶';
  report(true);
});
audio.addEventListener('ended', () => {
  report(true);
  // 交给宿主决定下一首：单曲循环要重播，队列走完了要停。
  post({ type: 'player.ended' });
});
audio.addEventListener('error', () => {
  const code = audio.error ? audio.error.code : 0;
  const message = `音频加载失败（code ${code}）`;
  toast('error', message);
  post({ type: 'report', playing: false, position: 0, duration: 0, error: message });
});
audio.addEventListener('loadedmetadata', () => {
  // 换 src 之后媒体元素的速率可能被重置，重新按设置应用一次。
  applyRate(configuredRate);
  applyVolume(configuredVolume);
  updateTimeLabel();
});
audio.addEventListener('timeupdate', () => {
  updateTimeLabel();
  report();
});

/**
 * 上报播放状态。
 *
 * 两条通道缺一不可：
 *  - `timeupdate`（媒体管线触发，隐藏页面**不会**被节流）负责真实播放进度；
 *  - 定时器心跳（500ms）负责暂停状态与「webview 是否还活着」。
 * 隐藏侧边栏时 Chromium 会把 setInterval 节流到秒级甚至更低，只靠定时器会导致
 * 状态栏与宿主状态变迟钝。
 */
let lastReportAt = 0;
function report(force) {
  const now = Date.now();
  if (!force && now - lastReportAt < 400) return;
  lastReportAt = now;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  post({
    type: 'report',
    playing: !audio.paused && !audio.ended,
    position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration,
    volume: audio.volume,
    muted: audio.muted || mutedFallback,
  });
}
setInterval(() => {
  if (currentUrl) report();
}, 500);

// 用户任何一次真实点击之后都把声音恢复回来（按钮之外的点击也算）。
document.addEventListener(
  'click',
  (event) => {
    if (event.target && event.target.id === 'unmute') return;
    if (audio.muted || mutedFallback) restoreSound();
  },
  true,
);
$('unmute').addEventListener('click', (event) => {
  event.stopPropagation();
  restoreSound();
});

/* ------------------------------------------------------------------ 收藏夹 */

let favoriteFolders = [];
let openFolder = null;
let favoriteItems = [];
let favoritePage = 0;
let favoriteHasMore = false;
let favoriteKeyword = '';
let favoriteTotal = 0;
const selectedBvids = new Set();
let membershipBvid = null;
let membershipFolders = [];
/** 只有用户主动点了 ★ 才允许弹出面板；宿主的刷新不能把它再弹出来。 */
let membershipWantOpen = false;

/** 请宿主弹原生确认框；超时按「未确认」处理，避免 Promise 永远悬着。 */
const pendingDialogs = new Map();
function requestConfirm(message, detail) {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    pendingDialogs.set(id, resolve);
    post({ type: 'dialog.confirm', id, message, detail });
    setTimeout(() => {
      if (pendingDialogs.delete(id)) resolve(false);
    }, 120000);
  });
}

function setFavStatus(text) {
  $('fav-status').textContent = text || '';
}

function renderFavoriteFolders() {
  const list = $('fav-list');
  list.innerHTML = '';
  $('fav-list-empty').classList.toggle('hidden', favoriteFolders.length > 0);
  for (const folder of favoriteFolders) {
    const li = document.createElement('li');
    li.className = 'result';
    li.innerHTML = `
      <div class="info">
        <div class="rtitle"></div>
        <div class="rauthor"></div>
      </div>
      <button class="open-one primary">打开</button>
      <button class="delete-one" title="删除收藏夹">🗑</button>
    `;
    li.querySelector('.rtitle').textContent = folder.title;
    li.querySelector('.rauthor').textContent = `${folder.count} 个内容`;
    li.querySelector('.open-one').addEventListener('click', (event) => {
      event.stopPropagation();
      openFolderView(folder.id, folder.title);
    });
    li.querySelector('.delete-one').addEventListener('click', async (event) => {
      event.stopPropagation();
      post({ type: 'favorites.removeFolder', mediaId: folder.id, title: folder.title });
    });
    li.addEventListener('click', () => openFolderView(folder.id, folder.title));
    list.appendChild(li);
  }
}

function renderFavoriteContents() {
  const list = $('fav-items');
  list.innerHTML = '';
  favoriteItems.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'result' + (track.invalid ? ' invalid' : '');
    li.dataset.index = String(index);
    li.innerHTML = `
      <input type="checkbox" class="pick" ${selectedBvids.has(track.bvid) ? 'checked' : ''} />
      <img class="thumb" alt="" src="${track.cover || ''}" loading="lazy" />
      <div class="info">
        <div class="rtitle"></div>
        <div class="rauthor"></div>
      </div>
      <div class="duration">${formatTime(track.durationSeconds)}</div>
      <button class="add-one" title="加入队列">+</button>
      <button class="play-one" title="播放">▶</button>
    `;
    li.querySelector('.rtitle').textContent = track.title || '(无标题)';
    li.querySelector('.rauthor').textContent = track.invalid
      ? `已失效：${track.invalidReason || '不可播放'}`
      : track.author || '';
    const checkbox = li.querySelector('.pick');
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedBvids.add(track.bvid);
      else selectedBvids.delete(track.bvid);
      updateSelectedCount();
    });
    if (!track.invalid) {
      const playArea = [li.querySelector('.thumb'), li.querySelector('.info')];
      for (const node of playArea) {
        if (node) node.addEventListener('click', () => play(track, favoriteItems));
      }
      li.querySelector('.play-one').addEventListener('click', (event) => {
        event.stopPropagation();
        post({ type: 'log', level: 'info', message: `播放（收藏夹）：${track.title}` });
        play(track, favoriteItems);
      });
    } else {
      li.querySelector('.play-one').disabled = true;
    }
    li.querySelector('.add-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'log', level: 'info', message: `加入队列（单首，收藏夹）：${track.title}` });
      enqueue(track);
    });
    list.appendChild(li);
  });
  $('fav-more').classList.toggle('hidden', !favoriteHasMore);
  updateSelectedCount();
  renderLoadingState();
}

function updateSelectedCount() {
  $('fav-selected-count').textContent =
    selectedBvids.size > 0 ? `已选 ${selectedBvids.size} 个` : '';
}

function openFolderView(mediaId, title) {
  openFolder = { id: mediaId, title };
  favoriteItems = [];
  favoritePage = 0;
  favoriteKeyword = '';
  selectedBvids.clear();
  $('fav-keyword').value = '';
  $('fav-contents').classList.remove('hidden');
  $('fav-list').classList.add('hidden');
  $('fav-list-empty').classList.add('hidden');
  $('fav-contents-title').textContent = title;
  setFavStatus('正在加载…');
  post({ type: 'favorites.open', mediaId, page: 1 });
}

function closeFolderView() {
  openFolder = null;
  favoriteItems = [];
  selectedBvids.clear();
  $('fav-contents').classList.add('hidden');
  $('fav-list').classList.remove('hidden');
  setFavStatus('');
  post({ type: 'favorites.list' });
}

$('fav-refresh').addEventListener('click', () => {
  setFavStatus('正在加载…');
  post({ type: 'favorites.list' });
});
$('fav-create-toggle').addEventListener('click', () => {
  $('fav-create-form').classList.toggle('hidden');
  $('fav-title').focus();
});
$('fav-create-cancel').addEventListener('click', () => {
  $('fav-create-form').classList.add('hidden');
  $('fav-title').value = '';
});
$('fav-create-ok').addEventListener('click', () => {
  const title = $('fav-title').value.trim();
  if (title === '') return;
  post({ type: 'favorites.create', title, privacy: $('fav-private').checked ? 1 : 0 });
  $('fav-title').value = '';
  $('fav-create-form').classList.add('hidden');
});
$('fav-back').addEventListener('click', closeFolderView);
$('fav-more').addEventListener('click', () => {
  if (openFolder) post({ type: 'favorites.open', mediaId: openFolder.id, page: favoritePage + 1, keyword: favoriteKeyword });
});
$('fav-keyword-go').addEventListener('click', () => {
  if (!openFolder) return;
  favoriteKeyword = $('fav-keyword').value.trim();
  favoriteItems = [];
  favoritePage = 0;
  selectedBvids.clear();
  post({ type: 'favorites.open', mediaId: openFolder.id, page: 1, keyword: favoriteKeyword });
});
$('fav-keyword').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('fav-keyword-go').click();
});
$('fav-remove-selected').addEventListener('click', () => {
  if (!openFolder || selectedBvids.size === 0) return;
  post({
    type: 'favorites.removeResources',
    mediaId: openFolder.id,
    bvids: [...selectedBvids],
  });
});

/* ------------------------------------------------- 「加入收藏夹」勾选面板 */

function renderMembership() {
  $('fav-add-panel').classList.remove('hidden');
  $('fav-add-title').textContent = '加入收藏夹';
  const list = $('fav-add-list');
  list.innerHTML = '';
  if (membershipFolders.length === 0) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = '没有可用的收藏夹，先新建一个。';
    list.appendChild(li);
    return;
  }
  for (const folder of membershipFolders) {
    const li = document.createElement('li');
    li.className = 'result';
    li.innerHTML = `<input type="checkbox" /> <div class="info"><div class="rtitle"></div></div>`;
    const checkbox = li.querySelector('input');
    checkbox.checked = folder.selected === true;
    li.querySelector('.rtitle').textContent = folder.title;
    checkbox.addEventListener('change', () => {
      folder.selected = checkbox.checked;
    });
    li.addEventListener('click', (event) => {
      if (event.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      folder.selected = checkbox.checked;
    });
    list.appendChild(li);
  }
}

function closeMembership() {
  membershipBvid = null;
  membershipFolders = [];
  // 关掉之后宿主可能还会回一条刷新（操作完成后的状态同步），
  // 不能因为收到它就再把面板弹出来——那正是「点确定后又弹一次」的原因。
  membershipWantOpen = false;
  $('fav-add-panel').classList.add('hidden');
}

$('fav-add-ok').addEventListener('click', () => {
  if (membershipBvid === null) return;
  // 原本就在里面、现在取消勾选 → 移出；原本不在、现在勾选 → 加入。
  const addIds = membershipFolders.filter((f) => f.selected && !f.wasSelected).map((f) => String(f.id));
  const delIds = membershipFolders.filter((f) => !f.selected && f.wasSelected).map((f) => String(f.id));
  post({ type: 'favorites.deal', bvid: membershipBvid, addIds, delIds });
  closeMembership();
});
$('fav-add-cancel').addEventListener('click', closeMembership);

/* ------------------------------------------------------------------ 队列 */

let queueItems = [];
let queueIndex = -1;
let queueMode = 'sequential';

/** 「+」加入队列：搜索结果与收藏夹条都用它。 */
function enqueue(track) {
  post({ type: 'queue.enqueue', track });
}

function renderQueue() {
  $('queue-list').innerHTML = '';
  $('queue-empty').classList.toggle('hidden', queueItems.length > 0);
  $('queue-summary').textContent =
    queueItems.length > 0 ? `${queueItems.length} 首${queueIndex >= 0 ? `，正在播第 ${queueIndex + 1} 首` : ''}` : '';
  for (const button of document.querySelectorAll('.mode')) {
    button.classList.toggle('active', button.dataset.mode === queueMode);
  }

  queueItems.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'result' + (index === queueIndex ? ' active' : '');
    li.dataset.index = String(index);
    li.innerHTML = `
      <div class="info">
        <div class="rtitle"></div>
        <div class="rauthor"></div>
      </div>
      <button class="up-one" title="上移">↑</button>
      <button class="down-one" title="下移">↓</button>
      <button class="remove-one" title="从队列移除">✕</button>
    `;
    li.querySelector('.rtitle').textContent = `${index + 1}. ${track.title || '(无标题)'}`;
    li.querySelector('.rauthor').textContent = track.author || '';
    li.querySelector('.up-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'queue.move', from: index, to: index - 1 });
    });
    li.querySelector('.down-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'queue.move', from: index, to: index + 1 });
    });
    li.querySelector('.remove-one').addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'queue.remove', index });
    });
    li.addEventListener('click', () => {
      post({ type: 'queue.playAt', index });
    });
    $('queue-list').appendChild(li);
  });
}

for (const button of document.querySelectorAll('.mode')) {
  button.addEventListener('click', () => {
    post({ type: 'player.setMode', mode: button.dataset.mode });
  });
}

$('queue-clear').addEventListener('click', async () => {
  if (queueItems.length === 0) return;
  const confirmed = await requestConfirm('确定清空播放队列吗？', '队列清空后当前播放不受影响。');
  if (confirmed) post({ type: 'queue.clear' });
});

/* ---------------------------------------------------------- 设置与缓存 */

/** 字节数格式化（与宿主侧的提示格式保持一致）。 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function setSetting(key, value) {
  post({ type: 'settings.set', key, value });
}

function renderCacheInfo(info) {
  const percent = info.maxBytes > 0 ? Math.min(100, (info.bytes / info.maxBytes) * 100) : 0;
  if (!info.enabled) {
    $('cache-usage').textContent = '磁盘缓存已关闭（播放仍可用，只是每次都要重新下载解码）';
    $('cache-bar').style.width = '0%';
  } else {
    $('cache-usage').textContent = `已占用 ${formatBytes(info.bytes)} / 上限 ${formatBytes(info.maxBytes)}（${info.files} 个文件，${percent.toFixed(1)}%）`;
    $('cache-bar').style.width = `${percent}%`;
    $('cache-bar').classList.toggle('warn', percent >= 90);
  }
  $('cache-dir').textContent = info.dir ? `目录：${info.dir}` : '';
}

function renderSettings(settings) {
  $('set-quality').value = String(settings.audioQuality);
  $('set-mode').value = settings.defaultPlayMode;
  $('set-volume').value = String(Math.round(settings.volume * 100));
  $('set-volume-label').textContent = `${Math.round(settings.volume * 100)}%`;
  $('set-rate').value = String(settings.playbackRate ?? 1);
  $('set-cache-enabled').checked = settings.cacheEnabled === true;
  $('set-cache-max').value = String(settings.cacheMaxMB);
  $('set-request-interval').value = String(settings.requestIntervalMs);
  $('set-status-bar').checked = settings.showStatusBar === true;
  $('set-log-level').value = settings.logLevel;
}

$('cache-refresh').addEventListener('click', () => {
  $('cache-usage').textContent = '正在读取…';
  post({ type: 'cache.stats' });
});

$('cache-clear').addEventListener('click', async () => {
  const confirmed = await requestConfirm(
    '确定清空音频缓存吗？',
    '只会删掉解码后的音频文件，不影响登录状态、收藏夹与正在播放的这一首。',
  );
  if (confirmed) post({ type: 'cache.clear' });
});

$('set-quality').addEventListener('change', (event) => {
  setSetting('audioQuality', Number(event.target.value));
});
$('set-mode').addEventListener('change', (event) => {
  setSetting('defaultPlayMode', event.target.value);
});
$('set-volume').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  $('set-volume-label').textContent = `${value}%`;
  applyVolume(value / 100);
  setSetting('volume', value / 100);
});
$('set-rate').addEventListener('change', (event) => {
  const value = Number(event.target.value);
  applyRate(value);
  setSetting('playbackRate', value);
});
$('set-cache-enabled').addEventListener('change', (event) => {
  setSetting('cacheEnabled', event.target.checked);
});
$('set-cache-max').addEventListener('change', (event) => {
  setSetting('cacheMaxMB', Number(event.target.value));
});
$('set-request-interval').addEventListener('change', (event) => {
  setSetting('requestIntervalMs', Number(event.target.value));
});
$('set-status-bar').addEventListener('change', (event) => {
  setSetting('showStatusBar', event.target.checked);
});
$('set-log-level').addEventListener('change', (event) => {
  setSetting('logLevel', event.target.value);
});

/* -------------------------------------------------------------- 账户 / 登录 */

$('login').addEventListener('click', () => {
  $('auth-status').textContent = '正在获取二维码…';
  $('auth-qr').classList.add('hidden');
  $('auth-cancel').classList.remove('hidden');
  post({ type: 'auth.start' });
});

$('auth-cancel').addEventListener('click', () => {
  post({ type: 'auth.cancel' });
  $('auth-qr').classList.add('hidden');
  $('auth-cancel').classList.add('hidden');
  $('auth-status').textContent = '已取消';
});

$('logout').addEventListener('click', () => post({ type: 'auth.logout' }));

function renderAuthState(message) {
  const loggedIn = message.loggedIn === true;
  $('account-logged-out').classList.toggle('hidden', loggedIn);
  $('account-logged-in').classList.toggle('hidden', !loggedIn);
  const tabButton = document.querySelector('.tab[data-tab="account"]');
  if (tabButton) tabButton.classList.toggle('logged-in', loggedIn);
  if (loggedIn && message.user) {
    $('account-face').src = message.user.face || '';
    $('account-name').textContent = message.user.name || '';
    $('account-mid').textContent = `UID ${message.user.mid}`;
    $('auth-qr').classList.add('hidden');
    $('auth-cancel').classList.add('hidden');
    $('auth-status').textContent = '';
  }
  const hint = $('favorites-hint');
  if (hint) {
    hint.textContent = loggedIn
      ? '收藏夹浏览与整理将在下一步接入（登录已就绪）。'
      : '收藏夹需要先扫码登录。';
  }
}

function renderAuthStatus(message) {
  $('auth-status').textContent = message.message || '';
  const done = message.status === 'success';
  if (done || message.status === 'expired' || message.status === 'error' || message.status === 'cancelled') {
    $('auth-cancel').classList.add('hidden');
  }
  if (done || message.status === 'expired' || message.status === 'error') {
    $('auth-qr').classList.add('hidden');
  }
  if (message.status === 'expired' || message.status === 'error') {
    toast('warn', message.message || '登录未完成');
  }
}

/* ------------------------------------------------------------------ 消息 */

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;

  switch (message.type) {
    case 'bootstrap':
      keywordInput.placeholder = `搜索（音质 ${message.quality}，缓存${message.cacheEnabled ? '开启' : '关闭'}）`;
      break;
    case 'playerState':
      // 音量与倍速不在这里应用：它们只走 settings.state（playerState 里没有这两个字段，
      // 否则一个晚到的旧状态会把用户刚拖好的音量覆盖回去）。
      if (message.track) {
        $('title').textContent = message.track.title;
        $('author').textContent = message.track.author;
      }
      if (message.muted === true && !mutedFallback) showUnmuteHint(true);
      if (message.duration > 0 && !Number.isFinite(audio.duration)) updateTimeLabel();
      break;
    case 'searchResult':
      tracks = message.view.items || [];
      renderResults();
      break;
    case 'playerSource':
      current = message.track || current;
      loadingTrack = null;
      if (message.url === currentUrl) {
        // 原地重播（单曲循环）：同一个地址不用重新加载，直接回到开头。
        audio.currentTime = message.resumeAt > 0 ? message.resumeAt : 0;
      } else {
        currentUrl = message.url;
        audio.src = message.url;
        if (message.resumeAt > 0) audio.currentTime = message.resumeAt;
      }
      $('title').textContent = current ? current.title : '未在播放';
      $('author').textContent = current ? current.author : '';
      if (current && current.cover) {
        $('cover').style.backgroundImage = `url("${current.cover}")`;
      }
      setPrepare('', '', null);
      updateTimeLabel();
      renderResults();
      renderLoadingState();
      void startPlayback();
      break;
    case 'queue.state':
      queueItems = message.items || [];
      queueIndex = typeof message.index === 'number' ? message.index : -1;
      queueMode = message.mode || 'sequential';
      renderQueue();
      break;
    case 'cache.info':
      renderCacheInfo(message.info || { files: 0, bytes: 0, maxBytes: 0, dir: '', enabled: true });
      // 回报宿主：读数确实送到了界面（自检与排查都靠它区分「没发」还是「没渲染」）。
      post({ type: 'log', level: 'info', message: `cache.info 已渲染：${$('cache-usage').textContent}` });
      break;
    case 'settings.state':
      renderSettings(message.settings || {});
      // 设置页改了音量/倍速，播放栏也要跟着动。
      applyVolume(message.settings?.volume);
      applyRate(message.settings?.playbackRate);
      break;
    case 'player.loading':
      // 宿主主动发起的播放（命令/自动下一首）：也让界面立刻进入等待状态。
      if (message.track) {
        loadingTrack = message.track;
        current = message.track;
        try {
          audio.pause();
        } catch {
          /* 忽略 */
        }
        currentUrl = '';
        setPrepare('fetch', '正在准备…', null);
        renderResults();
        renderLoadingState();
      }
      break;
    case 'prepare':
      setPrepare(message.stage, message.message, message.percent);
      break;
    case 'toast':
      toast(message.level, message.message);
      if (message.level === 'error' && loadingTrack !== null) {
        // 加载失败：必须清掉等待态，否则会一直转圈。
        loadingTrack = null;
        setPrepare('', '', null);
        renderResults();
        renderLoadingState();
      }
      break;
    case 'auth.state':
      renderAuthState(message);
      break;
    case 'auth.qr':
      $('auth-qr').src = message.dataUrl;
      $('auth-qr').classList.remove('hidden');
      $('auth-cancel').classList.remove('hidden');
      // 回报宿主：二维码确实到达界面了（否则「卡在获取二维码」无从区分是哪一端的问题）。
      post({
        type: 'log',
        level: 'info',
        message: `auth.qr 已收到并显示，${String(message.dataUrl || '').length} 字节`,
      });
      break;
    case 'auth.status':
      renderAuthStatus(message);
      break;
    case 'favorites.folders':
      favoriteFolders = message.items || [];
      renderFavoriteFolders();
      setFavStatus(favoriteFolders.length > 0 ? `${favoriteFolders.length} 个收藏夹` : '');
      break;
    case 'favorites.contents': {
      if (openFolder === null || message.mediaId !== openFolder.id) break;
      const append = message.page > 1;
      favoriteItems = append ? favoriteItems.concat(message.items || []) : message.items || [];
      favoritePage = message.page;
      favoriteHasMore = message.hasMore === true;
      favoriteTotal = message.total || 0;
      renderFavoriteContents();
      setFavStatus(`共 ${favoriteTotal} 个内容，已加载 ${favoriteItems.length} 个`);
      break;
    }
    case 'favorites.membership': {
      membershipBvid = message.bvid;
      // wasSelected 用来算「哪些需要加入、哪些需要移出」。
      membershipFolders = (message.folders || []).map((folder) => ({
        ...folder,
        wasSelected: folder.selected === true,
      }));
      // 只有「用户点了 ★ 等这次结果」才弹面板；操作完成后的状态刷新只更新数据。
      if (membershipWantOpen) {
        membershipWantOpen = false;
        renderMembership();
      }
      break;
    }
    case 'dialog.result': {
      const resolve = pendingDialogs.get(message.id);
      if (resolve) {
        pendingDialogs.delete(message.id);
        resolve(message.confirmed === true);
      }
      break;
    }
    case 'busy':
      if (message.what === 'favorites') setFavStatus(message.on ? '正在加载…' : '');
      break;
    case 'command':
      if (message.command === 'playPause') togglePlayback();
      else if (message.command === 'focusSearch') {
        showTab('search');
        keywordInput.focus();
      } else if (message.command === 'showTab') showTab(message.tab);
      break;
    default:
      break;
  }
});

post({ type: 'ready', capabilities: capabilities() });
