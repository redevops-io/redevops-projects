// Live acceptance of the Dashboards section against a running Projects deployment (real connected products).
//   node e2e/accept-dashboards.mjs <base-url> [out-dir]
// It checks, in a real browser at desktop and phone widths, that every number on screen is the number the API
// returns, that a number's drill-down lists exactly that many records, that filters narrow the data, that a saved
// view survives a reload, and that nothing overflows the window. Hooks let the caller stop/start a product and
// restart the server between phases:  DASH_HOOK_OUTAGE / DASH_HOOK_RECOVER / DASH_HOOK_RESTART (shell commands).
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const out = process.argv[3] || "e2e-out";
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const api = async (path) => (await fetch(base + path)).json();
const hook = (name) => { const cmd = process.env[name]; if (!cmd) return false; execSync(cmd, { stdio: "ignore", shell: "/bin/sh" }); return true; };
const fmt = (v, unit) => {
  const abs = Math.abs(v);
  const n = abs >= 1e6 ? `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e4 ? `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: abs < 10 && !Number.isInteger(v) ? 2 : 1 }).format(v);
  return unit === "%" ? `${n}%` : /^[A-Z]{3}$/.test(unit) ? `${unit} ${n}` : unit ? `${n} ${unit}` : n;
};

const SUMS = /^(tokens|emails|subscribers|visitors|pageviews|skipped)/;   // tiles that add up a field of their records
const browser = await chromium.launch();
const errors = [];
async function open(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}
async function show(page, id, query = "") {
  await page.goto(`${base}/#/dashboards/${id}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".dash-grid .panel", { timeout: 60000 });
}

const catalog = await api("/api/dashboards");
check("the catalog offers at least the four P0 dashboards", ["portfolio", "qa", "security", "missions"].every((d) => catalog.dashboards.some((x) => x.id === d)), catalog.dashboards.map((d) => d.id).join(","));
check("more than one project is in the portfolio", catalog.projects.length > 1, `${catalog.projects.length} projects`);

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const { ctx, page } = await open(viewport);
  for (const d of catalog.dashboards) {
    await show(page, d.id);
    const dash = await api(`/api/dashboards/${d.id}`);
    // every stat tile shows the API's value (or "Not known" when the API says null)
    let bad = [];
    for (const p of dash.panels.filter((x) => x.kind === "stats")) for (const m of p.metrics) {
      const tile = page.locator(`[data-panel="${p.id}"] .stat`, { has: page.locator(".lbl", { hasText: new RegExp(`^${m.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).first();
      const shown = (await tile.locator(".val").innerText()).trim();
      const want = m.value === null ? "Not known" : fmt(m.value, m.unit);
      if (shown !== want) bad.push(`${m.id}: shown ${shown}, api ${want}`);
    }
    check(`${label} · ${d.id}: every tile equals the API value`, bad.length === 0, bad.join("; "));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${label} · ${d.id}: fits the window`, overflow <= 0, `overflow ${overflow}px`);
    await page.screenshot({ path: `${out}/${label}-${d.id}.png`, fullPage: true });
  }
  await ctx.close();
}

// drill-down: the list behind a number has exactly that many records, each with the system's own reference
{
  const { ctx, page } = await open({ width: 1440, height: 900 });
  for (const d of catalog.dashboards) {
    const dash = await api(`/api/dashboards/${d.id}`);
    const m = dash.panels.flatMap((p) => p.metrics.map((x) => [p, x])).find(([, x]) => x.drill && x.value && x.unit === "" && x.value <= 200 && !SUMS.test(x.id));   // a count of records, not a sum over them
    if (!m) continue;
    await show(page, d.id);
    await page.locator(`[data-panel="${m[0].id}"] button.stat`, { has: page.locator(".lbl", { hasText: m[1].label }) }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator(".dsum").waitFor();
    const total = Number((await dlg.locator(".dsum b").innerText()).trim());
    const rows = await dlg.locator("tbody tr").count();
    const drill = await api(`/api/dashboards/${d.id}/drill?key=${encodeURIComponent(m[1].drill)}`);
    check(`${d.id}: "${m[1].label}" = ${m[1].value} and its drill-down lists ${total} record(s)`, total === m[1].value && rows === Math.min(total, 200) && drill.total === total);
    check(`${d.id}: each record names its source reference`, drill.records.every((r) => r.ref && r.source), drill.records[0]?.ref);
    check(`${d.id}: the drill-down offers Sidekick and a governed next step`, (await dlg.getByRole("button", { name: "Ask Sidekick about this" }).count()) === 1 && drill.actions.length >= 2, drill.actions.map((a) => a.label).join(" | "));
    if (d.id === "qa") {
      await dlg.getByRole("button", { name: "Ask Sidekick about this" }).click();
      const reply = page.locator("aside.sk .msg.sk").last();
      await page.waitForFunction(() => document.querySelectorAll("aside.sk .msg.sk").length >= 2, null, { timeout: 30000 });
      const text = await reply.innerText();
      check("qa: Sidekick answers from the evidence behind the number", /Sources:/.test(text) && text.includes(String(m[1].value)), text.slice(0, 160));
      await page.locator("aside.sk").getByRole("button", { name: "Close" }).click();
    }
    await page.screenshot({ path: `${out}/drill-${d.id}.png` });
  }
  await ctx.close();
}

// filters + saved view persistence
{
  // a single-owner deployment shares its views across browsers: clear what an earlier, interrupted run left behind
  for (const v of (await api("/api/dashboards/views")).views ?? []) if (v.name === "Acceptance view") await fetch(`${base}/api/dashboards/views/${v.id}`, { method: "DELETE" });
  const { ctx, page } = await open({ width: 1440, height: 900 });
  page.on("dialog", (dlg) => dlg.accept("Acceptance view"));
  await show(page, "qa");
  const proj = catalog.projects.find((p) => p.id !== "") ;
  const all = await api("/api/dashboards/qa"), one = await api(`/api/dashboards/qa?project=${proj.id}`);
  const planned = (d) => d.panels[0].metrics.find((m) => m.id === "planned").value;
  await page.getByLabel("Project", { exact: true }).selectOption(proj.id);
  await page.waitForFunction((n) => document.querySelector('[data-panel="summary"] .stat .val')?.textContent?.trim() === n, fmt(planned(one), ""), { timeout: 30000 });
  check(`filter by project narrows Planned tests from ${planned(all)} to ${planned(one)}`, planned(one) <= planned(all));
  await page.getByLabel("Range", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.locator('[data-panel="history"]').getByRole("button", { name: "Hide" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByRole("button", { name: "Make default" }).click();
  await page.getByRole("button", { name: "Unset default" }).waitFor();
  const restarted = hook("DASH_HOOK_RESTART");
  if (restarted) await new Promise((r) => setTimeout(r, 6000));
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("redevops.dash.")) localStorage.removeItem(k); });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".dash-grid .panel");
  await page.waitForFunction(() => /Acceptance view/.test(document.querySelector('select[aria-label="Saved view"]')?.selectedOptions[0]?.textContent || ""), null, { timeout: 30000 });
  check(`a saved default view comes back after a reload${restarted ? " and a server restart" : ""}`,
    (await page.getByLabel("Project", { exact: true }).inputValue()) === proj.id && (await page.getByLabel("Range", { exact: true }).inputValue()) === "7" && (await page.locator('[data-panel="history"]').count()) === 0);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => !/Acceptance view/.test(document.querySelector('select[aria-label="Saved view"]')?.textContent || ""));
  check("the view can be deleted", !((await api("/api/dashboards/views")).views ?? []).some((v) => v.name === "Acceptance view"));
  await ctx.close();
}

// a real outage: numbers become "Not known", never zero; they return when the product does
if (process.env.DASH_HOOK_OUTAGE) {
  const { ctx, page } = await open({ width: 1440, height: 900 });
  const before = await api("/api/dashboards/security");
  hook("DASH_HOOK_OUTAGE");
  await new Promise((r) => setTimeout(r, 20000));                  // past the product health interval
  await show(page, "security");
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.waitForFunction(() => /not answering|Not known/.test(document.querySelector(".content.dash")?.textContent || ""), null, { timeout: 60000 }).catch(() => {});
  const text = await page.locator(".content.dash").innerText();
  const down = await api("/api/dashboards/security?fresh=true");
  const m = down.panels.flatMap((p) => p.metrics)[0];
  check("outage: the API reports the number as unknown with the reason", m.value === null && m.unknown === "source_unavailable" && down.sources[0].state === "unavailable", `${m.label}: ${m.value} (${m.unknown}); was ${before.panels[0].metrics[0].value}`);
  check("outage: the screen says Not known and names the source that is not answering", /Not known/.test(text) && /not answering/.test(text));
  await page.screenshot({ path: `${out}/outage-security.png`, fullPage: true });
  const port = await api("/api/dashboards/portfolio?fresh=true");
  const crit = port.panels[0].metrics.find((x) => x.id === "critical");
  check("outage: the portfolio does not claim zero critical findings", crit.value === null, `critical = ${crit.value}`);
  hook("DASH_HOOK_RECOVER");
  let back = null;
  for (let i = 0; i < 30 && !(back && back.panels[0].metrics[0].value !== null); i++) { await new Promise((r) => setTimeout(r, 4000)); back = await api("/api/dashboards/security?fresh=true"); }
  check("recovery: the numbers return once the product answers again", back.panels[0].metrics[0].value === before.panels[0].metrics[0].value, `${back.panels[0].metrics[0].value}`);
  await ctx.close();
}

check("no page error or console error in any phase", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
