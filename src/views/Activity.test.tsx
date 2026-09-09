import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Activity } from "./Activity";
import { MockDataClient } from "../data/client";

describe("Activity (P8 event ledger)", () => {
  it("loads events and filters by source Runtime", async () => {
    render(<Activity client={new MockDataClient()} go={() => {}} />);

    // events load from the client
    await waitFor(() => expect(screen.getByText(/requested approval/)).toBeTruthy());

    // filtering to Discovery keeps discovery events, hides governance-only ones
    fireEvent.click(screen.getByRole("button", { name: "Discovery" }));

    expect(screen.getByText(/Discovery linked customer evidence/)).toBeTruthy();
    expect(screen.queryByText(/requested approval/)).toBeNull();
  });
});
