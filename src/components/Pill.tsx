import type { ReactNode } from "react";
import type { Health } from "../data/types";

export function Pill({ tone, children }: { tone: Health; children: ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
