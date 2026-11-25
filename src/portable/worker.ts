/// <reference lib="webworker" />
// The dashboards kernel in this browser: WebAssembly Python (Pyodide) with pyyaml and sqlite3, the kernel archive, and a
// directory kept in IndexedDB so that added test results are still there after a reload. Everything is loaded from this
// page's own folder (./pyodide/, ./kernel.zip): nothing is fetched from another site, and nothing is sent anywhere.
export {};
declare const self: DedicatedWorkerGlobalScope;

const say = (text: string) => self.postMessage({ type: "progress", text });
let handle: ((method: string, path: string, query: string, body: string) => string) | null = null;
let fs: any = null;

const sync = (populate: boolean) => new Promise<void>((res) => fs.syncfs(populate, () => res()));      // a failed save must not lose the answer

async function start() {
  const root = new URL("./", self.location.href.replace(/assets\/[^/]*$/, ""));                          // the page's folder, not /assets/
  say("Loading the Python runtime…");
  const { loadPyodide } = await import(/* @vite-ignore */ new URL("pyodide/pyodide.mjs", root).href);
  const py = await loadPyodide({ indexURL: new URL("pyodide/", root).href });
  say("Loading the dashboards…");
  await py.loadPackage(["pyyaml", "sqlite3"]);
  const kernel = await fetch(new URL("kernel.zip", root).href, { cache: "force-cache" });
  if (!kernel.ok) throw new Error("the dashboards kernel archive is missing from this page");
  py.FS.writeFile("/kernel.zip", new Uint8Array(await kernel.arrayBuffer()));
  fs = py.FS;
  fs.mkdirTree("/data");
  let durable = true;
  try { fs.mount(fs.filesystems.IDBFS, {}, "/data"); await sync(true); } catch { durable = false; }      // private windows may refuse IndexedDB
  py.globals.set("DATA_DIR", durable ? "/data" : "");
  py.runPython(`
import sys, json
sys.path.insert(0, "/kernel.zip")
from agentic_os.dashboards.portable import PortableDashboards
_api = PortableDashboards(data_dir=DATA_DIR)
def _handle(method, path, query, body):
    status, out = _api.handle(method, path, json.loads(query), json.loads(body))
    return json.dumps({"status": status, "body": out})
`);
  handle = py.globals.get("_handle");
  self.postMessage({ type: "ready" });
}

const booted = start().catch((e) => { self.postMessage({ type: "fatal", text: `The dashboards could not be started in this browser: ${(e as Error)?.message ?? e}` }); });

self.onmessage = async (ev: MessageEvent) => {
  const { id, method, path, query, body } = ev.data;
  await booted;
  if (!handle) return;
  try {
    const out = JSON.parse(handle(method, path, JSON.stringify(query ?? {}), JSON.stringify(body)));
    if (method !== "GET" && out.status < 300) await sync(false);
    self.postMessage({ id, status: out.status, body: out.body });
  } catch (e) {
    self.postMessage({ id, status: 500, body: { detail: { error: "error", detail: (e as Error)?.message ?? "the dashboards kernel failed" } } });
  }
};
