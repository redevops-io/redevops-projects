import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { MockDataClient } from "./data/client";
import { makeDesktopApi, type ApprovalCard, type DesktopApi } from "./data/desktop";

const card = (over: Partial<ApprovalCard> = {}): ApprovalCard => ({
  source: "writes", id: "mission_a1", ref: "writes/mission_a1", title: "Install the application Field notes", application: "Applications",
  state: "pending", state_words: "Waiting for a decision", requested_by: "agent-1", requester_label: "Notes agent", waiting: true, blocked: "",
  decisions: ["approve", "reject"], digest: "d".repeat(64), attestation: "", technical: '{"schema": "aos.app-definition/v1"}',
  created_at: 1, expires_at: 2, changes: [{ label: "What approving does", value: "Installs this definition" }], outcome: [], tables: [], affected: [],
  native_note: "", ...over,
});

function fake(over: Partial<DesktopApi> = {}): DesktopApi {
  return {
    features: async () => ({ approvals: true, agents: true, applications: true }),
    approvals: async () => ({ waiting: [card()], recent: [], problems: [] }),
    approval: async () => card(),
    decide: vi.fn(async () => card({ waiting: false, state: "executed_verified", state_words: "Done and verified", decisions: [], outcome: [{ label: "Decided by", value: "local-owner" }] })),
    agents: async () => ({ agents: [], clients: ["generic"], default_days: 30, max_days: 90, grantable: [
      { grant: "projects.read", meaning: "Read projects", changes: false }, { grant: "apps.install", meaning: "Propose installing an application", changes: true }] }),
    connect: vi.fn(async () => ({ agent: { id: "agent-9", name: "N", grants: ["apps.install"], created_at: 1, last_used_at: null, revoked_at: null, client: "generic", active: true },
      token_file: "/home/u/agents/tokens/agent-9.token", expires_in_days: 30, mcp_server: { command: "node", args: ["bridge.js"] } })),
    revoke: vi.fn(async () => {}),
    applications: async () => [{ app_id: "field-notes", name: "Field notes", version: 1, summary: "Notes", installed_by: "local-owner" }],
    application: async () => ({ app_id: "field-notes", version: 1, installed_by: "local-owner", changed_capabilities: [], records: { notes: [] },
      definition: { id: "field-notes", name: "Field notes", version: 1, summary: "Notes", state: { collections: [{ name: "notes", max_records: 5, fields: [
        { name: "text", type: "text", required: true }, { name: "done", type: "boolean" }] }] },
        views: [{ id: "main", title: "Notes", blocks: [{ type: "records", collection: "notes", columns: ["text", "done"] }, { type: "form", collection: "notes", submit: "Add note" }] }] } }),
    addRecord: vi.fn(async () => ({ id: "r1", values: { text: "x" }, revision: 1, updated_by: "local-owner" })),
    exportApp: async () => ({ name: "field-notes-v1.app-bundle.json", text: "{}" }),
    reviewImport: async () => ({ name: "Field notes", digest: "e".repeat(64), rows: [{ label: "What arrives with it", value: "Records (notes: 2)." }], technical: "{}" }),
    importApp: vi.fn(async () => ({ app_id: "field-notes" })),
    ...over,
  };
}

const show = async (desktop: DesktopApi | null, hash = "") => {
  window.location.hash = hash;
  render(<App client={new MockDataClient()} desktop={desktop} />);
  await act(async () => { await Promise.resolve(); });
};
const nav = () => screen.getByRole("navigation", { name: "Primary" });

beforeEach(() => { localStorage.clear(); window.location.hash = ""; });
afterEach(cleanup);

describe("the installed app's screens", () => {
  it("are not offered where the app does not answer for them", async () => {
    await show(null);
    for (const name of [/Approvals/, /Applications/]) expect(within(nav()).queryByRole("button", { name })).toBeNull();
    cleanup();
    await show(fake({ features: async () => null }), "#/approvals");
    expect(await screen.findByText("This screen is part of the installed app.")).toBeTruthy();
  });

  it("an approval link opens the card; the definition is folded; approving sends the digest of what was shown", async () => {
    const desktop = fake();
    await show(desktop, "#/approvals/writes:mission_a1");
    expect(await screen.findByRole("heading", { level: 1, name: "Install the application Field notes" })).toBeTruthy();
    const details = screen.getByText("Full technical definition (exactly what is approved)").closest("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByRole("table", { name: "What is proposed" }).textContent).not.toContain("aos.app-definition");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(desktop.decide).toHaveBeenCalledWith("writes", "mission_a1", "approve", "d".repeat(64), false));
    expect(await screen.findByText("Done and verified")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("an attestation must be ticked before approving, never before rejecting; a blocked request offers only what is allowed", async () => {
    await show(fake({ approval: async () => card({ attestation: "I checked the amount" }) }), "#/approvals/writes:mission_a1");
    const approve = await screen.findByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the amount" }));
    expect(approve.disabled).toBe(false);
    cleanup();
    await show(fake({ approval: async () => card({ decisions: ["reject"], blocked: "It cannot be approved: this agent's authority was revoked" }) }), "#/approvals/writes:mission_a1");
    expect(await screen.findByText(/authority was revoked/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("a refusal is shown in the app's own words and the card is read again", async () => {
    const approval = vi.fn(async () => card());
    await show(fake({ approval, decide: async () => { throw new Error("it changed since you reviewed it; review it again"); } }), "#/approvals/writes:mission_a1");
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/Not done: it changed since you reviewed it/)).toBeTruthy();
    await waitFor(() => expect(approval).toHaveBeenCalledTimes(2));
  });

  it("a running job is followed until it ends", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      await show(fake({ approval: async () => (n++ === 0 ? card({ waiting: false, running: true, state_words: "Running: this takes a few minutes", decisions: [] })
        : card({ waiting: false, state_words: "Done and verified", decisions: [] })) }), "#/approvals/writes:mission_a1");
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(screen.getByText("Running: this takes a few minutes")).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(screen.getByText("Done and verified")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("connecting an agent sends exactly what was ticked, shows the settings, and never a token", async () => {
    const desktop = fake();
    await show(desktop, "#/agents");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Notes agent" } });
    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /apps.install/ }));
    fireEvent.click(connect);
    await waitFor(() => expect(desktop.connect).toHaveBeenCalledWith("Notes agent", ["apps.install"], 30, "generic"));
    expect(await screen.findByText(/Connected: N/)).toBeTruthy();
    expect(document.body.textContent).toContain("agent-9.token");
    expect(document.body.textContent).not.toMatch(/rla_/);
  });

  it("an application is drawn from its definition and a person's record is sent with its types", async () => {
    const desktop = fake();
    await show(desktop, "#/applications/field-notes");
    fireEvent.change(await screen.findByLabelText("text"), { target: { value: "Called back" } });
    fireEvent.click(screen.getByLabelText("done"));
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(desktop.addRecord).toHaveBeenCalledWith("field-notes", "notes", { text: "Called back", done: true }));
  });
});

describe("the desktop client", () => {
  it("answers no features on a deployment that is not the installed app, and keeps the app's own refusal words", async () => {
    const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await makeDesktopApi("/", answer(404, { detail: "Not Found" })).features()).toBeNull();
    expect(await makeDesktopApi("/", answer(200, { ok: true })).features()).toBeNull();
    await expect(makeDesktopApi("/", answer(403, { detail: { error: "refused", detail: "this agent's authority was revoked" } })).decide("writes", "m", "approve", "d", false))
      .rejects.toThrow("this agent's authority was revoked");
  });
});
