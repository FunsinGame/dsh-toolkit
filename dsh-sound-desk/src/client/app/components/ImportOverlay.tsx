/**
 * Full-screen import progress. Blocks the workbench while a library is being
 * indexed.
 *
 * Why full-screen and blocking rather than a corner spinner: a half-indexed library
 * makes every number on screen wrong — asset counts, the UCS tree and any search
 * result are all mid-flight — so letting the user keep clicking would be inviting
 * them to act on values that are about to change. The user asked for exactly this,
 * and it is also the honest presentation of "the catalogue is not consistent yet".
 *
 * The bar is derived from the engine's own job events (see `state/importProgress.ts`),
 * so it cannot disagree with what the indexer is actually doing.
 */

import { useMemo } from 'react';

import {
  formatImportCount,
  formatPercent,
  phaseLabel,
  summarizeImport,
  type ImportProgress,
} from '../state/importProgress.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';

/** Fallback label when a phase has not reported itself yet. */
const STARTING = '正在准备…';

function progressOf(state: ReturnType<typeof useAppState>): ImportProgress | null {
  const active = state.libraryImport;
  if (!active) return null;
  return summarizeImport({
    jobs: state.jobs,
    libraryId: active.libraryId,
    libraryName: active.libraryName,
  });
}

export function ImportOverlay(): React.JSX.Element | null {
  const state = useAppState();
  const progress = useMemo(() => progressOf(state), [state]);

  // A completed import shows a dismissible summary instead of the blocking screen:
  // the work is done, so the user must be able to get back to the tool.
  if (!state.libraryImport) {
    if (state.libraryImportDone) return <ImportSummary done={state.libraryImportDone} />;
    return null;
  }

  const label = progress?.busy && progress.phaseLabel ? progress.phaseLabel : STARTING;
  const percent = formatPercent(progress?.overallFraction ?? null);
  const elapsed = Math.max(0, Math.round((Date.now() - state.libraryImport.startedAt) / 1000));

  return (
    <div className="import-overlay" role="alertdialog" aria-modal="true" aria-label="正在导入素材库">
      <div className="import-card">
        <div className="import-title">
          正在导入「{state.libraryImport.libraryName}」
        </div>
        <div className="import-phase">
          <span>{label}</span>
          {progress && progress.total > 0 && <span className="count">{formatImportCount(progress)}</span>}
        </div>

        {/*
          An indeterminate bar when no total is known yet, rather than a 0% that would
          look stuck: the scanner has to walk the tree before it can count anything.
        */}
        <div className={percent ? 'import-bar' : 'import-bar indeterminate'}>
          <div className="import-bar-fill" style={percent ? { width: percent } : undefined} />
        </div>

        <div className="import-meta">
          {percent && <span>总进度 {percent}</span>}
          <span>已用 {elapsed}s</span>
          {progress && progress.failed > 0 && <span className="import-warn">{progress.failed} 个文件失败</span>}
        </div>

        <div className="import-note">
          导入期间工具暂不可用：素材库还没索引完，此时的分类、计数和搜索结果都是不完整的。
          完成后会自动显示结果。
        </div>

        {/*
          No cancel button on purpose. Cancelling mid-scan would leave a partially
          indexed library behind with no way to tell the user which parts are real, and
          the import is bounded work that finishes on its own.
        */}
      </div>
    </div>
  );
}

/** Shown after a successful import; the only blocking screen with a way out. */
function ImportSummary({
  done,
}: {
  done: NonNullable<ReturnType<typeof useAppState>['libraryImportDone']>;
}): React.JSX.Element {
  return (
    <div className="import-overlay">
      <div className="import-card">
        <div className="import-title">「{done.name}」导入完成</div>
        <div className="import-phase">
          <span>已索引 {done.assets} 条素材</span>
        </div>
        <div className="import-meta">
          <span className="import-path" title={done.root}>
            {done.root}
          </span>
        </div>
        {done.failed > 0 && <div className="import-warn">{done.failed} 个文件未能索引</div>}
        {/*
          Saying this explicitly matters: with no model loaded the library imports fine
          but has no fingerprints, so sound-alike search will not work. Silently
          omitting it would make that look like a bug later.
        */}
        {done.embedSkipped && (
          <div className="import-note">
            未加载声音指纹模型，因此这次没有生成指纹——语义搜索和以声搜声暂时不可用。
            打开 <code>soundDesk.loadModel</code> 后重扫即可补齐。
          </div>
        )}
        <div className="import-actions">
          <button onClick={() => store.dismissImportSummary()}>开始使用</button>
        </div>
      </div>
    </div>
  );
}
