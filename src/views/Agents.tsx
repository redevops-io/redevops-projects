import { useCallback, useEffect, useState } from "react";
import type { AgentListing, Connected, DesktopApi } from "../data/desktop";

// The agents on this computer. This is the only place an agent can be given a permission that changes something: it is
// given by the person, to one agent, for a limited time, and can be taken back at any moment.
const CLIENT_LABEL: Record<string, string> = { generic: "Another MCP client", "gemini-cli": "Gemini CLI", "claude-desktop": "Claude Desktop", "local-model": "A local model" };
const day = (s: number) => new Date(s * 1000).toLocaleDateString();

export function Agents({ desktop }: { desktop: DesktopApi }) {
  const [listing, setListing] = useState<AgentListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("generic");
  const [days, setDays] = useState(30);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [made, setMade] = useState<Connected | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const l = await desktop.agents(); setListing(l); } catch (e) { setError((e as Error).message); }
  }, [desktop]);
  useEffect(() => { void load(); }, [load]);

  const toggle = (g: string) => setTicked((t) => { const n = new Set(t); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setError(null); setMade(null);
    try {
      setMade(await desktop.connect(name, [...ticked], days, client));
      setName(""); setTicked(new Set()); await load();
    } catch (x) { setError((x as Error).message); }
  }

  async function revoke(id: string) {
    setError(null); setConfirming(null);
    try { await desktop.revoke(id); await load(); } catch (x) { setError((x as Error).message); }
  }

  if (!listing) return <section className="content">{error ? <p role="alert">{error}</p> : <div className="placeholder" role="status">Loading…</div>}</section>;
  const meaning = new Map(listing.grantable.map((g) => [g.grant, g.meaning]));
  const group = (changes: boolean, legend: string) => {
    const items = listing.grantable.filter((g) => g.changes === changes);
    return items.length === 0 ? null : (
      <fieldset>
        <legend>{legend}</legend>
        {items.map((g) => (
          <label className="grant" key={g.grant}><input type="checkbox" checked={ticked.has(g.grant)} onChange={() => toggle(g.grant)} /> <code>{g.grant}</code> <span className="s">{g.meaning}</span></label>
        ))}
      </fieldset>
    );
  };
  return (
    <section className="content">
      <div><div className="eyebrow">Each agent has its own permissions, for a limited time</div><h1 className="h">Connected agents</h1></div>
      {error && <div className="card" role="alert"><div className="bd"><p>{error}</p></div></div>}
      {made && (
        <div className="card" role="status"><div className="hd"><h2 className="eyebrow">Connected: {made.agent.name}</h2></div><div className="bd">
          <p>Add this server to the agent's settings. It names the file that holds the token; the token itself is not shown.</p>
          <pre className="technical" tabIndex={0}>{JSON.stringify({ mcpServers: { rails: made.mcp_server } }, null, 2)}</pre>
          <p className="s">Token file: <code>{made.token_file}</code>. Its permissions end in {made.expires_in_days} days.</p>
        </div></div>
      )}
      <div className="card"><div className="hd"><h2 className="eyebrow">Agents</h2></div><div className="bd">
        {listing.agents.length === 0 && <div className="placeholder">No agent is connected.</div>}
        {listing.agents.map((a) => (
          <div className="row" key={a.id}>
            <div className="grow">
              <div className="t">{a.name} <span className={`pill ${a.active ? "ok" : "mut"}`}>{a.active ? "Connected" : "Revoked"}</span></div>
              <div className="s">{CLIENT_LABEL[a.client] ?? a.client} · connected {day(a.created_at)}</div>
              <ul className="grants">{a.grants.map((g) => <li key={g}><code>{g}</code> <span className="s">{meaning.get(g) ?? ""}</span></li>)}</ul>
            </div>
            {a.active && (confirming === a.id ? (
              <span role="group" aria-label={`Revoke ${a.name}?`}>
                <span className="s">Its waiting requests can then no longer be approved.</span>{" "}
                <button className="btn sm pri" onClick={() => void revoke(a.id)}>Revoke now</button>{" "}
                <button className="btn sm" onClick={() => setConfirming(null)}>Keep</button>
              </span>
            ) : <button className="btn sm" onClick={() => setConfirming(a.id)} aria-label={`Revoke ${a.name}`}>Revoke</button>)}
          </div>
        ))}
      </div></div>
      <div className="card"><div className="hd"><h2 className="eyebrow">Connect an agent</h2></div><div className="bd">
        <form onSubmit={(e) => void connect(e)} className="form">
          <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
          <label>Client <select value={client} onChange={(e) => setClient(e.target.value)}>{listing.clients.map((c) => <option key={c} value={c}>{CLIENT_LABEL[c] ?? c}</option>)}</select></label>
          <label>Days <input type="number" min={1} max={listing.max_days} value={days} onChange={(e) => setDays(Number(e.target.value))} required /></label>
          {group(false, "See")}
          {group(true, "Make changes")}
          <p className="s">Records and new media files are saved at once. Installing an application, and every change to anything else, waits for your approval here.</p>
          <button className="btn pri" type="submit" disabled={!name.trim() || ticked.size === 0}>Connect</button>
        </form>
      </div></div>
    </section>
  );
}
