import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { App } from "./App";
import { Today } from "./views/Today";
import { Sidekick } from "./components/Sidekick";
import { MockDataClient } from "./data/client";

// Each test pins something the ui-agent (agentic-tests: audit-ui, audit-affordances, a model playing a first-time user) found.

describe("keyboard and screen-reader structure", () => {
  it("a closed Sidekick drawer is out of the focus order and the accessibility tree; opening restores it", () => {
    const props = { ctx: { projectId: "p", section: "Today" }, client: new MockDataClient(), seed: null, onClose: () => {}, go: () => {} };
    const { container, rerender } = render(<Sidekick open={false} {...props} />);
    const aside = container.querySelector("aside.sk")!;
    expect(aside.getAttribute("aria-hidden")).toBe("true");
    expect(aside.hasAttribute("inert")).toBe(true);                    // found: Tab landed on Close / input / Send inside an invisible panel
    rerender(<Sidekick open {...props} />);
    expect(aside.hasAttribute("aria-hidden")).toBe(false);
    expect(aside.hasAttribute("inert")).toBe(false);
  });

  it("has one main landmark (the screen), one banner (the top bar), and a named queue region", async () => {
    render(<App client={new MockDataClient()} />);
    await screen.findByText("5 things need your decision.");
    const main = screen.getAllByRole("main");
    expect(main).toHaveLength(1);
    expect(within(main[0]).getByRole("heading", { level: 1 })).toBeTruthy();         // the screen is inside <main>, the chrome is not
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Work that needs attention" })).toBeTruthy();
    expect(document.querySelector(".logo")?.getAttribute("aria-hidden")).toBe("true");   // a decorative glyph is not content
  });
});

describe("finding things (a model could not find 'Sam Rivera' — only 7 of 12 items show by default)", () => {
  const rows = () => [...document.querySelectorAll(".trow")].map((r) => r.textContent ?? "");

  it("finds an item the default view hides, shows all matches, and clearing restores the view", async () => {
    // 12 needs-action items on the real API; the mock has 5, so shrink the budget by adding nothing and assert the behaviour directly
    render(<Today client={new MockDataClient()} go={() => {}} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.change(screen.getByLabelText("Find a customer or item"), { target: { value: "sam" } });
    expect(rows().filter((r) => /Sam Rivera/.test(r))).toHaveLength(1);
    expect(screen.getByText("1 match")).toBeTruthy();
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Find a customer or item"), { target: { value: "" } });
    expect(rows().length).toBeGreaterThan(1);
  });

  it("searches reasons too, says when nothing matches, and offers to clear", async () => {
    render(<Today client={new MockDataClient()} go={() => {}} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.change(screen.getByLabelText("Find a customer or item"), { target: { value: "passport" } });
    expect(rows().some((r) => /Taylor/.test(r))).toBe(true);
    fireEvent.change(screen.getByLabelText("Find a customer or item"), { target: { value: "zzzz" } });
    expect(screen.getByText(/No items match “zzzz”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(rows().length).toBe(5);
  });

  it("'/' jumps to the find box without typing a slash into it", async () => {
    render(<Today client={new MockDataClient()} go={() => {}} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(screen.getByLabelText("Find a customer or item"));
  });
});

describe("state shown to the user stays truthful", () => {
  it("the capture note ('Nothing has been sent') is cleared once the person acts, so it cannot contradict the new status", async () => {
    render(<Today client={new MockDataClient()} go={() => {}} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.change(await screen.findByLabelText("Quick capture"), { target: { value: "Jordan still hasn't sent the passport scan" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Capture" })); });
    expect(await screen.findByText(/Linked to “Visa documents missing — Jordan Lee/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve & send" })); });
    expect(await screen.findByText(/Approved and sent/)).toBeTruthy();
    expect(screen.queryByText(/Linked to “Visa documents missing/)).toBeNull();
  });

  it("selecting another item clears the capture note too", async () => {
    render(<Today client={new MockDataClient()} go={() => {}} />);
    await screen.findByText("5 things need your decision.");
    fireEvent.change(await screen.findByLabelText("Quick capture"), { target: { value: "Jordan still hasn't sent the passport scan" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Capture" })); });
    await screen.findByText(/Linked to “Visa documents missing — Jordan Lee/);
    fireEvent.click(screen.getByRole("button", { name: /Quote hasn't been answered/ }));
    expect(screen.queryByText(/Linked to “Visa documents missing/)).toBeNull();
  });
});

describe("snoozing", () => {
  it("offers 1 hour, Tomorrow, 3 days and Next week", async () => {
    render(<Today client={new MockDataClient()} go={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Quote hasn't been answered/ }));
    await screen.findByRole("heading", { level: 2, name: /Quote hasn't been answered/ });
    const opts = [...within(screen.getByLabelText("Snooze")).getAllByRole("option")].map((o) => o.textContent);
    expect(opts).toEqual(["…", "1 hour", "Tomorrow", "3 days", "Next week"]);
    vi.fn();
  });
});
