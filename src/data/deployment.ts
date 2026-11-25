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
  Object.assign(deployment, { projectId: "customer-ops", projectName: "Customer Operations", sample: true });
}
