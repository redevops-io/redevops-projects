// The dashboards' part of the data client, over a Transport. The Dashboards view uses nothing else of DataClient.
import type { DataClient } from "../data/client";
import type { DashAction, DashCatalog, DashDrill, DashFilters, DashLayout, DashView, Dashboard } from "../data/dashboards";
import { TodayApiError } from "../data/mockToday";
import type { Transport } from "./transport";

export interface PortableInfo {
  mode: "standalone"; offered: string[]; durable: boolean; projects: { id: string; name: string }[];
  available: { id: string; title: string; offered: boolean; note: string }[];
  unavailable: { id: string; title: string; needs: string[]; why: string }[];
}
export interface JunitUpload { project: string; project_name?: string; suite: string; platform: string; platforms?: string[]; release?: string; xml: string }

export class PortableClient {
  constructor(public transport: Transport) {}
  getDashboardCatalog() { return this.transport.call<DashCatalog>("GET", "/api/dashboards"); }
  getDashboard(id: string, f: DashFilters = {}, fresh = false) {
    return this.transport.call<Dashboard>("GET", `/api/dashboards/${encodeURIComponent(id)}`, { ...(f as Record<string, any>), ...(fresh ? { fresh: "true" } : {}) });
  }
  getDashboardDrill(id: string, key: string, f: DashFilters = {}) {
    return this.transport.call<DashDrill>("GET", `/api/dashboards/${encodeURIComponent(id)}/drill`, { ...(f as Record<string, any>), key });
  }
  async listDashboardViews(dashboard?: string) { return (await this.transport.call<{ views: DashView[] }>("GET", "/api/dashboards/views", { dashboard })).views; }
  saveDashboardView(v: { id?: string; name: string; dashboard: string; filters: DashFilters; layout: DashLayout; is_default?: boolean }) {
    return this.transport.call<DashView>("PUT", "/api/dashboards/views", undefined, v);
  }
  async deleteDashboardView(id: string) { await this.transport.call<unknown>("DELETE", `/api/dashboards/views/${encodeURIComponent(id)}`); }
  trackDashboardFinding(id: string, key: string, filters: DashFilters = {}, note = "") {
    return this.transport.call<{ tracked: boolean }>("POST", `/api/dashboards/${encodeURIComponent(id)}/track`, undefined, { key, note, filters });
  }
  // Actions on a connected product go through the full Projects UI, where the person is signed in and the change is governed.
  runDashboardAction(_a: DashAction): Promise<unknown> {
    return Promise.reject(new TodayApiError(501, "unsupported", "Actions are run from the Projects UI of the deployment, not from this page."));
  }
  // standalone only
  about() { return this.transport.call<PortableInfo>("GET", "/api/dashboards/_portable"); }
  addJunit(u: JunitUpload) { return this.transport.call<{ run_id: string; results: number; duplicate: boolean }>("POST", "/api/dashboards/qa/junit", undefined, u); }
  asDataClient(): DataClient { return this as unknown as DataClient; }
}
