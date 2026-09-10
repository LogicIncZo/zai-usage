import { describe, test, expect } from "bun:test";
import {
  humanTokens, bar, z8Stamp, parseZ8, startOfMonthUTC8, inPeakWindow,
  fmtWhen, tzShort, pickTZ, renderTable, demoQuota, demoResets, demoModelUsage, checkDecision } from "./zai-usage.ts";

describe("humanTokens", () => {
  test("formats by magnitude", () => {
    expect(humanTokens(0)).toBe("0");
    expect(humanTokens(999)).toBe("999");
    expect(humanTokens(1000)).toBe("1.0K");
    expect(humanTokens(657602)).toBe("657.6K");
    expect(humanTokens(18803666)).toBe("18.80M");
    expect(humanTokens(2439495784)).toBe("2.44B");
  });
});

describe("bar", () => {
  test("fills proportionally, plain ASCII when not a TTY", () => {
    expect(bar(47, 20)).toBe("#########-----------");
    expect(bar(0, 20)).toBe("--------------------");
    expect(bar(100, 20)).toBe("####################");
  });
  test("clamps out-of-range percentages", () => {
    expect(bar(-5, 20)).toBe("-".repeat(20));
    expect(bar(150, 20)).toBe("#".repeat(20));
  });
});

describe("z8Stamp / parseZ8", () => {
  test("epoch → UTC+8 string", () => {
    expect(z8Stamp(new Date(Date.UTC(2026, 8, 10, 0, 0, 0)))).toBe("2026-09-10 08:00:00");
    expect(z8Stamp(new Date(Date.UTC(2026, 8, 10, 16, 0, 0)))).toBe("2026-09-11 00:00:00");
  });
  test("round-trips through UTC+8", () => {
    expect(parseZ8("2026-10-01 23:59:59").getTime())
      .toBe(Date.parse("2026-10-01T23:59:59+08:00"));
  });
});

describe("startOfMonthUTC8", () => {
  test("snaps to first of month in UTC+8", () => {
    expect(z8Stamp(startOfMonthUTC8(new Date("2026-09-10T04:00:00Z")))).toBe("2026-09-01 00:00:00");
    // 2026-09-01 03:00 IST is still Aug 31 in UTC+8? No — IST is behind UTC+8, so
    // 2026-08-31T21:30Z = Sep 1 05:30 UTC+8 and Aug 31 17:00 IST.
    expect(z8Stamp(startOfMonthUTC8(new Date("2026-08-31T21:30:00Z")))).toBe("2026-09-01 00:00:00");
  });
});

describe("inPeakWindow (Mon–Fri 14:00–18:00 UTC+8)", () => {
  test("inside peak", () => {
    expect(inPeakWindow(new Date("2026-09-10T06:00:00Z"))).toBe(true);  // Thu 14:00
    expect(inPeakWindow(new Date("2026-09-10T06:30:00Z"))).toBe(true);  // Thu 14:30
    expect(inPeakWindow(new Date("2026-09-10T09:59:00Z"))).toBe(true);  // Thu 17:59
    expect(inPeakWindow(new Date("2026-09-11T07:00:00Z"))).toBe(true);  // Fri 15:00
  });
  test("outside peak", () => {
    expect(inPeakWindow(new Date("2026-09-10T05:59:00Z"))).toBe(false); // Thu 13:59
    expect(inPeakWindow(new Date("2026-09-10T10:00:00Z"))).toBe(false); // Thu 18:00
    expect(inPeakWindow(new Date("2026-09-12T07:00:00Z"))).toBe(false); // Sat
    expect(inPeakWindow(new Date("2026-09-13T07:00:00Z"))).toBe(false); // Sun
  });
});

describe("fmtWhen / tzShort", () => {
  const ms = Date.UTC(2026, 8, 10, 3, 45, 0); // 03:45Z
  test("renders the same instant in different zones", () => {
    expect(fmtWhen(ms, "UTC", false)).toContain("03:45");
    expect(fmtWhen(ms, "Asia/Kolkata", false)).toContain("09:15");
    expect(fmtWhen(ms, "Asia/Singapore", false)).toContain("11:45");
  });
  test("weekday flag", () => {
    expect(fmtWhen(ms, "UTC")).toContain("Thu");
    expect(fmtWhen(ms, "UTC", false)).not.toContain("Thu");
  });
  test("tz short name", () => {
    expect(tzShort("UTC", ms)).toBe("UTC");
    expect(tzShort("Asia/Kolkata", ms)).toMatch(/IST|GMT\+5:30/);
  });
});

describe("pickTZ", () => {
  test("--tz flag wins", () => {
    expect(pickTZ("Asia/Kolkata", "UTC")).toBe("Asia/Kolkata");
  });
  test("falls back to system, then UTC", () => {
    expect(pickTZ(undefined, "Asia/Singapore")).toBe("Asia/Singapore");
    expect(pickTZ(undefined, undefined)).toBe("UTC");
  });
  test("invalid zones fall back to UTC", () => {
    expect(pickTZ("Bogus/Zone", "UTC")).toBe("UTC");
    expect(pickTZ(undefined, "Not/AZone")).toBe("UTC");
  });
});

describe("renderTable", () => {
  test("rows align and widths ignore ANSI escapes", () => {
    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const t = renderTable(
      ["model", "v"],
      [["a", "1"], ["bb", dim("-")]],
      ["l", "r"],
      new Set([0]),
    );
    const lines = t.split("\n");
    const vis = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, "").length;
    const widths = new Set(lines.map(vis));
    expect(widths.size).toBe(1);
    expect(t).toContain("| model");
    expect(t).toContain(dim("-"));
    expect(lines.filter((l) => l.startsWith("+")).length).toBe(4); // head + separator + foot
  });
});

describe("demo fixtures", () => {
  test("quota payload is coherent", () => {
    const q = demoQuota();
    expect(q.success).toBe(true);
    expect(q.data.level).toBe("PRO");
    const units = q.data.limits.map((l: any) => l.unit);
    expect(units).toContain(3); // 5-hour window
    expect(units).toContain(5); // monthly
  });
  test("reset packs have availability flags", () => {
    const d = demoResets().data;
    expect(d.fiveHourResets.every((p: any) => typeof p.available === "boolean")).toBe(true);
    expect(d.weekResets.length).toBeGreaterThan(0);
    expect(typeof d.lastFiveHourResetTime).toBe("string");
  });
  test("model usage spans stay under the 31-day API cap", () => {
    const d = demoModelUsage("2026-08-01 00:00:00", "2026-08-31 23:59:59").data;
    expect(d.granularity).toBe("daily");
    const n = d.x_time.length;
    expect(n).toBe(31);
    expect(d.modelCallCount).toHaveLength(n);
    expect(d.tokensUsage).toHaveLength(n);
    expect(d.modelCallCount.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(0);
    expect(d.totalUsage.totalModelCallCount).toBeGreaterThan(0);
    expect(d.totalUsage.totalTokensUsage).toBeGreaterThan(0);
    expect(d.modelSummaryList.length).toBeGreaterThan(0);
    expect(d.modelSummaryList[0].totalTokens).toBeGreaterThan(0);
  });
});

describe("checkDecision", () => {
  const limits = demoQuota().data.limits;
  test("ok when left >= min", () => {
    const d = checkDecision(limits, "5h", 10);
    expect(d.ok).toBe(true);
    expect(d.left).toBe(53);
  });
  test("low when left < min", () => {
    expect(checkDecision(limits, "5h", 60).ok).toBe(false);
  });
  test("boundary: left == min passes", () => {
    expect(checkDecision(limits, "5h", 53).ok).toBe(true);
  });
  test("monthly-tools uses unit 5 and exposes callsLeft", () => {
    const d = checkDecision(limits, "monthly-tools", 10);
    expect(d.left).toBe(62);
    expect(d.callsLeft).toBe(62);
  });
  test("missing window reports missing", () => {
    const d = checkDecision(limits, "weekly", 10);
    expect(d.missing).toBe(true);
    expect(d.ok).toBe(false);
  });
  test("unknown window falls back to 5h", () => {
    expect(checkDecision(limits, "bogus", 10).left).toBe(53);
  });
});
