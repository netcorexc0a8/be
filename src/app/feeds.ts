// Журнал кормлений: когда покормили. Без DOM; «сейчас» передаётся параметром.

import type { AppState } from './state';

export interface FeedEntry {
  /** Местное время устройства: YYYY-MM-DDTHH:MM. */
  at: string;
}

const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, '0');
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localAt = (d: Date): string => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const isEntry = (e: unknown): e is FeedEntry => {
  const c = e as Partial<FeedEntry> | null;
  return typeof c?.at === 'string' && AT_RE.test(c.at);
};

const byTime = (a: FeedEntry, b: FeedEntry): number => a.at.localeCompare(b.at);

/** Журнал из сохранённых данных: испорченные записи и повторы отбрасываются. */
export function parseFeedLog(raw: unknown): FeedEntry[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set(raw.filter(isEntry).map((e) => e.at));
  return [...unique].sort().map((at) => ({ at }));
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

/** Добавляет отметку; отметка на ту же минуту не дублируется (защита от двойного нажатия). */
export function addFeed(state: AppState, at: string): AppState {
  if (state.feedLog.some((e) => e.at === at)) return state;
  return { ...state, feedLog: [...state.feedLog, { at }].sort(byTime) };
}

export function removeFeed(state: AppState, at: string): AppState {
  return { ...state, feedLog: state.feedLog.filter((e) => e.at !== at) };
}

/** Поправить время отметки. */
export function moveFeed(state: AppState, oldAt: string, at: string): AppState {
  return addFeed(removeFeed(state, oldAt), at);
}

const toDate = (at: string): Date => {
  const [d, t] = at.split('T') as [string, string];
  const [y, mo, day] = d.split('-').map(Number) as [number, number, number];
  const [h, mi] = t.split(':').map(Number) as [number, number];
  return new Date(y, mo - 1, day, h, mi);
};

const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));

/** 161 → «2 ч 41 мин». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** 161 → «2 ч 41 мин назад». */
export const formatSince = (minutes: number): string =>
  minutes < 1 ? 'только что' : `${formatDuration(minutes)} назад`;

export interface FeedRow {
  at: string;
  time: string;
  /** Промежуток от предыдущего кормления (может быть вчерашним): «через 3 ч 25 мин». */
  gap: string | null;
}

export interface FeedDayView {
  date: string;
  count: number;
  /** Отметки за сегодня, новые сверху. */
  entries: FeedRow[];
  /** Последнее кормление, может быть вчерашним. */
  lastTime: string | null;
  since: string | null;
}

/** Кормления за сегодня (календарные сутки по времени устройства). */
export function feedDay(log: FeedEntry[], now: Date): FeedDayView {
  const date = localDate(now);
  const entries: FeedRow[] = [];
  log.forEach((e, i) => {
    if (!e.at.startsWith(date)) return;
    const prev = log[i - 1];
    entries.push({
      at: e.at,
      time: e.at.slice(11),
      gap: prev ? `через ${formatDuration(minutesBetween(toDate(prev.at), toDate(e.at)))}` : null,
    });
  });
  const last = log[log.length - 1] ?? null;
  return {
    date,
    count: entries.length,
    entries: entries.reverse(),
    lastTime: last ? (last.at.startsWith(date) ? last.at.slice(11) : `вчера ${last.at.slice(11)}`) : null,
    since: last ? formatSince(minutesBetween(toDate(last.at), now)) : null,
  };
}

/** Кружочки «сколько из плана»: закрашено count, всего не меньше верхней границы плана. */
export function feedDots(count: number, planMax: number): boolean[] {
  return Array.from({ length: Math.max(count, planMax) }, (_, i) => i < count);
}

export interface FeedHistoryDay {
  date: string;
  count: number;
  times: string[];
}

/** Прошлые дни (без сегодняшнего), новые сверху. */
export function feedHistory(log: FeedEntry[], now: Date): FeedHistoryDay[] {
  const today = localDate(now);
  const days = new Map<string, string[]>();
  for (const e of log) {
    const date = e.at.slice(0, 10);
    if (date >= today) continue;
    days.set(date, [...(days.get(date) ?? []), e.at.slice(11)]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, times]) => ({ date, count: times.length, times }));
}
