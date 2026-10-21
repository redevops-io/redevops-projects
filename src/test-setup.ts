import { afterEach, beforeEach } from "vitest";

// Place lives in the URL hash and localStorage now; reset both so one test's navigation never leaks into the next.
// replaceState changes the URL WITHOUT firing events. (Assigning location.hash = "" queues an asynchronous hashchange that can
// land in the NEXT test, after its app has mounted — a stray event the app would then act on.)
const reset = () => { try { window.history.replaceState(null, "", "#"); localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } };
beforeEach(reset);
afterEach(reset);
