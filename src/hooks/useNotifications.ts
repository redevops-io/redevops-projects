import { useCallback, useEffect, useRef, useState } from "react";
import type { DataClient } from "../data/client";
import type { NotificationPrefs, TodayNotifications } from "../data/types";
import { classifyConnectionError, type ConnectionProblem } from "../data/client";

// Notifications are DERIVED from Today (same stable ids and state, no second workflow). The server decides what is
// actionable, what is already acknowledged, and what quiet hours suppress; this hook only polls and relays.
// A snoozed item is silent until it wakes. The window title uses the content-free summary only.
export function useNotifications(client: DataClient, projectId = "customer-ops", intervalMs = 30_000) {
  const [state, setState] = useState<TodayNotifications | null>(null);
  // null = reachable. Otherwise why not — shown as a slim banner while the last known state stays on screen.
  const [problem, setProblem] = useState<ConnectionProblem | null>(null);
  const failures = useRef(0);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const n = await client.getNotifications(projectId);
      failures.current = 0;
      if (live.current) { setState(n); setProblem(null); }
      return n;
    } catch (e) {
      // best-effort for notifications themselves, but the failure IS the earliest signal that the runtime is gone;
      // report it only after two in a row so one dropped request doesn't flash a banner.
      failures.current += 1;
      if (live.current && failures.current >= 2) setProblem(classifyConnectionError(e));
      return null;
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
    if (intervalMs <= 0) return;
    // while the runtime is unreachable, retry sooner (5s) so the UI recovers by itself when it comes back
    const t = setInterval(() => { if (typeof document === "undefined" || document.visibilityState !== "hidden") void refresh(); }, problem?.retryable ? Math.min(intervalMs, 5_000) : intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs, problem?.retryable]);

  useEffect(() => {
    if (!state) return;
    const base = "Today · ReDevOps";
    try { document.title = state.count > 0 ? `(${state.count}) ${base}` : base; } catch { /* no document */ }
  }, [state]);

  const ack = useCallback(async (keys: string[]) => {
    if (!keys.length) return;
    setState((s) => s && { ...s, pending: s.pending.filter((p) => !keys.includes(p.key)) });   // optimistic; server is the truth
    try { await client.ackNotifications(projectId, keys); } finally { void refresh(); }
  }, [client, projectId, refresh]);

  const setPrefs = useCallback(async (prefs: Partial<NotificationPrefs> & { clear_quiet?: boolean }) => {
    const p = await client.setNotificationPrefs(projectId, prefs);
    void refresh();
    return p;
  }, [client, projectId, refresh]);

  return { state, problem, refresh, ack, setPrefs };
}
