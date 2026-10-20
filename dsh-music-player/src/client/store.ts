/** A tiny external store for useSyncExternalStore. */

export interface Store<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
  set: (next: T | ((previous: T) => T)) => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next) => {
      const updated = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
      if (Object.is(updated, value)) return
      value = updated
      for (const listener of listeners) listener()
    },
  }
}
