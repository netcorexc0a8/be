import { describe, expect, it } from 'vitest';
import {
  ageInMonths,
  bottleWarning,
  calculate,
  daysBetween,
  feedingHint,
  feedingRange,
  kcalPerKg,
  parseWeightG,
  scoopOptions,
  validate,
  validateWeightEntry,
  type ValidationInput,
} from './index';

describe('эталонный пример из методики', () => {
  const result = calculate({ weightG: 5700, ageMonths: 3, kcalPer100ml: 67, feedings: [6, 7] });

  it('считает по шагам: 655 ккал → 9,8 → 980 мл', () => {
    expect(result.kcalPerKg).toBe(115);
    expect(result.kcalDay).toBe(655);
    expect(result.portions).toBe(9.8);
    expect(result.mlDay).toBe(980);
  });

  it('делит на кормления: 163 и 140 мл', () => {
    expect(result.perFeeding).toEqual([
      { feedings: 6, ml: 163 },
      { feedings: 7, ml: 140 },
    ]);
  });
});

describe('округление на шагах', () => {
  it('отбрасывает дробную часть ккал, а не округляет', () => {
    // 115 × 5,7 = 655,5 → 655, а не 656
    expect(calculate({ weightG: 5700, ageMonths: 3, kcalPer100ml: 67, feedings: [6] }).kcalDay).toBe(655);
  });

  it('округляет порции до десятых в обе стороны', () => {
    // 110 × 8 = 880; 880 / 67 = 13,134 → 13,1 → 1310 мл
    const down = calculate({ weightG: 8000, ageMonths: 7, kcalPer100ml: 67, feedings: [5] });
    expect(down.portions).toBe(13.1);
    expect(down.mlDay).toBe(1310);
    // 115 × 4 = 460; 460 / 67 = 6,866 → 6,9 → 690 мл
    const up = calculate({ weightG: 4000, ageMonths: 1, kcalPer100ml: 67, feedings: [7] });
    expect(up.portions).toBe(6.9);
    expect(up.mlDay).toBe(690);
    expect(up.perFeeding[0]?.ml).toBe(99); // 690 / 7 = 98,57
  });

  it('не даёт ошибок плавающей точки в мл/сутки', () => {
    for (let g = 2000; g <= 12000; g += 10) {
      const { mlDay } = calculate({ weightG: g, ageMonths: 2, kcalPer100ml: 67, feedings: [6] });
      expect(mlDay % 10).toBe(0);
    }
  });
});

describe('норма по возрасту', () => {
  it('115 до 6 месяцев, 110 с 6 месяцев', () => {
    expect(kcalPerKg(0)).toBe(115);
    expect(kcalPerKg(5)).toBe(115);
    expect(kcalPerKg(6)).toBe(110);
    expect(kcalPerKg(11)).toBe(110);
  });

  it('граница 6 месяцев по дате рождения: день до и в день исполнения', () => {
    expect(ageInMonths('2026-04-02', '2026-10-01')).toBe(5);
    expect(ageInMonths('2026-04-02', '2026-10-02')).toBe(6);
    expect(kcalPerKg(ageInMonths('2026-04-02', '2026-10-01'))).toBe(115);
    expect(kcalPerKg(ageInMonths('2026-04-02', '2026-10-02'))).toBe(110);
  });
});

describe('даты', () => {
  it('считает полные месяцы на концах месяцев', () => {
    expect(ageInMonths('2026-01-31', '2026-02-28')).toBe(0);
    expect(ageInMonths('2026-01-31', '2026-03-31')).toBe(2);
    expect(ageInMonths('2026-06-18', '2026-10-02')).toBe(3);
  });

  it('отрицательный возраст для даты рождения в будущем', () => {
    expect(ageInMonths('2026-11-01', '2026-10-02')).toBeLessThan(0);
  });

  it('считает дни между датами', () => {
    expect(daysBetween('2026-09-28', '2026-10-02')).toBe(4);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('отклоняет неверный формат даты', () => {
    expect(() => ageInMonths('02.10.2026', '2026-10-02')).toThrow();
  });
});

describe('подсказка числа кормлений', () => {
  it.each([
    [0, 7, 8],
    [2, 6, 7],
    [3, 6, 7],
    [5, 6, 7],
    [6, 5, 6],
    [8, 5, 6],
    [9, 4, 5],
    [14, 4, 5],
  ])('%i мес. → %i–%i', (age, min, max) => {
    expect(feedingHint(age)).toEqual({ min, max });
  });

  it('нет подсказки для отрицательного возраста', () => {
    expect(feedingHint(-1)).toBeNull();
  });

  it('разворачивает диапазон', () => {
    expect(feedingRange(6, 7)).toEqual([6, 7]);
    expect(feedingRange(6, 6)).toEqual([6]);
  });
});

describe('ввод веса', () => {
  it.each([
    ['5700', 5700],
    ['5,7', 5700],
    ['5.7', 5700],
    [' 5,75 ', 5750],
    ['6', 6000],
  ])('%s → %i г', (raw, grams) => {
    expect(parseWeightG(raw)).toBe(grams);
  });

  it.each(['', 'abc', '-5', '0'])('«%s» не разбирается', (raw) => {
    expect(parseWeightG(raw)).toBeNaN();
  });
});

describe('валидация', () => {
  const ok: ValidationInput = {
    dob: '2026-06-18',
    today: '2026-10-02',
    weightG: 5700,
    weightDate: '2026-09-28',
    kcalPer100ml: 67,
    feedingsMin: 6,
    feedingsMax: 7,
  };
  const codes = (input: Partial<ValidationInput>) => {
    const r = validate({ ...ok, ...input });
    return { errors: r.errors.map((i) => i.code), warnings: r.warnings.map((i) => i.code) };
  };

  it('эталонные данные проходят без ошибок и предупреждений', () => {
    expect(codes({})).toEqual({ errors: [], warnings: [] });
  });

  it('дата рождения в будущем', () => {
    expect(codes({ dob: '2026-10-03' }).errors).toContain('dob-in-future');
  });

  it.each([1499, 20001, NaN])('вес %s г вне диапазона', (weightG) => {
    expect(codes({ weightG }).errors).toEqual(['weight-out-of-range']);
  });

  it.each([1500, 20000])('вес %s г на границе допустим', (weightG) => {
    expect(codes({ weightG }).errors).toEqual([]);
  });

  it('калорийность «на 100 г порошка»', () => {
    const r = validate({ ...ok, kcalPer100ml: 500 });
    expect(r.errors.map((i) => i.code)).toEqual(['kcal-looks-like-powder']);
    expect(r.errors[0]?.message).toContain('100 мл готовой смеси');
  });

  it.each([54, 86, NaN])('калорийность %s вне диапазона', (kcalPer100ml) => {
    expect(codes({ kcalPer100ml }).errors).toEqual(['kcal-out-of-range']);
  });

  it.each([
    [3, 6],
    [6, 13],
    [8, 7],
    [6.5, 7],
  ])('кормлений %s–%s вне диапазона', (feedingsMin, feedingsMax) => {
    expect(codes({ feedingsMin, feedingsMax }).errors).toEqual(['feedings-out-of-range']);
  });

  it('взвешивание старше 21 дня', () => {
    expect(codes({ weightDate: '2026-09-11' }).warnings).toEqual([]);
    const r = validate({ ...ok, weightDate: '2026-09-10' });
    expect(r.warnings.map((i) => i.code)).toEqual(['weight-stale']);
    expect(r.warnings[0]?.message).toContain('22 дня');
  });

  it('прикорм после 6 месяцев', () => {
    expect(codes({ dob: '2026-04-02' }).warnings).toContain('complementary-food');
    expect(codes({ dob: '2026-04-03' }).warnings).not.toContain('complementary-food');
  });

  it('порция больше бутылочки', () => {
    expect(bottleWarning([240, 200])).toBeNull();
    expect(bottleWarning([241])?.code).toBe('portion-exceeds-bottle');
  });
});

describe('проверка нового замера веса', () => {
  const dob = '2026-06-18';
  const today = '2026-10-02';

  it('нормальный замер проходит', () => {
    expect(validateWeightEntry({ grams: 5800, date: today, dob, today })).toBeNull();
    expect(validateWeightEntry({ grams: 3500, date: dob, dob, today })).toBeNull();
  });

  it.each([NaN, 1499, 20001])('вес %s г отклоняется', (grams) => {
    const issue = validateWeightEntry({ grams, date: today, dob, today });
    expect(issue?.code).toBe('weight-out-of-range');
    expect(issue?.message).toContain('от 1,5 до 20 кг');
  });

  it('дата в будущем отклоняется', () => {
    expect(validateWeightEntry({ grams: 5800, date: '2026-10-03', dob, today })?.code).toBe('weight-date-in-future');
  });

  it('дата раньше рождения отклоняется', () => {
    expect(validateWeightEntry({ grams: 3500, date: '2026-06-17', dob, today })?.code).toBe('weight-date-before-birth');
  });
});

describe('мерные ложки', () => {
  it('163 мл: два ближайших варианта по таблице банки (30 мл воды на ложку)', () => {
    expect(scoopOptions(163, 30)).toEqual([
      { waterMl: 150, scoops: 5 },
      { waterMl: 180, scoops: 6 },
    ]);
  });

  it('140 мл: 120 мл и 4 ложки или 150 мл и 5 ложек', () => {
    expect(scoopOptions(140, 30)).toEqual([
      { waterMl: 120, scoops: 4 },
      { waterMl: 150, scoops: 5 },
    ]);
  });

  it('ровно по таблице: один вариант', () => {
    expect(scoopOptions(150, 30)).toEqual([{ waterMl: 150, scoops: 5 }]);
  });

  it('меньше одной ложки: только вариант вверх', () => {
    expect(scoopOptions(20, 30)).toEqual([{ waterMl: 30, scoops: 1 }]);
  });
});
