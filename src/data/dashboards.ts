// Dashboard projections — mirrors agentic_os/dashboards/contracts.py (schema aos.dashboard/v1). The UI renders these
// VERBATIM: it never derives a total, a rate, a status or a freshness of its own. `value: null` means "not known"
// (a source is down, or the viewer may not see part of the data) and is never drawn as zero.
import type { Health } from "./types";

export type SourceState = "ok" | "stale" | "unavailable" | "not_connected" | "unauthorized" | "gated";
export interface DashSource { id: string; label: string; app: string; state: SourceState; detail: string; observed_at: number; records: number; basis: string; remedy: string }
export interface DashFilters { project?: string; days?: number; since?: number; until?: number; product?: string; environment?: string; platform?: string }
export interface DashMetric {
  id: string; label: string; value: number | null; unit: string; tone: Health; note: string;
  numerator: number | null; denominator: number | null; sources: string[]; drill: string;
  trend: [string, number | null][]; delta: number | null; good: "up" | "down" | ""; unknown: string;
}
export interface DashSeries { id: string; label: string; tone: Health; values: (number | null)[]; drills?: string[] }
export interface DashItem { label: string; value: number | null; tone: Health; drill?: string; note?: string }
export interface DashColumn { id: string; label: string; align?: "left" | "right" }
export interface DashRow { cells: Record<string, string | number | null>; tone?: Health | ""; drill?: string; ref?: string; url?: string }
export interface MatrixCell { status: string; label: string; drill: string }
export interface MatrixRow { label: string; cells: MatrixCell[] }
export type PanelKind = "stats" | "timeseries" | "bars" | "stacked" | "matrix" | "table" | "funnel";
export interface DashPanel {
  id: string; title: string; kind: PanelKind; sources: string[]; note: string; empty: string;
  metrics: DashMetric[]; x: string[]; series: DashSeries[]; items: DashItem[]; columns: DashColumn[];
  rows: (DashRow | MatrixRow)[]; unit: string; span: number;
}
export interface DashProject { id: string; name: string; product?: string; environment?: string }
export interface Dashboard {
  schema: string; id: string; title: string; priority: string; summary: string; scope: "portfolio" | "project";
  filters: Required<DashFilters>; generated_at: number; sources: DashSource[]; panels: DashPanel[];
  facets: Record<string, string[]>; projects: DashProject[]; withheld: { partial?: boolean; detail?: string };
  empty: string; advanced: { label: string; url: string; app: string }[];
}
export interface CatalogEntry { id: string; title: string; priority: string; group: string; about: string; sources: { id: string; label: string; state: SourceState }[] }
export interface DashCatalog {
  dashboards: CatalogEntry[]; not_connected: { id: string; title: string; priority: string; connect: string[] }[];
  projects: DashProject[]; access: { principal: string; scoped: boolean; basis: string; can_save?: boolean };
  history: { durable: boolean }; config_errors: number; generated_at: number;
}
export interface DashRecord { source: string; kind: string; id: string; title: string; status: string; project: string; at: number; fields: Record<string, unknown>; ref: string; url: string }
export interface DashAction {
  kind: "sidekick" | "track" | "navigate" | "product"; label: string; ref?: string; prompt?: string; send?: boolean; detail?: string;
  section?: string; method?: string; path?: string; body?: Record<string, unknown>; confirm?: string; human_only?: boolean;
}
export interface DashDrill { dashboard: string; key: string; title: string; note: string; total: number; truncated: boolean; columns: string[]; records: DashRecord[]; sources: DashSource[]; actions: DashAction[]; generated_at: number }
export interface DashLayout { hidden?: string[]; order?: string[] }
export interface DashView { id: string; name: string; dashboard: string; filters: DashFilters; layout: DashLayout; is_default: boolean; created_at: number; updated_at: number }
