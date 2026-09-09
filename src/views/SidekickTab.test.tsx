import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SidekickTab } from "./SidekickTab";
import { MockDataClient } from "../data/client";
import type { SidekickContext } from "../data/types";

const CTX: SidekickContext = { projectId: "customer-ops", section: "Sidekick" };

describe("SidekickTab (doc §2)", () => {
  it("surfaces mission templates with a not-ready dependency", async () => {
    render(<SidekickTab client={new MockDataClient()} go={() => {}} ctx={CTX} />);

    fireEvent.click(screen.getByRole("button", { name: "Mission templates" }));

    // The refunds template goal renders.
    await waitFor(() => expect(screen.getByText("Handle customer refunds")).toBeTruthy());

    // The prospecting template surfaces Gmail as a not-ready dependency (Connect button).
    expect(screen.getByRole("button", { name: "Connect Gmail" })).toBeTruthy();
  });

  it("sends a chat message and renders the scripted reply", async () => {
    render(<SidekickTab client={new MockDataClient()} go={() => {}} ctx={CTX} />);

    const box = screen.getByLabelText("Ask Sidekick");
    fireEvent.change(box, { target: { value: "why does this need approval?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // The MockDataClient's scriptedReply routes this to the tier-4 explanation.
    expect(await screen.findByText(/tier-4/)).toBeTruthy();
  });
});
