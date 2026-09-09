import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Apps } from "./Apps";
import { MockDataClient } from "../data/client";

describe("Apps view (P4)", () => {
  it("loads connected apps and connects an available one", async () => {
    render(<Apps client={new MockDataClient()} go={() => {}} />);

    // Connected tab is default — WhatsApp Business is MISSION_READY.
    await waitFor(() => expect(screen.getByText("WhatsApp Business")).toBeTruthy());

    // Switch to the Available tab — Gmail is NOT_CONNECTED.
    fireEvent.click(screen.getByText("Available"));
    await waitFor(() => expect(screen.getByText("Gmail")).toBeTruthy());

    // Open the Gmail card and connect & verify.
    const gmailCard = screen.getByText("Gmail").closest(".appcard") as HTMLElement;
    fireEvent.click(within(gmailCard).getByText("Connect"));
    fireEvent.click(within(gmailCard).getByText("Connect & verify"));

    // Connecting flips Gmail to VERIFIED_READ, moving it into the Connected tab
    // with a just-now verified stamp.
    fireEvent.click(screen.getByText("Connected"));
    await waitFor(() => {
      const card = screen.getByText("Gmail").closest(".appcard") as HTMLElement;
      expect(within(card).getByText("Verified just now")).toBeTruthy();
    });
  });
});
