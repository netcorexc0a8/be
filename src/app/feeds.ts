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

export type EditFeedResult = { ok: true; at: string } | { ok: false; error: string };

/**
 * Новое время для отметки, которую правят: день отметки сохраняется, меняется только время.
 * Время в будущем не принимается.
 */
export function editFeedAt(oldAt: string, time: string, now: Date): EditFeedResult {
  const m = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { ok: false, error: 'Укажите время кормления.' };
  const at = `${oldAt.slice(0, 10)}T${m[1]}:${m[2]}`;
  if (at > localAt(now)) return { ok: false, error: 'Это время ещё не наступило.' };
  return { ok: true, at };
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

export interface FeedHistoryDay {
  date: string;
  count: number;
  /** Отметки дня по порядку: полное время отметки и «ЧЧ:ММ». */
  entries: { at: string; time: string }[];
}

/** Прошлые дни (без сегодняшнего), новые сверху. */
export function feedHistory(log: FeedEntry[], now: Date): FeedHistoryDay[] {
  const today = localDate(now);
  const days = new Map<string, { at: string; time: string }[]>();
  for (const e of log) {
    const date = e.at.slice(0, 10);
    if (date >= today) continue;
    days.set(date, [...(days.get(date) ?? []), { at: e.at, time: e.at.slice(11) }]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, count: entries.length, entries }));
}

const MIN_PER_DAY = 1440;
const minuteOfDay = (at: string): number => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));

/** 210 → «3ч30», 180 → «3ч», 45 → «45м»: короткая подпись промежутка на ленте. */
export function formatGapShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  return m === 0 ? `${h}ч` : `${h}ч${pad(m)}`;
}

export interface DayTimeline {
  /** Положение «сейчас» на ленте суток, от 0 до 1. */
  now: number;
  /** Кормления сегодня по порядку: положение от 0 до 1 и время. */
  points: { x: number; time: string }[];
  /** Промежутки между соседними кормлениями сегодня: от, до (0…1) и подпись. */
  gaps: { from: number; to: number; label: string }[];
}

/** Лента сегодняшних суток для графика. */
export function dayTimeline(log: FeedEntry[], now: Date): DayTimeline {
  const date = localDate(now);
  const today = log.filter((e) => e.at.startsWith(date)).map((e) => minuteOfDay(e.at));
  return {
    now: (now.getHours() * 60 + now.getMinutes()) / MIN_PER_DAY,
    points: today.map((m) => ({ x: m / MIN_PER_DAY, time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` })),
    gaps: today.slice(1).map((m, i) => ({
      from: today[i]! / MIN_PER_DAY,
      to: m / MIN_PER_DAY,
      label: formatGapShort(m - today[i]!),
    })),
  };
}

export interface RhythmRow {
  date: string;
  today: boolean;
  /** Кормления за сутки: положение от 0 до 1. */
  xs: number[];
}

/** Ритм за несколько дней: строка на каждые сутки, сегодня сверху. */
export function weekRhythm(log: FeedEntry[], now: Date, days = 7): RhythmRow[] {
  const rows: RhythmRow[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const date = localDate(d);
    rows.push({
      date,
      today: i === 0,
      xs: log.filter((e) => e.at.startsWith(date)).map((e) => minuteOfDay(e.at) / MIN_PER_DAY),
    });
  }
  return rows;
}

export interface RecentTimeline {
  /** Кормления за последние 24 часа по порядку: положение от 0 (24 ч назад) до 1 (сейчас) и время. */
  points: { x: number; time: string }[];
  /** Промежутки между соседними кормлениями: от, до (0…1) и подпись. */
  gaps: { from: number; to: number; label: string }[];
  /** Отметки часов 00, 06, 12, 18 на ленте. */
  ticks: { x: number; label: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Лента «последние 24 часа»: сейчас у правого края, ночь не разрывается в полночь. */
export function recentTimeline(log: FeedEntry[], now: Date): RecentTimeline {
  const end = now.getTime();
  const start = end - DAY_MS;
  const pos = (t: number): number => (t - start) / DAY_MS;
  const recent = log
    .map((e) => ({ e, t: toDate(e.at).getTime() }))
    .filter(({ t }) => t > start && t <= end);
  const ticks: { x: number; label: string }[] = [];
  for (let back = 0; back <= 1; back++) {
    for (const h of [0, 6, 12, 18]) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, 0).getTime();
      if (t > start && t <= end) ticks.push({ x: pos(t), label: pad(h) });
    }
  }
  ticks.sort((a, b) => a.x - b.x);
  return {
    points: recent.map(({ e, t }) => ({ x: pos(t), time: e.at.slice(11) })),
    gaps: recent.slice(1).map(({ t }, i) => ({
      from: pos(recent[i]!.t),
      to: pos(t),
      label: formatGapShort(minutesBetween(new Date(recent[i]!.t), new Date(t))),
    })),
    ticks,
  };
}
