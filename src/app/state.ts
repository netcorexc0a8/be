// Состояние приложения и его сохранение на устройстве.

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  grams: number;
}

/** Смесь, которую пользователь добавил сам. */
export interface CustomFormula {
  id: string;
  name: string;
  kcalPer100ml: number;
  /** Мл воды на 1 мерную ложку по таблице на банке; null — не указано, ложки не показываются. */
  waterMlPerScoop: number | null;
}

export interface AppState {
  name: string;
  dob: string; // YYYY-MM-DD
  /** id выбранной смеси: встроенной (FORMULAS) или своей (customFormulas). */
  formula: string;
  customFormulas: CustomFormula[];
  /** Калорийность выбранной смеси (копия, по ней идут расчёт и проверки). */
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

type BuiltInId = keyof typeof FORMULAS;
const isBuiltIn = (id: string): id is BuiltInId => Object.hasOwn(FORMULAS, id);
const DEFAULT_FORMULA: BuiltInId = 'nan-optipro-1';

export const STORAGE_KEY = 'formula-calculator/state/v1';

/** Пример из методики: 5700 г, 3 мес., NAN Optipro, 6–7 кормлений. */
export function exampleState(today: string): AppState {
  return {
    name: 'Малыш',
    dob: shiftMonths(today, -3),
    formula: DEFAULT_FORMULA,
    customFormulas: [],
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

const isCustomFormula = (f: unknown): f is CustomFormula => {
  const c = f as Partial<CustomFormula> | null;
  return (
    typeof c?.id === 'string' &&
    typeof c.name === 'string' &&
    isNum(c.kcalPer100ml) &&
    (c.waterMlPerScoop === null || (isNum(c.waterMlPerScoop) && c.waterMlPerScoop > 0))
  );
};

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
      typeof s.formula !== 'string' ||
      !isNum(s.kcalPer100ml) ||
      !isNum(s.feedingsMin) ||
      !isNum(s.feedingsMax) ||
      weights.length === 0
    ) {
      return null;
    }
    let customFormulas = Array.isArray(s.customFormulas) ? s.customFormulas.filter(isCustomFormula) : [];
    // данные до списка смесей: «своя смесь» хранилась только калорийностью
    if (!Array.isArray(s.customFormulas) && s.formula === 'custom') {
      customFormulas = [{ id: 'custom', name: 'Своя смесь', kcalPer100ml: s.kcalPer100ml, waterMlPerScoop: null }];
    }
    if (!isBuiltIn(s.formula) && !customFormulas.some((f) => f.id === s.formula)) return null;
    return {
      name: s.name,
      dob: s.dob,
      formula: s.formula,
      customFormulas,
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

export interface FormulaInfo {
  id: string;
  name: string;
  kcalPer100ml: number;
  waterMlPerScoop: number | null;
  custom: boolean;
}

/** Все смеси для выбора: сначала встроенные, потом свои. */
export function allFormulas(state: AppState): FormulaInfo[] {
  const builtIn = (Object.keys(FORMULAS) as BuiltInId[]).map((id) => ({
    id,
    name: FORMULAS[id].label,
    kcalPer100ml: FORMULAS[id].kcalPer100ml,
    waterMlPerScoop: FORMULAS[id].waterMlPerScoop,
    custom: false,
  }));
  return [...builtIn, ...state.customFormulas.map((f) => ({ ...f, custom: true }))];
}

/** Выбранная смесь. Калорийность берётся из состояния (по ней идёт расчёт). */
export function currentFormula(state: AppState): FormulaInfo {
  const found = allFormulas(state).find((f) => f.id === state.formula);
  if (!found) throw new Error(`Нет смеси ${state.formula}`);
  return { ...found, kcalPer100ml: state.kcalPer100ml };
}

export function selectFormula(state: AppState, id: string): AppState {
  const f = allFormulas(state).find((x) => x.id === id);
  if (!f) return state;
  return { ...state, formula: id, kcalPer100ml: f.kcalPer100ml, isExample: false };
}

/** Добавляет свою смесь и сразу выбирает её. */
export function addCustomFormula(state: AppState, input: Omit<CustomFormula, 'id'>, id: string): AppState {
  const customFormulas = [...state.customFormulas, { id, ...input }];
  return selectFormula({ ...state, customFormulas }, id);
}

/** Удаляет свою смесь; если она была выбрана, выбирается NAN Optipro 1. */
export function removeCustomFormula(state: AppState, id: string): AppState {
  const customFormulas = state.customFormulas.filter((f) => f.id !== id);
  const next = { ...state, customFormulas, isExample: false };
  return state.formula === id ? selectFormula(next, DEFAULT_FORMULA) : next;
}

/** Правка калорийности выбранной своей смеси. Калорийность встроенной смеси не меняется. */
export function setFormulaKcal(state: AppState, kcalPer100ml: number): AppState {
  if (isBuiltIn(state.formula)) return state;
  const customFormulas = state.customFormulas.map((f) => (f.id === state.formula ? { ...f, kcalPer100ml } : f));
  return { ...state, customFormulas, kcalPer100ml, isExample: false };
}

export type FormulaInputResult =
  | { ok: true; value: Omit<CustomFormula, 'id'> }
  | { ok: false; error: string };

/**
 * Проверка формы новой смеси. Диапазон калорийности здесь не проверяется:
 * это делает общая проверка расчёта, и при ошибке расчёт не показывается.
 */
export function validateFormulaInput(
  input: { name: string; kcal: string; water: string },
  existingNames: string[] = Object.values(FORMULAS).map((f) => f.label),
): FormulaInputResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Укажите название смеси.' };
  if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'Смесь с таким названием уже есть.' };
  }
  const kcal = Number(input.kcal.trim().replace(',', '.'));
  if (!input.kcal.trim() || !Number.isFinite(kcal) || kcal <= 0) {
    return { ok: false, error: 'Укажите ккал на 100 мл готовой смеси.' };
  }
  const waterRaw = input.water.trim();
  let waterMlPerScoop: number | null = null;
  if (waterRaw) {
    waterMlPerScoop = Number(waterRaw.replace(',', '.'));
    if (!Number.isFinite(waterMlPerScoop) || waterMlPerScoop <= 0) {
      return { ok: false, error: 'Мл воды на 1 ложку: укажите число с банки или оставьте пустым.' };
    }
  }
  return { ok: true, value: { name, kcalPer100ml: kcal, waterMlPerScoop } };
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
