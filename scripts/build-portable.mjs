#!/usr/bin/env node
// Build the portable dashboards page: the dashboards UI, the WebAssembly Python runtime and the dashboards kernel in ONE
// folder that needs no server of its own and fetches nothing from another site at run time.
//
//   npm run build:portable [-- --kernel /path/to/dashboards-kernel.zip]
//
// Output: dist-portable/ (open index.html through any static host) and projects-dashboards-portable.tgz with its sha256.
// Everything that is not built here is pinned: Pyodide by npm version (package-lock.json), its two packages by the sha256
// in Pyodide's own lock file, the kernel archive by the sha256 in portable.lock.json. --kernel replaces the download with a
// local file and still checks the sha256 when the lock has one.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-portable");
const lock = JSON.parse(readFileSync(join(root, "portable.lock.json"), "utf8"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ""; };

async function download(url, want, cacheName) {
  const cache = join(root, "node_modules", ".cache", "portable");
  mkdirSync(cache, { recursive: true });
  const file = join(cache, cacheName);
  if (!existsSync(file) || sha(readFileSync(file)) !== want) {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) throw new Error(`${url} answered ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const got = sha(readFileSync(file));
  if (got !== want) throw new Error(`${cacheName}: sha256 ${got} is not the pinned ${want}`);
  return file;
}

execFileSync(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.portable.config.ts"], { cwd: root, stdio: "inherit" });
renameSync(join(out, "portable.html"), join(out, "index.html"));

// the Python runtime, from the pinned npm package
const pyDir = join(root, "node_modules", "pyodide"), pyOut = join(out, "pyodide");
const pyVersion = JSON.parse(readFileSync(join(pyDir, "package.json"), "utf8")).version;
if (pyVersion !== lock.pyodide) throw new Error(`node_modules has pyodide ${pyVersion}, portable.lock.json pins ${lock.pyodide}`);
mkdirSync(pyOut, { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip"]) cpSync(join(pyDir, f), join(pyOut, f));
// its lock file, cut down to the two packages the dashboards use (the page can load nothing else)
const pyLock = JSON.parse(readFileSync(join(pyDir, "pyodide-lock.json"), "utf8"));
const keep = {};
for (const name of ["pyyaml", "sqlite3"]) {
  const p = pyLock.packages[name];
  if (!p || p.depends.length) throw new Error(`unexpected lock entry for ${name}`);
  keep[name] = p;
  cpSync(await download(lock.packages_base + p.file_name, p.sha256, p.file_name), join(pyOut, p.file_name));
}
writeFileSync(join(pyOut, "pyodide-lock.json"), JSON.stringify({ info: pyLock.info, packages: keep }));

// the dashboards kernel archive
const k = lock.kernel, local = arg("--kernel");
let kernelFile;
if (local) kernelFile = resolve(local);
else if (k.version && k.sha256) kernelFile = await download(`https://github.com/${k.repo}/releases/download/${k.version}/${k.asset}`, k.sha256, `${k.version}-${k.asset}`);
else throw new Error("portable.lock.json pins no kernel archive yet: pass --kernel <dashboards-kernel.zip>");
const kernelSha = sha(readFileSync(kernelFile));
if (k.sha256 && kernelSha !== k.sha256) throw new Error(`kernel archive sha256 ${kernelSha} is not the pinned ${k.sha256}`);
cpSync(kernelFile, join(out, "kernel.zip"));

const tgz = join(root, "projects-dashboards-portable.tgz");
// what is in the folder, for whoever hosts it
const files = {};
const walk = (dir, rel = "") => { for (const n of readdirSync(dir).sort()) { const p = join(dir, n), r = rel ? `${rel}/${n}` : n; if (statSync(p).isDirectory()) walk(p, r); else files[r] = { bytes: statSync(p).size, sha256: sha(readFileSync(p)) }; } };
walk(out);
const ui = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
writeFileSync(join(out, "portable-manifest.json"), JSON.stringify({ ui, pyodide: pyVersion, kernel: { version: k.version || "local", sha256: kernelSha }, files }, null, 1));

// reproducible archive written here (ustar + gzip), so the result does not depend on which tar the machine has
function tarball(entries) {
  const blocks = [];
  for (const [name, data] of entries) {
    if (Buffer.byteLength(name) > 99) throw new Error(`path too long for the archive: ${name}`);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, "utf8");
    h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
    h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);                                       // mtime 0: the content decides the digest, not the clock
    h.write("        ", 148); h.write("0", 156); h.write("ustar\0" + "00", 257);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}
walk(out);                                                                 // again: now with the manifest
writeFileSync(tgz, tarball(Object.keys(files).sort().map((r) => [r, readFileSync(join(out, r))])));
const total = Object.values(files).reduce((n, f) => n + f.bytes, 0);
console.log(JSON.stringify({ folder: "dist-portable", files: Object.keys(files).length, bytes: total, archive: "projects-dashboards-portable.tgz", archive_bytes: statSync(tgz).size, sha256: sha(readFileSync(tgz)), kernel: kernelSha }));
