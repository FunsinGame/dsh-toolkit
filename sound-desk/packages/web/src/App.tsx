import { useEffect, useRef, useState } from 'react';

import { getPlayer, type PlayerState } from './audio/player.ts';
import { requestPlay } from './audio/playback.ts';
import { DetailsPane } from './components/DetailsPane.tsx';
import { ResultsPane } from './components/ResultsPane.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Transport } from './components/Transport.tsx';
import { store } from './state/store.ts';
import { useAppState } from './state/useAppState.ts';

export function App({ bootError }: { bootError: string | null }): React.JSX.Element {
  const state = useAppState();
  const [playback, setPlayback] = useState<PlayerState>(() => getPlayer().getState());

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
    return (
      <div className="center-msg">
        <h2>引擎返回了错误</h2>
        <div style={{ maxWidth: 520 }}>{state.fatalError}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <SearchBar />
      <div className="body">
        <Sidebar />
        <div className="pane" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <ResultsPane playingId={playback.assetId} onPlay={(id) => requestPlay(id)} />
        </div>
        <DetailsPane onPlay={(id) => requestPlay(id)} onSimilar={(id) => void store.findSimilar(id)} />
      </div>
      <Transport />
    </div>
  );
}
