# zai-usage

[![npm](https://img.shields.io/npm/v/zai-usage)](https://www.npmjs.com/package/zai-usage)
[![Release](https://img.shields.io/github/v/release/LogicIncZo/zai-usage)](https://github.com/LogicIncZo/zai-usage/releases)
[![tests](https://github.com/LogicIncZo/zai-usage/actions/workflows/test.yml/badge.svg)](https://github.com/LogicIncZo/zai-usage/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Bun](https://img.shields.io/badge/runtime-bun-f472b6?logo=bun)
![deps](https://img.shields.io/badge/dependencies-zero-brightgreen)

Terminal CLI for the Z.ai GLM Coding Plan: quota windows, rolling-window model usage, and reset-pack inventory — in one colored ASCII view.

![zai-usage terminal screenshot](docs/screenshot.png)

Single-file Bun/TypeScript, zero dependencies. Talks to four undocumented Z.ai endpoints — three monitor endpoints plus the platform billing API — with your GLM Coding Plan API key.

## Install

```bash
# npm / bun
bunx zai-usage            # run without installing
npm i -g zai-usage       # or install globally

# curl one-liner
curl -fsSL https://raw.githubusercontent.com/LogicIncZo/zai-usage/main/install.sh | bash
```

The installer drops the script into `~/.local/bin/zai-usage` and adds that to `PATH` in `~/.bashrc` if missing. Requires [bun](https://bun.sh) and `ZAI_API_KEY` (or `Z_AI_API_KEY` / `GLM_API_KEY`) in your environment.

No plan yet? Subscribe to the GLM Coding Plan via [my referral link](https://z.ai/subscribe?ic=5CA0GFZ4CO) — starts at $18/month.

Manual install — grab the single file yourself:

```bash
curl -fsSL -o ~/.local/bin/zai-usage https://raw.githubusercontent.com/LogicIncZo/zai-usage/main/zai-usage.ts
chmod +x ~/.local/bin/zai-usage
```

## Usage

```text
Z.AI GLM Coding Plan — PRO · as of 12 Sept, 09:17 UTC
5-HOUR QUOTA [#########-----------]  47% · resets Sat, 12 Sept, 11:30 UTC (in 2h 13m)

MODEL USAGE  (5h quota window · rolling windows · current month · UTC+8 · tokens with % share)
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| model         |     5h Quota |        Hour |    Day (24h) |    Week (7d) |  Month (30d) | Current month |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| GLM-5.3-Flash | 156.00M  76% | 51.00M  75% |   1.47B  76% |   7.72B  71% |  55.10B  82% |   17.20B  76% |
| GLM-5-Turbo   |  29.80M  14% |  9.93M  15% | 275.00M  14% |   1.54B  14% |   6.05B   9% |    3.22B  14% |
| GLM-5.3       |  14.50M   7% |  4.69M   7% | 138.00M   7% |   1.31B  12% |   5.25B   8% |    1.61B   7% |
| GLM-5.2       |   5.03M   2% |  1.67M   2% |  46.70M   2% | 257.00M   2% |   1.00B   1% |  547.00M   2% |
| GLM-4.7       |  522.0K   0% | 313.0K   0% |   5.00M   0% |  49.00M   0% | 195.00M   0% |   58.60M   0% |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| TOTAL tokens  |      198.00M |      64.90M |        1.86B |       10.40B |       64.90B |        21.70B |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| TOTAL calls   |           95 |          33 |          889 |        4,801 |       32,040 |        10,419 |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+

QUOTA
  5-hour quota        47% · resets Sat, 12 Sept, 11:30 UTC (in 2h 13m)
  Monthly tool calls  38% (38/100, 62 left) · resets Tue, 29 Sept, 03:44 UTC (in 16d 18h)

RESET PACKS  (customer-package-reset · PERSONAL)
  5-hour resets:  3 available · nearest expiry 07 Nov, 15:59 UTC (in 56d 6h) · 1 used/expired
  weekly resets:  2 available · nearest expiry 07 Nov, 15:59 UTC (in 56d 6h)
  last 5h auto-reset: 10 Sept, 22:02 UTC (1d 11h ago)
```

### Billing (list-price insights)

`bill` reads the platform billing API — the same day-level ledger behind the Z.ai
console's billing page — and turns it into spend insights. `customerId` is
auto-discovered from the reset-pack endpoint.

```text
BILL 2026-09  (platform-charge-zai/bill/day · 148 rows · 21 days · UTC+8 billing days)
  List-price spend   $227.10  (pay-as-you-go list value of this usage)
  Actually billed    $0.00  (cash $0.00 · credits $0.00 · gift $0.00)
  Plan-covered       $227.10  (list value absorbed by your coding-plan package)
  Calls 9,603 · Tokens 1.55B  (in 269.61M · cache 1.21B · out 67.56M)
  Cache savings      $267.73  (cached tokens billed 80% below input list)
  Blended list cost  $0.15 per 1M tokens
  Peak day           2026-09-11  ($13.67)
  MoM                +38.9%  ($163.52 across 2026-08)

2026-09-01     $11.45     513 calls    63.49M tokens  ███████████████████████
2026-09-02     $13.44     428 calls    88.03M tokens  ████████████████████████████
...
+---------------+---------+-------+------------+-------+
| model         |  tokens | calls | list spend | share |
+---------------+---------+-------+------------+-------+
| glm-5.3       | 238.85M | 1,764 |    $128.77 |   57% |
| glm-5.3-flash |   1.30B | 7,608 |     $96.99 |   43% |
| glm-5.2       |   6.33M |   223 |      $1.27 |    1% |
| web-reader    |       0 |     8 |      $0.08 |    0% |
+---------------+---------+-------+------------+-------+
```

All amounts are computed from **list (pay-as-you-go) prices** in the ledger — what
the same usage would have cost without the plan — so "plan-covered" shows the value
your subscription absorbs and "cache savings" shows what prompt-cache pricing saves
against input list. (Synthetic `--demo` data above.)

### Times & timezones

- **API side (fixed):** the Z.ai monitor API interprets request ranges and bucket labels in **Asia/Shanghai (UTC+8)**. The CLI keeps bucket labels in UTC+8 and says so.
- **Display side (yours):** reset times render in your system timezone by default. Override per run with `--tz <IANA zone>` or persistently via the standard `TZ` environment variable. The summary header shows which zone is in effect.

### Example output (synthetic data)

Everything below is generated by `zai-usage summary --demo` — no real account data:

```text
Z.AI GLM Coding Plan — PRO · as of 12 Sept, 09:17 UTC
5-HOUR QUOTA [#########-----------]  47% · resets Sat, 12 Sept, 11:30 UTC (in 2h 13m)

MODEL USAGE  (5h quota window · rolling windows · current month · UTC+8 · tokens with % share)
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| model         |     5h Quota |        Hour |    Day (24h) |    Week (7d) |  Month (30d) | Current month |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| GLM-5.3-Flash | 156.00M  76% | 51.00M  75% |   1.47B  76% |   7.72B  71% |  55.10B  82% |   17.20B  76% |
| GLM-5-Turbo   |  29.80M  14% |  9.93M  15% | 275.00M  14% |   1.54B  14% |   6.05B   9% |    3.22B  14% |
| GLM-5.3       |  14.50M   7% |  4.69M   7% | 138.00M   7% |   1.31B  12% |   5.25B   8% |    1.61B   7% |
| GLM-5.2       |   5.03M   2% |  1.67M   2% |  46.70M   2% | 257.00M   2% |   1.00B   1% |  547.00M   2% |
| GLM-4.7       |  522.0K   0% | 313.0K   0% |   5.00M   0% |  49.00M   0% | 195.00M   0% |   58.60M   0% |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| TOTAL tokens  |      198.00M |      64.90M |        1.86B |       10.40B |       64.90B |        21.70B |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+
| TOTAL calls   |           95 |          33 |          889 |        4,801 |       32,040 |        10,419 |
+---------------+--------------+-------------+--------------+--------------+--------------+---------------+

QUOTA
  5-hour quota        47% · resets Sat, 12 Sept, 11:30 UTC (in 2h 13m)
  Monthly tool calls  38% (38/100, 62 left) · resets Tue, 29 Sept, 03:44 UTC (in 16d 18h)

RESET PACKS  (customer-package-reset · PERSONAL)
  5-hour resets:  3 available · nearest expiry 07 Nov, 15:59 UTC (in 56d 6h) · 1 used/expired
  weekly resets:  2 available · nearest expiry 07 Nov, 15:59 UTC (in 56d 6h)
  last 5h auto-reset: 10 Sept, 22:02 UTC (1d 11h ago)
```

## Agent-first use cases

Built for machines first: keyless `--help` / `--version`, `--json` in every mode, deterministic exit codes, zero interactive prompts, and a demo mode so an agent can self-verify a fresh install with no credentials.

**`check` exit codes:** `0` = quota OK (left ≥ `--min`%), `1` = low, `2` = error or window not reported.

**1. Gate heavy agent runs on the 5-hour window**

```bash
zai-usage check --min 25 && run-the-expensive-thing
```

**2. Wait for reset instead of failing**

```bash
while ! zai-usage check --min 30; do
  sleep $(( $(zai-usage check --json --window 5h | jq -r .resetsInMin) * 60 ))
done
```

**3. Budget MCP tool calls separately**

`search-prime` / `web-reader` / `zread` calls live in their own monthly window:

```bash
zai-usage check --window monthly-tools --min 20 || use-local-tools
```

**4. Session-start budget brief (Claude Code / OpenCode hooks)**

```json
{ "hooks": { "SessionStart": [{ "command": "zai-usage summary" }] } }
```

The agent sees its own remaining budget before its first tool call.

**5. Keyless self-test for fresh installs**

```bash
zai-usage --demo --json      # full pipeline on synthetic fixtures, no key
zai-usage --help             # discover the surface
```

**6. Snapshots for dashboards and trend logs**

```bash
*/15 * * * * zai-usage summary --json >> ~/zai-usage-log.jsonl
```

Every mode emits one JSON document — trivial to append, chart, or feed to DuckDB.

**7. Nightly billing snapshot for cost dashboards**

```bash
0 23 * * * zai-usage bill --json >> ~/zai-billing-log.jsonl
```

Each ledger row carries the full cost decomposition (list price, cash, credits, gift,
plan deduction) — chart real spend and "what this would cost retail" side by side.

### Tests

```bash
bun test        # 31 unit tests — no API key needed (pure functions + demo fixtures)
```

## What it reports

| Section | Contents |
| --- | --- |
| 5-HOUR QUOTA | Token quota percentage with progress bar, reset time, and a peak-window hint (GLM-5.3 burns 3× quota 14:00–18:00 UTC+8 Mon–Fri) |
| MODEL USAGE | Tokens and % share per model across the current 5-hour quota window plus Hour / 24h / 7d / 30d / current-month rolling windows |
| QUOTA | 5-hour + monthly tool-call limits, usage detail per tool (search-prime, web-reader, zread), reset times |
| RESET PACKS | Purchased quota-reset packs: available count, nearest expiry, last auto-reset |
| BILL | Day-level billing ledger: list-price spend, actually billed vs plan-covered, input/cache/output token split, prompt-cache savings, blended cost per 1M tokens, peak day, month-over-month, per-day bars + per-model table |

## API endpoints

| Endpoint | Used for |
| --- | --- |
| `GET /api/monitor/usage/quota/limit` | plan level, 5-hour token %, monthly tool-call counters |
| `GET /api/monitor/usage/model-usage?startTime=&endTime=` | per-model tokens/calls in a time span (intraday precision — the `5h Quota` column queries `nextResetTime − 5h → now`) |
| `GET /api/biz/customer-package-reset/list?targetType=PERSONAL` | reset-pack inventory |
| `GET /api/platform-charge-zai/bill/day?customerId=&billingPeriod=YYYY-MM&pageNum=&pageSize=` | day-level billing records; `customerId` auto-discovered from the reset-pack endpoint; paginated (100 rows/page) |

Auth: `Authorization: Bearer <api-key>` — the same key Z.ai issues for the GLM Coding Plan.

## Quirks

- Request timestamps and bucket labels are **Asia/Shanghai (UTC+8)**, not UTC. Reset times display in your local timezone (`TZ` / `--tz`).
- `model-usage` rejects spans longer than **31 days** — chunk longer ranges yourself.
- Granularity is auto: spans ≤ 48 h return hourly buckets, longer spans daily.
- `granularity` and bucket labels are server-controlled; the CLI infers bucket width from the span.
- The 5-hour window is a rolling quota, not a fixed window; reset packs add manual resets.
- Bill rows are per **(day, model, token-type)** — INPUT / CACHE / OUTPUT price separately; tool products (web-reader, search) bill per `time` unit.
- The ledger reports list prices; rows covered by a coding-plan package show ~$0 actually billed. `bill` therefore reports list value + how much of it the plan/cache absorbed. Amounts are in the account's billing currency (USD on api.z.ai).

## Get the GLM Coding Plan

🚀 Full support for Claude Code, Cline, and 20+ top coding tools, starting at $18/month. Subscribe via referral link: **[z.ai/subscribe?ic=5CA0GFZ4CO](https://z.ai/subscribe?ic=5CA0GFZ4CO)**

(Yes, that's a referral link — it supports the project.)

## License

MIT
