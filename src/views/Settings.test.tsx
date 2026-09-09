import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Settings } from "./Settings";
import { MockDataClient } from "../data/client";

describe("Settings (project-level durable configuration)", () => {
  it("shows General by default and switches to Security", () => {
    render(<Settings client={new MockDataClient()} go={() => {}} />);

    // General tab content is shown first
    expect(screen.getByText("Customer Operations")).toBeTruthy();

    // switching to Security reveals the credential broker row
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Credential broker")).toBeTruthy();
  });
});
