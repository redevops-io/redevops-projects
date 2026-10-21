import { DESTINATIONS, destinationOf, type Section } from "../nav";
export type { Section } from "../nav";

// Five primary destinations + Settings. Only Today carries a count, and it is the real count of actionable items —
// no placeholder badges. Sidekick is not here: it is global (top bar / ⌘K).
export function Rail({ section, onNavigate, badges }: { section: Section; onNavigate: (s: Section) => void; badges?: Partial<Record<string, number>> }) {
  const here = destinationOf(section).id;
  const primary = DESTINATIONS.filter((d) => !d.secondary), secondary = DESTINATIONS.filter((d) => d.secondary);
  const btn = (d: (typeof DESTINATIONS)[number]) => (
    <button key={d.id} className="nav" aria-label={badges?.[d.id] ? `${d.label}, ${badges[d.id]} need you` : d.label} title={d.label} aria-current={here === d.id ? "page" : undefined} onClick={() => onNavigate(d.sections[0])}>
      <span className="ic" aria-hidden="true">{d.icon}</span>
      <span className="lbl">{d.label}</span>
      {badges?.[d.id] ? <span className="badge" aria-hidden="true">{badges[d.id]}</span> : null}
    </button>
  );
  return (
    <aside className="rail">
      <div className="brand"><span className="logo">◆</span><span className="txt">ReDevOps</span></div>
      <nav aria-label="Primary">{primary.map(btn)}</nav>
      <nav aria-label="Settings" className="rail-bottom">{secondary.map(btn)}</nav>
      <div className="foot">Projects renders truth · Sidekick proposes.</div>
    </aside>
  );
}
