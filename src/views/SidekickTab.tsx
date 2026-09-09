import { useEffect, useRef, useState } from "react";
import type { Section } from "../components/Rail";
import type { DataClient } from "../data/client";
import type { MissionTemplate, SidekickContext } from "../data/types";
import { APP_ID } from "../data/mock";
import { Pill } from "../components/Pill";

// The DEDICATED Sidekick tab (doc §2) — a full-page conversational surface, distinct from
// the floating Sidekick panel. Chat carries the current context so "this" is never
// ambiguous; Mission templates (doc §16) surface per-dependency readiness so Sidekick can
// complete missing setup before creating a Mission; Recent lists prior interactions.

type Tab = "chat" | "templates" | "recent";

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "templates", label: "Mission templates" },
  { id: "recent", label: "Recent" },
];

// Example recent interactions (doc §2). Clicking one prefills the chat input.
const RECENT = [
  "Connect Google Drive",
  "Why is Mission #4821 waiting?",
  "Show new Discovery findings",
];

interface Msg { who: "you" | "sk"; text: string; actions?: { label: string; kind: string }[]; }

// A small pill/label style for the required-app and required-source chips (doc §16). Kept
// inline — no new styles.css classes.
const chipStyle: React.CSSProperties = {
  display: "inline-block", padding: "2px 9px", marginRight: 6, marginBottom: 6,
  borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel-2)",
  fontSize: 11.5, fontFamily: '"JetBrains Mono", monospace', color: "var(--muted)",
};

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div>{items.map((c) => <span key={c} style={chipStyle}>{c}</span>)}</div>;
}

function TemplateCard({ t, onConnect }: { t: MissionTemplate; onConnect: (label: string) => void }) {
  const [note, setNote] = useState<string | null>(null);
  const notReady = t.readiness.filter((r) => !r.ready);

  return (
    <div className="card">
      <div className="hd">
        <span className="eyebrow">{t.suggested_workflow}</span>
        <span style={{ marginLeft: "auto" }}>
          <Pill tone={notReady.length ? "warn" : "ok"}>
            {notReady.length ? `${notReady.length} to connect` : "Ready"}
          </Pill>
        </span>
      </div>
      <div className="bd">
        <div className="t" style={{ fontSize: 15, marginBottom: 8 }}>{t.goal}</div>

        {notReady.length ? (
          <div className="s" style={{ marginBottom: 10, color: "var(--warn)", fontWeight: 600 }}>
            Needs: {notReady.map((r) => r.label).join(", ")}
          </div>
        ) : null}

        <div className="eyebrow" style={{ marginBottom: 4 }}>Uses</div>
        <Chips items={[...t.required_capabilities, ...t.required_sources]} />

        {t.authority_requirements.length ? (
          <div className="s" style={{ margin: "8px 0" }}>
            Authority: {t.authority_requirements.join(" · ")}
          </div>
        ) : null}

        <div className="eyebrow" style={{ margin: "10px 0 4px" }}>Readiness</div>
        <ul className="steps-trace">
          {t.readiness.map((r) => (
            <li key={r.label}>
              <span className={`mk ${r.ready ? "done" : "todo"}`}>{r.ready ? "✓" : "○"}</span>
              <span className="grow">{r.label}</span>
              {r.ready
                ? <Pill tone="ok">Ready</Pill>
                : <button className="btn sm" onClick={() => onConnect(r.label)}>Connect {r.label}</button>}
            </li>
          ))}
        </ul>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn pri sm" onClick={() => setNote(
            notReady.length
              ? `Sidekick will connect ${notReady.map((r) => r.label).join(", ")} before creating this Mission.`
              : "Proposing a governed Mission — confirm to compile.",
          )}>Run</button>
          <button className="btn sm" onClick={() => setNote("Customize the steps, sources, and authority before running.")}>Customize</button>
        </div>
        {note ? <div className="s" style={{ marginTop: 8 }}>{note}</div> : null}
      </div>
    </div>
  );
}

export function SidekickTab({ client, go, ctx }: { client: DataClient; go: (s: Section) => void; ctx: SidekickContext }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [templates, setTemplates] = useState<MissionTemplate[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: "sk", text: "I carry your current context (shown above), so “this” always means what you're looking at. Describe an outcome — I connect the apps, verify them, and run the work under governance." },
  ]);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.getTemplates(ctx.projectId).then(setTemplates);
  }, [client, ctx.projectId]);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs]);

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { who: "you", text }]);
    setInput("");
    const reply = await client.askSidekick(ctx, text);
    setMsgs((m) => [...m, { who: "sk", text: reply.text, actions: reply.actions }]);
  }

  // Reply-action handling mirrors the floating panel: a "setup" action routes to where the
  // missing pieces are connected; "commit" is a governed no-op stub; anything else echoes.
  function runAction(a: { label: string; kind: string }) {
    if (a.kind === "setup") { go("sources"); return; }
    setMsgs((m) => [...m, { who: "sk", text: `✓ ${a.label}` }]);
  }

  // Connect a template's missing dependency: an app connects via the API (readiness then
  // updates); a source dependency routes to Add source.
  async function connectDep(label: string) {
    const provider = APP_ID[label];
    if (!provider) { go("sources"); return; }
    await client.connectApp(provider);
    setTemplates(await client.getTemplates(ctx.projectId));
    setMsgs((m) => [...m, { who: "sk", text: `✓ Connected ${label} — the Mission's readiness is updated.` }]);
  }

  const objectLine = ctx.objectRef ? <> · Object <b>{ctx.objectRef}</b></> : null;

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Conversational control surface</div>
        <h1 className="h">Sidekick</h1>
      </div>

      <div className="ctxchip" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
        Project: <b>Customer Operations</b> · Section: <b>{ctx.section}</b>{objectLine}
      </div>

      <div className="tabsrow">
        {TABS.map((t) => (
          <button key={t.id} aria-selected={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "chat" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Ask or describe a Mission</span></div>
          <div className="bd">
            <div ref={bodyRef} style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto", marginBottom: 12 }}>
              {msgs.map((m, i) => (
                <div key={i} className={`msg ${m.who}`}>
                  {m.text}
                  {m.actions && (
                    <div className="acts">
                      {m.actions.map((a, j) => (
                        <button key={j} className={`btn sm ${a.kind === "edit" ? "" : "pri"}`}
                          onClick={() => runAction(a)}>{a.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <textarea
              aria-label="Ask Sidekick"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(input); }}
              placeholder="Ask a question or describe a Mission…"
              rows={3}
              style={{ width: "100%", resize: "vertical", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel-2)",
                color: "inherit", font: "inherit" }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn pri" onClick={() => send(input)}>Send</button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "templates" ? (
        !templates
          ? <div className="placeholder">Loading…</div>
          : <div>{templates.map((t) => <TemplateCard key={t.id} t={t} onConnect={connectDep} />)}</div>
      ) : null}

      {tab === "recent" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Recent interactions</span></div>
          <div className="bd">
            {RECENT.map((r) => (
              <div className="row" key={r} style={{ cursor: "pointer" }}
                onClick={() => { setInput(r); setTab("chat"); }}>
                <div className="grow"><div className="t">{r}</div></div>
                <span className="s">Reuse</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="demoflag">Sidekick is the conversational control surface — LLM interprets · human confirms · Runtime compiles. Example replies via the mock Projects API client.</div>
    </section>
  );
}
