import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { store, type Store } from './store';
import type { Database } from './types';

const Ctx = createContext<{ db: Database; store: Store } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const db = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <Ctx.Provider value={{ db, store }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

// Dev convenience: inspect the store from the browser console.
if (import.meta.env.DEV) (window as unknown as { __store: Store }).__store = store;
