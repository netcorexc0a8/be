import './styles.css';
import { parseWeightG, RULES } from './core';
import {
  addWeight,
  FORMULAS,
  latestWeight,
  loadState,
  localToday,
  saveState,
  type AppState,
} from './app/state';
import { buildView, formatDayMonth, formatInt, plural } from './app/view';

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

function sparkline(): string {
  const ws = state.weights.slice(-6);
  if (ws.length < 2) return '';
  const gs = ws.map((w) => w.grams);
  const lo = Math.min(...gs) - 200;
  const hi = Math.max(...gs) + 200;
  const pts = ws.map((w, i) => [10 + (i * 280) / (ws.length - 1), 62 - ((w.grams - lo) / (hi - lo)) * 54] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  const last = pts[pts.length - 1]!;
  return `<polygon points="10,70 ${line} 290,70" fill="var(--accent-soft)"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--accent)"/>`;
}

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
  el<HTMLInputElement>('kcal').disabled = state.formula !== 'custom';
  setField(el<HTMLSelectElement>('formula'), state.formula);
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

  const spark = sparkline();
  el('spark').innerHTML = spark;
  el('spark').toggleAttribute('hidden', spark === '');
  el('wlist').innerHTML = view.recentWeights
    .map((w) => `<div><span>${formatDayMonth(w.date)}</span><span>${formatInt(w.grams)} г</span></div>`)
    .join('');
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
  update({ ...state, kcalPer100ml: value, isExample: false });
});

el<HTMLSelectElement>('formula').addEventListener('change', (e) => {
  const formula = (e.target as HTMLSelectElement).value as AppState['formula'];
  const kcalPer100ml = formula === 'custom' ? state.kcalPer100ml : FORMULAS[formula].kcalPer100ml;
  update({ ...state, formula, kcalPer100ml, isExample: false });
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
  const grams = parseWeightG(input.value);
  if (Number.isNaN(grams)) {
    input.focus();
    return;
  }
  input.value = '';
  update(addWeight(state, { date: today(), grams }));
});

render();
