/**
 * Bottom bar: transport, waveform, and the playback controls that the reference
 * product treats as core workflow (loop, reverse, tape-style speed).
 *
 * Renders nothing but a hint when no track is loaded, so the waveform pane is
 * never a source of confusion about what is playing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getPlayer, type PlayerState } from '../audio/player.ts';
import { onPlayRequest } from '../audio/playback.ts';
import { waveformColorFor } from '../audio/peaks.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatDuration } from '../util/format.ts';
import { Waveform } from './Waveform.tsx';

const player = getPlayer();

export function Transport({
  showEffects,
  onToggleEffects,
}: {
  showEffects: boolean;
  onToggleEffects: (next: boolean) => void;
}): React.JSX.Element {
  const state = useAppState();
  const [playback, setPlayback] = useState<PlayerState>(() => player.getState());

  useEffect(() => player.subscribe(setPlayback), []);

  // Consume play intents from the list and the details pane.
  useEffect(
    () =>
      onPlayRequest(({ assetId, autoplay }) => {
        const url = store.getClient().mediaUrl(assetId);
        void (async () => {
          await player.load(assetId, url);
          if (autoplay) await player.play();
        })();
      }),
    [],
  );

  // Keyboard: Esc clears the selection, Space toggles playback.
  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      const target = ev.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (ev.key === 'Escape' && !typing) player.setSelection(null);
      if (ev.code === 'Space' && !typing) {
        ev.preventDefault();
        if (player.getState().playing) player.pause();
        else void player.play();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = state.selected;
  const duration = playback.duration || (selected?.durationMs ? selected.durationMs / 1000 : 0);
  const playhead = duration > 0 ? playback.position / duration : null;

  return (
    <div className="transport">
      <div className="title">
        {playback.assetId !== null ? (
          <>
            {state.hits.find((h) => h.asset.id === playback.assetId)?.asset.filename ?? `#${playback.assetId}`}
            <small>
              {formatDuration(playback.position * 1000)} / {formatDuration(duration * 1000)}
              {playback.rate !== 1 ? ` · ${playback.rate.toFixed(2)}×` : ''}
              {playback.reverse ? ' · 倒放' : ''}
              {playback.error ? ` · ${playback.error}` : ''}
            </small>
          </>
        ) : (
          <>
            未加载素材
            <small>双击结果行试听</small>
          </>
        )}
      </div>

      <div>
        <Waveform
          peaksUrl={playback.assetId !== null ? store.getClient().peaksUrl(playback.assetId) : null}
          assetKey={playback.assetId}
          playhead={playhead}
          duration={duration}
          selection={playback.selection}
          color={playback.assetId !== null ? waveformColorFor(playback.assetId) : '#58a6ff'}
          onSeek={(seconds) => player.seek(seconds)}
          onSelectionChange={(selection) => player.setSelection(selection)}
        />
        <div className="controls" style={{ marginTop: 6 }}>
          <button onClick={() => (playback.playing ? player.pause() : void player.play())} disabled={playback.assetId === null}>
            {playback.playing ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => player.seek(0)}
            disabled={playback.assetId === null}
            title="回到开头"
          >
            ⏮
          </button>
          <button
            className={playback.loop ? 'active' : ''}
            onClick={() => player.setLoop(!playback.loop)}
            title="循环（有选区时只在选区内循环）"
          >
            ↻
          </button>
          <button
            className={playback.reverse ? 'active' : ''}
            onClick={() => void player.setReverse(!playback.reverse)}
            title="倒放"
          >
            ⇄
          </button>
          <div className="rates">
            <label title="磁带式变速：速度和音高一起变">速度</label>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={playback.rate}
              onChange={(ev) => player.setRate(Number(ev.target.value))}
            />
            <span style={{ width: 44, textAlign: 'right' }}>{playback.rate.toFixed(2)}×</span>
            <button onClick={() => player.setRate(1)} title="复位速度">
              1×
            </button>
          </div>
          <div className="rates">
            <label>音量</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={playback.volume}
              onChange={(ev) => player.setVolume(Number(ev.target.value))}
            />
          </div>
          {playback.selection && (
            <span className="count">
              选区 {playback.selection.start.toFixed(2)}s–{playback.selection.end.toFixed(2)}s
              <button style={{ marginLeft: 6, padding: '0 6px' }} onClick={() => player.setSelection(null)}>
                清除
              </button>
            </span>
          )}
          <button
            className={showEffects ? 'active' : ''}
            onClick={() => onToggleEffects(!showEffects)}
            title="效果链：EQ / 失真 / 混响 / 距离 / 包络，仅影响试听"
          >
            效果
            {!playback.chainNeutral ? ' •' : ''}
          </button>
        </div>
      </div>

      <div className="meta">
        {state.host === 'vscode' ? 'VSCode 内运行' : '浏览器运行'}
        {state.stats && !state.stats.modelsReady ? ' · 语义搜索未启用' : ''}
      </div>
    </div>
  );
}
