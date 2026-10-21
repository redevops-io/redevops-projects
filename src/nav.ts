// Five places, not twelve (CONTROL_SURFACES_UX plan §3.1). Every existing section id and view is kept; they are
// regrouped under destinations so a user thinks "what needs me / my work / what happened / what runs by itself /
// what's connected" instead of Runtime nouns. Sidekick is global (top bar, ⌘K), not a destination.
export type Section =
  | "today" | "overview" | "missions" | "inspection" | "social" | "workflows" | "sidekick" | "attention"
  | "discovery" | "sources" | "apps" | "activity" | "settings";

export interface Destination { id: string; label: string; icon: string; sections: Section[]; secondary?: boolean }

export const DESTINATIONS: Destination[] = [
  { id: "today", label: "Today", icon: "☀", sections: ["today"] },
  { id: "work", label: "Work", icon: "◈", sections: ["missions", "overview", "attention", "social", "discovery"] },
  { id: "activity", label: "Activity", icon: "≣", sections: ["activity"] },
  { id: "automations", label: "Automations", icon: "⟲", sections: ["workflows"] },
  { id: "connections", label: "Connections", icon: "⧉", sections: ["apps", "sources", "inspection"] },
  { id: "settings", label: "Settings", icon: "⚙", sections: ["settings", "sidekick"], secondary: true },
];

// the label a section carries as a tab inside its destination
export const TAB_LABEL: Record<Section, string> = {
  today: "Today", missions: "Missions", overview: "Summary", attention: "Attention", social: "Social",
  discovery: "Discovery", activity: "Activity", workflows: "Workflows", apps: "Apps", sources: "Data sources",
  inspection: "Deployment health", settings: "General", sidekick: "Sidekick",
};

export function destinationOf(section: Section): Destination {
  return DESTINATIONS.find((d) => d.sections.includes(section)) ?? DESTINATIONS[0];
}
