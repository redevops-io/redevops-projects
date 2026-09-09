import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Attention } from "./Attention";
import { MockDataClient } from "../data/client";

describe("Attention (P3 cross-Runtime queue)", () => {
  it("loads and groups AttentionItems, routing actions via go()", async () => {
    const go = vi.fn();
    render(<Attention client={new MockDataClient()} go={go} />);

    // items load from the client
    await waitFor(() => expect(screen.getByText("Approve refund · $129")).toBeTruthy());

    // the approvals group header renders
    expect(screen.getByText(/Approvals/)).toBeTruthy();

    // clicking the reconnect item's primary action routes to Apps
    fireEvent.click(screen.getByText("Connect"));
    expect(go).toHaveBeenCalledWith("apps");
  });
});
