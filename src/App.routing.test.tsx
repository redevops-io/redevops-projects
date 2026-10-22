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
    expect(await screen.findByRole("heading", { level: 2, name: /Quote hasn't been answered/ }, { timeout: 5000 })).toBeTruthy();
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
    expect(await screen.findByRole("heading", { level: 2, name: /3 patients haven't confirmed/ }, { timeout: 5000 })).toBeTruthy();
  });

  it("an outside hash change moves ACROSS sections (a desktop deep link from anywhere), not just within Today", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    for (const [hash, heading, dest] of [["#/activity", "Activity", "Activity"], ["#/apps", "Apps", "Connections"], ["#/missions", "Everything running, waiting, and scheduled", "Work"]] as const) {
      await act(async () => { window.location.hash = hash; });
      expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
      expect(primary().getByRole("button", { name: new RegExp(`^${dest}`) }).getAttribute("aria-current")).toBe("page");
    }
    await act(async () => { window.location.hash = "#/today/case-clinic"; });
    expect(await screen.findByRole("heading", { level: 2, name: /3 patients haven't confirmed/ }, { timeout: 5000 })).toBeTruthy();   // and back, onto an item
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

describe("deep link vs default selection — the ordering race", () => {
  it("a deep link still wins when the parent's prop clears BEFORE the child's selection lands (the flaky interleaving, forced)", async () => {
    const { useState } = await import("react");
    const { flushSync } = await import("react-dom");
    const { Today } = await import("./views/Today");
    const c = new MockDataClient();
    // flushSync renders the parent's `focusItem = null` immediately, while Today's own setSel is still pending — exactly what
    // happened intermittently under load. Before the fix the default selection ("Visa …") overwrote the requested item.
    function Harness() {
      const [f, setF] = useState<string | null>("case-quote");
      return <Today client={c} go={() => {}} focusItem={f} onFocused={() => flushSync(() => setF(null))} />;
    }
    render(<Harness />);
    expect(await screen.findByRole("heading", { level: 2, name: /Quote hasn't been answered/ }, { timeout: 5000 })).toBeTruthy();
  });
});
