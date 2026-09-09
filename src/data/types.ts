// UI-facing projection contracts — stable user-concept shapes, decoupled from Runtime
// storage. Each projection carries provenance (source_runtime + refs) so advanced views
// can drill down without the frontend knowing Runtime internals. Mirrors
// redevops_projects_multi_runtime_ui_navigation.md §"UI-facing projection contracts".

export type SourceRuntime =
  | "mission" | "governance" | "discovery" | "connector" | "context" | "security" | "project";

export interface Provenance {
  source_runtime: SourceRuntime;
  source_refs: string[];
  advanced_refs?: string[];
}

export type Health = "ok" | "warn" | "bad" | "run" | "mut";

export interface ProjectRef {
  id: string;
  name: string;
  health: Health;
}

export type MissionState = "running" | "needs" | "scheduled" | "completed" | "failed";

export interface MissionSummary extends Provenance {
  id: string;
  title: string;
  workflow: string;
  state: MissionState;
  progress: string; // "4/7", "84%", "Verified"
  context_used?: string[]; // evidence sources the Mission read (doc §11)
}

export type WorkflowState = "active" | "scheduled" | "paused";

export interface WorkflowSummary extends Provenance {
  id: string;
  name: string;
  steps: string[]; // logical steps
  cadence: string;
  state: WorkflowState;
  runsNote: string;
}

export type AttentionKind =
  | "approval" | "clarification" | "reconnect" | "failed_verification"
  | "discovery_review" | "policy_exception" | "unmatched_identity";

export interface AttentionItem extends Provenance {
  id: string;
  kind: AttentionKind;
  title: string;
  reason: string;
  consequence: string;
  available_actions: string[];
  priority: number;
  deadline?: string;
}

export interface DiscoveryFinding extends Provenance {
  id: string;
  title: string;
  detail: string;
  confidence: "High" | "Medium" | "Low" | "";
  needsReview: boolean;
  affects: { workflows: string[]; missions: string[]; scheduled: number };
}

export type SetupState =
  | "NOT_CONNECTED" | "AUTHORIZING" | "CONNECTED" | "VERIFIED_READ" | "VERIFIED_WRITE" | "MISSION_READY";

export interface CredentialField { name: string; label: string; secret: boolean; }

export interface AppCapability extends Provenance {
  provider: string;
  display_name: string;
  used_for: string;
  state: SetupState;
  health: Health;
  verified: string;
  capabilities: string[];
  // setup guide bits (from redevops_connectors ProviderSetupGuide)
  setup_url: string;
  manual_steps: string[];
  required_scopes: string[];
  credential_fields: CredentialField[];
}

export interface ActivityEvent extends Provenance {
  id: string;
  time: string;
  text: string;
}

// ── Sources — the evidence plane (doc §6). Sources define what evidence is available;
// Context Runtime decides how to retrieve/represent it. A context grant (what may be read)
// is separate from an app's capability grant (what actions it may take, doc §14).
export type SourceKind = "files" | "cloud_files" | "database" | "app_evidence" | "website";
export type AccessMode = "read_only" | "allow_generated";
export type IndexingPolicy = "automatic" | "on_demand";
export type SourceHealthState = "healthy" | "degraded" | "stale" | "error";

export interface SourceHealthInfo {
  state: SourceHealthState;
  detail: string;
  last_observed_at: string;
}

export interface ContextSource extends Provenance {
  source_id: string;
  name: string;
  kind: SourceKind;
  provider: string;
  location: string;
  access_mode: AccessMode;
  indexing_policy: IndexingPolicy;
  refresh_policy: string;
  exposure_class: string;
  health: SourceHealthInfo;
  stats: Record<string, number | string>; // {discovered,indexed,skipped} | {schemas,tables} | {files}
  allowed_paths: string[];
  allowed_schemas: string[];
  allowed_tables: string[];
  allowed_content_types: string[];
  denied: string[];
  last_verified: string;
  source_fingerprint: string;
}

// ── Runtime/stack health (doc §17) — the compact "YOUR STACK" card.
export interface RuntimeUnit { name: string; state: Health; detail: string; }
export interface RuntimeModel { name: string; role: "primary" | "fallback"; state: Health; }
export interface RuntimeHealth extends Provenance {
  runtimes: RuntimeUnit[];
  models: RuntimeModel[];
  security: { credential_broker: Health; policy: Health };
  apps: { name: string; state: Health }[];
  sources: { name: string; state: Health }[];
}

// ── Mission templates (doc §16) — preconfigured Missions with per-dependency readiness.
export interface MissionTemplate {
  id: string;
  goal: string;
  required_capabilities: string[];
  required_sources: string[];
  authority_requirements: string[];
  suggested_workflow: string;
  readiness: { label: string; ready: boolean }[];
}

// ── Add-source flow: confirm-first (LLM interprets · human confirms · runtime compiles).
export interface ProposedSourceSpec {
  kind: string;
  location: string;
  provider: string;
  access_mode: string;
  allowed_content_types: string[];
  allowed_schemas: string[];
  indexing_policy: string;
  name: string;
}
export interface SourceProposal {
  project_id: string;
  sources: ProposedSourceSpec[];
  assumptions: string[];
  questions: string[];
}

export interface ProjectOverview {
  project: ProjectRef;
  attention: AttentionItem[];
  missions: MissionSummary[];
  workflows: WorkflowSummary[];
  discovery: DiscoveryFinding[];
  apps: AppCapability[];
  sources: ContextSource[];
  runtime: RuntimeHealth;
}

// Sidekick context contract — every invocation carries where the user is.
export interface SidekickContext {
  projectId: string;
  section: string;
  objectRef?: string;
  tabRef?: string;
  selectionRef?: string;
}

export interface SidekickReply {
  text: string;
  actions?: { label: string; kind: string }[];
}
