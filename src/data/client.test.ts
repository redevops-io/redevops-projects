import { describe, expect, it } from "vitest";
import { MockDataClient, scriptedReply, type DataClient } from "./client";

describe("MockDataClient", () => {
  const c: DataClient = new MockDataClient();

  it("serves a composed overview projection", async () => {
    const ov = await c.getOverview("customer-ops");
    expect(ov.project.name).toBe("Customer Operations");
    expect(ov.missions.length).toBeGreaterThan(0);
    expect(ov.apps.some((a) => a.provider === "slack")).toBe(true);
    // every projection carries provenance for drill-down
    expect(ov.missions[0].source_runtime).toBe("mission");
  });

  it("exposes each section list", async () => {
    expect((await c.getWorkflows("p")).length).toBe(3);
    expect((await c.getAttention("p"))[0].kind).toBe("approval");
    expect((await c.getDiscovery("p"))[0].needsReview).toBe(true);
    expect((await c.getActivity("p")).length).toBeGreaterThan(0);
  });
});

describe("scriptedReply honours the Sidekick context contract", () => {
  it("resolves 'this' to the context object", () => {
    const r = scriptedReply(
      { projectId: "p", section: "Workflows", objectRef: "Customer Refund Handling" },
      "make this require two approvers above $500",
    );
    expect(r.text).toContain("Customer Refund Handling");
    expect(r.actions?.[0].kind).toBe("commit");
  });

  it("explains why a refund needs approval", () => {
    const r = scriptedReply({ projectId: "p", section: "Missions" }, "why does this need approval?");
    expect(r.text.toLowerCase()).toContain("tier-4");
  });
});
