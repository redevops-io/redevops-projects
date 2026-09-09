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

  it("shows the outreach Mission's provider-UI gate, hero asset, and resumes on activate", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Outreach — Tasha at Nutrients.tech")).toBeTruthy());
    fireEvent.click(screen.getByText("Outreach — Tasha at Nutrients.tech"));

    // the activation boundary is shown as provider-UI-required, and the hero asset renders
    await waitFor(() => expect(screen.getByText(/PROVIDER_UI_REQUIRED/)).toBeTruthy());
    expect((screen.getByAltText("Generated hero asset") as HTMLImageElement).getAttribute("src")).toBe("/hero.jpg");

    // a human flips the sequence on → Mission resumes → delivered
    fireEvent.click(screen.getByRole("button", { name: "Activate in provider UI" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Activate in provider UI" })).toBeNull());
    expect(screen.getByText(/ExecutionReceipt issued/)).toBeTruthy();
  });

  it("filters by state via the tab row", async () => {
    render(<Missions client={new MockDataClient()} go={() => {}} />);
    await waitFor(() => expect(screen.getByText("Refund Sarah Chen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("Deploy release 2.4")).toBeTruthy();
    expect(screen.queryByText("Refund Sarah Chen")).toBeNull();
  });
});
