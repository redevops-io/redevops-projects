import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { App } from "./App";
import { MockDataClient } from "./data/client";

let now = 1_800_000_000;                                   // 2027-01-15 08:00 UTC
const clock = () => now;
const POLL = 30_000;
beforeEach(() => { now = 1_800_000_000; vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

const toasts = () => screen.queryByRole("status", { name: "New items that need you" });
const poll = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(POLL + 50); }); };
async function boot(client = new MockDataClient(clock)) {
  render(<App client={client} />);
  await screen.findByText("5 things need your decision.");
  return client;
}
const allKeys = async (c: MockDataClient) => (await c.getNotifications("customer-ops")).pending.map((p) => p.key);

describe("Notifications — derived from Today", () => {
  it("shows the newest few actionable items in-app, and how many more", async () => {
    await boot();
    const t = await screen.findByRole("status", { name: "New items that need you" });
    expect(within(t).getAllByRole("button", { name: "Open" })).toHaveLength(2);
    expect(within(t).getByText("and 3 more")).toBeTruthy();
  });

  it("the window title carries only a count — never customer names or message text", async () => {
    await boot();
    await waitFor(() => expect(document.title).toBe("(5) Today · ReDevOps"));
    expect(document.title).not.toMatch(/Taylor|Acme|visa|patient/i);
  });

  it("dismissing a notification acknowledges it; it does not come back on the next poll", async () => {
    await boot();
    const t = await screen.findByRole("status", { name: "New items that need you" });
    const first = within(t).getAllByRole("button", { name: /^Dismiss:/ })[0];
    const title = first.getAttribute("aria-label")!.replace("Dismiss: ", "");
    await act(async () => { fireEvent.click(first); });
    await waitFor(() => expect(screen.queryByRole("button", { name: `Dismiss: ${title}` })).toBeNull());
    await poll();
    expect(screen.queryByRole("button", { name: `Dismiss: ${title}` })).toBeNull();
  });

  it("Open jumps to Today with that item selected", async () => {
    await boot();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: /^Activity/ }));
    const t = await screen.findByRole("status", { name: "New items that need you" });
    const open = within(t).getAllByRole("button", { name: "Open" })[0];
    const title = within(open.closest(".toast") as HTMLElement).getByText(/—|Quote|patients|Invoice|Reminder|Visa/).textContent!;
    await act(async () => { fireEvent.click(open); });
    expect(await screen.findByRole("heading", { level: 2, name: title })).toBeTruthy();
  });

  it("a snoozed item is silent until it wakes, then notifies exactly once", async () => {
    const c = await boot();
    const ids = (await c.getToday("customer-ops")).items.filter((i) => /Quote hasn't/.test(i.user_title)).map((i) => i.id);
    await c.ackNotifications("customer-ops", await allKeys(c));
    await c.batchToday("customer-ops", { action: "snooze", item_ids: ids, seconds: 3600 });
    await poll();
    expect(toasts()).toBeNull();                                           // snoozed: nothing, even though a poll happened
    now += 1800; await poll();
    expect(toasts()).toBeNull();                                           // still snoozed halfway through
    now += 1801; await poll();
    const t = await screen.findByRole("status", { name: "New items that need you" });
    expect(within(t).getAllByText(/Quote hasn't been answered/)).toHaveLength(1);   // woke: notifies once
    await act(async () => { fireEvent.click(within(t).getByRole("button", { name: /^Dismiss:/ })); });
    await poll();
    expect(toasts()).toBeNull();
  });

  it("a waiting item stays quiet, then comes back with 'Back in your queue' when its follow-up is due", async () => {
    const c = await boot();
    const travel = (await c.getToday("customer-ops")).items.find((i) => /Taylor trip/.test(i.user_title))!;
    const d = await c.getTodayItem("customer-ops", travel.id);
    await c.approveToday("customer-ops", travel.id, { payload_digest: d.action!.payload_digest! });
    await c.ackNotifications("customer-ops", await allKeys(c));
    await poll();
    expect(toasts()).toBeNull();                                           // waiting on the customer
    now += 3 * 86400 + 60; await poll();
    const t = await screen.findByRole("status", { name: "New items that need you" });
    expect(within(t).getByText("Back in your queue")).toBeTruthy();
  });

  it("quiet hours silence interruptions but the count still shows", async () => {
    const c = new MockDataClient(clock);
    await c.setNotificationPrefs("customer-ops", { quiet_start: 7, quiet_end: 9, tz_offset_minutes: 0 });   // it is 08:00 UTC
    await boot(c);
    await waitFor(() => expect(document.querySelector(".rail .badge")?.textContent).toBe("5"));
    expect(toasts()).toBeNull();
    now += 2 * 3600; await poll();                                         // 10:00 — quiet hours are over
    expect(await screen.findByRole("status", { name: "New items that need you" })).toBeTruthy();
  });

  it("can be turned off in Settings → Notifications, and quiet hours can be set there", async () => {
    const c = await boot();
    await screen.findByRole("status", { name: "New items that need you" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Notifications" }));
    const box = await screen.findByRole("checkbox", { name: /Notify me when something needs me/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    await act(async () => { fireEvent.click(box); });
    await waitFor(() => expect(toasts()).toBeNull());                      // applied immediately, not at the next poll
    expect((await c.getNotifications("customer-ops")).prefs.enabled).toBe(false);
    await act(async () => { fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "22" } }); });
    await waitFor(async () => expect((await c.getNotifications("customer-ops")).prefs.quiet_start).toBe(22));
    expect(screen.getByText(/never customer names or message text on a lock screen/)).toBeTruthy();
  });

  it("a failing notifications endpoint never breaks Today", async () => {
    const c = new MockDataClient(clock);
    vi.spyOn(c, "getNotifications").mockRejectedValue(new Error("down"));
    render(<App client={c} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    expect(toasts()).toBeNull();
    await waitFor(() => expect(document.querySelector(".rail .badge")?.textContent).toBe("5"));   // falls back to Today's own count
  });
});
