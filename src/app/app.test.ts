import { describe, expect, it } from 'vitest';
import {
  addCustomFormula,
  addWeight,
  currentFormula,
  removeCustomFormula,
  selectFormula,
  setFormulaKcal,
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
  validateFormulaInput,
} from './state';
import { buildView, CHART, formatScoops, scoopDiff, weightChart } from './view';

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

  it('как развести: варианты в ложках для NAN', () => {
    const v = buildView(example, TODAY);
    expect(v.scoops?.rows).toEqual([
      { feedings: 6, ml: 163, options: [{ waterMl: 150, scoops: 5 }, { waterMl: 165, scoops: 5.5 }] },
      { feedings: 7, ml: 140, options: [{ waterMl: 135, scoops: 4.5 }, { waterMl: 150, scoops: 5 }] },
    ]);
    expect(v.scoops?.waterMlPerScoop).toBe(30);
    expect(v.scoops?.perDay).toBe(33); // 980 ÷ 30 = 32,7
  });

  it('подписи ложек и разницы с расчётом', () => {
    expect(formatScoops(5)).toBe('5 ложек');
    expect(formatScoops(5.5)).toBe('5,5 ложки');
    expect(formatScoops(4)).toBe('4 ложки');
    expect(formatScoops(1)).toBe('1 ложка');
    expect(formatScoops(0.5)).toBe('0,5 ложки');
    expect(scoopDiff(150, 163)).toBe('на 13 мл меньше расчёта');
    expect(scoopDiff(165, 163)).toBe('на 2 мл больше расчёта');
  });

  it('своя смесь: ложки по её пропорции, без пропорции ложки не показываются', () => {
    const withScoop = addCustomFormula(example, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 }, 'f1');
    const v = buildView(withScoop, TODAY);
    expect(v.formulaName).toBe('Нутрилон 1');
    expect(v.result?.kcalDay).toBe(655);
    expect(v.result?.portions).toBe(9.9); // 655 ÷ 66 = 9,92
    expect(v.scoops?.waterMlPerScoop).toBe(30);
    const noScoop = addCustomFormula(example, { name: 'Другая', kcalPer100ml: 67, waterMlPerScoop: null }, 'f2');
    expect(buildView(noScoop, TODAY).scoops).toBeNull();
  });

  it('при ошибке ложки не показываются', () => {
    expect(buildView({ ...example, kcalPer100ml: 500 }, TODAY).scoops).toBeNull();
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

describe('смеси', () => {
  const base = exampleState(TODAY);

  it('по умолчанию NAN Optipro 1, 67 ккал, 30 мл воды на ложку', () => {
    expect(currentFormula(base)).toEqual({ id: 'nan-optipro-1', name: 'NAN Optipro 1', kcalPer100ml: 67, waterMlPerScoop: 30, custom: false });
  });

  it('добавленная смесь сохраняется в списке и сразу выбирается', () => {
    const s = addCustomFormula(base, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 }, 'f1');
    expect(s.customFormulas).toEqual([{ id: 'f1', name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 }]);
    expect(s.formula).toBe('f1');
    expect(s.kcalPer100ml).toBe(66);
    expect(s.isExample).toBe(false);
  });

  it('переключение между смесями меняет калорийность', () => {
    let s = addCustomFormula(base, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 }, 'f1');
    s = selectFormula(s, 'nan-optipro-1');
    expect(s.kcalPer100ml).toBe(67);
    s = selectFormula(s, 'f1');
    expect(s.kcalPer100ml).toBe(66);
    expect(selectFormula(s, 'нет такой')).toBe(s);
  });

  it('калорийность своей смеси можно поправить, у NAN нельзя', () => {
    const s = addCustomFormula(base, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: null }, 'f1');
    const fixed = setFormulaKcal(s, 68);
    expect(fixed.kcalPer100ml).toBe(68);
    expect(fixed.customFormulas[0]?.kcalPer100ml).toBe(68);
    expect(setFormulaKcal(base, 70)).toBe(base);
  });

  it('удаление выбранной смеси возвращает NAN Optipro 1', () => {
    const s = removeCustomFormula(addCustomFormula(base, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: null }, 'f1'), 'f1');
    expect(s.customFormulas).toEqual([]);
    expect(s.formula).toBe('nan-optipro-1');
    expect(s.kcalPer100ml).toBe(67);
  });

  it('смеси сохраняются и загружаются', () => {
    const storage = memoryStorage();
    const s = addCustomFormula(base, { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 }, 'f1');
    saveState(storage, s);
    expect(loadState(storage, TODAY)).toEqual(s);
  });

  it('старая «своя смесь» без списка переносится в список', () => {
    const old = { ...base, formula: 'custom', kcalPer100ml: 70, isExample: false } as Record<string, unknown>;
    delete old.customFormulas;
    const s = parseState(JSON.stringify(old));
    expect(s?.formula).toBe('custom');
    expect(s?.kcalPer100ml).toBe(70);
    expect(s?.customFormulas).toEqual([{ id: 'custom', name: 'Своя смесь', kcalPer100ml: 70, waterMlPerScoop: null }]);
  });

  it('выбрана смесь, которой нет в списке: данные не принимаются', () => {
    expect(parseState(JSON.stringify({ ...base, formula: 'f9' }))).toBeNull();
  });

  it('проверка ввода новой смеси', () => {
    expect(validateFormulaInput({ name: ' Нутрилон 1 ', kcal: '66', water: '30' })).toEqual({
      ok: true,
      value: { name: 'Нутрилон 1', kcalPer100ml: 66, waterMlPerScoop: 30 },
    });
    expect(validateFormulaInput({ name: 'Смесь', kcal: '67,5', water: '' })).toEqual({
      ok: true,
      value: { name: 'Смесь', kcalPer100ml: 67.5, waterMlPerScoop: null },
    });
    expect(validateFormulaInput({ name: '', kcal: '66', water: '' })).toEqual({ ok: false, error: 'Укажите название смеси.' });
    expect(validateFormulaInput({ name: 'Смесь', kcal: 'абв', water: '' })).toEqual({ ok: false, error: 'Укажите ккал на 100 мл готовой смеси.' });
    expect(validateFormulaInput({ name: 'Смесь', kcal: '66', water: '0' })).toEqual({ ok: false, error: 'Мл воды на 1 ложку: укажите число с банки или оставьте пустым.' });
    expect(validateFormulaInput({ name: 'NAN Optipro 1', kcal: '66', water: '' })).toEqual({ ok: false, error: 'Смесь с таким названием уже есть.' });
  });
});
