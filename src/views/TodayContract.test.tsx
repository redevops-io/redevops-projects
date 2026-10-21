import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { Today } from "./Today";
import { App } from "../App";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { MockDataClient } from "../data/client";
import type { TodayDetail } from "../data/types";

// What the REAL API returned from an action before the contract fix: a bare item view — no evidence/action/history.
const bare = (d: TodayDetail) => { const { evidence, action, history, why, ...rest } = d; void evidence; void action; void history; void why; return rest as unknown as TodayDetail; };

describe("Today survives a server that answers an action with less than a full detail", () => {
  it("approve with a bare response: no crash, the detail is re-read, and the send is shown", async () => {
    const c = new MockDataClient();
    const real = c.approveToday.bind(c);
    vi.spyOn(c, "approveToday").mockImplementation(async (...a) => bare(await real(...a)));
    render(<Today client={c} go={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Quote hasn't been answered/ }));
    await screen.findByRole("heading", { level: 2, name: /Quote hasn't been answered/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve & send" })); });
    expect(await screen.findByText(/Approved and sent/)).toBeTruthy();
    expect(screen.getByText(/Your note|Quote Q-310 sent/)).toBeTruthy();                // evidence is back: the pane was re-read
    expect(screen.getAllByText(/waiting for the customer/).length).toBeGreaterThan(0);
  });

  it("snooze / dismiss with bare responses don't crash either", async () => {
    const c = new MockDataClient();
    for (const m of ["snoozeToday", "dismissToday"] as const) {
      const real = (c[m] as (...a: unknown[]) => Promise<TodayDetail>).bind(c);
      vi.spyOn(c, m).mockImplementation((async (...a: unknown[]) => bare(await real(...a))) as never);
    }
    render(<Today client={c} go={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Invoice #1042/ }));
    await screen.findByRole("heading", { level: 2, name: /Invoice #1042/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Dismiss" })); });
    expect(await screen.findByText("Dismissed.")).toBeTruthy();
  });

  it("a detail with missing lists renders instead of throwing", async () => {
    const c = new MockDataClient();
    const real = c.getTodayItem.bind(c);
    vi.spyOn(c, "getTodayItem").mockImplementation(async (...a) => bare(await real(...a)));
    render(<Today client={c} go={() => {}} />);
    expect(await screen.findByRole("heading", { level: 2 })).toBeTruthy();
  });
});

describe("a screen that crashes never blanks the window", () => {
  class Boom extends Component<{ children?: ReactNode }> { render(): ReactNode { throw new Error("kaboom"); } }

  it("shows a recoverable message and lets the user retry", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const Maybe = () => { if (fail) throw new Error("kaboom"); return <p>recovered</p>; };
    render(<ErrorBoundary><Maybe /></ErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toMatch(/ran into a problem/);
    expect(screen.getByText(/Your work is safe/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload this screen" }));
    expect(screen.getByText("recovered")).toBeTruthy();
    err.mockRestore(); void Boom;
  });

  it("in the app: the navigation stays up and moving to another screen clears the error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new MockDataClient();
    vi.spyOn(c, "getMissions").mockImplementation((() => { throw new Error("bad shape"); }) as never);
    render(<App client={c} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.click(screen.getByRole("button", { name: /^Work/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/This screen ran into a problem|Couldn't load|bad shape/);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();         // the rest of the window is intact
    fireEvent.click(screen.getByRole("button", { name: /^Today/ }));
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
  });
});
