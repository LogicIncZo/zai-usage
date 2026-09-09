# zai-usage

Terminal CLI for the [Z.ai GLM Coding Plan](https://z.ai): quota, per-model
consumption across rolling windows, and quota-reset packs — in one ASCII
dashboard. Zero dependencies, single TypeScript file, runs on
[Bun](https://bun.sh).

Z.ai shows this data only in a web console. There is no official CLI. This
tool documents and drives three (undocumented but stable) monitor endpoints
so you can check usage from a terminal, a cron job, or a status bar.

```text
$ zai-usage summary
Z.AI GLM Coding Plan — LITE · as of 10 Sept, 05:03 IST

MODEL USAGE  (rolling windows + current month, UTC+8 · tokens with % share)
+---------------+-------------+--------------+--------------+--------------+---------------+
| model         |        Hour |    Day (24h) |    Week (7d) |  Month (30d) | Current month |
+---------------+-------------+--------------+--------------+--------------+---------------+
| GLM-5.3-Flash | 43.15M 100% | 110.05M 100% | 827.28M 100% |   1.50B  61% | 946.53M  96%  |
| GLM-5-Turbo   |           - |            - |            - | 521.84M  21% | 36.64M   4%   |
| GLM-5.3       |           - |            - |            - | 358.21M  15% | -             |
+---------------+-------------+--------------+--------------+--------------+---------------+
| TOTAL tokens  |      38.53M |      103.82M |      811.12M |        2.46B | 983.17M       |
+---------------+-------------+--------------+--------------+---------------+---------------+
| TOTAL calls   |         390 |        1,120 |        8,210 |       24,418 | 9,920         |
+---------------+-------------+-------------+--------------+--------------+---------------+

QUOTA
  Monthly tool calls  55% (55/100, 45 left) · resets Sat, 26 Sept, 22:40 IST (in 16d 17h)
  5-hour quota         3% · resets Thu, 10 Sept, 08:43 IST (in 3h 40m)

RESET PACKS  (customer-package-reset · PERSONAL)
  5-hour resets:  1 available · nearest expiry 01 Oct, 21:29 IST (in 21d 16h) · 1 used/expired
  weekly resets:  1 available · nearest expiry 01 Oct, 21:29 IST (in 21d 16h)
  last 5h auto-reset: 30 Aug, 11:17 IST (10d 17h ago)
```

## Install

Requires [Bun](https://bun.sh) and a Z.ai GLM Coding Plan API key.

```bash
git clone https://github.com/LogicIncZo/zai-usage.git
cd zai-usage
./install.sh        # symlinks into ~/.local/bin
export GLM_API_KEY=<your z.ai api key>
zai-usage
```

The key is read from `GLM_API_KEY` (falls back to `ZAI_API_KEY` /
`Z_AI_API_KEY`). On [Zo Computer](https://zo.computer), store it in
Settings → Advanced → Secrets.

## Usage

| Command | What it shows |
| --- | --- |
| `zai-usage` | Quota summary: plan, monthly tool calls, 5-hour quota, reset times |
| `zai-usage --json` | Raw quota API response |
| `zai-usage summary` | One-screen dashboard: model matrix + quota + reset packs |
| `zai-usage summary --json` | All raw payloads: `{fetchedAt, quota, resetPacks, windows}` |
| `zai-usage usage` | Today's model usage, hourly bar chart |
| `zai-usage usage 2026-09-09` | Model usage for a specific date |
| `zai-usage usage --from "2026-09-01 00:00:00" --to "2026-09-10 23:59:59"` | Arbitrary range (≤ 31 days, auto daily granularity) |
| `zai-usage usage --json` | Raw model-usage response |

Exit codes: `0` success, `1` missing API key or API error — safe to gate
scripts on it.

## API endpoints (undocumented)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/monitor/usage/quota/limit` | Plan level + per-window % used, `nextResetTime` per window |
| `GET /api/monitor/usage/model-usage?startTime=&endTime=` | Per-model tokens/calls in time buckets (`hourly`/`daily` auto) |
| `GET /api/biz/customer-package-reset/list?targetType=PERSONAL` | Purchased quota-reset packs (availability + expiry) |

All three take `Authorization: Bearer <GLM_API_KEY>`.

Quirks worth knowing (discovered the hard way):

- **The monitor API lives in UTC+8 (Beijing)** — it interprets request
  timestamps and bucket labels in that zone. The CLI computes rolling windows
  and "today" in Asia/Shanghai, then renders reset times in IST.
- **Time spans are capped at 31 days.** A 32-day span returns a 500.
- **Peak multiplier**: for most plans, GLM-5.3 consumes 3× quota during
  14:00–18:00 UTC+8 (11:30–15:30 IST) Mon–Fri and 1× off-peak; GLM-5.3-Flash
  is 1.2× peak / 0.4× off-peak. Schedule heavy agent runs off-peak.
- `modelSummaryList.totalTokens` can slightly exceed `totalTokensUsage` on
  partial buckets (API-side rounding; both are shown as reported).

## Roadmap

- [ ] Burn-rate projection — "at this pace the 5-hour window exhausts at HH:MM"
- [ ] Threshold alerts (Telegram/Discord webhook) at 50/80/95% of any window
- [ ] `--watch` live refresh mode
- [ ] Daily snapshots to CSV/DuckDB + `zai-usage trend` sparkline
- [ ] Multi-account / team-plan support
- [ ] npm publish (`bunx zai-usage`), CI smoke test, shell completions

## License

MIT
