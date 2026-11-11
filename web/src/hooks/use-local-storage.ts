"use client";

import * as React from "react";

// localStorage-backed state that is safe for a statically exported page: the server render
// (and the first client render) use `initial`, then the stored value takes over.
// An in-memory copy keeps things working when storage is blocked (private mode etc.).

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, raw: string) {
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* storage unavailable: memory copy still works for this session */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) memory.delete(event.key);
    notify();
  };
  listeners.add(notify);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

function parse<T>(raw: string | null, initial: T): T {
  if (raw == null) return initial;
  try {
    const value = JSON.parse(raw) as T;
    if (initial && typeof initial === "object" && !Array.isArray(initial)) {
      return { ...initial, ...value }; // new settings fields get their defaults
    }
    return value;
  } catch {
    return initial;
  }
}

export function useLocalStorage<T>(key: string, initial: T) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = React.useMemo(() => parse(raw, initial), [raw, initial]);

  const setValue = React.useCallback(
    (next: T | ((previous: T) => T)) => {
      const previous = parse(read(key), initial);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
      write(key, JSON.stringify(resolved));
    },
    [key, initial],
  );

  return [value, setValue] as const;
}
