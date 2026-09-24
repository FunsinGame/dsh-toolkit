/**
 * Query by example controls — plan §3.4.
 *
 * Lives in the top bar next to the search box, because it is an *alternative way to
 * ask the same question*: instead of typing a description, you supply a sound. Two
 * ways in:
 *
 *  - drop (or pick) a reference clip, up to 60s;
 *  - search the current waveform selection of whatever is loaded.
 *
 * The reference's own description is shown after a search — length, channels, peak,
 * and any warning — because "no good results" is usually "the clip was silent" or
 * "the clip was 80 ms long", and the user cannot see that from an empty list.
 */

import { useState } from 'react';

import { getPlayer } from '../audio/player.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatDuration } from '../util/format.ts';

export function ProbeBar(): React.JSX.Element {
  const state = useAppState();
  const [dragging, setDragging] = useState(false);

  const playback = getPlayer().getState();
  const hasSelection = playback.selection !== null && playback.assetId !== null;
  const probe = state.probe;

  return (
    <div className="probe-bar">
      {probe ? (
        <div className="probe-active">
          <span className="probe-tag">{probe.kind === 'slice' ? '选区搜索' : '参考音频'}</span>
          <span title={probe.label}>{probe.label}</span>
          {probe.preview && (
            <span className="count">
              {formatDuration(probe.preview.durationSeconds * 1000)} · {probe.preview.channels}ch · 峰值{' '}
              {probe.preview.peak.toFixed(2)}
            </span>
          )}
          {/*
            Say what the long-file pass did. Re-analysing a few files costs seconds
            of CPU, and a query that is slower than a keyword search should explain
            itself rather than just feel slow.
          */}
          {probe.maxsim && probe.maxsim.analysed > 0 && (
            <span
              className="count"
              title={
                `把参考音频与长文件的分析窗逐一比对（每文件最多 ${probe.maxsim.maxWindows} 窗）。` +
                `其中 ${probe.maxsim.stored} 个用了已存窗口向量，` +
                `${probe.maxsim.analysed} 个本次现场分析，` +
                `${probe.maxsim.skippedShort} 个太短无需切窗，` +
                `${probe.maxsim.skippedBudget} 个因超出本查询预算而跳过。`
              }
            >
              长文件切窗：现场分析 {probe.maxsim.analysed} 个
            </span>
          )}
          {probe.windowMatches > 0 && (
            <span className="count" title="这些结果是因为「文件里含有和参考音频相似的一段」而命中，而不是整体相似">
              窗口命中 {probe.windowMatches}
            </span>
          )}
          <button onClick={() => store.clearProbe()} title="回到文字搜索">
            退出声音搜索
          </button>
        </div>
      ) : (
        <div
          className={dragging ? 'probe-drop over' : 'probe-drop'}
          onDragOver={(ev) => {
            // Only claim the drop when files are actually being dragged, so dragging
            // a result row out to a DAW is not intercepted by this bar.
            if (!ev.dataTransfer.types.includes('Files')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(ev) => {
            const file = ev.dataTransfer.files[0];
            setDragging(false);
            if (!file) return;
            ev.preventDefault();
            void store.searchWithProbeFile(file);
          }}
        >
          <label className="probe-pick" title="用一个外部参考音频搜索（≤60 秒）">
            拖入参考音频
            <input
              type="file"
              accept="audio/*,.wav,.flac,.mp3,.aiff,.aif,.ogg,.m4a"
              style={{ display: 'none' }}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                // Reset so picking the same file twice still fires.
                ev.target.value = '';
                if (file) void store.searchWithProbeFile(file);
              }}
            />
          </label>
          <button
            disabled={!hasSelection}
            onClick={() => void store.searchWithSelection()}
            title={
              hasSelection
                ? '用波形上选中的那一段去搜相似的'
                : '先在底部波形上拖出一段选区'
            }
          >
            搜选区
          </button>
        </div>
      )}

      {/* Warnings from the reference itself: the honest reason a result set is weak. */}
      {probe?.preview && probe.preview.warnings.length > 0 && (
        <div className="fx-error" style={{ marginTop: 4 }}>
          {probe.preview.warnings.join('；')}
        </div>
      )}
    </div>
  );
}
