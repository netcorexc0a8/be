import { RULES, type FeedingRules } from './rules';

export interface CalcInput {
  weightG: number;
  ageMonths: number;
  kcalPer100ml: number;
  feedings: number[];
}

export interface CalcResult {
  kcalPerKg: number;
  kcalDay: number;
  portions: number;
  mlDay: number;
  perFeeding: { feedings: number; ml: number }[];
}

export function kcalPerKg(ageMonths: number, rules: FeedingRules = RULES): number {
  const band = rules.kcalBands.find((b) => ageMonths >= b.fromMonths && ageMonths < b.toMonths);
  if (!band) throw new Error(`Нет нормы для возраста ${ageMonths} мес.`);
  return band.kcalPerKg;
}

/**
 * Методика пользователя с округлением на каждом шаге:
 * ккал — целая часть, порции по 100 мл — до десятых, сутки = порции × 100,
 * за кормление — до целого мл.
 */
export function calculate(input: CalcInput, rules: FeedingRules = RULES): CalcResult {
  const norm = kcalPerKg(input.ageMonths, rules);
  const kcalDay = Math.floor((norm * input.weightG) / 1000);
  const portions = Math.round((kcalDay * 10) / input.kcalPer100ml) / 10;
  const mlDay = Math.round(portions * 100);
  const perFeeding = input.feedings.map((n) => ({ feedings: n, ml: Math.round(mlDay / n) }));
  return { kcalPerKg: norm, kcalDay, portions, mlDay, perFeeding };
}

export interface ScoopOption {
  waterMl: number;
  scoops: number;
}

/**
 * Ближайшие варианты разведения по таблице на банке с шагом в полложки
 * и вода к ним. Объём из расчёта считается объёмом воды. Если объём
 * между двумя шагами — оба варианта (меньше и больше), выбирает пользователь.
 */
export function scoopOptions(ml: number, waterMlPerScoop: number, step = 0.5): ScoopOption[] {
  const exact = ml / waterMlPerScoop / step;
  const counts = [...new Set([Math.floor(exact), Math.ceil(exact)])].filter((n) => n >= 1);
  return counts.map((n) => ({ waterMl: n * step * waterMlPerScoop, scoops: n * step }));
}

/** Подсказка числа кормлений по возрасту или null, если возраст вне таблицы. */
export function feedingHint(
  ageMonths: number,
  rules: FeedingRules = RULES,
): { min: number; max: number } | null {
  const band = rules.feedingHints.find((b) => ageMonths >= b.fromMonths && ageMonths < b.toMonths);
  return band ? { min: band.min, max: band.max } : null;
}

/** Все значения диапазона кормлений: 6–7 → [6, 7]. */
export function feedingRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) out.push(n);
  return out;
}

/**
 * Вес из ввода пользователя в граммах. «5,7» и «5.7» — килограммы, «5700» — граммы.
 * Возвращает NaN, если не удалось разобрать.
 */
export function parseWeightG(raw: string): number {
  const value = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return NaN;
  return value < 50 ? Math.round(value * 1000) : Math.round(value);
}
