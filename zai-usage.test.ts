import { describe, test, expect } from "bun:test";
import {
  humanTokens, bar, z8Stamp, parseZ8, startOfMonthUTC8, inPeakWindow,
  fmtWhen, tzShort, pickTZ, renderTable, demoQuota, demoResets, demoModelUsage, checkDecision,
  billCustomerId, extractCustomerId, prevPeriod, nextPeriod, billInsights, benefitsSummary, rowListCost, demoBillRows,
  demoRowsScaled, learnPrices,
  z8Day, spansFor, describePeriod, buildTips, demoRowsScaled } from "./zai-usage.ts";

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

describe("z8Day", () => {
  test("offsets days in UTC+8", () => {
    const base = new Date("2026-09-21T10:00:00Z"); // 18:00 +08
    expect(z8Day(0, base)).toBe("2026-09-21");
    expect(z8Day(-1, base)).toBe("2026-09-20");
    expect(z8Day(0, new Date("2026-09-21T16:30:00Z"))).toBe("2026-09-22"); // 00:30 +08
    expect(z8Day(-1, new Date("2026-03-01T00:00:00Z"))).toBe("2026-02-28"); // month roll
  });
});

describe("spansFor", () => {
  test("week: 7-day current vs prior 7", () => {
    const sp = spansFor("week");
    expect(sp.curTo).toBe(z8Day(0));
    expect(sp.curFrom).toBe(z8Day(-6));
    expect(sp.prevTo).toBe(z8Day(-7));
    expect(sp.prevFrom).toBe(z8Day(-13));
  });
  test("month: MTD vs same span last month", () => {
    const sp = spansFor("month");
    expect(sp.curFrom.endsWith("-01")).toBe(true);
    expect(sp.curTo).toBe(z8Day(0));
    const pm = sp.prevFrom.slice(0, 7);
    expect(pm < sp.curFrom.slice(0, 7)).toBe(true);
    expect(Number(sp.prevTo.slice(8, 10))).toBeLessThanOrEqual(31);
  });
});

describe("describePeriod + buildTips", () => {
  const mk = (day: string, model: string, tt: string, tokens: number, price: string, calls: number) => ({
    billingDate: day, modelCode: model, productCode: "inference", usageUnit: "token", costUnit: "kToken",
    costPrice: price, usageCount: String(tokens), apiUsage: calls, tokenType: tt,
    unpaidAmount: "0", cashAmount: "0", creditPayAmount: "0", giftDeductAmount: "0",
  });
  const week = (cachePrice: string) => billInsights([
    mk("2026-09-15", "glm-5.3-flash", "INPUT", 5_000_000, "0.00015", 100),
    mk("2026-09-15", "glm-5.3-flash", "CACHE", 20_000_000, cachePrice, 0),
    mk("2026-09-15", "glm-5.3", "INPUT", 3_000_000, "0.001", 10),
  ], "2026-09");
  test("describePeriod behavioral stats", () => {
    const st = describePeriod(week("0.00003"), "2026-09-15", "2026-09-21");
    expect(st.spanDays).toBe(7);
    expect(st.cacheShare).toBeCloseTo(20_000_000 / 28_000_000, 5);
    expect(st.nonFlashShare).toBeCloseTo(3_000_000 / 28_000_000, 5);
    expect(st.topModel?.model).toBe("glm-5.3-flash");
    expect(st.callsPerActiveDay).toBe(110); // round(110 calls / 1 active day)
    expect(st.biggestDayShare).toBe(1); // single active day
  });
  test("peak-window tip fires above 30%", () => {
    const cur = describePeriod(week("0.00003"), "2026-09-15", "2026-09-21");
    const tips = buildTips(cur, null, { peak: { share: 0.41, sampleTokens: 1e9 }, packs: null, kind: "week" });
    expect(tips.some((t) => t.text.includes("peak window"))).toBe(true);
  });
  test("cache-drop tip fires on falling cache share", () => {
    const prev = describePeriod(week("0.00003"), "2026-09-08", "2026-09-14"); // cache 20/28 = 71.4%
    const dropped = [
      mk("2026-09-15", "glm-5.3-flash", "INPUT", 5_000_000, "0.00015", 100),
      mk("2026-09-15", "glm-5.3-flash", "CACHE", 10_000_000, "0.00003", 0),
      mk("2026-09-15", "glm-5.3", "INPUT", 3_000_000, "0.001", 10),
    ];
    const cur = describePeriod(billInsights(dropped, "2026-09"), "2026-09-15", "2026-09-21"); // 10/18 = 55.6%
    const tips = buildTips(cur, prev, { peak: null, packs: null, kind: "week" });
    expect(tips.some((t) => t.text.includes("Cache share"))).toBe(true);
  });
  test("reset-pack tip fires on near expiry, quiet otherwise", () => {
    const spread = billInsights([
      mk("2026-09-15", "glm-5.3-flash", "CACHE", 7_000_000, "0.00003", 30),
      mk("2026-09-16", "glm-5.3-flash", "CACHE", 7_000_000, "0.00003", 30),
      mk("2026-09-17", "glm-5.3-flash", "CACHE", 7_000_000, "0.00003", 30),
    ], "2026-09");
    const cur = describePeriod(spread, "2026-09-15", "2026-09-21"); // 3 active days, even load, cache 100%, 1 model
    const near = z8Stamp(new Date(Date.now() + 10 * 86_400_000)).slice(0, 10);
    const packs = { data: { fiveHourResets: [{ available: true, expireTime: `${near} 23:59:59` }], weekResets: [] } };
    expect(buildTips(cur, null, { peak: null, packs, kind: "week" }).some((t) => t.text.includes("reset pack"))).toBe(true);
    const none = { data: { fiveHourResets: [], weekResets: [] } };
    expect(buildTips(cur, null, { peak: null, packs: none, kind: "week" }).some((t) => t.icon === "✅")).toBe(true);
    const bal = billInsights([
      mk("2026-09-15", "glm-5.3-flash", "INPUT", 2_500_000, "0.00015", 10),
      mk("2026-09-16", "glm-5.3", "INPUT", 2_500_000, "0.001", 10),
      mk("2026-09-17", "glm-5.3", "INPUT", 2_500_000, "0.001", 10),
      mk("2026-09-18", "glm-5.3-flash", "INPUT", 2_500_000, "0.00015", 10),
    ], "2026-09");
    expect(buildTips(bal, null, { peak: null, packs: none, kind: "week" })).toEqual([{ icon: "✅", text: expect.stringContaining("No waste") }]);
  });
  test("demoRowsScaled shrinks usage", () => {
    const base = demoBillRows("2026-09");
    const scaled = demoRowsScaled("2026-09", 0.5);
    expect(scaled.length).toBe(base.length);
    expect(Number(scaled[0].usageCount)).toBe(Math.round(Number(base[0].usageCount) * 0.5));
  });
});

describe("v0.8 additions", () => {
  test("demoRowsScaled scales costs and keeps dates", () => {
    const rows = demoRowsScaled("2026-08", 0.5);
    const orig = demoBillRows("2026-08");
    expect(rows.length).toBe(orig.length);
    expect(billInsights(rows, "2026-08").listSpend).toBeCloseTo(billInsights(orig, "2026-08").listSpend * 0.5, 5);
    expect(rows.every((r: any) => r.billingDate.startsWith("2026-08"))).toBe(true);
  });

  test("learnPrices last-seen wins per model+tokenType", () => {
    const prices = learnPrices([
      { modelCode: "glm-5.3", tokenType: "INPUT", usageUnit: "token", costUnit: "kToken", usageCount: 1000, costPrice: "0.001", billingDate: "2026-07-01" },
      { modelCode: "glm-5.3", tokenType: "INPUT", usageUnit: "token", costUnit: "kToken", usageCount: 1000, costPrice: "0.002", billingDate: "2026-08-01" },
    ]);
    expect(prices.length).toBe(1);
    expect(prices[0].price).toBe(0.002); // raw per-kToken; display layer ×1000 → $2/1M
    expect(prices[0].model).toBe("glm-5.3");
  });

  test("spansFor month: MTD window vs same span prior month", () => {
    const sp = spansFor("month");
    const curDays = Number(sp.curTo.slice(8)) - Number(sp.curFrom.slice(8)) + 1;
    const prevEnd = new Date(Date.UTC(+sp.prevTo.slice(0, 4), +sp.prevTo.slice(5, 7), 0)).getUTCDate();
    expect(curDays).toBeGreaterThanOrEqual(1);
    expect(sp.prevFrom.slice(0, 7) < sp.curFrom.slice(0, 7)).toBe(true);
    expect(Number(sp.prevTo.slice(8))).toBeLessThanOrEqual(prevEnd);
  });

  test("benefitsSummary with single month has no best-month flag", () => {
    const one = benefitsSummary([{ period: "2026-09", insights: billInsights(demoBillRows("2026-09"), "2026-09") }]);
    expect(one.months).toBe(1);
    expect(one.bestMonth?.period).toBe("2026-09");
  });
});

describe("mode smoke (spawn, demo)", () => {
  const run = (argv: string[]) => {
    const p = Bun.spawnSync(["bun", "zai-usage.ts", ...argv], { cwd: import.meta.dir });
    return { code: p.exitCode, out: p.stdout.toString() };
  };
  test("benefits --demo --json exits 0 and parses (guards perMonth regression)", () => {
    const r = run(["benefits", "--demo", "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.benefits.months).toBeGreaterThan(0);
  });
  test("codingplan-benefits --demo exits 0", () => {
    expect(run(["codingplan-benefits", "--demo"]).code).toBe(0);
  });
});
