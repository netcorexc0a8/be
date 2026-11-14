// Журнал кормлений: когда покормили и сколько выпито. Без DOM; «сейчас» передаётся параметром.

import type { AppState } from './state';

export interface FeedEntry {
  /** Местное время устройства: YYYY-MM-DDTHH:MM. */
  at: string;
  /** Сколько мл выпито; null — не указано. */
  ml: number | null;
}

const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, '0');
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localAt = (d: Date): string => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const isEntry = (e: unknown): e is FeedEntry => {
  const c = e as Partial<FeedEntry> | null;
  return (
    typeof c?.at === 'string' &&
    AT_RE.test(c.at) &&
    (c.ml === null || (Number.isInteger(c.ml) && (c.ml as number) > 0))
  );
};

const byTime = (a: FeedEntry, b: FeedEntry): number => a.at.localeCompare(b.at);

/** Журнал из сохранённых данных: испорченные записи отбрасываются. */
export function parseFeedLog(raw: unknown): FeedEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry).map((e) => ({ at: e.at, ml: e.ml })).sort(byTime);
}

/** Текущее время для поля ввода: «18:30». */
export const timeNow = (now: Date): string => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/**
 * Время из поля «ЧЧ:ММ» в отметку. Если время позже текущего, это вчерашнее кормление
 * (например, ночное кормление в 23:50 отмечают уже после полуночи).
 */
export function resolveFeedAt(time: string, now: Date): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
  if (at.getTime() > now.getTime()) at.setDate(at.getDate() - 1);
  return localAt(at);
}

/** true, если время из поля будет записано на вчера. */
export function isYesterday(time: string, now: Date): boolean {
  const at = resolveFeedAt(time, now);
  return at !== null && at.slice(0, 10) !== localDate(now);
}

export type FeedMlResult = { ok: true; ml: number | null } | { ok: false; error: string };

/** Выпитые мл: пусто — не указано, иначе целое положительное число. */
export function validateFeedMl(raw: string): FeedMlResult {
  const s = raw.trim();
  if (!s) return { ok: true, ml: null };
  const ml = Number(s);
  if (!/^\d+$/.test(s) || !Number.isInteger(ml) || ml <= 0) {
    return { ok: false, error: 'Мл: укажите целое число или оставьте поле пустым.' };
  }
  return { ok: true, ml };
}

/** Добавляет отметку; отметка на ту же минуту заменяется (защита от двойного нажатия). */
export function addFeed(state: AppState, entry: FeedEntry): AppState {
  const feedLog = state.feedLog.filter((e) => e.at !== entry.at);
  feedLog.push(entry);
  feedLog.sort(byTime);
  return { ...state, feedLog };
}

export function removeFeed(state: AppState, at: string): AppState {
  return { ...state, feedLog: state.feedLog.filter((e) => e.at !== at) };
}

/** Заменяет отметку: время и мл можно поправить. */
export function replaceFeed(state: AppState, oldAt: string, entry: FeedEntry): AppState {
  return addFeed(removeFeed(state, oldAt), entry);
}

const minutesBetween = (fromAt: string, now: Date): number => {
  const [d, t] = fromAt.split('T') as [string, string];
  const [y, mo, day] = d.split('-').map(Number) as [number, number, number];
  const [h, mi] = t.split(':').map(Number) as [number, number];
  const from = new Date(y, mo - 1, day, h, mi);
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));
};

/** 161 → «2 ч 41 мин назад». */
export function formatSince(minutes: number): string {
  if (minutes < 1) return 'только что';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин назад`;
  return m === 0 ? `${h} ч назад` : `${h} ч ${m} мин назад`;
}

export interface FeedDayView {
  date: string;
  count: number;
  /** Сумма указанных мл. */
  totalMl: number;
  /** Сколько отметок без мл. */
  withoutMl: number;
  /** Отметки за сегодня, новые сверху. */
  entries: { at: string; time: string; ml: number | null }[];
  /** Последнее кормление, может быть вчерашним. */
  lastAt: string | null;
  since: string | null;
}

const sumMl = (entries: FeedEntry[]): number => entries.reduce((s, e) => s + (e.ml ?? 0), 0);

/** Кормления за сегодня (календарные сутки по времени устройства). */
export function feedDay(log: FeedEntry[], now: Date): FeedDayView {
  const date = localDate(now);
  const today = log.filter((e) => e.at.startsWith(date));
  const last = log[log.length - 1] ?? null;
  return {
    date,
    count: today.length,
    totalMl: sumMl(today),
    withoutMl: today.filter((e) => e.ml === null).length,
    entries: today
      .map((e) => ({ at: e.at, time: e.at.slice(11), ml: e.ml }))
      .reverse(),
    lastAt: last?.at ?? null,
    since: last ? formatSince(minutesBetween(last.at, now)) : null,
  };
}

export interface FeedHistoryDay {
  date: string;
  count: number;
  totalMl: number;
  withoutMl: number;
  times: string[];
}

/** Прошлые дни (без сегодняшнего), новые сверху. */
export function feedHistory(log: FeedEntry[], now: Date): FeedHistoryDay[] {
  const today = localDate(now);
  const days = new Map<string, FeedEntry[]>();
  for (const e of log) {
    const date = e.at.slice(0, 10);
    if (date >= today) continue;
    const list = days.get(date) ?? [];
    list.push(e);
    days.set(date, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({
      date,
      count: entries.length,
      totalMl: sumMl(entries),
      withoutMl: entries.filter((e) => e.ml === null).length,
      times: entries.map((e) => e.at.slice(11)),
    }));
}
