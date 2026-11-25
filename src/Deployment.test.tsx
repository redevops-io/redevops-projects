import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { App } from "./App";
import { MockDataClient } from "./data/client";
import { deployment, resetDeployment } from "./data/deployment";
import { Workflows } from "./views/Workflows";
import { Settings } from "./views/Settings";
import { Apps } from "./views/Apps";
import { NotificationToasts, FOLD_AFTER_MS } from "./components/NotificationToasts";

afterEach(() => { resetDeployment(); vi.useRealTimers(); });

// A real deployment: the server says it serves no demo fixtures and names its own project.
class RealClient extends MockDataClient {
  asked: string[] = [];
  async listProjects() { return [{ id: "main", name: "Operations", health: "ok" as const, sample: false }]; }
  async getOverview(...a: [string?]) { this.asked.push(String(a[0])); return super.getOverview(); }
  async getWorkflows(...a: [string?]) { this.asked.push(String(a[0])); return super.getWorkflows(); }
}

describe("a deployment that serves no demo data", () => {
  it("is asked for ITS project, and the shell shows its name", async () => {
    const c = new RealClient();
    render(<App client={c} />);
    await waitFor(() => expect(deployment).toMatchObject({ projectId: "main", projectName: "Operations", sample: false }));
    await waitFor(() => expect(c.asked).toContain("main"));
    expect(c.asked).not.toContain("customer-ops");
  });

  it("shows no illustrative runs, app chains or example settings", async () => {
    Object.assign(deployment, { projectId: "main", projectName: "Operations", sample: false });
    const w = render(<Workflows client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Customer Refund Handling")).toBeTruthy());
    fireEvent.click(screen.getAllByText("Open")[0]);
    await waitFor(() => expect(screen.getByText("Policy")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Runs" }));
    expect(screen.queryByText(/Sarah Chen/)).toBeNull();
    expect(screen.getByText("No run is recorded for this workflow yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Apps" }));
    expect(screen.queryByText("HubSpot")).toBeNull();
    w.unmount();

    const s = render(<Settings client={new MockDataClient()} go={() => {}} />);
    expect(screen.getByText("Operations")).toBeTruthy();
    expect(screen.queryByText("Customer Operations")).toBeNull();
    expect(screen.queryByText(/Refunds require approval/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.queryByText(/2 admins/)).toBeNull();
    expect(screen.getByText(/Managed by the operator of this deployment/)).toBeTruthy();
    s.unmount();

    render(<Apps client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Apps" })).toBeTruthy());
    expect(screen.queryByText("Killer demo")).toBeNull();
    expect(screen.queryByText("Run demo Mission")).toBeNull();
  });

  it("a sample deployment still shows its illustrative content", async () => {
    render(<Apps client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Killer demo")).toBeTruthy());
  });
});

describe("nothing floats over the page for long", () => {
  it("the open Sidekick takes its own column instead of covering the page", async () => {
    const { container } = render(<App client={new MockDataClient()} />);
    const app = container.querySelector(".app") as HTMLElement;
    expect(app.className).not.toContain("sk-open");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(app.className).toContain("sk-open"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(app.className).not.toContain("sk-open"));
  });

  it("notifications fold into one chip after a moment and unfold for a new item", async () => {
    vi.useFakeTimers();
    const n = (key: string, title: string) => ({ key, id: key, title, kind: "case", resurfaced: false }) as any;
    const props = { onOpen: () => {}, onDismiss: () => {}, onDismissAll: () => {} };
    const r = render(<NotificationToasts pending={[n("a", "First"), n("b", "Second"), n("c", "Third")]} {...props} />);
    expect(screen.getAllByRole("button", { name: "Open" }).length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(FOLD_AFTER_MS + 10); });
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.getByRole("button", { name: /3 items need you/ })).toBeTruthy();
    r.rerender(<NotificationToasts pending={[n("d", "New one"), n("a", "First")]} {...props} />);
    expect(screen.getByText("New one")).toBeTruthy();                       // a new item is announced in full again
    act(() => { vi.advanceTimersByTime(FOLD_AFTER_MS + 10); });
    fireEvent.click(screen.getByRole("button", { name: /2 items need you/ }));
    expect(screen.getByText("New one")).toBeTruthy();                       // one click brings the stack back
  });
});
