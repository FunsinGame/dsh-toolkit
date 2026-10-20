import { useEffect, useRef, useState } from 'react';

import { getPlayer, type PlayerState } from './audio/player.ts';
import { chainForPanelState } from './audio/effectPanel.ts';
import { requestPlay } from './audio/playback.ts';
import { DetailsPane } from './components/DetailsPane.tsx';
import { ComparePane } from './components/ComparePane.tsx';
import { EffectsPane } from './components/EffectsPane.tsx';
import { MixerPane } from './components/MixerPane.tsx';
import { ResultsPane } from './components/ResultsPane.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { ImportOverlay } from './components/ImportOverlay.tsx';
import { Transport } from './components/Transport.tsx';
import { store, type OpenPanel } from './state/store.ts';
import { panelFromPersisted } from './state/openPanel.ts';
import { useAppState } from './state/useAppState.ts';

export function App({ bootError }: { bootError: string | null }): React.JSX.Element {
  const state = useAppState();
  const [playback, setPlayback] = useState<PlayerState>(() => getPlayer().getState());

  /**
   * Which panel is open above the transport.
   *
   * Remembered across reloads: a user who is shaping a sound does not want to reopen
   * the panel every time, but a user who never uses it should never see it. Kept in
   * the store rather than in local state because three components need to agree on it
   * — the transport buttons that toggle it and the panel bodies that render from it —
   * and because exactly one may be open (see `OpenPanel`).
   */
  const [initialPanel] = useState<OpenPanel>(() => {
    try {
      // Anything unrecognised in storage reads as "nothing open", so a stale or
      // hand-edited value cannot leave the UI with a panel it has no button for.
      return panelFromPersisted(window.localStorage.getItem('sounddesk.openPanel'));
    } catch {
      return null;
    }
  });
  const openPanel = state.openPanel;

  /**
   * The effect panel's open state *is* the master bypass.
   *
   * Opening it enables the chain; closing it disables the chain but keeps every
   * setting, so "close, listen to the original, reopen, carry on tweaking" works.
   * Clearing the chain on close would instead throw away the work, which is the one
   * thing a user shaping a sound does not want.
   */
  function applyPanelState(open: boolean): void {
    const player = getPlayer();
    const next = chainForPanelState(player.getChain(), open);
    // `null` means the flag already agrees; skipping avoids needlessly touching the
    // live audio graph.
    if (next) player.setChain(next);
  }

  /**
   * Hand the remembered choice to the store, then keep the two in step.
   *
   * `initialPanel` is read once from storage and pushed in, rather than living in both
   * places: after this the store is the single source of truth and this effect only
   * writes back what it says.
   */
  useEffect(() => {
    if (initialPanel) store.setOpenPanel(initialPanel);
    return store.subscribe(() => {
      const panel = store.getState().openPanel;
      try {
        if (panel) window.localStorage.setItem('sounddesk.openPanel', panel);
        else window.localStorage.removeItem('sounddesk.openPanel');
      } catch {
        /* storage disabled — the panel still works for this session */
      }
    });
  }, [initialPanel]);

  /**
   * Enforce the bypass rule whenever the effect panel opens or closes — including on
   * mount, where the remembered panel and the persisted chain can disagree: a chain
   * left enabled while the panel is closed is audio that is processed with no way to
   * see or undo it. `applyPanelState` is idempotent, so the extra call when another
   * panel is open costs nothing.
   */
  useEffect(() => {
    applyPanelState(openPanel === 'effects');
  }, [openPanel]);

  // Which mixer track's chain the effects panel is editing, if any.
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);

  useEffect(() => getPlayer().subscribe(setPlayback), []);

  // Deep link: `?q=…` prefills a query and `?play=<id>` starts that asset.
  // Both make the UI linkable (and scriptable for screenshot checks).
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !state.ready) return;
    deepLinkDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const play = Number(params.get('play'));
    if (q) {
      store.setQuery(q);
      void store.runSearch();
    }
    if (Number.isFinite(play) && play > 0) {
      void store
        .select({ asset: { id: play } as never, score: { confidence: 1 } as never, highlights: [] })
        .then(() => requestPlay(play));
    }
  }, [state.ready]);

  if (bootError) {
    return (
      <div className="center-msg">
        <h2>无法连接本地引擎</h2>
        <div style={{ maxWidth: 520 }}>{bootError}</div>
        <div style={{ fontSize: 12, maxWidth: 520, color: 'var(--text-faint)' }}>
          先启动引擎，然后用它打印的带 <code>?token=</code> 的地址打开本页面。
        </div>
      </div>
    );
  }

  if (state.fatalError) {
    // A stale session token is by far the most common first-run problem, so it
    // gets its own heading rather than being reported as a generic engine error.
    const tokenProblem = state.fatalError.includes('会话令牌');
    return (
      <div className="center-msg">
        <h2>{tokenProblem ? '需要有效的会话令牌' : '引擎返回了错误'}</h2>
        <div style={{ maxWidth: 520 }}>{state.fatalError}</div>
        {tokenProblem && (
          <div style={{ fontSize: 12, maxWidth: 520, color: 'var(--text-faint)' }}>
            令牌每次启动引擎都会变。重新打开引擎输出的完整地址即可，无需重启引擎。
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {/*
        The import overlay is a sibling of the whole workbench and renders on top of
        it. It blocks the UI while a library is indexing because a half-indexed
        catalogue makes every count, category and result on screen wrong.
      */}
      <ImportOverlay />
      <SearchBar />
      <div className="body">
        <Sidebar />
        <div className="pane" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <ResultsPane playingId={playback.assetId} onPlay={(id) => requestPlay(id)} />
        </div>
        <div className="pane stack">
          <DetailsPane onPlay={(id) => requestPlay(id)} onSimilar={(id) => void store.findSimilar(id)} />
        </div>
      </div>
      {/*
        The working panels live above the transport as popovers, not as docked panes or
        a full-column mode. Each is a thing you open, listen through or read, and close;
        docked they permanently took width or height from the results, and 对比
        additionally displaced the whole list — which is why it used to be a mode you
        "exited". Only one is ever open, so they cannot overlap.
      */}
      <div className="transport-wrap">
        <MixerPane
          open={openPanel === 'mixer'}
          onClose={() => store.closePanel()}
          onEditChain={(trackId) => {
            setEditingTrackId(trackId);
            /*
             * Switch to the effects panel rather than closing the mixer: editing a
             * track's chain is the reason the button exists, and the popover slot only
             * holds one panel, so the mixer yields to the panel being opened. The mixer's
             * state is untouched and comes back exactly as it was.
             */
            store.setOpenPanel('effects');
          }}
        />
        <ComparePane open={openPanel === 'compare'} onClose={() => store.closePanel()} />
        <EffectsPane
          open={openPanel === 'effects'}
          trackId={editingTrackId}
          onClearTarget={() => setEditingTrackId(null)}
          onClose={() => store.closePanel()}
        />
        <Transport
          openPanel={openPanel}
          onToggleEffects={() => store.togglePanel('effects')}
          onToggleMixer={() => store.togglePanel('mixer')}
          onToggleCompare={() => store.togglePanel('compare')}
        />
      </div>
    </div>
  );
}
