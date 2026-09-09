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

export interface ProjectOverview {
  project: ProjectRef;
  attention: AttentionItem[];
  missions: MissionSummary[];
  workflows: WorkflowSummary[];
  discovery: DiscoveryFinding[];
  apps: AppCapability[];
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
