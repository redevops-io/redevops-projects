import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Rail, type Section } from "./components/Rail";
import { Topbar } from "./components/Topbar";
import { Sidekick, type SidekickSeed } from "./components/Sidekick";
import { Overview } from "./views/Overview";
import { Missions } from "./views/Missions";
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

const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview", missions: "Missions", workflows: "Workflows", sidekick: "Sidekick",
  attention: "Attention", discovery: "Discovery", sources: "Sources", apps: "Apps",
  activity: "Activity", settings: "Settings",
};

export function App({ client }: { client?: DataClient }) {
  const api = useMemo(() => client ?? makeClient(), [client]);
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [skOpen, setSkOpen] = useState(false);
  const [skSeed, setSkSeed] = useState<SidekickSeed | null>(null);

  // Both entry points converge here. `send:false` (suggested prompts) pre-fills + focuses the
  // panel input; `send:true` (top-bar submit) opens straight onto the answer.
  function askSidekick(text: string, send: boolean) {
    setSkSeed({ text, send, nonce: Date.now() });
    setSkOpen(true);
  }

  useEffect(() => { api.getOverview("customer-ops").then(setOverview); }, [api]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSkOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: SidekickContext = { projectId: "customer-ops", section: SECTION_LABEL[section] };

  function view() {
    switch (section) {
      case "overview":
        return overview
          ? <Overview data={overview} go={setSection} />
          : <section className="content"><div className="placeholder">Loading…</div></section>;
      case "missions": return <Missions client={api} go={setSection} ask={(t) => askSidekick(t, false)} />;
      case "workflows": return <Workflows client={api} go={setSection} />;
      case "sidekick": return <SidekickTab client={api} go={setSection} ctx={ctx} />;
      case "attention": return <Attention client={api} go={setSection} />;
      case "discovery": return <Discovery client={api} go={setSection} />;
      case "sources": return <Sources client={api} go={setSection} />;
      case "apps": return <Apps client={api} go={setSection} />;
      case "activity": return <Activity client={api} go={setSection} />;
      case "settings": return <Settings client={api} go={setSection} />;
    }
  }

  return (
    <div className="app">
      <Rail section={section} onNavigate={setSection} />
      <div className="main">
        <Topbar project={overview?.project ?? null} onAsk={(t) => askSidekick(t, true)} onOpen={() => setSkOpen(true)} />
        {view()}
      </div>
      <Sidekick open={skOpen} ctx={ctx} client={api} seed={skSeed} onClose={() => setSkOpen(false)} />
    </div>
  );
}
