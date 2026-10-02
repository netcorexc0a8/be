// Что показать на экране: собирается из состояния без обращения к DOM.

import {
  ageInMonths,
  bottleWarning,
  calculate,
  daysBetween,
  feedingHint,
  feedingRange,
  kcalPerKg,
  validate,
  type CalcResult,
  type Issue,
} from '../core';
import { latestWeight, type AppState, type WeightEntry } from './state';

export interface ScreenView {
  ageMonths: number;
  ageText: string;
  weightHint: string;
  result: CalcResult | null;
  errors: Issue[];
  warnings: Issue[];
  hint: { text: string; min: number; max: number; matches: boolean } | null;
  breakdown: [string, string][];
  recentWeights: WeightEntry[];
}

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
    recentWeights: state.weights.slice(-3).reverse(),
  };
}
