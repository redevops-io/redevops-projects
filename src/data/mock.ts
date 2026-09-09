// Deterministic sample projections so the app runs standalone (no backend). Clearly
// example data; the HttpDataClient replaces it with real Runtime projections.
import type {
  ActivityEvent, AppCapability, AttentionItem, DiscoveryFinding, MissionSummary,
  ProjectOverview, ProjectRef, WorkflowSummary,
} from "./types";

export const PROJECT: ProjectRef = { id: "customer-ops", name: "Customer Operations", health: "ok" };

const P = (rt: any, ...refs: string[]) => ({ source_runtime: rt, source_refs: refs });

export const MISSIONS: MissionSummary[] = [
  { id: "4821", title: "Refund Sarah Chen", workflow: "Customer Refunds", state: "needs", progress: "4/7", ...P("mission", "mission:4821") },
  { id: "triage", title: "Daily support triage", workflow: "Support Triage", state: "running", progress: "84%", ...P("mission") },
  { id: "vti", title: "Review VTI exposure", workflow: "Portfolio Review", state: "completed", progress: "Verified", ...P("mission") },
  { id: "rel24", title: "Deploy release 2.4", workflow: "Release Workflow", state: "failed", progress: "Verify step", ...P("mission") },
  { id: "prospect", title: "Weekly prospecting", workflow: "Prospecting", state: "scheduled", progress: "—", ...P("mission") },
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

export const OVERVIEW: ProjectOverview = {
  project: PROJECT, attention: ATTENTION, missions: MISSIONS, workflows: WORKFLOWS, discovery: DISCOVERY, apps: APPS,
};
