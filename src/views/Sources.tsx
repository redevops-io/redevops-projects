import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";
import type { ContextSource, Health, SourceHealthState, SourceProposal } from "../data/types";

type Tab = "connected" | "add" | "indexes" | "permissions" | "health";

const TABS: { id: Tab; label: string }[] = [
  { id: "connected", label: "Connected" },
  { id: "add", label: "Add source" },
  { id: "indexes", label: "Indexes" },
  { id: "permissions", label: "Permissions" },
  { id: "health", label: "Health" },
];

// Map a source's health state → a Pill tone + friendly mark. Sources use their own health
// vocabulary (doc §18), distinct from Mission/App states.
const HEALTH: Record<SourceHealthState, { tone: Health; mark: string; label: string }> = {
  healthy: { tone: "ok", mark: "●", label: "Healthy" },
  stale: { tone: "warn", mark: "⚠", label: "Stale" },
  degraded: { tone: "warn", mark: "⚠", label: "Degraded" },
  error: { tone: "bad", mark: "✕", label: "Error" },
};

// Business-language name for a source kind.
const KIND_LABEL: Record<ContextSource["kind"], string> = {
  files: "Local files",
  cloud_files: "Cloud drive",
  database: "Database",
  app_evidence: "Business app",
  website: "Website / API",
};

// Render the per-kind stats compactly (files: discovered/indexed/skipped, or schemas/tables,
// or a bare file count) without the frontend knowing more than the projection.
function statLine(s: ContextSource): string {
  const st = s.stats;
  if ("discovered" in st || "skipped" in st) {
    return `${st.discovered ?? 0} discovered · ${st.indexed ?? 0} indexed · ${st.skipped ?? 0} skipped`;
  }
  if ("schemas" in st || "tables" in st) {
    return `${st.schemas ?? 0} schemas · ${st.tables ?? 0} tables`;
  }
  if ("files" in st) {
    return `${st.files ?? 0} files${st.indexed != null ? ` · ${st.indexed} indexed` : ""}`;
  }
  return "No statistics yet";
}

const CONTENT_TYPES: { id: string; label: string; def: boolean }[] = [
  { id: "pdf", label: "PDF", def: true },
  { id: "docx", label: "DOCX", def: true },
  { id: "markdown", label: "Markdown", def: true },
  { id: "text", label: "Text", def: true },
  { id: "csv", label: "CSV", def: true },
  { id: "images", label: "Images", def: false },
  { id: "audio_video", label: "Audio / video", def: false },
];

const ADD_CHOICES = ["Local files", "Cloud drive", "Database", "Business app", "Website / API", "Ask Sidekick"] as const;
type AddChoice = (typeof ADD_CHOICES)[number];

function ConnectedCard({ s, onPermissions }: { s: ContextSource; onPermissions: () => void }) {
  const h = HEALTH[s.health.state];
  return (
    <div className="appcard">
      <div className="top">
        <div className="ico">{h.mark}</div>
        <div className="grow"><div className="nm">{s.name}</div></div>
        <Pill tone={h.tone}>{h.label}</Pill>
      </div>
      <div className="uf">
        {KIND_LABEL[s.kind]}{s.provider ? ` · ${s.provider}` : ""} · {s.location} · Read only
      </div>
      <div className="verified">{statLine(s)}</div>
      <div className="act">
        <button className="btn sm" onClick={() => { /* view evidence — stub */ }}>View evidence</button>
        <button className="btn sm" onClick={() => { /* rescan — stub */ }}>Rescan</button>
        <button className="btn sm" onClick={onPermissions}>Permissions</button>
      </div>
    </div>
  );
}

function chip(text: string, kind: "allow" | "deny") {
  const style =
    kind === "deny"
      ? { background: "var(--bad-wash, rgba(220,38,38,.12))", color: "var(--bad, #b91c1c)" }
      : undefined;
  // reuse the .scope chip look; DENY chips get a minimal inline red wash.
  return <span className="scope" key={kind + text} style={style}>{kind === "deny" ? "DENY " : ""}{text}</span>;
}

// The Add-source entry screen (doc §7). Local files must actually call confirmSources.
function AddSource({ client, go, onConnected }: {
  client: DataClient; go: (s: Section) => void; onConnected: (s: ContextSource) => void;
}) {
  const [choice, setChoice] = useState<AddChoice | null>(null);
  const [path, setPath] = useState("~/company-docs");
  const [types, setTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c.def])),
  );
  const [access, setAccess] = useState<"read_only" | "allow_generated">("read_only");
  const [indexing, setIndexing] = useState<"automatic" | "on_demand">("automatic");
  const [scanned, setScanned] = useState<ContextSource | null>(null);
  const [dbHost, setDbHost] = useState("localhost");
  const [dbName, setDbName] = useState("customer_ops");
  const [dbSchemas, setDbSchemas] = useState("public, support");
  const [dbSecured, setDbSecured] = useState(false);
  const [driveFolder, setDriveFolder] = useState("Refund Policies");
  const [driveAuthed, setDriveAuthed] = useState(false);

  async function connectSpec(spec: SourceProposal["sources"][number]) {
    const [created] = await client.confirmSources("customer-ops", [spec], "you");
    if (created) { setScanned(created); onConnected(created); }
  }

  function connectAndScan() {
    const allowed = CONTENT_TYPES.filter((c) => types[c.id]).map((c) => c.id);
    return connectSpec({
      kind: "files", location: path, provider: "", access_mode: access,
      allowed_content_types: allowed, allowed_schemas: [], indexing_policy: indexing, name: "",
    });
  }

  return (
    <div className="card">
      <div className="hd"><span className="eyebrow">Add a source of evidence</span></div>
      <div className="bd">
        <div className="row" style={{ flexWrap: "wrap", border: 0, padding: "4px 0" }}>
          {ADD_CHOICES.map((c) => (
            <button
              key={c}
              className={`btn${choice === c ? " pri" : ""}`}
              aria-selected={choice === c}
              onClick={() => {
                setScanned(null);
                if (c === "Ask Sidekick") { go("sidekick"); return; }
                setChoice(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {choice === "Local files" ? (
          <div className="setup" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
            <div className="field">
              <input aria-label="Folder path" type="text" value={path} onChange={(e) => setPath(e.target.value)} />
            </div>

            <div className="eyebrow" style={{ marginTop: 8 }}>Content types</div>
            <div className="scopes">
              {CONTENT_TYPES.map((c) => (
                <label key={c.id} className="scope" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    aria-label={c.label}
                    checked={!!types[c.id]}
                    onChange={(e) => setTypes((p) => ({ ...p, [c.id]: e.target.checked }))}
                  />
                  {c.label}
                </label>
              ))}
            </div>

            <div className="eyebrow" style={{ marginTop: 8 }}>Access</div>
            <div className="scopes">
              <label className="scope" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="access" aria-label="Read only" checked={access === "read_only"} onChange={() => setAccess("read_only")} />
                Read only
              </label>
              <label className="scope" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="access" aria-label="Allow generated" checked={access === "allow_generated"} onChange={() => setAccess("allow_generated")} />
                Allow generated
              </label>
            </div>

            <div className="eyebrow" style={{ marginTop: 8 }}>Indexing</div>
            <div className="scopes">
              <label className="scope" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="indexing" aria-label="Automatic" checked={indexing === "automatic"} onChange={() => setIndexing("automatic")} />
                Automatic
              </label>
              <label className="scope" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="indexing" aria-label="On demand" checked={indexing === "on_demand"} onChange={() => setIndexing("on_demand")} />
                On demand
              </label>
            </div>

            <div className="lock" style={{ marginTop: 10 }}>🔒 Evidence is read as context only — a context grant, separate from an app's capability grant.</div>
            <div className="act" style={{ padding: "12px 0 0" }}>
              <button className="btn pri sm" onClick={connectAndScan}>Connect &amp; scan</button>
            </div>

            {scanned ? (
              <div className="s" style={{ marginTop: 10 }}>
                Scanned {scanned.name || scanned.location}: {statLine(scanned)}.
              </div>
            ) : null}
          </div>
        ) : null}

        {choice === "Database" ? (
          <div className="setup" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
            <div className="field"><input aria-label="Database type" type="text" value="PostgreSQL" readOnly /></div>
            <div className="field"><input aria-label="Host" type="text" value={dbHost} onChange={(e) => setDbHost(e.target.value)} /></div>
            <div className="field"><input aria-label="Database" type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} /></div>
            <div className="eyebrow" style={{ marginTop: 8 }}>Allowed schemas (read-only)</div>
            <div className="field"><input aria-label="Allowed schemas" type="text" value={dbSchemas} onChange={(e) => setDbSchemas(e.target.value)} /></div>
            <div className="lock" style={{ marginTop: 10 }}>
              🔒 {dbSecured ? "Credential stored in the broker — never shown to the model." : "Connect securely — the credential goes to the broker, resolved at use."}
            </div>
            <div className="act" style={{ padding: "12px 0 0", gap: 8 }}>
              {!dbSecured
                ? <button className="btn sm" onClick={() => setDbSecured(true)}>Connect securely</button>
                : <button className="btn pri sm" onClick={() => connectSpec({
                    kind: "database", provider: "postgres", location: `${dbHost}/${dbName}`,
                    access_mode: "read_only", allowed_content_types: [],
                    allowed_schemas: dbSchemas.split(",").map((s) => s.trim()).filter(Boolean),
                    indexing_policy: "on_demand", name: dbName,
                  })}>Verify &amp; discover schema</button>}
            </div>
            {scanned && scanned.kind === "database" ? (
              <div className="s" style={{ marginTop: 10 }}>
                {scanned.health.state === "healthy"
                  ? `Connected read-only: ${statLine(scanned)}.`
                  : `${scanned.health.state}: ${scanned.health.detail}`}
              </div>
            ) : null}
          </div>
        ) : null}

        {choice === "Cloud drive" ? (
          <div className="setup" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
            <div className="s">Google Drive uses provider-native OAuth — no token pasting.</div>
            <div className="act" style={{ padding: "10px 0", gap: 8 }}>
              {!driveAuthed
                ? <button className="btn sm" onClick={() => setDriveAuthed(true)}>Connect Google Drive</button>
                : <Pill tone="ok">Authorized</Pill>}
            </div>
            {driveAuthed ? (
              <>
                <div className="eyebrow">Folder</div>
                <div className="field"><input aria-label="Drive folder" type="text" value={driveFolder} onChange={(e) => setDriveFolder(e.target.value)} /></div>
                <div className="act" style={{ padding: "12px 0 0" }}>
                  <button className="btn pri sm" onClick={() => connectSpec({
                    kind: "cloud_files", provider: "google_drive", location: driveFolder,
                    access_mode: "read_only", allowed_content_types: [], allowed_schemas: [],
                    indexing_policy: "automatic", name: driveFolder,
                  })}>Connect &amp; index</button>
                </div>
                {scanned && scanned.kind === "cloud_files" ? (
                  <div className="s" style={{ marginTop: 10 }}>
                    {scanned.health.state === "healthy" ? `Indexed: ${statLine(scanned)}.` : `${scanned.health.state}: ${scanned.health.detail}`}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {choice && !["Local files", "Database", "Cloud drive"].includes(choice) ? (
          <div className="placeholder" style={{ marginTop: 10 }}>
            {choice} — ask Sidekick to propose this connection ("use my … as context").
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Sources({ client, go }: { client: DataClient; go: (s: Section) => void }) {
  const [sources, setSources] = useState<ContextSource[] | null>(null);
  const [tab, setTab] = useState<Tab>("connected");

  useEffect(() => {
    client.getSources("customer-ops").then(setSources);
  }, [client]);

  if (!sources) {
    return <section className="content"><div className="placeholder">Loading…</div></section>;
  }

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Evidence plane — what may be used as context</div>
        <h1 className="h">Sources</h1>
      </div>

      <div className="tabsrow">
        {TABS.map((t) => (
          <button key={t.id} aria-selected={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "connected" ? (
        <div className="apps">
          {sources.map((s) => (
            <ConnectedCard key={s.source_id} s={s} onPermissions={() => setTab("permissions")} />
          ))}
        </div>
      ) : null}

      {tab === "add" ? (
        <AddSource client={client} go={go} onConnected={(s) => setSources((prev) => [...(prev ?? []), s])} />
      ) : null}

      {tab === "indexes" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Indexes</span>
            <span className="eyebrow" style={{ marginLeft: "auto" }}>{sources.length}</span></div>
          <div className="bd">
            {sources.map((s) => (
              <div className="row" key={s.source_id}>
                <div className="grow"><div className="t">{s.name}</div>
                  <div className="s">{statLine(s)}</div></div>
                <div className="colw tnum">{s.stats.indexed != null ? `${s.stats.indexed} indexed` : "—"}</div>
                <div className="colw">{s.indexing_policy === "automatic" ? "Automatic" : "On demand"}</div>
                <div className="colw">{s.health.last_observed_at}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "permissions" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Context grants</span></div>
          <div className="bd">
            <div className="s" style={{ marginBottom: 6 }}>
              Context grants (what may be read as evidence) are separate from app capability grants (what actions an app may take).
            </div>
            {sources.map((s) => (
              <div className="row" key={s.source_id}>
                <div className="grow">
                  <div className="t">{s.name}</div>
                  <div className="scopes" style={{ marginTop: 6 }}>
                    {s.allowed_content_types.map((c) => chip(c, "allow"))}
                    {s.allowed_schemas.map((c) => chip(c, "allow"))}
                    {s.allowed_tables.map((c) => chip(c, "allow"))}
                    {s.denied.map((c) => chip(c, "deny"))}
                    {s.allowed_content_types.length + s.allowed_schemas.length + s.allowed_tables.length + s.denied.length === 0
                      ? <span className="s">No explicit grants</span> : null}
                  </div>
                </div>
                <div className="colw">{s.access_mode === "read_only" ? "Read only" : "Allow generated"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "health" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Source health</span>
            <span className="eyebrow" style={{ marginLeft: "auto" }}>{sources.length}</span></div>
          <div className="bd">
            {sources.map((s) => {
              const h = HEALTH[s.health.state];
              return (
                <div className="row" key={s.source_id}>
                  <div className="grow">
                    <div className="t">{s.name}</div>
                    <div className="s">{s.health.detail} · {s.health.last_observed_at}</div>
                  </div>
                  {s.health.state === "stale" || s.health.state === "error"
                    ? <button className="btn sm" onClick={() => { /* reconnect — stub */ }}>Reconnect</button>
                    : null}
                  <Pill tone={h.tone}>{h.label}</Pill>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="demoflag">Sources define what evidence is available — Context Runtime decides how to retrieve and represent it. Example data via the mock Projects API client.</div>
    </section>
  );
}
