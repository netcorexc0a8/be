// Состояние приложения и его сохранение на устройстве.

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  grams: number;
}

export interface AppState {
  name: string;
  dob: string; // YYYY-MM-DD
  formula: 'nan-optipro-1' | 'custom';
  kcalPer100ml: number;
  feedingsMin: number;
  feedingsMax: number;
  weights: WeightEntry[];
  /** true, пока пользователь не ввёл свои данные: показываем пометку «пример». */
  isExample: boolean;
}

export const FORMULAS = {
  // waterMlPerScoop — из таблицы кормления на банке: 1 мерная ложка без горки на 30 мл воды
  'nan-optipro-1': { label: 'NAN Optipro 1', kcalPer100ml: 67, waterMlPerScoop: 30 },
} as const;

export const STORAGE_KEY = 'formula-calculator/state/v1';

/** Пример из методики: 5700 г, 3 мес., NAN Optipro, 6–7 кормлений. */
export function exampleState(today: string): AppState {
  return {
    name: 'Малыш',
    dob: shiftMonths(today, -3),
    formula: 'nan-optipro-1',
    kcalPer100ml: 67,
    feedingsMin: 6,
    feedingsMax: 7,
    weights: [{ date: today, grams: 5700 }],
    isExample: true,
  };
}

function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(d, lastDay));
  return shifted.toISOString().slice(0, 10);
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Разбирает сохранённое состояние; при любой ошибке возвращает null. */
export function parseState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<AppState>;
    const weights = Array.isArray(s.weights)
      ? s.weights.filter((w): w is WeightEntry => isDate(w?.date) && isNum(w?.grams))
      : [];
    if (
      typeof s.name !== 'string' ||
      !isDate(s.dob) ||
      (s.formula !== 'nan-optipro-1' && s.formula !== 'custom') ||
      !isNum(s.kcalPer100ml) ||
      !isNum(s.feedingsMin) ||
      !isNum(s.feedingsMax) ||
      weights.length === 0
    ) {
      return null;
    }
    return {
      name: s.name,
      dob: s.dob,
      formula: s.formula,
      kcalPer100ml: s.kcalPer100ml,
      feedingsMin: s.feedingsMin,
      feedingsMax: s.feedingsMax,
      weights: [...weights].sort((a, b) => a.date.localeCompare(b.date)),
      isExample: s.isExample === true,
    };
  } catch {
    return null;
  }
}

export function loadState(storage: Pick<Storage, 'getItem'> | null, today: string): AppState {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return parseState(raw) ?? exampleState(today);
}

export function saveState(storage: Pick<Storage, 'setItem'> | null, state: AppState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // хранилище недоступно (приватный режим) — работаем без сохранения
  }
}

/** Последний замер веса (список отсортирован по дате). */
export function latestWeight(state: AppState): WeightEntry {
  const last = state.weights[state.weights.length - 1];
  if (!last) throw new Error('Нет замеров веса');
  return last;
}

/** Добавляет замер; если за эту дату уже есть замер, заменяет его. */
export function addWeight(state: AppState, entry: WeightEntry): AppState {
  const weights = state.weights.filter((w) => w.date !== entry.date);
  weights.push(entry);
  weights.sort((a, b) => a.date.localeCompare(b.date));
  return { ...state, weights, isExample: false };
}

/** Удаляет замер за дату. Последний оставшийся замер не удаляется. */
export function removeWeight(state: AppState, date: string): AppState {
  if (state.weights.length <= 1) return state;
  const weights = state.weights.filter((w) => w.date !== date);
  if (weights.length === state.weights.length) return state;
  return { ...state, weights, isExample: false };
}

/** Сегодняшняя дата по местному времени устройства. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const BACKUP_APP = 'formula-calculator';
const BACKUP_VERSION = 1;

/** Содержимое файла резервной копии. */
export function exportBackup(state: AppState, now: Date = new Date()): string {
  return JSON.stringify(
    { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), state },
    null,
    2,
  );
}

/** Состояние из файла резервной копии или null, если файл не подходит. */
export function importBackup(text: string): AppState | null {
  try {
    const data = JSON.parse(text) as { app?: unknown; version?: unknown; state?: unknown };
    if (data.app !== BACKUP_APP || data.version !== BACKUP_VERSION) return null;
    return parseState(JSON.stringify(data.state));
  } catch {
    return null;
  }
}

export const backupFileName = (today: string): string => `smes-${today}.json`;
