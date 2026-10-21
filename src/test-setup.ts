import { afterEach, beforeEach } from "vitest";

// Place lives in the URL hash and localStorage now; reset both so one test's navigation never leaks into the next.
beforeEach(() => { try { window.history.replaceState(null, "", "#"); window.location.hash = ""; localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { try { window.history.replaceState(null, "", "#"); } catch { /* ignore */ } });
