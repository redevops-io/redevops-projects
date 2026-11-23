import { createContext, useContext } from "react";
import type { ConnectionProblem } from "../data/client";

// Where a failed load is reported so the shell (health badge, document title) never claims "Healthy" while a view
// has nothing to show. Keyed by the reporting view; `null` clears. The default is a no-op, so views render standalone.
export interface ConnectionReporter { report: (key: string, problem: ConnectionProblem | null) => void }
export const ConnectionContext = createContext<ConnectionReporter>({ report: () => {} });
export const useConnectionReporter = () => useContext(ConnectionContext);
