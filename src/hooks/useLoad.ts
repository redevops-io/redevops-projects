import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { classifyConnectionError, type ConnectionProblem } from "../data/client";
import { useConnectionReporter } from "./connection";

export interface Loaded<T> {
  data: T | null;
  problem: ConnectionProblem | null;     // why `data` is missing; null while loading or once loaded
  loading: boolean;
  retry: () => void;
  setData: Dispatch<SetStateAction<T | null>>;   // for views that update what they loaded (connect an app, add a source)
}

// One read with a real failure state. Every view used to do `client.getX().then(setX)` with no catch, so an offline or
// failing API left it on "Loading…" for ever. A failure is classified (same words as the Today view), shown with a
// retry, and reported to the shell so the health badge cannot say "Healthy" over an empty screen.
export function useLoad<T>(key: string, load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const { report } = useConnectionReporter();
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<ConnectionProblem | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load); loadRef.current = load;

  useEffect(() => {
    let live = true;
    setProblem(null);
    loadRef.current().then(
      (d) => { if (live) { setData(d); report(key, null); } },
      (e) => {
        if (!live) return;
        const p = classifyConnectionError(e); setProblem(p);
        // "this deployment doesn't serve that screen" is not an outage: it must not turn the whole shell red
        report(key, p.kind === "incompatible" || p.kind === "unsupported" ? null : p);
      },
    );
    return () => { live = false; report(key, null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, key, report]);

  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { data, problem, loading: data === null && problem === null, retry, setData };
}
