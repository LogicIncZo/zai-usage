#!/usr/bin/env bun
const KEY = process.env.GLM_API_KEY || process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY;

const BASE = "https://api.z.ai/api/monitor/usage";
const RESETS_URL = "https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL";
export const VERSION = "0.5.0";
const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const DEMO = args.includes("--demo");

// Display timezone: --tz <IANA zone> wins, else system local, else UTC.
// (The Z.ai API itself always speaks UTC+8 — that is protocol, not presentation.)
export function pickTZ(flag: string | undefined, system: string | undefined): string {
  const cand = flag || system || "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: cand }); return cand; }
  catch { return "UTC"; }
}
export function safeSystemTZ(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
export let TZ = pickTZ(args.includes("--tz") ? args[args.indexOf("--tz") + 1] : undefined, safeSystemTZ());
export function tzShort(tz: string, ms: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat(["en-IN", "en"], { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value || tz;
  } catch { return tz; }
}

// --demo: bundled synthetic payloads, frozen clock (Fri 12 Sept 2026, 14:47 IST = peak window).
// No API key needed; all data is fake.
const DEMO_NOW = new Date("2026-09-12T14:47:00+05:30").getTime();
if (DEMO) {
  const RealDate = Date;
  // @ts-ignore — freeze both Date.now() and new Date() at DEMO_NOW
  globalThis.Date = class extends RealDate {
    constructor(...a: any[]) { a.length === 0 ? super(DEMO_NOW) : super(...(a as [])); }
    static now() { return DEMO_NOW; }
  } as any;
}

const r3 = (n: number) => Number(n.toPrecision(3));

export function demoQuota(): any {
  return {
    code: 200, msg: "Operation successful", success: true,
    data: {
      level: "PRO",
      limits: [
        { unit: 3, type: "TOKENS_LIMIT", percentage: 47, nextResetTime: DEMO_NOW + 133 * 60_000 },
        { unit: 5, type: "TIME_LIMIT", percentage: 38, currentValue: 38, usage: 100, remaining: 62,
          usageDetails: [{ modelCode: "search-prime", usage: 31 }, { modelCode: "web-reader", usage: 5 }, { modelCode: "zread", usage: 2 }],
          nextResetTime: DEMO_NOW + 16 * 86_400_000 + 18 * 3_600_000 + 27 * 60_000 },
      ],
    },
  };
}

export function demoResets(): any {
  return {
    code: 200, success: true,
    data: {
      customerId: 41002358991004410, targetType: "PERSONAL", organizationId: null, projectId: null,
      lastFiveHourResetTime: "2026-09-11 06:02:16", lastWeekResetTime: null,
      fiveHourResets: [
        { recordId: 910001, expireTime: "2026-10-18 23:59:59", available: false },
        { recordId: 910002, expireTime: "2026-11-07 23:59:59", available: true },
        { recordId: 910003, expireTime: "2026-11-07 23:59:59", available: true },
        { recordId: 910004, expireTime: "2026-11-07 23:59:59", available: true },
      ],
      weekResets: [
        { recordId: 920001, expireTime: "2026-11-07 23:59:59", available: true },
        { recordId: 920002, expireTime: "2026-11-07 23:59:59", available: true },
      ],
    },
  };
}

const DEMO_RATES: Array<[string, number, number]> = [
  ["GLM-5.3-Flash", 1.47e9, 780], ["GLM-5-Turbo", 2.2e8, 60], ["GLM-5.3", 1.5e8, 25],
  ["GLM-5.2", 4.0e7, 8], ["GLM-4.7", 6.0e6, 2],
];

export function demoModelUsage(from: string, to: string): any {
  const spanMs = new Date(to.replace(" ", "T") + "+08:00").getTime() - new Date(from.replace(" ", "T") + "+08:00").getTime();
  const days = Math.max(spanMs / 86_400_000, 1 / 60);
  const list = DEMO_RATES.map(([name, tpd, cpd], i) => {
    const f = 0.75 + 0.5 * (((i * 3 + Math.round(days * 17)) % 7) / 6);
    return {
      modelName: name, sortOrder: i + 1,
      totalTokens: r3(tpd * days * f),
      calls: Math.max(1, Math.round(cpd * days * f)),
    };
  });
  const hourly = days <= 8;
  const step = hourly ? 3_600_000 : 86_400_000;
  const t0 = new Date(from.replace(" ", "T") + "+08:00").getTime();
  const xTime: string[] = [], tokens: number[] = [], calls: number[] = [];
  for (let t = t0; t < t0 + spanMs; t += step) {
    const d = new Date(t + 8 * 3_600_000).toISOString().slice(0, hourly ? 13 : 10).replace("T", " ");
    xTime.push(hourly ? d + ":00" : d);
    tokens.push(r3(1.9e9 / (hourly ? 24 : 1) * (0.8 + 0.4 * ((t / step) % 7) / 6)));
    calls.push(Math.round(860 / (hourly ? 24 : 1) * (0.8 + 0.4 * ((t / step) % 7) / 6)));
  }
  return {
    code: 200, success: true,
    data: {
      x_time: xTime, modelCallCount: calls, tokensUsage: tokens,
      totalUsage: {
        totalModelCallCount: list.reduce((s, m) => s + m.calls, 0),
        totalTokensUsage: r3(list.reduce((s, m) => s + m.totalTokens, 0) * 0.96),
        modelSummaryList: list.map(({ modelName, totalTokens, sortOrder }) => ({ modelName, totalTokens, sortOrder })),
      },
      modelDataList: list.map((m) => ({ modelName: m.modelName, sortOrder: m.sortOrder, tokensUsage: tokens, totalTokens: m.totalTokens })),
      modelSummaryList: list.map(({ modelName, totalTokens, sortOrder }) => ({ modelName, totalTokens, sortOrder })),
      granularity: hourly ? "hourly" : "daily",
    },
  };
}

// --demo fixtures for platform billing (platform-charge-zai/bill/day): ~3 weeks of plausible rows.
export function demoBillRows(period: string = "2026-09"): any[] {
  const mk = (day: number, model: string, tt: string, tokens: number, price: string, calls: number): any => ({
    billingNo: `DAY-demo-${period}-${String(day).padStart(2, "0")}-${model}-${tt}`,
    billingDate: `${period}-${String(day).padStart(2, "0")}`,
    apiKey: "demo0000key", productCode: "inference", productName: "模型推理",
    secProductCode: "std", secProductName: "标准模型",
    modelCode: model, modelProductName: `【${model}】模型推理`,
    billingType: "Postpaid", deductedAmount: "0", originalCostPrice: price,
    discountRate: "1", costPrice: price, costUnit: "kToken",
    usageCount: String(tokens), usageExempt: "0", usageUnit: "token",
    apiUsage: calls, settlementAmount: "0", paidAmount: "0",
    giftDeductAmount: "0", unpaidAmount: "0", billingStatus: "Paid",
    tokenType: tt, deductUsage: tokens,
    packageId: "18618203", packageName: "GLM Coding Lite - Yearly",
    cashAmount: "0", thirdParty: "0", discountType: "none",
    paymentType: "Postpaid", creditPayAmount: "0",
  });
  const models: Array<[string, string, string, number, number, string]> = [
    ["glm-5.3-flash", "INPUT", "0.00015", 12_000_000, 420, "3"],
    ["glm-5.3-flash", "CACHE", "0.00003", 55_000_000, 0, "5"],
    ["glm-5.3-flash", "OUTPUT", "0.0006", 3_100_000, 0, "7"],
    ["glm-5.3", "INPUT", "0.001", 2_600_000, 95, "2"],
    ["glm-5.3", "CACHE", "0.0002", 9_800_000, 0, "4"],
    ["glm-5.3", "OUTPUT", "0.004", 640_000, 0, "6"],
    ["glm-5.2", "INPUT", "0.0002", 340_000, 12, "1"],
  ];
  const rows: any[] = [];
  for (let day = 1; day <= 21; day++) {
    const wk = [0, 6].includes(new Date(Date.UTC(2026, 8, day)).getUTCDay()) ? 0.55 : 1;
    for (const [model, tt, price, tok, calls, seed] of models) {
      const f = (0.6 + 0.8 * (((day * 7 + Number(seed) * 3) % 11) / 10)) * wk;
      rows.push(mk(day, model, tt, Math.round(tok * f), price, Math.max(1, Math.round(calls * f))));
    }
  }
  rows.push({ ...mk(15, "web-reader", "NORMAL", 0, "0.01", 8),
    productCode: "web-reader", modelCode: "web-reader", modelProductName: "【web-reader】网络读库",
    usageUnit: "time", costUnit: "time", usageCount: "8", tokenType: "" });
  return rows;
}

export function demoBill(period: string = "2026-09", pageNum = 1, pageSize = 100): any {
  const all = demoBillRows(period);
  const start = (pageNum - 1) * pageSize;
  return {
    code: 200, msg: "Operation successful", success: true,
    data: {
      current: pageNum, size: pageSize, total: all.length,
      pages: Math.ceil(all.length / pageSize) || 1,
      records: all.slice(start, start + pageSize),
    },
  };
}

const TTY = process.stdout.isTTY || args.includes("--color");
const c = (code: string, s: string) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const pctColor = (p: number, s: string) => c(p >= 80 ? "31" : p >= 50 ? "33" : "32", s);

async function api(url: string): Promise<any> {
  if (DEMO) {
    if (url.includes("/quota/limit")) return demoQuota();
    if (url.includes("customer-package-reset")) return demoResets();
    return { code: 200, success: true, data: {} };
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const body = await res.json();
  if (!body.success) {
    console.error(`API error (${res.status}): ${body.msg || "unknown"}`);
    process.exit(1);
  }
  return body;
}

export function fmtWhen(ms: number, tz: string, weekday = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    ...(weekday ? { weekday: "short" } : {}),
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ms));
}
function fmtIST(ms: number, weekday = true): string {
  return fmtWhen(ms, TZ, weekday);
}

export function rel(ms: number): string {
  const mins = Math.round((ms - Date.now()) / 60000);
  const a = Math.abs(mins);
  const span =
    a < 60 ? `${a}m` :
    a < 1440 ? `${Math.floor(a / 60)}h ${a % 60}m` :
    `${Math.floor(a / 1440)}d ${Math.floor((a % 1440) / 60)}h`;
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

function resetAt(ms: number): string {
  return `${fmtIST(ms)} ${tzShort(TZ, ms)} (${rel(ms)})`;
}

export function humanTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function z8Stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hh = g.hour === "24" ? "00" : g.hour;
  return `${g.year}-${g.month}-${g.day} ${hh}:${g.minute}:${g.second}`;
}

export function parseZ8(s: string): Date {
  return new Date(s.replace(" ", "T") + "+08:00");
}

export function renderTable(headers: string[], rows: string[][], aligns: string[], separators: Set<number> = new Set()): string {
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const widths = headers.map((h, i) => Math.max(strip(h).length, ...rows.map((r) => strip(r[i] ?? "").length)));
  const rule = (l: string, m: string, r: string) => l + widths.map((w) => "-".repeat(w + 2)).join(m) + r;
  const fmtRow = (r: string[]) =>
    "| " + r.map((cell, i) => {
      const raw = cell.replace(/\x1b\[[0-9;]*m/g, "");
      const padded = aligns[i] === "r" ? raw.trim().padStart(widths[i]) : raw.padEnd(widths[i]);
      return raw === cell ? padded : padded.replace(raw, cell);
    }).join(" | ") + " |";
  const out = [rule("+", "+", "+"), fmtRow(headers), rule("+", "+", "+")];
  rows.forEach((r, i) => {
    out.push(fmtRow(r));
    if (separators.has(i)) out.push(rule("+", "+", "+"));
  });
  out.push(rule("+", "+", "+"));
  return out.join("\n");
}

const QUOTA_LABELS: Record<number, string> = { 3: "5-hour quota", 6: "Weekly quota", 5: "Monthly tool calls" };

export function inPeakWindow(d = new Date()): boolean {
  const g = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  const h = +(g.hour === "24" ? "0" : g.hour);
  return !["Sat", "Sun"].includes(g.weekday) && h >= 14 && h < 18;
}

export function bar(pct: number, width = 20): string {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width);
  if (TTY) {
    const col = pct >= 80 ? "\x1b[31m" : pct >= 50 ? "\x1b[33m" : "\x1b[32m";
    return `${col}${"█".repeat(filled)}\x1b[0m${dim("░".repeat(width - filled))}`;
  }
  return "#".repeat(filled) + "-".repeat(width - filled);
}

function fiveHourBarLine(limits: any[]): string | null {
  const l = (limits || []).find((x) => x.unit === 3);
  if (!l) return null;
  const peak = inPeakWindow() ? dim(" · ⚠ 3× peak burn (GLM-5.3)") : "";
  return `${bold("5-HOUR QUOTA")} [${bar(l.percentage)}] ${pctColor(l.percentage, `${String(l.percentage).padStart(3)}%`)} · resets ${resetAt(l.nextResetTime)}${peak}`;
}

async function getQuota() {
  const body = await api(`${BASE}/quota/limit`);
  if (jsonOut) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }
  console.log(`Plan: ${body.data.level?.toUpperCase() || "unknown"}`);
  const fhl = fiveHourBarLine(body.data.limits);
  if (fhl) console.log(fhl);
  for (const l of body.data.limits || []) {
    const label = QUOTA_LABELS[l.unit] || `${l.type} unit=${l.unit}`;
    let line = `${label}: ${l.percentage}% used`;
    if (l.currentValue !== undefined && l.usage !== undefined) {
      line += ` (${l.currentValue}/${l.usage} calls`;
      if (l.remaining !== undefined) line += `, ${l.remaining} left`;
      line += ")";
      if (l.usageDetails?.length) {
        line += " — " + l.usageDetails.map((d: any) => `${d.modelCode}: ${d.usage}`).join(", ");
      }
    }
    line += ` · resets ${resetAt(l.nextResetTime)}`;
    console.log(line);
  }
}

function z8Date(d = new Date()): string {
  return z8Stamp(d).slice(0, 10);
}

async function fetchModelUsage(from: string, to: string): Promise<any> {
  if (DEMO) return demoModelUsage(from, to).data;
  const url = `${BASE}/model-usage?startTime=${encodeURIComponent(from).replace(/%20/g, "+")}&endTime=${encodeURIComponent(to).replace(/%20/g, "+")}`;
  return (await api(url)).data;
}

async function getModelUsage() {
  let from: string, to: string;
  const fi = args.indexOf("--from"), ti = args.indexOf("--to");
  if (fi !== -1 && args[fi + 1]) from = args[fi + 1];
  if (ti !== -1 && args[ti + 1]) to = args[ti + 1];
  if (!from || !to) {
    const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
    const day = dateArg || z8Date();
    from = `${day} 00:00:00`;
    to = `${day} 23:59:59`;
  }
  const d = await fetchModelUsage(from, to);
  if (jsonOut) { console.log(JSON.stringify({ success: true, data: d }, null, 2)); process.exit(0); }
  const times: string[] = d.x_time || [];
  const calls: number[] = d.modelCallCount || [];
  const tokens: number[] = d.tokensUsage || [];
  console.log(`Model usage ${from} → ${to} (${d.granularity}, UTC+8 buckets)`);
  const total = d.totalUsage || {};
  console.log(`Total: ${(total.totalModelCallCount ?? 0).toLocaleString("en-US")} calls · ${humanTokens(total.totalTokensUsage ?? 0)} tokens`);
  if (total.modelSummaryList?.length) {
    for (const m of total.modelSummaryList) {
      console.log(`  ${m.modelName}: ${humanTokens(m.totalTokens)} tokens`);
    }
  }
  console.log("");
  const maxTok = Math.max(1, ...tokens);
  for (let i = 0; i < times.length; i++) {
    const width = 28;
    const bars = Math.max(tokens[i] > 0 ? 1 : 0, Math.round((tokens[i] / maxTok) * width));
    console.log(`${times[i]}  ${String(calls[i] ?? 0).padStart(4)} calls  ${humanTokens(tokens[i] ?? 0).padStart(8)} tokens  ${"█".repeat(bars)}`);
  }
}

export function startOfMonthUTC8(now: Date): Date {
  const g = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" })
      .formatToParts(now).map((x) => [x.type, x.value])
  );
  return new Date(Date.UTC(+g.year, +g.month - 1, 1, -8, 0, 0));
}

const WINDOWS: Array<[string, number | "calMonth"]> = [
  ["Hour", 1],
  ["Day (24h)", 24],
  ["Week (7d)", 24 * 7],
  ["Month (30d)", 24 * 30],
  ["Current month", "calMonth"],
];

async function getSummary() {
  const now = new Date();
  const quota = await api(`${BASE}/quota/limit`);
  const five = (quota.data.limits || []).find((x: any) => x.unit === 3);
  const fiveStart = five?.nextResetTime
    ? new Date(Math.min(five.nextResetTime - 5 * 3600_000, now.getTime()))
    : new Date(now.getTime() - 5 * 3600_000);
  const winDefs: Array<[string, Date]> = [
    ["5h Quota", fiveStart],
    ...WINDOWS.map(([label, spec]) => [
      label,
      spec === "calMonth" ? startOfMonthUTC8(now) : new Date(now.getTime() - (spec as number) * 3600_000),
    ] as [string, Date]),
  ];
  const [resets, ...usages] = await Promise.all([
    api(RESETS_URL),
    ...winDefs.map(([, start]) => fetchModelUsage(z8Stamp(start), z8Stamp(now))),
  ]);

  if (jsonOut) {
    console.log(JSON.stringify({
      fetchedAt: now.toISOString(),
      fiveHourWindow: { start: fiveStart.toISOString(), end: now.toISOString() },
      quota: quota.data,
      resetPacks: resets.data,
      windows: Object.fromEntries(winDefs.map(([label], i) => [label, usages[i]])),
    }, null, 2));
    process.exit(0);
  }

  console.log(bold(`Z.AI GLM Coding Plan — ${quota.data.level?.toUpperCase() || "?"} · as of ${fmtIST(now.getTime(), false)} ${tzShort(TZ, now.getTime())}`));
  const fhl = fiveHourBarLine(quota.data.limits);
  if (fhl) console.log(fhl);
  console.log("");

  // Model usage matrix: models x windows
  console.log(bold("MODEL USAGE") + dim("  (5h quota window · rolling windows · current month · UTC+8 · tokens with % share)"));
  const winMaps = usages.map((u) => {
    const list: any[] = u.totalUsage?.modelSummaryList || [];
    const sum = list.reduce((s, m) => s + m.totalTokens, 0);
    return new Map(list.map((m) => [m.modelName, { tok: m.totalTokens, pct: sum ? Math.round((m.totalTokens / sum) * 100) : 0 }]));
  });
  const monthTok = winMaps[winDefs.findIndex(([l]) => l === "Month (30d)")];
  const allModels = [...new Set(winMaps.flatMap((m) => [...m.keys()]))]
    .sort((a, b) => (monthTok.get(b)?.tok ?? 0) - (monthTok.get(a)?.tok ?? 0) || a.localeCompare(b));
  const cell = (i: number, name: string) => {
    const mm = winMaps[i].get(name);
    return mm ? `${humanTokens(mm.tok)} ${String(mm.pct).padStart(3)}%` : dim("-");
  };
  const headers = ["model", ...winDefs.map(([l]) => l)];
  const rows: string[][] = allModels.map((name) => [name, ...winDefs.map((_, i) => cell(i, name))]);
  const totalTok = usages.map((u) => humanTokens(u.totalUsage?.totalTokensUsage ?? 0));
  const totalCalls = usages.map((u) => (u.totalUsage?.totalModelCallCount ?? 0).toLocaleString("en-US"));
  rows.push([bold("TOTAL tokens"), ...totalTok]);
  rows.push([bold("TOTAL calls"), ...totalCalls]);
  const aligns = ["l", ...winDefs.map(() => "r")];
  const seps = new Set<number>([rows.length - 3, rows.length - 2]);
  console.log(renderTable(headers, rows, aligns, seps));
  console.log("");



  // Quota section
  console.log(bold("QUOTA"));
  for (const l of quota.data.limits || []) {
    const label = (QUOTA_LABELS[l.unit] || `${l.type} unit=${l.unit}`).padEnd(18);
    let detail = "";
    if (l.currentValue !== undefined && l.usage !== undefined) {
      detail = ` (${l.currentValue}/${l.usage}${l.remaining !== undefined ? `, ${l.remaining} left` : ""})`;
    }
    console.log(`  ${label} ${pctColor(l.percentage, `${String(l.percentage).padStart(3)}%`)}${dim(detail)} · resets ${resetAt(l.nextResetTime)}`);
  }
  console.log("");

  // Reset packs section
  const rd = resets.data || {};
  const fmtPack = (list: any[]) => {
    const avail = (list || []).filter((r) => r.available);
    const expired = (list || []).filter((r) => !r.available);
    const next = avail.sort((a, b) => parseZ8(a.expireTime).getTime() - parseZ8(b.expireTime).getTime())[0];
    let s = `${avail.length} available`;
    if (next) s += ` · nearest expiry ${fmtIST(parseZ8(next.expireTime).getTime(), false)} ${tzShort(TZ, parseZ8(next.expireTime).getTime())} (${rel(parseZ8(next.expireTime).getTime())})`;
    if (expired.length) s += dim(` · ${expired.length} used/expired`);
    return s;
  };
  console.log(bold("RESET PACKS") + dim("  (customer-package-reset · PERSONAL)"));
  console.log(`  5-hour resets:  ${fmtPack(rd.fiveHourResets)}`);
  console.log(`  weekly resets:  ${fmtPack(rd.weekResets)}`);
  const last5 = rd.lastFiveHourResetTime ? parseZ8(rd.lastFiveHourResetTime) : null;
  if (last5) console.log(dim(`  last 5h auto-reset: ${fmtIST(last5.getTime(), false)} ${tzShort(TZ, last5.getTime())} (${rel(last5.getTime())})`));
  if (rd.lastWeekResetTime) {
    const lw = parseZ8(rd.lastWeekResetTime);
    console.log(dim(`  last weekly auto-reset: ${fmtIST(lw.getTime(), false)} ${tzShort(TZ, lw.getTime())} (${rel(lw.getTime())})`));
  }
}

const BILL_URL = "https://api.z.ai/api/platform-charge-zai/bill/day";

export function billCustomerId(resets: any): string | null {
  const id = resets?.data?.customerId;
  if (id == null) return null;
  const s = String(id).trim();
  return /^\d+$/.test(s) ? s : null;
}

// customerId exceeds Number.MAX_SAFE_INTEGER, so it must be lifted from the raw
// response text — JSON.parse would silently round it to a different account.
export function extractCustomerId(raw: string): string | null {
  const m = raw.match(/"customerId"\s*:\s*(\d+)/);
  return m ? m[1] : null;
}

const numOf = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function rowListCost(r: any): number {
  const div = r.costUnit === "kToken" ? 1000 : 1;
  return numOf(r.usageCount) * numOf(r.costPrice) / div;
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface BillInsights {
  period: string; records: number; days: number;
  listSpend: number; cashPaid: number; creditPaid: number; giftCovered: number;
  calls: number; tokens: number; inputTokens: number; cacheTokens: number; outputTokens: number;
  cacheSavings: number; cacheListCost: number;
  costPerMTok: number | null;
  byDay: Array<{ day: string; list: number; calls: number; tokens: number }>;
  byModel: Array<{ model: string; list: number; calls: number; tokens: number }>;
  peakDay: { day: string; list: number } | null;
  prevListSpend: number | null; momPct: number | null;
}

export function billInsights(rows: any[], period: string, prevListSpend: number | null = null): BillInsights {
  let listSpend = 0, cashPaid = 0, creditPaid = 0, giftCovered = 0, calls = 0;
  let inputTokens = 0, cacheTokens = 0, outputTokens = 0;
  let cacheSavings = 0, cacheListCost = 0;
  const dayMap = new Map<string, { list: number; calls: number; tokens: number }>();
  const modelMap = new Map<string, { list: number; calls: number; tokens: number }>();
  const inputPriceByModel = new Map<string, number>();
  const cacheRows: Array<{ model: string; tokens: number; price: number }> = [];
  for (const r of rows) {
    const list = rowListCost(r);
    listSpend += list;
    cashPaid += numOf(r.cashAmount);
    creditPaid += numOf(r.creditPayAmount);
    giftCovered += numOf(r.giftDeductAmount);
    calls += numOf(r.apiUsage);
    const model = String(r.modelCode || r.productCode || "other");
    const day = String(r.billingDate || "");
    const tokens = r.usageUnit === "token" ? numOf(r.usageCount) : 0;
    if (r.tokenType === "INPUT") {
      inputTokens += tokens;
      inputPriceByModel.set(model, Math.max(inputPriceByModel.get(model) ?? 0, numOf(r.costPrice)));
    } else if (r.tokenType === "CACHE") {
      cacheTokens += tokens;
      cacheRows.push({ model, tokens, price: numOf(r.costPrice) });
    } else if (r.tokenType === "OUTPUT") {
      outputTokens += tokens;
    }
    const d = dayMap.get(day) ?? { list: 0, calls: 0, tokens: 0 };
    d.list += list; d.calls += numOf(r.apiUsage); d.tokens += tokens;
    dayMap.set(day, d);
    const m = modelMap.get(model) ?? { list: 0, calls: 0, tokens: 0 };
    m.list += list; m.calls += numOf(r.apiUsage); m.tokens += tokens;
    modelMap.set(model, m);
  }
  for (const cr of cacheRows) {
    const ip = inputPriceByModel.get(cr.model) ?? 0;
    const cacheCost = (cr.tokens / 1000) * cr.price;
    cacheListCost += cacheCost;
    if (ip > cr.price) cacheSavings += (cr.tokens / 1000) * (ip - cr.price);
  }
  const tokens = inputTokens + cacheTokens + outputTokens;
  const byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const byModel = [...modelMap.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.list - a.list);
  const peakDay = byDay.reduce<{ day: string; list: number } | null>((best, d) => (!best || d.list > best.list ? { day: d.day, list: d.list } : best), null);
  const momPct = prevListSpend != null && prevListSpend > 0 ? ((listSpend - prevListSpend) / prevListSpend) * 100 : null;
  return {
    period, records: rows.length, days: byDay.length,
    listSpend, cashPaid, creditPaid, giftCovered, calls, tokens, inputTokens, cacheTokens, outputTokens,
    cacheSavings, cacheListCost,
    costPerMTok: tokens > 0 ? listSpend / (tokens / 1e6) : null,
    byDay, byModel, peakDay, prevListSpend, momPct,
  };
}

async function collectBill(customerId: string, period: string): Promise<any[]> {
  if (DEMO) return demoBillRows(period);
  const out: any[] = [];
  const pageSize = 100;
  for (let page = 1; page <= 60; page++) {
    const url = `${BILL_URL}?customerId=${customerId}&billingPeriod=${period}&pageNum=${page}&pageSize=${pageSize}`;
    const d = (await api(url)).data || {};
    const recs = d.records || [];
    out.push(...recs);
    if (page >= (d.pages || 1) || !recs.length) break;
  }
  return out;
}

const money = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function getBill() {
  const periodArg = args.find((a, i) => i > 0 && /^\d{4}-\d{2}$/.test(a));
  if (periodArg && !/^202[0-9]-(0[1-9]|1[0-2])$/.test(periodArg)) {
    console.error(`Invalid billing period "${periodArg}" — expected YYYY-MM.`);
    process.exit(1);
  }
  const period = periodArg || z8Date().slice(0, 7);
  let customerId: string | null = null;
  let rows: any[];
  let prevRows: any[] | null = null;
  if (DEMO) {
    customerId = extractCustomerId(JSON.stringify(demoResets()));
    rows = demoBillRows(period);
    const prev = prevPeriod(period);
    prevRows = demoBillRows(prev).map((r) => ({
      ...r,
      billingDate: r.billingDate.replace(/^\d{4}-\d{2}/, prev),
      usageCount: String(Math.round(Number(r.usageCount) * 0.72)),
      apiUsage: Math.round(Number(r.apiUsage) * 0.72),
    }));
  } else {
    const res = await fetch(RESETS_URL, { headers: { Authorization: `Bearer ${KEY}` } });
    customerId = extractCustomerId(await res.text());
    if (customerId == null) {
      console.error("Could not discover customerId from customer-package-reset/list — cannot call bill/day.");
      process.exit(1);
    }
    rows = await collectBill(customerId, period);
    prevRows = await collectBill(customerId, prevPeriod(period));
  }
  const prevIns = prevRows ? billInsights(prevRows, prevPeriod(period)) : null;
  const ins = billInsights(rows, period, prevIns ? prevIns.listSpend : null);
  if (jsonOut) {
    console.log(JSON.stringify({ fetchedAt: new Date().toISOString(), period, customerId, rows, insights: ins }, null, 2));
    return;
  }
  console.log(bold(`BILL ${period}`) + dim(`  (platform-charge-zai/bill/day · ${ins.records} rows · ${ins.days} days · UTC+8 billing days)`));
  if (!ins.records) {
    console.log(dim("  No billing records for this period (plan may predate it, or usage was fully covered upstream)."));
    return;
  }
  const billed = ins.cashPaid + ins.creditPaid + ins.giftCovered;
  console.log(`  List-price spend   ${money(ins.listSpend)}${dim("  (pay-as-you-go list value of this usage)")}`);
  console.log(`  Actually billed    ${money(billed)}${dim(`  (cash ${money(ins.cashPaid)} · credits ${money(ins.creditPaid)} · gift ${money(ins.giftCovered)})`)}`);
  console.log(`  Plan-covered       ${money(Math.max(0, ins.listSpend - billed))}${dim("  (list value absorbed by your coding-plan package)")}`);
  console.log(`  Calls ${ins.calls.toLocaleString("en-US")} · Tokens ${humanTokens(ins.tokens)}${dim(`  (in ${humanTokens(ins.inputTokens)} · cache ${humanTokens(ins.cacheTokens)} · out ${humanTokens(ins.outputTokens)})`)}`);
  if (ins.cacheSavings > 0 && ins.cacheSavings + ins.cacheListCost > 0) {
    const off = Math.round((1 - ins.cacheListCost / (ins.cacheSavings + ins.cacheListCost)) * 100);
    console.log(`  Cache savings      ${money(ins.cacheSavings)}${dim(`  (cached tokens billed ${off}% below input list)`)}`);
  }
  if (ins.costPerMTok != null) console.log(`  Blended list cost  ${money(ins.costPerMTok)} per 1M tokens`);
  if (ins.peakDay) console.log(`  Peak day           ${ins.peakDay.day}  (${money(ins.peakDay.list)})`);
  if (ins.momPct != null && ins.prevListSpend != null) {
    console.log(`  MoM                ${ins.momPct >= 0 ? "+" : ""}${ins.momPct.toFixed(1)}%${dim(`  (${money(ins.prevListSpend)} across ${prevPeriod(period)})`)}`);
  }
  console.log("");
  const maxList = Math.max(...ins.byDay.map((d) => d.list), 1e-9);
  for (const d of ins.byDay) {
    const w = Math.max(d.list > 0 ? 1 : 0, Math.round((d.list / maxList) * 28));
    console.log(`${d.day}  ${money(d.list).padStart(9)}  ${String(d.calls).padStart(6)} calls  ${humanTokens(d.tokens).padStart(8)} tokens  ${"█".repeat(w)}`);
  }
  console.log("");
  const mrows = ins.byModel.map((m) => [m.model, humanTokens(m.tokens), m.calls.toLocaleString("en-US"), money(m.list), `${Math.round((m.list / ins.listSpend) * 100)}%`]);
  console.log(renderTable(["model", "tokens", "calls", "list spend", "share"], mrows, ["l", "r", "r", "r", "r"]));
}

export function printHelp(): void {
  console.log(`zai-usage ${VERSION} — Z.ai GLM Coding Plan usage CLI

Usage: zai-usage [mode] [flags]

Modes:
  (default)            quota: 5-hour progress bar + monthly tool calls, reset times
  summary              model usage matrix + quota + reset packs
  usage [YYYY-MM-DD]   hour-by-hour model usage (default: today, UTC+8)
  usage --from "..." --to "..."   arbitrary range (max 31 days)
  check                agent gate: exit 0 if quota left >= --min%, 1 if low, 2 if error
  bill [YYYY-MM]       daily platform billing (platform-charge-zai/bill/day) for a month:
                       list vs actually-billed vs plan-covered, tokens by type, cache
                       savings, blended $/1M tokens, per-day bars, per-model table, MoM

Flags:
  --json               machine-readable output (any mode)
  --demo               synthetic fixtures, no API key needed (any mode)
  --color              force ANSI color even when piped
  --tz <IANA zone>     display timezone (default: system local, or TZ env)
  --window <name>      check window: 5h | monthly-tools | weekly (default: 5h)
  --min <pct>          check threshold, percent left required (default: 10)
  --version            print version
  --help               this text

Endpoints: api/monitor/usage, api/biz/customer-package-reset, api/platform-charge-zai/bill/day.
Key: GLM_API_KEY (or ZAI_API_KEY / Z_AI_API_KEY) environment variable.
API protocol times are UTC+8; display times follow --tz / TZ.
Repo: https://github.com/LogicIncZo/zai-usage`);
}

export const CHECK_WINDOWS: Record<string, number> = { "5h": 3, "monthly-tools": 5, "weekly": 6 };

export function checkDecision(limits: any[], window: string, minPctLeft: number) {
  const unit = CHECK_WINDOWS[window] ?? 3;
  const l = (limits || []).find((x) => x.unit === unit);
  if (!l) return { ok: false, missing: true, window, left: 0, used: 0, callsLeft: undefined as number | undefined, nextResetTime: undefined as number | undefined };
  const left = Math.max(0, 100 - (l.percentage ?? 0));
  return { ok: left >= minPctLeft, missing: false, window, left, used: l.percentage ?? 0, callsLeft: l.remaining as number | undefined, nextResetTime: l.nextResetTime as number | undefined };
}

async function runCheck() {
  const winIdx = args.indexOf("--window");
  const window = winIdx > -1 ? args[winIdx + 1] : "5h";
  const minIdx = args.indexOf("--min");
  const min = minIdx > -1 ? Number(args[minIdx + 1]) : 10;
  const body = await api(`${BASE}/quota/limit`);
  const d = checkDecision(body.data.limits || [], window, Number.isFinite(min) ? min : 10);
  if (jsonOut) {
    console.log(JSON.stringify({
      ok: d.ok, missing: d.missing, window: d.window, used: d.used, left: d.left,
      callsLeft: d.callsLeft ?? null,
      resetsInMin: d.nextResetTime ? Math.round((d.nextResetTime - Date.now()) / 60_000) : null,
    }, null, 2));
  } else if (d.missing) {
    console.log(`UNKNOWN ${d.window}: window not reported by API`);
  } else {
    const detail = window === "monthly-tools" ? `${d.callsLeft} calls left` : `resets ${resetAt(d.nextResetTime!)}`;
    console.log(`${d.ok ? "OK" : "LOW"} ${d.window}: ${d.left}% left (${detail})`);
  }
  if (d.missing) process.exit(2);
  process.exit(d.ok ? 0 : 1);
}

export async function main() {
  if (args.includes("--help") || args.includes("-h")) { printHelp(); return; }
  if (args.includes("--version") || args.includes("-v")) { console.log(VERSION); return; }
  if (!KEY && !DEMO) {
    console.error("No API key found. Set GLM_API_KEY (Settings > Advanced), or use --demo for a keyless tour.");
    process.exit(1);
  }
  if (args[0] === "summary" || args.includes("--summary")) {
    await getSummary();
  } else if (args[0] === "usage" || args.includes("--usage")) {
    await getModelUsage();
  } else if (args[0] === "bill") {
    await getBill();
  } else if (args[0] === "check") {
    await runCheck();
  } else {
    await getQuota();
  }
}

if (import.meta.main) {
  await main();
}
