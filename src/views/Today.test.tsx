import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Today } from "./Today";
import { MockDataClient, TodayApiError } from "../data/client";

const setup = (client = new MockDataClient()) => {
  const go = vi.fn(), onCount = vi.fn();
  render(<Today client={client} go={go} onCount={onCount} />);
  return { client, go, onCount };
};
const open = async (title: RegExp) => {
  const row = await screen.findByRole("button", { name: title });
  fireEvent.click(row);
  await screen.findByRole("heading", { level: 2, name: title });
};

describe("Today", () => {
  it("leads with what needs a decision, in domain language, and says the data is sample", async () => {
    const { onCount } = setup();
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    expect(screen.getByText(/Sample data — actions here are simulated/)).toBeTruthy();
    expect(screen.getByText("Visa documents missing — Taylor trip")).toBeTruthy();
    expect(screen.getByText("Quote hasn't been answered — Acme")).toBeTruthy();
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(5));
  });

  it("travel journey: inspect → approve → sent + delivery confirmed, but waiting, not done", async () => {
    setup();
    await open(/Visa documents missing/);
    expect(screen.getByText(/Nothing has been sent yet/)).toBeTruthy();
    expect(screen.getByText(/passport scan and the signed visa form/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve & send" }));
    expect(await screen.findByText(/Approved and sent/)).toBeTruthy();
    expect(screen.getAllByText(/waiting for the customer; no reply or outcome yet/).length).toBeGreaterThan(0);
    const steps = screen.getByLabelText("Progress of this action");
    expect(within(steps).getByText(/Delivery confirmed/).textContent).toContain("done");
    expect(within(steps).getByText(/Outcome seen/).textContent).toContain("not yet");   // a send is not an outcome
    expect(screen.queryByRole("button", { name: "Approve & send" })).toBeNull();        // can't send twice
    await waitFor(() => expect(screen.getByText("Waiting on others")).toBeTruthy());
  });

  it("an outcome closes the work only after a verified send", async () => {
    setup();
    await open(/Quote hasn't been answered/);
    expect(screen.queryByRole("button", { name: /Simulate/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve & send" }));
    await screen.findByText(/Approved and sent/);
    fireEvent.click(screen.getByRole("button", { name: /Simulate: customer responded/ }));
    expect(await screen.findByText("Outcome recorded (simulated).")).toBeTruthy();
    expect(within(screen.getByLabelText("Progress of this action")).getByText(/Outcome seen/).textContent).toContain("done");
  });

  it("clinic: patients without consent are skipped and can't be re-enabled", async () => {
    setup();
    await open(/3 patients haven't confirmed/);
    const skipped = screen.getByLabelText(/M\. Ortega/) as HTMLInputElement;
    expect(skipped.disabled).toBe(true);
    expect(screen.getByText(/skipped: No reminder consent on file/)).toBeTruthy();
    expect(screen.getByText(/To A\. Novak.*R\. Idris/)).toBeTruthy();
  });

  it("clinic: partial approval re-binds the digest to the chosen subset", async () => {
    const { client } = setup();
    const spy = vi.spyOn(client, "approveToday");
    await open(/3 patients haven't confirmed/);
    fireEvent.click(screen.getByLabelText("A. Novak"));                      // untick one recipient
    await waitFor(() => expect(screen.getByText(/To R\. Idris/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Approve & send" }));
    await screen.findByText(/Approved and sent/);
    expect(spy.mock.calls[0][2].targets).toEqual(["p2"]);          // never the consent-less p3
  });

  it("clinic: an unticked recipient stays visible and can be re-added", async () => {
    setup();
    await open(/3 patients haven't confirmed/);
    fireEvent.click(screen.getByLabelText("A. Novak"));
    await waitFor(() => expect(screen.getByText(/To R\. Idris/)).toBeTruthy());
    const box = screen.getByLabelText("A. Novak") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByText(/To A\. Novak.*R\. Idris/)).toBeTruthy());
  });

  it("ambiguous identity blocks sending until a contact is chosen", async () => {
    setup();
    await open(/two customers share this name/);
    expect((screen.getByRole("button", { name: "Approve & send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Choose which contact this is/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/sam@harbor\.example/));
    await waitFor(() => expect((screen.getByRole("button", { name: "Approve & send" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(/To Sam Rivera \(sam@harbor\.example\)/)).toBeTruthy();
  });

  it("a connector failure is shown as not sent — never done — and offers a retry", async () => {
    setup();
    await open(/Invoice #1042 is past due/);
    fireEvent.click(screen.getByRole("button", { name: "Approve & send" }));
    expect((await screen.findAllByText(/Not sent — the connection needs attention/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review & retry" })).toBeTruthy();
    expect(within(screen.getByLabelText("Progress of this action")).getByText(/Sent/, { selector: "li span:last-child" }).textContent).toContain("not yet");
  });

  it("a stale approval sends nothing, says so, and refreshes the preview", async () => {
    const { client } = setup();
    vi.spyOn(client, "approveToday").mockRejectedValueOnce(new TodayApiError(409, "stale_approval", "changed"));
    await open(/Quote hasn't been answered/);
    fireEvent.click(screen.getByRole("button", { name: "Approve & send" }));
    expect(await screen.findByText(/nothing was sent/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve & send" })).toBeTruthy();       // still reviewable
  });

  it("snooze moves an item out of the decision queue", async () => {
    setup();
    await open(/Quote hasn't been answered/);
    fireEvent.change(screen.getByLabelText("Snooze"), { target: { value: "3600" } });
    expect(await screen.findByText("Snoozed — it will come back.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Scheduled")).toBeTruthy());
    expect(screen.getByText("4 things need your decision.")).toBeTruthy();
  });

  it("j/k moves through the queue", async () => {
    setup();
    await open(/Visa documents missing/);
    fireEvent.keyDown(window, { key: "j" });
    await screen.findByRole("heading", { level: 2, name: /3 patients haven't confirmed/ });
    fireEvent.keyDown(window, { key: "k" });
    await screen.findByRole("heading", { level: 2, name: /Visa documents missing/ });
  });

  it("shows an honest empty state, with no sample banner when the data isn't sample", async () => {
    const client = new MockDataClient();
    vi.spyOn(client, "getToday").mockResolvedValueOnce({ project_id: "customer-ops", generated_at: 0, basis: "live", simulated_actions: false,
      headline: "Nothing needs you right now.", counts: {}, items: [], handled_automatically: 0, abstained: 0 });
    setup(client);
    expect((await screen.findAllByText("Nothing needs you right now.")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sample data/)).toBeNull();
    expect(screen.getByText("Select an item.")).toBeTruthy();
  });

  it("surfaces a detail-load failure instead of hanging on Loading", async () => {
    const client = new MockDataClient();
    vi.spyOn(client, "getTodayItem").mockRejectedValue(new TodayApiError(500, "error", "detail exploded"));
    setup(client);
    expect(await screen.findByText("detail exploded")).toBeTruthy();
  });

  it("shows a retryable error when the feed can't load", async () => {
    const client = new MockDataClient();
    vi.spyOn(client, "getToday").mockRejectedValueOnce(new Error("boom"));
    setup(client);
    expect(await screen.findByText(/Couldn't load Today/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
  });
});

// A live signal (e.g. "Reconnect WhatsApp") has no ledger in Today: it is resolved where it originates, and the
// server refuses to snooze it ("no such work item"). The UI must not offer the control that can only fail.
describe("Today — live signals", () => {
  class WithSignal extends MockDataClient {
    async getToday(p?: string) {
      const feed = await super.getToday(p);
      const sig = { ...feed.items[0], id: "sig-wa", kind: "signal" as const, user_title: "Reconnect WhatsApp", reason: "The connection expired.", state: "needs_action" as const };
      return { ...feed, items: [sig, ...feed.items] };
    }
    async getTodayItem(p: string, id: string, o?: Parameters<MockDataClient["getTodayItem"]>[2]) {
      if (id !== "sig-wa") return super.getTodayItem(p, id, o);
      const feed = await this.getToday(p);
      const d = await super.getTodayItem(p, feed.items[1].id, o);
      return { ...d, ...feed.items[0], action: null, history: [] } as unknown as Awaited<ReturnType<MockDataClient["getTodayItem"]>>;
    }
  }

  it("offers Snooze for a case but not for a live signal", async () => {
    render(<Today client={new WithSignal()} go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Reconnect WhatsApp/ }));
    expect(await screen.findByRole("heading", { name: "Reconnect WhatsApp" })).toBeTruthy();
    expect(screen.queryByLabelText("Snooze")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Visa documents missing/ }));
    expect(await screen.findByLabelText("Snooze")).toBeTruthy();
  });
});
