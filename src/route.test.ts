import { describe, expect, it } from "vitest";
import { formatHash, initialRoute, parseHash, readLastPlace, rememberPlace } from "./route";

describe("hash routes (shared by the browser and the desktop deep links)", () => {
  it("parses sections and items", () => {
    expect(parseHash("#/today")).toEqual({ section: "today" });
    expect(parseHash("#today")).toEqual({ section: "today" });
    expect(parseHash("#/apps")).toEqual({ section: "apps" });
    expect(parseHash("#/today/att_6afa9a4163a6afa2")).toEqual({ section: "today", item: "att_6afa9a4163a6afa2" });
    expect(parseHash("#/today/rem-cap_0001")).toEqual({ section: "today", item: "rem-cap_0001" });
  });

  it("ignores anything that is not an allowlisted section", () => {
    for (const bad of ["", "#", "#/", "#/nope", "#/admin", "#/../etc/passwd", "#//today", "#/Today", "#/today?x=1", "#/today#x", "#javascript:alert(1)", "#/http://evil"])
      expect(parseHash(bad), bad).toBeNull();
  });

  it("never yields a malformed or hostile item id — the section survives, or the whole hash is refused", () => {
    for (const hostile of ["<script>alert(1)</script>", "a b", "../../x", "x".repeat(81), "%E0%A4%A", "a;b", "a/b", "a?b", "a#b", "%3Cscript%3E"]) {
      const r = parseHash(`#/today/${hostile}`);
      expect(r?.item, hostile).toBeUndefined();                              // an item id is never passed through
      if (r) expect(r.section, hostile).toBe("today");                       // and nothing else leaks in
    }
  });

  it("formats and round-trips; refuses to emit an unsafe item", () => {
    expect(formatHash({ section: "missions" })).toBe("#/missions");
    expect(formatHash({ section: "today", item: "att_abc-1" })).toBe("#/today/att_abc-1");
    expect(formatHash({ section: "today", item: "<x>" })).toBe("#/today");
    expect(parseHash(formatHash({ section: "today", item: "att:1.2" }))).toEqual({ section: "today", item: "att:1.2" });
  });

  it("the hash wins, then the last place, then Today; a bad stored place is ignored", () => {
    expect(initialRoute("")).toEqual({ section: "today" });
    rememberPlace("missions");
    expect(readLastPlace()).toBe("missions");
    expect(initialRoute("")).toEqual({ section: "missions" });
    expect(initialRoute("#/apps")).toEqual({ section: "apps" });
    expect(initialRoute("#/bogus")).toEqual({ section: "missions" });
    localStorage.setItem("redevops.last-place", "<script>");
    expect(initialRoute("")).toEqual({ section: "today" });
  });

  it("works when storage is blocked", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    try { expect(() => rememberPlace("missions")).not.toThrow(); expect(initialRoute("")).toEqual({ section: "today" }); }
    finally { Object.defineProperty(window, "localStorage", real); }
  });
});
