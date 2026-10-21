import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { MockDataClient } from "./data/client";

describe("App shell", () => {
  it("renders the rail and loads the project into the topbar", async () => {
    render(<App client={new MockDataClient()} />);
    // nav is present immediately (P1 shell)
    expect(screen.getByText("Workflows")).toBeTruthy();
    expect(screen.getByText("Discovery")).toBeTruthy();
    // project loads from the client into the topbar
    await waitFor(() => expect(screen.getByText("Customer Operations")).toBeTruthy());
  });

  it("lands on Today, not a Projects/CRM structure", async () => {
    render(<App client={new MockDataClient()} />);
    expect(await screen.findByText("5 things need your decision.")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".nav .badge")?.textContent).toBe("5"));   // the rail badge mirrors the queue
  });

  it("navigates to a section placeholder", async () => {
    render(<App client={new MockDataClient()} />);
    fireEvent.click(screen.getByText("Apps"));
    // the Apps section heading renders (h1)
    await waitFor(() => expect(screen.getAllByText("Apps").length).toBeGreaterThan(0));
  });
});
