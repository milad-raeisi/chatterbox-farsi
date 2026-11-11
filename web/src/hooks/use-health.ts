"use client";

import * as React from "react";

import { api, type Health } from "@/lib/api";

/** Polls the local server: quickly while the model loads, slowly once it is ready. */
export function useHealth() {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [reachable, setReachable] = React.useState<boolean | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.health();
        if (!alive) return;
        setHealth(next);
        setReachable(true);
        timer = setTimeout(poll, next.status === "ready" ? 15_000 : 1_500);
      } catch {
        if (!alive) return;
        setReachable(false);
        timer = setTimeout(poll, 3_000);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tick]);

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);
  return { health, reachable, refresh };
}
