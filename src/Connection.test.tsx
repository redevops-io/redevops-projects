import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { App } from "./App";
import { Today } from "./views/Today";
import { HttpDataClient, MockDataClient, TodayApiError, classifyConnectionError } from "./data/client";

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("classifyConnectionError — the same words in the browser and the desktop shell", () => {
  it.each([
    [new TodayApiError(0, "network", "x"), "unavailable", true],
    [new TodayApiError(0, "timeout", "x"), "unavailable", true],
    [new TodayApiError(502, "error", "x"), "unavailable", true],
    [new TodayApiError(503, "error", "x"), "unavailable", true],
    [new TodayApiError(401, "error", "x"), "unauthenticated", false],
    [new TodayApiError(403, "error", "x"), "unauthenticated", false],
    [new TodayApiError(404, "error", "x"), "incompatible", false],
    [new TodayApiError(501, "unsupported", "x"), "unsupported", false],
    [new TodayApiError(404, "not_found", "no such work item"), "error", true],      // a missing ITEM is not a missing feature
    [new Error("a bug in my code"), "error", true],                                  // an unrelated error never claims an outage
  ])("%#", (err, kind, retryable) => {
    const p = classifyConnectionError(err);
    expect(p.kind).toBe(kind); expect(p.retryable).toBe(retryable);
  });

  it("never blames the user's work for an outage", () => {
    expect(classifyConnectionError(new TodayApiError(0, "network", "x")).detail).toMatch(/safe/i);
  });
});

describe("Today when the runtime can't be reached", () => {
  it("explains an unavailable runtime and recovers by itself when it comes back", async () => {
    const c = new MockDataClient();
    const real = c.getToday.bind(c);
    vi.spyOn(c, "getToday").mockRejectedValueOnce(new TodayApiError(0, "network", "Can't reach the runtime."));
    render(<Today client={c} go={() => {}} />);
    expect(await screen.findByText("The runtime isn't responding")).toBeTruthy();
    expect(screen.getByText(/Your work is safe/)).toBeTruthy();
    expect(screen.getByText(/Retrying automatically/)).toBeTruthy();
    vi.spyOn(c, "getToday").mockImplementation(real);                                 // the runtime is back
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();    // no click needed
  });

  it("does not retry (or pretend) when the deployment refuses the sign-in", async () => {
    const c = new MockDataClient();
    const spy = vi.spyOn(c, "getToday").mockRejectedValue(new TodayApiError(401, "error", "nope"));
    render(<Today client={c} go={() => {}} />);
    expect(await screen.findByText("This deployment didn't accept your sign-in")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    const n = spy.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(spy.mock.calls.length).toBe(n);                                            // 401 is not a thing waiting will fix
  });

  it("tells the user when the deployment is too old to have Today", async () => {
    const c = new MockDataClient();
    vi.spyOn(c, "getToday").mockRejectedValue(new TodayApiError(404, "error", "Projects API → 404"));
    render(<Today client={c} go={() => {}} />);
    expect(await screen.findByText("This deployment is out of date")).toBeTruthy();
    expect(screen.getByText(/Update the runtime, then reconnect/)).toBeTruthy();
  });
});

describe("App when the runtime drops AFTER loading", () => {
  it("keeps the last known screen, shows one banner, and clears it when the runtime returns", async () => {
    const c = new MockDataClient();
    render(<App client={c} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    const real = c.getNotifications.bind(c);
    const spy = vi.spyOn(c, "getNotifications").mockRejectedValue(new TodayApiError(0, "network", "Can't reach the runtime."));
    for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
    expect(await screen.findByText(/The runtime isn't responding/)).toBeTruthy();
    expect(screen.getByText("5 things need your decision.")).toBeTruthy();            // the UI did not blank or freeze
    expect(screen.getAllByRole("status").filter((e) => /isn't responding/.test(e.textContent ?? ""))).toHaveLength(1);
    spy.mockImplementation(real);
    fireEvent.click(screen.getByRole("button", { name: "Try now" }));
    await waitFor(() => expect(screen.queryByText(/The runtime isn't responding/)).toBeNull());
  });

  it("does not flash a banner for a single dropped request", async () => {
    const c = new MockDataClient();
    render(<App client={c} />);
    await screen.findByText("5 things need your decision.");
    vi.spyOn(c, "getNotifications").mockRejectedValueOnce(new TodayApiError(0, "network", "blip"));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
    expect(screen.queryByText(/isn't responding/)).toBeNull();
  });
});

describe("HttpDataClient transport", () => {
  it("turns a hung runtime into a timeout instead of an endless spinner", async () => {
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => new Promise((_res, rej) => { init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); }));
    const c = new HttpDataClient("http://127.0.0.1:1");
    const p = c.getToday("customer-ops").catch((e) => e);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    const e = await p;
    expect(e).toBeInstanceOf(TodayApiError); expect(e).toMatchObject({ status: 0, code: "timeout" });
  });

  it("types a refused connection, an HTTP error and a structured error", async () => {
    const c = new HttpDataClient("http://127.0.0.1:1");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(c.getToday("x")).rejects.toMatchObject({ status: 0, code: "network" });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
    await expect(c.getOverview("x")).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ detail: { error: "stale_approval", detail: "changed" } }), { status: 409 })));
    await expect(c.approveToday("x", "i", { payload_digest: "d" })).rejects.toMatchObject({ status: 409, code: "stale_approval", message: "changed" });
  });

  it("keeps the same server-side session across an app restart (localStorage), so state is not lost", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>)["X-Demo-Session"]); return Promise.resolve(new Response("{}", { status: 200 })); });
    await new HttpDataClient("http://x").getToday("p");
    sessionStorage.clear();                                                            // a relaunch loses sessionStorage …
    await new HttpDataClient("http://x").getToday("p");                                // … but not localStorage
    expect(seen).toHaveLength(2); expect(seen[0]).toBeTruthy(); expect(seen[1]).toBe(seen[0]);
  });

  it("still isolates when storage is blocked (a per-load id)", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>)["X-Demo-Session"]); return Promise.resolve(new Response("{}", { status: 200 })); });
    const l = Object.getOwnPropertyDescriptor(window, "localStorage")!, s = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(window, k, { configurable: true, get() { throw new Error("blocked"); } });
    try { await new HttpDataClient("http://x").getToday("p"); expect(seen[0]).toBeTruthy(); }
    finally { Object.defineProperty(window, "localStorage", l); Object.defineProperty(window, "sessionStorage", s); }
  });
});
