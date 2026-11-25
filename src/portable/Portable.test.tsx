// The portable dashboards page: where a token may be sent, what the standalone mode says it cannot do, and that the view
// renders from a transport instead of a server of its own.
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PortableApp } from "./PortableApp";
import { PortableClient } from "./client";
import { normalizeBase, remoteTransport, type Transport } from "./transport";

describe("the address of a deployment", () => {
  it("is https, or this machine", () => {
    expect(normalizeBase(" https://apps.example.com/projects/ ")).toBe("https://apps.example.com/projects");
    expect(normalizeBase("http://localhost:8090")).toBe("http://localhost:8090");
    expect(normalizeBase("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
    expect(() => normalizeBase("http://apps.example.com/projects")).toThrow(/https/);   // a token must not travel unencrypted
    expect(() => normalizeBase("https://user:pw@apps.example.com")).toThrow(/user name or password/);
    expect(() => normalizeBase("apps.example.com")).toThrow(/address of a Projects deployment/);
    expect(normalizeBase("https://apps.example.com/projects?x=1#y")).toBe("https://apps.example.com/projects");   // nothing else of the input is kept
  });
});

describe("a remote deployment", () => {
  it("gets the token in the Authorization header, with no cookies, and only at that address", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ dashboards: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await new PortableClient(remoteTransport("https://apps.example.com/projects", "tok-123")).getDashboard("qa", { days: 7, project: "p" } as any);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://apps.example.com/projects/api/dashboards/qa?days=7&project=p");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    expect(init.credentials).toBe("omit"); expect(init.redirect).toBe("error"); expect(url).not.toContain("tok-123");
    vi.unstubAllGlobals();
  });
  it("reports a refused token as a refused token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: { error: "unauthenticated", detail: "sign in to use this deployment" } }), { status: 401 })));
    await expect(new PortableClient(remoteTransport("https://apps.example.com", "bad")).getDashboardCatalog()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    vi.unstubAllGlobals();
  });
});

describe("the page before anything is connected", () => {
  it("offers both ways and says what the browser-only way cannot show, and why", () => {
    render(<PortableApp />);
    expect(screen.getByRole("heading", { name: "Connect to a Projects deployment" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Work in this browser" })).toBeTruthy();
    expect(screen.getByText(/a credential is never placed in a web page/)).toBeTruthy();
    expect((screen.getByLabelText("Access token") as HTMLInputElement).type).toBe("password");
  });
  it("refuses an unencrypted address before any request is made", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<PortableApp />);
    fireEvent.change(screen.getAllByLabelText("Address of the deployment")[0], { target: { value: "http://apps.example.com" } });
    fireEvent.change(screen.getAllByLabelText("Access token")[0], { target: { value: "tok" } });
    fireEvent.submit(screen.getAllByRole("button", { name: "Connect" })[0].closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/https/));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("the client", () => {
  it("sends every dashboards call through the transport and runs no product action from the page", async () => {
    const calls: string[] = [];
    const t: Transport = { kind: "standalone", label: "this browser", close() {}, async call(method: string, path: string) { calls.push(`${method} ${path}`); return { views: [] } as any; } };
    const c = new PortableClient(t);
    await c.getDashboardCatalog(); await c.getDashboardDrill("qa", "k"); await c.listDashboardViews("qa"); await c.about();
    expect(calls).toEqual(["GET /api/dashboards", "GET /api/dashboards/qa/drill", "GET /api/dashboards/views", "GET /api/dashboards/_portable"]);
    await expect(c.runDashboardAction({ kind: "product" } as any)).rejects.toMatchObject({ status: 501 });
  });
});
