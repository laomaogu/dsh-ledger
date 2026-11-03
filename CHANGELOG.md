# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- Custom categories and multiple currencies
- Statement CSV import
- Configurable insight thresholds through plugin `Config`
- Year comparison and calendar heatmap

## [1.0.0] — 2026-11-03

### Added

- Sidebar wallet icon and a full-page `main` panel with **Overview**, **Records** and **Settings** tabs.
- Entry editor (expense/income, amount, 14 categories, date, 5 payment methods, note),
  row editing and confirmed deletion.
- Five chart dimensions drawn with inline SVG/CSS: daily trend, category donut,
  payment methods, weekday rhythm, six-month comparison — plus largest-expense ranking.
- KPI cards (spend, income, balance, daily average, remaining budget with progress),
  a one-sentence monthly summary and a scrollable recent-entry list.
- Rule engine with 19 insight codes (budget pace/projection, category concentration and
  spikes, month over month, expensive weekends, large and repeated expenses, saving rate,
  payment concentration, daily average), capped at six rows with warnings first, in Chinese and English.
- Host JSON store with atomic replacement, `600` file mode, corrupt-file quarantine and a
  serialized writer; monthly budget persistence.
- Same-origin HTTP API (`GET/POST /dsh-ledger/api`) behind the host connection trust fence.
- Three Agent tools: `ledger_add`, `ledger_report`, `ledger_delete`.
- Search, category filter, CSV and JSON export.
- Plugin Manager metadata and original SVG icon in Chinese and English.
