"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Mode = "office" | "field";

const MODE_STORAGE_KEY = "agropeq-mode";
const DEFAULT_MODE: Mode = "office";

function isMode(value: unknown): value is Mode {
  return value === "office" || value === "field";
}

// Runs synchronously (before hydration/paint) so the density attribute is
// correct on first paint instead of flashing office density and then
// jumping to field density once React mounts. Mirrors the pattern used by
// theming libraries (e.g. next-themes) for the same reason, but for our
// independent office/field axis.
const MODE_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
  MODE_STORAGE_KEY,
)});if(m!=="office"&&m!=="field"){m=${JSON.stringify(DEFAULT_MODE)};}document.documentElement.setAttribute("data-mode",m);}catch(e){}})();`;

// Module-level pub/sub over localStorage so React can read the mode via
// useSyncExternalStore (the correct way to sync from an external store)
// instead of `useState` + `useEffect(() => setState(...))`, which trips
// the set-state-in-effect lint rule.
type Listener = () => void;
let listeners: Listener[] = [];

function subscribe(listener: Listener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

function getSnapshot(): Mode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return isMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function getServerSnapshot(): Mode {
  return DEFAULT_MODE;
}

function writeMode(next: Mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, next);
  } catch {
    // Ignore storage failures; mode still applies for this session via
    // the in-memory snapshot below.
  }
  emitChange();
}

type ModeContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
};

const ModeContext = createContext<ModeContextValue | null>(null);

/**
 * Manages the office/field density axis via `data-mode` on <html>,
 * persisted to localStorage. Fully client-side, no server dependency, and
 * independent from the light/dark theme axis (see ThemeProvider).
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Synchronizing the DOM attribute from React state is the documented
  // correct use of an effect (mirroring an external system), unlike
  // calling setState synchronously inside one.
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

  const setMode = useCallback((next: Mode) => {
    writeMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "office" ? "field" : "office");
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return (
    <ModeContext.Provider value={value}>
      <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error("useMode must be used within a ModeProvider");
  }
  return ctx;
}
