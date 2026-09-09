import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Workflows } from "./Workflows";
import { MockDataClient } from "../data/client";

describe("Workflows", () => {
  it("lists patterns, opens the detail, and shows a capability in the Steps tab", async () => {
    render(<Workflows client={new MockDataClient()} go={() => {}} />);

    await waitFor(() => expect(screen.getByText("Customer Refund Handling")).toBeTruthy());

    // open the refund workflow's detail
    const row = screen.getByText("Customer Refund Handling").closest(".row") as HTMLElement;
    fireEvent.click(within(row).getByText("Open"));

    // detail tabs render
    await waitFor(() => expect(screen.getByText("Policy")).toBeTruthy());

    // Steps tab surfaces the capability string
    fireEvent.click(screen.getByText("Steps"));
    await waitFor(() => expect(screen.getByText("billing.refund.execute")).toBeTruthy());
  });
});
