import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import '@fontsource/unbounded/cyrillic-500.css';
import '@fontsource/unbounded/cyrillic-700.css';
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-700.css';
import './styles.css';
import { parseWeightG, RULES, validateWeightEntry } from './core';
import {
  addCustomFormula,
  addWeight,
  allFormulas,
  backupFileName,
  currentFormula,
  exportBackup,
  importBackup,
  removeCustomFormula,
  removeWeight,
  selectFormula,
  setFormulaKcal,
  validateFormulaInput,
  latestWeight,
  loadState,
  localToday,
  saveState,
  type AppState,
} from './app/state';
import { addFeed, dayTimeline, feedDay, feedDots, feedHistory, isYesterday, moveFeed, removeFeed, resolveFeedAt, timeNow, weekRhythm, type DayTimeline, type RhythmRow } from './app/feeds';
import { buildView, CHART, formatDayMonth, formatInt, formatScoops, plural, scoopDiff, type WeightChart } from './app/view';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const today = (): string => localToday();
let state: AppState = loadState(storage, today());

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Нет элемента #${id}`);
  return node as T;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function update(next: AppState): void {
  state = next;
  saveState(storage, state);
  render();
}

function bottleSvg(ml: number): string {
  const max = RULES.bottleMl;
  const top = 22;
  const bottom = 88;
  const h = bottom - top;
  const fh = h * Math.min(ml / max, 1);
  let ticks = '';
  for (let v = 30; v < max; v += 30) {
    const y = bottom - (h * v) / max;
    ticks += `<line x1="10" x2="${v % 60 ? 15 : 19}" y1="${y}" y2="${y}" stroke="var(--muted)" stroke-width="1"/>`;
  }
  return `<svg viewBox="0 0 46 92" role="img" aria-label="${ml} мл в бутылочке на ${max} мл">
    <rect x="17" y="2" width="12" height="8" rx="4" fill="var(--accent)"/>
    <rect x="13" y="9" width="20" height="7" rx="2" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
    <rect class="fill" x="9" y="${bottom - fh}" width="28" height="${fh}" fill="var(--milk)"/>
    <line x1="9" x2="37" y1="${bottom - fh}" y2="${bottom - fh}" stroke="var(--milk-edge)" stroke-width="1.5"/>
    <rect x="8" y="16" width="30" height="74" rx="7" fill="none" stroke="var(--fg)" stroke-opacity=".55" stroke-width="1.5"/>
    ${ticks}</svg>`;
}

function chartSvg(chart: WeightChart | null): string {
  if (!chart) return '';
  const line = chart.points.map((p) => `${p.x},${p.y}`).join(' ');
  const first = chart.points[0]!;
  const last = chart.points[chart.points.length - 1]!;
  const base = CHART.height - CHART.bottom;
  return `<line x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${base}" y2="${base}" stroke="var(--line)" stroke-width="1"/>
    <polygon points="${first.x},${base} ${line} ${last.x},${base}" fill="var(--accent-soft)"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${chart.points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--accent)"/>`).join('')}
    <circle cx="${last.x}" cy="${last.y}" r="4.5" fill="var(--accent)"/>
    <text class="val" x="${last.x + 8}" y="${last.y + 4}">${chart.lastValue}</text>
    <text x="${CHART.left}" y="${CHART.height - 4}">${chart.firstLabel}</text>
    <text x="${CHART.width - CHART.right}" y="${CHART.height - 4}" text-anchor="end">${chart.lastLabel}</text>`;
}

const HISTORY_COLLAPSED = 4;
let showAllWeights = false;
let confirmDelete: string | null = null;

/** Обновляет значение поля, только если пользователь сейчас его не редактирует. */
function setField(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (document.activeElement !== input) input.value = value;
}

function render(): void {
  const view = buildView(state, today());
  const weight = latestWeight(state);

  el('sample').hidden = !state.isExample;
  setField(el<HTMLInputElement>('kidName'), state.name);
  el('ageText').textContent = view.ageText;
  setField(el<HTMLInputElement>('dob'), state.dob);
  setField(el<HTMLInputElement>('weight'), String(weight.grams));
  el('weightDate').textContent = view.weightHint;
  setField(el<HTMLInputElement>('kcal'), String(state.kcalPer100ml));
  renderFormula();
  el('fmin').textContent = String(state.feedingsMin);
  el('fmax').textContent = String(state.feedingsMax);

  const r = view.result;
  el('dailyMl').textContent = r ? formatInt(r.mlDay) : '—';
  el('kcalText').textContent = r
    ? `${formatInt(r.kcalDay)} ккал · ${r.kcalPerKg} ккал × ${formatInt(weight.grams)} г`
    : 'Исправьте данные ниже';
  el('bottles').innerHTML = r
    ? r.perFeeding
        .map(
          (p) => `<div class="bottle">${bottleSvg(p.ml)}<div>
            <div class="ml">${formatInt(p.ml)} <small>мл</small></div>
            <div class="n">${p.feedings} ${plural(p.feedings, 'кормление', 'кормления', 'кормлений')}</div>
          </div></div>`,
        )
        .join('')
    : '';
  const scoops = el('scoops');
  const sv = view.scoops;
  scoops.hidden = !sv;
  scoops.innerHTML = sv
    ? `<div class="label">Как развести</div>` +
      sv.rows
        .map(
          (row) => `<div class="scoop-row">
            <div class="n">${row.feedings} ${plural(row.feedings, 'кормление', 'кормления', 'кормлений')} · по расчёту ${formatInt(row.ml)} мл</div>
            ${row.options
              .map(
                (o) => `<div class="scoop-opt"><b>${formatInt(o.waterMl)} мл воды + ${formatScoops(o.scoops)}</b>${
                  o.waterMl !== row.ml ? `<span>${scoopDiff(o.waterMl, row.ml)}</span>` : ''
                }</div>`,
              )
              .join('')}
          </div>`,
        )
        .join('') +
      `<div class="scoop-foot">За сутки около ${sv.perDay} ${plural(sv.perDay, 'ложки', 'ложек', 'ложек')}. По таблице на банке: 1&nbsp;мерная ложка без горки на ${sv.waterMlPerScoop}&nbsp;мл воды. Ложку не досыпать и не пересыпать.</div>`
    : '';
  el('notes').innerHTML =
    view.errors.map((i) => `<div class="note err">${escapeHtml(i.message)}</div>`).join('') +
    view.warnings.map((i) => `<div class="note warn">${escapeHtml(i.message)}</div>`).join('');

  const suggest = el('suggest');
  if (view.hint) {
    suggest.hidden = false;
    suggest.innerHTML =
      `<span>В ${view.ageMonths} мес. обычно <b>${view.hint.text}</b> кормлений</span>` +
      (view.hint.matches
        ? '<span class="same">совпадает с вашим выбором</span>'
        : '<button type="button" id="applyHint">Взять подсказку</button>');
  } else {
    suggest.hidden = true;
    suggest.innerHTML = '';
  }

  el('calc').innerHTML = view.breakdown.length
    ? view.breakdown.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')
    : '<div><span>Нет расчёта, пока есть ошибки</span></div>';

  const spark = chartSvg(view.chart);
  el('spark').innerHTML = spark;
  el('spark').toggleAttribute('hidden', spark === '');
  const rows = showAllWeights ? view.history : view.history.slice(0, HISTORY_COLLAPSED);
  el('wlist').innerHTML = rows
    .map(
      (w) => `<div class="wrow">
        <span class="wdate">${formatDayMonth(w.date)}</span>
        <span class="wg">${formatInt(w.grams)} г</span>
        ${
          w.canDelete
            ? `<button type="button" class="del${confirmDelete === w.date ? ' confirm' : ''}" data-delete="${w.date}" aria-label="Удалить замер за ${formatDayMonth(w.date)}">${confirmDelete === w.date ? 'Удалить?' : '×'}</button>`
            : ''
        }
        ${w.change ? `<span class="wchange">${w.change}</span>` : ''}
      </div>`,
    )
    .join('');
  const more = el<HTMLButtonElement>('showAll');
  more.hidden = view.history.length <= HISTORY_COLLAPSED;
  more.textContent = showAllWeights ? 'Свернуть' : `Показать все замеры (${view.history.length})`;
  const newDate = el<HTMLInputElement>('newWeightDate');
  newDate.max = today();
  newDate.min = state.dob;
  if (!newDate.value) newDate.value = today();
  renderFeeds();
}

// --- кормления ---

const FEED_DAYS_COLLAPSED = 7;
/** Отметка, которую сейчас правят (время из списка), или null. */
let editingFeed: string | null = null;
/** Пользователь сам поменял время в поле: не подставлять текущее. */
let feedTimeTouched = false;
let confirmFeedDelete = false;
let showAllFeedDays = false;

function renderFeeds(): void {
  const now = new Date();
  const day = feedDay(state.feedLog, now);
  const plan = state.feedingsMin === state.feedingsMax ? `${state.feedingsMax}` : `${state.feedingsMin}–${state.feedingsMax}`;
  el('feedCount').textContent = String(day.count);
  el('feedPlan').textContent = `из ${plan} кормлений`;
  el('feedDots').innerHTML = feedDots(day.count, state.feedingsMax)
    .map((on) => `<span class="dot${on ? ' on' : ''}"></span>`)
    .join('');
  el('feedSince').innerHTML = day.since
    ? `Последнее ${day.lastTime!.startsWith('вчера') ? '' : 'в '}${day.lastTime}, <b>${day.since}</b>`
    : 'Сегодня ещё нет отметок.';

  const time = el<HTMLInputElement>('feedTime');
  if (!editingFeed && !feedTimeTouched) setField(time, timeNow(now));
  el('feedSave').textContent = editingFeed ? 'Сохранить' : 'Покормили';
  el('feedEditActions').hidden = !editingFeed;
  const del = el('feedDelete');
  del.textContent = confirmFeedDelete ? 'Точно удалить?' : 'Удалить отметку';
  del.classList.toggle('confirm', confirmFeedDelete);
  el('feedHint').textContent = isYesterday(time.value, now)
    ? 'Время позже текущего: запишется на вчера.'
    : editingFeed
      ? `Меняете отметку ${editingFeed.slice(11)}.`
      : 'Время подставлено само (сейчас). Отметили позже — поправьте.';

  el('feedLine').innerHTML = timelineSvg(dayTimeline(state.feedLog, now));
  const week = weekRhythm(state.feedLog, now);
  const hasWeek = week.some((r) => !r.today && r.xs.length > 0);
  el('feedWeekBox').hidden = !hasWeek;
  el('feedWeek').innerHTML = hasWeek ? rhythmSvg(week, dayTimeline([], now).now) : '';

  el('feedList').innerHTML = day.entries
    .map(
      (e) => `<div class="frow${editingFeed === e.at ? ' editing' : ''}">
        <span class="ftime">${e.time}</span>
        <span class="fgap">${e.gap ?? ''}</span>
        <button type="button" class="del" data-feed="${e.at}" aria-label="Изменить отметку ${e.time}">Изменить</button>
      </div>`,
    )
    .join('');

  const days = feedHistory(state.feedLog, now);
  el('feedDaysBox').hidden = days.length === 0;
  el('feedDays').innerHTML = (showAllFeedDays ? days : days.slice(0, FEED_DAYS_COLLAPSED))
    .map(
      (d) => `<div class="fday">
        <span>${formatDayMonth(d.date)}</span>
        <span class="fday-n">${d.count} ${plural(d.count, 'кормление', 'кормления', 'кормлений')}</span>
        <span class="fday-times">${d.times.join(', ')}</span>
      </div>`,
    )
    .join('');
  const all = el<HTMLButtonElement>('feedDaysAll');
  all.hidden = days.length <= FEED_DAYS_COLLAPSED;
  all.textContent = showAllFeedDays ? 'Свернуть' : `Показать все дни (${days.length})`;
}

const fx = (x: number, left: number, width: number): string => (left + x * width).toFixed(1);

/** Лента сегодняшних суток: точки кормлений, промежутки над ними, отметка «сейчас». */
function timelineSvg(t: DayTimeline): string {
  const L = 6;
  const W = 298;
  const y = 40;
  const nowX = Number(fx(t.now, L, W));
  // подпись промежутка, только если она помещается между точками
  const nowX0 = Number(fx(t.now, L, W));
  const nowLeftEdge = nowX0 + 6 + 46 <= L + W ? Infinity : nowX0 - 6 - 46;
  const gaps = t.gaps
    .filter((g) => (g.to - g.from) * W >= 40 && L + ((g.from + g.to) / 2) * W + 20 < nowLeftEdge)
    .map((g) => `<text x="${fx((g.from + g.to) / 2, L, W)}" y="${y - 20}" text-anchor="middle">${g.label}</text>`)
    .join('');
  // «сейчас» справа от отметки, а в конце суток — слева
  const nowRight = nowX + 6 + 46 <= L + W;
  const nowLabel = nowRight
    ? `<text class="now" x="${nowX + 6}" y="${y - 20}">сейчас</text>`
    : `<text class="now" x="${nowX - 6}" y="${y - 20}" text-anchor="end">сейчас</text>`;
  // время под точкой, если не налезает на соседнее
  let prevLabelX = -Infinity;
  const times = t.points
    .map((p) => {
      const x = Number(fx(p.x, L, W));
      if (x - prevLabelX < 34) return '';
      prevLabelX = x;
      return `<text class="t" x="${x}" y="${y + 30}" text-anchor="middle">${p.time}</text>`;
    })
    .join('');
  return `<rect x="${L}" y="${y - 14}" width="${W}" height="28" rx="14" fill="var(--bg)"/>
    <rect x="${L}" y="${y - 14}" width="${Math.max(nowX - L, 0)}" height="28" rx="14" fill="var(--accent-soft)"/>
    ${gaps}
    ${t.points.map((p) => `<circle cx="${fx(p.x, L, W)}" cy="${y}" r="8" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>`).join('')}
    ${times}
    <line x1="${nowX}" x2="${nowX}" y1="${y - 16}" y2="${y + 16}" stroke="var(--now)" stroke-width="2"/>
    ${nowLabel}
    ${[0, 6, 12, 18, 24]
      .map((h) => `<text x="${fx(h / 24, L, W)}" y="${y + 52}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${String(h).padStart(2, '0')}</text>`)
      .join('')}`;
}

/** «13 нояб.» */
const shortDate = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** Ритм: строка на каждые сутки, точка на каждое кормление. */
function rhythmSvg(rows: RhythmRow[], now: number): string {
  const L = 62;
  const W = 240;
  const grid = [0, 6, 12, 18, 24]
    .map((h) => {
      const x = fx(h / 24, L, W);
      return `<line x1="${x}" x2="${x}" y1="12" y2="216" stroke="var(--line)" stroke-dasharray="2 3"/>
        <text x="${x}" y="232" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${String(h).padStart(2, '0')}</text>`;
    })
    .join('');
  const lines = rows
    .map((r, i) => {
      const y = 24 + i * 30;
      const dots = r.xs
        .map((x) => `<circle cx="${fx(x, L, W)}" cy="${y}" r="${r.today ? 5 : 4}" fill="var(--accent)"${r.today ? '' : ' fill-opacity=".6"'}/>`)
        .join('');
      const nowMark = r.today
        ? `<line x1="${fx(now, L, W)}" x2="${fx(now, L, W)}" y1="${y - 9}" y2="${y + 9}" stroke="var(--now)" stroke-width="2"/>`
        : '';
      return `<text class="${r.today ? 'today' : ''}" x="0" y="${y + 4}">${r.today ? 'Сегодня' : shortDate(r.date)}</text>
        <line x1="${L}" x2="${L + W}" y1="${y}" y2="${y}" stroke="var(--line)"/>${dots}${nowMark}`;
    })
    .join('');
  return grid + lines;
}

function resetFeedForm(): void {
  editingFeed = null;
  feedTimeTouched = false;
  confirmFeedDelete = false;
  el('feedError').hidden = true;
  el<HTMLInputElement>('feedTime').value = '';
}

// --- события ---

el<HTMLInputElement>('kidName').addEventListener('change', (e) => {
  const name = (e.target as HTMLInputElement).value.trim() || 'Малыш';
  update({ ...state, name, isExample: false });
});

el<HTMLInputElement>('dob').addEventListener('change', (e) => {
  const dob = (e.target as HTMLInputElement).value;
  if (dob) update({ ...state, dob, isExample: false });
});

el<HTMLInputElement>('weight').addEventListener('change', (e) => {
  const grams = parseWeightG((e.target as HTMLInputElement).value);
  const last = latestWeight(state);
  update({
    ...state,
    weights: [...state.weights.slice(0, -1), { ...last, grams: Number.isNaN(grams) ? 0 : grams }],
    isExample: false,
  });
  (e.target as HTMLInputElement).value = String(latestWeight(state).grams);
});

el<HTMLInputElement>('kcal').addEventListener('input', (e) => {
  const value = Number((e.target as HTMLInputElement).value.replace(',', '.'));
  update(setFormulaKcal(state, value));
});

const ADD_FORMULA = '__add';
let formulaFormOpen = false;
let confirmRemoveFormula = false;

function renderFormula(): void {
  const formula = currentFormula(state);
  const select = el<HTMLSelectElement>('formula');
  select.innerHTML =
    allFormulas(state)
      .map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`)
      .join('') + `<option value="${ADD_FORMULA}">+ Добавить смесь</option>`;
  select.value = formulaFormOpen ? ADD_FORMULA : state.formula;
  el<HTMLInputElement>('kcal').disabled = !formula.custom;
  el('formulaForm').hidden = !formulaFormOpen;
  el('kcalRow').hidden = formulaFormOpen;
  const meta = el('formulaMeta');
  meta.hidden = formulaFormOpen || !formula.custom;
  meta.innerHTML = formula.custom
    ? `<span>${formula.waterMlPerScoop ? `${formatInt(formula.waterMlPerScoop)} мл воды на 1 ложку` : 'мл воды на ложку не указаны, ложки не считаются'}</span>` +
      `<button type="button" class="del${confirmRemoveFormula ? ' confirm' : ''}" id="removeFormula">${confirmRemoveFormula ? 'Удалить смесь?' : 'Удалить'}</button>`
    : '';
}

function resetFormulaForm(): void {
  formulaFormOpen = false;
  el('formulaError').hidden = true;
  for (const id of ['fName', 'fKcal', 'fWater']) el<HTMLInputElement>(id).value = '';
}

el<HTMLSelectElement>('formula').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  confirmRemoveFormula = false;
  if (id === ADD_FORMULA) {
    formulaFormOpen = true;
    render();
    el<HTMLInputElement>('fName').focus();
    return;
  }
  formulaFormOpen = false;
  update(selectFormula(state, id));
});

el('fCancel').addEventListener('click', () => {
  resetFormulaForm();
  render();
});

el('fSave').addEventListener('click', () => {
  const result = validateFormulaInput(
    {
      name: el<HTMLInputElement>('fName').value,
      kcal: el<HTMLInputElement>('fKcal').value,
      water: el<HTMLInputElement>('fWater').value,
    },
    allFormulas(state).map((f) => f.name),
  );
  const errorBox = el('formulaError');
  if (!result.ok) {
    errorBox.textContent = result.error;
    errorBox.hidden = false;
    return;
  }
  resetFormulaForm();
  update(addCustomFormula(state, result.value, `f${Date.now().toString(36)}`));
});

el('formulaMeta').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id !== 'removeFormula') return;
  if (confirmRemoveFormula) {
    confirmRemoveFormula = false;
    update(removeCustomFormula(state, state.formula));
  } else {
    confirmRemoveFormula = true;
    render();
  }
});

document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((button) => {
  button.addEventListener('click', () => {
    const [which, delta] = (button.dataset.step ?? '').split(',');
    const { min, max } = RULES.feedings;
    const clamp = (n: number) => Math.max(min, Math.min(max, n));
    let { feedingsMin, feedingsMax } = state;
    if (which === 'min') {
      feedingsMin = clamp(feedingsMin + Number(delta));
      feedingsMax = Math.max(feedingsMax, feedingsMin);
    } else {
      feedingsMax = clamp(feedingsMax + Number(delta));
      feedingsMin = Math.min(feedingsMin, feedingsMax);
    }
    update({ ...state, feedingsMin, feedingsMax, isExample: false });
  });
});

el('suggest').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id !== 'applyHint') return;
  const view = buildView(state, today());
  if (view.hint) update({ ...state, feedingsMin: view.hint.min, feedingsMax: view.hint.max, isExample: false });
});

el('addWeight').addEventListener('click', () => {
  const input = el<HTMLInputElement>('newWeight');
  const dateInput = el<HTMLInputElement>('newWeightDate');
  const errorBox = el('weightError');
  const grams = parseWeightG(input.value);
  const date = dateInput.value || today();
  const issue = validateWeightEntry({ grams, date, dob: state.dob, today: today() });
  if (issue) {
    errorBox.textContent = issue.message;
    errorBox.hidden = false;
    input.focus();
    return;
  }
  errorBox.hidden = true;
  input.value = '';
  dateInput.value = today();
  update(addWeight(state, { date, grams }));
});

el('wlist').addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-delete]');
  if (!button) return;
  const date = button.dataset.delete!;
  if (confirmDelete === date) {
    confirmDelete = null;
    update(removeWeight(state, date));
  } else {
    confirmDelete = date;
    render();
  }
});

document.addEventListener('click', (e) => {
  if (confirmDelete && !(e.target as HTMLElement).closest('[data-delete]')) {
    confirmDelete = null;
    render();
  }
});

el('showAll').addEventListener('click', () => {
  showAllWeights = !showAllWeights;
  render();
});

/**
 * Пустое поле времени (кнопка «Сбросить» в выборе времени на iPhone) заполняется снова:
 * при новой отметке текущим временем, при правке — временем этой отметки.
 */
function onFeedTimeInput(): void {
  const input = el<HTMLInputElement>('feedTime');
  if (input.value) {
    feedTimeTouched = true;
  } else {
    feedTimeTouched = false;
    input.value = editingFeed ? editingFeed.slice(11) : timeNow(new Date());
  }
  renderFeeds();
}
el<HTMLInputElement>('feedTime').addEventListener('input', onFeedTimeInput);
el<HTMLInputElement>('feedTime').addEventListener('change', onFeedTimeInput);
el<HTMLInputElement>('feedTime').addEventListener('blur', () => {
  if (!el<HTMLInputElement>('feedTime').value) onFeedTimeInput();
});

el('feedSave').addEventListener('click', () => {
  const at = resolveFeedAt(el<HTMLInputElement>('feedTime').value, new Date());
  if (!at) {
    const box = el('feedError');
    box.textContent = 'Укажите время кормления.';
    box.hidden = false;
    return;
  }
  const next = editingFeed ? moveFeed(state, editingFeed, at) : addFeed(state, at);
  resetFeedForm();
  update(next);
});

el('feedCancel').addEventListener('click', () => {
  resetFeedForm();
  render();
});

el('feedDelete').addEventListener('click', () => {
  if (!editingFeed) return;
  if (!confirmFeedDelete) {
    confirmFeedDelete = true;
    renderFeeds();
    return;
  }
  const at = editingFeed;
  resetFeedForm();
  update(removeFeed(state, at));
});

el('feedList').addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-feed]');
  if (!button) return;
  editingFeed = button.dataset.feed!;
  confirmFeedDelete = false;
  el('feedError').hidden = true;
  el<HTMLInputElement>('feedTime').value = editingFeed.slice(11);
  renderFeeds();
});

el('feedDaysAll').addEventListener('click', () => {
  showAllFeedDays = !showAllFeedDays;
  renderFeeds();
});

// «Сколько прошло» и текущее время в поле обновляются сами, пока приложение открыто.
setInterval(() => {
  if (document.visibilityState === 'visible') renderFeeds();
}, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderFeeds();
});

// --- резервная копия ---

let pendingImport: AppState | null = null;

function showBackupStatus(text: string): void {
  const box = el('backupStatus');
  box.textContent = text;
  box.hidden = false;
}

el('exportData').addEventListener('click', async () => {
  const name = backupFileName(today());
  const file = new File([exportBackup(state)], name, { type: 'application/json' });
  // На телефоне удобнее системное меню «Поделиться»: «Сохранить в Файлы», мессенджер, почта.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Кормилка: резервная копия' });
      showBackupStatus('Копия сохранена.');
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showBackupStatus(`Файл ${name} сохранён в загрузки.`);
});

el('importData').addEventListener('click', () => el<HTMLInputElement>('importFile').click());

el<HTMLInputElement>('importFile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const restored = importBackup(await file.text());
  if (!restored) {
    pendingImport = null;
    el('importConfirm').hidden = true;
    showBackupStatus('Этот файл не похож на резервную копию приложения. Выберите файл smes-….json.');
    return;
  }
  pendingImport = restored;
  const last = restored.weights[restored.weights.length - 1]!;
  el('importConfirmText').textContent =
    `В файле: ${restored.name}, ${restored.weights.length} ${plural(restored.weights.length, 'замер', 'замера', 'замеров')} веса, последний ${formatInt(last.grams)} г; ${restored.feedLog.length} ${plural(restored.feedLog.length, 'отметка', 'отметки', 'отметок')} кормлений. Заменить текущие данные?`;
  el('importConfirm').hidden = false;
  el('backupStatus').hidden = true;
});

el('importYes').addEventListener('click', () => {
  if (!pendingImport) return;
  update(pendingImport);
  pendingImport = null;
  el('importConfirm').hidden = true;
  showBackupStatus('Данные загружены из файла.');
});

el('importNo').addEventListener('click', () => {
  pendingImport = null;
  el('importConfirm').hidden = true;
});

render();

// Сохраняем приложение на телефоне для работы без интернета (только в собранной версии).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        // приложение на телефоне долго живёт в фоне: проверяем обновление при каждом возвращении
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // без service worker приложение просто работает онлайн
      });
  });
}
