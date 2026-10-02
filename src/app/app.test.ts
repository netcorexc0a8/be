import { describe, expect, it } from 'vitest';
import {
  addWeight,
  backupFileName,
  exportBackup,
  importBackup,
  exampleState,
  loadState,
  localToday,
  parseState,
  removeWeight,
  saveState,
  STORAGE_KEY,
  type AppState,
} from './state';
import { buildView, CHART, weightChart } from './view';

const TODAY = '2026-10-02';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('удаление замера', () => {
  it('удаляет замер по дате, последний оставшийся не трогает', () => {
    let s = addWeight(exampleState('2026-09-28'), { date: '2026-10-02', grams: 5800 });
    s = removeWeight(s, '2026-09-28');
    expect(s.weights).toEqual([{ date: '2026-10-02', grams: 5800 }]);
    expect(removeWeight(s, '2026-10-02')).toBe(s);
    expect(removeWeight(s, '2026-01-01')).toBe(s);
  });
});

describe('состояние', () => {
  it('при первом запуске показывает пример из методики', () => {
    const s = loadState(memoryStorage(), TODAY);
    expect(s.isExample).toBe(true);
    expect(s.dob).toBe('2026-07-02');
    expect(s.weights).toEqual([{ date: TODAY, grams: 5700 }]);
  });

  it('пример на конце месяца не перескакивает через месяц', () => {
    expect(exampleState('2026-05-31').dob).toBe('2026-02-28');
  });

  it('сохраняет и загружает состояние', () => {
    const storage = memoryStorage();
    const s: AppState = { ...exampleState(TODAY), name: 'Аня', isExample: false };
    saveState(storage, s);
    expect(loadState(storage, TODAY)).toEqual(s);
  });

  it('повреждённые данные заменяются примером', () => {
    expect(parseState('{не json')).toBeNull();
    expect(parseState(JSON.stringify({ name: 'Аня' }))).toBeNull();
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '[]');
    expect(loadState(storage, TODAY).isExample).toBe(true);
  });

  it('недоступное хранилище не ломает приложение', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadState(broken, TODAY).isExample).toBe(true);
    expect(() => saveState(broken, exampleState(TODAY))).not.toThrow();
  });

  it('новый замер веса добавляется по дате, повтор за день заменяется', () => {
    let s = exampleState('2026-09-28');
    s = addWeight(s, { date: '2026-10-02', grams: 5800 });
    s = addWeight(s, { date: '2026-09-20', grams: 5500 });
    s = addWeight(s, { date: '2026-10-02', grams: 5850 });
    expect(s.weights.map((w) => [w.date, w.grams])).toEqual([
      ['2026-09-20', 5500],
      ['2026-09-28', 5700],
      ['2026-10-02', 5850],
    ]);
    expect(s.isExample).toBe(false);
  });

  it('местная дата в формате ГГГГ-ММ-ДД', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('экран', () => {
  const example = exampleState(TODAY);

  it('пример из методики: 980 мл, 163 и 140 мл', () => {
    const v = buildView(example, TODAY);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.result?.mlDay).toBe(980);
    expect(v.result?.perFeeding.map((p) => p.ml)).toEqual([163, 140]);
    expect(v.ageText).toBe('3 месяца 0 дней · норма 115 ккал/кг');
  });

  it('показывает шаги расчёта как в методике', () => {
    const rows = Object.fromEntries(buildView(example, TODAY).breakdown);
    expect(rows['Ккал в сутки']).toBe('115 × 5,7 = 655');
    expect(rows['Порций по 100 мл']).toBe('655 ÷ 67 = 9,8');
    expect(rows['Мл в сутки']).toBe('9,8 × 100 = 980');
    expect(rows['На 6 кормлений']).toBe('980 ÷ 6 = 163 мл');
    expect(rows['На 7 кормлений']).toBe('980 ÷ 7 = 140 мл');
  });

  it('подсказка числа кормлений по возрасту', () => {
    expect(buildView(example, TODAY).hint).toEqual({ text: '6–7', min: 6, max: 7, matches: true });
    const newborn = { ...example, dob: '2026-09-20', feedingsMin: 6, feedingsMax: 6 };
    expect(buildView(newborn, TODAY).hint).toEqual({ text: '7–8', min: 7, max: 8, matches: false });
  });

  it('при ошибке ввода расчёт не показывается', () => {
    const v = buildView({ ...example, kcalPer100ml: 500 }, TODAY);
    expect(v.result).toBeNull();
    expect(v.breakdown).toEqual([]);
    expect(v.errors.map((e) => e.code)).toEqual(['kcal-looks-like-powder']);
  });

  it('предупреждает о большой порции', () => {
    const big = { ...example, dob: '2026-02-02', weights: [{ date: TODAY, grams: 9000 }], feedingsMin: 4, feedingsMax: 4 };
    const v = buildView(big, TODAY);
    expect(v.warnings.map((w) => w.code)).toContain('portion-exceeds-bottle');
  });

  it('история: новые сверху, с прибавкой к предыдущему замеру', () => {
    const s = {
      ...example,
      weights: [
        { date: '2026-08-01', grams: 4600 },
        { date: '2026-09-01', grams: 5200 },
        { date: '2026-09-21', grams: 5150 },
        { date: TODAY, grams: 5700 },
      ],
    };
    const h = buildView(s, TODAY).history;
    expect(h.map((r) => [r.date, r.change])).toEqual([
      [TODAY, '+550 г за 11 дн.'],
      ['2026-09-21', '−50 г за 20 дн.'],
      ['2026-09-01', '+600 г за 31 дн.'],
      ['2026-08-01', null],
    ]);
    expect(h.every((r) => r.canDelete)).toBe(true);
  });

  it('единственный замер нельзя удалить', () => {
    expect(buildView(example, TODAY).history[0]?.canDelete).toBe(false);
  });

  it('график строится по датам и весу', () => {
    expect(buildView(example, TODAY).chart).toBeNull();
    const chart = weightChart([
      { date: '2026-09-01', grams: 5000 },
      { date: '2026-09-11', grams: 5300 },
      { date: '2026-10-01', grams: 5600 },
    ]);
    expect(chart?.points).toEqual([
      { x: CHART.left, y: CHART.height - CHART.bottom },
      { x: +(CHART.left + (CHART.width - CHART.left - CHART.right) / 3).toFixed(1), y: +(CHART.top + (CHART.height - CHART.top - CHART.bottom) / 2).toFixed(1) },
      { x: CHART.width - CHART.right, y: CHART.top },
    ]);
    expect(chart?.firstLabel).toBe('1 сентября');
    expect(chart?.lastValue.replace(/\s/g, ' ')).toBe('5 600 г');
  });
});

describe('резервная копия', () => {
  it('сохраняет и восстанавливает данные', () => {
    const s: AppState = { ...exampleState(TODAY), name: 'Аня', isExample: false };
    const file = exportBackup(s, new Date('2026-10-02T10:00:00Z'));
    expect(JSON.parse(file)).toMatchObject({ app: 'formula-calculator', version: 1, exportedAt: '2026-10-02T10:00:00.000Z' });
    expect(importBackup(file)).toEqual(s);
  });

  it('чужой или повреждённый файл не принимается', () => {
    expect(importBackup('не json')).toBeNull();
    expect(importBackup(JSON.stringify({ app: 'other', version: 1, state: exampleState(TODAY) }))).toBeNull();
    expect(importBackup(JSON.stringify({ app: 'formula-calculator', version: 1, state: { name: 'Аня' } }))).toBeNull();
  });

  it('имя файла с датой', () => {
    expect(backupFileName('2026-10-02')).toBe('smes-2026-10-02.json');
  });
});
