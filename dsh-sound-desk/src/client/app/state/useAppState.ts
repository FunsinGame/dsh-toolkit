/** Binds the external store to React. */

import { useSyncExternalStore } from 'react';

import { store, type AppState } from './store.ts';

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
