import { Pill } from "./Pill";
import type { ProjectRef } from "../data/types";

export function Topbar({ project, onAsk }: { project: ProjectRef | null; onAsk: () => void }) {
  return (
    <div className="topbar">
      <div className="proj">{project ? project.name : "Loading…"} <span className="chev">▾</span></div>
      <button className="ask" onClick={onAsk} aria-label="Ask Sidekick">
        <span>Ask Sidekick — what would you like done?</span>
        <span className="k mono">⌘K</span>
      </button>
      <Pill tone={project?.health ?? "mut"}>{project?.health === "ok" ? "Healthy" : "…"}</Pill>
    </div>
  );
}
