import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { Today } from "./Today";
import { MockDataClient } from "../data/client";

const setup = (client = new MockDataClient()) => { render(<Today client={client} go={vi.fn()} />); return client; };
const startSelecting = async () => { await screen.findByText("5 things need your decision."); fireEvent.click(screen.getByRole("button", { name: "Select items" })); };
const pick = (title: RegExp) => fireEvent.click(screen.getByLabelText(title));
const tools = () => within(screen.getByRole("group", { name: "Batch actions" }));

describe("Today — batch triage (reversible only)", () => {
  it("selects several items and snoozes them together, then undoes", async () => {
    setup();
    await startSelecting();
    pick(/Select: Quote hasn't been answered/); pick(/Select: 3 patients haven't confirmed/);
    expect(screen.getByText("2 selected")).toBeTruthy();
    await act(async () => { fireEvent.change(tools().getByLabelText("Snooze selected"), { target: { value: "3600" } }); });
    expect(await screen.findByText(/Snoozed 2 items\./)).toBeTruthy();
    expect(await screen.findByText("3 things need your decision.")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(await screen.findByText(/Undone for 2 items\./)).toBeTruthy();
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
  });

  it("never offers approval in a batch, and says why", async () => {
    setup();
    await startSelecting();
    pick(/Select: Visa documents missing — Taylor trip/);
    expect(tools().queryByRole("button", { name: /approve|send/i })).toBeNull();           // the batch tools have no approval
    expect(tools().getAllByRole("button").map((b) => b.textContent)).toEqual(["Dismiss", "Assign", "Categorize"]);
    expect(tools().getByText("Approvals are reviewed one item at a time.")).toBeTruthy();
    // approving stays a single-item action in the detail pane, bound to that item's exact payload
    expect(screen.getByRole("button", { name: "Approve & send" })).toBeTruthy();
  });

  it("assign and categorize need a label, then apply to every selected item", async () => {
    const client = setup();
    const spy = vi.spyOn(client, "batchToday");
    await startSelecting();
    pick(/Select: Quote hasn't been answered/); pick(/Select: Invoice #1042/);
    expect((tools().getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(tools().getByLabelText("Label for assign or categorize"), { target: { value: "Front desk" } });
    await act(async () => { fireEvent.click(tools().getByRole("button", { name: "Assign" })); });
    expect(await screen.findByText(/Assigned 2 items\./)).toBeTruthy();
    expect(spy.mock.calls[0][1]).toMatchObject({ action: "assign", assignee: "Front desk", item_ids: expect.arrayContaining([expect.any(String), expect.any(String)]) });
  });

  it("reports items that couldn't be changed instead of hiding them, and keeps them selected", async () => {
    const client = setup();
    vi.spyOn(client, "batchToday").mockResolvedValueOnce({ action: "dismiss", ok_count: 1, failed_count: 1, undo: { token: "t", expires_at: 1 },
      results: [{ id: "a", ok: true }, { id: "b", ok: false, error: "already_sent", detail: "a sent item can't be dismissed; wait for the outcome" }] });
    await startSelecting();
    pick(/Select: Quote hasn't been answered/); pick(/Select: Invoice #1042/);
    await act(async () => { fireEvent.click(tools().getByRole("button", { name: "Dismiss" })); });
    expect(await screen.findByText(/Dismissed 1 item\. 1 couldn't be changed: a sent item can't be dismissed/)).toBeTruthy();
    expect(screen.getByText("Approvals are reviewed one item at a time.")).toBeTruthy();   // tools stay; selection narrowed to the failures
  });

  it("shows a server refusal and changes nothing", async () => {
    const client = setup();
    vi.spyOn(client, "batchToday").mockRejectedValueOnce(Object.assign(new Error("a batch is limited to 50 items"), { code: "too_many" }));
    await startSelecting();
    pick(/Select: Quote hasn't been answered/);
    await act(async () => { fireEvent.click(tools().getByRole("button", { name: "Dismiss" })); });
    expect(await screen.findByText("a batch is limited to 50 items")).toBeTruthy();
    expect(screen.getByText("5 things need your decision.")).toBeTruthy();
  });

  it("'x' selects the current item (keyboard)", async () => {
    setup();
    await screen.findByText("5 things need your decision.");
    fireEvent.click(await screen.findByRole("button", { name: /Visa documents missing — Taylor trip/ }));
    await screen.findByRole("heading", { level: 2, name: /Taylor trip/ });
    fireEvent.keyDown(window, { key: "x" });
    await waitFor(() => expect((screen.getByLabelText(/Select: Visa documents missing — Taylor trip/) as HTMLInputElement).checked).toBe(true));
  });

  it("leaving select mode clears the selection and the tools", async () => {
    setup();
    await startSelecting();
    pick(/Select: Quote hasn't been answered/);
    fireEvent.click(screen.getByRole("button", { name: "Done selecting" }));
    expect(screen.queryByRole("group", { name: "Batch actions" })).toBeNull();
    expect(screen.queryByLabelText(/Select: Quote/)).toBeNull();
  });
});

