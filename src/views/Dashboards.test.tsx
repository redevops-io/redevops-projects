import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { Dashboards } from "./Dashboards";
import { MockDataClient, TodayApiError } from "../data/client";
import type { DashCatalog, Dashboard } from "../data/dashboards";
import fixtures from "../data/mockDashboards.json";

const fx = fixtures as unknown as { catalog: DashCatalog; dashboards: Record<string, Dashboard> };
const noop = () => {};
const show = (client = new MockDataClient(), extra: Partial<Parameters<typeof Dashboards>[0]> = {}) =>
  render(<Dashboards client={client} go={noop} ask={noop} {...extra} />);
const stat = (label: string) => screen.getAllByText(label).map((e) => e.closest(".stat")).find(Boolean) as HTMLElement;

describe("Dashboards", () => {
  it("lives in Work beside Summary and deep-links to one dashboard", async () => {
    window.location.hash = "#/dashboards/qa";
    render(<App client={new MockDataClient()} />);
    const tabs = await screen.findByRole("navigation", { name: "Work sections" });
    expect(within(tabs).getByRole("button", { name: "Dashboards" }).getAttribute("aria-current")).toBe("page");
    expect(await screen.findByRole("heading", { level: 1, name: "QA and release readiness" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("tab", { name: "Security and remediation" }));
    await waitFor(() => expect(window.location.hash).toBe("#/dashboards/security"));
    window.location.hash = "";
  });

  it("is one click away from Today, from the top bar", async () => {
    window.location.hash = "#/today";
    render(<App client={new MockDataClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dashboards" }));
    expect(await screen.findByRole("tablist", { name: "Dashboards" })).toBeTruthy();
    expect(window.location.hash.startsWith("#/dashboards")).toBe(true);
    window.location.hash = "";
  });

  it("offers only the dashboards whose applications are connected and says what would add more", async () => {
    show();
    const tabs = await screen.findByRole("tablist", { name: "Dashboards" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(fx.catalog.dashboards.map((d) => d.title));
    expect(within(tabs).queryByRole("tab", { name: "Revenue and sales" })).toBeNull();
    expect(await screen.findByText(/more dashboards appear when their applications are connected/)).toBeTruthy();
  });

  it("renders the runtime's numbers verbatim and never shows an unknown value as zero", async () => {
    show(undefined, { initial: "qa" });
    const d = fx.dashboards["qa|"];
    const cov = d.panels[0].metrics.find((m) => m.id === "coverage")!;
    await screen.findByRole("heading", { level: 1, name: "QA and release readiness" });
    await waitFor(() => expect(stat("Execution coverage")).toBeTruthy());
    expect(within(stat("Execution coverage")).getByText(`${cov.value}%`)).toBeTruthy();
    expect(within(stat("Execution coverage")).getByText(cov.note)).toBeTruthy();
    for (const label of ["Passed, of planned", "Failed", "Blocked", "Not executed", "Unsupported"]) expect(stat(label)).toBeTruthy();   // five separate states
    // a metric the runtime could not know
    const client = new MockDataClient();
    const down = structuredClone(d);
    down.panels[0].metrics = down.panels[0].metrics.map((m) => (m.id === "failed" ? { ...m, value: null, unknown: "source_unavailable", drill: "" } : m));
    client.getDashboard = async () => down;
    document.body.innerHTML = "";
    show(client, { initial: "qa" });
    await waitFor(() => expect(stat("Failed")).toBeTruthy());
    expect(within(stat("Failed")).getByText("Not known")).toBeTruthy();
    expect(within(stat("Failed")).getByText(/The source is not answering/)).toBeTruthy();
    expect(within(stat("Failed")).queryByText("0")).toBeNull();
    expect(stat("Failed").tagName).toBe("DIV");                                           // nothing to drill into
  });

  it("opens the records behind a number, with their source, freshness and next actions", async () => {
    const ask = vi.fn(), go = vi.fn();
    show(undefined, { initial: "qa", ask, go });
    await waitFor(() => expect(stat("Failed")).toBeTruthy());
    fireEvent.click(stat("Failed"));
    const dlg = await screen.findByRole("dialog", { name: /Records: Failed tests/ });
    const want = (fixtures as any).drills["qa||cells:failed"];
    expect(await within(dlg).findByText(String(want.total))).toBeTruthy();
    expect(within(dlg).getAllByRole("row")).toHaveLength(want.records.length + 1);
    expect(within(dlg).getAllByText(want.records[0].ref).length).toBeGreaterThan(0);        // the system's own reference is shown
    expect(within(dlg).getByText(/Reported test results/)).toBeTruthy();                    // where it came from
    fireEvent.click(within(dlg).getByRole("button", { name: "Ask Sidekick about this" }));
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Failed tests"), true, "dashboard:qa#cells:failed");
    fireEvent.click(within(dlg).getByRole("button", { name: "Track in Today" }));
    expect(await within(dlg).findByText(/Added to your intake in Today/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("filters by project and passes the filters to the runtime", async () => {
    const client = new MockDataClient();
    const spy = vi.spyOn(client, "getDashboard");
    show(client, { initial: "qa" });
    await waitFor(() => expect(stat("Planned tests")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "billing" } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("qa", expect.objectContaining({ project: "billing", days: 30 }), false));
    expect(await screen.findByText("Project · Billing")).toBeTruthy();
    const planned = fx.dashboards["qa|billing"].panels[0].metrics.find((m) => m.id === "planned")!.value;
    await waitFor(() => expect(within(stat("Planned tests")).getByText(String(planned))).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Range"), { target: { value: "7" } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("qa", expect.objectContaining({ project: "billing", days: 7 }), false));
  });

  it("saves a customised view and restores it", async () => {
    const client = new MockDataClient();
    vi.spyOn(window, "prompt").mockReturnValue("Release week");
    const first = show(client, { initial: "qa" });
    await waitFor(() => expect(stat("Planned tests")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "storefront" } });
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    const hist = document.querySelector('[data-panel="history"]') as HTMLElement;
    fireEvent.click(within(hist).getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.querySelector('[data-panel="history"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect((screen.getByLabelText("Saved view") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Release week"));
    fireEvent.click(screen.getByRole("button", { name: "Make default" }));
    await screen.findByRole("button", { name: "Unset default" });
    const saved = await client.listDashboardViews("qa");
    expect(saved[0]).toMatchObject({ name: "Release week", is_default: true, filters: { project: "storefront" }, layout: { hidden: ["history"] } });
    first.unmount();
    localStorage.clear();
    show(client, { initial: "qa" });                                                       // a new visit: the default view comes back from the runtime
    expect(await screen.findByText("Project · Storefront")).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-panel="summary"]')).toBeTruthy());
    expect(document.querySelector('[data-panel="history"]')).toBeNull();
    expect(screen.getByText(/1 panel hidden in this view/)).toBeTruthy();
  });

  it("explains an empty deployment, a refused dashboard and an out-of-date runtime", async () => {
    const empty = new MockDataClient();
    empty.getDashboardCatalog = async () => ({ ...fx.catalog, dashboards: [], not_connected: [{ id: "qa", title: "QA and release readiness", priority: "P0", connect: ["QA runs"] }] });
    const a = show(empty);
    expect(await screen.findByRole("heading", { name: "Nothing to chart yet" })).toBeTruthy();
    expect(screen.getByText(/connect QA runs/)).toBeTruthy();
    a.unmount();
    const refused = new MockDataClient();
    refused.getDashboard = async () => { throw new TodayApiError(403, "forbidden", "no"); };
    const b = show(refused, { initial: "qa" });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "You do not have access to this dashboard or project.");
    b.unmount();
    const old = new MockDataClient();
    old.getDashboardCatalog = async () => { throw new TodayApiError(404, "error", "nope"); };
    show(old);
    expect(await screen.findByText(/does not provide dashboards yet/)).toBeTruthy();
  });

  it("shows each source's state and a chart's numbers as a table", async () => {
    const client = new MockDataClient();
    const d = structuredClone(fx.dashboards["security|"]);
    d.sources = d.sources.map((s) => ({ ...s, state: "unavailable", detail: "connection refused" }));
    client.getDashboard = async () => d;
    show(client, { initial: "security" });
    expect((await screen.findAllByText(/Edge Sentinel · not answering/)).length).toBeGreaterThan(0);
    document.body.innerHTML = "";
    show(undefined, { initial: "qa" });
    await waitFor(() => expect(document.querySelector('[data-panel="history"]')).toBeTruthy());
    const hist = document.querySelector('[data-panel="history"]') as HTMLElement;
    fireEvent.click(within(hist).getByRole("button", { name: "Table" }));
    expect(within(hist).getByRole("columnheader", { name: "Passed" })).toBeTruthy();
    expect(within(hist).getAllByRole("row").length).toBe(fx.dashboards["qa|"].panels.find((p) => p.id === "history")!.x.length + 1);
  });
});

describe("Sidekick", () => {
  it("says so when the runtime refuses or cannot be reached, instead of staying silent", async () => {
    const client = new MockDataClient();
    client.askSidekick = async () => { throw new TodayApiError(403, "forbidden", "no"); };
    const { Sidekick } = await import("../components/Sidekick");
    render(<Sidekick open ctx={{ projectId: "p", section: "Dashboards" }} client={client} onClose={() => {}} seed={{ text: "why?", send: true, nonce: 1 }} />);
    expect(await screen.findByText(/did not accept the request/)).toBeTruthy();
  });
});
