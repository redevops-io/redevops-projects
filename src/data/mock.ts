// Deterministic sample projections so the app runs standalone (no backend). Clearly
// example data; the HttpDataClient replaces it with real Runtime projections.
import type {
  ActivityEvent, AppCapability, AttentionItem, ContextSource, DiscoveryFinding, MissionDetail,
  MissionSummary, MissionTemplate, ProjectOverview, ProjectRef, RuntimeHealth, WorkflowSummary,
} from "./types";

export const PROJECT: ProjectRef = { id: "customer-ops", name: "Customer Operations", health: "ok" };

const P = (rt: any, ...refs: string[]) => ({ source_runtime: rt, source_refs: refs });

export const MISSIONS: MissionSummary[] = [
  { id: "4821", title: "Refund Sarah Chen", workflow: "Customer Refunds", state: "needs", progress: "4/7",
    context_used: ["HubSpot customer record", "Support Postgres", "WhatsApp conversation", "Refund policy PDF"], ...P("mission", "mission:4821") },
  { id: "triage", title: "Daily support triage", workflow: "Support Triage", state: "running", progress: "84%", ...P("mission") },
  { id: "vti", title: "Review VTI exposure", workflow: "Portfolio Review", state: "completed", progress: "Verified", ...P("mission") },
  { id: "rel24", title: "Deploy release 2.4", workflow: "Release Workflow", state: "failed", progress: "Verify step", ...P("mission") },
  { id: "prospect", title: "Weekly prospecting", workflow: "Prospecting", state: "scheduled", progress: "—", ...P("mission") },
  { id: "outreach", title: "Outreach — Tasha at Nutrients.tech", workflow: "Cold Outreach", state: "needs", progress: "5/8",
    context_used: ["Generated copy", "Generated hero asset"], ...P("mission", "mission:outreach") },
];

export const WORKFLOWS: WorkflowSummary[] = [
  { id: "refund", name: "Customer Refund Handling",
    steps: ["Find customer", "Find charge", "Request approval", "Refund", "Verify", "Reply"],
    cadence: "Event-driven", state: "active", runsNote: "12 runs · 11 completed · 1 needs attention", ...P("mission", "workflow:refund") },
  { id: "triage", name: "Daily Support Triage",
    steps: ["Ingest", "Classify", "CRM", "Route", "Escalate"], cadence: "Weekdays 08:00", state: "scheduled", runsNote: "runs daily", ...P("mission") },
  { id: "prospect", name: "Weekly Prospecting",
    steps: ["Discover", "Enrich", "Sequence", "Approve", "Activate"], cadence: "Weekly", state: "paused", runsNote: "approval before activation", ...P("mission") },
];

export const ATTENTION: AttentionItem[] = [
  { id: "a1", kind: "approval", title: "Approve refund · $129", reason: "Sarah Chen · duplicate charge",
    consequence: "Executes a Stripe refund (tier 4)", available_actions: ["Review", "Approve", "Reject"], priority: 90, ...P("governance", "mission:4821") },
  { id: "a2", kind: "reconnect", title: "Reconnect WhatsApp", reason: "Token expires soon",
    consequence: "Customer channel stops receiving", available_actions: ["Connect"], priority: 70, ...P("connector", "app:whatsapp_business") },
  { id: "a3", kind: "discovery_review", title: "Refund policy changed", reason: "Stripe documentation",
    consequence: "May affect the Customer Refund workflow", available_actions: ["Review"], priority: 60, ...P("discovery", "finding:918") },
];

export const DISCOVERY: DiscoveryFinding[] = [
  { id: "918", title: "Stripe refund API behavior changed", detail: "Source: Stripe documentation", confidence: "High", needsReview: true,
    affects: { workflows: ["Customer Refund Handling"], missions: ["4821"], scheduled: 4 }, ...P("discovery", "finding:918") },
  { id: "919", title: "HubSpot property schema changed", detail: "Affects CRM reconciliation", confidence: "Medium", needsReview: false,
    affects: { workflows: ["CRM reconciliation"], missions: [], scheduled: 0 }, ...P("discovery") },
  { id: "920", title: "Contradictory evidence detected", detail: "Mission: Portfolio Review #221", confidence: "", needsReview: false,
    affects: { workflows: [], missions: ["221"], scheduled: 0 }, ...P("discovery") },
];

const app = (o: Partial<AppCapability> & Pick<AppCapability, "provider" | "display_name" | "used_for" | "state" | "health">): AppCapability => ({
  verified: "", capabilities: [], setup_url: "", manual_steps: [], required_scopes: [], credential_fields: [],
  source_runtime: "connector", source_refs: [`app:${o.provider}`], ...o,
});

export const APPS: AppCapability[] = [
  app({ provider: "whatsapp_business", display_name: "WhatsApp Business", used_for: "Receive customer messages and reply.", state: "MISSION_READY", health: "warn", verified: "Verified 2 days ago", capabilities: ["chat.message.send"], setup_url: "https://developers.facebook.com/", manual_steps: ["WhatsApp → API Setup", "Copy access token + Phone number ID"], required_scopes: ["whatsapp_business_messaging"], credential_fields: [{ name: "access_token", label: "Access token", secret: true }, { name: "phone_number_id", label: "Phone number ID", secret: false }] }),
  app({ provider: "hubspot", display_name: "HubSpot", used_for: "Find the customer and record the conversation.", state: "MISSION_READY", health: "ok", verified: "Verified 11 min ago", capabilities: ["crm.contact.upsert", "crm.note.create"], setup_url: "https://app.hubspot.com/", manual_steps: ["Settings → Private Apps → Create", "Copy the pat- token"], required_scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"], credential_fields: [{ name: "access_token", label: "Private-app token", secret: true }] }),
  app({ provider: "slack", display_name: "Slack", used_for: "Notifications, approvals, replies in threads.", state: "MISSION_READY", health: "ok", verified: "Verified 3 min ago", capabilities: ["chat.message.send", "approval.request", "chat.message.read"], setup_url: "https://api.slack.com/apps", manual_steps: ["OAuth & Permissions → add scopes", "Install → copy xoxb- → invite the bot"], required_scopes: ["chat:write", "channels:history", "users:read"], credential_fields: [{ name: "access_token", label: "Bot User OAuth Token", secret: true }] }),
  app({ provider: "stripe", display_name: "Stripe", used_for: "Find charges and execute approved refunds.", state: "MISSION_READY", health: "ok", verified: "Verified 5 min ago", capabilities: ["billing.charge.find", "billing.refund.execute"], setup_url: "https://dashboard.stripe.com/apikeys", manual_steps: ["Turn on Test mode", "Developers → API keys → copy sk_test_"], required_scopes: [], credential_fields: [{ name: "api_key", label: "Secret key (test mode)", secret: true }] }),
  app({ provider: "gmail", display_name: "Gmail", used_for: "Send email confirmations (optional).", state: "NOT_CONNECTED", health: "mut", capabilities: ["email.message.send"], setup_url: "https://developers.google.com/oauthplayground", manual_steps: ["OAuth Playground → gmail.send + gmail.readonly", "Copy the access token (~1h)"], required_scopes: ["gmail.send", "gmail.readonly"], credential_fields: [{ name: "access_token", label: "Google OAuth access token", secret: true }] }),
  app({ provider: "ayrshare", display_name: "Ayrshare", used_for: "Publish content to many venues in one call.", state: "NOT_CONNECTED", health: "mut", capabilities: ["content.publish"], setup_url: "https://www.ayrshare.com/", manual_steps: ["Link your social accounts", "Copy the API key"], required_scopes: [], credential_fields: [{ name: "api_key", label: "API key", secret: true }] }),
];

export const ACTIVITY: ActivityEvent[] = [
  { id: "e1", time: "18:42", text: "Mission #4821 requested approval in Slack", ...P("governance") },
  { id: "e2", time: "18:40", text: "Stripe charge ch_3Q… matched · $129", ...P("connector") },
  { id: "e3", time: "18:39", text: "Discovery linked customer evidence · Sarah Chen", ...P("discovery") },
  { id: "e4", time: "18:38", text: "WhatsApp request received · \"I was charged twice\"", ...P("mission") },
  { id: "e5", time: "18:30", text: "Slack connection verified", ...P("connector") },
  { id: "e6", time: "18:24", text: "Workflow policy updated · Customer Refund Handling", ...P("project") },
];

const src = (o: Partial<ContextSource> & Pick<ContextSource, "source_id" | "name" | "kind" | "location" | "health">): ContextSource => ({
  provider: "", access_mode: "read_only", indexing_policy: "automatic", refresh_policy: "on_change",
  exposure_class: "internal", stats: {}, allowed_paths: [], allowed_schemas: [], allowed_tables: [],
  allowed_content_types: [], denied: [], last_verified: "", source_fingerprint: "",
  source_runtime: "context", source_refs: [`source:${o.source_id}`], ...o,
});

export const SOURCES: ContextSource[] = [
  src({ source_id: "pdfs", name: "Customer policy docs", kind: "files", location: "~/company-docs",
    health: { state: "healthy", detail: "391 indexed", last_observed_at: "2 min ago" },
    stats: { discovered: 428, indexed: 391, skipped: 37 }, allowed_content_types: ["pdf", "docx", "markdown"],
    last_verified: "2 min ago", source_fingerprint: "a1b2c3" }),
  src({ source_id: "crm", name: "CRM database", kind: "database", provider: "postgres",
    location: "postgres · localhost/customer_ops", health: { state: "healthy", detail: "Live connection", last_observed_at: "live" },
    stats: { schemas: 2, tables: 42 }, allowed_schemas: ["public", "support"], denied: ["billing.card_data", "hr.*"] }),
  src({ source_id: "gdrive", name: "Google Drive", kind: "cloud_files", provider: "google_drive", location: "Drive · Policies",
    health: { state: "healthy", detail: "Synced 4 min ago", last_observed_at: "4 min ago" }, stats: { files: 1842, indexed: 1842 } }),
  src({ source_id: "s3", name: "Support archive", kind: "cloud_files", provider: "s3", location: "s3://support-archive",
    health: { state: "stale", detail: "Credentials expired · last sync 2 days ago", last_observed_at: "2 days ago" }, stats: { files: 12045 } }),
];

export const RUNTIME: RuntimeHealth = {
  runtimes: [
    { name: "Mission Runtime", state: "ok", detail: "Healthy" },
    { name: "Context Runtime", state: "ok", detail: "Healthy" },
    { name: "Discovery Runtime", state: "ok", detail: "Healthy" },
  ],
  models: [
    { name: "Local model", role: "primary", state: "ok" },
    { name: "Cloud fallback", role: "fallback", state: "mut" },
  ],
  security: { credential_broker: "ok", policy: "ok" },
  apps: [{ name: "WhatsApp", state: "warn" }, { name: "HubSpot", state: "ok" }, { name: "Slack", state: "ok" }, { name: "Polar", state: "ok" }],
  sources: [{ name: "Customer PDFs", state: "ok" }, { name: "CRM Postgres", state: "ok" }, { name: "Google Drive", state: "ok" }, { name: "S3 archive", state: "warn" }],
  ...P("project", "runtime:health"),
};

export const TEMPLATES: MissionTemplate[] = [
  { id: "refunds", goal: "Handle customer refunds",
    required_capabilities: ["chat.message.send", "crm.contact.upsert", "approval.request", "billing.refund.execute"],
    required_sources: ["Customer policy docs", "CRM database"], authority_requirements: ["Approval required before refund"],
    suggested_workflow: "Customer Refund Handling",
    readiness: [{ label: "WhatsApp", ready: true }, { label: "HubSpot", ready: true }, { label: "Slack", ready: true }, { label: "Polar", ready: true }, { label: "Customer policy docs", ready: true }, { label: "CRM database", ready: true }] },
  { id: "prospect", goal: "Run weekly prospecting", required_capabilities: ["crm.contact.upsert", "email.message.send"],
    required_sources: ["CRM database"], authority_requirements: [], suggested_workflow: "Weekly Prospecting",
    readiness: [{ label: "Apollo", ready: true }, { label: "Gmail", ready: false }, { label: "HubSpot", ready: true }] },
  { id: "triage", goal: "Review support queue", required_capabilities: ["chat.message.read", "crm.contact.upsert"],
    required_sources: ["Support Postgres"], authority_requirements: [], suggested_workflow: "Daily Support Triage",
    readiness: [{ label: "Slack", ready: true }, { label: "HubSpot", ready: true }, { label: "Support Postgres", ready: true }] },
  { id: "reconcile", goal: "Reconcile CRM", required_capabilities: ["crm.contact.upsert", "crm.note.create"],
    required_sources: ["CRM database"], authority_requirements: [], suggested_workflow: "CRM Reconciliation",
    readiness: [{ label: "HubSpot", ready: true }, { label: "CRM database", ready: true }] },
  { id: "outreach", goal: "Run cold outreach for the agentic-apps stack",
    required_capabilities: ["generate.copy", "generate.asset", "outreach.sequence.configure", "outreach.enroll"],
    required_sources: [], authority_requirements: ["Sequence activation is provider-UI-only (a human toggles it on)"],
    suggested_workflow: "Cold Outreach", readiness: [{ label: "Apollo", ready: true }] },
];

export const OVERVIEW: ProjectOverview = {
  project: PROJECT, attention: ATTENTION, missions: MISSIONS, workflows: WORKFLOWS, discovery: DISCOVERY,
  apps: APPS, sources: SOURCES, runtime: RUNTIME,
};

// Mission detail — the Used+Why model (mirrors agentic_os projects_api._mission_evidence).
export function missionDetail(missionId: string): MissionDetail {
  const summary = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  if (missionId === "outreach") return outreachDetail(summary);
  if (missionId !== "4821") return { summary, steps: [], context_used: [], context_plan_note: "" };
  return {
    summary,
    steps: [
      { n: 1, capability: "chat.message.read", provider: "whatsapp_business", tier: 2, status: "done", why: "inbound channel the request arrived on" },
      { n: 2, capability: "crm.contact.upsert", provider: "hubspot", tier: 2, status: "done", why: "named CRM; only connected contact store" },
      { n: 3, capability: "billing.order.find", provider: "polar", tier: 1, status: "done", why: "billing provider of record for this account" },
      { n: 4, capability: "approval.request", provider: "slack", tier: 3, status: "waiting", why: "policy requires human approval before a refund" },
      { n: 5, capability: "billing.refund.execute", provider: "polar", tier: 4, status: "todo", why: "moves money — runs only after approval, then verified" },
    ],
    context_used: [
      { source_id: "crm", source_name: "CRM database", provider: "postgres", kind: "database", evidence_kind: "query",
        retrieved: { count: 3, observed_at: "2026-09-09T11:31:00Z" }, identity: null,
        refs: [{ ref: "postgres:customers#0", summary: "id=8821 · email=sarah@…" }, { ref: "postgres:support.tickets#0", summary: "subject=Billed twice · status=open" }],
        why: "scoped SQL against the live source — queried in place rather than ingesting the DB" },
      { source_id: "pdfs", source_name: "Refund Policies", provider: "google_drive", kind: "cloud_files", evidence_kind: "file",
        retrieved: null, identity: { fingerprint: "a1b2c3", version: "v19" },
        refs: [{ ref: "gdrive:f1", summary: "Refund Policy.pdf" }],
        why: "vector retrieval over indexed policy PDFs — the right representation for prose" },
    ],
    context_plan_note: "Sources define what evidence is available; Context Runtime chose SQL-in-place for the structured customer data and vector retrieval for the policy prose.",
  };
}

// Human dependency label → provider id, so the UI can act on a readiness label.
export const APP_ID: Record<string, string> = {
  WhatsApp: "whatsapp_business", HubSpot: "hubspot", Slack: "slack", Polar: "polar",
  Stripe: "stripe", Gmail: "gmail", Apollo: "apollo",
};

// The outreach Mission detail — mirrors agentic_os projects_api._outreach_evidence.
function outreachDetail(summary: MissionSummary): MissionDetail {
  return {
    summary,
    steps: [
      { n: 1, capability: "prepare.outreach", provider: "runtime", tier: 0, status: "done", why: "target Tasha · Nutrients.tech · cold outreach" },
      { n: 2, capability: "generate.copy", provider: "claude", tier: 0, status: "done", why: "grounded in a nutrition-tech ops example; subject prefixed [test]" },
      { n: 3, capability: "generate.asset", provider: "fal.ai", tier: 0, status: "done", why: "optional creative asset — multimodal composition" },
      { n: 4, capability: "outreach.sequence.configure", provider: "apollo", tier: 3, status: "done", why: "built the sequence step + email template (wait_mode day; template endpoint)" },
      { n: 5, capability: "outreach.enroll", provider: "apollo", tier: 3, status: "done", why: "enrolled tasha@nutrients.tech from the warmed mailbox" },
      { n: 6, capability: "outreach.sequence.activate", provider: "apollo", tier: 4, status: "waiting", why: "PROVIDER_UI_REQUIRED — Apollo activation is UI-only (capability advertises automatable=false); a human flips the sequence on" },
      { n: 7, capability: "outreach.observe", provider: "apollo", tier: 1, status: "todo", why: "after activation, observe the send through the mailbox" },
      { n: 8, capability: "verify.delivery", provider: "apollo", tier: 1, status: "todo", why: "confirm delivery and produce an ExecutionReceipt" },
    ],
    context_used: [
      { source_id: "copy", source_name: "Generated copy", provider: "claude", kind: "artifact", evidence_kind: "file",
        retrieved: null, identity: { version: "v1" }, refs: [{ ref: "artifact:copy", summary: "[test] One governed system for Nutrients.tech's apps + data" }],
        why: "synthesized from the goal + target context" },
      { source_id: "asset", source_name: "Generated hero asset", provider: "fal.ai", kind: "artifact", evidence_kind: "file",
        retrieved: null, identity: { version: "v1" }, refs: [{ ref: "artifact:hero", summary: "conceptual hero — apps + DB + doc → one governed system" }],
        preview: "/hero.jpg", why: "optional creative asset (copy is required; asset is not)" },
    ],
    context_plan_note: "Logical outreach workflow is provider-independent; activation is a physical capability result — Apollo is provider-UI-only, so the Mission pauses for a human.",
  };
}
