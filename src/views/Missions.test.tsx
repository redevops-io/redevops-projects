import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Missions } from "./Missions";
import { MockDataClient } from "../data/client";

describe("Missions", () => {
  it("lists missions and opens the detail on click", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);

    await waitFor(() => expect(screen.getByText("Refund Sarah Chen")).toBeTruthy());

    fireEvent.click(screen.getByText("Refund Sarah Chen"));

    await waitFor(() => expect(screen.getByText("Refund approval")).toBeTruthy());
    expect(screen.getByText("Approve")).toBeTruthy();
  });

  it("filters by state via the tab row", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Refund Sarah Chen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("Deploy release 2.4")).toBeTruthy();
    expect(screen.queryByText("Refund Sarah Chen")).toBeNull();
  });
});
