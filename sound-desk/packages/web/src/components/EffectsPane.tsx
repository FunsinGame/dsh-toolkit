/**
 * Effect chain panel — plan §8 / P2-1.
 *
 * Two things this panel must never do, because they are the difference between a
 * tool people trust and one they do not:
 *
 *  1. **Never imply the file changed.** The header says so explicitly, and the
 *     only control that writes anything is the export button, which creates a
 *     *new* file.
 *  2. **Never leave bypass ambiguous.** There is a master bypass and a master
 *     reset, and a "neutral" indicator whenever the chain is transparent, so the
 *     user can always tell whether what they hear is the original.
 *
 * Controls are grouped by slot and only the active slot's parameters are shown,
 * which keeps the panel usable at the width the right pane actually has.
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_EFFECT_CHAIN,
  EFFECT_PRESETS,
  REVERB_SPACES,
  type EffectChain,
  type ReverbSpace,
} from '@sounddesk/audio-effects';
import { getPlayer, type PlayerState } from '../audio/player.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatBytes, formatDuration } from '../util/format.ts';

const player = getPlayer();

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="fx-row">
      <label>{label}</label>
      <div className="fx-control">{children}</div>
    </div>
  );
}

/** A labelled range with a numeric read-out and a double-click reset. */
function Slider({
  value,
  min,
  max,
  step,
  suffix = '',
  digits = 2,
  neutral,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  digits?: number;
  neutral: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(ev) => onChange(Number(ev.target.value))}
        onDoubleClick={() => onChange(neutral)}
        title="双击复位"
      />
      <span className="fx-value">
        {value.toFixed(digits)}
        {suffix}
      </span>
    </>
  );
}

function Slot({
  title,
  enabled,
  onToggle,
  children,
  hint,
}: {
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className={`fx-slot${enabled ? ' on' : ''}`}>
      <label className="fx-slot-head">
        <input type="checkbox" checked={enabled} onChange={(ev) => onToggle(ev.target.checked)} />
        <span>{title}</span>
        {hint ? <span className="fx-hint">{hint}</span> : null}
      </label>
      {enabled ? <div className="fx-slot-body">{children}</div> : null}
    </div>
  );
}

export function EffectsPane(): React.JSX.Element {
  const state = useAppState();
  const [playback, setPlayback] = useState<PlayerState>(() => player.getState());
  useEffect(() => player.subscribe(setPlayback), []);

  const chain = playback.chain;
  const update = (patch: Partial<EffectChain>): void => player.setChain({ ...chain, ...patch });
  const updateEq = (id: string, patch: Partial<EffectChain['eq'][number]>): void =>
    player.setChain({ ...chain, eq: chain.eq.map((band) => (band.id === id ? { ...band, ...patch } : band)) });

  const asset = state.selected;
  const canExport = asset !== null && !state.exporting;

  return (
    <div className="pane effects">
      <div className="pane-head">
        <span>效果链（仅试听）</span>
        <span className="count">
          {state.exporting
            ? `导出中 ${(state.exportProgress * 100).toFixed(0)}%`
            : playback.chainNeutral
              ? '原声'
              : '已修改'}
        </span>
      </div>

      <div className="section">
        <div className="fx-toolbar">
          <button
            className={chain.enabled ? 'active' : ''}
            onClick={() => update({ enabled: !chain.enabled })}
            title="总旁通：关闭后完全听原声，参数保留"
          >
            {chain.enabled ? '旁通' : '已旁通'}
          </button>
          <button onClick={() => player.resetChain()} title="把所有参数复位为原声">
            复位
          </button>
          <select
            value=""
            onChange={(ev) => {
              const preset = EFFECT_PRESETS.find((p) => p.id === ev.target.value);
              if (preset) player.setChain(preset.apply(chain));
              ev.target.value = '';
            }}
            title="套用预设"
          >
            <option value="">预设…</option>
            {EFFECT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <Row label="总混合">
          <Slider
            value={chain.mix}
            min={0}
            max={1}
            step={0.01}
            neutral={DEFAULT_EFFECT_CHAIN.mix}
            onChange={(mix) => update({ mix })}
          />
        </Row>
        <Row label="输出增益">
          <Slider
            value={chain.outputGain}
            min={0}
            max={2}
            step={0.01}
            neutral={DEFAULT_EFFECT_CHAIN.outputGain}
            onChange={(outputGain) => update({ outputGain })}
          />
        </Row>
      </div>

      <div className="section">
        <h3>EQ</h3>
        {chain.eq.map((band) => (
          <Slot
            key={band.id}
            title={
              band.kind === 'highpass'
                ? '低切'
                : band.kind === 'lowshelf'
                  ? '低频搁架'
                  : band.kind === 'peaking'
                    ? '中频'
                    : '高频搁架'
            }
            enabled={band.enabled}
            onToggle={(enabled) => updateEq(band.id, { enabled })}
          >
            {band.kind !== 'highpass' && (
              <Row label="增益">
                <Slider
                  value={band.gainDb}
                  min={-24}
                  max={24}
                  step={0.5}
                  digits={1}
                  suffix=" dB"
                  neutral={0}
                  onChange={(gainDb) => updateEq(band.id, { gainDb })}
                />
              </Row>
            )}
            <Row label="频率">
              <Slider
                value={band.frequency}
                min={20}
                max={20000}
                step={10}
                digits={0}
                suffix=" Hz"
                neutral={band.frequency}
                onChange={(frequency) => updateEq(band.id, { frequency })}
              />
            </Row>
          </Slot>
        ))}
      </div>

      <div className="section">
        <h3>失真</h3>
        <Slot
          title="饱和 / 过载"
          enabled={chain.distortion.enabled}
          onToggle={(enabled) => update({ distortion: { ...chain.distortion, enabled } })}
        >
          <Row label="驱动">
            <Slider
              value={chain.distortion.drive}
              min={0}
              max={1}
              step={0.01}
              neutral={DEFAULT_EFFECT_CHAIN.distortion.drive}
              onChange={(drive) => update({ distortion: { ...chain.distortion, drive } })}
            />
          </Row>
          <Row label="干湿">
            <Slider
              value={chain.distortion.mix}
              min={0}
              max={1}
              step={0.01}
              neutral={DEFAULT_EFFECT_CHAIN.distortion.mix}
              onChange={(mix) => update({ distortion: { ...chain.distortion, mix } })}
            />
          </Row>
        </Slot>
      </div>

      <div className="section">
        <h3>混响</h3>
        <Slot
          title="空间"
          enabled={chain.reverb.enabled}
          onToggle={(enabled) => update({ reverb: { ...chain.reverb, enabled } })}
        >
          <Row label="预设">
            <select
              value={chain.reverb.space}
              onChange={(ev) => {
                const space = ev.target.value as ReverbSpace;
                // decay follows the space, which is what makes the presets read
                // as rooms rather than as two unrelated knobs
                update({ reverb: { ...chain.reverb, space, decaySeconds: REVERB_SPACES[space].decaySeconds } });
              }}
            >
              {Object.entries(REVERB_SPACES).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="衰减">
            <Slider
              value={chain.reverb.decaySeconds}
              min={0.2}
              max={8}
              step={0.1}
              digits={1}
              suffix=" s"
              neutral={REVERB_SPACES[chain.reverb.space].decaySeconds}
              onChange={(decaySeconds) => update({ reverb: { ...chain.reverb, decaySeconds } })}
            />
          </Row>
          <Row label="干湿">
            <Slider
              value={chain.reverb.mix}
              min={0}
              max={1}
              step={0.01}
              neutral={DEFAULT_EFFECT_CHAIN.reverb.mix}
              onChange={(mix) => update({ reverb: { ...chain.reverb, mix } })}
            />
          </Row>
        </Slot>
      </div>

      <div className="section">
        <h3>距离</h3>
        <Slot
          title="远近"
          enabled={chain.distance.enabled}
          onToggle={(enabled) => update({ distance: { ...chain.distance, enabled } })}
          hint="高频滚降 + 直达/混响比"
        >
          <Row label="距离">
            <Slider
              value={chain.distance.amount}
              min={0}
              max={1}
              step={0.01}
              neutral={DEFAULT_EFFECT_CHAIN.distance.amount}
              onChange={(amount) => update({ distance: { ...chain.distance, amount } })}
            />
          </Row>
        </Slot>
      </div>

      <div className="section">
        <h3>包络（ADSR）</h3>
        <Slot
          title="起止淡入淡出"
          enabled={chain.envelope.enabled}
          onToggle={(enabled) => update({ envelope: { ...chain.envelope, enabled } })}
          hint="在素材时长内生效"
        >
          <Row label="起音">
            <Slider
              value={chain.envelope.attackMs}
              min={0}
              max={2000}
              step={1}
              digits={0}
              suffix=" ms"
              neutral={DEFAULT_EFFECT_CHAIN.envelope.attackMs}
              onChange={(attackMs) => update({ envelope: { ...chain.envelope, attackMs } })}
            />
          </Row>
          <Row label="衰减">
            <Slider
              value={chain.envelope.decayMs}
              min={0}
              max={5000}
              step={1}
              digits={0}
              suffix=" ms"
              neutral={DEFAULT_EFFECT_CHAIN.envelope.decayMs}
              onChange={(decayMs) => update({ envelope: { ...chain.envelope, decayMs } })}
            />
          </Row>
          <Row label="延持">
            <Slider
              value={chain.envelope.sustain}
              min={0}
              max={1}
              step={0.01}
              neutral={DEFAULT_EFFECT_CHAIN.envelope.sustain}
              onChange={(sustain) => update({ envelope: { ...chain.envelope, sustain } })}
            />
          </Row>
          <Row label="释音">
            <Slider
              value={chain.envelope.releaseMs}
              min={0}
              max={5000}
              step={1}
              digits={0}
              suffix=" ms"
              neutral={DEFAULT_EFFECT_CHAIN.envelope.releaseMs}
              onChange={(releaseMs) => update({ envelope: { ...chain.envelope, releaseMs } })}
            />
          </Row>
        </Slot>
      </div>

      <div className="section">
        <h3>导出</h3>
        <div className="fx-hint" style={{ marginBottom: 6 }}>
          试听效果不会改动原文件。导出会用同一套节点离线渲染成一个<strong>新文件</strong>
          （文件名加 <code>_fx</code>），已存在的文件绝不覆盖。
        </div>
        <button
          disabled={!canExport}
          onClick={() => {
            if (asset) void store.exportEffect(asset.id, asset.filename);
          }}
          title={asset ? `导出 ${asset.filename} 的效果版本` : '先在左侧选中一条素材'}
        >
          {state.exporting ? `渲染中… ${(state.exportProgress * 100).toFixed(0)}%` : '导出效果版（_fx）'}
        </button>
        {asset && (
          <span className="count" style={{ marginLeft: 6 }}>
            当前：{asset.filename}
          </span>
        )}

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
              {formatBytes(state.exportResult.bytes)} · {formatDuration(state.exportResult.durationSeconds * 1000)}
              {state.exportResult.renamed ? ' · 同名文件已存在，自动改名' : ''}
            </div>
            <button style={{ marginTop: 4 }} onClick={() => store.clearExportStatus()}>
              知道了
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
