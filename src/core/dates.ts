// Даты передаются строками YYYY-MM-DD, чтобы не зависеть от часового пояса.

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parseYmd(value: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Ожидается дата в формате ГГГГ-ММ-ДД: ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Полных месяцев от даты рождения до today. Отрицательное число, если дата рождения в будущем. */
export function ageInMonths(dob: string, today: string): number {
  const b = parseYmd(dob);
  const t = parseYmd(today);
  let months = (t.y - b.y) * 12 + (t.m - b.m);
  if (t.d < b.d) months -= 1;
  return months;
}

/** Число дней от from до to (to − from). */
export function daysBetween(from: string, to: string): number {
  const f = parseYmd(from);
  const t = parseYmd(to);
  return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(f.y, f.m - 1, f.d)) / 86_400_000);
}
