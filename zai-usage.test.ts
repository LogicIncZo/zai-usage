import { describe, test, expect } from "bun:test";
import {
  humanTokens, bar, z8Stamp, parseZ8, startOfMonthUTC8, inPeakWindow,
  fmtWhen, tzShort, pickTZ, renderTable, demoQuota, demoResets, demoModelUsage, checkDecision,
  billCustomerId, extractCustomerId, prevPeriod, nextPeriod, billInsights, benefitsSummary, rowListCost, demoBillRows } from "./zai-usage.ts";

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

describe("billCustomerId", () => {
  test("extracts customerId as string (beyond MAX_SAFE_INTEGER)", () => {
    expect(billCustomerId({ data: { customerId: "82331755979833874" } })).toBe("82331755979833874");
    expect(billCustomerId({ data: { customerId: 123 } })).toBe("123");
  });
  test("extractCustomerId reads raw JSON text without precision loss", () => {
    expect(extractCustomerId('{"data":{"customerId":82331755979833874}}')).toBe("82331755979833874");
    expect(extractCustomerId('{"data":{}}')).toBe(null);
  });
  test("null when absent", () => {
    expect(billCustomerId({ data: {} })).toBe(null);
    expect(billCustomerId(null)).toBe(null);
  });
});

describe("prevPeriod", () => {
  test("crosses the year boundary", () => {
    expect(prevPeriod("2026-01")).toBe("2025-12");
    expect(prevPeriod("2026-09")).toBe("2026-08");
  });
});

describe("demoBillRows", () => {
  const rows = demoBillRows("2026-09");
  test("produces plausible postpaid inference rows", () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((r: any) => r.billingNo.startsWith("DAY-"))).toBe(true);
    expect(rows.every((r: any) => r.billingDate.startsWith("2026-09"))).toBe(true);
    expect(rows.some((r: any) => r.tokenType === "CACHE")).toBe(true);
    expect(rows.some((r: any) => r.productCode === "web-reader")).toBe(true);
  });
});

describe("billInsights", () => {
  test("aggregates list spend, tokens by type, cache savings, peak day", () => {
    const rows = [
      { billingDate: "2026-09-01", modelCode: "glm-5.3", productCode: "inference", usageUnit: "token", costUnit: "kToken",
        costPrice: "0.001", usageCount: "1000000", apiUsage: 10, tokenType: "INPUT", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0" },
      { billingDate: "2026-09-01", modelCode: "glm-5.3", productCode: "inference", usageUnit: "token", costUnit: "kToken",
        costPrice: "0.0002", usageCount: "3000000", apiUsage: 30, tokenType: "CACHE", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0" },
      { billingDate: "2026-09-02", modelCode: "glm-5.3", productCode: "inference", usageUnit: "token", costUnit: "kToken",
        costPrice: "0.002", usageCount: "500000", apiUsage: 5, tokenType: "OUTPUT", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0" },
      { billingDate: "2026-09-02", modelCode: "web-reader", productCode: "web-reader", usageUnit: "time", costUnit: "time",
        costPrice: "0.01", usageCount: "3", apiUsage: 3, tokenType: "", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0" },
    ];
    const ins = billInsights(rows, "2026-09");
    expect(ins.days).toBe(2);
    expect(ins.records).toBe(4);
    expect(ins.calls).toBe(48);
    expect(ins.listSpend).toBeCloseTo(1 * 1 + 3000 * 0.0002 + 500 * 0.002 + 0.03, 5); // 2.63
    expect(ins.inputTokens).toBe(1_000_000);
    expect(ins.cacheTokens).toBe(3_000_000);
    expect(ins.outputTokens).toBe(500_000);
    expect(ins.cacheSavings).toBeCloseTo(3000 * (0.001 - 0.0002), 5); // $2.40 vs input list
    expect(ins.peakDay?.day).toBe("2026-09-01");
    expect(ins.peakDay?.list).toBeCloseTo(1 * 1 + 3000 * 0.0002, 5);
    expect(ins.byModel.find((m) => m.model === "glm-5.3")?.tokens).toBe(4_500_000);
    expect(ins.byModel.find((m) => m.model === "web-reader")?.calls).toBe(3);
  });
  test("month-over-month sign is correct", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
      billingDate: `2026-09-0${(i % 9) + 1}`, modelCode: "glm-5.3", productCode: "inference", usageUnit: "token", costUnit: "kToken",
      costPrice: "0.001", usageCount: "1000000", apiUsage: 1, tokenType: "INPUT", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0",
    }));
    const prev = billInsights(mk(2), "2026-08");
    const cur = billInsights(mk(5), "2026-09", prev.listSpend);
    expect(cur.momPct).toBeGreaterThan(0);
    const down = billInsights(mk(2), "2026-09", billInsights(mk(5), "2026-08").listSpend);
    expect(down.momPct).toBeLessThan(0);
    expect(billInsights(mk(2), "2026-09").momPct).toBe(null);
  });
});

describe("nextPeriod", () => {
  test("rolls the year forward", () => {
    expect(nextPeriod("2026-09")).toBe("2026-10");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });
});

describe("benefitsSummary", () => {
  const mkRows = (n: number, price = "0.001") => Array.from({ length: n }, (_, i) => ({
    billingDate: `2026-0${(i % 8) + 1}-15`, modelCode: "glm-5.3", productCode: "inference", usageUnit: "token", costUnit: "kToken",
    costPrice: price, usageCount: "1000000", apiUsage: 1, tokenType: "INPUT", unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0",
  }));
  test("aggregates months into lifetime totals", () => {
    const perMonth = [
      { period: "2026-03", insights: billInsights(mkRows(2), "2026-03") },
      { period: "2026-04", insights: billInsights(mkRows(5), "2026-04") },
    ];
    const sum = benefitsSummary(perMonth);
    expect(sum.months).toBe(2);
    expect(sum.firstMonth).toBe("2026-03");
    expect(sum.lastMonth).toBe("2026-04");
    expect(sum.listSpend).toBeCloseTo(7, 5);
    expect(sum.planCovered).toBeCloseTo(7, 5);
    expect(sum.calls).toBe(7);
    expect(sum.bestMonth?.period).toBe("2026-04");
    expect(sum.currentMonthSpend).toBeCloseTo(5, 5);
    expect(sum.byMonth.length).toBe(2);
  });
  test("empty history is safe", () => {
    const sum = benefitsSummary([]);
    expect(sum.months).toBe(0);
    expect(sum.firstMonth).toBe(null);
    expect(sum.costPerMTok).toBe(null);
  });
});
