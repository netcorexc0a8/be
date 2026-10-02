// Правила расчёта. Менять только с явного согласия пользователя (см. CLAUDE.md).

export interface KcalBand {
  fromMonths: number;
  toMonths: number; // не включительно
  kcalPerKg: number;
}

export interface FeedingHintBand {
  fromMonths: number;
  toMonths: number; // не включительно
  min: number;
  max: number;
}

export interface FeedingRules {
  version: string;
  kcalBands: KcalBand[];
  feedingHints: FeedingHintBand[];
  feedings: { min: number; max: number };
  weightKg: { min: number; max: number };
  kcalPer100ml: { min: number; max: number; powderHint: number };
  staleWeightDays: number;
  bottleMl: number;
}

export const RULES: FeedingRules = {
  version: '2026-10-02',
  kcalBands: [
    { fromMonths: 0, toMonths: 6, kcalPerKg: 115 },
    { fromMonths: 6, toMonths: Infinity, kcalPerKg: 110 },
  ],
  // ориентир, проверить у педиатра
  feedingHints: [
    { fromMonths: 0, toMonths: 1, min: 7, max: 8 },
    { fromMonths: 1, toMonths: 3, min: 6, max: 7 },
    { fromMonths: 3, toMonths: 6, min: 6, max: 7 },
    { fromMonths: 6, toMonths: 9, min: 5, max: 6 },
    { fromMonths: 9, toMonths: Infinity, min: 4, max: 5 },
  ],
  feedings: { min: 4, max: 12 },
  weightKg: { min: 1.5, max: 20 },
  kcalPer100ml: { min: 55, max: 85, powderHint: 200 },
  staleWeightDays: 21,
  bottleMl: 240,
};
