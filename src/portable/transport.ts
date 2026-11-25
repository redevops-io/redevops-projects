// How the portable dashboards page reaches a dashboards API: over HTTP to a Projects deployment the person names, or to the
// dashboards kernel running in this browser (WebAssembly Python in a worker). Both answer the same paths with the same JSON.
import { TodayApiError } from "../data/mockToday";

export type Query = Record<string, string | number | boolean | undefined>;
export interface Transport {
  kind: "remote" | "standalone";
  label: string;                                                        // what the page shows as "where the numbers come from"
  call<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T>;
  close(): void;
}

function fail(status: number, payload: any, path: string): TodayApiError {
  const d = payload?.detail;
  if (d && typeof d === "object") return new TodayApiError(status, d.error ?? "error", d.detail ?? `Dashboards ${path} answered ${status}`);
  return new TodayApiError(status, "error", `Dashboards ${path} answered ${status}`);
}

function qs(query?: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// A deployment's address: https only, except this machine (a desktop or local install). No credentials, query or fragment in it.
export function normalizeBase(input: string): string {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw new Error("Enter the address of a Projects deployment, for example https://apps.example.com/projects"); }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("The address must start with https:// (http:// is accepted for this machine only): a token must not travel unencrypted.");
  if (u.username || u.password) throw new Error("Do not put a user name or password in the address.");
  return (u.origin + u.pathname).replace(/\/+$/, "");
}

const TIMEOUT_MS = 30_000;

// The token goes in the Authorization header of requests to `base` and nowhere else. `credentials: "omit"`: no cookie of that
// site is ever sent from this page, and none it sets is kept.
export function remoteTransport(base: string, token: string): Transport {
  return {
    kind: "remote", label: new URL(base).host,
    async call<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let r: Response;
      try {
        r = await fetch(base + path + qs(query), {
          method, signal: ctl.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
          headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw new TodayApiError(0, "timeout", "The deployment took too long to answer.");
        throw new TodayApiError(0, "network", "The deployment could not be reached from this page. Check the address, and that the deployment allows this page's origin (PROJECTS_CORS_ORIGINS).");
      } finally { clearTimeout(timer); }
      let payload: any = null;
      try { payload = await r.json(); } catch { /* not JSON */ }
      if (!r.ok) throw fail(r.status, payload, path);
      return payload as T;
    },
    close() { /* nothing is held open */ },
  };
}

// The kernel in a worker. `progress` reports what is being loaded, since the first start downloads about 13 MB.
export function standaloneTransport(progress: (text: string) => void): Transport & { ready: Promise<void> } {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; path: string }>();
  let seq = 0, up!: () => void, down!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { up = res; down = rej; });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.type === "progress") { progress(m.text); return; }
    if (m.type === "ready") { up(); return; }
    if (m.type === "fatal") { const e = new Error(m.text); down(e); for (const w of waiting.values()) w.reject(e); waiting.clear(); return; }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.status >= 200 && m.status < 300) w.resolve(m.body); else w.reject(fail(m.status, m.body, w.path));
  };
  worker.onerror = (ev) => { const e = new Error(ev.message || "The dashboards could not be started in this browser."); down(e); };
  return {
    kind: "standalone", label: "this browser", ready,
    async call<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
      await ready;
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "" && v !== null) clean[k] = String(v);
      return new Promise<T>((resolve, reject) => {
        const id = ++seq;
        waiting.set(id, { resolve, reject, path });
        worker.postMessage({ id, method, path, query: clean, body: body ?? null });
      });
    },
    close() { worker.terminate(); },
  };
}
