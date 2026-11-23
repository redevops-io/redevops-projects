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
import { makeClient, classifyConnectionError, type ConnectionProblem, type DataClient } from "./data/client";
import { ConnectionContext } from "./hooks/connection";
import { DataBasisContext, type DataBasis } from "./hooks/basis";
import { DemoBanner } from "./components/DemoFlag";
import { Loading, LoadError } from "./components/LoadState";
import type { Health, ProjectOverview, SidekickContext } from "./data/types";

const SECTION_LABEL: Record<Section, string> = {
  today: "Today", overview: "Overview", missions: "Missions", inspection: "Deployment Inspection",
  social: "Social Intelligence", workflows: "Workflows", sidekick: "Sidekick",
  attention: "Attention", discovery: "Discovery", sources: "Sources", apps: "Apps",
  activity: "Activity", settings: "Settings",
};

const healthLabel = (h: Health) => ({ ok: "Healthy", warn: "Degraded", bad: "Unhealthy", run: "Running", mut: "Unknown" })[h];

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
  const [overviewProblem, setOverviewProblem] = useState<ConnectionProblem | null>(null);
  const [overviewTick, setOverviewTick] = useState(0);
  // Failed loads reported by the views, so the shell never says "Healthy" while a screen has nothing to show.
  const [viewProblems, setViewProblems] = useState<Record<string, ConnectionProblem>>({});
  const reporter = useMemo(() => ({
    report: (key: string, p: ConnectionProblem | null) => setViewProblems((m) => {
      if (!p) { if (!(key in m)) return m; const { [key]: _gone, ...rest } = m; return rest; }
      return m[key] === p ? m : { ...m, [key]: p };
    }),
  }), []);
  const [basis, setBasis] = useState<DataBasis>(api.kind === "mock" ? "mock" : "unknown");
  const [todayCount, setTodayCount] = useState<number | undefined>(undefined);
  const [focusItem, setFocusItem] = useState<string | null>(start.section === "today" ? start.item ?? null : null);
  const notif = useNotifications(api);
  const [skOpen, setSkOpen] = useState(false);
  const [skSeed, setSkSeed] = useState<SidekickSeed | null>(null);

  // Both entry points converge here. `send:false` (suggested prompts) pre-fills + focuses the
  // panel input; `send:true` (top-bar submit) opens straight onto the answer.
  function askSidekick(text: string, send: boolean) {
    setSkSeed({ text, send, nonce: Date.now() });
    setSkOpen(true);
  }

  useEffect(() => {
    let live = true;
    setOverviewProblem(null);
    api.getOverview("customer-ops").then(
      (o) => { if (live) setOverview(o); },
      (e) => { if (live) setOverviewProblem(classifyConnectionError(e)); },
    );
    return () => { live = false; };
  }, [api, overviewTick]);
  useEffect(() => {      // what is behind the screen: the Today feed says whether it is sample data
    if (api.kind === "mock") { setBasis("mock"); return; }
    let live = true;
    api.getToday("customer-ops").then((f) => { if (live) setBasis(f.basis === "sample" ? "sample" : f.basis === "unavailable" ? "unknown" : "live"); }, () => { /* stays "unknown" */ });
    return () => { live = false; };
  }, [api]);
  useEffect(() => {     // back/forward and desktop deep links (hash changes) navigate without a reload
    const onHash = () => {
      const r = parseHash(window.location.hash);
      if (!r) return;
      setSectionState(r.section); rememberPlace(r.section);
      setFocusItem(r.section === "today" ? r.item ?? null : null);
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

  // One answer to "can we reach the runtime and did the data load?" — drives the badge and the window title.
  const failing = notif.problem ?? overviewProblem ?? Object.values(viewProblems)[0] ?? null;
  const health: { tone: Health; label: string; title?: string } =
    failing ? (failing.kind === "unavailable"
        ? { tone: "bad", label: "Can't reach runtime", title: failing.detail }
        : { tone: "warn", label: "Data didn't load", title: failing.detail })
    : overview ? { tone: overview.project.health, label: healthLabel(overview.project.health) + (basis === "live" ? "" : " (sample)"), title: basis === "live" ? undefined : "Health of the sample project, not of a real system" }
    : { tone: "mut", label: "Connecting…" };
  useEffect(() => {
    const n = notif.state && !failing ? notif.state.count : 0;     // a count we can no longer vouch for is not shown
    try { document.title = `${n > 0 ? `(${n}) ` : ""}${failing ? "Can't reach runtime · " : ""}${SECTION_LABEL[section]} · ReDevOps`; } catch { /* no document */ }
  }, [notif.state, notif.problem, failing, section]);

  const ctx: SidekickContext = { projectId: "customer-ops", section: SECTION_LABEL[section] };

  function view() {
    switch (section) {
      case "today": return <Today client={api} go={setSection} onCount={setTodayCount} focusItem={focusItem} onFocused={() => { setFocusItem(null); if (parseHash(window.location.hash)?.item) window.history.replaceState(null, "", formatHash({ section: "today" })); }} />;
      case "overview":
        return overview
          ? <Overview data={overview} go={setSection} />
          : overviewProblem ? <LoadError problem={overviewProblem} onRetry={() => setOverviewTick((n) => n + 1)} what="Summary" /> : <Loading />;
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
    <ConnectionContext.Provider value={reporter}><DataBasisContext.Provider value={basis}>
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <Rail section={section} onNavigate={setSection} badges={{ today: failing ? 0 : notif.state?.count ?? todayCount ?? 0 }} />
      <div className="main">
        <Topbar project={overview?.project ?? null} unavailable={!!overviewProblem} health={health} onAsk={(t) => askSidekick(t, true)} onOpen={() => setSkOpen(true)} />
        <ConnectionBanner problem={notif.problem} onRetry={() => void notif.refresh()} />
        {section !== "today" && <DemoBanner />}
        <SectionTabs section={section} onNavigate={setSection} />
        {/* in the page flow, not floating over it: a notification can never cover the item being reviewed */}
        <NotificationToasts pending={failing ? [] : notif.state?.pending ?? []}
          onOpen={(n) => { setSection("today"); setFocusItem(n.id); void notif.ack([n.key]); }}
          onDismiss={(n) => void notif.ack([n.key])} onDismissAll={() => void notif.ack((notif.state?.pending ?? []).map((p) => p.key))} />
        <main id="main" tabIndex={-1} className="viewport"><ErrorBoundary resetKey={section}>{view()}</ErrorBoundary></main>
      </div>
      <Sidekick open={skOpen} ctx={ctx} client={api} seed={skSeed} onClose={() => setSkOpen(false)}
        go={(s) => { setSection(s); setSkOpen(false); }} />
    </div>
    </DataBasisContext.Provider></ConnectionContext.Provider>
  );
}
