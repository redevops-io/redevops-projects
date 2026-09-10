import { useState } from "react";
import { Pill } from "./Pill";
import type { ProjectRef } from "../data/types";

// The top bar is itself an input (doc §2): type an outcome here and submit — the side panel
// opens onto Sidekick's answer, so the user never has to open the panel first to ask. An
// empty submit (or ⌘K) just opens the panel.
export function Topbar({ project, onAsk, onOpen }:
  { project: ProjectRef | null; onAsk: (text: string) => void; onOpen: () => void }) {
  const [q, setQ] = useState("");
  return (
    <div className="topbar">
      <div className="proj">{project ? project.name : "Loading…"} <span className="chev">▾</span></div>
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
      <Pill tone={project?.health ?? "mut"}>{project?.health === "ok" ? "Healthy" : "…"}</Pill>
    </div>
  );
}
