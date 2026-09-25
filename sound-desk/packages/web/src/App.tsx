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
import { store } from './state/store.ts';
import { useAppState } from './state/useAppState.ts';

export function App({ bootError }: { bootError: string | null }): React.JSX.Element {
  const state = useAppState();
  const [playback, setPlayback] = useState<PlayerState>(() => getPlayer().getState());
  // Remembered across reloads: a user who is shaping a sound does not want to
  // reopen the panel every time, but a user who never uses it should never see it.
  const [showEffects, setShowEffects] = useState(() => {
    try {
      return window.localStorage.getItem('sounddesk.effectsOpen') === '1';
    } catch {
      return false;
    }
  });

  /**
   * The effect panel is a popover over the transport, and its open state *is* the
   * master bypass.
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

  const toggleEffects = (next: boolean): void => {
    setShowEffects(next);
    applyPanelState(next);
    try {
      window.localStorage.setItem('sounddesk.effectsOpen', next ? '1' : '0');
    } catch {
      /* storage disabled — the panel still works for this session */
    }
  };

  /**
   * Enforce the rule on mount too.
   *
   * `showEffects` and the chain are both persisted independently, so a reload can
   * produce a closed panel over an *enabled* chain — audio that is processed while the
   * UI offers no way to see or undo it. Synchronising once on mount removes that state
   * entirely; afterwards `toggleEffects` is the only thing that changes either side.
   */
  useEffect(() => {
    applyPanelState(showEffects);
    // Mount-only on purpose: re-running it on every render would fight the user's
    // in-panel bypass button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which mixer track's chain the effects panel is editing, if any.
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [showMixer, setShowMixer] = useState(() => {
    try {
      return window.localStorage.getItem('sounddesk.mixerOpen') === '1';
    } catch {
      return false;
    }
  });
  const toggleMixer = (next: boolean): void => {
    setShowMixer(next);
    try {
      window.localStorage.setItem('sounddesk.mixerOpen', next ? '1' : '0');
    } catch {
      /* storage disabled */
    }
  };

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
          {state.compare ? (
            <ComparePane />
          ) : (
            <ResultsPane playingId={playback.assetId} onPlay={(id) => requestPlay(id)} />
          )}
        </div>
        <div className="pane stack">
          {showMixer && (
            <MixerPane
              onEditChain={(trackId) => {
                setEditingTrackId(trackId);
                // Through the toggle, not setShowEffects: opening the panel is what
                // enables the chain, so a track's effects stay audible while editing.
                toggleEffects(true);
              }}
            />
          )}
          <DetailsPane onPlay={(id) => requestPlay(id)} onSimilar={(id) => void store.findSimilar(id)} />
        </div>
      </div>
      {/*
        The effect chain lives above the transport as a popover, not in the right-hand
        stack: it is a thing you open, listen through, and close, and as a docked pane it
        permanently took width and height away from the results while being idle.
      */}
      <div className="transport-wrap">
        {showEffects && (
          <div className="effects-popover">
            <EffectsPane
              trackId={editingTrackId}
              onClearTarget={() => setEditingTrackId(null)}
              onClose={() => toggleEffects(false)}
            />
          </div>
        )}
        <Transport
          showEffects={showEffects}
          onToggleEffects={toggleEffects}
          showMixer={showMixer}
          onToggleMixer={toggleMixer}
        />
      </div>
    </div>
  );
}
