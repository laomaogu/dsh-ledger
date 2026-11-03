/**
 * dsh-ledger — Host half.
 *
 * Owns the personal ledger: one JSON file on this machine, a same-origin HTTP
 * API the Client panel calls, and three Agent tools that share the same store.
 *
 *   • Storage  — `~/.dsh/personal-ledger/ledger.json` (atomic replace on every
 *                write). The file is plain UTF-8 JSON, safe to back up or edit
 *                while the Host is stopped.
 *   • Analysis — totals, a per-day series, category / payment-method / weekday
 *                breakdowns, a six-month comparison and rule-based spending
 *                insights are computed here, so the panel only renders values
 *                and the Agent tools and the panel can never disagree.
 *   • Wire     — `GET /dsh-ledger/api?month=YYYY-MM` returns a snapshot;
 *                `POST /dsh-ledger/api` applies one command and returns the
 *                snapshot for the affected month. Every request passes the
 *                composition's connection trust fence first.
 *
 * No third-party imports: the plugin resolves only Node builtins, so it loads
 * in a profile whose node_modules holds nothing but the bundle itself.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const ROUTE_PREFIX = '/dsh-ledger/api';
const STORE_VERSION = 1;
const MAX_ENTRIES = 50000;
const MAX_AMOUNT = 1e9;
const MAX_NOTE = 120;

/* ------------------------------------------------------------------ *
 * Fixed vocabulary
 *
 * Category ids are the wire format. Labels live where they are shown: the
 * Client panel translates them, and the Host uses the `zh` strings only for
 * model-facing tool output.
 * ------------------------------------------------------------------ */

const EXPENSE_CATEGORIES = [
  { id: 'food', color: '#f97316', emoji: '🍜', zh: '餐饮', en: 'Food' },
  { id: 'transport', color: '#3b82f6', emoji: '🚌', zh: '交通', en: 'Transport' },
  { id: 'shopping', color: '#ec4899', emoji: '🛍️', zh: '购物', en: 'Shopping' },
  { id: 'housing', color: '#8b5cf6', emoji: '🏠', zh: '居住', en: 'Housing' },
  { id: 'entertainment', color: '#06b6d4', emoji: '🎮', zh: '娱乐', en: 'Leisure' },
  { id: 'health', color: '#ef4444', emoji: '💊', zh: '医疗', en: 'Health' },
  { id: 'education', color: '#10b981', emoji: '📚', zh: '学习', en: 'Learning' },
  { id: 'social', color: '#f59e0b', emoji: '🎁', zh: '人情', en: 'Gifts' },
  { id: 'telecom', color: '#64748b', emoji: '📱', zh: '通讯', en: 'Telecom' },
  { id: 'other', color: '#94a3b8', emoji: '📦', zh: '其他', en: 'Other' },
];

const INCOME_CATEGORIES = [
  { id: 'salary', color: '#22c55e', emoji: '💼', zh: '工资', en: 'Salary' },
  { id: 'bonus', color: '#16a34a', emoji: '🏆', zh: '奖金', en: 'Bonus' },
  { id: 'investment', color: '#0ea5e9', emoji: '📈', zh: '理财', en: 'Investment' },
  { id: 'other-income', color: '#94a3b8', emoji: '💰', zh: '其他收入', en: 'Other income' },
];

const METHODS = [
  { id: 'wechat', zh: '微信', en: 'WeChat Pay' },
  { id: 'alipay', zh: '支付宝', en: 'Alipay' },
  { id: 'card', zh: '银行卡', en: 'Bank card' },
  { id: 'cash', zh: '现金', en: 'Cash' },
  { id: 'other', zh: '其他', en: 'Other' },
];

const EXPENSE_IDS = new Set(EXPENSE_CATEGORIES.map((row) => row.id));
const INCOME_IDS = new Set(INCOME_CATEGORIES.map((row) => row.id));
const METHOD_IDS = new Set(METHODS.map((row) => row.id));

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

const pad2 = (value) => String(value).padStart(2, '0');
const round2 = (value) => Math.round(Number(value) * 100) / 100;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function todayText(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function monthOf(dateText) {
  return String(dateText).slice(0, 7);
}

/** Whether `text` is a real calendar date (rejects 2026-02-30). */
function isValidDate(text) {
  const match = DATE_RE.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function normalizeMonth(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return MONTH_RE.test(text) ? text : fallback;
}

function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number);
  const probe = new Date(year, index - 1 + delta, 1);
  return `${probe.getFullYear()}-${pad2(probe.getMonth() + 1)}`;
}

function daysInMonth(month) {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index, 0).getDate();
}

function categoryOf(type, id) {
  const catalog = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return catalog.find((row) => row.id === id);
}

function categoryLabel(entry) {
  const row = categoryOf(entry.type, entry.category);
  return row === undefined ? entry.category : row.zh;
}

function methodLabel(id) {
  const row = METHODS.find((item) => item.id === id);
  return row === undefined ? id : row.zh;
}

function groupNumber(value, digits = 2) {
  const fixed = Math.abs(Number(value) || 0).toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${Number(value) < 0 ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

function moneyText(value) {
  const amount = round2(value);
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${groupNumber(Math.abs(amount), Number.isInteger(amount) ? 0 : 2)}`;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ *
 * Store — one JSON document, one serialized writer
 * ------------------------------------------------------------------ */

function emptyState() {
  return { version: STORE_VERSION, budget: 0, entries: [], updatedAt: new Date().toISOString() };
}

function sanitizeEntry(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const type = raw.type === 'income' ? 'income' : 'expense';
  const amount = round2(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  const date = typeof raw.date === 'string' && isValidDate(raw.date) ? raw.date : null;
  if (date === null) return null;
  const ids = type === 'income' ? INCOME_IDS : EXPENSE_IDS;
  const fallback = type === 'income' ? 'other-income' : 'other';
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    type,
    amount,
    date,
    category: ids.has(raw.category) ? raw.category : fallback,
    method: METHOD_IDS.has(raw.method) ? raw.method : 'other',
    note: typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : '',
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
}

function sanitizeState(raw) {
  const state = emptyState();
  if (raw === null || typeof raw !== 'object') return state;
  const budget = round2(raw.budget);
  state.budget = Number.isFinite(budget) && budget > 0 && budget <= MAX_AMOUNT ? budget : 0;
  if (Array.isArray(raw.entries)) {
    const seen = new Set();
    for (const candidate of raw.entries.slice(0, MAX_ENTRIES)) {
      const entry = sanitizeEntry(candidate);
      if (entry === null) continue;
      if (seen.has(entry.id)) entry.id = newId();
      seen.add(entry.id);
      state.entries.push(entry);
    }
  }
  state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString();
  return state;
}

/**
 * Create one store bound to an exact file path.
 * Reads load the document once; every command mutates the in-memory copy and
 * then waits for its turn on one serialized atomic replace.
 * @param filePath - absolute path of the JSON document.
 */
export function createStore(filePath) {
  let state = null;
  let loading = null;
  let tail = Promise.resolve();

  async function ensure() {
    if (state !== null) return state;
    if (loading !== null) return loading;
    loading = (async () => {
      try {
        const text = await readFile(filePath, 'utf8');
        state = sanitizeState(JSON.parse(text));
      } catch (error) {
        if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
          state = emptyState();
        } else if (error instanceof SyntaxError) {
          const backup = `${filePath}.corrupt-${Date.now()}`;
          try {
            await rename(filePath, backup);
          } catch {
            /* keep the original in place if the backup move fails */
          }
          console.warn(`[dsh-ledger] unreadable ledger file moved to ${backup}`);
          state = emptyState();
        } else {
          throw error;
        }
      }
      return state;
    })();
    return loading;
  }

  function persist() {
    const document = state;
    const run = tail.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(document, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, filePath);
      document.updatedAt = new Date().toISOString();
    });
    tail = run.catch(() => {});
    return run;
  }

  /**
   * Add one normalized entry.
   * @param input - untrusted wire arguments.
   * @returns the stored entry.
   */
  async function add(input) {
    const current = await ensure();
    if (current.entries.length >= MAX_ENTRIES) {
      throw new LedgerError('LEDGER_FULL', `账目数量已达到上限 ${MAX_ENTRIES} 条`);
    }
    const raw = input !== null && typeof input === 'object' ? input : {};
    const type = raw.type === 'income' ? 'income' : 'expense';
    const amount = round2(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new LedgerError('INVALID_AMOUNT', '金额必须是 0 到 10 亿之间的正数');
    }
    const entry = {
      id: newId(),
      type,
      amount,
      date: typeof raw.date === 'string' && isValidDate(raw.date) ? raw.date : todayText(),
      category: (type === 'income' ? INCOME_IDS : EXPENSE_IDS).has(raw.category)
        ? raw.category
        : (type === 'income' ? 'other-income' : 'other'),
      method: METHOD_IDS.has(raw.method) ? raw.method : 'other',
      note: typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    current.entries.push(entry);
    await persist();
    return entry;
  }

  /**
   * Apply a partial change to one entry.
   * @param id - entry id.
   * @param patch - fields to replace (amount / type / date / category / note / method).
   * @returns the stored entry.
   */
  async function update(id, patch) {
    const current = await ensure();
    const entry = current.entries.find((row) => row.id === id);
    if (entry === undefined) throw new LedgerError('NOT_FOUND', `未找到账目 ${id}`);
    const raw = patch !== null && typeof patch === 'object' ? patch : {};
    const type = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : entry.type;
    const amount = raw.amount === undefined ? entry.amount : round2(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new LedgerError('INVALID_AMOUNT', '金额必须是 0 到 10 亿之间的正数');
    }
    if (raw.date !== undefined && !isValidDate(raw.date)) {
      throw new LedgerError('INVALID_DATE', '日期格式必须是 YYYY-MM-DD');
    }
    const ids = type === 'income' ? INCOME_IDS : EXPENSE_IDS;
    entry.type = type;
    entry.amount = amount;
    entry.date = raw.date === undefined ? entry.date : raw.date;
    entry.category = raw.category !== undefined && ids.has(raw.category)
      ? raw.category
      : (ids.has(entry.category) ? entry.category : (type === 'income' ? 'other-income' : 'other'));
    entry.method = raw.method !== undefined && METHOD_IDS.has(raw.method) ? raw.method : entry.method;
    entry.note = raw.note === undefined ? entry.note : String(raw.note).trim().slice(0, MAX_NOTE);
    entry.updatedAt = new Date().toISOString();
    await persist();
    return entry;
  }

  /** Delete one entry; returns the removed entry. */
  async function remove(id) {
    const current = await ensure();
    const index = current.entries.findIndex((row) => row.id === id);
    if (index === -1) throw new LedgerError('NOT_FOUND', `未找到账目 ${id}`);
    const [removed] = current.entries.splice(index, 1);
    await persist();
    return removed;
  }

  /** Set the recurring monthly budget; 0 clears it. */
  async function setBudget(value) {
    const current = await ensure();
    const amount = round2(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      throw new LedgerError('INVALID_BUDGET', '预算必须是 0 到 10 亿之间的数字');
    }
    current.budget = amount;
    await persist();
    return amount;
  }

  return {
    filePath,
    async snapshot(month) {
      return buildSnapshot(await ensure(), month, new Date());
    },
    add,
    update,
    remove,
    setBudget,
  };
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

function sumBy(entries, type, field, key) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.type !== type) continue;
    const name = entry[field];
    const bucket = map.get(name);
    if (bucket === undefined) {
      map.set(name, { amount: entry.amount, count: 1, key: key === undefined ? undefined : entry[key] });
    } else {
      bucket.amount += entry.amount;
      bucket.count += 1;
    }
  }
  return map;
}

/**
 * Group entries into descending breakdown rows.
 * @param entries - one month of entries.
 * @param type - `expense` or `income`.
 * @param field - grouping field (`category` / `method`).
 * @param total - denominator for shares.
 */
function breakdown(entries, type, field, total) {
  const map = sumBy(entries, type, field);
  const rows = [];
  for (const [id, bucket] of map) {
    rows.push({
      id,
      amount: round2(bucket.amount),
      count: bucket.count,
      share: total > 0 ? bucket.amount / total : 0,
    });
  }
  rows.sort((left, right) => right.amount - left.amount);
  return rows;
}

function weekdayStats(entries, month, lastDay) {
  const [year, index] = month.split('-').map(Number);
  const occurrences = [0, 0, 0, 0, 0, 0, 0];
  for (let day = 1; day <= lastDay; day += 1) {
    occurrences[new Date(year, index - 1, day).getDay()] += 1;
  }
  const amounts = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of entries) {
    if (entry.type !== 'expense') continue;
    const day = Number(entry.date.slice(8, 10));
    if (day > lastDay) continue;
    const dow = new Date(year, index - 1, day).getDay();
    amounts[dow] += entry.amount;
    counts[dow] += 1;
  }
  const rows = [];
  for (let dow = 0; dow < 7; dow += 1) {
    const occurrence = occurrences[dow];
    rows.push({
      weekday: dow,
      amount: round2(amounts[dow]),
      count: counts[dow],
      avg: occurrence > 0 ? round2(amounts[dow] / occurrence) : 0,
      occurrences: occurrence,
    });
  }
  const weekendAmount = amounts[0] + amounts[6];
  const weekendDays = occurrences[0] + occurrences[6];
  const weekdayAmount = amounts[1] + amounts[2] + amounts[3] + amounts[4] + amounts[5];
  const weekdayDays = occurrences[1] + occurrences[2] + occurrences[3] + occurrences[4] + occurrences[5];
  return {
    rows,
    weekendAvg: weekendDays > 0 ? weekendAmount / weekendDays : 0,
    weekdayAvg: weekdayDays > 0 ? weekdayAmount / weekdayDays : 0,
  };
}

function monthTotals(entries, month) {
  let expense = 0;
  let income = 0;
  let count = 0;
  for (const entry of entries) {
    if (monthOf(entry.date) !== month) continue;
    if (entry.type === 'income') income += entry.amount;
    else {
      expense += entry.amount;
      count += 1;
    }
  }
  return { month, expense: round2(expense), income: round2(income), count };
}

/**
 * Rule-based spending insights. Each row is a translatable code plus its
 * values; the Client localizes it and the Host formats it for Agent tools.
 */
function buildInsights(input) {
  const {
    expense, income, count, entryCount, budget, elapsed, days, byCategory, byMethod,
    prev, projected, weekday, top, month, today,
  } = input;
  const rows = [];

  if (entryCount === 0) {
    rows.push({ code: 'empty', level: 'info', values: { month } });
    return rows;
  }

  if (budget > 0) {
    const ratio = expense / budget;
    if (ratio >= 1) {
      rows.push({ code: 'budget_over', level: 'warn', values: { over: round2(expense - budget), ratio: Math.round(ratio * 100) } });
    } else if (ratio >= 0.85) {
      rows.push({ code: 'budget_near', level: 'warn', values: { left: round2(budget - expense), ratio: Math.round(ratio * 100) } });
    } else {
      rows.push({ code: 'budget_ok', level: 'ok', values: { left: round2(budget - expense), ratio: Math.round(ratio * 100) } });
    }
    if (elapsed > 0 && elapsed < days && ratio < 1) {
      rows.push({ code: 'budget_daily', level: 'tip', values: { amount: round2((budget - expense) / (days - elapsed)), days: days - elapsed } });
    }
    if (projected > budget && ratio < 1) {
      rows.push({ code: 'projection_over', level: 'warn', values: { projected: round2(projected), over: round2(projected - budget) } });
    }
  } else {
    rows.push({ code: 'budget_unset', level: 'tip', values: {} });
  }

  const topCategory = byCategory[0];
  if (topCategory !== undefined && topCategory.share >= 0.45 && expense >= 300) {
    rows.push({
      code: 'dominant_category',
      level: 'tip',
      values: { category: topCategory.id, share: Math.round(topCategory.share * 100), amount: round2(topCategory.amount) },
    });
  }

  for (const row of byCategory.slice(0, 3)) {
    const before = prev.byCategory[row.id] ?? 0;
    if (before > 0 && row.amount > before * 1.3 && row.amount - before >= 100) {
      rows.push({
        code: 'category_spike',
        level: 'warn',
        values: {
          category: row.id,
          amount: round2(row.amount),
          prev: round2(before),
          pct: Math.round((row.amount / before - 1) * 100),
        },
      });
    }
  }

  if (prev.expense > 0) {
    const delta = expense - prev.expense;
    if (delta >= 100 && delta / prev.expense >= 0.25) {
      rows.push({ code: 'mom_up', level: 'warn', values: { pct: Math.round((delta / prev.expense) * 100), prev: round2(prev.expense), now: round2(expense) } });
    } else if (delta <= -100 && -delta / prev.expense >= 0.2) {
      rows.push({ code: 'mom_down', level: 'ok', values: { pct: Math.round((-delta / prev.expense) * 100), prev: round2(prev.expense) } });
    }
  }

  if (weekday.weekendAvg > 0 && weekday.weekdayAvg > 0 && weekday.weekendAvg > weekday.weekdayAvg * 1.5) {
    rows.push({
      code: 'weekend_high',
      level: 'tip',
      values: {
        weekend: round2(weekday.weekendAvg),
        weekday: round2(weekday.weekdayAvg),
        pct: Math.round((weekday.weekendAvg / weekday.weekdayAvg - 1) * 100),
      },
    });
  }

  const biggest = top[0];
  if (biggest !== undefined && expense > 0 && biggest.amount / expense >= 0.4 && biggest.amount >= 200) {
    rows.push({
      code: 'big_single',
      level: 'info',
      values: {
        amount: round2(biggest.amount),
        note: biggest.note,
        category: biggest.category,
        share: Math.round((biggest.amount / expense) * 100),
      },
    });
  }

  const notes = new Map();
  for (const entry of input.entries) {
    if (entry.type !== 'expense') continue;
    const note = entry.note.trim();
    if (note === '') continue;
    const bucket = notes.get(note) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += entry.amount;
    notes.set(note, bucket);
  }
  let frequent = null;
  for (const [note, bucket] of notes) {
    if (frequent === null || bucket.count > frequent.bucket.count) frequent = { note, bucket };
  }
  if (frequent !== null && frequent.bucket.count >= 4) {
    rows.push({
      code: 'frequent_note',
      level: 'tip',
      values: { note: frequent.note, count: frequent.bucket.count, amount: round2(frequent.bucket.amount) },
    });
  }

  if (income > 0) {
    const net = round2(income - expense);
    if (net >= 0) {
      rows.push({ code: 'saving_ok', level: 'ok', values: { net, rate: Math.round((net / income) * 100) } });
    } else {
      rows.push({ code: 'saving_negative', level: 'warn', values: { net: round2(-net) } });
    }
  } else if (count >= 5) {
    rows.push({ code: 'no_income', level: 'info', values: {} });
  }

  const topMethod = byMethod[0];
  if (topMethod !== undefined && byMethod.length >= 3 && topMethod.share >= 0.6 && expense >= 500) {
    rows.push({
      code: 'method_concentration',
      level: 'info',
      values: { method: topMethod.id, share: Math.round(topMethod.share * 100) },
    });
  }

  if (elapsed > 0) {
    rows.push({ code: 'daily_avg', level: 'info', values: { amount: round2(expense / elapsed) } });
  }

  const weight = { warn: 0, tip: 1, ok: 2, info: 3 };
  rows.sort((left, right) => (weight[left.level] ?? 9) - (weight[right.level] ?? 9));
  return rows.slice(0, 6);
}

/**
 * Build the complete Client snapshot for one month.
 * Pure function of the document, the month and the clock.
 */
export function buildSnapshot(state, month, now = new Date()) {
  const today = todayText(now);
  const currentMonth = monthOf(today);
  const selected = normalizeMonth(month, currentMonth);
  const [year, index] = selected.split('-').map(Number);
  const days = daysInMonth(selected);
  const elapsed = selected === currentMonth ? Number(today.slice(8, 10)) : (selected < currentMonth ? days : 0);

  const all = state.entries;
  const entries = all
    .filter((entry) => monthOf(entry.date) === selected)
    .sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      return left.createdAt < right.createdAt ? 1 : -1;
    });

  let expense = 0;
  let income = 0;
  let expenseCount = 0;
  for (const entry of entries) {
    if (entry.type === 'income') income += entry.amount;
    else {
      expense += entry.amount;
      expenseCount += 1;
    }
  }
  expense = round2(expense);
  income = round2(income);

  const daily = [];
  for (let day = 1; day <= days; day += 1) {
    daily.push({ date: `${selected}-${pad2(day)}`, day, expense: 0, income: 0 });
  }
  for (const entry of entries) {
    const day = Number(entry.date.slice(8, 10));
    const row = daily[day - 1];
    if (row === undefined) continue;
    if (entry.type === 'income') row.income = round2(row.income + entry.amount);
    else row.expense = round2(row.expense + entry.amount);
  }

  const byCategory = breakdown(entries, 'expense', 'category', expense);
  const byMethod = breakdown(entries, 'expense', 'method', expense);

  const weekday = weekdayStats(entries, selected, elapsed);
  const prevMonth = shiftMonth(selected, -1);
  const prevTotals = monthTotals(all, prevMonth);
  const prevByCategory = {};
  for (const row of breakdown(all.filter((entry) => monthOf(entry.date) === prevMonth), 'expense', 'category', prevTotals.expense)) {
    prevByCategory[row.id] = row.amount;
  }

  const months = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    months.push(monthTotals(all, shiftMonth(selected, offset)));
  }

  const top = entries
    .filter((entry) => entry.type === 'expense')
    .slice()
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: entry.amount,
      category: entry.category,
      note: entry.note,
      method: entry.method,
    }));

  const budget = state.budget > 0 ? state.budget : 0;
  const projected = elapsed > 0 ? round2((expense / elapsed) * days) : 0;
  const prev = {
    month: prevMonth,
    expense: prevTotals.expense,
    income: prevTotals.income,
    count: prevTotals.count,
    byCategory: prevByCategory,
  };

  const insights = buildInsights({
    expense, income, count: expenseCount, entryCount: entries.length, budget, elapsed, days,
    byCategory, byMethod, prev, projected, weekday, top, month: selected, today, entries,
  });

  return {
    version: STORE_VERSION,
    month: selected,
    today,
    updatedAt: state.updatedAt,
    budget,
    categories: { expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES },
    methods: METHODS,
    entries,
    analysis: {
      expense,
      income,
      net: round2(income - expense),
      count: expenseCount,
      days,
      elapsed,
      avg: elapsed > 0 ? round2(expense / elapsed) : 0,
      projected,
      max: top.length > 0 ? top[0].amount : 0,
      daily,
      byCategory,
      byMethod,
      byWeekday: weekday.rows,
      weeks: { weekendAvg: round2(weekday.weekendAvg), weekdayAvg: round2(weekday.weekdayAvg) },
      months,
      prev,
      top,
      insights,
    },
    stats: {
      total: all.length,
      firstDate: all.reduce((earliest, entry) => (earliest === '' || entry.date < earliest ? entry.date : earliest), ''),
    },
    dataFile: '',
  };
}

/* ------------------------------------------------------------------ *
 * Model-facing text
 * ------------------------------------------------------------------ */

function expenseCategoryZh(id) {
  return categoryOf('expense', id)?.zh ?? id;
}

function insightText(insight) {
  const v = insight.values ?? {};
  switch (insight.code) {
    case 'empty': return `${v.month} 还没有任何账目。`;
    case 'budget_over': return `本月支出已超出预算 ${moneyText(v.over)}（用掉预算的 ${v.ratio}%）。`;
    case 'budget_near': return `本月预算只剩 ${moneyText(v.left)}（已用 ${v.ratio}%），注意控制。`;
    case 'budget_ok': return `本月预算还剩 ${moneyText(v.left)}（已用 ${v.ratio}%），节奏正常。`;
    case 'budget_daily': return `按剩余预算计算，余下 ${v.days} 天每天可花约 ${moneyText(v.amount)}。`;
    case 'projection_over': return `按当前速度预计月末支出 ${moneyText(v.projected)}，将超出预算 ${moneyText(v.over)}。`;
    case 'budget_unset': return '还没有设置月度预算，设置后可以得到更准确的消费提示。';
    case 'dominant_category': return `${expenseCategoryZh(v.category)} 类支出占比 ${v.share}%（${moneyText(v.amount)}），集中度偏高。`;
    case 'category_spike': return `${expenseCategoryZh(v.category)} 类比上月增加 ${v.pct}%（${moneyText(v.prev)} → ${moneyText(v.amount)}）。`;
    case 'mom_up': return `比上月多花了 ${v.pct}%（${moneyText(v.prev)} → ${moneyText(v.now)}）。`;
    case 'mom_down': return `比上月少花了 ${v.pct}%（上月 ${moneyText(v.prev)}），保持得不错。`;
    case 'weekend_high': return `周末日均 ${moneyText(v.weekend)}，比工作日的 ${moneyText(v.weekday)} 高 ${v.pct}%。`;
    case 'big_single': return `单笔最大支出 ${moneyText(v.amount)}（${v.note === '' ? '无备注' : v.note}），占本月支出的 ${v.share}%。`;
    case 'frequent_note': return `本月「${v.note}」出现了 ${v.count} 次，合计 ${moneyText(v.amount)}。`;
    case 'saving_ok': return `本月结余 ${moneyText(v.net)}，储蓄率约 ${v.rate}%。`;
    case 'saving_negative': return `本月支出超过收入 ${moneyText(v.net)}。`;
    case 'no_income': return '本月还没有记录收入。';
    case 'method_concentration': return `支付方式集中在 ${methodLabel(v.method)}（占 ${v.share}%）。`;
    case 'daily_avg': return `本月日均支出约 ${moneyText(v.amount)}。`;
    default: return '';
  }
}

function reportText(snapshot) {
  const analysis = snapshot.analysis;
  const lines = [];
  lines.push(`记账月份：${snapshot.month}`);
  lines.push(`支出 ${moneyText(analysis.expense)}（${analysis.count} 笔） · 收入 ${moneyText(analysis.income)} · 结余 ${moneyText(analysis.net)}`);
  if (snapshot.budget > 0) {
    lines.push(`月度预算 ${moneyText(snapshot.budget)} · 剩余 ${moneyText(snapshot.budget - analysis.expense)}`);
  }
  if (analysis.byCategory.length > 0) {
    lines.push('分类占比：' + analysis.byCategory.slice(0, 6).map((row) => {
      const meta = categoryOf('expense', row.id);
      return `${meta === undefined ? row.id : meta.zh} ${moneyText(row.amount)}（${Math.round(row.share * 100)}%）`;
    }).join('、'));
  }
  if (analysis.byMethod.length > 0) {
    lines.push('支付方式：' + analysis.byMethod.map((row) => `${methodLabel(row.id)} ${moneyText(row.amount)}（${Math.round(row.share * 100)}%）`).join('、'));
  }
  const weeks = analysis.byWeekday.map((row) => `${'日一二三四五六'[row.weekday]} ${moneyText(row.amount)}`);
  lines.push('按星期：' + weeks.join('、'));
  if (snapshot.entries.length > 0) {
    lines.push('最近记录（id · 日期 · 分类 · 金额 · 备注）：');
    for (const entry of snapshot.entries.slice(0, 10)) {
      const label = entry.type === 'income' ? categoryOf('income', entry.category)?.zh ?? entry.category : categoryOf('expense', entry.category)?.zh ?? entry.category;
      lines.push(`- ${entry.id} · ${entry.date} · ${entry.type === 'income' ? '收入' : '支出'}·${label} · ${moneyText(entry.amount)}${entry.note === '' ? '' : ` · ${entry.note}`}`);
    }
  }
  const tips = analysis.insights.map(insightText).filter((text) => text !== '');
  if (tips.length > 0) {
    lines.push('消费提示：');
    for (const tip of tips) lines.push(`- ${tip}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = raw === '' ? {} : JSON.parse(raw);
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(null));
  });
}

/** Apply one Client command; returns the affected month's snapshot. */
async function applyCommand(store, body) {
  const op = typeof body.op === 'string' ? body.op : '';
  const requestedMonth = normalizeMonth(body.month, '');
  if (op === 'add') {
    const entry = await store.add(body.entry !== null && typeof body.entry === 'object' ? body.entry : body);
    // Follow the entry's own month so a back-dated record is visible immediately.
    return { snapshot: await store.snapshot(monthOf(entry.date)), entry };
  }
  if (op === 'update') {
    const entry = await store.update(String(body.id ?? ''), body.entry !== null && typeof body.entry === 'object' ? body.entry : body);
    return { snapshot: await store.snapshot(monthOf(entry.date)), entry };
  }
  if (op === 'remove') {
    const entry = await store.remove(String(body.id ?? ''));
    return { snapshot: await store.snapshot(requestedMonth === '' ? monthOf(entry.date) : requestedMonth), entry };
  }
  if (op === 'setBudget') {
    await store.setBudget(body.amount);
    return { snapshot: await store.snapshot(requestedMonth) };
  }
  throw new LedgerError('UNKNOWN_OP', `未知操作: ${op}`);
}

/* ------------------------------------------------------------------ *
 * Agent tools
 * ------------------------------------------------------------------ */

const TOOL_ADD = {
  name: 'ledger_add',
  description: 'Record one personal expense or income in the local ledger (dsh-ledger plugin). Use it whenever the user reports spending or income, for example "午饭 25 元" or "发工资 12000". Amount is in CNY. Omit date to use today.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount: { type: 'number', description: 'Positive amount in CNY, for example 25.5.' },
      type: {
        type: 'string',
        enum: ['expense', 'income'],
        description: 'expense (default) or income.',
      },
      category: {
        type: 'string',
        description: 'Expense categories: food, transport, shopping, housing, entertainment, health, education, social, telecom, other. Income categories: salary, bonus, investment, other-income.',
      },
      note: { type: 'string', description: 'Short free-text note such as the merchant or item.' },
      date: { type: 'string', description: 'Date as YYYY-MM-DD; omit for today.' },
      method: {
        type: 'string',
        enum: ['wechat', 'alipay', 'card', 'cash', 'other'],
        description: 'Payment method; defaults to other.',
      },
    },
    required: ['amount'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        id: { type: 'string' },
        month: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['ok', 'text'],
    },
    render(args, value) {
      return [{ type: 'text', text: String(value.text ?? '') }];
    },
  },
};

const TOOL_REPORT = {
  name: 'ledger_report',
  description: 'Summarize the personal ledger for one month (default: the current month): totals, category and payment-method breakdowns, weekday pattern, previous-month comparison, spending insights, and the ten most recent entries with their ids. Call it when the user asks how much they spent, wants a review, or asks for spending advice.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      month: { type: 'string', description: 'Month as YYYY-MM; omit for the current month.' },
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        month: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['month', 'text'],
    },
    render(args, value) {
      return [{ type: 'text', text: String(value.text ?? '') }];
    },
  },
};

const TOOL_DELETE = {
  name: 'ledger_delete',
  description: 'Delete one ledger entry by its id (ids appear in ledger_report and in the ledger panel). Use it only when the user asks to remove or correct a recorded entry.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Entry id, for example from ledger_report.' },
    },
    required: ['id'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        text: { type: 'string' },
      },
      required: ['ok', 'text'],
    },
    render(args, value) {
      return [{ type: 'text', text: String(value.text ?? '') }];
    },
  },
};

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

function defaultDataFile() {
  return path.join(homedir(), '.dsh', 'personal-ledger', 'ledger.json');
}

/**
 * Compose the tool definitions over one store.
 * @param store - the shared store instance.
 */
function registerTools(toolCtx, store) {
  const add = {
    ...TOOL_ADD,
    async execute(args) {
      const entry = await store.add(args);
      const label = entry.type === 'income' ? '收入' : '支出';
      const category = categoryLabel(entry);
      return {
        ok: true,
        id: entry.id,
        month: monthOf(entry.date),
        text: `已记账：${entry.date} ${label} ${category} ${moneyText(entry.amount)}${entry.note === '' ? '' : `（${entry.note}）`}。`,
      };
    },
  };
  const report = {
    ...TOOL_REPORT,
    async execute(args) {
      const snapshot = await store.snapshot(typeof args?.month === 'string' ? args.month : '');
      return { month: snapshot.month, text: reportText(snapshot) };
    },
  };
  const remove = {
    ...TOOL_DELETE,
    async execute(args) {
      const entry = await store.remove(String(args?.id ?? ''));
      return {
        ok: true,
        text: `已删除：${entry.date} ${entry.type === 'income' ? '收入' : '支出'} ${categoryLabel(entry)} ${moneyText(entry.amount)}${entry.note === '' ? '' : `（${entry.note}）`}。`,
      };
    },
  };
  toolCtx.effect(() => toolCtx.tools.register(add), 'personal-ledger: ledger_add');
  toolCtx.effect(() => toolCtx.tools.register(report), 'personal-ledger: ledger_report');
  toolCtx.effect(() => toolCtx.tools.register(remove), 'personal-ledger: ledger_delete');
}

export function apply(ctx) {
  const filePath = defaultDataFile();
  const store = createStore(filePath);
  console.log(`[dsh-ledger] host ready: ${filePath}`);

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        // Same trust fence the Host applies to its own API routes: plugin
        // prefix routes are not gated by the framework on their own.
        try {
          const rejection = webCtx.get('connection')?.requestRejection?.(req);
          if (rejection !== undefined) {
            sendJson(res, rejection, { ok: false, error: 'untrusted request', code: 'UNAUTHORIZED' });
            return;
          }
        } catch {
          /* a connection service that cannot answer is treated as absent */
        }
        try {
          if (req.method === 'GET') {
            const url = new URL(String(req.url ?? ROUTE_PREFIX), 'http://localhost');
            const snapshot = await store.snapshot(url.searchParams.get('month') ?? '');
            sendJson(res, 200, { ok: true, data: { ...snapshot, dataFile: filePath } });
            return;
          }
          if (req.method === 'POST') {
            const body = await readJsonBody(req);
            if (body === null) {
              sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON', code: 'BAD_JSON' });
              return;
            }
            const result = await applyCommand(store, body);
            sendJson(res, 200, { ok: true, data: { ...result.snapshot, dataFile: filePath } });
            return;
          }
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, POST');
          res.end();
        } catch (error) {
          const code = error instanceof LedgerError ? error.code : 'INTERNAL';
          const message = error instanceof Error ? error.message : String(error);
          if (code === 'INTERNAL') console.error('[dsh-ledger] request failed:', error);
          sendJson(res, code === 'NOT_FOUND' ? 404 : 400, { ok: false, error: message, code });
        }
      },
    }), 'personal-ledger: http api');
  });

  ctx.inject(['tools'], (toolCtx) => {
    registerTools(toolCtx, store);
  });
}

/** Pure helpers exposed for verification scripts (not part of the wire API). */
export const __testables = {
  buildSnapshot,
  buildInsights,
  applyCommand,
  buildInsights,
  createStore,
  moneyText,
  monthOf,
  shiftMonth,
  daysInMonth,
  isValidDate,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  METHODS,
};
