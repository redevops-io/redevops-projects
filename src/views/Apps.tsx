import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";
import type { AppCapability, Health, SetupState } from "../data/types";

type Tab = "connected" | "available" | "health" | "permissions";

const TABS: { id: Tab; label: string }[] = [
  { id: "connected", label: "Connected" },
  { id: "available", label: "Available" },
  { id: "health", label: "Health" },
  { id: "permissions", label: "Permissions" },
];

// Map a connection state → a Pill tone + friendly label. Connected states borrow the
// app's live health dot; NOT_CONNECTED is a muted "Not connected".
function statePill(a: AppCapability): { tone: Health; label: string } {
  if (a.state === "NOT_CONNECTED") return { tone: "mut", label: "Not connected" };
  const label =
    a.state === "MISSION_READY" ? "Mission ready"
    : a.state === "VERIFIED_WRITE" ? "Verified · read+write"
    : a.state === "VERIFIED_READ" ? "Verified · read"
    : "Connected";
  return { tone: a.health || "ok", label };
}

function AppCard({ a, onConnect }: { a: AppCapability; onConnect: (provider: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const connected = a.state !== "NOT_CONNECTED";
  const pill = statePill(a);

  return (
    <div className="appcard">
      <div className="top">
        <div className="ico">{a.display_name[0]}</div>
        <div className="grow"><div className="nm">{a.display_name}</div></div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      <div className="uf">{a.used_for}</div>
      {a.verified ? <div className="verified">{a.verified}</div> : null}

      <div className="act">
        <button className="btn sm" onClick={() => setOpen((o) => !o)}>
          {connected ? "Details" : "Connect"}
        </button>
      </div>

      {open ? (
        <div className="setup">
          {connected ? (
            <ul className="steps-trace">
              {a.capabilities.map((c) => (
                <li key={c}>
                  <span className="mk done">✓</span>
                  <span className="grow mono">{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ol className="steps">
                {a.manual_steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {a.required_scopes.length ? (
                <div className="scopes">
                  {a.required_scopes.map((s) => <span className="scope" key={s}>{s}</span>)}
                </div>
              ) : null}
              {a.credential_fields.map((f) => (
                <div className="field" key={f.name}>
                  <input
                    aria-label={f.label}
                    type={f.secret ? "password" : "text"}
                    placeholder={f.label + (f.secret ? "" : " (not secret)")}
                    value={fields[f.name] ?? ""}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="lock">🔒 Stored in the ReDevOps credential broker — Sidekick and the model never see the raw key.</div>
              <div className="act" style={{ padding: "12px 0 0" }}>
                <button className="btn pri sm" onClick={() => onConnect(a.provider)}>Connect &amp; verify</button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Apps({ client }: { client: DataClient; go: (s: Section) => void }) {
  const [apps, setApps] = useState<AppCapability[] | null>(null);
  const [tab, setTab] = useState<Tab>("connected");
  const [demoStatus, setDemoStatus] = useState<string | null>(null);

  useEffect(() => {
    client.getApps("customer-ops").then(setApps);
  }, [client]);

  if (!apps) {
    return <section className="content"><div className="placeholder">Loading…</div></section>;
  }

  // Flip an app to a verified-read state locally, so the demo reflects the connect action
  // without a round trip.
  function connect(provider: string) {
    setApps((prev) =>
      (prev ?? []).map((a) =>
        a.provider === provider
          ? { ...a, state: "VERIFIED_READ" as SetupState, health: "ok" as Health, verified: "Verified just now" }
          : a,
      ),
    );
  }

  const connected = apps.filter((a) => a.state !== "NOT_CONNECTED");
  const available = apps.filter((a) => a.state === "NOT_CONNECTED");

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Connected capabilities</div>
        <h1 className="h">Apps</h1>
      </div>

      {/* Killer-demo readiness card */}
      <div className="card">
        <div className="hd">
          <span className="eyebrow">Killer demo</span>
          <span style={{ marginLeft: "auto" }}><Pill tone="ok">Ready to test</Pill></span>
        </div>
        <div className="bd">
          <div className="flowline">
            <span className="n">WhatsApp</span><span className="ar">→</span>
            <span className="n">HubSpot</span><span className="ar">→</span>
            <span className="n">Stripe charge</span><span className="ar">→</span>
            <span className="n">Slack approval</span><span className="ar">→</span>
            <span className="n">refund</span><span className="ar">→</span>
            <span className="n">verify</span><span className="ar">→</span>
            <span className="n">reply</span>
          </div>
          <div className="row">
            <button className="btn pri" onClick={() => setDemoStatus("Running demo Mission…")}>Run demo Mission</button>
            {demoStatus ? <span className="s" style={{ marginLeft: 4 }}>{demoStatus}</span> : null}
          </div>
        </div>
      </div>

      <div className="tabsrow">
        {TABS.map((t) => (
          <button key={t.id} aria-selected={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "connected" ? (
        <div className="apps">
          {connected.map((a) => <AppCard key={a.provider} a={a} onConnect={connect} />)}
        </div>
      ) : null}

      {tab === "available" ? (
        <div className="apps">
          {available.length === 0
            ? <div className="placeholder">Every discovered app is connected.</div>
            : available.map((a) => <AppCard key={a.provider} a={a} onConnect={connect} />)}
        </div>
      ) : null}

      {tab === "health" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Connection health</span>
            <span className="eyebrow" style={{ marginLeft: "auto" }}>{apps.length}</span></div>
          <div className="bd">
            {apps.map((a) => {
              const pill = statePill(a);
              return (
                <div className="row" key={a.provider}>
                  <div className="grow"><div className="t">{a.display_name}</div>
                    <div className="s">{a.verified || "Not yet verified"}</div></div>
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "permissions" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Granted capabilities</span></div>
          <div className="bd">
            {apps.flatMap((a) => a.capabilities.map((c) => (
              <div className="row" key={a.provider + c}>
                <div className="grow mono">{c}</div>
                <div className="colw mono">{a.provider}</div>
              </div>
            )))}
          </div>
        </div>
      ) : null}

      <div className="demoflag">Setup cards render the runtime's ProviderSetupGuide — same descriptor, any surface.</div>
    </section>
  );
}
