// The Projects dashboards as a page that needs no server of its own. Two ways to get numbers on it:
//   * connect to a Projects deployment (every dashboard that account may see; the page holds a bearer token for this tab only);
//   * work in this browser (the dashboards kernel runs here in WebAssembly; four dashboards, built from test results you add).
// The dashboards of connected applications are never read from this page with an application's own credential: that
// credential would belong to everybody who can open the page. They are listed, with what each needs.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Dashboards } from "../views/Dashboards";
import { PortableClient, type PortableInfo } from "./client";
import { normalizeBase, remoteTransport, standaloneTransport, type Transport } from "./transport";

const KEY = "redevops.portable.connection";                             // sessionStorage: gone when the tab closes
interface Saved { base: string; token: string }

function recall(): Saved | null {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || "null"); return s && typeof s.base === "string" && typeof s.token === "string" ? s : null; } catch { return null; }
}
function remember(s: Saved | null) {
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* storage is blocked: the person connects again after a reload */ }
}

export function PortableApp() {
  const [transport, setTransport] = useState<Transport | null>(null);
  const [starting, setStarting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);                                // remounts the view after results were added
  const live = useRef<Transport | null>(null);
  const client = useMemo(() => (transport ? new PortableClient(transport) : null), [transport]);

  const use = useCallback((t: Transport | null) => { live.current?.close(); live.current = t; setTransport(t); setNotice(""); }, []);

  const connect = useCallback(async (baseInput: string, token: string) => {
    setError("");
    let base: string;
    try { base = normalizeBase(baseInput); } catch (e) { setError((e as Error).message); return; }
    if (!token.trim()) { setError("Enter the access token your administrator gave you for that deployment."); return; }
    setStarting("Connecting…");
    const t = remoteTransport(base, token.trim());
    try {
      await new PortableClient(t).getDashboardCatalog();                // proves the address, the origin allowance and the token at once
      remember({ base, token: token.trim() });
      use(t);
    } catch (e) {
      const status = (e as any)?.status;
      setError(status === 401 || status === 403 ? "That deployment did not accept the token." : (e as Error).message);
    } finally { setStarting(""); }
  }, [use]);

  const standalone = useCallback(async () => {
    setError(""); setStarting("Starting the dashboards in this browser…");
    const t = standaloneTransport(setStarting);
    try { await t.ready; use(t); } catch (e) { t.close(); setError((e as Error).message); } finally { setStarting(""); }
  }, [use]);

  useEffect(() => {                                                     // a reload keeps the connection of this tab
    const s = recall();
    if (s) void connect(s.base, s.token);
    return () => live.current?.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => { remember(null); use(null); };

  if (!client || !transport) return <Choose starting={starting} error={error} onConnect={connect} onStandalone={standalone} />;
  return (
    <div className="pt">
      <header className="pt-bar">
        <h1>Projects dashboards</h1>
        <span className={`pill ${transport.kind === "remote" ? "ok" : "run"}`}><span className="dot" />{transport.kind === "remote" ? `Connected to ${transport.label}` : "Running in this browser"}</span>
        <span className="grow" />
        <button className="btn sm" onClick={leave}>{transport.kind === "remote" ? "Disconnect" : "Close"}</button>
      </header>
      {notice && <p className="pt-note" role="status">{notice}</p>}
      {transport.kind === "standalone" && <AddResults client={client} onAdded={(text) => { setNotice(text); setEpoch((n) => n + 1); }} />}
      <Dashboards key={epoch} client={client.asDataClient()}
        go={(section) => { if (section !== "dashboards") setNotice(transport.kind === "remote" ? `Open the Projects UI of ${transport.label} for that: this page shows the dashboards only.` : "That part of Projects needs a deployment: this page shows the dashboards only."); }}
        ask={() => setNotice(transport.kind === "remote" ? `Sidekick is in the Projects UI of ${transport.label}, not on this page.` : "Sidekick needs a Projects deployment; it is not part of this page.")} />
      {transport.kind === "standalone" && <Unavailable client={client} epoch={epoch} />}
    </div>
  );
}

function Choose({ starting, error, onConnect, onStandalone }: { starting: string; error: string; onConnect: (base: string, token: string) => void; onStandalone: () => void }) {
  const [base, setBase] = useState("");
  const [token, setToken] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); onConnect(base, token); };
  return (
    <div className="pt">
      <header className="pt-bar"><h1>Projects dashboards</h1></header>
      <p className="pt-note">Dashboards where a click on any number lists the records behind it, and an unknown is never shown as zero.</p>
      {error && <p className="pt-err" role="alert">{error}</p>}
      {starting && <p className="pt-note" role="status">{starting}</p>}
      <div className="pt-choose">
        <section className="card" aria-labelledby="pt-remote">
          <div className="hd"><h2 id="pt-remote" style={{ fontSize: 15 }}>Connect to a Projects deployment</h2></div>
          <form className="bd" onSubmit={submit}>
            <p>Every dashboard your account may see there, with the same numbers and records as in its own UI.</p>
            <label>Address of the deployment<input type="url" inputMode="url" autoComplete="url" placeholder="https://apps.example.com/projects" value={base} onChange={(e) => setBase(e.target.value)} required /></label>
            <label>Access token<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} required /></label>
            <p>The token is kept for this tab only and is sent only to that address. The deployment has to allow this page: its administrator adds this page's origin ({location.origin}) to <code>PROJECTS_CORS_ORIGINS</code>.</p>
            <div><button className="btn pri" type="submit" disabled={!!starting}>Connect</button></div>
          </form>
        </section>
        <section className="card" aria-labelledby="pt-local">
          <div className="hd"><h2 id="pt-local" style={{ fontSize: 15 }}>Work in this browser</h2></div>
          <div className="bd">
            <p>Four dashboards run here with no server: QA and release readiness and the portfolio view from test results you add (JUnit files), plus missions and infrastructure, which say that there is nothing to read here.</p>
            <p>Nothing you add leaves this browser. The first start loads about 13 MB.</p>
            <p>The dashboards of your applications (CRM, accounting, support, marketing, security and others) are not available this way: they need each application's credential, and a credential is never placed in a web page.</p>
            <div><button className="btn" onClick={onStandalone} disabled={!!starting}>Open in this browser</button></div>
          </div>
        </section>
      </div>
    </div>
  );
}

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function AddResults({ client, onAdded }: { client: PortableClient; onAdded: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("local");
  const [suite, setSuite] = useState("tests");
  const [platform, setPlatform] = useState("");
  const [expected, setExpected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!file) { setError("Choose a JUnit XML result file."); return; }
    if (!ID.test(project) || !ID.test(suite)) { setError("Project and suite are short lower-case ids: letters, digits, - and _."); return; }
    if (file.size > 16_000_000) { setError("The file is larger than 16 MB."); return; }
    setBusy(true);
    try {
      const platforms = expected.split(",").map((s) => s.trim()).filter(Boolean);
      const out = await client.addJunit({ project, suite, platform: platform.trim() || "unknown", platforms: platforms.length ? platforms : undefined, xml: await file.text() });
      setOpen(false); setFile(null);
      onAdded(`${out.results} results added to ${project} / ${suite}${out.duplicate ? " (this run was already here and was replaced)" : ""}. A test that is not in the file counts as not executed.`);
    } catch (err) { setError((err as Error).message || "The file could not be added."); } finally { setBusy(false); }
  }
  if (!open) return <div style={{ margin: "10px 0" }}><button className="btn sm pri" onClick={() => setOpen(true)}>Add test results</button></div>;
  return (
    <section className="card" style={{ margin: "10px 0" }} aria-label="Add test results">
      <form className="bd" onSubmit={submit} style={{ paddingTop: 14 }}>
        <div className="pt-form">
          <label>JUnit XML file<input type="file" accept=".xml,text/xml,application/xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></label>
          <label>Project<input value={project} onChange={(e) => setProject(e.target.value)} required /></label>
          <label>Suite<input value={suite} onChange={(e) => setSuite(e.target.value)} required /></label>
          <label>Platform it ran on<input placeholder="linux-x64" value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
          <label>Platforms it is expected on (optional, comma-separated)<input placeholder="linux-x64, windows-x64" value={expected} onChange={(e) => setExpected(e.target.value)} /></label>
        </div>
        {error && <p className="pt-err" role="alert">{error}</p>}
        <p className="pt-note" style={{ marginTop: 8 }}>A skipped test is recorded as blocked or unsupported, never as passed. An expected platform with no results shows as not executed.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn pri sm" type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
          <button className="btn sm" type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

function Unavailable({ client, epoch }: { client: PortableClient; epoch: number }) {
  const [info, setInfo] = useState<PortableInfo | null>(null);
  useEffect(() => { let on = true; client.about().then((i) => { if (on) setInfo(i); }).catch(() => undefined); return () => { on = false; }; }, [client, epoch]);
  if (!info) return null;
  return (
    <section className="card pt-un" aria-labelledby="pt-un-h">
      <div className="hd"><h2 id="pt-un-h" style={{ fontSize: 15 }}>Not available in this browser</h2></div>
      <div className="bd" style={{ paddingTop: 12 }}>
        <p className="pt-note" style={{ marginBottom: 10 }}>These {info.unavailable.length} dashboards read your applications. Connect to a Projects deployment that holds those connections to see them; no application credential is ever placed in this page.{info.durable ? "" : " This browser does not allow this page to keep data, so added results are lost when the tab closes."}</p>
        <ul>{info.unavailable.map((u) => <li key={u.id}><b>{u.title}</b> needs {u.needs.join(", ")}</li>)}</ul>
      </div>
    </section>
  );
}
