// Browser-level acceptance for the Phase 9 gateway cards + Sidekick handoff (mock mode).
// Usage: node e2e/accept-gateway-cards.mjs http://localhost:4173
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:4173";

const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); };

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(URL, { waitUntil: "networkidle" });

// 1. Inspection card renders the projection
await p.getByRole("button", { name: /Inspection/ }).click();
await p.getByText("Findings").first().waitFor({ timeout: 5000 });
ok(await p.getByText("Deployment Inspection").first().isVisible(), "Inspection card heading");
ok(await p.getByText(/Remediation:/).first().isVisible(), "boundary (live inspection / simulated remediation) shown");
ok(await p.getByText("Governed remediation").first().isVisible(), "governed remediation card");
ok(await p.getByText("verified").first().isVisible(), "verification rendered verbatim");

// 2. Social card: provider boundary + UNKNOWN survives
await p.getByRole("button", { name: /Social/ }).click();
await p.getByText("Providers").first().waitFor({ timeout: 5000 });
ok(await p.getByText("Reddit").first().isVisible(), "Reddit source");
ok(await p.getByText(/UNAVAILABLE/).first().isVisible(), "Meta/Muse UNAVAILABLE rendered");
ok(await p.getByText("Intent unknown").first().isVisible(), "UNKNOWN intent survives to the screen");

// 3. Sidekick resolves the goal and navigates to the Mission
await p.keyboard.press("Control+k");
const input = p.getByPlaceholder(/Tell Sidekick/);
await input.waitFor({ timeout: 5000 });
await input.fill("Inspect current ReDevOps demo deployments");
await input.press("Enter");
await p.getByRole("button", { name: "Open inspection" }).click({ timeout: 5000 });
// after navigate the Inspection card is shown again
await p.getByText("Deployment Inspection").first().waitFor({ timeout: 5000 });
ok(await p.getByText("Findings").first().isVisible(), "Sidekick handoff navigated to the Inspection Mission");

await b.close();
console.log(process.exitCode ? "ACCEPTANCE FAILED" : "ACCEPTANCE PASSED");
