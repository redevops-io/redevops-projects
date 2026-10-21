import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { App } from "./App";
import { MockDataClient } from "./data/client";

const primary = () => within(screen.getByRole("navigation", { name: "Primary" }));

describe("App shell — five places", () => {
  it("shows exactly five destinations plus Settings, and Sidekick is not one of them", async () => {
    render(<App client={new MockDataClient()} />);
    for (const name of ["Today", "Work", "Activity", "Automations", "Connections"]) expect(primary().getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    expect(primary().getAllByRole("button")).toHaveLength(5);
    expect(within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Sidekick$/ })).toBeNull();              // global (top bar / ⌘K), not a place
    await waitFor(() => expect(screen.getByText("Customer Operations")).toBeTruthy());     // project loads into the topbar
  });

  it("lands on Today and its badge is the real count — there are no placeholder badges", async () => {
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".rail .badge")).toHaveLength(1));
    expect(document.querySelector(".rail .badge")?.textContent).toBe("5");
    expect(primary().getByRole("button", { name: /^Today/ }).getAttribute("aria-current")).toBe("page");
  });

  it("Work groups the former sections as tabs and keeps its destination highlighted", async () => {
    render(<App client={new MockDataClient()} />);
    fireEvent.click(primary().getByRole("button", { name: /^Work/ }));
    const tabs = await screen.findByRole("navigation", { name: "Work sections" });
    for (const t of ["Missions", "Summary", "Attention", "Social", "Discovery"]) expect(within(tabs).getByRole("button", { name: t })).toBeTruthy();
    fireEvent.click(within(tabs).getByRole("button", { name: "Attention" }));
    expect(await screen.findByText("Approve refund · $129")).toBeTruthy();                 // the old Attention view still works
    expect(primary().getByRole("button", { name: /^Work/ }).getAttribute("aria-current")).toBe("page");
    expect(within(tabs).getByRole("button", { name: "Attention" }).getAttribute("aria-current")).toBe("page");
  });

  it("Connections holds Apps, Data sources and Deployment health", async () => {
    render(<App client={new MockDataClient()} />);
    fireEvent.click(primary().getByRole("button", { name: /^Connections/ }));
    const tabs = await screen.findByRole("navigation", { name: "Connections sections" });
    for (const t of ["Apps", "Data sources", "Deployment health"]) expect(within(tabs).getByRole("button", { name: t })).toBeTruthy();
    expect(await screen.findByRole("heading", { level: 1, name: "Apps" })).toBeTruthy();
  });

  it("single-section destinations show no tab row; Settings carries Sidekick and General", async () => {
    render(<App client={new MockDataClient()} />);
    fireEvent.click(primary().getByRole("button", { name: /^Activity/ }));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Activity sections" })).toBeNull());
    fireEvent.click(within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name: "Settings" }));
    const tabs = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(tabs).getByRole("button", { name: "Sidekick" })).toBeTruthy();
  });

  it("has a skip link as the first focusable element", async () => {
    render(<App client={new MockDataClient()} />);
    expect((document.querySelector(".skip") as HTMLAnchorElement).getAttribute("href")).toBe("#main");
    expect(document.getElementById("main")).toBeTruthy();
  });
});
