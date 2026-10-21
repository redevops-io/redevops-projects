import { useEffect, useState } from "react";
import type { TodayNotification } from "../data/types";

// On a phone three stacked toasts cover half the screen (and the content under them), so show one + a count there (two on desktop, so a notification never hides the message being reviewed).
function useLimit(): number {
  const q = "(max-width: 820px)";
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches ? 1 : 2);
  const [n, setN] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(q), on = () => setN(m.matches ? 1 : 2);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return n;
}

// In-app only (native/desktop notifications come later, with the same content-free rule for lock screens).
// Shows the few newest actionable items; "Open" jumps to Today with that item selected.
export function NotificationToasts({ pending, onOpen, onDismiss, onDismissAll }: {
  pending: TodayNotification[]; onOpen: (n: TodayNotification) => void; onDismiss: (n: TodayNotification) => void; onDismissAll: () => void;
}) {
  const limit = useLimit();
  if (!pending.length) return null;
  const shown = pending.slice(0, limit), more = pending.length - shown.length;
  return (
    <div className="toasts" role="status" aria-live="polite" aria-label="New items that need you">
      {shown.map((n) => (
        <div className="toast" key={n.key}>
          <div className="grow">
            <div className="t">{n.resurfaced ? "Back in your queue" : n.kind === "reminder" ? "Reminder due" : "Needs you"}</div>
            <div className="s">{n.title}</div>
          </div>
          <button className="btn sm" onClick={() => onOpen(n)}>Open</button>
          <button className="btn sm" aria-label={`Dismiss: ${n.title}`} onClick={() => onDismiss(n)}>Dismiss</button>
        </div>
      ))}
      {more > 0 && <div className="toast more"><span className="s">and {more} more</span> <button className="btn sm" onClick={onDismissAll}>Dismiss all</button></div>}
    </div>
  );
}
