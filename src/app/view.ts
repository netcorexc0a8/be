// Что показать на экране: собирается из состояния без обращения к DOM.

import {
  ageInMonths,
  bottleWarning,
  calculate,
  daysBetween,
  feedingHint,
  feedingRange,
  kcalPerKg,
  scoopOptions,
  validate,
  type CalcResult,
  type ScoopOption,
  type Issue,
} from '../core';
import { FORMULAS, latestWeight, type AppState, type WeightEntry } from './state';

export interface ScreenView {
  ageMonths: number;
  ageText: string;
  weightHint: string;
  result: CalcResult | null;
  errors: Issue[];
  warnings: Issue[];
  hint: { text: string; min: number; max: number; matches: boolean } | null;
  breakdown: [string, string][];
  history: HistoryRow[];
  chart: WeightChart | null;
  scoops: ScoopsView | null;
}

/** Как развести: варианты в мерных ложках по таблице на банке. */
export interface ScoopsView {
  waterMlPerScoop: number;
  rows: { feedings: number; ml: number; options: ScoopOption[] }[];
  perDay: number;
}

export interface HistoryRow extends WeightEntry {
  /** Прибавка к предыдущему замеру, текстом: «+150 г за 12 дн.»; null для первого замера. */
  change: string | null;
  canDelete: boolean;
}

export interface WeightChart {
  points: { x: number; y: number }[];
  firstLabel: string;
  lastLabel: string;
  lastValue: string;
}

/** Размеры области графика в координатах SVG viewBox. */
export const CHART = { width: 300, height: 110, left: 8, right: 64, top: 12, bottom: 22 } as const;

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const formatInt = (n: number): string => nf0.format(n);

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** 5 → «5 ложек», 5,5 → «5,5 ложки», 0,5 → «0,5 ложки». */
export function formatScoops(scoops: number): string {
  if (Number.isInteger(scoops)) return `${scoops} ${plural(scoops, 'ложка', 'ложки', 'ложек')}`;
  return `${nf1.format(scoops)} ложки`;
}

/** Насколько вариант разведения отличается от расчёта: «на 2 мл больше расчёта». */
export function scoopDiff(waterMl: number, ml: number): string {
  const d = waterMl - ml;
  return `на ${nf0.format(Math.abs(d))} мл ${d < 0 ? 'меньше' : 'больше'} расчёта`;
}

export function formatDayMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function ageText(dob: string, today: string, months: number): string {
  if (months < 0) return 'дата рождения в будущем';
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
  anchor.setUTCDate(Math.min(d, lastDay));
  const days = daysBetween(anchor.toISOString().slice(0, 10), today);
  return `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')} ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

export function buildView(state: AppState, today: string): ScreenView {
  const weight = latestWeight(state);
  const months = ageInMonths(state.dob, today);
  const { errors, warnings } = validate({
    dob: state.dob,
    today,
    weightG: weight.grams,
    weightDate: weight.date,
    kcalPer100ml: state.kcalPer100ml,
    feedingsMin: state.feedingsMin,
    feedingsMax: state.feedingsMax,
  });

  let result: CalcResult | null = null;
  if (errors.length === 0) {
    result = calculate({
      weightG: weight.grams,
      ageMonths: months,
      kcalPer100ml: state.kcalPer100ml,
      feedings: feedingRange(state.feedingsMin, state.feedingsMax),
    });
    const bottle = bottleWarning(result.perFeeding.map((p) => p.ml));
    if (bottle) warnings.push(bottle);
  }

  const h = months >= 0 ? feedingHint(months) : null;
  const hint = h
    ? {
        text: h.min === h.max ? `${h.min}` : `${h.min}–${h.max}`,
        min: h.min,
        max: h.max,
        matches: state.feedingsMin === h.min && state.feedingsMax === h.max,
      }
    : null;

  const r = result;
  const breakdown: [string, string][] = r
    ? [
        ['Норма по возрасту', `${r.kcalPerKg} ккал/кг`],
        ['Ккал в сутки', `${r.kcalPerKg} × ${nf2.format(weight.grams / 1000)} = ${nf0.format(r.kcalDay)}`],
        ['Порций по 100 мл', `${nf0.format(r.kcalDay)} ÷ ${nf2.format(state.kcalPer100ml)} = ${nf1.format(r.portions)}`],
        ['Мл в сутки', `${nf1.format(r.portions)} × 100 = ${nf0.format(r.mlDay)}`],
        ...r.perFeeding.map(
          (p): [string, string] => [`На ${p.feedings} ${plural(p.feedings, 'кормление', 'кормления', 'кормлений')}`, `${nf0.format(r.mlDay)} ÷ ${p.feedings} = ${nf0.format(p.ml)} мл`],
        ),
      ]
    : [];

  const formula = state.formula === 'custom' ? null : FORMULAS[state.formula];
  const scoops: ScoopsView | null =
    r && formula
      ? {
          waterMlPerScoop: formula.waterMlPerScoop,
          rows: r.perFeeding.map((p) => ({ ...p, options: scoopOptions(p.ml, formula.waterMlPerScoop) })),
          perDay: Math.round(r.mlDay / formula.waterMlPerScoop),
        }
      : null;

  return {
    ageMonths: months,
    ageText:
      months >= 0
        ? `${ageText(state.dob, today, months)} · норма ${kcalPerKg(months)} ккал/кг`
        : ageText(state.dob, today, months),
    weightHint: `взвешен ${formatDayMonth(weight.date)}`,
    result,
    errors,
    warnings,
    hint,
    breakdown,
    history: weightHistory(state.weights),
    chart: weightChart(state.weights),
    scoops,
  };
}

const signed = (n: number): string => (n > 0 ? `+${nf0.format(n)}` : n < 0 ? `−${nf0.format(-n)}` : '0');

/** Замеры, новые сверху, с прибавкой к предыдущему. */
export function weightHistory(weights: WeightEntry[]): HistoryRow[] {
  const rows = weights.map((w, i): HistoryRow => {
    const prev = weights[i - 1];
    const change = prev
      ? `${signed(w.grams - prev.grams)} г за ${daysBetween(prev.date, w.date)} дн.`
      : null;
    return { ...w, change, canDelete: weights.length > 1 };
  });
  return rows.reverse();
}

/** Точки графика: по оси X дни, по оси Y граммы. Нужно хотя бы два замера. */
export function weightChart(weights: WeightEntry[]): WeightChart | null {
  if (weights.length < 2) return null;
  const first = weights[0]!;
  const last = weights[weights.length - 1]!;
  const span = Math.max(daysBetween(first.date, last.date), 1);
  const grams = weights.map((w) => w.grams);
  const lo = Math.min(...grams);
  const hi = Math.max(...grams);
  const range = Math.max(hi - lo, 100);
  const w = CHART.width - CHART.left - CHART.right;
  const h = CHART.height - CHART.top - CHART.bottom;
  const points = weights.map((e) => ({
    x: +(CHART.left + (daysBetween(first.date, e.date) / span) * w).toFixed(1),
    y: +(CHART.top + h - ((e.grams - lo) / range) * h).toFixed(1),
  }));
  return {
    points,
    firstLabel: formatDayMonth(first.date),
    lastLabel: formatDayMonth(last.date),
    lastValue: `${nf0.format(last.grams)} г`,
  };
}
