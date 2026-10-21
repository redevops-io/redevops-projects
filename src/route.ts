import { DESTINATIONS, type Section } from "./nav";

// Hash routes: `#/today`, `#/today/<itemId>`, `#/work`, `#/connections/apps`. One implementation for the browser and
// the desktop shell — a desktop deep link (redevops://open?section=…&item=…) is just mapped onto this hash on the
// configured deployment, so the shell holds no navigation logic of its own. Everything is allowlisted: an unknown
// section or a malformed item id is ignored, never trusted.
export interface Route { section: Section; item?: string }

const SECTIONS = new Set<string>(DESTINATIONS.flatMap((d) => d.sections));
const ITEM_RE = /^[A-Za-z0-9_:.-]{1,80}$/;
const LAST_KEY = "redevops.last-place";

export function parseHash(hash: string): Route | null {
  const m = /^#\/?([a-z-]+)(?:\/([^/?#]*))?$/.exec(hash ?? "");
  if (!m || !SECTIONS.has(m[1])) return null;
  let item: string | undefined;
  if (m[2]) {
    let v: string;
    try { v = decodeURIComponent(m[2]); } catch { return { section: m[1] as Section }; }
    item = ITEM_RE.test(v) ? v : undefined;
  }
  return item ? { section: m[1] as Section, item } : { section: m[1] as Section };
}

export function formatHash(r: Route): string {
  return `#/${r.section}${r.item && ITEM_RE.test(r.item) ? "/" + encodeURIComponent(r.item) : ""}`;
}

export function readLastPlace(): Section | null {
  try { const v = localStorage.getItem(LAST_KEY); return v && SECTIONS.has(v) ? (v as Section) : null; } catch { return null; }
}
export function rememberPlace(s: Section): void {
  try { localStorage.setItem(LAST_KEY, s); } catch { /* storage can be blocked; restoring the place is a convenience */ }
}

// The hash wins (a deep link or a refresh), then the last place, then Today.
export function initialRoute(hash: string): Route {
  return parseHash(hash) ?? { section: readLastPlace() ?? "today" };
}
