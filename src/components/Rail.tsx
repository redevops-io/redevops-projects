export type Section =
  | "overview" | "missions" | "workflows" | "sidekick" | "attention"
  | "discovery" | "sources" | "apps" | "activity" | "settings";

const GROUPS: { group: string; items: { id: Section; icon: string; label: string; badge?: number }[] }[] = [
  { group: "WORK", items: [
    { id: "overview", icon: "▦", label: "Overview" },
    { id: "missions", icon: "◈", label: "Missions" },
    { id: "workflows", icon: "⟲", label: "Workflows" },
    { id: "sidekick", icon: "✧", label: "Sidekick" },
    { id: "attention", icon: "◉", label: "Attention", badge: 3 },
  ] },
  { group: "KNOWLEDGE", items: [
    { id: "discovery", icon: "✦", label: "Discovery", badge: 2 },
    { id: "sources", icon: "▤", label: "Sources" },
  ] },
  { group: "SYSTEM", items: [
    { id: "apps", icon: "⧉", label: "Apps" },
    { id: "activity", icon: "≣", label: "Activity" },
    { id: "settings", icon: "⚙", label: "Settings" },
  ] },
];

export function Rail({ section, onNavigate }: { section: Section; onNavigate: (s: Section) => void }) {
  return (
    <aside className="rail">
      <div className="brand"><span className="logo">◆</span><span className="txt">ReDevOps</span></div>
      {GROUPS.map((g) => (
        <div key={g.group}>
          <div className="rgrp">{g.group}</div>
          {g.items.map((it) => (
            <button key={it.id} className="nav" aria-current={section === it.id}
              onClick={() => onNavigate(it.id)}>
              <span className="ic">{it.icon}</span>
              <span className="lbl">{it.label}</span>
              {it.badge ? <span className="badge">{it.badge}</span> : null}
            </button>
          ))}
        </div>
      ))}
      <div className="foot">Runtime-aware, not Runtime-shaped.<br />Projects renders truth · Sidekick proposes.</div>
    </aside>
  );
}
