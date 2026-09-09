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

  it("renders query vs file evidence with the Context-Plan why on the detail", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Refund Sarah Chen")).toBeTruthy());
    fireEvent.click(screen.getByText("Refund Sarah Chen"));

    // query evidence shows records-retrieved (not just "Postgres ✓"); file evidence its version
    await waitFor(() => expect(screen.getByText(/3 records retrieved/)).toBeTruthy());
    expect(screen.getByText(/Refund Policy\.pdf/)).toBeTruthy();
    // the "why" (Context Plan) is surfaced, and an action carries its provider
    expect(screen.getByText(/scoped SQL against the live source/)).toBeTruthy();
    expect(screen.getByText(/billing\.refund\.execute/)).toBeTruthy();
  });

  it("filters by state via the tab row", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Refund Sarah Chen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("Deploy release 2.4")).toBeTruthy();
    expect(screen.queryByText("Refund Sarah Chen")).toBeNull();
  });
});
