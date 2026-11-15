import { describe, expect, it } from 'vitest';
import {
  addFeed,
  dayTimeline,
  recentTimeline,
  editFeedAt,
  formatGapShort,
  weekRhythm,
  feedDay,
  feedHistory,
  formatSince,
  isYesterday,
  moveFeed,
  parseFeedLog,
  removeFeed,
  resolveFeedAt,
  type FeedEntry,
} from './feeds';
import { exampleState, exportBackup, importBackup, parseState } from './state';

const NOW = new Date(2026, 10, 14, 14, 30); // 14 ноября 2026, 14:30 по местному времени

describe('отметка кормления: время', () => {
  it('время не позже текущего записывается на сегодня', () => {
    expect(resolveFeedAt('14:30', NOW)).toBe('2026-11-14T14:30');
    expect(resolveFeedAt('07:05', NOW)).toBe('2026-11-14T07:05');
    expect(isYesterday('07:05', NOW)).toBe(false);
  });

  it('время позже текущего записывается на вчера (ночное кормление, отмеченное после полуночи)', () => {
    const justAfterMidnight = new Date(2026, 10, 15, 0, 10);
    expect(resolveFeedAt('23:50', justAfterMidnight)).toBe('2026-11-14T23:50');
    expect(resolveFeedAt('14:31', NOW)).toBe('2026-11-13T14:31');
    expect(isYesterday('14:31', NOW)).toBe(true);
  });

  it('вчера правильно считается через границу месяца и года', () => {
    expect(resolveFeedAt('23:00', new Date(2026, 0, 1, 0, 30))).toBe('2025-12-31T23:00');
  });

  it('неверное время не принимается', () => {
    expect(resolveFeedAt('', NOW)).toBeNull();
    expect(resolveFeedAt('25:00', NOW)).toBeNull();
    expect(resolveFeedAt('12:60', NOW)).toBeNull();
    expect(isYesterday('', NOW)).toBe(false);
  });
});

describe('журнал кормлений', () => {
  const base = exampleState('2026-11-14');

  it('добавляет по времени, повтор в ту же минуту не дублируется', () => {
    let s = addFeed(base, '2026-11-14T12:00');
    s = addFeed(s, '2026-11-14T09:00');
    s = addFeed(s, '2026-11-14T12:00');
    expect(s.feedLog).toEqual([{ at: '2026-11-14T09:00' }, { at: '2026-11-14T12:00' }]);
  });

  it('удаляет запись и правит время', () => {
    let s = addFeed(addFeed(base, '2026-11-14T12:00'), '2026-11-14T09:00');
    s = moveFeed(s, '2026-11-14T12:00', '2026-11-14T08:00');
    expect(s.feedLog).toEqual([{ at: '2026-11-14T08:00' }, { at: '2026-11-14T09:00' }]);
    s = removeFeed(s, '2026-11-14T08:00');
    expect(s.feedLog).toEqual([{ at: '2026-11-14T09:00' }]);
  });

  it('разбор сохранённого журнала отбрасывает испорченные записи и повторы, сортирует', () => {
    expect(
      parseFeedLog([{ at: '2026-11-14T12:00' }, { at: '2026-11-14T08:00' }, { at: 'вчера' }, { at: '2026-11-14T12:00' }, null]),
    ).toEqual([{ at: '2026-11-14T08:00' }, { at: '2026-11-14T12:00' }]);
    expect(parseFeedLog(undefined)).toEqual([]);
  });

  it('старые данные без журнала загружаются с пустым журналом', () => {
    const { feedLog: _, ...old } = base;
    expect(parseState(JSON.stringify(old))?.feedLog).toEqual([]);
  });

  it('журнал сохраняется в резервной копии и загружается из неё', () => {
    const s = addFeed(base, '2026-11-14T12:00');
    expect(importBackup(exportBackup(s))?.feedLog).toEqual([{ at: '2026-11-14T12:00' }]);
  });
});

describe('кормления за день', () => {
  const log: FeedEntry[] = [
    { at: '2026-11-13T22:40' },
    { at: '2026-11-14T02:10' },
    { at: '2026-11-14T06:30' },
    { at: '2026-11-14T13:40' },
  ];

  it('сегодня: число, времена с промежутками (первый — от вчерашнего), сколько прошло', () => {
    const day = feedDay(log, NOW);
    expect(day.count).toBe(3);
    expect(day.entries).toEqual([
      { at: '2026-11-14T13:40', time: '13:40', gap: 'через 7 ч 10 мин' },
      { at: '2026-11-14T06:30', time: '06:30', gap: 'через 4 ч 20 мин' },
      { at: '2026-11-14T02:10', time: '02:10', gap: 'через 3 ч 30 мин' },
    ]);
    expect(day.lastTime).toBe('13:40');
    expect(day.since).toBe('50 мин назад');
  });

  it('последнее кормление может быть вчерашним', () => {
    const day = feedDay([{ at: '2026-11-13T22:40' }], new Date(2026, 10, 14, 0, 5));
    expect(day.count).toBe(0);
    expect(day.lastTime).toBe('вчера 22:40');
    expect(day.since).toBe('1 ч 25 мин назад');
  });

  it('ровный промежуток пишется без минут', () => {
    const day = feedDay([{ at: '2026-11-14T10:00' }, { at: '2026-11-14T13:00' }], NOW);
    expect(day.entries[0]?.gap).toBe('через 3 ч');
  });

  it('пустой журнал', () => {
    expect(feedDay([], NOW)).toMatchObject({ count: 0, entries: [], lastTime: null, since: null });
  });

  it('прошлые дни: новые сверху, без сегодняшнего', () => {
    expect(feedHistory([{ at: '2026-11-12T08:00' }, { at: '2026-11-12T11:00' }, ...log], NOW)).toEqual([
      { date: '2026-11-13', count: 1, entries: [{ at: '2026-11-13T22:40', time: '22:40' }] },
      {
        date: '2026-11-12',
        count: 2,
        entries: [
          { at: '2026-11-12T08:00', time: '08:00' },
          { at: '2026-11-12T11:00', time: '11:00' },
        ],
      },
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

describe('графики кормлений', () => {
  const log: FeedEntry[] = [
    { at: '2026-11-08T03:00' },
    { at: '2026-11-13T22:40' },
    { at: '2026-11-14T02:10' },
    { at: '2026-11-14T06:00' },
    { at: '2026-11-14T12:00' },
  ];

  it('лента дня: точки, промежутки между сегодняшними и «сейчас»', () => {
    const t = dayTimeline(log, NOW);
    expect(t.now).toBeCloseTo((14 * 60 + 30) / 1440);
    expect(t.points).toEqual([
      { x: 130 / 1440, time: '02:10' },
      { x: 360 / 1440, time: '06:00' },
      { x: 720 / 1440, time: '12:00' },
    ]);
    expect(t.gaps.map((g) => g.label)).toEqual(['3 ч 50', '6 ч']);
    expect(t.gaps[0]).toMatchObject({ from: 130 / 1440, to: 360 / 1440 });
  });

  it('лента дня без отметок', () => {
    expect(dayTimeline([], NOW)).toMatchObject({ points: [], gaps: [] });
  });

  it('ритм: 7 строк, сегодня сверху, дни без отметок пустые, старше недели не попадают', () => {
    const rows = weekRhythm(log, NOW);
    expect(rows.map((r) => r.date)).toEqual([
      '2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11', '2026-11-10', '2026-11-09', '2026-11-08',
    ]);
    expect(rows[0]).toMatchObject({ today: true, xs: [130 / 1440, 360 / 1440, 720 / 1440] });
    expect(rows[1]?.xs).toEqual([1360 / 1440]);
    expect(rows[2]?.xs).toEqual([]);
    expect(rows[6]?.xs).toEqual([180 / 1440]);
    expect(weekRhythm(log, NOW, 6).some((r) => r.date === '2026-11-08')).toBe(false);
  });

  it('ритм через границу месяца', () => {
    expect(weekRhythm([], new Date(2026, 11, 2, 9, 0), 3).map((r) => r.date)).toEqual([
      '2026-12-02', '2026-12-01', '2026-11-30',
    ]);
  });

  it('короткая подпись промежутка', () => {
    expect(formatGapShort(45)).toBe('45 мин');
    expect(formatGapShort(180)).toBe('3 ч');
    expect(formatGapShort(185)).toBe('3 ч 05');
  });
});

describe('правка отметки', () => {
  it('день отметки сохраняется, меняется только время (вчерашнюю можно поправить)', () => {
    expect(editFeedAt('2026-11-13T22:40', '10:00', NOW)).toEqual({ ok: true, at: '2026-11-13T10:00' });
    expect(editFeedAt('2026-11-14T13:40', '12:00', NOW)).toEqual({ ok: true, at: '2026-11-14T12:00' });
  });

  it('время в будущем и неверное время не принимаются', () => {
    expect(editFeedAt('2026-11-14T13:40', '15:00', NOW)).toEqual({ ok: false, error: 'Это время ещё не наступило.' });
    expect(editFeedAt('2026-11-14T13:40', '', NOW).ok).toBe(false);
    expect(editFeedAt('2026-11-14T13:40', '24:00', NOW).ok).toBe(false);
  });
});

describe('лента за последние 24 часа', () => {
  const at4 = new Date(2026, 10, 15, 4, 6);
  const log: FeedEntry[] = [
    { at: '2026-11-14T03:00' }, // старше 24 часов
    { at: '2026-11-14T18:06' },
    { at: '2026-11-14T21:36' },
    { at: '2026-11-15T00:36' },
    { at: '2026-11-15T03:40' },
  ];

  it('вчерашний вечер и ночь видны, сейчас у правого края', () => {
    const t = recentTimeline(log, at4);
    expect(t.points.map((p) => p.time)).toEqual(['18:06', '21:36', '00:36', '03:40']);
    expect(t.points[0]!.x).toBeCloseTo(14 / 24);
    expect(t.points[3]!.x).toBeCloseTo(1 - 26 / 1440);
    expect(t.gaps.map((g) => g.label)).toEqual(['3 ч 30', '3 ч', '3 ч 04']);
  });

  it('часы на ленте по порядку: 06, 12, 18 вчера и 00 сегодня', () => {
    const t = recentTimeline([], at4);
    expect(t.ticks.map((k) => k.label)).toEqual(['06', '12', '18', '00']);
    expect(t.ticks[3]!.x).toBeCloseTo(1 - (4 * 60 + 6) / 1440);
  });
});
