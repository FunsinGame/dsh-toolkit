import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { createEngineClient } from './api/client.ts';
import { store } from './state/store.ts';
import { getPlayer } from './audio/player.ts';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

const root = createRoot(container);

try {
  const client = createEngineClient();
  // Unblock the audio context on the first user gesture; browsers will not
  // start playback otherwise.
  const unlock = (): void => {
    getPlayer();
    void client.stats().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  void store.init(client);
  root.render(
    <StrictMode>
      <App bootError={null} />
    </StrictMode>,
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  root.render(
    <StrictMode>
      <App bootError={message} />
    </StrictMode>,
  );
}
