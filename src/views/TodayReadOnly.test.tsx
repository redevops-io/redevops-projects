import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Today } from "./Today";
import { MockDataClient, TodayApiError } from "../data/client";

// A deployment that only shows items from connected products: the server has no capture and no item detail (it answers 501 to both).
class ReadOnly extends MockDataClient {
  constructor(private declares: boolean) { super(); }
  listCaptures = vi.fn(async () => { throw new TodayApiError(501, "unsupported", "capture is not enabled for this deployment"); });
  getTodayItem = vi.fn(async () => { throw new TodayApiError(501, "unsupported", "Today is read-only"); });
  async getToday(p: string) {
    const f = await super.getToday(p);
    return this.declares ? { ...f, supports: { capture: false, detail: false } } : f;
  }
}

describe("Today on a read-only deployment", () => {
  it("when the feed says capture and detail are not supported, neither is shown nor requested", async () => {
    const c = new ReadOnly(true);
    render(<Today client={c} go={vi.fn()} />);
    expect(await screen.findByText(/need your decision/)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Item details").textContent).toMatch(/comes from a connected product/));
    expect(screen.queryByLabelText("Quick capture")).toBeNull();
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
    expect(screen.queryByText(/c captures/)).toBeNull();
    expect(c.listCaptures).not.toHaveBeenCalled();
    expect(c.getTodayItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();                       // no error banner for a feature that simply is not there
  });

  it("against a server that does not say, one 501 switches the control off instead of leaving a dead one", async () => {
    const c = new ReadOnly(false);
    render(<Today client={c} go={vi.fn()} />);
    expect(await screen.findByText(/need your decision/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Quick capture")).toBeNull());
    await waitFor(() => expect(screen.getByLabelText("Item details").textContent).toMatch(/comes from a connected product/));
    expect(c.listCaptures).toHaveBeenCalledTimes(1);
    expect(c.getTodayItem).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a deployment that supports both keeps Quick capture and the full detail", async () => {
    render(<Today client={new MockDataClient()} go={vi.fn()} />);
    expect(await screen.findByLabelText("Quick capture")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Item details").textContent).not.toMatch(/comes from a connected product/));
  });
});
