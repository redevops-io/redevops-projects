import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Discovery } from "./Discovery";
import { MockDataClient } from "../data/client";

describe("Discovery", () => {
  it("lists findings, flags needs-review, and cross-links to affected work", async () => {
    const go = vi.fn();
    render(<Discovery client={new MockDataClient()} go={go} />);

    await waitFor(() => expect(screen.getByText("Stripe refund API behavior changed")).toBeTruthy());

    expect(screen.getByText("Needs review")).toBeTruthy();

    fireEvent.click(screen.getByText("Workflow: Customer Refund Handling"));
    expect(go).toHaveBeenCalledWith("workflows");
  });
});
