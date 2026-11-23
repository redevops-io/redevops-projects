import { useState } from "react";
import { Pill } from "./Pill";
import type { Health, ProjectRef } from "../data/types";

// The top bar is itself an input (doc §2): type an outcome here and submit — the side panel
// opens onto Sidekick's answer, so the user never has to open the panel first to ask. An
// empty submit (or ⌘K) just opens the panel.
export function Topbar({ project, unavailable, health, onAsk, onOpen }:
  { project: ProjectRef | null; unavailable?: boolean; health: { tone: Health; label: string; title?: string }; onAsk: (text: string) => void; onOpen: () => void }) {
  const [q, setQ] = useState("");
  return (
    <header className="topbar">
      <div className="proj">{project ? project.name : unavailable ? "Project unavailable" : "Loading…"} <span className="chev">▾</span></div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim();
          if (t) { onAsk(t); setQ(""); } else { onOpen(); }
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Ask Sidekick"
          placeholder="Ask Sidekick — what would you like done?"
          style={{ flex: 1, background: "transparent", border: 0, outline: "none",
            color: "inherit", font: "inherit", padding: 0 }}
        />
        <span className="k mono">⌘K</span>
      </form>
      <span title={health.title}><Pill tone={health.tone}><span role="status">{health.label}</span></Pill></span>
    </header>
  );
}
