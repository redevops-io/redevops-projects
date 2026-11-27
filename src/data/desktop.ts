// The installed app's own routes: approvals, connected agents and installed applications. They exist only behind the
// desktop's local gate and need the session of the person who opened the app (the gate's shim adds it to same-origin
// /api/ requests). Anywhere else `/api/desktop` does not answer, and these screens are not offered.
export interface DesktopFeatures { approvals: boolean; agents: boolean; applications: boolean }

export interface Pair { label: string; value: string }
export interface ApprovalCard {
  source: string; id: string; ref: string; title: string; application: string; state: string; state_words: string;
  requested_by: string; requester_label: string; waiting: boolean; running?: boolean; blocked: string;
  decisions: string[]; digest: string; attestation: string; technical: string; created_at: number | null; expires_at: number | null;
  changes: Pair[]; outcome: Pair[]; tables: { title: string; columns: string[]; rows: string[][] }[];
  affected: { label: string; url?: string }[]; native_note: string;
}
export interface ApprovalListing { waiting: ApprovalCard[]; recent: ApprovalCard[]; problems: string[] }

export interface Grantable { grant: string; meaning: string; changes: boolean }
export interface LocalAgent { id: string; name: string; grants: string[]; created_at: number; last_used_at: number | null; revoked_at: number | null; client: string; active: boolean }
export interface AgentListing { agents: LocalAgent[]; grantable: Grantable[]; clients: string[]; default_days: number; max_days: number }
export interface Connected { agent: LocalAgent; token_file: string; expires_in_days: number; mcp_server: unknown }

export interface AppField { name: string; type: "text" | "long_text" | "number" | "boolean" | "date" | "choice"; required?: boolean; choices?: string[] }
export interface AppBlock { type: "text" | "records" | "form" | "approvals"; text?: string; collection?: string; columns?: string[]; submit?: string }
export interface AppDefinition {
  id: string; name: string; version: number; summary: string;
  state: { collections: { name: string; max_records: number; fields: AppField[] }[] };
  views: { id: string; title: string; blocks: AppBlock[] }[];
}
export interface AppRecord { id: string; values: Record<string, unknown>; revision: number; updated_by: string }
export interface InstalledApp { app_id: string; name: string; version: number; summary: string; installed_by: string }
export interface OpenApp { app_id: string; version: number; installed_by: string; definition: AppDefinition; records: Record<string, AppRecord[]>; changed_capabilities: { capability: string; change: string }[] }
export interface ImportReview { name: string; digest: string; rows: Pair[]; technical: string }

export class DesktopError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface DesktopApi {
  features(): Promise<DesktopFeatures | null>;
  approvals(): Promise<ApprovalListing>;
  approval(source: string, id: string): Promise<ApprovalCard>;
  decide(source: string, id: string, decision: string, digest: string, attested: boolean): Promise<ApprovalCard>;
  agents(): Promise<AgentListing>;
  connect(name: string, grants: string[], days: number, client: string): Promise<Connected>;
  revoke(id: string): Promise<void>;
  applications(): Promise<InstalledApp[]>;
  application(id: string): Promise<OpenApp>;
  addRecord(id: string, collection: string, values: Record<string, unknown>): Promise<AppRecord>;
  exportApp(id: string): Promise<{ name: string; text: string }>;
  reviewImport(bundle: unknown): Promise<ImportReview>;
  importApp(bundle: unknown, digest: string): Promise<{ app_id: string }>;
}

const enc = encodeURIComponent;

export function makeDesktopApi(base: string, doFetch: typeof fetch = (...a) => fetch(...a)): DesktopApi {
  const root = base.replace(/\/$/, "");
  async function raw(path: string, body?: unknown): Promise<Response> {
    let r: Response;
    try {
      r = await doFetch(`${root}${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch { throw new DesktopError(0, "Can't reach the app."); }
    if (!r.ok) {
      let said = `The app answered ${r.status}.`;
      try { const d = (await r.json())?.detail ?? {}; said = (typeof d === "string" ? d : d.detail) || said; } catch { /* keep it */ }
      throw new DesktopError(r.status, said);
    }
    return r;
  }
  const get = async <T,>(path: string, body?: unknown): Promise<T> => (await raw(path, body)).json() as Promise<T>;
  return {
    async features() {
      try {
        const f = await get<DesktopFeatures>("/api/desktop");
        return typeof f?.approvals === "boolean" ? f : null;
      } catch { return null; }
    },
    approvals: () => get<ApprovalListing>("/api/approvals"),
    approval: (source, id) => get<ApprovalCard>(`/api/approvals/${enc(source)}/${enc(id)}`),
    decide: (source, id, decision, digest, attested) => get<ApprovalCard>(`/api/approvals/${enc(source)}/${enc(id)}/decision`, { decision, digest, attested }),
    agents: () => get<AgentListing>("/api/local-agents"),
    connect: (name, grants, days, client) => get<Connected>("/api/local-agents", { name, grants, days, client }),
    async revoke(id) { await get(`/api/local-agents/${enc(id)}/revoke`, {}); },
    applications: async () => (await get<{ applications: InstalledApp[] }>("/api/applications")).applications,
    application: (id) => get<OpenApp>(`/api/applications/${enc(id)}`),
    addRecord: (id, collection, values) => get<AppRecord>(`/api/applications/${enc(id)}/collections/${enc(collection)}/records`, { values }),
    async exportApp(id) {
      const r = await raw(`/api/applications/${enc(id)}/export`);
      const named = /filename="([A-Za-z0-9_.-]+)"/.exec(r.headers.get("content-disposition") ?? "");
      return { name: named?.[1] ?? `${id}.app-bundle.json`, text: await r.text() };
    },
    reviewImport: (bundle) => get<ImportReview>("/api/applications-import/review", { bundle }),
    importApp: (bundle, digest) => get<{ app_id: string }>("/api/applications-import", { bundle, digest }),
  };
}

export function defaultDesktopApi(): DesktopApi | null {
  const base = (import.meta as any).env?.VITE_PROJECTS_API as string | undefined;
  return base ? makeDesktopApi(base) : null;           // the sample build has no app behind it
}
