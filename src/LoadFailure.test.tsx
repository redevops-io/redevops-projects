import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { App } from "./App";
import { Activity } from "./views/Activity";
import { MockDataClient, TodayApiError } from "./data/client";

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

const down = () => new TodayApiError(0, "network", "Can't reach the runtime.");
const err500 = () => new TodayApiError(500, "error", "Projects API → 500");
const nav = (name: RegExp) => fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name }));

// A client whose every read fails, as when the API is offline or answering 500.
function failingClient(make: () => Error) {
  const c = new MockDataClient();
  for (const k of Object.getOwnPropertyNames(MockDataClient.prototype)) {
    if (/^(get|list)/.test(k)) vi.spyOn(c as any, k).mockRejectedValue(make());
  }
  return c;
}

describe("a view whose data failed to load", () => {
  it.each([["offline", down], ["HTTP 500", err500]])("shows an error with a retry, not 'Loading…' for ever (%s)", async (_n, make) => {
    const c = new MockDataClient();
    const real = c.getActivity.bind(c);
    const spy = vi.spyOn(c, "getActivity").mockRejectedValue(make());
    render(<Activity client={c} go={() => {}} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/Loading/);
    spy.mockImplementation(real);                                                     // the runtime is back
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a deployment that doesn't serve a screen says so instead of claiming an outage", async () => {
    const c = new MockDataClient();
    vi.spyOn(c, "getActivity").mockRejectedValue(new TodayApiError(404, "error", "Projects API → 404"));
    render(<Activity client={c} go={() => {}} />);
    expect(await screen.findByText("Activity isn't available on this deployment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe.each([["offline", down], ["HTTP 500", err500]])("the app shell when every read fails (%s)", (_n, make) => {
  it("never says Healthy, never stays on Loading…, and the title follows the screen", async () => {
    render(<App client={failingClient(make)} />);
    expect(await screen.findByText("Can't reach runtime", { selector: "[role=status]" })).toBeTruthy();   // the badge
    expect(screen.queryByText("Healthy")).toBeNull();
    expect(screen.queryByText("Loading…", { selector: "[role=status]" })).toBeNull();
    expect(await screen.findByRole("alert")).toBeTruthy();                                                // Today's error state
    expect(document.title).toBe("Can't reach runtime · Today · ReDevOps");
    nav(/^Activity/);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(document.title).toBe("Can't reach runtime · Activity · ReDevOps");
    expect(document.title).not.toMatch(/\(\d+\)/);                                                        // no stale count
  });

  it("a single failing screen is also not 'Healthy'", async () => {
    const c = new MockDataClient();
    vi.spyOn(c, "getActivity").mockRejectedValue(make());
    render(<App client={c} />);
    await screen.findByText("5 things need your decision.");
    nav(/^Activity/);
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.queryByText(/Healthy/)).toBeNull());
    expect(screen.getByText(/can't reach runtime|data didn't load/i, { selector: "[role=status]" })).toBeTruthy();
  });
});

describe("what the shell does not vouch for while the runtime is failing", () => {
  it("drops the stale count and the stale notifications; a screen the deployment doesn't serve does not turn the shell red", async () => {
    const c = new MockDataClient();
    render(<App client={c} />);
    await screen.findByRole("status", { name: "New items that need you" });
    vi.spyOn(c, "getActivity").mockRejectedValue(new TodayApiError(404, "error", "Projects API → 404"));
    nav(/^Activity/);
    await screen.findByText("Activity isn't available on this deployment");
    expect(screen.getByText("Healthy (sample)")).toBeTruthy();                                   // not an outage
    expect(screen.getByRole("status", { name: "New items that need you" })).toBeTruthy();
    vi.spyOn(c, "getActivity").mockRejectedValue(down());
    nav(/^Today/); nav(/^Activity/);
    await screen.findByText("Can't reach runtime", { selector: "[role=status]" });
    expect(screen.queryByRole("status", { name: "New items that need you" })).toBeNull();        // no stale "Needs you" toasts
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: /^Today/ }).textContent).not.toMatch(/\d/);
  });
});

describe("honest labelling and layout hooks", () => {
  it("the document title tracks the section, with the count only when it is known", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    await waitFor(() => expect(document.title).toBe("(5) Today · ReDevOps"));
    nav(/^Activity/);
    await waitFor(() => expect(document.title).toBe("(5) Activity · ReDevOps"));
  });

  it("labels the mock client at the top and never claims execution", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    nav(/^Activity/);
    const note = await screen.findByRole("note");
    expect(note.textContent).toMatch(/example data/i);
    expect(note.textContent).toMatch(/nothing is connected to a real system, sent or executed/i);
    expect(document.body.textContent).not.toMatch(/mock Projects API client|standalone build/);
    expect(screen.getByText("Healthy (sample)")).toBeTruthy();
  });

  it("the demo Mission button does not pretend to run anything", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    nav(/^Connections/);
    const btn = await screen.findByRole("button", { name: /Show demo Mission \(simulated\)/ });
    fireEvent.click(btn);
    expect(screen.getByText(/Nothing was started/)).toBeTruthy();
    expect(screen.queryByText(/Running demo Mission/)).toBeNull();
  });

  it("notifications sit in the page flow before <main>, not over it", async () => {
    render(<App client={new MockDataClient()} />);
    const t = await screen.findByRole("status", { name: "New items that need you" });
    const main = document.querySelector("main")!;
    expect(t.parentElement).toBe(main.parentElement);
    expect(t.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the nav button's name carries its visible text and the count", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    const today = within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: /^Today/ });
    expect(today.textContent).toMatch(/^.*Today.*5.*need you$/);
    expect(today.hasAttribute("aria-label")).toBe(false);
  });
});
