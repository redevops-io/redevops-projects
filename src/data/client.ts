// The Projects API client — the ONE seam between the UI and the Runtime. A MockDataClient
// serves the sample projections so the app runs standalone; the HttpDataClient talks to
// the agentic-os Projects API (thin read/action surface over go_live, ProviderSetupGuide/
// verify_setup, and Mission/Attention/Discovery projections). Views depend only on this
// interface, so the Runtime can evolve without a frontend rewrite.
import type {
  ActivityEvent, AppCapability, AttentionItem, ConnectOutcome, ContextSource, DeploymentInspection,
  DiscoveryFinding, MissionSummary, MissionDetail, MissionTemplate, ProjectOverview, ProjectRef,
  RuntimeHealth, SidekickContext, SidekickReply, SocialMissionView, SourceProposal, TodayDetail, TodayFeed,
  TodayItemOptions, WorkflowSummary, CaptureItem, BatchRequest, BatchResult, UndoResult, TodayNotifications,
  NotificationPrefs,
} from "./types";
import * as mock from "./mock";
import { MockToday, TodayApiError } from "./mockToday";

export { TodayApiError };

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
  getDeploymentInspection(projectId: string): Promise<DeploymentInspection>;
  getSocialIntelligence(projectId: string): Promise<SocialMissionView>;
  askSidekick(ctx: SidekickContext, text: string): Promise<SidekickReply>;
  proposeSource(projectId: string, text: string): Promise<SourceProposal>;
  confirmSources(projectId: string, sources: SourceProposal["sources"], confirmedBy: string): Promise<ContextSource[]>;
  connectApp(provider: string): Promise<ConnectOutcome>;
  // Today — outcome-first feed. approve() binds the exact payload_digest the user reviewed; the server refuses
  // (409 stale_approval) if the content, recipients or attempt changed since.
  getToday(projectId: string): Promise<TodayFeed>;
  getTodayItem(projectId: string, itemId: string, opts?: TodayItemOptions): Promise<TodayDetail>;
  approveToday(projectId: string, itemId: string, req: { payload_digest: string; targets?: string[]; identity_id?: string }): Promise<TodayDetail>;
  snoozeToday(projectId: string, itemId: string, seconds: number): Promise<TodayDetail>;
  dismissToday(projectId: string, itemId: string): Promise<TodayDetail>;
  simulateTodayOutcome(projectId: string, itemId: string): Promise<TodayDetail>;
  // Quick Capture — a durable intake. Never sends or approves; routes to a reminder, a case, or Intake.
  capture(projectId: string, content: string, source?: string): Promise<CaptureItem>;
  listCaptures(projectId: string, status?: string): Promise<CaptureItem[]>;
  resolveCapture(projectId: string, captureId: string, caseId: string): Promise<CaptureItem>;
  archiveCapture(projectId: string, captureId: string): Promise<CaptureItem>;
  // Batch triage: reversible actions only (the server refuses approve). One undo token covers what succeeded.
  batchToday(projectId: string, req: BatchRequest): Promise<BatchResult>;
  undoBatch(projectId: string, token: string): Promise<UndoResult>;
  // Notifications are derived from Today; only genuinely actionable items interrupt.
  getNotifications(projectId: string): Promise<TodayNotifications>;
  ackNotifications(projectId: string, keys: string[]): Promise<{ acknowledged: number }>;
  setNotificationPrefs(projectId: string, prefs: Partial<NotificationPrefs> & { clear_quiet?: boolean }): Promise<NotificationPrefs>;
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
  async getDeploymentInspection() { return mock.DEPLOYMENT_INSPECTION; }
  async getSocialIntelligence() { return mock.SOCIAL_INTELLIGENCE; }
  private today: MockToday;
  constructor(clock?: () => number) { this.today = new MockToday(clock); }
  async getToday(_p?: string) { return this.today.feed(); }
  async getTodayItem(_p: string, id: string, o?: TodayItemOptions) { return this.today.item(id, o); }
  async approveToday(_p: string, id: string, req: { payload_digest: string; targets?: string[]; identity_id?: string }) { return this.today.approve(id, req); }
  async snoozeToday(_p: string, id: string, seconds: number) { return this.today.snooze(id, seconds); }
  async dismissToday(_p: string, id: string) { return this.today.dismiss(id); }
  async simulateTodayOutcome(_p: string, id: string) { return this.today.simulateOutcome(id); }
  async capture(_p: string, content: string, source = "manual") { return this.today.capture(content, source); }
  async listCaptures(_p: string, status?: string) { return this.today.listCaptures(status); }
  async resolveCapture(_p: string, id: string, caseId: string) { return this.today.resolveCapture(id, caseId); }
  async archiveCapture(_p: string, id: string) { return this.today.archiveCapture(id); }
  async batchToday(_p: string, req: BatchRequest) { return this.today.batch(req); }
  async undoBatch(_p: string, token: string) { return this.today.undo(token); }
  async getNotifications(_p?: string) { return this.today.notifications(); }
  async ackNotifications(_p: string, keys: string[]) { return this.today.ack(keys); }
  async setNotificationPrefs(_p: string, prefs: Partial<NotificationPrefs> & { clear_quiet?: boolean }) { return this.today.setPrefs(prefs); }
  async askSidekick(ctx: SidekickContext, text: string) { return scriptedReply(ctx, text); }
  async proposeSource(projectId: string, text: string) { return scriptedSourceProposal(projectId, text); }
  async confirmSources(_projectId: string, sources: SourceProposal["sources"]) {
    // A mock connect: reflect each proposed source back as a freshly-connected ContextSource.
    return sources.map((s, i): ContextSource => ({
      source_id: `new-${i}`, name: s.name || s.location || s.kind, kind: (s.kind as ContextSource["kind"]) || "files",
      provider: s.provider, location: s.location, access_mode: (s.access_mode as ContextSource["access_mode"]) || "read_only",
      indexing_policy: (s.indexing_policy as ContextSource["indexing_policy"]) || "automatic", refresh_policy: "on_change",
      exposure_class: "internal", health: { state: "healthy", detail: "Connected", last_observed_at: "just now" },
      stats: s.kind === "files" ? { discovered: 12, indexed: 12, skipped: 0 }
        : s.kind === "database" ? { schemas: (s.allowed_schemas || []).length || 2, tables: 42 }
        : s.kind === "cloud_files" ? { files: 128, indexed: 128 } : {}, allowed_paths: [],
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
  // External Agent Gateway entrances — resolve the goal, hand off via a navigate action (mirrors the
  // backend sidekick_reply; Sidekick contains no workflow).
  if ((t.includes("inspect") || t.includes("check") || t.includes("review") || t.includes("audit")) &&
      (t.includes("deployment") || t.includes("demo") || t.includes("infra"))) {
    return { text: "Starting 'Inspect current ReDevOps demo deployments' — Edge Sentinel examines the live deployment read-only; any remediation is governed and simulated, so the live SOC is never changed.", actions: [{ label: "Open inspection", kind: "navigate", ref: "inspection" }] };
  }
  if (t.includes("social intelligence") || t.includes("market signal") ||
      ((t.includes("find") || t.includes("discussions")) && (t.includes("social") || t.includes("struggling") || t.includes("reddit")))) {
    return { text: "Opening Social Intelligence — evidence-backed opportunities from permitted sources, with each provider's real availability (Reddit policy-scoped; Meta/Muse unverified).", actions: [{ label: "Open social intelligence", kind: "navigate", ref: "social" }] };
  }
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

function newSession(): string {
  try {
    const k = "redevops.today.session";
    const have = sessionStorage.getItem(k);
    if (have) return have;
    const id = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(k, id);
    return id;
  } catch { return Math.random().toString(36).slice(2, 12); }     // storage can be blocked; a per-load id still isolates
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
  getDeploymentInspection(id: string) { return this.get<DeploymentInspection>(`/api/projects/${id}/deployment-inspection`); }
  getSocialIntelligence(id: string) { return this.get<SocialMissionView>(`/api/projects/${id}/social-intelligence`); }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.base.replace(/\/$/, "") + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Projects API ${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  // Today calls carry a per-tab session id so an anonymous demo gets its own sandbox ledger server-side.
  private session = newSession();
  private async today<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.base.replace(/\/$/, "") + path, {
      method, headers: { Accept: "application/json", "X-Demo-Session": this.session, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      let code = "error", msg = `Projects API ${path} → ${r.status}`;
      try { const d = (await r.json())?.detail; if (d && typeof d === "object") { code = d.error ?? code; msg = d.detail ?? msg; } } catch { /* keep the generic message */ }
      throw new TodayApiError(r.status, code, msg);
    }
    return (await r.json()) as T;
  }
  getToday(id: string) { return this.today<TodayFeed>("GET", `/api/projects/${id}/today`); }
  getTodayItem(id: string, itemId: string, o: TodayItemOptions = {}) {
    const q = new URLSearchParams();
    if (o.targets?.length) q.set("targets", o.targets.join(","));
    if (o.identityId) q.set("identity_id", o.identityId);
    return this.today<TodayDetail>("GET", `/api/projects/${id}/today/${encodeURIComponent(itemId)}${q.size ? `?${q}` : ""}`);
  }
  approveToday(id: string, itemId: string, req: { payload_digest: string; targets?: string[]; identity_id?: string }) {
    return this.today<TodayDetail>("POST", `/api/projects/${id}/today/${encodeURIComponent(itemId)}/approve`, req);
  }
  snoozeToday(id: string, itemId: string, seconds: number) { return this.today<TodayDetail>("POST", `/api/projects/${id}/today/${encodeURIComponent(itemId)}/snooze`, { seconds }); }
  dismissToday(id: string, itemId: string) { return this.today<TodayDetail>("POST", `/api/projects/${id}/today/${encodeURIComponent(itemId)}/dismiss`, {}); }
  simulateTodayOutcome(id: string, itemId: string) { return this.today<TodayDetail>("POST", `/api/projects/${id}/today/${encodeURIComponent(itemId)}/simulate-outcome`, {}); }
  capture(id: string, content: string, source = "manual") { return this.today<CaptureItem>("POST", `/api/projects/${id}/capture`, { content, source }); }
  listCaptures(id: string, status?: string) { return this.today<CaptureItem[]>("GET", `/api/projects/${id}/capture${status ? `?status=${encodeURIComponent(status)}` : ""}`); }
  resolveCapture(id: string, captureId: string, caseId: string) { return this.today<CaptureItem>("POST", `/api/projects/${id}/capture/${encodeURIComponent(captureId)}/resolve`, { case_id: caseId }); }
  archiveCapture(id: string, captureId: string) { return this.today<CaptureItem>("POST", `/api/projects/${id}/capture/${encodeURIComponent(captureId)}/archive`, {}); }
  batchToday(id: string, req: BatchRequest) { return this.today<BatchResult>("POST", `/api/projects/${id}/today/batch`, req); }
  undoBatch(id: string, token: string) { return this.today<UndoResult>("POST", `/api/projects/${id}/today/batch/undo`, { token }); }
  getNotifications(id: string) { return this.today<TodayNotifications>("GET", `/api/projects/${id}/today/notifications`); }
  ackNotifications(id: string, keys: string[]) { return this.today<{ acknowledged: number }>("POST", `/api/projects/${id}/today/notifications/ack`, { keys }); }
  setNotificationPrefs(id: string, prefs: Partial<NotificationPrefs> & { clear_quiet?: boolean }) { return this.today<NotificationPrefs>("PUT", `/api/projects/${id}/today/notification-prefs`, prefs); }
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
