import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Sources } from "./Sources";
import { MockDataClient } from "../data/client";

describe("Sources view (evidence plane)", () => {
  it("shows connected sources, context grants, and the Local files add flow", async () => {
    render(<Sources client={new MockDataClient()} go={() => {}} />);

    // Connected tab is default — the CRM database source is listed.
    await waitFor(() => expect(screen.getByText("CRM database")).toBeTruthy());

    // Permissions tab exposes the CONTEXT grant, including a DENY chip for billing.card_data.
    // ("Permissions" also appears as a per-card button; the tab is the first match.)
    fireEvent.click(screen.getAllByText("Permissions")[0]);
    await waitFor(() => expect(screen.getByText(/billing\.card_data/)).toBeTruthy());

    // Add source → Local files reveals the [Connect & scan] control.
    fireEvent.click(screen.getByText("Add source"));
    fireEvent.click(screen.getByText("Local files"));
    await waitFor(() => expect(screen.getByText("Connect & scan")).toBeTruthy());
  });

  it("wires the Database add-source form through connect-securely → discover", async () => {
    render(<Sources client={new MockDataClient()} go={() => {}} />);
    fireEvent.click(await screen.findByText("Add source"));
    fireEvent.click(screen.getByText("Database"));
    // credential goes to the broker first (no pasting into a shared field)…
    fireEvent.click(screen.getByRole("button", { name: "Connect securely" }));
    // …then discovery runs read-only and reports the catalog.
    fireEvent.click(await screen.findByRole("button", { name: /Verify & discover/ }));
    await waitFor(() => expect(screen.getByText(/Connected read-only/)).toBeTruthy());
  });
});
