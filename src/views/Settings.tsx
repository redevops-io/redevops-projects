import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../nav";
import type { NotificationPrefs } from "../data/types";
import { Pill } from "../components/Pill";

// Settings — project-level durable configuration. No Runtime projection to load; these are
// the project's standing policy facts. Kept on the same ({ client, go }) prop signature as
// every other view so App can route to it uniformly, though it consumes neither.
const TABS = ["General", "Notifications", "Members", "Authority", "Models", "Security", "Retention"] as const;
type Tab = (typeof TABS)[number];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

// Notifications are derived from Today. Only items that genuinely need you interrupt; a snoozed item stays silent until
// it wakes. Quiet hours silence interruptions (the count still shows). OS-level notifications will show a content-free
// summary only — titles stay in the app.
function NotificationSettings({ client, onChanged }: { client: DataClient; onChanged?: () => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { client.getNotifications("customer-ops").then((n) => setPrefs(n.prefs)).catch((e) => setErr(String(e.message ?? e))); }, [client]);
  async function save(p: Partial<NotificationPrefs> & { clear_quiet?: boolean }) {
    try {
      // tz is the browser's offset EAST of UTC, so quiet hours are in the user's own clock time
      setPrefs(await client.setNotificationPrefs("customer-ops", { tz_offset_minutes: -new Date().getTimezoneOffset(), ...p }));
      setErr(null); onChanged?.();
    } catch (e) { setErr((e as Error).message ?? String(e)); }
  }
  if (err && !prefs) return <div className="row" role="alert"><div className="grow">Couldn't load notification settings. <span className="s">{err}</span></div></div>;
  if (!prefs) return <div className="row" role="status"><div className="grow s">Loading…</div></div>;
  const quiet = prefs.quiet_start != null && prefs.quiet_end != null;
  return (
    <>
      <div className="row">
        <label className="grow"><input type="checkbox" checked={prefs.enabled} onChange={(e) => void save({ enabled: e.target.checked })} /> <span className="t">Notify me when something needs me</span>
          <div className="s">Only items that genuinely need a decision. Waiting and snoozed items stay quiet until they come back.</div></label>
      </div>
      <div className="row">
        <div className="grow"><div className="t">Quiet hours</div>
          <div className="s">No interruptions during these hours (your local time). The count still shows.</div></div>
        <label className="s">From <select aria-label="Quiet hours start" value={quiet ? prefs.quiet_start! : ""} onChange={(e) => void save({ quiet_start: Number(e.target.value), quiet_end: prefs.quiet_end ?? 7 })}>
          <option value="" disabled>—</option>{HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select></label>
        <label className="s">to <select aria-label="Quiet hours end" value={quiet ? prefs.quiet_end! : ""} onChange={(e) => void save({ quiet_end: Number(e.target.value), quiet_start: prefs.quiet_start ?? 22 })}>
          <option value="" disabled>—</option>{HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select></label>
        {quiet && <button className="btn sm" onClick={() => void save({ clear_quiet: true })}>Clear</button>}
      </div>
      <div className="row"><div className="grow s">Desktop notifications, when added, will show only how many things need you — never customer names or message text on a lock screen.</div></div>
      {err && <div className="banner bad" role="alert">{err}</div>}
    </>
  );
}

export function Settings(props: { client: DataClient; go: (s: Section) => void; onPrefsChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>("General");

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Project-level durable configuration</div>
        <h1 className="h">Settings</h1>
      </div>

      <div className="tabsrow" role="tablist">
        {TABS.map((t) => (
          <button role="tab" key={t} aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card">
        <div className="hd"><span className="eyebrow">{tab}</span></div>
        <div className="bd">
          {tab === "General" && (
            <>
              <div className="row">
                <div className="grow"><div className="t">Project</div></div>
                <div className="s">Customer Operations</div>
              </div>
              <div className="row">
                <div className="grow"><div className="t">Approval policy</div>
                  <div className="s">Refunds require approval · outreach bounded</div></div>
                <Pill tone="ok">Active</Pill>
              </div>
            </>
          )}

          {tab === "Notifications" && <NotificationSettings client={props.client} onChanged={props.onPrefsChanged} />}

          {tab === "Members" && (
            <div className="row">
              <div className="grow">2 admins · 1 operator — maker ≠ checker on consequential actions</div>
            </div>
          )}

          {tab === "Authority" && (
            <div className="row">
              <div className="grow">Per-capability authority envelopes · kill switch · autonomy progression.</div>
            </div>
          )}

          {tab === "Models" && (
            <div className="row">
              <div className="grow">Adaptive model · local-first where possible.</div>
            </div>
          )}

          {tab === "Security" && (
            <div className="row">
              <div className="grow"><div className="t">Credential broker</div>
                <div className="mono s">secret:// · keys never enter chat, logs, or model context</div></div>
              <Pill tone="ok">Secured</Pill>
            </div>
          )}

          {tab === "Retention" && (
            <div className="row">
              <div className="grow">Immutable event ledger · content-addressed evidence · retention policy.</div>
            </div>
          )}
        </div>
      </div>

      <div className="demoflag">Durable project configuration — example values in this standalone build.</div>
    </section>
  );
}
