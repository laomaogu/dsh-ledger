<p align="center"><img src="icon.svg" width="72" height="72" alt="dsh-ledger icon"></p>

# dsh-ledger — Personal Ledger for DeepSeek Harness

> A personal bookkeeping plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
> record every expense and income, analyse spending by **time, category, payment method, weekday and month**,
> get budget-aware tips, and read the result in inline SVG charts. Data never leaves the machine.

[中文](README.md) · [Changelog](CHANGELOG.md) · [Publishing](PUBLISHING.md) · [MIT License](LICENSE)

---

## Features

- **Fast entry** — expense/income, amount, 14 fixed categories, date, 5 payment methods, note.
  Click a row to edit; hover to delete (with confirmation).
- **Five chart dimensions** (hand-drawn SVG/CSS, no chart library, follows the host light/dark theme):
  - daily spending trend (area + line, today marked)
  - spending mix donut with legend
  - payment-method bars
  - weekday rhythm (weekdays vs weekends)
  - six-month expense/income comparison
- **Analysis** — monthly spend / income / balance / daily average / remaining budget, a daily allowance
  from the remaining budget, and a month-end projection at the current pace.
- **Automatic tips** — up to six rule-based insights (budget overrun, category spikes, month-over-month
  change, expensive weekends, large single expenses, repeated spending, saving rate), warnings first.
- **Chat bookkeeping** — three Agent tools (`ledger_add`, `ledger_report`, `ledger_delete`).
  Try “record lunch 25” or “how much did I spend this month?”.
- **Local first** — one JSON file, atomic writes, mode `600`. The HTTP API passes through the host’s
  connection trust fence, and nothing is ever uploaded.
- **Bilingual UI** — every panel string and the plugin metadata ship in Chinese and English.

## Layout (schematic)

```
Overview (vertical scroll)
├─ KPI row: spent · income · balance · daily average · budget left (with progress)
├─ monthly summary sentence
├─ daily spending trend (full width, area + line)
├─ spending mix (left, donut) · insights (right, up to 6)
├─ payment methods · weekday rhythm · largest entries (three columns)
├─ last six months: expense vs income (full width)
└─ recent entries (full width, click to edit · hover to delete)
```

Tabs: **Overview** / **Records** (search + category filter) / **Settings** (budget, data file, CSV/JSON export).

## Install

### Plugin Manager (recommended)

1. Open the **Plugins** page in the DSH Web UI.
2. Install this directory, the repository URL, or the npm package name.
3. Enable the `dsh-ledger` bundle.
4. A wallet icon **Ledger** appears at the bottom of the sidebar.

### Command line

```sh
# Local directory (creates a link dependency)
dsh plugin --profile <profile> add /path/to/dsh-ledger

# Or straight from GitHub
dsh plugin --profile <profile> add github:<owner>/dsh-ledger
```

Then enable the `dsh-ledger` bundle on the Plugins page.

> The loader row id is `personal-ledger`; the package name is `dsh-ledger`.
> Both live in [`cordis.patch.yml`](cordis.patch.yml) and [`package.json`](package.json).

## Usage

- **Add** — the “Add entry” button in the header. Saving jumps to the month of that entry.
- **Read** — the Overview tab; the summary line explains the month in one sentence.
- **Find** — the Records tab: search notes/categories/amounts, filter by category, edit or delete rows.
- **Budget** — Settings: a monthly budget (0/empty means none); insights adapt to it.
- **Export** — Settings: CSV or JSON for the selected month.

### Chat examples

```
record lunch 25
taxi yesterday 38, paid with Alipay
how much did I spend this month? where can I save?
delete the coffee entry I just added
```

| Tool | Purpose |
|---|---|
| `ledger_add` | Record one expense/income: `amount` (required), `type`, `category`, `date`, `method`, `note` |
| `ledger_report` | Monthly report: totals, categories, methods, weekday pattern, month-over-month, tips, latest ten entries with ids |
| `ledger_delete` | Delete one entry by id |

## Insight rules

At most six rows, ordered `warn → tip → ok → info`. Thresholds live in `buildInsights()` in
[`index.js`](index.js):

| Insight | Trigger |
|---|---|
| Over / near / healthy budget | used ≥ 100% / ≥ 85% / otherwise |
| Daily allowance | mid-month, under budget: remaining budget ÷ remaining days |
| Projected overspend | month-end projection > budget (and not already over) |
| Dominant category | top category share ≥ 45% and spend ≥ 300 |
| Category spike | among the top three: > last month × 1.3 and ≥ 100 more |
| Month over month | ≥ 25% and ≥ 100 more / ≥ 20% and ≥ 100 less |
| Expensive weekends | weekend daily average > weekday average × 1.5 |
| Large expense | biggest single entry ≥ 40% of the month and ≥ 200 |
| Repeated spending | the same non-empty note appears ≥ 4 times |
| Surplus / deficit | with income: balance ≥ 0 / < 0; without income and ≥ 5 expenses: prompt to record income |
| Payment concentration | ≥ 3 methods and the first ≥ 60% (spend ≥ 500) |
| Daily average | whenever the month has elapsed days |

> These are heuristics, not financial advice.

## Data and privacy

- File: `~/.dsh/personal-ledger/ledger.json` (directory `700`, file `600`, atomic replace).
- Shape:

```json
{
  "version": 1,
  "budget": 5000,
  "entries": [
    {
      "id": "m1abc2def3",
      "type": "expense",
      "amount": 25.5,
      "date": "2026-11-03",
      "category": "food",
      "method": "wechat",
      "note": "lunch",
      "createdAt": "2026-11-03T04:00:00.000Z",
      "updatedAt": "2026-11-03T04:00:00.000Z"
    }
  ]
}
```

- An unreadable document is renamed to `ledger.json.corrupt-<timestamp>` before the ledger starts empty.
- **No telemetry.** The only network call is a same-origin `fetch` from the panel to the local DSH host.
- Deletes are permanent; export first if you need a backup.

## Architecture

```
Browser (Client half, client.js)                 Host (index.js)
┌───────────────────────────┐   fetch    ┌──────────────────────────────┐
│ sidebar.panellist (icon)   │ ─────────▶ │ /dsh-ledger/api              │
│ main (full-page panel)     │ same-origin│  · connection trust fence    │
│ · Overview / Records / ... │ ◀───────── │  · validation + atomic store │
│ · five SVG charts          │  snapshot  │  · analysis + insight rules  │
│ · entry form / edit / del  │            │  · three Agent tools         │
└───────────────────────────┘            └──────────────┬───────────────┘
                                                        │
                                        ~/.dsh/personal-ledger/ledger.json
```

- **The Host is the single source of truth**: totals, shares and insights are computed in
  `buildSnapshot()`; the panel only renders. The Agent tools and the panel therefore never disagree.
- **HTTP**: `GET /dsh-ledger/api?month=YYYY-MM` returns a snapshot; `POST /dsh-ledger/api` applies
  `{ op: "add" | "update" | "remove" | "setBudget", ... }`. Both call
  `connection.requestRejection(req)` first, so unauthenticated callers get 401/403.
- **The Client depends only on theme tokens** (`--dsw-alias-*`) and the browser’s built-in React;
  it imports no DSH Client package.

## Development

```sh
git clone <repo>
cd dsh-ledger

node --check index.js
node --check client.js
npm run check

dsh plugin --profile web add "$PWD"   # link install for live iteration
```

```
dsh-ledger/
├── index.js            Host half: store, analysis, insights, HTTP API, Agent tools
├── client.js           Client half: panel, charts, forms (window.__ModuleLoader__ factory)
├── cordis.patch.yml    inserts the id=personal-ledger row
├── package.json        manifest (dsh.bundle + dsh.client)
├── locale/{zh,en}.json Plugin Manager display metadata
├── icon.svg            original artwork
└── README.md / README.en.md / CHANGELOG.md / LICENSE / PUBLISHING.md
```

Debugging notes:

- The Host logs `[dsh-ledger] host ready: <data file>` on activation.
- The panel registers in `main` (key `ledger`) and `sidebar.panellist` (id `ledger`).
- `client.js` changes appear after a page refresh or the HMR reload; Host changes need a DSH restart.

## Compatibility

- Developed and verified on DSH `0.2.1-rc.5`, Node `22.23.4`, Web GUI profile.
- `engines.node >= 22.19.0`, `engines.dsh ^0.2.1-alpha.2`.
- Node builtins only (`node:fs/promises`, `node:os`, `node:path`); no runtime dependencies.

## Known limitations

- CNY only, amount ≤ 1e9, note ≤ 120 chars, ≤ 50k entries.
- Categories are a fixed built-in set; custom categories are not editable in the UI yet.
- Agent-tool report text is Chinese-only (the panel itself is bilingual).
- No statement import, multi-account or multi-user support.
- The panel refreshes every 25 s or when the window regains focus, not live.

## Roadmap

- [ ] Custom categories and multiple currencies
- [ ] Alipay / WeChat statement CSV import
- [ ] Configurable thresholds via plugin `Config`
- [ ] Year comparison and calendar heatmap
- [ ] Screenshots and a demo GIF

## License

[MIT](LICENSE) © 2026 dsh-ledger contributors
