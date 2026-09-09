#!/usr/bin/env bun
const KEY = process.env.GLM_API_KEY || process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY;

if (!KEY) {
  console.error("No API key found. Set GLM_API_KEY (Settings > Advanced).");
  process.exit(1);
}

const BASE = "https://api.z.ai/api/monitor/usage";
const RESETS_URL = "https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL";
const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const TTY = process.stdout.isTTY;
const c = (code: string, s: string) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const pctColor = (p: number, s: string) => c(p >= 80 ? "31" : p >= 50 ? "33" : "32", s);

async function api(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const body = await res.json();
  if (!body.success) {
    console.error(`API error (${res.status}): ${body.msg || "unknown"}`);
    process.exit(1);
  }
  return body;
}

function fmtIST(ms: number, weekday = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(weekday ? { weekday: "short" } : {}),
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ms));
}

function rel(ms: number): string {
  const mins = Math.round((ms - Date.now()) / 60000);
  const a = Math.abs(mins);
  const span =
    a < 60 ? `${a}m` :
    a < 1440 ? `${Math.floor(a / 60)}h ${a % 60}m` :
    `${Math.floor(a / 1440)}d ${Math.floor((a % 1440) / 60)}h`;
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

function resetAt(ms: number): string {
  return `${fmtIST(ms)} IST (${rel(ms)})`;
}

function humanTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function z8Stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hh = g.hour === "24" ? "00" : g.hour;
  return `${g.year}-${g.month}-${g.day} ${hh}:${g.minute}:${g.second}`;
}

function parseZ8(s: string): Date {
  return new Date(s.replace(" ", "T") + "+08:00");
}

function renderTable(headers: string[], rows: string[][], aligns: string[], separators: Set<number> = new Set()): string {
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

function inPeakWindow(d = new Date()): boolean {
  const g = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  const h = +(g.hour === "24" ? "0" : g.hour);
  return !["Sat", "Sun"].includes(g.weekday) && h >= 14 && h < 18;
}

function bar(pct: number, width = 20): string {
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

function startOfMonthUTC8(now: Date): Date {
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
  const [quota, resets, ...usages] = await Promise.all([
    api(`${BASE}/quota/limit`),
    api(RESETS_URL),
    ...WINDOWS.map(([, spec]) => {
      const start = spec === "calMonth" ? startOfMonthUTC8(now) : new Date(now.getTime() - spec * 3600_000);
      return fetchModelUsage(z8Stamp(start), z8Stamp(now));
    }),
  ]);

  if (jsonOut) {
    console.log(JSON.stringify({
      fetchedAt: now.toISOString(),
      quota: quota.data,
      resetPacks: resets.data,
      windows: Object.fromEntries(WINDOWS.map(([label], i) => [label, usages[i]])),
    }, null, 2));
    process.exit(0);
  }

  console.log(bold(`Z.AI GLM Coding Plan — ${quota.data.level?.toUpperCase() || "?"} · as of ${fmtIST(now.getTime(), false)} IST`));
  const fhl = fiveHourBarLine(quota.data.limits);
  if (fhl) console.log(fhl);
  console.log("");

  // Model usage matrix: models x windows
  console.log(bold("MODEL USAGE") + dim("  (rolling windows + current month, UTC+8 · tokens with % share)"));
  const winMaps = usages.map((u) => {
    const list: any[] = u.totalUsage?.modelSummaryList || [];
    const sum = list.reduce((s, m) => s + m.totalTokens, 0);
    return new Map(list.map((m) => [m.modelName, { tok: m.totalTokens, pct: sum ? Math.round((m.totalTokens / sum) * 100) : 0 }]));
  });
  const monthTok = winMaps[3];
  const allModels = [...new Set(winMaps.flatMap((m) => [...m.keys()]))]
    .sort((a, b) => (monthTok.get(b)?.tok ?? 0) - (monthTok.get(a)?.tok ?? 0) || a.localeCompare(b));
  const cell = (i: number, name: string) => {
    const mm = winMaps[i].get(name);
    return mm ? `${humanTokens(mm.tok)} ${String(mm.pct).padStart(3)}%` : dim("-");
  };
  const headers = ["model", ...WINDOWS.map(([l]) => l)];
  const rows: string[][] = allModels.map((name) => [name, ...WINDOWS.map((_, i) => cell(i, name))]);
  const totalTok = usages.map((u) => humanTokens(u.totalUsage?.totalTokensUsage ?? 0));
  const totalCalls = usages.map((u) => (u.totalUsage?.totalModelCallCount ?? 0).toLocaleString("en-US"));
  rows.push([bold("TOTAL tokens"), ...totalTok]);
  rows.push([bold("TOTAL calls"), ...totalCalls]);
  const aligns = ["l", "r", "r", "r", "r"];
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
    if (next) s += ` · nearest expiry ${fmtIST(parseZ8(next.expireTime).getTime(), false)} IST (${rel(parseZ8(next.expireTime).getTime())})`;
    if (expired.length) s += dim(` · ${expired.length} used/expired`);
    return s;
  };
  console.log(bold("RESET PACKS") + dim("  (customer-package-reset · PERSONAL)"));
  console.log(`  5-hour resets:  ${fmtPack(rd.fiveHourResets)}`);
  console.log(`  weekly resets:  ${fmtPack(rd.weekResets)}`);
  const last5 = rd.lastFiveHourResetTime ? parseZ8(rd.lastFiveHourResetTime) : null;
  if (last5) console.log(dim(`  last 5h auto-reset: ${fmtIST(last5.getTime(), false)} IST (${rel(last5.getTime())})`));
  if (rd.lastWeekResetTime) {
    const lw = parseZ8(rd.lastWeekResetTime);
    console.log(dim(`  last weekly auto-reset: ${fmtIST(lw.getTime(), false)} IST (${rel(lw.getTime())})`));
  }
}

if (args[0] === "summary" || args.includes("--summary")) {
  await getSummary();
} else if (args[0] === "usage" || args.includes("--usage")) {
  await getModelUsage();
} else {
  await getQuota();
}
