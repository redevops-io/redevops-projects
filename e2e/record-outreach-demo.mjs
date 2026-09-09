import { chromium } from "playwright";
const BASE = process.env.DEMO_BASE || "http://localhost:4173";
const OUT = process.env.DEMO_OUT || "./demo-video";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const rail = page.locator(".rail");
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("What's happening", { exact: false }).waitFor();
await wait(1800);

// 1. Sidekick → Mission templates: the outreach Mission is offered
await rail.getByText("Sidekick", { exact: true }).click();
await wait(700);
await page.getByRole("button", { name: "Mission templates" }).click();
await page.getByText("Run cold outreach for the agentic-apps stack").waitFor();
await wait(2200);

// 2. Missions → open the Outreach Mission
await rail.getByText("Missions", { exact: true }).click();
await wait(700);
await page.getByText("Tasha at Nutrients.tech", { exact: false }).first().click();
await page.getByText(/PROVIDER_UI_REQUIRED/).waitFor();
await wait(1500);

// 3. Show the synthesized copy + generated hero asset
await page.getByAltText("Generated hero asset").scrollIntoViewIfNeeded();
await wait(2500);

// 4. The consequential boundary → a human activates → Mission resumes → delivered
await page.getByText(/PROVIDER_UI_REQUIRED/).scrollIntoViewIfNeeded();
await wait(1200);
await page.getByRole("button", { name: "Activate in provider UI" }).click();
await page.getByText(/ExecutionReceipt issued/).waitFor();
await wait(2500);

await ctx.close();  // flush the video
await browser.close();
console.log("done");
