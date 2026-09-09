import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Rail, type Section } from "./components/Rail";
import { Topbar } from "./components/Topbar";
import { Sidekick } from "./components/Sidekick";
import { Overview } from "./views/Overview";
import { Placeholder } from "./views/Placeholder";
import { makeClient, type DataClient } from "./data/client";
import type { ProjectOverview, SidekickContext } from "./data/types";

const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview", missions: "Missions", workflows: "Workflows", attention: "Attention",
  discovery: "Discovery", apps: "Apps", activity: "Activity", settings: "Settings",
};

export function App({ client }: { client?: DataClient }) {
  const api = useMemo(() => client ?? makeClient(), [client]);
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [skOpen, setSkOpen] = useState(false);

  useEffect(() => { api.getOverview("customer-ops").then(setOverview); }, [api]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSkOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: SidekickContext = { projectId: "customer-ops", section: SECTION_LABEL[section] };

  return (
    <div className="app">
      <Rail section={section} onNavigate={setSection} />
      <div className="main">
        <Topbar project={overview?.project ?? null} onAsk={() => setSkOpen(true)} />
        {section === "overview" && overview
          ? <Overview data={overview} go={setSection} />
          : <Placeholder section={section} />}
      </div>
      <Sidekick open={skOpen} ctx={ctx} client={api} onClose={() => setSkOpen(false)} />
    </div>
  );
}
