import type { ConnectionProblem } from "../data/client";

// The two non-data states of any view: still loading, or failed (with the reason and, when waiting could help, a retry).
export function Loading({ what = "Loading…" }: { what?: string }) {
  return <section className="content"><div className="placeholder" role="status">{what}</div></section>;
}

export function LoadError({ problem, onRetry, what }: { problem: ConnectionProblem; onRetry: () => void; what?: string }) {
  const generic = problem.kind === "error";
  // A 404 on a non-Today view means this deployment doesn't serve that screen (the Today-specific "out of date" wording
  // would be wrong here), not that the connection is broken.
  const missing = problem.kind === "incompatible" && !!what;
  const title = missing ? `${what} isn't available on this deployment` : generic ? `Couldn't load${what ? ` ${what}` : ""}` : problem.title;
  const unreachable = problem.kind === "unavailable";
  const detail = unreachable ? "This screen's data didn't load, and nothing you did was lost. Check the connection and try again." : missing ? "Its Projects API doesn't serve this screen, so there is nothing to show. The rest of the app is unaffected." : problem.detail;
  return (
    <section className="content" role="alert">
      <div className="card"><div className="bd">
        <div className="t">{title}</div>
        <div className="s">{detail}</div>
        {problem.retryable && <div className="actions"><button className="btn sm" onClick={onRetry}>Try again</button></div>}
      </div></div>
    </section>
  );
}
