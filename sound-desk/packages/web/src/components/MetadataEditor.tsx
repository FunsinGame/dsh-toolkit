/**
 * Embedded-metadata editor.
 *
 * This is the one place in the app that **writes into the user's audio files**,
 * so the UI is deliberately explicit:
 *
 *  - the form only appears for WAV/BWF (the engine refuses anything else, and we
 *    say why rather than hiding the reason),
 *  - saving asks for confirmation first, showing exactly which fields changed,
 *  - the engine takes a backup before the first write, and the panel offers a
 *    restore so the action is reversible,
 *  - warnings from the engine (e.g. "no bext block, wrote to iXML") are surfaced
 *    rather than swallowed.
 */

import { useEffect, useState } from 'react';

import type { Asset } from '@sounddesk/core';

import { store } from '../state/store.ts';
import type { EmbeddedInfo } from '../api/client.ts';

const FIELDS: Array<{ key: keyof Draft; label: string; hint: string }> = [
  { key: 'description', label: '描述', hint: '声音是什么，一句话' },
  { key: 'keywords', label: '关键词', hint: '逗号分隔' },
  { key: 'designer', label: '设计师', hint: '' },
  { key: 'recorder', label: '录音师', hint: '' },
  { key: 'library', label: '素材库', hint: '' },
  { key: 'copyright', label: '版权', hint: '' },
  { key: 'scene', label: '场次', hint: '' },
  { key: 'take', label: '镜次', hint: '' },
  { key: 'note', label: '备注', hint: '' },
];

interface Draft {
  description: string;
  keywords: string;
  designer: string;
  recorder: string;
  library: string;
  copyright: string;
  scene: string;
  take: string;
  note: string;
}

const EMPTY: Draft = {
  description: '',
  keywords: '',
  designer: '',
  recorder: '',
  library: '',
  copyright: '',
  scene: '',
  take: '',
  note: '',
};

function draftFrom(asset: Asset): Draft {
  const em = asset.embedded;
  return {
    description: em?.description ?? '',
    keywords: em?.keywords?.join(', ') ?? '',
    designer: em?.designer ?? '',
    recorder: em?.recorder ?? '',
    library: em?.library ?? '',
    copyright: em?.copyright ?? '',
    scene: em?.scene ?? '',
    take: em?.take ?? '',
    note: em?.note ?? '',
  };
}

export function MetadataEditor({ asset }: { asset: Asset }): React.JSX.Element {
  const [info, setInfo] = useState<EmbeddedInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(asset));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    setError(null);
    setEditing(false);
    setConfirming(false);
    setDraft(draftFrom(asset));
    store
      .getClient()
      .embeddedInfo(asset.id)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  const original = draftFrom(asset);
  const changed = FIELDS.filter((f) => draft[f.key] !== original[f.key]);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const field of changed) {
        if (field.key === 'keywords') {
          fields.keywords = draft.keywords
            .split(/[,，;；]/)
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          fields[field.key] = draft[field.key];
        }
      }
      const result = await store.getClient().updateEmbedded(asset.id, fields, true);
      setMessage(
        `已写回原文件（${result.bytesBefore} → ${result.bytesAfter} 字节）` +
          (result.backupPath ? '，原文件已备份' : '') +
          (result.warnings.length > 0 ? `。注意：${result.warnings.join('；')}` : ''),
      );
      setEditing(false);
      setConfirming(false);
      setInfo((current) => (current ? { ...current, hasBackup: true } : current));
      await store.refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const ok = await store.getClient().restoreEmbedded(asset.id);
      setMessage(ok ? '已从备份恢复原文件' : '没有找到备份');
      await store.refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const editable = info?.editable ?? false;

  return (
    <div className="section">
      <h3>内嵌元数据</h3>

      {!editing && (
        <>
          <ReadOnlyFields asset={asset} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              disabled={!editable}
              title={
                editable
                  ? '写回音频文件本身（会先备份）'
                  : (info?.reason ?? '检查中…')
              }
              onClick={() => setEditing(true)}
            >
              编辑内嵌元数据
            </button>
            {info?.hasBackup && (
              <button disabled={busy} onClick={() => void restore()} title="把文件恢复成首次编辑前的样子">
                从备份恢复
              </button>
            )}
            {!editable && info?.reason && <span className="count">{info.reason}</span>}
          </div>
        </>
      )}

      {editing && (
        <>
          <div className="editgrid">
            {FIELDS.map((field) => (
              <label key={field.key}>
                <span className="count">{field.label}</span>
                <input
                  value={draft[field.key]}
                  placeholder={field.hint}
                  onChange={(ev) => setDraft({ ...draft, [field.key]: ev.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="notice" style={{ border: 'none', padding: '6px 0', color: 'var(--text-dim)' }}>
            写回会直接修改磁盘上的音频文件，并先做一次备份。只对 WAV/BWF 生效；
            不想动原文件就用「我的标签」，那存在旁挂数据里。
          </div>

          {changed.length > 0 && (
            <div className="kv">
              将修改：{changed.map((f) => f.label).join('、')}
            </div>
          )}

          {!confirming ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button disabled={changed.length === 0 || busy} onClick={() => setConfirming(true)}>
                保存到文件…
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setDraft(draftFrom(asset));
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="confirm">
              <div>
                确认写入 <b>{asset.filename}</b>？
              </div>
              <div className="count">
                {changed.map((f) => `${f.label}: ${original[f.key] || '（空）'} → ${draft[f.key] || '（空）'}`).join('　')}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button disabled={busy} onClick={() => void save()}>
                  {busy ? '写入中…' : '确认写入'}
                </button>
                <button disabled={busy} onClick={() => setConfirming(false)}>
                  再想想
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message && <div className="notice" style={{ border: 'none', padding: '6px 0', color: 'var(--green)' }}>{message}</div>}
      {error && <div className="notice error" style={{ border: 'none', padding: '6px 0' }}>{error}</div>}
    </div>
  );
}

function ReadOnlyFields({ asset }: { asset: Asset }): React.JSX.Element {
  const em = asset.embedded;
  const rows: Array<[string, string | null | undefined]> = [
    ['描述', em?.description],
    ['关键词', em?.keywords?.join(', ')],
    ['设计师', em?.designer],
    ['录音师', em?.recorder],
    ['素材库', em?.library],
    ['来源', em?.originator],
    ['录音日期', em?.originationDate],
    ['项目', em?.project],
    ['场次', em?.scene],
    ['版权', em?.copyright],
  ];
  const present = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) {
    return <div className="count">这个文件里没有内嵌描述信息。</div>;
  }
  return (
    <dl>
      {present.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {em?.hasBext && (
        <div style={{ display: 'contents' }}>
          <dt>BWF</dt>
          <dd>含 bext 块{em.codingHistory && em.codingHistory.length > 0 ? `（${em.codingHistory.length} 条编码历史）` : ''}</dd>
        </div>
      )}
    </dl>
  );
}
