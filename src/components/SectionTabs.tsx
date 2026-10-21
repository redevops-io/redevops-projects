import { TAB_LABEL, destinationOf, type Section } from "../nav";

// The sections inside a destination, as a quiet sub-navigation. Hidden when a destination has only one.
export function SectionTabs({ section, onNavigate }: { section: Section; onNavigate: (s: Section) => void }) {
  const d = destinationOf(section);
  if (d.sections.length < 2) return null;
  return (
    <nav className="subnav" aria-label={`${d.label} sections`}>
      {d.sections.map((s) => (
        <button key={s} aria-current={s === section ? "page" : undefined} onClick={() => onNavigate(s)}>{TAB_LABEL[s]}</button>
      ))}
    </nav>
  );
}
