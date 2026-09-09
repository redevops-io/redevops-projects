// The Projects API client — the ONE seam between the UI and the Runtime. A MockDataClient
// serves the sample projections so the app runs standalone; the HttpDataClient talks to
// the agentic-os Projects API (thin read/action surface over go_live, ProviderSetupGuide/
// verify_setup, and Mission/Attention/Discovery projections). Views depend only on this
// interface, so the Runtime can evolve without a frontend rewrite.
import type {
  ActivityEvent, AppCapability, AttentionItem, DiscoveryFinding, MissionSummary,
  ProjectOverview, ProjectRef, SidekickContext, SidekickReply, WorkflowSummary,
} from "./types";
import * as mock from "./mock";

export interface DataClient {
  listProjects(): Promise<ProjectRef[]>;
  getOverview(projectId: string): Promise<ProjectOverview>;
  getMissions(projectId: string): Promise<MissionSummary[]>;
  getWorkflows(projectId: string): Promise<WorkflowSummary[]>;
  getAttention(projectId: string): Promise<AttentionItem[]>;
  getDiscovery(projectId: string): Promise<DiscoveryFinding[]>;
  getApps(projectId: string): Promise<AppCapability[]>;
  getActivity(projectId: string): Promise<ActivityEvent[]>;
  askSidekick(ctx: SidekickContext, text: string): Promise<SidekickReply>;
}

export class MockDataClient implements DataClient {
  async listProjects() { return [mock.PROJECT]; }
  async getOverview() { return mock.OVERVIEW; }
  async getMissions() { return mock.MISSIONS; }
  async getWorkflows() { return mock.WORKFLOWS; }
  async getAttention() { return mock.ATTENTION; }
  async getDiscovery() { return mock.DISCOVERY; }
  async getApps() { return mock.APPS; }
  async getActivity() { return mock.ACTIVITY; }
  async askSidekick(ctx: SidekickContext, text: string) { return scriptedReply(ctx, text); }
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
  getWorkflows(id: string) { return this.get<WorkflowSummary[]>(`/api/projects/${id}/workflows`); }
  getAttention(id: string) { return this.get<AttentionItem[]>(`/api/projects/${id}/attention`); }
  getDiscovery(id: string) { return this.get<DiscoveryFinding[]>(`/api/projects/${id}/discovery`); }
  getApps(id: string) { return this.get<AppCapability[]>(`/api/projects/${id}/apps`); }
  getActivity(id: string) { return this.get<ActivityEvent[]>(`/api/projects/${id}/activity`); }
  async askSidekick(ctx: SidekickContext, text: string): Promise<SidekickReply> {
    const r = await fetch(this.base.replace(/\/$/, "") + "/api/sidekick", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ctx, text }),
    });
    if (!r.ok) throw new Error(`Projects API /sidekick → ${r.status}`);
    return (await r.json()) as SidekickReply;
  }
}

// Pick the client from the environment: a Projects API base URL → live; otherwise mock.
export function makeClient(): DataClient {
  const base = (import.meta as any).env?.VITE_PROJECTS_API as string | undefined;
  return base ? new HttpDataClient(base) : new MockDataClient();
}
