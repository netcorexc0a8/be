import { describe, expect, it } from 'vitest';
import {
  addFeed,
  feedDay,
  feedHistory,
  formatSince,
  parseFeedLog,
  removeFeed,
  resolveFeedAt,
  validateFeedMl,
  type FeedEntry,
} from './feeds';
import { exampleState, exportBackup, importBackup, parseState } from './state';

const NOW = new Date(2026, 10, 14, 18, 30); // 14 ноября 2026, 18:30 по местному времени

describe('отметка кормления: время', () => {
  it('время не позже текущего записывается на сегодня', () => {
    expect(resolveFeedAt('18:30', NOW)).toBe('2026-11-14T18:30');
    expect(resolveFeedAt('07:05', NOW)).toBe('2026-11-14T07:05');
  });

  it('время позже текущего записывается на вчера (ночное кормление, отмеченное после полуночи)', () => {
    const justAfterMidnight = new Date(2026, 10, 15, 0, 10);
    expect(resolveFeedAt('23:50', justAfterMidnight)).toBe('2026-11-14T23:50');
    expect(resolveFeedAt('18:31', NOW)).toBe('2026-11-13T18:31');
  });

  it('вчера правильно считается через границу месяца и года', () => {
    expect(resolveFeedAt('23:00', new Date(2026, 0, 1, 0, 30))).toBe('2025-12-31T23:00');
  });

  it('неверное время не принимается', () => {
    expect(resolveFeedAt('', NOW)).toBeNull();
    expect(resolveFeedAt('25:00', NOW)).toBeNull();
    expect(resolveFeedAt('12:60', NOW)).toBeNull();
  });
});

describe('отметка кормления: мл', () => {
  it('пустое поле — мл не записываются', () => {
    expect(validateFeedMl('')).toEqual({ ok: true, ml: null });
    expect(validateFeedMl('  ')).toEqual({ ok: true, ml: null });
  });

  it('целое положительное число', () => {
    expect(validateFeedMl('160')).toEqual({ ok: true, ml: 160 });
    expect(validateFeedMl(' 90 ')).toEqual({ ok: true, ml: 90 });
  });

  it('ошибка для нуля, дробей и не чисел', () => {
    for (const raw of ['0', '-5', '12,5', 'abc']) {
      expect(validateFeedMl(raw).ok).toBe(false);
    }
  });
});

describe('журнал кормлений', () => {
  const base = exampleState('2026-11-14');

  it('добавляет по времени, повтор в ту же минуту заменяет запись', () => {
    let s = addFeed(base, { at: '2026-11-14T12:00', ml: 150 });
    s = addFeed(s, { at: '2026-11-14T09:00', ml: 160 });
    s = addFeed(s, { at: '2026-11-14T12:00', ml: 140 });
    expect(s.feedLog).toEqual([
      { at: '2026-11-14T09:00', ml: 160 },
      { at: '2026-11-14T12:00', ml: 140 },
    ]);
  });

  it('удаляет запись по времени', () => {
    let s = addFeed(base, { at: '2026-11-14T12:00', ml: 150 });
    s = removeFeed(s, '2026-11-14T12:00');
    expect(s.feedLog).toEqual([]);
  });

  it('разбор сохранённого журнала отбрасывает испорченные записи и сортирует', () => {
    expect(
      parseFeedLog([
        { at: '2026-11-14T12:00', ml: 150 },
        { at: '2026-11-14T08:00', ml: null },
        { at: 'вчера', ml: 100 },
        { at: '2026-11-14T09:00', ml: -1 },
        null,
      ]),
    ).toEqual([
      { at: '2026-11-14T08:00', ml: null },
      { at: '2026-11-14T12:00', ml: 150 },
    ]);
    expect(parseFeedLog(undefined)).toEqual([]);
  });

  it('старые данные без журнала загружаются с пустым журналом', () => {
    const { feedLog: _, ...old } = base;
    const parsed = parseState(JSON.stringify(old));
    expect(parsed?.feedLog).toEqual([]);
  });

  it('журнал сохраняется в резервной копии и загружается из неё', () => {
    const s = addFeed(base, { at: '2026-11-14T12:00', ml: 150 });
    expect(importBackup(exportBackup(s))?.feedLog).toEqual([{ at: '2026-11-14T12:00', ml: 150 }]);
  });
});

describe('кормления за день', () => {
  const log: FeedEntry[] = [
    { at: '2026-11-13T22:40', ml: 160 },
    { at: '2026-11-14T02:10', ml: 150 },
    { at: '2026-11-14T06:00', ml: null },
    { at: '2026-11-14T10:15', ml: 163 },
  ];

  it('сегодня: число, сумма мл, время последнего', () => {
    const day = feedDay(log, NOW);
    expect(day.count).toBe(3);
    expect(day.totalMl).toBe(313);
    expect(day.withoutMl).toBe(1);
    expect(day.entries.map((e) => e.time)).toEqual(['10:15', '06:00', '02:10']);
    expect(day.lastAt).toBe('2026-11-14T10:15');
    expect(day.since).toBe('8 ч 15 мин назад');
  });

  it('последнее кормление может быть вчерашним', () => {
    const day = feedDay([{ at: '2026-11-13T22:40', ml: 160 }], new Date(2026, 10, 14, 0, 5));
    expect(day.count).toBe(0);
    expect(day.lastAt).toBe('2026-11-13T22:40');
    expect(day.since).toBe('1 ч 25 мин назад');
  });

  it('пустой журнал', () => {
    const day = feedDay([], NOW);
    expect(day).toMatchObject({ count: 0, totalMl: 0, lastAt: null, since: null });
  });

  it('прошлые дни: новые сверху, без сегодняшнего', () => {
    const hist = feedHistory(
      [{ at: '2026-11-12T08:00', ml: 100 }, { at: '2026-11-12T11:00', ml: null }, ...log],
      NOW,
    );
    expect(hist).toEqual([
      { date: '2026-11-13', count: 1, totalMl: 160, withoutMl: 0, times: ['22:40'] },
      { date: '2026-11-12', count: 2, totalMl: 100, withoutMl: 1, times: ['08:00', '11:00'] },
    ]);
  });
});

describe('сколько прошло', () => {
  it('минуты, часы и минуты, ровные часы', () => {
    expect(formatSince(0)).toBe('только что');
    expect(formatSince(5)).toBe('5 мин назад');
    expect(formatSince(60)).toBe('1 ч назад');
    expect(formatSince(161)).toBe('2 ч 41 мин назад');
  });
});
