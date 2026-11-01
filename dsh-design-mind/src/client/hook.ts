import { useSyncExternalStore } from 'react'

import type { DesignMindStore, State } from './store.ts'

/** Subscribe a component to the module-level store. */
export function useStore(store: DesignMindStore): State {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
