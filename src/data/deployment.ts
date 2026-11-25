// What this UI is talking to: which project, and whether the deployment serves demo fixtures.
//
// A real (production) deployment serves no sample data, so the illustrative content some screens carry — example runs,
// example app chains, example prompts that name a demo mission — must not appear there: next to real records it reads as
// real. The server says which it is (`sample` on /api/projects); the mock client and an evaluation server are sample
// deployments. Set once by the app shell before any screen is shown; screens read it when they render or fetch.
export interface Deployment { projectId: string; projectName: string; sample: boolean }

export const deployment: Deployment = { projectId: "customer-ops", projectName: "Customer Operations", sample: true };

export function setDeployment(d: Partial<Deployment>): void {
  Object.assign(deployment, d);
}

export function resetDeployment(): void {
  try { localStorage.removeItem("redevops.deployment.v1"); } catch { /* nothing to clear */ }
  Object.assign(deployment, { projectId: "customer-ops", projectName: "Customer Operations", sample: true });
}

// The last answer this browser got from THIS origin, so a returning visit does not wait for the server before drawing: the
// shell starts from it and corrects itself when the fresh answer arrives. Only the three descriptor fields are stored.
const KEY = "redevops.deployment.v1";

export function rememberDeployment(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ projectId: deployment.projectId, projectName: deployment.projectName, sample: deployment.sample })); } catch { /* storage may be unavailable */ }
}

/** Restores the remembered descriptor; false when there is none (a first visit). */
export function recallDeployment(): boolean {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && typeof d.projectId === "string" && typeof d.projectName === "string" && typeof d.sample === "boolean") { setDeployment(d); return true; }
  } catch { /* unreadable: treated as a first visit */ }
  return false;
}
