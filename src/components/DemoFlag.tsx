import type { ReactNode } from "react";
import { useDataBasis } from "../hooks/basis";

// The footnote every view carried as a hard-coded "example data via the mock Projects API client". It is now truthful
// for what is actually behind the screen, says plainly that nothing is executed, and disappears on a live deployment.
export function DemoFlag({ children }: { children?: ReactNode }) {
  const basis = useDataBasis();
  if (basis === "live") return null;
  const where = basis === "mock" ? "built-in example data" : "synthetic sample data";
  return <div className="demoflag">{children} {children ? "— " : ""}Shown with {where}: nothing here is connected to a real system, sent or run.</div>;
}

// The slim banner at the top of every screen (Today carries its own, under its heading).
export function DemoBanner() {
  const basis = useDataBasis();
  if (basis === "live" || basis === "unknown") return null;
  return (
    <div className="demobar" role="note">
      <strong>{basis === "mock" ? "Preview with example data." : "Public demo with synthetic sample data."}</strong>{" "}
      <span>Actions are simulated; nothing is connected to a real system, sent or executed.</span>
    </div>
  );
}
