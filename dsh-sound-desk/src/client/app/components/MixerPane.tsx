/**
 * Multi-track mixer panel — plan §8, "多轨叠层（≤4 轨）".
 *
 * The workflow this is built around: find a sound, add it as a layer, then shape
 * the blend. So the primary action is a single button ("加入多轨") and every layer
 * gets fader / pan / offset / trim plus its own effect chain, reachable from here.
 *
 * Two deliberate choices:
 *
 *  - Adding a track always **starts its own effect chain neutral**. Inheriting the
 *    current preview chain would mean "layer this under what I just made", which is
 *    sometimes wanted and usually surprising; a neutral start is predictable and
 *    the chain is one click away.
 *  - The default offset **staggers** rather than stacking at zero. Four sounds
 *    starting together is a wall of noise and tells you nothing; hearing them in
 *    sequence is how you compare candidates. Stacking is still one click.
 */

import { useEffect, useState } from 'react';

import { MAX_TRACKS } from '@sounddesk/audio-effects';
import { getMixer, type MixerState, type StaggerMode } from '../audio/mixer.ts';
import { getPlayer } from '../audio/player.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatBytes, formatDuration } from '../util/format.ts';
import { Popover } from './Popover.tsx';

const mixer = getMixer();

const STAGGER_LABELS: Record<StaggerMode, string> = {
  sequential: '顺序错开',
  overlap: '部分重叠',
  together: '全部齐发',
};

export function MixerPane({
  open,
  onEditChain,
  onClose,
}: {
  open: boolean;
  onEditChain: (trackId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const state = useAppState();
  const [mix, setMix] = useState<MixerState>(() => mixer.getState());
  const [stagger, setStagger] = useState<StaggerMode>('sequential');
  const [masterVolume, setMasterVolume] = useState(() => mixer.getMasterVolume());

  useEffect(() => mixer.subscribe(setMix), []);

  const selected = state.selected;
  const canAdd = mixer.canAdd && selected !== null && !mix.loading;

  async function addSelected(): Promise<void> {
    if (!selected) return;
    const url = store.getClient().mediaUrl(selected.id);
    await mixer.addTrack({
      assetId: selected.id,
      label: selected.filename,
      url,
      stagger,
    });
  }

  return (
    <Popover
      open={open}
      testId="popover-mixer"
      title="多轨叠层"
      hint={`${mix.tracks.length}/${MAX_TRACKS}${mix.loading ? ' · 载入中' : ''}`}
      onClose={onClose}
    >
      <div className="section">
        <div className="fx-toolbar">
          <button disabled={!canAdd} onClick={() => void addSelected()} title="把当前选中的素材加入多轨">
            加入多轨
          </button>
          <select value={stagger} onChange={(ev) => setStagger(ev.target.value as StaggerMode)} title="新轨的起始位置">
            {(Object.keys(STAGGER_LABELS) as StaggerMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {STAGGER_LABELS[mode]}
              </option>
            ))}
          </select>
          <button
            onClick={() => (mix.playing ? mixer.pause() : mixer.play())}
            disabled={mix.tracks.length === 0}
            title="试听混音（会暂停单条试听）"
          >
            {mix.playing ? '⏸ 混音' : '▶ 混音'}
          </button>
          <button onClick={() => mixer.stop()} disabled={mix.tracks.length === 0}>
            ⏹
          </button>
          <button onClick={() => mixer.clear()} disabled={mix.tracks.length === 0} title="清空所有轨道">
            清空
          </button>
        </div>

        {mix.tracks.length > 0 && (
          <div className="kv" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>
              {formatDuration(mix.position * 1000)} / {formatDuration(mix.duration * 1000)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0.01, mix.duration)}
              step={0.01}
              value={Math.min(mix.position, mix.duration)}
              onChange={(ev) => mixer.seek(Number(ev.target.value))}
              style={{ flex: '1 1 auto' }}
            />
          </div>
        )}

        {mix.tracks.length > 0 && (
          <div className="fx-row">
            <label>总音量</label>
            <div className="fx-control">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={masterVolume}
                onChange={(ev) => {
                  const next = Number(ev.target.value);
                  setMasterVolume(next);
                  mixer.setMasterVolume(next);
                }}
                onDoubleClick={() => {
                  setMasterVolume(1);
                  mixer.setMasterVolume(1);
                }}
              />
              <span className="fx-value">{masterVolume.toFixed(2)}</span>
            </div>
          </div>
        )}

        {mix.error && <div className="fx-error">{mix.error}</div>}
        {mix.tracks.length === 0 && (
          <div className="fx-hint">
            先在左侧选中一条素材，点「加入多轨」。每个轨道有自己的音量、声像、起始位置和效果链；
            试听不会改动任何文件。
          </div>
        )}
      </div>

      {mix.tracks.map((track, index) => (
        <div className="section mx-track" key={track.id}>
          <div className="mx-head">
            <span className="mx-index">{index + 1}</span>
            <span className="mx-label" title={track.label}>
              {track.label}
            </span>
            <button
              className={track.mute ? 'active' : ''}
              onClick={() => mixer.updateTrack(track.id, { mute: !track.mute })}
              title="静音"
            >
              M
            </button>
            <button
              className={track.solo ? 'active' : ''}
              onClick={() => mixer.updateTrack(track.id, { solo: !track.solo })}
              title="独奏"
            >
              S
            </button>
            <button onClick={() => onEditChain(track.id)} title="编辑这条轨道自己的效果链">
              效果
            </button>
            <button onClick={() => mixer.removeTrack(track.id)} title="移除这条轨道">
              ✕
            </button>
          </div>

          {track.loadError ? (
            <div className="fx-error">载入失败：{track.loadError}</div>
          ) : track.buffer === null ? (
            <div className="fx-hint">载入中…</div>
          ) : (
            <>
              <div className="fx-row">
                <label>音量</label>
                <div className="fx-control">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={track.volume}
                    onChange={(ev) => mixer.updateTrack(track.id, { volume: Number(ev.target.value) })}
                  />
                  <span className="fx-value">{track.volume.toFixed(2)}</span>
                </div>
              </div>
              <div className="fx-row">
                <label>声像</label>
                <div className="fx-control">
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.02}
                    value={track.pan}
                    onChange={(ev) => mixer.updateTrack(track.id, { pan: Number(ev.target.value) })}
                    onDoubleClick={() => mixer.updateTrack(track.id, { pan: 0 })}
                  />
                  <span className="fx-value">
                    {track.pan === 0 ? '居中' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}
                  </span>
                </div>
              </div>
              <div className="fx-row">
                <label>起始</label>
                <div className="fx-control">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.round(mix.duration * 100) / 100)}
                    step={0.01}
                    value={track.startSeconds}
                    onChange={(ev) => mixer.updateTrack(track.id, { startSeconds: Number(ev.target.value) })}
                  />
                  <span className="fx-value">{track.startSeconds.toFixed(2)}s</span>
                </div>
              </div>
              <div className="kv">
                原始 {formatDuration(track.buffer.duration * 1000)}
                {track.chain.enabled ? '' : ' · 效果已旁通'}
                {' · '}
                <button
                  style={{ padding: '0 6px' }}
                  onClick={() => mixer.updateTrack(track.id, { chain: getPlayer().getChain() })}
                  title="把当前试听链复制到这条轨道"
                >
                  复制当前效果链
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="section">
        <h3>多轨导出</h3>
        <div className="fx-hint" style={{ marginBottom: 6 }}>
          用与试听完全相同的节点离线渲染。混音导出为一个文件，分轨导出每轨一个文件；
          文件名加 <code>_fx</code>，已存在的文件绝不覆盖。
        </div>
        <div className="fx-toolbar">
          <button
            disabled={mix.tracks.length === 0 || state.exporting}
            onClick={() => void store.exportMix('mix')}
          >
            {state.exporting ? `渲染中… ${(state.exportProgress * 100).toFixed(0)}%` : '导出混音'}
          </button>
          <button
            disabled={mix.tracks.length === 0 || state.exporting}
            onClick={() => void store.exportMix('stems')}
            title="每轨一个文件（分轨拖进 DAW）"
          >
            导出分轨
          </button>
        </div>

        {state.exportError && (
          <div className="fx-error">
            导出失败：{state.exportError}
            <button style={{ marginLeft: 6, padding: '0 6px' }} onClick={() => store.clearExportStatus()}>
              知道了
            </button>
          </div>
        )}

        {state.exportResult && (
          <div className="fx-ok">
            已写出 <code>{state.exportResult.filePath}</code>
            <div className="count">
              {formatBytes(state.exportResult.bytes)} ·{' '}
              {formatDuration(state.exportResult.durationSeconds * 1000)}
            </div>
            {state.exportResult.files && state.exportResult.files.length > 1 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11 }}>
                {state.exportResult.files.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
                ))}
              </ul>
            )}
            <button style={{ marginTop: 4 }} onClick={() => store.clearExportStatus()}>
              知道了
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}
