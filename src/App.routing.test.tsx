import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { App } from "./App";
import { MockDataClient } from "./data/client";

const primary = () => within(screen.getByRole("navigation", { name: "Primary" }));

describe("App routing — one implementation for browser and desktop", () => {
  it("opens the place named in the URL hash", async () => {
    window.location.hash = "#/apps";
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Apps" })).toBeTruthy();
    expect(primary().getByRole("button", { name: /^Connections/ }).getAttribute("aria-current")).toBe("page");
  });

  it("a deep link to a Today item opens that item", async () => {
    window.location.hash = "#/today/case-quote";
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByRole("heading", { level: 2, name: /Quote hasn't been answered/ })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe("#/today"));          // consumed: a refresh won't re-focus it
  });

  it("an unknown or hostile hash falls back safely", async () => {
    window.location.hash = "#/admin/../secrets";
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
  });

  it("navigating updates the hash, and the browser's back button returns", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.click(primary().getByRole("button", { name: /^Work/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/missions"));
    fireEvent.click(primary().getByRole("button", { name: /^Activity/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/activity"));
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(window.location.hash).toBe("#/missions"));
    expect(primary().getByRole("button", { name: /^Work/ }).getAttribute("aria-current")).toBe("page");
  });

  it("a hash change from outside (a desktop deep link) navigates without a reload", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    await act(async () => { window.location.hash = "#/today/case-clinic"; });
    expect(await screen.findByRole("heading", { level: 2, name: /3 patients haven't confirmed/ })).toBeTruthy();
  });

  it("restores the last place after a restart (no hash), and Today is still the default for a fresh profile", async () => {
    const first = render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.click(primary().getByRole("button", { name: /^Connections/ }));
    await screen.findByRole("heading", { level: 1, name: "Apps" });
    first.unmount();
    window.history.replaceState(null, "", "#");                                  // a relaunch opens the bare URL
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Apps" })).toBeTruthy();
    localStorage.clear(); window.history.replaceState(null, "", "#");
    document.body.innerHTML = "";
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
  });
});
