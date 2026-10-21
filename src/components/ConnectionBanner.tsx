import type { ConnectionProblem } from "../data/client";

// One slim banner for "the runtime can't be reached / didn't accept us", identical in the browser and the desktop shell.
// The last known screen stays usable underneath (reads keep working from what's loaded; writes will say why they fail).
export function ConnectionBanner({ problem, onRetry }: { problem: ConnectionProblem | null; onRetry: () => void }) {
  if (!problem) return null;
  return (
    <div className={`connbar ${problem.kind}`} role="status" aria-live="polite">
      <strong>{problem.title}.</strong> <span>{problem.detail}</span>
      {problem.retryable && <button className="btn sm" onClick={onRetry}>Try now</button>}
    </div>
  );
}
