import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Rail } from "./components/Rail";
import { SectionTabs } from "./components/SectionTabs";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotificationToasts } from "./components/NotificationToasts";
import { useNotifications } from "./hooks/useNotifications";
import { ConnectionBanner } from "./components/ConnectionBanner";
import type { Section } from "./nav";
import { formatHash, initialRoute, parseHash, rememberPlace } from "./route";
import { Topbar } from "./components/Topbar";
import { Sidekick, type SidekickSeed } from "./components/Sidekick";
import { Today } from "./views/Today";
import { Overview } from "./views/Overview";
import { Dashboards } from "./views/Dashboards";
import { Missions } from "./views/Missions";
import { Inspection } from "./views/Inspection";
import { SocialIntel } from "./views/SocialIntel";
import { Workflows } from "./views/Workflows";
import { SidekickTab } from "./views/SidekickTab";
import { Attention } from "./views/Attention";
import { Discovery } from "./views/Discovery";
import { Sources } from "./views/Sources";
import { Apps } from "./views/Apps";
import { Activity } from "./views/Activity";
import { Settings } from "./views/Settings";
import { makeClient, type DataClient } from "./data/client";
import type { ProjectOverview, SidekickContext } from "./data/types";
import { deployment, recallDeployment, rememberDeployment, setDeployment } from "./data/deployment";

const SECTION_LABEL: Record<Section, string> = {
  today: "Today", dashboards: "Dashboards", overview: "Overview", missions: "Missions", inspection: "Deployment Inspection",
  social: "Social Intelligence", workflows: "Workflows", sidekick: "Sidekick",
  attention: "Attention", discovery: "Discovery", sources: "Sources", apps: "Apps",
  activity: "Activity", settings: "Settings",
};

export function App({ client }: { client?: DataClient }) {
  const api = useMemo(() => client ?? makeClient(), [client]);
  // Place comes from the URL hash (deep link / refresh), else the last place, else Today — identical in the browser and
  // the desktop shell, which just points its window at the deployment and (for deep links) sets this hash.
  const start = useMemo(() => initialRoute(typeof window === "undefined" ? "" : window.location.hash), []);
  const [section, setSectionState] = useState<Section>(start.section);
  const setSection = useCallback((s: Section, item?: string) => {
    setSectionState(s);
    if (typeof window !== "undefined") {
      const h = formatHash({ section: s, item });
      if (window.location.hash !== h) window.history.pushState(null, "", h);
    }
    rememberPlace(s);
  }, []);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [todayCount, setTodayCount] = useState<number | undefined>(undefined);
  const [focusItem, setFocusItem] = useState<string | null>(start.section === "today" ? start.item ?? null : null);
  // Dashboards: the open dashboard (deep-linkable as #/dashboards/<id>) and what Sidekick's "this" means while there.
  const [dashItem, setDashItem] = useState<string | null>(start.section === "dashboards" ? start.item ?? null : null);
  const [dashRef, setDashRef] = useState<string | undefined>(undefined);
  const [dashProject, setDashProject] = useState("");
  const notif = useNotifications(api);
  const [skOpen, setSkOpen] = useState(false);
  const [skSeed, setSkSeed] = useState<SidekickSeed | null>(null);

  // Both entry points converge here. `send:false` (suggested prompts) pre-fills + focuses the
  // panel input; `send:true` (top-bar submit) opens straight onto the answer.
  function askSidekick(text: string, send: boolean, objectRef?: string) {
    if (objectRef !== undefined) setDashRef(objectRef);
    setSkSeed({ text, send, nonce: Date.now() });
    setSkOpen(true);
  }

  // Which project this deployment has and whether it serves demo fixtures: asked once, before any screen is shown, so no screen
  // fetches with the wrong project or flashes demo content on a real deployment.
  // A returning visit starts from what this origin answered last time (no wait before the first paint); a first visit waits,
  // except on the Dashboards, which need neither the project id nor the demo flag to draw.
  const [ready, setReady] = useState(() => recallDeployment());
  const [depRev, setDepRev] = useState(0);
  useEffect(() => {
    let live = true;
    api.listProjects().then((ps) => {
      const p = ps[0];
      if (!p) return;
      const next = { projectId: p.id, projectName: p.name, sample: p.sample !== false };
      const changed = next.projectId !== deployment.projectId || next.sample !== deployment.sample || next.projectName !== deployment.projectName;
      setDeployment(next); rememberDeployment();
      if (changed && live) setDepRev((n) => n + 1);          // what was remembered is stale: redraw the screen with the truth
    }).catch(() => { setDeployment({ sample: false }); /* unknown server: show no demo content; the connection banner explains the rest */ })
      .finally(() => { if (live) { setReady(true); api.getOverview(deployment.projectId).then((o) => { if (live) setOverview(o); }).catch(() => { /* the connection banner explains it */ }); } });
    return () => { live = false; };
  }, [api]);
  useEffect(() => {     // back/forward and desktop deep links (hash changes) navigate without a reload
    const onHash = () => {
      const r = parseHash(window.location.hash);
      if (!r) return;
      setSectionState(r.section); rememberPlace(r.section);
      setFocusItem(r.section === "today" ? r.item ?? null : null);
      if (r.section === "dashboards") setDashItem(r.item ?? null);
    };
    window.addEventListener("hashchange", onHash); window.addEventListener("popstate", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSkOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: SidekickContext = section === "dashboards"
    ? { projectId: dashProject || deployment.projectId, section: SECTION_LABEL[section], objectRef: dashRef }
    : { projectId: deployment.projectId, section: SECTION_LABEL[section] };

  function view() {
    switch (section) {
      case "today": return <Today client={api} go={setSection} onCount={setTodayCount} focusItem={focusItem} onFocused={() => { setFocusItem(null); if (parseHash(window.location.hash)?.item) window.history.replaceState(null, "", formatHash({ section: "today" })); }} />;
      case "dashboards":
        return <Dashboards client={api} go={setSection} ask={askSidekick} initial={dashItem}
          onContext={(ref, project) => { setDashRef(ref); setDashProject(project); }} />;
      case "overview":
        return overview
          ? <Overview data={overview} go={setSection} />
          : <section className="content"><div className="placeholder">Loading…</div></section>;
      case "missions": return <Missions client={api} go={setSection} ask={(t) => askSidekick(t, false)} />;
      case "inspection": return <Inspection client={api} go={setSection} ask={(t) => askSidekick(t, false)} />;
      case "social": return <SocialIntel client={api} go={setSection} ask={(t) => askSidekick(t, false)} />;
      case "workflows": return <Workflows client={api} go={setSection} />;
      case "sidekick": return <SidekickTab client={api} go={setSection} ctx={ctx} />;
      case "attention": return <Attention client={api} go={setSection} />;
      case "discovery": return <Discovery client={api} go={setSection} />;
      case "sources": return <Sources client={api} go={setSection} />;
      case "apps": return <Apps client={api} go={setSection} />;
      case "activity": return <Activity client={api} go={setSection} />;
      case "settings": return <Settings client={api} go={setSection} onPrefsChanged={() => void notif.refresh()} />;
    }
  }

  return (
    <div className={`app${skOpen ? " sk-open" : ""}`}>
      <a className="skip" href="#main">Skip to content</a>
      <Rail section={section} onNavigate={setSection} badges={{ today: notif.state?.count ?? todayCount ?? 0 }} />
      <div className="main">
        <Topbar project={overview?.project ?? null} onAsk={(t) => askSidekick(t, true)} onOpen={() => setSkOpen(true)}
          onDashboards={() => setSection("dashboards")} onDashboardsNow={section === "dashboards"} />
        <ConnectionBanner problem={notif.problem} onRetry={() => void notif.refresh()} />
        <SectionTabs section={section} onNavigate={setSection} />
        <main id="main" tabIndex={-1} className="viewport"><ErrorBoundary resetKey={`${section}:${depRev}`} key={depRev}>{ready || section === "dashboards" ? view() : <section className="content"><div className="placeholder" role="status" data-testid="deployment-wait">Loading…</div></section>}</ErrorBoundary></main>
      </div>
      <NotificationToasts pending={notif.state?.pending ?? []}
        onOpen={(n) => { setSection("today"); setFocusItem(n.id); void notif.ack([n.key]); }}
        onDismiss={(n) => void notif.ack([n.key])} onDismissAll={() => void notif.ack((notif.state?.pending ?? []).map((p) => p.key))} />
      <Sidekick open={skOpen} ctx={ctx} client={api} seed={skSeed} onClose={() => setSkOpen(false)}
        go={(s) => { setSection(s); setSkOpen(false); }} />
    </div>
  );
}
