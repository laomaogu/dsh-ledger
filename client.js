/**
 * dsh-ledger — Client half.
 *
 * Registers one global panel in the sidebar (`sidebar.panellist` → `main`) and
 * renders the whole bookkeeping app there: month navigation, KPI cards, five
 * chart dimensions (daily trend, category composition, payment method, weekday
 * rhythm, six-month comparison), rule-based tips, a searchable record list and
 * settings. Every number and insight comes from the Host's `/dsh-ledger/api`
 * snapshot, so the panel, the Agent tools and the file on disk never disagree.
 *
 * Charts are hand-drawn SVG / CSS bars; the only styling dependencies are the
 * host's `--dsw-*` theme tokens, so light/dark and future theme changes follow.
 */

window.__ModuleLoader__.load({
  id: 'dsh-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'ledger';
    const PANEL_ID = 'ledger';
    const API = '/dsh-ledger/api';
    const APP_VERSION = '1.0.0';
    const REFRESH_MS = 25000;

    /* ---------------------------------------------------------------- *
     * Styles — tokens only, `pl-` prefix
     * ---------------------------------------------------------------- */

    const CSS = `
.pl-page, .pl-page * { box-sizing: border-box; }
.pl-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.55;
}
.pl-inner { width: 100%; max-width: 1100px; margin: 0 auto; padding: 0 clamp(18px, 3.2vw, 44px) 56px; }
.pl-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 20px; padding: 26px 0 14px; }
.pl-heading { min-width: 0; }
.pl-title { margin: 0; font-size: 22px; font-weight: 600; line-height: 30px; letter-spacing: -0.01em; }
.pl-sub { margin: 3px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.pl-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 10px;
  border: .5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
  cursor: pointer; white-space: nowrap; text-decoration: none;
}
.pl-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pl-btn:disabled { opacity: .5; cursor: default; }
.pl-btn-icon { width: 30px; height: 30px; padding: 0; border-radius: 8px; }
.pl-btn-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font-weight: 500;
}
.pl-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.pl-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: transparent; background: transparent; }
.pl-btn-danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }
.pl-month { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: .5px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.pl-month-label { min-width: 108px; padding: 0 4px; text-align: center; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
.pl-tabs { display: flex; align-items: center; gap: 22px; border-bottom: .5px solid var(--dsw-alias-border-l3); margin-bottom: 16px; }
.pl-tab { position: relative; padding: 7px 0 11px; border: 0; background: none; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 13px; cursor: pointer; }
.pl-tab:hover { color: var(--dsw-alias-label-secondary); }
.pl-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.pl-tab[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--dsw-alias-state-business-primary); }
.pl-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.pl-kpi { min-width: 0; padding: 11px 13px 12px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.pl-kpi-label { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.pl-kpi-value { margin-top: 3px; font-size: 21px; font-weight: 600; line-height: 28px; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-kpi-value-income { color: var(--dsw-alias-state-success-primary); }
.pl-kpi-value-warn { color: var(--dsw-alias-state-warn-primary); }
.pl-kpi-value-muted { color: var(--dsw-alias-label-tertiary); font-weight: 500; }
.pl-kpi-note { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-kpi-note-warn { color: var(--dsw-alias-state-warn-label); }
.pl-progress { position: relative; height: 4px; margin-top: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.pl-progress-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--dsw-alias-state-business-primary); }
.pl-progress-warn .pl-progress-fill { background: var(--dsw-alias-state-warn-primary); }
.pl-progress-over .pl-progress-fill { background: var(--dsw-alias-state-error-primary); }
.pl-summary { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 14px; padding: 9px 12px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.pl-summary svg { flex: none; margin-top: 2px; color: var(--dsw-alias-label-tertiary); }
.pl-summary p { margin: 0; }
.pl-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
.pl-col-12 { grid-column: span 12; }
.pl-col-8 { grid-column: span 8; }
.pl-col-6 { grid-column: span 6; }
.pl-col-4 { grid-column: span 4; }
.pl-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 13px 15px 15px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1); }
.pl-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.pl-card-title { margin: 0; font-size: 13px; font-weight: 500; }
.pl-card-sub { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; }
.pl-card-link { border: 0; background: none; padding: 0; color: var(--dsw-alias-state-business-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.pl-chart { width: 100%; height: auto; display: block; overflow: visible; }
.pl-chart text { font-family: inherit; }
.pl-axis-label { fill: var(--dsw-alias-label-tertiary); font-size: 10px; }
.pl-grid-line { stroke: var(--dsw-alias-border-l1); stroke-width: 1; }
.pl-hit:hover { fill: var(--dsw-alias-interactive-bg-hover); }
.pl-donut-wrap { display: flex; align-items: center; gap: 14px; min-width: 0; }
.pl-donut-svg { flex: none; width: 148px; height: 148px; }
.pl-legend { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.pl-legend-row { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto auto; align-items: center; gap: 7px; font-size: 12px; }
.pl-dot { width: 8px; height: 8px; border-radius: 50%; }
.pl-legend-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.pl-legend-amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pl-legend-share { color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; width: 34px; text-align: right; }
.pl-bars { display: flex; flex-direction: column; gap: 9px; }
.pl-bar-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12px; }
.pl-bar-label { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); }
.pl-bar-label span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-bar-amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pl-bar-share { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.pl-bar-track { grid-column: 1 / -1; height: 6px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.pl-bar-fill { height: 100%; border-radius: 6px; }
.pl-emoji { font-size: 13px; line-height: 1; }
.pl-insights { display: flex; flex-direction: column; gap: 7px; }
.pl-insight { display: flex; align-items: flex-start; gap: 8px; padding: 7px 9px; border-radius: 10px; background: var(--dsw-alias-bg-base); font-size: 12px; }
.pl-insight-icon { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; }
.pl-insight-body { min-width: 0; }
.pl-insight-title { font-weight: 500; }
.pl-insight-text { color: var(--dsw-alias-label-secondary); }
.pl-insight-warn { background: var(--dsw-alias-state-warn-tertiary); }
.pl-insight-warn .pl-insight-icon { color: var(--dsw-alias-state-warn-label); }
.pl-insight-ok .pl-insight-icon { color: var(--dsw-alias-state-success-primary); }
.pl-insight-tip .pl-insight-icon { color: var(--dsw-alias-state-business-primary); }
.pl-insight-info .pl-insight-icon { color: var(--dsw-alias-label-tertiary); }
.pl-empty-block { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 34px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.pl-empty-block h2 { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 14px; font-weight: 500; }
.pl-empty-block p { margin: 0; font-size: 12px; }
.pl-empty-action { margin-top: 6px; }
.pl-records { display: flex; flex-direction: column; }
.pl-record { display: grid; grid-template-columns: 74px minmax(0, 1fr) 62px 92px 46px; align-items: center; gap: 8px; min-height: 38px; border-bottom: .5px solid var(--dsw-alias-border-l1); }
.pl-record:last-child { border-bottom: 0; }
.pl-record-main { display: grid; grid-template-columns: 74px minmax(0, 1fr); grid-column: 1 / 3; align-items: center; gap: 8px; min-width: 0; padding: 5px 0; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.pl-record-main:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pl-record-date { color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pl-record-date small { font-size: 10px; margin-left: 3px; }
.pl-record-label { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pl-record-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-record-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.pl-record-method { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-record-amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 500; }
.pl-record-amount-income { color: var(--dsw-alias-state-success-primary); }
.pl-record-actions { display: flex; justify-content: flex-end; }
.pl-record-del { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 7px; background: none; color: var(--dsw-alias-label-tertiary); cursor: pointer; opacity: 0; }
.pl-record:hover .pl-record-del, .pl-record-del:focus-visible { opacity: 1; }
.pl-record-del:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger); }
.pl-record-confirm { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 4px 0 9px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.pl-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.pl-search { flex: 1 1 220px; min-width: 160px; }
.pl-input, .pl-select {
  width: 100%; height: 34px; padding: 0 10px;
  border: .5px solid var(--dsw-alias-border-l2); border-radius: 10px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; outline: none;
}
.pl-input:focus, .pl-select:focus { border-color: var(--dsw-alias-state-business-primary); }
.pl-input::placeholder { color: var(--dsw-alias-label-caption); }
.pl-select { flex: 0 0 auto; width: auto; min-width: 104px; }
.pl-form { display: flex; flex-direction: column; gap: 12px; }
.pl-field { display: flex; flex-direction: column; gap: 5px; }
.pl-field-label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.pl-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 10px; background: var(--dsw-alias-bg-layer-3); }
.pl-seg-btn { height: 28px; padding: 0 14px; border: 0; border-radius: 8px; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.pl-seg-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.pl-amount-wrap { position: relative; display: flex; align-items: center; }
.pl-amount-prefix { position: absolute; left: 12px; color: var(--dsw-alias-label-tertiary); font-size: 16px; pointer-events: none; }
.pl-amount-input { height: 46px; padding: 0 12px 0 30px; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pl-chip { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border: .5px solid var(--dsw-alias-border-l2); border-radius: 15px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.pl-chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pl-chip[aria-pressed="true"] { border-color: transparent; background: var(--dsw-alias-button-ghost-active-fill); color: var(--dsw-alias-label-primary); box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border); }
.pl-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pl-form-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.pl-dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.pl-dialog-actions .pl-spacer { flex: 1; }
.pl-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 18px; background: var(--dsw-alias-bg-mask-1); }
.pl-dialog { width: min(470px, 100%); max-height: calc(100dvh - 36px); overflow: auto; padding: 18px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 18px; background: var(--dsw-alias-bg-overlay); box-shadow: var(--dsw-elevation-prominent); }
.pl-dialog-title { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.pl-settings { display: flex; flex-direction: column; gap: 12px; max-width: 680px; }
.pl-settings-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pl-settings-input { width: 150px; }
.pl-hint { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.pl-kv { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.pl-kv code { padding: 2px 6px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3); font-size: 11px; word-break: break-all; }
.pl-saved { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.pl-notice { margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.pl-loading { display: flex; flex-direction: column; gap: 10px; padding: 60px 0; }
.pl-skeleton { height: 60px; border-radius: 14px; background: var(--dsw-alias-bg-skeleton); }
.pl-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.pl-field .pl-select { width: 100%; }
.pl-page :focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.pl-record-main:focus-visible { outline-offset: -2px; }
@media (max-width: 1000px) {
  .pl-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pl-col-8, .pl-col-6, .pl-col-4 { grid-column: span 12; }
  .pl-donut-wrap { flex-wrap: wrap; justify-content: center; }
  .pl-legend { min-width: 200px; }
}
@media (max-width: 640px) {
  .pl-record { grid-template-columns: 62px minmax(0, 1fr) 84px 38px; }
  .pl-record-main { grid-template-columns: 62px minmax(0, 1fr); }
  .pl-record-method { display: none; }
  .pl-record-date small { display: none; }
  .pl-title { font-size: 19px; }
}
`;

    /* ---------------------------------------------------------------- *
     * Locale dictionaries
     * ---------------------------------------------------------------- */

    const zh = {
      panel: '记账本',
      'page.title': '记账本',
      'page.sub': '记录每一笔，看清钱的去向',
      'action.add': '记一笔',
      'action.addPlain': '记一笔',
      'action.edit': '编辑',
      'action.save': '保存',
      'action.cancel': '取消',
      'action.delete': '删除',
      'action.deleteConfirm': '确认删除',
      'action.retry': '重试',
      'action.exportCsv': '导出 CSV',
      'action.exportJson': '导出 JSON',
      'action.saveBudget': '保存预算',
      'action.prevMonth': '上一月',
      'action.nextMonth': '下一月',
      'action.today': '回到本月',
      'tab.overview': '概览',
      'tab.records': '明细',
      'tab.settings': '设置',
      'kpi.expense': '本月支出',
      'kpi.income': '本月收入',
      'kpi.net': '本月结余',
      'kpi.avg': '日均支出',
      'kpi.budget': '预算剩余',
      'kpi.noBudget': '未设置预算',
      'kpi.count': '{n} 笔支出',
      'kpi.incomeCount': '{n} 笔收入',
      'kpi.netNote': '收入减去支出',
      'kpi.vsPrevUp': '较上月 +{pct}%',
      'kpi.vsPrevDown': '较上月 -{pct}%',
      'kpi.vsPrevFlat': '与上月持平',
      'kpi.projected': '预计月末 {amount}',
      'kpi.ofBudget': '已用 {pct}%',
      'kpi.leftDays': '余 {days} 天',
      'chart.trend': '每日支出趋势',
      'chart.trendSub': '本月每天花了多少',
      'chart.category': '支出构成',
      'chart.categorySub': '按分类看钱花在哪',
      'chart.method': '支付方式',
      'chart.methodSub': '钱从哪个渠道出去',
      'chart.weekday': '星期分布',
      'chart.weekdaySub': '工作日与周末的节奏',
      'chart.months': '近六个月',
      'chart.monthsSub': '支出与收入对比',
      'chart.rank': '单笔排行',
      'chart.rankSub': '本月最大的几笔支出',
      'chart.empty': '本月还没有数据',
      'chart.otherTotal': '本月支出',
      'legend.expense': '支出',
      'legend.income': '收入',
      'insights.title': '消费提示',
      'insights.sub': '根据本月数据自动生成',
      'insights.none': '暂无提示',
      'summary.none': '本月还没有账目，记一笔就能开始分析。',
      'summary.noExpense': '本月没有支出，收入 {amount}。',
      'summary.base': '本月共记 {n} 笔支出，合计 {total}',
      'summary.top': '{cat}占比最高（{share}%）',
      'summary.up': '比上月多花 {pct}%',
      'summary.down': '比上月少花 {pct}%',
      'summary.flat': '与上月基本持平',
      'summary.net': '本月结余 {amount}',
      'summary.join': '，',
      'records.recent': '最近记录',
      'records.all': '全部明细',
      'records.empty': '本月还没有记录',
      'records.emptyHint': '点「记一笔」开始记录，或让助手在对话里帮你记账。',
      'records.search': '搜索备注、分类或金额',
      'records.allCats': '全部分类',
      'records.noMatch': '没有匹配的记录',
      'records.sum': '共 {n} 笔 · 支出 {expense} · 收入 {income}',
      'records.confirm': '删除这笔记录？',
      'settings.budget': '月度预算',
      'settings.budgetHint': '设置每月预算后，记账本会提示剩余额度和超支风险；填 0 或留空表示不设预算。',
      'settings.data': '数据',
      'settings.dataFile': '数据文件',
      'settings.total': '全部记录',
      'settings.range': '记录跨度',
      'settings.exportHint': '导出当前月份的明细，便于备份或在表格软件中分析。',
      'settings.about': '关于',
      'settings.aboutText': '记账本 {version}：数据保存在本机，不会上传；也可以在对话里让助手记账，例如「记一笔：午饭 25 元」。',
      'settings.saved': '已保存',
      'form.addTitle': '记一笔',
      'form.editTitle': '编辑记录',
      'form.type': '类型',
      'form.typeExpense': '支出',
      'form.typeIncome': '收入',
      'form.amount': '金额',
      'form.amountPlaceholder': '0.00',
      'form.category': '分类',
      'form.date': '日期',
      'form.method': '支付方式',
      'form.note': '备注',
      'form.notePlaceholder': '例如：公司楼下便利店',
      'form.invalidAmount': '请输入大于 0 的金额',
      'form.invalidDate': '请选择合法日期',
      'error.load': '加载失败',
      'error.network': '无法连接记账服务，请稍后重试。',
      'error.save': '保存失败',
      'empty.title': '本月还没有账目',
      'empty.hint': '从第一笔开始，记账本会帮你分析消费并给出提示。',
      'empty.action': '记下第一笔',
      'cat.food': '餐饮',
      'cat.transport': '交通',
      'cat.shopping': '购物',
      'cat.housing': '居住',
      'cat.entertainment': '娱乐',
      'cat.health': '医疗',
      'cat.education': '学习',
      'cat.social': '人情',
      'cat.telecom': '通讯',
      'cat.other': '其他',
      'cat.rest': '其他（聚合）',
      'cat.salary': '工资',
      'cat.bonus': '奖金',
      'cat.investment': '理财',
      'cat.other-income': '其他收入',
      'method.wechat': '微信',
      'method.alipay': '支付宝',
      'method.card': '银行卡',
      'method.cash': '现金',
      'method.other': '其他',
      'week.sun': '周日',
      'week.mon': '周一',
      'week.tue': '周二',
      'week.wed': '周三',
      'week.thu': '周四',
      'week.fri': '周五',
      'week.sat': '周六',
      'weekShort.sun': '日',
      'weekShort.mon': '一',
      'weekShort.tue': '二',
      'weekShort.wed': '三',
      'weekShort.thu': '四',
      'weekShort.fri': '五',
      'weekShort.sat': '六',
      'ins.empty': '{month} 还没有任何记录。',
      'ins.budget_over': '本月支出已超出预算 {over}（用掉预算的 {pct}%）。',
      'ins.budget_near': '预算只剩 {left}（已用 {pct}%），接下来注意控制。',
      'ins.budget_ok': '预算还剩 {left}（已用 {pct}%），节奏正常。',
      'ins.budget_daily': '按剩余预算算，余下 {days} 天每天可花约 {amount}。',
      'ins.projection_over': '按当前速度预计月末支出 {projected}，将超出预算 {over}。',
      'ins.budget_unset': '还没有设置月度预算，设置后能得到更准确的花钱提示。',
      'ins.dominant_category': '{cat}占比 {share}%（{amount}），集中度偏高。',
      'ins.category_spike': '{cat}比上月增加 {pct}%（{prev} → {amount}）。',
      'ins.mom_up': '比上月多花 {pct}%（{prev} → {now}）。',
      'ins.mom_down': '比上月少花 {pct}%（上月 {prev}），保持得不错。',
      'ins.weekend_high': '周末日均 {weekend}，比工作日的 {weekday} 高 {pct}%。',
      'ins.big_single': '单笔最大支出 {amount}（{note}），占本月支出的 {share}%。',
      'ins.big_single_note': '无备注',
      'ins.frequent_note': '「{note}」本月出现 {count} 次，合计 {amount}。',
      'ins.saving_ok': '本月结余 {net}，储蓄率约 {rate}%。',
      'ins.saving_negative': '本月支出超过收入 {net}。',
      'ins.no_income': '本月还没有记录收入。',
      'ins.method_concentration': '支付集中在{method}（占 {share}%）。',
      'ins.daily_avg': '本月日均支出约 {amount}。',
      'ins.title.empty': '暂无数据',
      'ins.title.budget_over': '预算超支',
      'ins.title.budget_near': '预算紧张',
      'ins.title.budget_ok': '预算健康',
      'ins.title.budget_daily': '每日额度',
      'ins.title.projection_over': '预计超支',
      'ins.title.budget_unset': '设置预算',
      'ins.title.dominant_category': '分类集中',
      'ins.title.category_spike': '分类上涨',
      'ins.title.mom_up': '环比上升',
      'ins.title.mom_down': '环比下降',
      'ins.title.weekend_high': '周末偏高',
      'ins.title.big_single': '大额支出',
      'ins.title.frequent_note': '重复消费',
      'ins.title.saving_ok': '结余良好',
      'ins.title.saving_negative': '收支倒挂',
      'ins.title.no_income': '缺少收入',
      'ins.title.method_concentration': '支付集中',
      'ins.title.daily_avg': '日均参考',
    };

    const en = {
      panel: 'Personal ledger',
      'page.title': 'Personal ledger',
      'page.sub': 'Track every entry and see where the money goes',
      'action.add': 'Add entry',
      'action.addPlain': 'Add entry',
      'action.edit': 'Edit',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.deleteConfirm': 'Delete entry',
      'action.retry': 'Retry',
      'action.exportCsv': 'Export CSV',
      'action.exportJson': 'Export JSON',
      'action.saveBudget': 'Save budget',
      'action.prevMonth': 'Previous month',
      'action.nextMonth': 'Next month',
      'action.today': 'Current month',
      'tab.overview': 'Overview',
      'tab.records': 'Records',
      'tab.settings': 'Settings',
      'kpi.expense': 'Spent this month',
      'kpi.income': 'Income this month',
      'kpi.net': 'Balance',
      'kpi.avg': 'Daily average',
      'kpi.budget': 'Budget left',
      'kpi.noBudget': 'No budget set',
      'kpi.count': '{n} expenses',
      'kpi.incomeCount': '{n} income entries',
      'kpi.netNote': 'income minus expenses',
      'kpi.vsPrevUp': '{pct}% more than last month',
      'kpi.vsPrevDown': '{pct}% less than last month',
      'kpi.vsPrevFlat': 'Same as last month',
      'kpi.projected': 'Projected {amount}',
      'kpi.ofBudget': '{pct}% used',
      'kpi.leftDays': '{days} days left',
      'chart.trend': 'Daily spending',
      'chart.trendSub': 'What each day cost',
      'chart.category': 'Spending mix',
      'chart.categorySub': 'Where the money went',
      'chart.method': 'Payment methods',
      'chart.methodSub': 'Which channel paid',
      'chart.weekday': 'Weekday rhythm',
      'chart.weekdaySub': 'Weekdays versus weekends',
      'chart.months': 'Last six months',
      'chart.monthsSub': 'Expense and income side by side',
      'chart.rank': 'Largest entries',
      'chart.rankSub': 'Biggest single expenses this month',
      'chart.empty': 'No data this month',
      'chart.otherTotal': 'Spent',
      'legend.expense': 'Expense',
      'legend.income': 'Income',
      'insights.title': 'Insights',
      'insights.sub': 'Generated from this month’s data',
      'insights.none': 'No insights yet',
      'summary.none': 'No entries this month yet — record one to start the analysis.',
      'summary.noExpense': 'No expenses this month; income {amount}.',
      'summary.base': '{n} expenses totalling {total}',
      'summary.top': '{cat} leads at {share}%',
      'summary.up': '{pct}% more than last month',
      'summary.down': '{pct}% less than last month',
      'summary.flat': 'about the same as last month',
      'summary.net': 'balance {amount}',
      'summary.join': ', ',
      'records.recent': 'Recent entries',
      'records.all': 'All records',
      'records.empty': 'No entries this month',
      'records.emptyHint': 'Add one, or ask the assistant to record it in chat.',
      'records.search': 'Search notes, categories or amounts',
      'records.allCats': 'All categories',
      'records.noMatch': 'No matching records',
      'records.sum': '{n} entries · spent {expense} · income {income}',
      'records.confirm': 'Delete this entry?',
      'settings.budget': 'Monthly budget',
      'settings.budgetHint': 'With a budget set, the ledger reports the remaining allowance and overspend risk. Use 0 or leave empty for no budget.',
      'settings.data': 'Data',
      'settings.dataFile': 'Data file',
      'settings.total': 'All records',
      'settings.range': 'Date range',
      'settings.exportHint': 'Export this month’s entries for backup or spreadsheet analysis.',
      'settings.about': 'About',
      'settings.aboutText': 'Personal ledger {version}: data stays on this machine. You can also ask the assistant to record entries, e.g. “lunch 25”.',
      'settings.saved': 'Saved',
      'form.addTitle': 'Add entry',
      'form.editTitle': 'Edit entry',
      'form.type': 'Type',
      'form.typeExpense': 'Expense',
      'form.typeIncome': 'Income',
      'form.amount': 'Amount',
      'form.amountPlaceholder': '0.00',
      'form.category': 'Category',
      'form.date': 'Date',
      'form.method': 'Payment method',
      'form.note': 'Note',
      'form.notePlaceholder': 'e.g. corner store',
      'form.invalidAmount': 'Enter an amount greater than 0',
      'form.invalidDate': 'Choose a valid date',
      'error.load': 'Failed to load',
      'error.network': 'Cannot reach the ledger service. Try again shortly.',
      'error.save': 'Failed to save',
      'empty.title': 'No entries this month',
      'empty.hint': 'Start with the first one — the ledger will analyse it and give tips.',
      'empty.action': 'Record the first entry',
      'cat.food': 'Food',
      'cat.transport': 'Transport',
      'cat.shopping': 'Shopping',
      'cat.housing': 'Housing',
      'cat.entertainment': 'Leisure',
      'cat.health': 'Health',
      'cat.education': 'Learning',
      'cat.social': 'Gifts',
      'cat.telecom': 'Telecom',
      'cat.other': 'Other',
      'cat.rest': 'Other (grouped)',
      'cat.salary': 'Salary',
      'cat.bonus': 'Bonus',
      'cat.investment': 'Investment',
      'cat.other-income': 'Other income',
      'method.wechat': 'WeChat Pay',
      'method.alipay': 'Alipay',
      'method.card': 'Bank card',
      'method.cash': 'Cash',
      'method.other': 'Other',
      'week.sun': 'Sunday',
      'week.mon': 'Monday',
      'week.tue': 'Tuesday',
      'week.wed': 'Wednesday',
      'week.thu': 'Thursday',
      'week.fri': 'Friday',
      'week.sat': 'Saturday',
      'weekShort.sun': 'Sun',
      'weekShort.mon': 'Mon',
      'weekShort.tue': 'Tue',
      'weekShort.wed': 'Wed',
      'weekShort.thu': 'Thu',
      'weekShort.fri': 'Fri',
      'weekShort.sat': 'Sat',
      'ins.empty': 'No entries in {month} yet.',
      'ins.budget_over': 'You are {over} over budget ({pct}% used).',
      'ins.budget_near': 'Only {left} of the budget is left ({pct}% used) — keep an eye on it.',
      'ins.budget_ok': '{left} of the budget is left ({pct}% used); pace is healthy.',
      'ins.budget_daily': 'That leaves about {amount} per day for the remaining {days} days.',
      'ins.projection_over': 'At this pace the month ends near {projected}, {over} over budget.',
      'ins.budget_unset': 'No monthly budget yet — set one for sharper advice.',
      'ins.dominant_category': '{cat} takes {share}% ({amount}) — quite concentrated.',
      'ins.category_spike': '{cat} is up {pct}% from last month ({prev} → {amount}).',
      'ins.mom_up': '{pct}% more than last month ({prev} → {now}).',
      'ins.mom_down': '{pct}% less than last month ({prev} last month) — well kept.',
      'ins.weekend_high': 'Weekends average {weekend} versus {weekday} on weekdays ({pct}% higher).',
      'ins.big_single': 'Largest single expense is {amount} ({note}), {share}% of the month.',
      'ins.big_single_note': 'no note',
      'ins.frequent_note': '“{note}” appeared {count} times this month, {amount} in total.',
      'ins.saving_ok': 'You kept {net} this month — about {rate}% of income.',
      'ins.saving_negative': 'Spending exceeded income by {net} this month.',
      'ins.no_income': 'No income recorded this month.',
      'ins.method_concentration': 'Payments concentrate on {method} ({share}%).',
      'ins.daily_avg': 'Daily average is about {amount}.',
      'ins.title.empty': 'No data',
      'ins.title.budget_over': 'Over budget',
      'ins.title.budget_near': 'Budget tight',
      'ins.title.budget_ok': 'On track',
      'ins.title.budget_daily': 'Daily allowance',
      'ins.title.projection_over': 'Projected overspend',
      'ins.title.budget_unset': 'Set a budget',
      'ins.title.dominant_category': 'Category concentration',
      'ins.title.category_spike': 'Category spike',
      'ins.title.mom_up': 'Month over month',
      'ins.title.mom_down': 'Month over month',
      'ins.title.weekend_high': 'Weekend spending',
      'ins.title.big_single': 'Large expense',
      'ins.title.frequent_note': 'Repeated spending',
      'ins.title.saving_ok': 'Healthy surplus',
      'ins.title.saving_negative': 'Spending over income',
      'ins.title.no_income': 'No income',
      'ins.title.method_concentration': 'Payment concentration',
      'ins.title.daily_avg': 'Daily average',
    };

    /* ---------------------------------------------------------------- *
     * Formatting helpers
     * ---------------------------------------------------------------- */

    const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const WEEK_KEYS = ['week.sun', 'week.mon', 'week.tue', 'week.wed', 'week.thu', 'week.fri', 'week.sat'];
    const WEEK_SHORT_KEYS = ['weekShort.sun', 'weekShort.mon', 'weekShort.tue', 'weekShort.wed', 'weekShort.thu', 'weekShort.fri', 'weekShort.sat'];
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function groupNumber(value, digits) {
      const number = Number(value) || 0;
      const fixed = Math.abs(number).toFixed(digits);
      const parts = fixed.split('.');
      const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${number < 0 ? '-' : ''}${whole}${parts.length > 1 ? `.${parts[1]}` : ''}`;
    }

    function money(value) {
      const amount = Math.round((Number(value) || 0) * 100) / 100;
      const sign = amount < 0 ? '-' : '';
      return `${sign}¥${groupNumber(Math.abs(amount), Number.isInteger(amount) ? 0 : 2)}`;
    }

    function compact(value) {
      const amount = Math.abs(Number(value) || 0);
      if (amount >= 10000) return `${(amount / 10000).toFixed(amount >= 100000 ? 0 : 1)}万`;
      if (amount >= 1000) return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
      return groupNumber(amount, amount < 10 && amount > 0 ? 1 : 0);
    }

    function pct(value) {
      return `${Math.round((Number(value) || 0) * 100)}%`;
    }

    function shiftMonth(month, delta) {
      const parts = String(month).split('-');
      const year = Number(parts[0]);
      const index = Number(parts[1]);
      const probe = new Date(year, index - 1 + delta, 1);
      return `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}`;
    }

    function weekdayOf(dateText) {
      const parts = String(dateText).split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    }

    function monthLabel(month, localeTag) {
      const parts = String(month).split('-').map(Number);
      const date = new Date(parts[0], parts[1] - 1, 1);
      try {
        return new Intl.DateTimeFormat(localeTag, { year: 'numeric', month: 'long' }).format(date);
      } catch {
        return month;
      }
    }

    function monthShort(month, localeTag) {
      const parts = String(month).split('-').map(Number);
      if (localeTag === 'en-US') return MONTHS_EN[parts[1] - 1];
      return `${parts[1]}月`;
    }

    function shortDate(dateText) {
      return String(dateText).slice(5);
    }

    function moneyOrDash(value) {
      return (Number(value) || 0) === 0 ? '—' : money(value);
    }

    /* ---------------------------------------------------------------- *
     * API
     * ---------------------------------------------------------------- */

    async function callApi(path, init) {
      let response;
      try {
        response = await fetch(API + path, init);
      } catch {
        throw new Error('NETWORK');
      }
      const text = await response.text();
      let payload = null;
      try {
        payload = text === '' ? null : JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${response.status}`);
      }
      if (response.ok && payload !== null && payload.ok === true) return payload.data;
      const message = payload !== null && typeof payload.error === 'string' && payload.error !== ''
        ? payload.error
        : `HTTP ${response.status}`;
      throw new Error(message);
    }

    function fetchSnapshot(month) {
      return callApi(month === '' || month === undefined ? '' : `?month=${encodeURIComponent(month)}`, { method: 'GET' });
    }

    function postCommand(body) {
      return callApi('', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    /* ---------------------------------------------------------------- *
     * Icons
     * ---------------------------------------------------------------- */

    function IconWallet({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.5 9A2.5 2.5 0 0 1 6 6.5h11A2.5 2.5 0 0 1 19.5 9v6A2.5 2.5 0 0 1 17 17.5H6A2.5 2.5 0 0 1 3.5 15V9Z', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }),
        h('path', { d: 'M3.5 9.8h11', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.55 }),
        h('circle', { cx: 16.2, cy: 12.6, r: 1.4, fill: 'currentColor' }));
    }

    function IconPlus({ size }) {
      const edge = size === undefined ? 15 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M8 3.2v9.6M3.2 8h9.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }

    function IconChevron({ size, direction }) {
      const edge = size === undefined ? 15 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: direction === 'left' ? 'M9.8 3.6 5.4 8l4.4 4.4' : 'M6.2 3.6 10.6 8l-4.4 4.4',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }

    function IconTrash({ size }) {
      const edge = size === undefined ? 14 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.2 4.6h9.6M6.4 4.6V3.4h3.2v1.2M4.6 4.6l.6 8h5.6l.6-8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconTrace({ size }) {
      const edge = size === undefined ? 14 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M8 2.6a5.4 5.4 0 1 0 5.4 5.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M11.6 2.4v2.8H8.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconRefresh({ size }) {
      const edge = size === undefined ? 14 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 8a5 5 0 0 1 8.5-3.6L13 6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M13 3v3.2H9.8M13 8a5 5 0 0 1-8.5 3.6L3 10', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M3 13V9.8h3.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconInfo({ size }) {
      const edge = size === undefined ? 12 : size;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 6, cy: 6, r: 4.6, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M6 5.4v2.6M6 3.8v.1', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }));
    }

    /* ---------------------------------------------------------------- *
     * Snapshot-derived lookups
     * ---------------------------------------------------------------- */

    function catalogOf(snapshot) {
      const map = new Map();
      for (const row of snapshot.categories.expense) map.set(row.id, row);
      for (const row of snapshot.categories.income) map.set(row.id, row);
      return map;
    }

    function categoryMeta(snapshot, id) {
      return catalogOf(snapshot).get(id) ?? { id, color: '#94a3b8', emoji: '•' };
    }

    function catalogColor(snapshot, id) {
      return categoryMeta(snapshot, id).color;
    }

    /* ---------------------------------------------------------------- *
     * Insight copy
     * ---------------------------------------------------------------- */

    function insightDetail(t, insight) {
      const v = insight.values ?? {};
      switch (insight.code) {
        case 'empty': return t('ins.empty', { month: v.month });
        case 'budget_over': return t('ins.budget_over', { over: money(v.over), pct: v.ratio });
        case 'budget_near': return t('ins.budget_near', { left: money(v.left), pct: v.ratio });
        case 'budget_ok': return t('ins.budget_ok', { left: money(v.left), pct: v.ratio });
        case 'budget_daily': return t('ins.budget_daily', { amount: money(v.amount), days: v.days });
        case 'projection_over': return t('ins.projection_over', { projected: money(v.projected), over: money(v.over) });
        case 'budget_unset': return t('ins.budget_unset');
        case 'dominant_category': return t('ins.dominant_category', { cat: t(`cat.${v.category}`), share: v.share, amount: money(v.amount) });
        case 'category_spike': return t('ins.category_spike', { cat: t(`cat.${v.category}`), pct: v.pct, prev: money(v.prev), amount: money(v.amount) });
        case 'mom_up': return t('ins.mom_up', { pct: v.pct, prev: money(v.prev), now: money(v.now) });
        case 'mom_down': return t('ins.mom_down', { pct: v.pct, prev: money(v.prev) });
        case 'weekend_high': return t('ins.weekend_high', { weekend: money(v.weekend), weekday: money(v.weekday), pct: v.pct });
        case 'big_single': return t('ins.big_single', {
          amount: money(v.amount),
          note: v.note === '' || v.note === undefined ? t('ins.big_single_note') : v.note,
          share: v.share,
        });
        case 'frequent_note': return t('ins.frequent_note', { note: v.note, count: v.count, amount: money(v.amount) });
        case 'saving_ok': return t('ins.saving_ok', { net: money(v.net), rate: v.rate });
        case 'saving_negative': return t('ins.saving_negative', { net: money(v.net) });
        case 'no_income': return t('ins.no_income');
        case 'method_concentration': return t('ins.method_concentration', { method: t(`method.${v.method}`), share: v.share });
        case 'daily_avg': return t('ins.daily_avg', { amount: money(v.amount) });
        default: return '';
      }
    }

    function insightTitle(t, insight) {
      const title = t(`ins.title.${insight.code}`);
      return title === `ins.title.${insight.code}` ? '' : title;
    }

    function summaryText(t, analysis, entryCount) {
      if (entryCount === 0) return t('summary.none');
      if (analysis.count === 0) return t('summary.noExpense', { amount: money(analysis.income) });
      const parts = [t('summary.base', { n: analysis.count, total: money(analysis.expense) })];
      const top = analysis.byCategory[0];
      if (top !== undefined) parts.push(t('summary.top', { cat: t(`cat.${top.id}`), share: Math.round(top.share * 100) }));
      if (analysis.prev.expense > 0) {
        const delta = analysis.expense - analysis.prev.expense;
        if (Math.abs(delta) < 0.01) parts.push(t('summary.flat'));
        else if (delta > 0) parts.push(t('summary.up', { pct: Math.round((delta / analysis.prev.expense) * 100) }));
        else parts.push(t('summary.down', { pct: Math.round((-delta / analysis.prev.expense) * 100) }));
      }
      if (analysis.income > 0) parts.push(t('summary.net', { amount: money(analysis.net) }));
      return parts.join(t('summary.join'));
    }

    /* ---------------------------------------------------------------- *
     * Charts
     * ---------------------------------------------------------------- */

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** Daily expense area and line with a today marker. */
    function TrendChart({ t, analysis, today }) {
      const daily = analysis.daily;
      const count = daily.length;
      if (count === 0) return null;
      const W = 720;
      const H = 186;
      const left = 46;
      const right = 12;
      const top = 14;
      const bottom = 22;
      const max = Math.max(1, ...daily.map((row) => row.expense));
      const x = (index) => left + (count === 1 ? 0 : (index / (count - 1)) * (W - left - right));
      const y = (value) => top + (1 - value / max) * (H - top - bottom);
      const line = daily.map((row, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(row.expense).toFixed(1)}`).join(' ');
      const area = `${line} L${x(count - 1).toFixed(1)},${H - bottom} L${x(0).toFixed(1)},${H - bottom} Z`;
      const gridRows = [0, 0.5, 1].map((ratio) => ({
        y: top + ratio * (H - top - bottom),
        value: max * (1 - ratio),
      }));
      const tickIndexes = count <= 4
        ? Array.from({ length: count }, (_, index) => index)
        : [0, Math.round((count - 1) / 3), Math.round(((count - 1) * 2) / 3), count - 1];
      const todayIndex = daily.findIndex((row) => row.date === today);
      const band = count > 1 ? (W - left - right) / (count - 1) : W - left - right;

      return h('svg', {
        className: 'pl-chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': `${t('chart.trend')}: ${t('kpi.expense')} ${money(analysis.expense)}`,
      },
        h('defs', null,
          h('linearGradient', { id: 'pl-trend-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: '0.3' }),
            h('stop', { offset: '100%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: '0.02' }))),
        gridRows.map((row, index) => h('g', { key: `grid-${index}` },
          h('line', { className: 'pl-grid-line', x1: left, x2: W - right, y1: row.y, y2: row.y }),
          h('text', { className: 'pl-axis-label', x: left - 8, y: row.y + 3, textAnchor: 'end' }, compact(row.value)))),
        todayIndex >= 0 ? h('line', {
          x1: x(todayIndex), x2: x(todayIndex), y1: top, y2: H - bottom,
          stroke: 'var(--dsw-alias-state-business-primary)', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.55,
        }) : null,
        h('path', { d: area, fill: 'url(#pl-trend-fill)' }),
        h('path', { d: line, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        daily.map((row, index) => h('rect', {
          key: `hit-${row.date}`,
          className: 'pl-hit',
          x: x(index) - band / 2,
          y: top,
          width: band,
          height: H - top - bottom,
          fill: 'transparent',
        }, h('title', null, `${shortDate(row.date)} · ${money(row.expense)}`))),
        todayIndex >= 0 ? h('circle', {
          cx: x(todayIndex), cy: y(daily[todayIndex].expense), r: 3.4,
          fill: 'var(--dsw-alias-brand-primary)', stroke: 'var(--dsw-alias-bg-layer-1)', strokeWidth: 2,
        }) : null,
        tickIndexes.map((index) => h('text', {
          key: `tick-${index}`,
          className: 'pl-axis-label',
          x: x(index), y: H - 6,
          textAnchor: index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle',
        }, String(daily[index].day))));
    }

    /** Category composition donut with a compact legend. */
    function DonutChart({ t, snapshot }) {
      const analysis = snapshot.analysis;
      const items = analysis.byCategory;
      if (items.length === 0) return h('div', { className: 'pl-empty-block' }, t('chart.empty'));

      const merged = items.slice(0, 6);
      if (items.length > 6) {
        const rest = items.slice(6).reduce((sum, row) => sum + row.amount, 0);
        merged.push({ id: 'rest', amount: Math.round(rest * 100) / 100, share: analysis.expense > 0 ? rest / analysis.expense : 0, count: 0 });
      }
      const total = Math.max(analysis.expense, 0.01);
      const size = 148;
      const radius = 48;
      const stroke = 20;
      const center = size / 2;
      const circumference = 2 * Math.PI * radius;
      let offset = 0;

      return h('div', { className: 'pl-donut-wrap' },
        h('svg', {
          className: 'pl-donut-svg', viewBox: `0 0 ${size} ${size}`, role: 'img',
          'aria-label': `${t('chart.category')}: ${money(analysis.expense)}`,
        },
          h('circle', { cx: center, cy: center, r: radius, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-3)', strokeWidth: stroke }),
          merged.map((row) => {
            const length = (row.amount / total) * circumference;
            const dash = Math.max(length - 2, 0.8);
            const color = row.id === 'rest' ? 'var(--dsw-alias-label-caption)' : catalogColor(snapshot, row.id);
            const label = row.id === 'rest' ? t('cat.rest') : t(`cat.${row.id}`);
            const circle = h('circle', {
              key: row.id,
              cx: center, cy: center, r: radius,
              fill: 'none',
              stroke: color,
              strokeWidth: stroke,
              strokeDasharray: `${dash} ${circumference - dash}`,
              strokeDashoffset: -offset,
              transform: `rotate(-90 ${center} ${center})`,
            }, h('title', null, `${label} ${money(row.amount)} (${pct(row.share)})`));
            offset += length;
            return circle;
          }),
          h('text', { x: center, y: center - 2, textAnchor: 'middle', fill: 'var(--dsw-alias-label-primary)', fontSize: 15, fontWeight: 600 }, money(analysis.expense)),
          h('text', { x: center, y: center + 14, textAnchor: 'middle', fill: 'var(--dsw-alias-label-tertiary)', fontSize: 10 }, t('chart.otherTotal'))),
        h('div', { className: 'pl-legend' }, merged.map((row) => h('div', { key: row.id, className: 'pl-legend-row' },
          h('span', { className: 'pl-dot', style: { background: row.id === 'rest' ? 'var(--dsw-alias-label-caption)' : catalogColor(snapshot, row.id) } }),
          h('span', { className: 'pl-legend-name' }, row.id === 'rest' ? t('cat.rest') : `${categoryMeta(snapshot, row.id).emoji} ${t(`cat.${row.id}`)}`),
          h('span', { className: 'pl-legend-amount' }, money(row.amount)),
          h('span', { className: 'pl-legend-share' }, pct(row.share))))));
    }

    /** Horizontal bars for one breakdown (payment methods). */
    function BarList({ t, snapshot, rows, emptyLabel }) {
      if (rows.length === 0) return h('div', { className: 'pl-empty-block' }, emptyLabel);
      const max = Math.max(...rows.map((row) => row.amount), 0.01);
      return h('div', { className: 'pl-bars' }, rows.map((row) => h('div', { key: row.id, className: 'pl-bar-row' },
        h('div', { className: 'pl-bar-label' },
          h('span', { className: 'pl-emoji' }, '·'),
          h('span', null, t(`method.${row.id}`))),
        h('div', { className: 'pl-bar-amount' }, money(row.amount), ' ', h('span', { className: 'pl-bar-share' }, pct(row.share))),
        h('div', { className: 'pl-bar-track' },
          h('div', {
            className: 'pl-bar-fill',
            style: { width: `${Math.max((row.amount / max) * 100, 2)}%`, background: 'var(--dsw-alias-state-business-primary)' },
          })))));
    }

    /** Seven weekday bars, Monday first. */
    function WeekdayChart({ t, analysis }) {
      const rows = analysis.byWeekday;
      const W = 340;
      const H = 156;
      const left = 8;
      const right = 8;
      const top = 12;
      const bottom = 26;
      const max = Math.max(...rows.map((row) => row.avg), 1);
      const slot = (W - left - right) / 7;
      const barWidth = Math.min(24, slot * 0.52);
      return h('svg', { className: 'pl-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('chart.weekday') },
        [0, 0.5, 1].map((ratio, index) => h('line', {
          key: `line-${index}`,
          className: 'pl-grid-line',
          x1: left, x2: W - right,
          y1: top + ratio * (H - top - bottom),
          y2: top + ratio * (H - top - bottom),
        })),
        WEEK_ORDER.map((weekday, index) => {
          const row = rows[weekday] ?? { avg: 0, amount: 0, count: 0 };
          const height = (row.avg / max) * (H - top - bottom);
          const x = left + index * slot + (slot - barWidth) / 2;
          const isWeekend = weekday === 0 || weekday === 6;
          return h('g', { key: weekday },
            h('rect', {
              x, y: H - bottom - height, width: barWidth, height: Math.max(height, 1.5), rx: 5,
              fill: isWeekend ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-brand-primary)',
              opacity: isWeekend ? 1 : 0.42,
            }, h('title', null, `${t(WEEK_KEYS[weekday])} · ${t('kpi.avg')} ${money(row.avg)} · ${t('kpi.count', { n: row.count })}`)),
            h('text', {
              className: 'pl-axis-label',
              x: x + barWidth / 2, y: H - 8, textAnchor: 'middle',
              fill: isWeekend ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-tertiary)',
            }, t(WEEK_SHORT_KEYS[weekday])));
        }));
    }

    /** Six-month grouped bars: expense and income. */
    function MonthChart({ t, analysis, localeTag }) {
      const rows = analysis.months;
      const W = 720;
      const H = 186;
      const left = 46;
      const right = 12;
      const top = 14;
      const bottom = 26;
      const max = Math.max(1, ...rows.flatMap((row) => [row.expense, row.income]));
      const slot = (W - left - right) / Math.max(rows.length, 1);
      const barWidth = Math.min(22, slot * 0.26);
      const base = H - bottom;
      const scale = (value) => ((value / max) * (H - top - bottom));
      return h('svg', { className: 'pl-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('chart.months') },
        [0, 0.5, 1].map((ratio, index) => h('g', { key: `grid-${index}` },
          h('line', {
            className: 'pl-grid-line',
            x1: left, x2: W - right,
            y1: top + ratio * (H - top - bottom),
            y2: top + ratio * (H - top - bottom),
          }),
          h('text', { className: 'pl-axis-label', x: left - 8, y: top + ratio * (H - top - bottom) + 3, textAnchor: 'end' }, compact(max * (1 - ratio))))),
        rows.map((row, index) => {
          const center = left + index * slot + slot / 2;
          const selected = row.month === analysis.months[analysis.months.length - 1].month;
          return h('g', { key: row.month },
            h('rect', {
              x: center - barWidth - 2, y: base - scale(row.expense), width: barWidth, height: Math.max(scale(row.expense), 1.5), rx: 4,
              fill: 'var(--dsw-alias-brand-primary)', opacity: selected ? 1 : 0.75,
            }, h('title', null, `${row.month} · ${t('legend.expense')} ${money(row.expense)}`)),
            h('rect', {
              x: center + 2, y: base - scale(row.income), width: barWidth, height: Math.max(scale(row.income), 1.5), rx: 4,
              fill: 'var(--dsw-alias-state-success-primary)', opacity: selected ? 0.9 : 0.55,
            }, h('title', null, `${row.month} · ${t('legend.income')} ${money(row.income)}`)),
            h('text', {
              className: 'pl-axis-label',
              x: center, y: H - 8, textAnchor: 'middle',
              fill: selected ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-tertiary)',
            }, monthShort(row.month, localeTag)));
        }),
        h('g', { transform: `translate(${W - right - 150}, ${top - 2})` },
          h('rect', { x: 0, y: 0, width: 8, height: 8, rx: 2, fill: 'var(--dsw-alias-brand-primary)' }),
          h('text', { className: 'pl-axis-label', x: 12, y: 7 }, t('legend.expense')),
          h('rect', { x: 62, y: 0, width: 8, height: 8, rx: 2, fill: 'var(--dsw-alias-state-success-primary)' }),
          h('text', { className: 'pl-axis-label', x: 74, y: 7 }, t('legend.income'))));
    }

    /* ---------------------------------------------------------------- *
     * Small view pieces
     * ---------------------------------------------------------------- */

    function KpiCard({ label, value, note, tone, children }) {
      return h('div', { className: 'pl-kpi' },
        h('div', { className: 'pl-kpi-label' }, label),
        h('div', { className: `pl-kpi-value${tone === undefined ? '' : ` pl-kpi-value-${tone}`}`, title: value }, value),
        note === undefined ? null : h('div', { className: 'pl-kpi-note' }, note),
        children);
    }

    function Card({ title, sub, action, children, column }) {
      return h('section', { className: `pl-card ${column}` },
        title === undefined ? null : h('header', { className: 'pl-card-head' },
          h('h2', { className: 'pl-card-title' }, title),
          action !== undefined ? action : (sub === undefined ? null : h('span', { className: 'pl-card-sub' }, sub))),
        children);
    }

    function InsightList({ t, insights }) {
      if (insights.length === 0) return h('div', { className: 'pl-empty-block' }, t('insights.none'));
      const icons = {
        warn: h(IconInfo),
        ok: h('span', { 'aria-hidden': true }, '✓'),
        tip: h('span', { 'aria-hidden': true }, '💡'),
        info: h(IconInfo),
      };
      return h('div', { className: 'pl-insights' }, insights.map((insight, index) => h('div', {
        key: `${insight.code}-${index}`,
        className: `pl-insight pl-insight-${insight.level}`,
      },
        h('span', { className: 'pl-insight-icon', 'aria-hidden': true }, icons[insight.level] ?? icons.info),
        h('div', { className: 'pl-insight-body' },
          h('div', { className: 'pl-insight-title' }, insightTitle(t, insight)),
          h('div', { className: 'pl-insight-text' }, insightDetail(t, insight))))));
    }

    function RecordRow({ entry, snapshot, t, onEdit, onDelete, confirm, setConfirm, busy }) {
      const meta = categoryMeta(snapshot, entry.category);
      const isIncome = entry.type === 'income';
      const remove = () => {
        try {
          const outcome = onDelete(entry.id);
          if (outcome !== null && typeof outcome === 'object' && typeof outcome.catch === 'function') outcome.catch(() => {});
        } catch {
          /* command() already published the failure banner */
        }
      };
      return h('div', { className: 'pl-record' },
        h('button', {
          type: 'button',
          className: 'pl-record-main',
          onClick: () => onEdit(entry),
          'aria-label': `${t('action.edit')} ${entry.date} ${t(`cat.${entry.category}`)} ${money(entry.amount)}`,
        },
          h('span', { className: 'pl-record-date' }, shortDate(entry.date), h('small', null, t(WEEK_SHORT_KEYS[weekdayOf(entry.date)]))),
          h('span', { className: 'pl-record-label' },
            h('span', { className: 'pl-emoji', 'aria-hidden': true }, meta.emoji),
            h('span', { className: 'pl-record-name' }, t(`cat.${entry.category}`)),
            entry.note === '' ? null : h('span', { className: 'pl-record-note' }, entry.note))),
        h('span', { className: 'pl-record-method' }, t(`method.${entry.method}`)),
        h('span', { className: `pl-record-amount${isIncome ? ' pl-record-amount-income' : ''}` },
          `${isIncome ? '+' : '-'}${money(entry.amount)}`),
        h('span', { className: 'pl-record-actions' },
          h('button', {
            type: 'button',
            className: 'pl-record-del',
            'aria-label': t('action.delete'),
            title: t('action.delete'),
            onClick: () => setConfirm(entry.id),
          }, h(IconTrash))),
        confirm ? h('div', { className: 'pl-record-confirm' },
          h('span', null, t('records.confirm')),
          h('button', { type: 'button', className: 'pl-btn pl-btn-danger', disabled: busy, onClick: remove }, t('action.delete')),
          h('button', { type: 'button', className: 'pl-btn', onClick: () => setConfirm('') }, t('action.cancel'))) : null);
    }

    /* ---------------------------------------------------------------- *
     * Entry editor
     * ---------------------------------------------------------------- */

    function EntryEditor({ t, snapshot, entry, onClose, onSave, busy, error }) {
      const editing = entry !== undefined && entry !== null;
      const [type, setType] = React.useState(editing ? entry.type : 'expense');
      const [amount, setAmount] = React.useState(editing ? String(entry.amount) : '');
      const [category, setCategory] = React.useState(editing ? entry.category : 'food');
      const [date, setDate] = React.useState(editing ? entry.date : snapshot.today);
      const [method, setMethod] = React.useState(editing ? entry.method : 'wechat');
      const [note, setNote] = React.useState(editing ? entry.note : '');
      const [localError, setLocalError] = React.useState('');
      const amountRef = React.useRef(null);

      const catalog = type === 'income' ? snapshot.categories.income : snapshot.categories.expense;

      React.useEffect(() => {
        if (amountRef.current !== null) amountRef.current.focus();
      }, []);

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);

      React.useEffect(() => {
        if (!catalog.some((row) => row.id === category)) setCategory(catalog[0].id);
      }, [type]);

      function submit(event) {
        if (event !== undefined) event.preventDefault();
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) {
          setLocalError(t('form.invalidAmount'));
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          setLocalError(t('form.invalidDate'));
          return;
        }
        setLocalError('');
        onSave({
          type,
          amount: Math.round(value * 100) / 100,
          category,
          date,
          method,
          note: note.trim().slice(0, 120),
        });
      }

      return h('div', {
        className: 'pl-overlay',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
      },
        h('div', {
          className: 'pl-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'pl-dialog-title',
        },
          h('h2', { className: 'pl-dialog-title', id: 'pl-dialog-title' }, editing ? t('form.editTitle') : t('form.addTitle')),
          h('form', { className: 'pl-form', onSubmit: submit },
            h('div', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('form.type')),
              h('div', { className: 'pl-seg', role: 'group', 'aria-label': t('form.type') },
                h('button', {
                  type: 'button',
                  className: 'pl-seg-btn',
                  'aria-pressed': type === 'expense',
                  onClick: () => setType('expense'),
                }, t('form.typeExpense')),
                h('button', {
                  type: 'button',
                  className: 'pl-seg-btn',
                  'aria-pressed': type === 'income',
                  onClick: () => setType('income'),
                }, t('form.typeIncome')))),
            h('label', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('form.amount')),
              h('span', { className: 'pl-amount-wrap' },
                h('span', { className: 'pl-amount-prefix', 'aria-hidden': true }, '¥'),
                h('input', {
                  ref: amountRef,
                  className: 'pl-input pl-amount-input',
                  type: 'number',
                  inputMode: 'decimal',
                  min: '0.01',
                  step: '0.01',
                  value: amount,
                  placeholder: t('form.amountPlaceholder'),
                  onChange: (event) => setAmount(event.target.value),
                }))),
            h('div', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('form.category')),
              h('div', { className: 'pl-chips', role: 'group', 'aria-label': t('form.category') },
                catalog.map((row) => h('button', {
                  key: row.id,
                  type: 'button',
                  className: 'pl-chip',
                  'aria-pressed': category === row.id,
                  onClick: () => setCategory(row.id),
                }, h('span', { className: 'pl-emoji', 'aria-hidden': true }, row.emoji), t(`cat.${row.id}`))))),
            h('div', { className: 'pl-row-2' },
              h('label', { className: 'pl-field' },
                h('span', { className: 'pl-field-label' }, t('form.date')),
                h('input', {
                  className: 'pl-input',
                  type: 'date',
                  value: date,
                  onChange: (event) => setDate(event.target.value),
                })),
              h('label', { className: 'pl-field' },
                h('span', { className: 'pl-field-label' }, t('form.method')),
                h('select', {
                  className: 'pl-select',
                  value: method,
                  onChange: (event) => setMethod(event.target.value),
                }, snapshot.methods.map((row) => h('option', { key: row.id, value: row.id }, t(`method.${row.id}`)))))),
            h('label', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('form.note')),
              h('input', {
                className: 'pl-input',
                type: 'text',
                maxLength: 120,
                value: note,
                placeholder: t('form.notePlaceholder'),
                onChange: (event) => setNote(event.target.value),
              })),
            localError !== '' || error !== '' ? h('p', { className: 'pl-form-error' }, localError !== '' ? localError : error) : null,
            h('div', { className: 'pl-dialog-actions' },
              h('button', { type: 'button', className: 'pl-btn', onClick: onClose }, t('action.cancel')),
              h('button', { type: 'submit', className: 'pl-btn pl-btn-primary', disabled: busy }, t('action.save'))))));
    }

    /* ---------------------------------------------------------------- *
     * Tabs
     * ---------------------------------------------------------------- */

    function Overview({ t, snapshot, localeTag, onAdd, onEdit, onDelete, onShowRecords }) {
      const analysis = snapshot.analysis;
      const [confirmId, setConfirmId] = React.useState('');
      const prevExpense = analysis.prev.expense;
      const delta = prevExpense > 0 ? (analysis.expense - prevExpense) / prevExpense : 0;
      const deltaNote = prevExpense <= 0
        ? t('kpi.count', { n: analysis.count })
        : Math.abs(delta) < 0.005
          ? t('kpi.vsPrevFlat')
          : delta > 0
            ? t('kpi.vsPrevUp', { pct: Math.round(delta * 100) })
            : t('kpi.vsPrevDown', { pct: Math.round(-delta * 100) });
      const budgetRatio = snapshot.budget > 0 ? analysis.expense / snapshot.budget : 0;
      const budgetTone = budgetRatio >= 1 ? 'warn' : undefined;
      const recent = snapshot.entries.slice(0, 8);
      const incomeCount = snapshot.entries.filter((entry) => entry.type === 'income').length;

      const kpis = h('div', { className: 'pl-kpis' },
        h(KpiCard, { label: t('kpi.expense'), value: money(analysis.expense), note: deltaNote }),
        h(KpiCard, { label: t('kpi.income'), value: money(analysis.income), tone: 'income', note: t('kpi.incomeCount', { n: incomeCount }) }),
        h(KpiCard, { label: t('kpi.net'), value: money(analysis.net), tone: analysis.net < 0 ? 'warn' : undefined, note: t('kpi.netNote') }),
        h(KpiCard, { label: t('kpi.avg'), value: money(analysis.avg), note: t('kpi.projected', { amount: money(analysis.projected) }) }),
        snapshot.budget > 0
          ? h(KpiCard, {
            label: t('kpi.budget'),
            value: money(Math.max(snapshot.budget - analysis.expense, 0)),
            tone: budgetTone,
            note: t('kpi.ofBudget', { pct: Math.round(budgetRatio * 100) }),
          }, h('div', { className: `pl-progress${budgetRatio >= 1 ? ' pl-progress-over' : budgetRatio >= 0.85 ? ' pl-progress-warn' : ''}` },
            h('div', { className: 'pl-progress-fill', style: { width: `${Math.min(budgetRatio * 100, 100)}%` } })))
          : h(KpiCard, { label: t('kpi.budget'), value: t('kpi.noBudget'), tone: 'muted' }));

      const summary = h('div', { className: 'pl-summary' },
        h(IconTrace),
        h('p', null, summaryText(t, analysis, snapshot.entries.length)));

      const isEmpty = snapshot.entries.length === 0;
      const trendCard = h(Card, { title: t('chart.trend'), sub: t('chart.trendSub'), column: 'pl-col-12' },
        isEmpty
          ? h('div', { className: 'pl-empty-block' }, h('h2', null, t('empty.title')), h('p', null, t('empty.hint')),
            h('button', { type: 'button', className: 'pl-btn pl-btn-primary pl-empty-action', onClick: onAdd }, h(IconPlus), t('empty.action')))
          : h(TrendChart, { t, analysis, today: snapshot.today }));

      if (isEmpty) {
        return h('div', null, kpis, summary, h('div', { className: 'pl-grid' }, trendCard));
      }

      return h('div', null,
        kpis,
        summary,
        h('div', { className: 'pl-grid' },
          trendCard,
          h(Card, { title: t('chart.category'), sub: t('chart.categorySub'), column: 'pl-col-6' },
            h(DonutChart, { t, snapshot })),
          h(Card, { title: t('insights.title'), sub: t('insights.sub'), column: 'pl-col-6' },
            h(InsightList, { t, insights: analysis.insights })),
          h(Card, { title: t('chart.method'), sub: t('chart.methodSub'), column: 'pl-col-4' },
            h(BarList, { t, snapshot, rows: analysis.byMethod, emptyLabel: t('chart.empty') })),
          h(Card, { title: t('chart.weekday'), sub: t('chart.weekdaySub'), column: 'pl-col-4' },
            h(WeekdayChart, { t, analysis })),
          h(Card, {
            title: t('chart.rank'),
            sub: t('chart.rankSub'),
            column: 'pl-col-4',
          }, analysis.top.length === 0
            ? h('div', { className: 'pl-empty-block' }, t('chart.empty'))
            : h('div', { className: 'pl-bars' }, analysis.top.map((row) => h('div', { key: row.id, className: 'pl-bar-row' },
              h('div', { className: 'pl-bar-label' },
                h('span', { className: 'pl-emoji', 'aria-hidden': true }, categoryMeta(snapshot, row.category).emoji),
                h('span', null, `${shortDate(row.date)} ${row.note === '' ? t(`cat.${row.category}`) : row.note}`)),
              h('div', { className: 'pl-bar-amount' }, money(row.amount)))))),
          h(Card, { title: t('chart.months'), sub: t('chart.monthsSub'), column: 'pl-col-12' },
            h(MonthChart, { t, analysis, localeTag })),
          h(Card, {
            title: t('records.recent'),
            column: 'pl-col-12',
            action: h('button', { type: 'button', className: 'pl-card-link', onClick: onShowRecords }, t('records.all')),
          }, recent.length === 0
            ? h('div', { className: 'pl-empty-block' }, t('records.empty'))
            : h('div', { className: 'pl-records' }, recent.map((entry) => h(RecordRow, {
              key: entry.id,
              entry,
              snapshot,
              t,
              onEdit,
              onDelete,
              confirm: confirmId === entry.id,
              setConfirm: setConfirmId,
              busy: false,
            }))))));
    }

    function RecordsTab({ t, snapshot, onEdit, onDelete }) {
      const [query, setQuery] = React.useState('');
      const [filter, setFilter] = React.useState('all');
      const [confirmId, setConfirmId] = React.useState('');
      const [busy, setBusy] = React.useState(false);

      const options = snapshot.categories.expense.concat(snapshot.categories.income);
      const needle = query.trim().toLowerCase();
      const rows = snapshot.entries.filter((entry) => {
        if (filter !== 'all' && entry.category !== filter) return false;
        if (needle === '') return true;
        const haystack = [
          entry.note,
          t(`cat.${entry.category}`),
          t(`method.${entry.method}`),
          String(entry.amount),
          entry.date,
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
      });

      async function remove(id) {
        setBusy(true);
        try {
          await onDelete(id);
          setConfirmId('');
        } catch {
          /* command() already published the failure banner */
        } finally {
          setBusy(false);
        }
      }

      return h('div', null,
        h('div', { className: 'pl-tools' },
          h('label', { className: 'pl-search' },
            h('span', { className: 'pl-visually-hidden' }, t('records.search')),
            h('input', {
              className: 'pl-input',
              type: 'search',
              value: query,
              placeholder: t('records.search'),
              onChange: (event) => setQuery(event.target.value),
            })),
          h('select', {
            className: 'pl-select',
            value: filter,
            'aria-label': t('records.allCats'),
            onChange: (event) => setFilter(event.target.value),
          },
            h('option', { value: 'all' }, t('records.allCats')),
            options.map((row) => h('option', { key: row.id, value: row.id }, t(`cat.${row.id}`))))),
        h('div', { className: 'pl-card' },
          h('div', { className: 'pl-kv' }, t('records.sum', { n: snapshot.analysis.count, expense: money(snapshot.analysis.expense), income: money(snapshot.analysis.income) })),
          rows.length === 0
            ? h('div', { className: 'pl-empty-block' }, snapshot.entries.length === 0 ? t('records.empty') : t('records.noMatch'))
            : h('div', { className: 'pl-records' }, rows.map((entry) => h(RecordRow, {
              key: entry.id,
              entry,
              snapshot,
              t,
              onEdit,
              onDelete: remove,
              confirm: confirmId === entry.id,
              setConfirm: setConfirmId,
              busy,
            })))));
    }

    function SettingsTab({ t, snapshot, onSaveBudget, busy }) {
      const [budget, setBudget] = React.useState(snapshot.budget > 0 ? String(snapshot.budget) : '');
      const [saved, setSaved] = React.useState(false);
      const [error, setError] = React.useState('');
      const savedTimer = React.useRef(null);

      React.useEffect(() => () => {
        if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      }, []);

      async function save() {
        const value = Number(budget);
        if (!Number.isFinite(value) || value < 0) {
          setError(t('form.invalidAmount'));
          return;
        }
        setError('');
        try {
          await onSaveBudget(value);
          setSaved(true);
          if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
          savedTimer.current = window.setTimeout(() => setSaved(false), 2200);
        } catch (failure) {
          setError(String(failure?.message ?? failure));
        }
      }

      function exportCsv() {
        const header = ['date', 'type', 'category', 'amount', 'method', 'note'];
        const lines = [header.join(',')];
        for (const entry of snapshot.entries) {
          lines.push([
            entry.date,
            entry.type,
            entry.category,
            String(entry.amount),
            entry.method,
            `"${String(entry.note).replace(/"/g, '""')}"`,
          ].join(','));
        }
        download(`ledger-${snapshot.month}.csv`, `\ufeff${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
      }

      function exportJson() {
        download(`ledger-${snapshot.month}.json`, JSON.stringify({
          month: snapshot.month,
          budget: snapshot.budget,
          entries: snapshot.entries,
        }, null, 2), 'application/json;charset=utf-8');
      }

      return h('div', { className: 'pl-settings' },
        h('section', { className: 'pl-card' },
          h('header', { className: 'pl-card-head' }, h('h2', { className: 'pl-card-title' }, t('settings.budget'))),
          h('div', { className: 'pl-settings-row' },
            h('input', {
              className: 'pl-input pl-settings-input',
              type: 'number',
              min: '0',
              step: '1',
              value: budget,
              placeholder: '0',
              'aria-label': t('settings.budget'),
              onChange: (event) => setBudget(event.target.value),
            }),
            h('button', { type: 'button', className: 'pl-btn pl-btn-primary', disabled: busy, onClick: save }, t('action.saveBudget')),
            saved ? h('span', { className: 'pl-saved' }, t('settings.saved')) : null,
            error !== '' ? h('span', { className: 'pl-form-error' }, error) : null),
          h('p', { className: 'pl-hint' }, t('settings.budgetHint'))),
        h('section', { className: 'pl-card' },
          h('header', { className: 'pl-card-head' }, h('h2', { className: 'pl-card-title' }, t('settings.data'))),
          h('div', { className: 'pl-kv' },
            h('span', null, `${t('settings.dataFile')}:`),
            h('code', null, snapshot.dataFile === '' ? '—' : snapshot.dataFile)),
          h('div', { className: 'pl-kv' },
            h('span', null, `${t('settings.total')}: ${snapshot.stats.total}`),
            snapshot.stats.firstDate === '' ? null : h('span', null, `· ${t('settings.range')}: ${snapshot.stats.firstDate} → ${snapshot.today}`)),
          h('div', { className: 'pl-settings-row' },
            h('button', { type: 'button', className: 'pl-btn', onClick: exportCsv }, t('action.exportCsv')),
            h('button', { type: 'button', className: 'pl-btn', onClick: exportJson }, t('action.exportJson'))),
          h('p', { className: 'pl-hint' }, t('settings.exportHint'))),
        h('section', { className: 'pl-card' },
          h('header', { className: 'pl-card-head' }, h('h2', { className: 'pl-card-title' }, t('settings.about'))),
          h('p', { className: 'pl-hint' }, t('settings.aboutText', { version: APP_VERSION }))));
    }

    function download(filename, text, mime) {
      try {
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch {
        /* export is best-effort */
      }
    }

    /* ---------------------------------------------------------------- *
     * Page
     * ---------------------------------------------------------------- */

    function useActiveLocale(locale) {
      const [active, setActive] = React.useState(() => locale.getSnapshot().active);
      React.useEffect(() => {
        setActive(locale.getSnapshot().active);
        return locale.subscribe(() => setActive(locale.getSnapshot().active));
      }, [locale]);
      return active;
    }

    function LedgerPage(props) {
      const { t, locale } = props;
      const active = useActiveLocale(locale);
      const localeTag = active === 'en' ? 'en-US' : 'zh-CN';

      const [snapshot, setSnapshot] = React.useState(null);
      const [month, setMonth] = React.useState('');
      const [status, setStatus] = React.useState('loading');
      const [errorText, setErrorText] = React.useState('');
      const [tab, setTab] = React.useState('overview');
      const [editor, setEditor] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      // `t` reads the live locale at call time, so keeping it in a ref lets the
      // fetch callbacks stay identity-stable: the mount effect must run once.
      const tRef = React.useRef(t);
      tRef.current = t;

      const load = React.useCallback(async (target, silent) => {
        if (!silent) setStatus('loading');
        try {
          const data = await fetchSnapshot(target ?? '');
          setSnapshot(data);
          setMonth(data.month);
          setErrorText('');
          setStatus('ready');
        } catch (error) {
          if (silent) return;
          const message = String(error?.message ?? error);
          setErrorText(message === 'NETWORK' ? tRef.current('error.network') : message);
          setStatus('error');
        }
      }, []);

      React.useEffect(() => {
        load('');
      }, [load]);

      React.useEffect(() => {
        if (status !== 'ready' || editor !== null || busy) return undefined;
        const tick = () => {
          if (document.visibilityState === 'visible') load(month, true);
        };
        const timer = window.setInterval(tick, REFRESH_MS);
        const onFocus = () => tick();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
          window.clearInterval(timer);
          window.removeEventListener('focus', onFocus);
          document.removeEventListener('visibilitychange', onFocus);
        };
      }, [status, month, editor, busy, load]);

      const command = React.useCallback(async (payload) => {
        setBusy(true);
        try {
          const data = await postCommand({ ...payload, month });
          setSnapshot(data);
          setMonth(data.month);
          setStatus('ready');
          setErrorText('');
          return data;
        } catch (error) {
          const message = String(error?.message ?? error);
          setErrorText(message === 'NETWORK' ? tRef.current('error.network') : message);
          throw error;
        } finally {
          setBusy(false);
        }
      }, [month]);

      if (status === 'loading' && snapshot === null) {
        return h('div', { className: 'pl-page' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'pl-inner' },
            h('div', { className: 'pl-loading' },
              h('div', { className: 'pl-skeleton' }),
              h('div', { className: 'pl-skeleton' }),
              h('div', { className: 'pl-skeleton' }))));
      }

      if (status === 'error' && snapshot === null) {
        return h('div', { className: 'pl-page' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'pl-inner' },
            h('div', { className: 'pl-empty-block' },
              h('h2', null, t('error.load')),
              h('p', null, errorText),
              h('button', { type: 'button', className: 'pl-btn pl-btn-primary pl-empty-action', onClick: () => load('') }, t('action.retry')))));
      }

      const viewMonth = snapshot === null ? month : snapshot.month;
      const currentMonth = snapshot === null ? '' : snapshot.today.slice(0, 7);
      const canNext = viewMonth !== '' && viewMonth < currentMonth;

      function navigate(delta) {
        if (snapshot === null) return;
        const next = shiftMonth(snapshot.month, delta);
        if (next > currentMonth) return;
        load(next);
      }

      function openEditor(mode, entry) {
        setErrorText('');
        setEditor({ mode, entry: entry ?? null });
      }

      async function saveEntry(draft) {
        const editing = editor !== null && editor.mode === 'edit';
        try {
          await command(editing
            ? { op: 'update', id: editor.entry.id, entry: draft }
            : { op: 'add', entry: draft });
          setEditor(null);
        } catch {
          /* the banner and the dialog keep the failure visible */
        }
      }

      async function removeEntry(id) {
        await command({ op: 'remove', id });
      }

      async function saveBudget(amount) {
        await command({ op: 'setBudget', amount });
      }

      return h('div', { className: 'pl-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'pl-inner' },
          h('header', { className: 'pl-header' },
            h('div', { className: 'pl-heading' },
              h('h1', { className: 'pl-title' }, t('page.title')),
              h('p', { className: 'pl-sub' }, t('page.sub'))),
            h('div', { className: 'pl-toolbar' },
              h('div', { className: 'pl-month' },
                h('button', {
                  type: 'button',
                  className: 'pl-btn pl-btn-icon',
                  'aria-label': t('action.prevMonth'),
                  title: t('action.prevMonth'),
                  onClick: () => navigate(-1),
                }, h(IconChevron, { direction: 'left' })),
                h('span', { className: 'pl-month-label' }, monthLabel(viewMonth === '' ? currentMonth : viewMonth, localeTag)),
                h('button', {
                  type: 'button',
                  className: 'pl-btn pl-btn-icon',
                  'aria-label': t('action.nextMonth'),
                  title: t('action.nextMonth'),
                  disabled: !canNext,
                  onClick: () => navigate(1),
                }, h(IconChevron, { direction: 'right' }))),
              h('button', {
                type: 'button',
                className: 'pl-btn',
                onClick: () => load(month, false),
                'aria-label': t('action.retry'),
                title: t('action.retry'),
              }, h(IconRefresh)),
              h('button', {
                type: 'button',
                className: 'pl-btn pl-btn-primary',
                onClick: () => openEditor('add'),
              }, h(IconPlus), t('action.add')))),
          h('div', { className: 'pl-tabs', role: 'tablist', 'aria-label': t('page.title') },
            ['overview', 'records', 'settings'].map((id) => h('button', {
              key: id,
              type: 'button',
              role: 'tab',
              className: 'pl-tab',
              'aria-selected': tab === id,
              onClick: () => setTab(id),
            }, t(`tab.${id}`)))),
          errorText !== '' ? h('p', { className: 'pl-notice' }, errorText) : null,
          tab === 'overview' ? h(Overview, {
            t,
            snapshot,
            localeTag,
            onAdd: () => openEditor('add'),
            onEdit: (entry) => openEditor('edit', entry),
            onDelete: removeEntry,
            onShowRecords: () => setTab('records'),
          }) : null,
          tab === 'records' ? h(RecordsTab, {
            t,
            snapshot,
            onEdit: (entry) => openEditor('edit', entry),
            onDelete: removeEntry,
          }) : null,
          tab === 'settings' ? h(SettingsTab, {
            t,
            snapshot,
            onSaveBudget: saveBudget,
            busy,
          }) : null),
        editor === null ? null : h(EntryEditor, {
          t,
          snapshot,
          entry: editor.entry,
          onClose: () => setEditor(null),
          onSave: saveEntry,
          busy,
          error: errorText,
        }));
    }

    function LedgerIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18;
      return h('svg', { width: edge, height: edge, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M3.6 9A2.4 2.4 0 0 1 6 6.6h11.4A2.4 2.4 0 0 1 19.8 9v6a2.4 2.4 0 0 1-2.4 2.4H6A2.4 2.4 0 0 1 3.6 15V9Z',
          stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M3.6 9.9h11.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.55 }),
        h('circle', { cx: 16.3, cy: 12.6, r: 1.45, fill: 'currentColor' }));
    }

    /* ---------------------------------------------------------------- *
     * Plugin lifecycle
     * ---------------------------------------------------------------- */

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'dsh-ledger: zh dictionary');
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'dsh-ledger: en dictionary');

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ locale: ctx.locale }),
      }, LedgerPage));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => t('panel'),
      }, LedgerIcon));
    }

    return {
      inject,
      apply,
      __testables: {
        money,
        compact,
        groupNumber,
        shiftMonth,
        monthLabel,
        monthShort,
        summaryText,
        insightDetail,
        insightTitle,
        pct,
        dicts: { zh, en },
      },
    };
  },
});
