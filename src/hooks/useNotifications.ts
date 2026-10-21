import { useCallback, useEffect, useRef, useState } from "react";
import type { DataClient } from "../data/client";
import type { NotificationPrefs, TodayNotifications } from "../data/types";

// Notifications are DERIVED from Today (same stable ids and state, no second workflow). The server decides what is
// actionable, what is already acknowledged, and what quiet hours suppress; this hook only polls and relays.
// A snoozed item is silent until it wakes. The window title uses the content-free summary only.
export function useNotifications(client: DataClient, projectId = "customer-ops", intervalMs = 30_000) {
  const [state, setState] = useState<TodayNotifications | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    try { const n = await client.getNotifications(projectId); if (live.current) setState(n); return n; }
    catch { return null; }                      // notifications are best-effort; Today itself still works
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
    if (intervalMs <= 0) return;
    const t = setInterval(() => { if (typeof document === "undefined" || document.visibilityState !== "hidden") void refresh(); }, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

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

  return { state, refresh, ack, setPrefs };
}
