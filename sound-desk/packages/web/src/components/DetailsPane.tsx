/**
 * Right pane: everything known about the selected asset.
 *
 * The classification block shows the *evidence* and the alternatives, because a
 * classification the user cannot audit is one they will not trust. Correcting it
 * writes `source: 'manual'`, which the engine then treats as authoritative.
 */

import { useEffect, useState } from 'react';

import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { confidenceClass, formatBytes, formatDuration, formatRate, rerankReasons, sourceLabel } from '../util/format.ts';
import type { ReclassifyResult } from '../api/client.ts';
import { MetadataEditor } from './MetadataEditor.tsx';

export function DetailsPane({ onPlay, onSimilar }: { onPlay(id: number): void; onSimilar(id: number): void }): React.JSX.Element {
  const state = useAppState();
  const asset = state.selected;
  const [tagDraft, setTagDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [candidates, setCandidates] = useState<ReclassifyResult['alternatives']>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTagDraft('');
    setCategoryDraft(asset?.ucsCatId ?? '');
    setCandidates([]);
  }, [asset?.id, asset?.ucsCatId]);

  if (!asset) {
    return (
      <div className="pane details">
        <div className="center-msg">
          <div>选中一条结果查看详情</div>
          <div style={{ fontSize: 12 }}>双击结果行可直接试听</div>
        </div>
      </div>
    );
  }

  const em = asset.embedded;
  const dsp = asset.dsp;
  const reasons = rerankReasons(state.selectedScore);

  async function suggest(): Promise<void> {
    if (!asset) return;
    setBusy(true);
    try {
      const result = await store.getClient().reclassify(asset.id);
      setCandidates(result.alternatives ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pane details">
      <div className="pane-head">
        <span>详情</span>
        <span className="count">stage {asset.stage}</span>
      </div>

      <div className="section">
        <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{asset.filename}</div>
        <div className="kv">{asset.path}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={() => onPlay(asset.id)}>试听</button>
          <button onClick={() => onSimilar(asset.id)} title="以声搜声：用这条素材的声音指纹找相似的">
            找相似
          </button>
          <button onClick={() => void store.patchSelected({ favorite: !asset.favorite })}>
            {asset.favorite ? '★ 已收藏' : '☆ 收藏'}
          </button>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="section">
          <h3>排序依据</h3>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.7 }}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="kv" style={{ marginTop: 4 }}>
            重排把多条弱信号合成分数，这里列出各条的作用；没有列出的信号说明它对该结果没有倾向。
          </div>
        </div>
      )}

      <div className="section">
        <h3>技术信息</h3>
        <dl>
          <dt>时长</dt>
          <dd>{formatDuration(asset.durationMs)}</dd>
          <dt>格式</dt>
          <dd>{asset.format?.codec ?? '—'}</dd>
          <dt>采样率</dt>
          <dd>{formatRate(asset.format?.sampleRate)}</dd>
          <dt>位深</dt>
          <dd>{asset.format?.bitDepth ? `${asset.format.bitDepth} bit` : '—'}</dd>
          <dt>声道</dt>
          <dd>{asset.format?.channels ?? '—'}</dd>
          <dt>大小</dt>
          <dd>{formatBytes(asset.sizeBytes)}</dd>
        </dl>
      </div>

      {dsp && (
        <div className="section">
          <h3>声学特征</h3>
          <dl>
            <dt>峰值</dt>
            <dd>{dsp.peakDb.toFixed(1)} dB</dd>
            <dt>RMS</dt>
            <dd>{dsp.rmsDb.toFixed(1)} dB</dd>
            <dt>衰减</dt>
            <dd>{Math.round(dsp.decayMs)} ms</dd>
            <dt>谱质心</dt>
            <dd>{Math.round(dsp.spectralCentroidHz)} Hz</dd>
            <dt>高频占比</dt>
            <dd>{(dsp.highFrequencyRatio * 100).toFixed(0)}%</dd>
            <dt>调性</dt>
            <dd>{(dsp.tonality * 100).toFixed(0)}%</dd>
          </dl>
        </div>
      )}

      <div className="section">
        <h3>UCS 分类</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className={confidenceClass(asset.ucsConfidence, asset.ucsSource)}>
            {asset.ucsCatId ?? '未分类'}
          </span>
          {asset.ucsSource && (
            <span className="count" title="来源：文件名 / 内嵌元数据 / AI 零样本 / 声学规则 / 人工">
              {sourceLabel(asset.ucsSource)}
              {asset.ucsConfidence !== null ? ` ${(asset.ucsConfidence * 100).toFixed(0)}%` : ''}
            </span>
          )}
        </div>
        {asset.ucsAlternatives && asset.ucsAlternatives.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {asset.ucsAlternatives.slice(0, 3).map((alt) => (
              <div key={alt.catId} className="evidence">
                备选 {alt.catId} · {(alt.score * 100).toFixed(0)}% · {alt.evidence}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={categoryDraft}
            placeholder="CatID，如 DOORWood"
            style={{ flex: 1, minWidth: 0 }}
            onChange={(ev) => setCategoryDraft(ev.target.value.trim())}
          />
          <button
            disabled={!categoryDraft || categoryDraft === asset.ucsCatId}
            title="手动指定后，自动分类不会再覆盖它"
            onClick={() => void store.patchSelected({ ucsCatId: categoryDraft })}
          >
            订正
          </button>
        </div>
        <button style={{ marginTop: 6 }} disabled={busy} onClick={() => void suggest()}>
          {busy ? '分析中…' : '重跑分类看候选'}
        </button>
        {candidates.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {candidates.slice(0, 6).map((candidate) => (
              <button
                key={candidate.catId}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3, fontSize: 11 }}
                onClick={() => void store.patchSelected({ ucsCatId: candidate.catId })}
                title={candidate.evidence}
              >
                {candidate.catId} · {(candidate.score * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h3>我的标签</h3>
        <div className="tagline">
          {asset.tags.map((tag) => (
            <span
              key={tag}
              className="badge tag"
              title="点击移除"
              onClick={() => void store.patchSelected({ tags: asset.tags.filter((t) => t !== tag) })}
            >
              {tag} ×
            </span>
          ))}
          {asset.tags.length === 0 && <span className="count">暂无标签</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={tagDraft}
            placeholder="回车添加标签（存在旁挂数据，不改原文件）"
            style={{ flex: 1, minWidth: 0 }}
            onChange={(ev) => setTagDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key !== 'Enter') return;
              const value = tagDraft.trim();
              if (!value || asset.tags.includes(value)) {
                setTagDraft('');
                return;
              }
              void store.patchSelected({ tags: [...asset.tags, value] });
              setTagDraft('');
            }}
          />
        </div>
      </div>

      <MetadataEditor asset={asset} />

      {asset.lastError && (
        <div className="section">
          <h3>索引告警</h3>
          <div className="evidence" style={{ color: 'var(--amber)' }}>
            {asset.lastError}
          </div>
        </div>
      )}
    </div>
  );
}
