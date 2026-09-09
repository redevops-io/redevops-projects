// The Projects API client — the ONE seam between the UI and the Runtime. A MockDataClient
// serves the sample projections so the app runs standalone; the HttpDataClient talks to
// the agentic-os Projects API (thin read/action surface over go_live, ProviderSetupGuide/
// verify_setup, and Mission/Attention/Discovery projections). Views depend only on this
// interface, so the Runtime can evolve without a frontend rewrite.
import type {
  ActivityEvent, AppCapability, AttentionItem, ConnectOutcome, ContextSource, DiscoveryFinding,
  MissionSummary, MissionDetail, MissionTemplate, ProjectOverview, ProjectRef, RuntimeHealth,
  SidekickContext, SidekickReply, SourceProposal, WorkflowSummary,
} from "./types";
import * as mock from "./mock";

export interface DataClient {
  listProjects(): Promise<ProjectRef[]>;
  getOverview(projectId: string): Promise<ProjectOverview>;
  getMissions(projectId: string): Promise<MissionSummary[]>;
  getMissionDetail(projectId: string, missionId: string): Promise<MissionDetail>;
  getWorkflows(projectId: string): Promise<WorkflowSummary[]>;
  getAttention(projectId: string): Promise<AttentionItem[]>;
  getDiscovery(projectId: string): Promise<DiscoveryFinding[]>;
  getApps(projectId: string): Promise<AppCapability[]>;
  getSources(projectId: string): Promise<ContextSource[]>;
  getRuntime(projectId: string): Promise<RuntimeHealth>;
  getTemplates(projectId: string): Promise<MissionTemplate[]>;
  getActivity(projectId: string): Promise<ActivityEvent[]>;
  askSidekick(ctx: SidekickContext, text: string): Promise<SidekickReply>;
  proposeSource(projectId: string, text: string): Promise<SourceProposal>;
  confirmSources(projectId: string, sources: SourceProposal["sources"], confirmedBy: string): Promise<ContextSource[]>;
  connectApp(provider: string): Promise<ConnectOutcome>;
}

export class MockDataClient implements DataClient {
  async listProjects() { return [mock.PROJECT]; }
  async getOverview() { return mock.OVERVIEW; }
  async getMissions() { return mock.MISSIONS; }
  async getMissionDetail(_p: string, missionId: string) { return mock.missionDetail(missionId); }
  async getWorkflows() { return mock.WORKFLOWS; }
  async getAttention() { return mock.ATTENTION; }
  async getDiscovery() { return mock.DISCOVERY; }
  // Live connection set so Connect updates apps + template readiness standalone too.
  private connected = new Set<string>(["whatsapp_business", "hubspot", "slack", "stripe", "polar"]);
  async getApps() {
    return mock.APPS.map((a) => this.connected.has(a.provider)
      ? { ...a, state: a.state === "NOT_CONNECTED" ? "VERIFIED_READ" as const : a.state, health: "ok" as const }
      : { ...a, state: "NOT_CONNECTED" as const, health: "mut" as const });
  }
  async connectApp(provider: string): Promise<ConnectOutcome> {
    this.connected.add(provider);
    return { provider, state: "VERIFIED_READ", connected: true, detail: "connected (mock)" };
  }
  async getSources() { return mock.SOURCES; }
  async getRuntime() { return mock.RUNTIME; }
  async getTemplates() {
    // recompute readiness against the live connection set (app labels map via APP_ID; sources stay ready)
    return mock.TEMPLATES.map((t) => ({
      ...t,
      readiness: t.readiness.map((r) => mock.APP_ID[r.label]
        ? { ...r, ready: this.connected.has(mock.APP_ID[r.label]) }
        : r),
    }));
  }
  async getActivity() { return mock.ACTIVITY; }
  async askSidekick(ctx: SidekickContext, text: string) { return scriptedReply(ctx, text); }
  async proposeSource(projectId: string, text: string) { return scriptedSourceProposal(projectId, text); }
  async confirmSources(_projectId: string, sources: SourceProposal["sources"]) {
    // A mock connect: reflect each proposed source back as a freshly-connected ContextSource.
    return sources.map((s, i): ContextSource => ({
      source_id: `new-${i}`, name: s.name || s.location || s.kind, kind: (s.kind as ContextSource["kind"]) || "files",
      provider: s.provider, location: s.location, access_mode: (s.access_mode as ContextSource["access_mode"]) || "read_only",
      indexing_policy: (s.indexing_policy as ContextSource["indexing_policy"]) || "automatic", refresh_policy: "on_change",
      exposure_class: "internal", health: { state: "healthy", detail: "Connected", last_observed_at: "just now" },
      stats: s.kind === "files" ? { discovered: 12, indexed: 12, skipped: 0 } : {}, allowed_paths: [],
      allowed_schemas: s.allowed_schemas || [], allowed_tables: [], allowed_content_types: s.allowed_content_types || [],
      denied: [], last_verified: "just now", source_fingerprint: "mock", source_runtime: "context", source_refs: [`source:new-${i}`],
    }));
  }
}

// A deterministic "use my X as context" interpreter — mirrors the backend propose_sources.
export function scriptedSourceProposal(projectId: string, text: string): SourceProposal {
  const t = text.toLowerCase();
  const sources: SourceProposal["sources"] = [];
  const assumptions: string[] = [];
  const questions: string[] = [];
  const path = text.match(/(~?\/[\w./-]+)/);
  if (path) {
    sources.push({ kind: "files", location: path[1], provider: "", access_mode: "read_only", allowed_content_types: [], allowed_schemas: [], indexing_policy: "automatic", name: path[1].split("/").filter(Boolean).pop() ?? path[1] });
    assumptions.push(`${path[1]} — read-only, automatic indexing, common document types`);
  }
  if (t.includes("postgres") || t.includes("database")) {
    sources.push({ kind: "database", location: "localhost/customer_ops", provider: "postgres", access_mode: "read_only", allowed_content_types: [], allowed_schemas: [], indexing_policy: "automatic", name: "customer_ops" });
    assumptions.push("localhost/customer_ops — read-only connection");
    questions.push("Which schemas/tables may be used as context?");
  }
  if (t.includes("google drive") || t.includes("gdrive")) {
    sources.push({ kind: "cloud_files", location: "Google Drive", provider: "google_drive", access_mode: "read_only", allowed_content_types: [], allowed_schemas: [], indexing_policy: "automatic", name: "Google Drive" });
    assumptions.push("Google Drive — connect via provider OAuth, then pick folders");
  }
  return { project_id: projectId, sources, assumptions, questions };
}

// A deterministic Sidekick stand-in until the real conversational backend is wired. It
// honours the context contract — "this" resolves to ctx.objectRef — exactly as the real
// one must.
export function scriptedReply(ctx: SidekickContext, text: string): SidekickReply {
  const t = text.toLowerCase();
  if (t.includes("two approver") || t.includes("$500")) {
    return { text: `Proposed on ${ctx.objectRef ?? "this workflow"}: refunds above $500 require two approvers. Governed policy change — confirm to commit.`, actions: [{ label: "Confirm", kind: "commit" }] };
  }
  if (t.includes("why") && t.includes("approv")) {
    return { text: "This is billing.refund.execute — a tier-4 action that moves money, so policy requires your approval. It runs under a GovernedEnvelope and is verified by re-reading the refund." };
  }
  if (t.includes("affected") || t.includes("which active mission")) {
    return { text: "The Stripe refund-API finding affects 1 workflow, 1 active Mission (#4821), and 4 scheduled Missions.", actions: [{ label: "Pause scheduled", kind: "pause" }] };
  }
  if ((t.includes("refund") && t.includes("whatsapp")) || t.includes("connect whatever") || t.includes("handle refund")) {
    return { text: "I'd wire: WhatsApp → HubSpot → Stripe → Slack approval → refund → verify → reply. You already have Slack, HubSpot, Stripe; still needed: WhatsApp. Refund needs approval; Stripe test mode first.", actions: [{ label: "Set this up", kind: "setup" }, { label: "Change something", kind: "edit" }] };
  }
  return { text: "I can turn that into a governed Mission across your connected apps. Want me to propose the steps?" };
}

export class HttpDataClient implements DataClient {
  constructor(private base: string) {}
  private async get<T>(path: string): Promise<T> {
    const r = await fetch(this.base.replace(/\/$/, "") + path, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Projects API ${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  listProjects() { return this.get<ProjectRef[]>("/api/projects"); }
  getOverview(id: string) { return this.get<ProjectOverview>(`/api/projects/${id}/overview`); }
  getMissions(id: string) { return this.get<MissionSummary[]>(`/api/projects/${id}/missions`); }
  getMissionDetail(id: string, mid: string) { return this.get<MissionDetail>(`/api/projects/${id}/missions/${mid}`); }
  getWorkflows(id: string) { return this.get<WorkflowSummary[]>(`/api/projects/${id}/workflows`); }
  getAttention(id: string) { return this.get<AttentionItem[]>(`/api/projects/${id}/attention`); }
  getDiscovery(id: string) { return this.get<DiscoveryFinding[]>(`/api/projects/${id}/discovery`); }
  getApps(id: string) { return this.get<AppCapability[]>(`/api/projects/${id}/apps`); }
  getSources(id: string) { return this.get<ContextSource[]>(`/api/projects/${id}/sources`); }
  getRuntime(id: string) { return this.get<RuntimeHealth>(`/api/projects/${id}/runtime`); }
  getTemplates(id: string) { return this.get<MissionTemplate[]>(`/api/projects/${id}/templates`); }
  getActivity(id: string) { return this.get<ActivityEvent[]>(`/api/projects/${id}/activity`); }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.base.replace(/\/$/, "") + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Projects API ${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  askSidekick(ctx: SidekickContext, text: string) { return this.post<SidekickReply>("/api/sidekick", { ctx, text }); }
  proposeSource(projectId: string, text: string) { return this.post<SourceProposal>("/api/sources/propose", { project_id: projectId, text }); }
  confirmSources(projectId: string, sources: SourceProposal["sources"], confirmedBy: string) {
    return this.post<ContextSource[]>("/api/sources/confirm", { project_id: projectId, sources, confirmed_by: confirmedBy });
  }
  connectApp(provider: string) { return this.post<ConnectOutcome>(`/api/apps/${provider}/connect`, {}); }
}

// Pick the client from the environment: a Projects API base URL → live; otherwise mock.
export function makeClient(): DataClient {
  const base = (import.meta as any).env?.VITE_PROJECTS_API as string | undefined;
  return base ? new HttpDataClient(base) : new MockDataClient();
}
