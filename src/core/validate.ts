import { ageInMonths, daysBetween } from './dates';
import { RULES, type FeedingRules } from './rules';

export type IssueCode =
  | 'dob-in-future'
  | 'weight-out-of-range'
  | 'kcal-looks-like-powder'
  | 'kcal-out-of-range'
  | 'feedings-out-of-range'
  | 'weight-stale'
  | 'complementary-food'
  | 'portion-exceeds-bottle'
  | 'weight-date-in-future'
  | 'weight-date-before-birth';

export interface Issue {
  code: IssueCode;
  message: string;
}

export interface ValidationInput {
  dob: string;
  today: string;
  weightG: number;
  weightDate: string;
  kcalPer100ml: number;
  feedingsMin: number;
  feedingsMax: number;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/** Ошибки блокируют расчёт, предупреждения показываются рядом с ним. */
export function validate(input: ValidationInput, rules: FeedingRules = RULES): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const age = ageInMonths(input.dob, input.today);
  const kg = input.weightG / 1000;
  const kcal = input.kcalPer100ml;

  if (age < 0) {
    errors.push({ code: 'dob-in-future', message: 'Дата рождения позже сегодняшнего дня.' });
  }
  if (!(kg >= rules.weightKg.min && kg <= rules.weightKg.max)) {
    errors.push({
      code: 'weight-out-of-range',
      message: 'Проверьте вес: укажите его в граммах, например 5700.',
    });
  }
  if (kcal > rules.kcalPer100ml.powderHint) {
    errors.push({
      code: 'kcal-looks-like-powder',
      message: `${kcal} ккал похоже на значение «на 100 г порошка». Нужно значение на 100 мл готовой смеси, обычно 60–80.`,
    });
  } else if (!(kcal >= rules.kcalPer100ml.min && kcal <= rules.kcalPer100ml.max)) {
    errors.push({
      code: 'kcal-out-of-range',
      message: 'Ккал на 100 мл готовой смеси обычно от 60 до 80. Проверьте цифру на банке.',
    });
  }
  const { min, max } = rules.feedings;
  if (
    !Number.isInteger(input.feedingsMin) ||
    !Number.isInteger(input.feedingsMax) ||
    input.feedingsMin < min ||
    input.feedingsMax > max ||
    input.feedingsMin > input.feedingsMax
  ) {
    errors.push({
      code: 'feedings-out-of-range',
      message: `Число кормлений должно быть от ${min} до ${max}.`,
    });
  }

  const ago = daysBetween(input.weightDate, input.today);
  if (ago > rules.staleWeightDays) {
    warnings.push({
      code: 'weight-stale',
      message: `Последнему взвешиванию ${ago} ${plural(ago, 'день', 'дня', 'дней')}. Вес мог измениться, взвесьте малыша.`,
    });
  }
  if (age >= 6) {
    warnings.push({
      code: 'complementary-food',
      message: 'После 6 месяцев с прикормом смеси обычно нужно меньше. Расчёт прикорм не учитывает.',
    });
  }

  return { errors, warnings };
}

/** Предупреждение, если хотя бы одна порция больше бутылочки. */
export function bottleWarning(
  perFeedingMl: number[],
  rules: FeedingRules = RULES,
): Issue | null {
  if (!perFeedingMl.some((ml) => ml > rules.bottleMl)) return null;
  return {
    code: 'portion-exceeds-bottle',
    message: `Порция больше бутылочки на ${rules.bottleMl} мл. Возможно, стоит добавить кормление.`,
  };
}

/** Проверка нового замера веса перед сохранением. */
export function validateWeightEntry(
  entry: { grams: number; date: string; dob: string; today: string },
  rules: FeedingRules = RULES,
): Issue | null {
  const kg = entry.grams / 1000;
  if (!(kg >= rules.weightKg.min && kg <= rules.weightKg.max)) {
    return {
      code: 'weight-out-of-range',
      message: `Проверьте вес: от ${rules.weightKg.min.toLocaleString('ru-RU')} до ${rules.weightKg.max.toLocaleString('ru-RU')} кг, например 5700 или 5,7.`,
    };
  }
  if (daysBetween(entry.today, entry.date) > 0) {
    return { code: 'weight-date-in-future', message: 'Дата замера позже сегодняшнего дня.' };
  }
  if (daysBetween(entry.dob, entry.date) < 0) {
    return { code: 'weight-date-before-birth', message: 'Дата замера раньше даты рождения.' };
  }
  return null;
}
