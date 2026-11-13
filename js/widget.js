(() => {
'use strict';

const STORAGE_PREFIX = 'savingsSim:v2';
const TOTAL_STEPS = 6;
const PERIODS = { week: 52, month: 12, quarter: 4, year: 1 };          // внесків на рік
const FREQ_WORD = { week: 'щотижня', month: 'щомісяця', quarter: 'щокварталу', year: 'щороку' };
const UNIT_WORD = { month: 'на місяць', year: 'на рік' };
const DEFAULTS = { income: 40000, expenses: 22000, percent: 20, freq: 'month', years: 10, unit: 'month', rateOn: false, rate: 8 };
/* Межі зберігаються в «щомісячних» одиницях для доходу й витрат */
const LIMITS = {
  income: { min: 5000, max: 300000 },
  expenses: { min: 0, max: 300000 },     // фактичний максимум = поточний дохід
  percent: { min: 0, max: 100 },
  years: { min: 1, max: 40 },
  rate: { min: 1, max: 20 },
};
const round2 = (v) => Math.round(v * 100) / 100;
const ROUND = { rate: (v) => Math.round(v * 2) / 2, income: round2, expenses: round2 };
const roundFor = (key) => ROUND[key] || Math.round;
const isMoney = (key) => key === 'income' || key === 'expenses';
const CHIP_KEYS = ['percent', 'years'];                                 // дозволені data-chip
/* Параметр URL -> ключ стану */
const URL_MAP = { income: 'income', exp: 'expenses', pct: 'percent', freq: 'freq', years: 'years', unit: 'unit', rate: 'rate' };
const SAVED_KEYS = ['income', 'expenses', 'percent', 'years', 'freq'];
const STEP_FIELD = { 1: 'income', 2: 'expenses', 3: 'percent' };        // де показувати повідомлення кроку
const STEP_FIELDS = { 1: ['income'], 2: ['expenses'] };                 // числові поля, які треба перевіряти
const NAV_LOCK_MS = 300;

/* ===== Форматування й чисті функції (без стану, спільні для екземплярів) ===== */
const pluralRules = new Intl.PluralRules('uk');
const nf0 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
let nfCompact = nf0;
try { nfCompact = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 }); } catch (_) { /* старий браузер */ }

const plural = (n, one, few, many) => {
  const c = pluralRules.select(n);
  return c === 'one' ? one : c === 'few' ? few : many;
};

let warnedBadNumber = false;
const safe = (n) => {                                                   // без NaN, Infinity і від'ємних
  if (!Number.isFinite(n) && !warnedBadNumber) {
    warnedBadNumber = true;
    console.warn('[savings] Розрахунок дав нескінченне або нечислове значення:', n);
  }
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (n) => nf0.format(Math.round(safe(n)));
const fmtMoney = (n) => `${fmt(n)} ₴`;
const fmtMoney2 = (n) => `${nf2.format(Math.round(safe(n) * 100) / 100)} ₴`;   // з копійками, якщо вони є
const yearsText = (n) => `${n} ${plural(n, 'рік', 'роки', 'років')}`;
const hryvnia = (n) => plural(n, 'гривня', 'гривні', 'гривень');
/* Відсотки словами: «8 відсотків», «1,5 відсотка» */
const percentWord = (n) => (Number.isInteger(n)
  ? `${n} ${plural(n, 'відсоток', 'відсотки', 'відсотків')}`
  : `${nf1.format(n)} відсотка`);
/* Значення поля з правильною одиницею (гривні, %, роки) для повідомлень */
const fmtVal = (key, n) => {
  if (isMoney(key)) return fmtMoney(n);
  if (key === 'years') return yearsText(n);
  return `${nf1.format(n)}%`;
};

/* Суворий розбір: лише цифри та один десятковий роздільник. */
const NUM_RE = /^[+-]?\d+(?:[.,]\d+)?$/;
const THOUSANDS_RE = /^[+-]?\d{1,3}(?:,\d{3})+$/;                       // «40,000»: неоднозначно, не вгадуємо
function parseNumber(raw) {
  const s = String(raw === null || raw === undefined ? '' : raw).trim().replace(/\s/g, '');
  if (s === '') return { ok: false, reason: 'empty' };
  if (THOUSANDS_RE.test(s) || !NUM_RE.test(s)) return { ok: false, reason: 'format' };
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, reason: 'big' };
  return { ok: true, value: n };
}

/* Приводить будь-які дані (URL, localStorage) до допустимих; і значення за замовчуванням теж проходять межі. */
function sanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS };
  const pick = (key, value) => {
    const p = parseNumber(value);
    const v = (p.ok ? roundFor(key)(p.value) : DEFAULTS[key]) || 0;
    const max = key === 'expenses' ? out.income : LIMITS[key].max;
    return Math.min(Math.max(v, LIMITS[key].min), max);
  };
  out.income = pick('income', src.income);
  out.expenses = pick('expenses', src.expenses);
  out.percent = pick('percent', src.percent);
  out.years = pick('years', src.years);
  out.rate = pick('rate', src.rate);
  out.freq = Object.prototype.hasOwnProperty.call(PERIODS, src.freq) ? src.freq : DEFAULTS.freq;
  out.unit = src.unit === 'year' ? 'year' : 'month';
  out.rateOn = src.rateOn === true || src.rateOn === 'true';
  return out;
}

function calculate(s) {
  const perYear = PERIODS[s.freq] || PERIODS.month;
  const free = safe(s.income - s.expenses);                    // вільний залишок на місяць
  const monthly = safe(free * (s.percent / 100));             // відкладається за місяць
  const yearly = monthly * 12;
  const deposit = safe(yearly / perYear);                     // один внесок
  const count = s.years * perYear;                            // кількість внесків
  const rate = s.rateOn ? s.rate / 100 : 0;
  const periodRate = rate > 0 ? (1 + rate) ** (1 / perYear) - 1 : 0;

  const totals = [0];
  const contribs = [0];
  let balance = 0;
  for (let y = 1; y <= s.years; y += 1) {
    if (periodRate > 0) {
      for (let p = 0; p < perYear; p += 1) balance = balance * (1 + periodRate) + deposit;
      totals.push(safe(balance));
    } else {
      totals.push(safe(yearly * y));
    }
    contribs.push(safe(yearly * y));
  }
  const total = totals[totals.length - 1];
  const contributed = contribs[contribs.length - 1];
  const share = s.income > 0 ? Math.min(100, safe((monthly / s.income) * 100)) : 0;
  return { free, monthly, yearly, deposit, count, total, contributed, interest: safe(total - contributed), share, totals, contribs };
}

function niceTop(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow * 4;
  return max;
}

/* ===== Унікальні id для кожного екземпляра ===== */
let uidCounter = 0;
const instances = new WeakMap();
const REF_ATTRS = ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby'];
const REF_SELECTOR = REF_ATTRS.map((a) => `[${a}]`).join(',');

/* Перший віджет лишає id як є, наступним додається префікс; посилання for/aria-* переписуються. */
function ensureUid(root) {
  if (root.dataset.simUid !== undefined) return root.dataset.simUid;       // повторне монтування
  uidCounter += 1;
  const uid = uidCounter === 1 ? '' : `s${uidCounter}-`;
  if (uid) {
    root.querySelectorAll('[id]').forEach((n) => { n.id = uid + n.id; });
    /* Обходимо лише вузли, які справді мають посилальні атрибути */
    [root, ...root.querySelectorAll(REF_SELECTOR)].forEach((n) => {
      REF_ATTRS.forEach((a) => {
        const v = n.getAttribute(a);
        if (v) n.setAttribute(a, v.split(/\s+/).filter(Boolean).map((t) => uid + t).join(' '));
      });
    });
  }
  root.dataset.simUid = uid;
  return uid;
}

/* Якщо розмітки не вистачає: без JS-логіки віджет усе одно має бути доступним. */
function degrade(root) {
  root.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = false; });
  root.querySelectorAll('[role="tab"]').forEach((t) => { t.disabled = false; });
  const form = root.querySelector('form');
  if (form) form.hidden = false;
  root.setAttribute('data-sim-broken', '');
}

/* Ідентифікатори елементів поля за шаблоном sim-{ключ}-{частина} */
function makeFieldIds(key, opts) {
  const o = opts || {};
  return {
    range: `sim-${key}-range`,
    num: o.num ? `sim-${key}-number` : null,
    out: `sim-${key}-out`,
    err: `sim-${key}-err`,
    min: o.bounds ? `sim-${key}-min` : null,
    max: o.bounds ? `sim-${key}-max` : null,
  };
}

function createSavingsSim(root) {
  const uid = ensureUid(root);
  const $ = (id) => root.querySelector(`#${uid}${id}`);                 // пошук лише всередині root
  const ac = new AbortController();
  const { signal } = ac;
  const simId = root.dataset.simId || 'default';
  const storageKey = `${STORAGE_PREFIX}:${simId}`;
  const pfx = root.hasAttribute('data-sync-url') ? '' : `${simId}.`;    // префікс параметрів URL
  const P = (k) => pfx + k;

  const form = $('sim-form');
  if (!form) { console.warn('[savings] Не знайдено форму sim-form'); degrade(root); return null; }

  /* ===== Пошук елементів ===== */
  const fieldIds = {
    income: makeFieldIds('income', { num: true, bounds: true }),
    expenses: makeFieldIds('expenses', { num: true, bounds: true }),
    percent: makeFieldIds('percent'),
    years: makeFieldIds('years'),
    rate: makeFieldIds('rate'),
  };
  const fields = {};
  const elementMap = new Map();              // елемент -> [ключ, чи це числове поле]
  const missing = [];
  for (const key of Object.keys(fieldIds)) {
    const ids = fieldIds[key];
    const f = {};
    for (const part of ['range', 'num', 'out', 'err', 'min', 'max']) {
      f[part] = ids[part] ? $(ids[part]) : null;
      if (ids[part] && !f[part]) missing.push(`${key}:${part}`);
    }
    fields[key] = f;
    if (f.range) elementMap.set(f.range, [key, false]);
    if (f.num) elementMap.set(f.num, [key, true]);
  }

  const el = {
    freeOut: $('sim-free-out'), percentMoney: $('sim-percent-money'),
    freqMoney: $('sim-frequency-money'), freqWord: $('sim-frequency-word'),
    total: $('sim-total'), totalNote: $('sim-total-note'),
    statContrib: $('sim-stat-contrib'), statInterest: $('sim-stat-interest'),
    statAmount: $('sim-stat-amount'), statShare: $('sim-stat-share'),
    errors: $('sim-errors'), status: $('sim-status'), preview: $('sim-preview'),
    save: $('sim-save'), share: $('sim-share'), cta: $('sim-cta-plan'), reset: $('sim-reset'),
    tablist: $('sim-tablist'), back: $('sim-back'), next: $('sim-next'), nextLabel: $('sim-next-label'),
    wizard: $('sim-wizard'), rateToggle: $('sim-rate-toggle'), rateGroup: $('sim-rate-group'),
    tableBody: $('sim-table-body'), thInterest: $('sim-th-interest'), legendContrib: $('sim-legend-contrib'),
    chartBox: $('sim-chart-box'), canvas: $('sim-chart-canvas'), readout: $('sim-chart-readout'),
  };
  const tabs = [];
  const panels = [];
  for (let n = 1; n <= TOTAL_STEPS; n += 1) {
    tabs.push($(`sim-tab-${n}`));
    panels.push($(`sim-step-${n}`));
  }
  Object.entries(el).forEach(([k, v]) => { if (!v) missing.push(k); });
  tabs.forEach((t, i) => { if (!t) missing.push(`tab-${i + 1}`); });
  panels.forEach((p, i) => { if (!p) missing.push(`step-${i + 1}`); });
  if (missing.length) {
    console.warn('[savings] Не знайдено елементи розмітки:', missing.join(', '));
    degrade(root);
    return null;
  }

  /* Колекції, які не змінюються: збираємо один раз, а не на кожен render */
  const chips = Array.from(form.querySelectorAll('[data-chip]'));
  const freqRadios = Array.from(form.querySelectorAll('input[name="frequency"]'));
  const unitRadios = Array.from(form.querySelectorAll('input[name="unit-income"], input[name="unit-expenses"]'));

  /* ===== Стан ===== */
  const state = { ...DEFAULTS };
  const invalid = {};              // поля, у яких зараз некоректне введення
  const fieldMsgs = {};            // повідомлення, прив'язані до поля
  const painted = {};              // що зараз показано під кожним полем (щоб не переписувати DOM)
  const boundsSig = {};            // підпис останніх виставлених меж поля (lo|hi|step)
  let step = 1;                    // поточний крок
  let maxStep = 1;                 // найдальший відкритий крок
  let stepMsg = '';                // чому не можна перейти далі
  let actionMsg = '';              // помилка дії (збереження, поширення)
  let statusTimer = 0;
  let chartRaf = 0;
  let hoverIdx = -1;
  let geom = null;
  let navLock = 0;
  let sharing = false;
  let lastResult = null;
  let tableDirty = true;
  let lastCanvas = { w: 0, h: 0, dpr: 0 };
  let box = { w: 0, h: 0 };        // розміри графіка (оновлює ResizeObserver, без forced layout)
  let ctx2d = null;
  let palette = null;              // кеш кольорів і шрифту графіка
  let series = { totals: [0], contribs: [0], rateOn: false };
  let ro = null;
  let mo = null;
  const planBase = (el.cta.getAttribute('href') || '/plan').split('#')[0].split('?')[0];

  /* Записують у DOM лише за зміни значення (менше мутацій, менше повторних оголошень aria-live) */
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const setProp = (node, prop, value) => { if (node[prop] !== value) node[prop] = value; };
  const setAttr = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };

  const factor = (key) => (isMoney(key) && state.unit === 'year' ? 12 : 1);
  const effExpenses = () => Math.min(state.expenses, state.income);     // витрати ніколи не більші за дохід, але самі не перезаписуються
  const limitMonthly = (key) => ({
    min: LIMITS[key].min,
    max: key === 'expenses' ? state.income : LIMITS[key].max,
  });
  const shownOf = (key) => {                                            // значення, яке бачить користувач
    if (!isMoney(key)) return state[key];
    const base = key === 'expenses' ? effExpenses() : state.income;
    return Math.round(base * factor(key));
  };

  /* ===== Формування параметрів URL ===== */
  function getUrlParams() {
    return new URLSearchParams({
      [P('income')]: state.income,
      [P('exp')]: effExpenses(),
      [P('pct')]: state.percent,
      [P('freq')]: state.freq,
      [P('years')]: state.years,
      [P('unit')]: state.unit,
      ...(state.rateOn ? { [P('rate')]: state.rate } : {})
    });
  }

  /* Синхронізація посилання Кнопки з правильною URL-структурою: path?params#hash */
  function updateCtaHref() {
    const href = `${planBase}?${getUrlParams().toString()}#signup`;
    if (el.cta.getAttribute('href') !== href) el.cta.setAttribute('href', href);
  }

  /* ===== Помилки: повідомлення під відповідним полем ===== */
  function paintFieldError(key, msg) {
    if (painted[key] === msg) return;                         // нічого не змінилось: DOM не чіпаємо
    painted[key] = msg;
    const f = fields[key];
    setText(f.err, msg);
    setProp(f.err, 'hidden', !msg);
    [f.range, f.num].forEach((n) => {                         // aria-invalid лише коли є помилка
      if (!n) return;
      if (msg) n.setAttribute('aria-invalid', 'true');
      else n.removeAttribute('aria-invalid');
    });
  }

  function setFieldError(key, msg) {
    fieldMsgs[key] = msg;
    refreshGlobalError();
  }

  /* Попередження показуємо лише тоді, коли користувач дійшов до відповідного кроку. */
  function warningFor(key) {
    const free = safe(state.income - state.expenses);
    if (key === 'expenses' && step >= 2 && free === 0) return 'Витрати дорівнюють доходу, тому відкладати нічого. Зменште витрати або збільште дохід.';
    if (key === 'percent' && step >= 3 && state.percent === 0) return 'Зараз ви нічого не відкладаєте. Оберіть відсоток більший за 0.';
    return '';
  }

  function focusField(key) {
    const f = fields[key];
    const target = f && (f.num || f.range);
    if (target) target.focus();
  }

  function refreshGlobalError() {
    const stepKey = STEP_FIELD[step];
    for (const key of Object.keys(fields)) {
      paintFieldError(key, fieldMsgs[key] || (key === stepKey ? stepMsg : '') || warningFor(key));
    }
    /* Під кнопками результату: помилки збереження/поширення та попередження */
    const warnings = step === TOTAL_STEPS ? [warningFor('expenses'), warningFor('percent')] : [];
    const msg = [actionMsg, ...warnings].filter(Boolean).join(' ');
    setText(el.errors, msg);
    setProp(el.errors, 'hidden', !msg);
  }

  function setStatus(msg, isError) {
    window.clearTimeout(statusTimer);
    el.status.textContent = msg;
    if (isError) el.status.setAttribute('data-state', 'error');
    else el.status.removeAttribute('data-state');
    if (msg && !isError) statusTimer = window.setTimeout(() => { el.status.textContent = ''; }, 4000);
  }

  /* ===== Синхронізація контролів зі станом ===== */
  function syncControls(skipKey) {
    const f = state.unit === 'year' ? 12 : 1;
    const stepSize = 500 * f;

    /* Межі, крок і підписи міняємо лише коли змінився їхній підпис (одиниці, дохід) */
    const setBounds = (key, lim) => {
      const lo = Math.round(lim.min * f);
      const hi = Math.round(lim.max * f);
      const sig = `${lo}|${hi}|${stepSize}`;
      if (boundsSig[key] === sig) return;
      boundsSig[key] = sig;
      const fld = fields[key];
      [fld.range, fld.num].forEach((n) => {
        if (!n) return;
        n.min = String(lo); n.max = String(hi); n.step = String(stepSize);
      });
      if (fld.min) setText(fld.min, fmtMoney(lo));
      if (fld.max) setText(fld.max, fmtMoney(hi));
    };
    setBounds('income', limitMonthly('income'));
    setBounds('expenses', limitMonthly('expenses'));

    for (const key of Object.keys(fields)) {
      const fld = fields[key];
      const v = String(shownOf(key));
      setProp(fld.range, 'value', v);
      if (fld.num && key !== skipKey) { setProp(fld.num, 'value', v); invalid[key] = false; }
    }
    freqRadios.forEach((r) => { r.checked = r.value === state.freq; });
    unitRadios.forEach((r) => { r.checked = r.value === state.unit; });
    setProp(el.rateToggle, 'checked', state.rateOn);
    setProp(el.rateGroup, 'hidden', !state.rateOn);
  }

  /* ===== Застосування значення поля =====
     mode: 'typing' — користувач друкує (поле не переписуємо, межі лише підказуємо);
           'commit' — завершення вводу, повзунок, чип (значення приводимо до меж). */
  function applyField(key, raw, mode) {
    if (!fields[key]) return;                                  // невідомий ключ (наприклад, хибний data-chip)
    const parsed = parseNumber(raw);
    const f = factor(key);
    const lim = limitMonthly(key);
    const lo = Math.round(lim.min * f);
    const hi = Math.round(lim.max * f);

    if (!parsed.ok && parsed.reason !== 'big') {               // порожньо / не число: стан не чіпаємо
      invalid[key] = true;
      setFieldError(key, parsed.reason === 'empty'
        ? 'Поле порожнє. Введіть число, наприклад 40000.'
        : 'Це не схоже на число. Використовуйте лише цифри, без пробілів і букв.');
      return;
    }

    let v = parsed.ok ? (isMoney(key) ? Math.round(parsed.value) : roundFor(key)(parsed.value)) : Infinity;
    v = v || 0;                                                // прибирає -0
    let problem = '';
    let target = v;
    if (v < 0) {
      problem = 'Значення не може бути від’ємним.';
      target = lo;
    } else if (v < lo) {
      problem = `Мінімальне значення — ${fmtVal(key, lo)}.`;
      target = lo;
    } else if (v > hi) {
      problem = key === 'expenses' ? 'Витрати не можуть бути більшими за дохід.' : `Максимальне значення — ${fmtVal(key, hi)}.`;
      if (!parsed.ok) problem = `Число завелике. ${problem}`;
      target = hi;
    }

    if (problem && mode === 'typing') {                        // під час набору лише підказуємо
      invalid[key] = true;
      setFieldError(key, problem);
      return;
    }

    let stored = isMoney(key) ? target / f : target;
    if (key === 'expenses' && target === hi) stored = state.income;   // без похибок ділення
    state[key] = stored;
    invalid[key] = false;
    setFieldError(key, problem ? `${problem} Ми підставили ${fmtVal(key, target)}.` : '');
    syncControls(mode === 'typing' ? key : null);
    render();
  }

  /* ===== Відображення ===== */
  function render() {
    const r = calculate(state);
    lastResult = r;
    actionMsg = '';
    const word = FREQ_WORD[state.freq];
    const unit = UNIT_WORD[state.unit];
    const f = state.unit === 'year' ? 12 : 1;
    const incomeShown = shownOf('income');
    const expensesShown = shownOf('expenses');

    setText(fields.income.out, `${fmtMoney(incomeShown)} ${unit}`);
    setText(fields.expenses.out, `${fmtMoney(expensesShown)} ${unit}`);
    setText(fields.percent.out, `${state.percent}%`);
    setText(fields.years.out, yearsText(state.years));
    setText(fields.rate.out, `${nf1.format(state.rate)}% річних`);
    setAttr(fields.income.range, 'aria-valuetext', `${fmt(incomeShown)} ${hryvnia(incomeShown)} ${unit}`);
    setAttr(fields.expenses.range, 'aria-valuetext', `${fmt(expensesShown)} ${hryvnia(expensesShown)} ${unit}`);
    setAttr(fields.percent.range, 'aria-valuetext', percentWord(state.percent));
    setAttr(fields.years.range, 'aria-valuetext', yearsText(state.years));
    setAttr(fields.rate.range, 'aria-valuetext', `${percentWord(state.rate)} річних`);

    setText(el.freeOut, `${fmtMoney(r.free * f)} ${unit}`);
    setText(el.percentMoney, fmtMoney2(r.monthly));
    setText(el.freqMoney, fmtMoney2(r.deposit));
    setText(el.freqWord, word);

    chips.forEach((chip) => {
      setAttr(chip, 'aria-pressed', String(state[chip.dataset.chip] === Number(chip.dataset.value)));
    });

    setText(el.total, fmtMoney(r.total));
    setText(el.totalNote, r.total > 0
      ? `${nf0.format(r.count)} ${plural(r.count, 'внесок', 'внески', 'внесків')} за ${yearsText(state.years)}, відкладаючи ${word}`
      : 'Поки що нічого не відкладається');
    setText(el.statContrib, fmtMoney(r.contributed));
    setText(el.statInterest, fmtMoney(r.interest));
    setText(el.statAmount, fmtMoney2(r.deposit));
    setText(el.statShare, `${nf1.format(r.share)}%`);
    setText(el.preview, r.total > 0
      ? `Поки що виходить: ${fmtMoney(r.total)} за ${yearsText(state.years)}`
      : 'Поки що нічого не відкладається');

    stepMsg = '';                                  // будь-яка зміна значення знімає підказку про блокування кроку
    refreshGlobalError();

    tableDirty = true;
    if (step === TOTAL_STEPS) renderTable(r);      // таблицю будуємо лише коли її видно
    series = { totals: r.totals, contribs: r.contribs, rateOn: state.rateOn };
    if (hoverIdx > r.totals.length - 1) hoverIdx = -1;
    updateReadout();
    setProp(el.legendContrib, 'hidden', !state.rateOn);
    setAttr(el.canvas, 'aria-label', r.total > 0
      ? `Графік: за ${yearsText(state.years)} накопичиться ${fmtMoney(r.total)}`
      : 'Графік порожній: накопичень немає');
    if (step === TOTAL_STEPS) scheduleChart();     // на прихованих кроках графік не малюємо
    updateCtaHref();
  }

  function renderTable(r) {
    tableDirty = false;
    const cols = state.rateOn ? 4 : 3;
    setProp(el.thInterest, 'hidden', !state.rateOn);
    const frag = document.createDocumentFragment();
    const addRow = (cells, muted, span) => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-line';
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.className = `p-3${i > 0 ? ' text-right' : ''}${muted ? ' text-muted' : ''}`;
        if (span) td.colSpan = span;
        td.textContent = text;
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    };
    if (r.total <= 0) {
      addRow(['Немає накопичень: перевірте дохід, витрати та відсоток заощадження.'], true, cols);
    } else {
      for (let y = 1; y <= state.years; y += 1) {
        const row = [String(y), fmtMoney(r.contribs[y])];
        if (state.rateOn) row.push(fmtMoney(r.totals[y] - r.contribs[y]));
        row.push(fmtMoney(r.totals[y]));
        addRow(row, false, 0);
      }
    }
    el.tableBody.replaceChildren(frag);
  }

  /* ===== Графік (canvas, без бібліотек) ===== */
  const DEFAULT_READOUT = 'Наведіть курсор або проведіть пальцем по графіку, щоб побачити суму за рік.';

  /* Розміри читаємо лише тут (у колбеку ResizeObserver або при вході на крок 6),
     а не в кожному кадрі малювання: так немає примусового layout. */
  function measure() {
    box = { w: el.chartBox.clientWidth, h: el.chartBox.clientHeight };
  }

  /* Кольори й шрифт читаємо один раз і скидаємо кеш при зміні теми */
  function getPalette() {
    if (palette) return palette;
    const cs = getComputedStyle(document.documentElement);
    const read = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    palette = {
      action: read('--color-action', '#007A52'),
      ink: read('--color-ink-blue', '#3C5979'),
      muted: read('--color-muted', '#55637A'),
      grid: read('--color-line', '#DCE5EB'),
      font: `12px ${getComputedStyle(document.body).fontFamily}`,
    };
    return palette;
  }

  function scheduleChart() {
    if (chartRaf) return;
    chartRaf = window.requestAnimationFrame(() => { chartRaf = 0; drawChart(); });
  }

  function invalidatePalette() {
    palette = null;
    if (step === TOTAL_STEPS) scheduleChart();
  }

  function updateReadout() {
    if (hoverIdx < 0 || !Number.isFinite(series.totals[hoverIdx]) || !Number.isFinite(series.contribs[hoverIdx])) {
      setText(el.readout, DEFAULT_READOUT);
      return;
    }
    const t = series.totals[hoverIdx];
    const c = series.contribs[hoverIdx];
    let text = hoverIdx === 0 ? 'На старті: 0 ₴' : `Через ${yearsText(hoverIdx)}: ${fmtMoney(t)}`;
    if (hoverIdx > 0 && series.rateOn) text += ` (внески ${fmtMoney(c)}, відсотки ${fmtMoney(t - c)})`;
    setText(el.readout, text);
  }

  function drawChart() {
    const { totals, contribs, rateOn } = series;
    const { w, h } = box;
    if (!w || !h) return;                                     // крок прихований
    if (!ctx2d) ctx2d = el.canvas.getContext('2d');
    const ctx = ctx2d;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (lastCanvas.w !== w || lastCanvas.h !== h || lastCanvas.dpr !== dpr) {   // перевиділяємо буфер лише при зміні розміру
      el.canvas.width = Math.round(w * dpr);
      el.canvas.height = Math.round(h * dpr);
      lastCanvas = { w, h, dpr };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    geom = null;

    const { action, ink, muted, grid, font } = getPalette();
    ctx.font = font;

    const maxVal = totals[totals.length - 1];
    if (!(maxVal > 0) || totals.length < 2) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Немає накопичень для відображення', w / 2, h / 2);
      return;
    }

    const yMax = niceTop(maxVal);
    const yLabels = [0, 1, 2, 3, 4].map((i) => nfCompact.format((yMax * i) / 4));
    const padL = Math.ceil(Math.max(...yLabels.map((l) => ctx.measureText(l).width))) + 14;
    const padR = 14; const padT = 14; const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    if (plotW <= 0 || plotH <= 0) return;

    const n = totals.length - 1;
    const x = (i) => padL + (plotW * i) / n;
    const y = (v) => padT + plotH * (1 - v / yMax);
    geom = { padL, plotW, n };

    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const gy = Math.round(y((yMax * i) / 4)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
      ctx.fillText(yLabels[i], padL - 8, gy);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepX = Math.ceil(n / Math.max(1, Math.floor(plotW / 44)));
    for (let i = 0; i <= n; i += stepX) ctx.fillText(String(i), x(i), padT + plotH + 8);

    const line = (data) => {
      ctx.beginPath();
      ctx.moveTo(x(0), y(data[0]));
      for (let i = 1; i <= n; i += 1) ctx.lineTo(x(i), y(data[i]));
    };

    line(totals);
    ctx.lineTo(x(n), padT + plotH);
    ctx.lineTo(x(0), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = action;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (rateOn) {                                                // пунктир: лише власні внески
      line(contribs);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    line(totals);
    ctx.strokeStyle = action;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const dot = (i, color) => {
      ctx.beginPath();
      ctx.arc(x(i), y(totals[i]), 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    if (hoverIdx >= 0) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x(hoverIdx)) + 0.5, padT);
      ctx.lineTo(Math.round(x(hoverIdx)) + 0.5, padT + plotH);
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.stroke();
      dot(hoverIdx, action);
      ctx.beginPath();
      ctx.arc(x(hoverIdx), y(totals[hoverIdx]), 8, 0, Math.PI * 2);
      ctx.strokeStyle = action;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      dot(n, action);
    }
  }

  function onHover(e) {
    if (!geom) return;
    /* offsetX вже відносно canvas: getBoundingClientRect не потрібен */
    const raw = ((e.offsetX - geom.padL) / geom.plotW) * geom.n;
    const i = Math.min(geom.n, Math.max(0, Math.round(raw)));
    if (i === hoverIdx) return;
    hoverIdx = i;
    updateReadout();
    scheduleChart();
  }
  function onLeave(e) {
    if (e.pointerType === 'touch') return;                     // на дотиковому екрані лишаємо останню точку
    hoverIdx = -1;
    updateReadout();
    scheduleChart();
  }
  el.canvas.addEventListener('pointermove', onHover, { signal });
  el.canvas.addEventListener('pointerdown', onHover, { signal });
  el.canvas.addEventListener('pointerleave', onLeave, { signal });
  el.canvas.addEventListener('pointercancel', onLeave, { signal });

  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => { measure(); scheduleChart(); });   // у колбеку читання розмірів не викликає зайвого layout
    ro.observe(el.chartBox);
  } else {
    window.addEventListener('resize', () => { measure(); scheduleChart(); }, { signal });
  }

  /* Зміна теми: скидаємо кеш кольорів */
  const colorScheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (colorScheme && colorScheme.addEventListener) colorScheme.addEventListener('change', invalidatePalette, { signal });
  if ('MutationObserver' in window) {
    mo = new MutationObserver(invalidatePalette);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }

  /* ===== Вкладки-кроки: наступна відкривається після завершення попередньої ===== */
  const rawOf = (num) => (num.validity && num.validity.badInput ? 'NaN' : num.value);

  function fieldsValid(keys) {
    return keys.every((key) => {
      const num = fields[key].num;
      if (!num) return true;                                  // повзунок завжди коректний
      return !invalid[key] && !(num.validity && num.validity.badInput) && num.value.trim() !== '';
    });
  }

  /* Підтверджує введені значення кроку (приводить до меж) перед перевіркою або переходом. */
  function commitStep(n) {
    (STEP_FIELDS[n] || []).forEach((key) => {
      const num = fields[key].num;
      if (num) applyField(key, rawOf(num), 'commit');
    });
  }

  /* Повертає причину, чому не можна залишити крок, або '' якщо можна. */
  function blockReason(n) {
    if (!fieldsValid(STEP_FIELDS[n] || [])) return 'Введіть коректне число, щоб продовжити.';
    if (n === 2 && state.expenses >= state.income) return 'Витрати мають бути меншими за дохід, інакше відкладати нічого.';
    if (n === 3 && state.percent <= 0) return 'Оберіть відсоток більше 0, щоб продовжити.';
    return '';
  }

  function goTo(n, opts) {
    const o = opts || {};
    step = Math.min(Math.max(n, 1), TOTAL_STEPS);
    maxStep = Math.max(maxStep, step);
    panels.forEach((p, i) => { p.hidden = i + 1 !== step; });
    tabs.forEach((t, i) => {
      const on = i + 1 === step;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.disabled = i + 1 > maxStep;
      t.toggleAttribute('data-done', i + 1 < maxStep);
    });
    form.hidden = step === TOTAL_STEPS;
    el.back.hidden = step === 1;
    el.next.hidden = step === TOTAL_STEPS;
    el.preview.hidden = step === TOTAL_STEPS;
    setText(el.nextLabel, step === TOTAL_STEPS - 1 ? 'Показати результат' : 'Далі');
    stepMsg = '';
    actionMsg = '';                                           // стара помилка дії не висить на іншому кроці
    Object.keys(fields).forEach((key) => { if (!invalid[key]) fieldMsgs[key] = ''; });   // застарілі підказки «Ми підставили…» не повертаються
    if (step === TOTAL_STEPS && lastResult && tableDirty) renderTable(lastResult);       // таблиця лише якщо дані змінились
    refreshGlobalError();
    if (o.focusPanel) {
      panels[step - 1].focus({ preventScroll: true });
      el.wizard.scrollIntoView({ block: 'nearest' });
    }
    if (step === TOTAL_STEPS) { measure(); scheduleChart(); } // графік не малюється в прихованій панелі
  }

  /* Перехід на крок k: усі кроки між поточним і k мають бути заповнені коректно. */
  function requestStep(k, opts) {
    if (k > maxStep) return;
    if (k < step) commitStep(step);                           // повертаючись, не лишаємо в полі сміття
    for (let s = step; s < k; s += 1) {
      commitStep(s);
      const reason = blockReason(s);
      if (reason) {
        goTo(s, opts);
        stepMsg = reason;
        refreshGlobalError();
        focusField(STEP_FIELD[s]);
        return;
      }
    }
    goTo(k, opts);
  }

  function tryNext() {
    if (step >= TOTAL_STEPS) return;
    const now = Date.now();
    if (now < navLock) return;                                // подвійний клік не пропускає крок
    commitStep(step);
    const reason = blockReason(step);
    if (reason) {
      stepMsg = reason;
      refreshGlobalError();
      focusField(STEP_FIELD[step]);
      return;
    }
    navLock = now + NAV_LOCK_MS;
    maxStep = Math.max(maxStep, step + 1);
    goTo(step + 1, { focusPanel: true });
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => requestStep(i + 1, {}), { signal }));
  el.next.addEventListener('click', tryNext, { signal });
  el.back.addEventListener('click', () => requestStep(step - 1, { focusPanel: true }), { signal });

  el.tablist.addEventListener('keydown', (e) => {
    const open = tabs.filter((t) => !t.disabled);
    const cur = open.indexOf(document.activeElement);
    if (cur < 0) return;
    let next = cur;
    if (e.key === 'ArrowRight') next = (cur + 1) % open.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + open.length) % open.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = open.length - 1;
    else return;
    e.preventDefault();
    open[next].focus();
    open[next].click();
  }, { signal });

  /* ===== Події полів форми ===== */
  elementMap.forEach(([key, isNum], node) => {
    node.addEventListener('input', () => {
      applyField(key, isNum ? rawOf(node) : node.value, isNum ? 'typing' : 'commit');
    }, { signal });
    if (isNum) {
      node.addEventListener('blur', () => applyField(key, rawOf(node), 'commit'), { signal });
    }
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.chip;
      if (CHIP_KEYS.includes(key)) applyField(key, chip.dataset.value, 'commit');
    }, { signal });
  });

  freqRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (PERIODS[radio.value]) { state.freq = radio.value; render(); }
    }, { signal });
  });

  unitRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      state.unit = radio.value === 'year' ? 'year' : 'month';
      syncControls();
      render();
    }, { signal });
  });

  el.rateToggle.addEventListener('change', () => {
    state.rateOn = el.rateToggle.checked;
    setProp(el.rateGroup, 'hidden', !state.rateOn);
    render();
  }, { signal });

  /* ===== Дії: збереження, поширення, скидання ===== */
  el.save.addEventListener('click', () => {
    try {
      const data = {};
      SAVED_KEYS.forEach((k) => { data[k] = state[k]; });
      localStorage.setItem(storageKey, JSON.stringify(data));
      setStatus('Налаштування успішно збережено!');
    } catch (_) {
      actionMsg = 'Не вдалося зберегти налаштування у пам’ять браузера.';
      refreshGlobalError();
    }
  }, { signal });

  el.share.addEventListener('click', async () => {
    if (sharing) return;
    sharing = true;
    const params = getUrlParams();
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}#signup`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Мій план заощаджень', url: shareUrl });
        setStatus('Посилання успішно відправлено!');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setStatus('Посилання скопійовано в буфер обміну!');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        actionMsg = 'Не вдалося поширити посилання.';
        refreshGlobalError();
      }
    } finally {
      sharing = false;
    }
  }, { signal });

  el.reset.addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    maxStep = 1;
    Object.keys(fields).forEach((key) => { invalid[key] = false; fieldMsgs[key] = ''; });
    syncControls();
    goTo(1, { focusPanel: true });
    render();                                                 // оновлюємо результати відповідно до скинутих значень
    setStatus('Налаштування скинуто.');
  }, { signal });

  /* ===== Ініціалізація з URL та LocalStorage ===== */
  const urlParams = new URLSearchParams(window.location.search);
  let initial = {};

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) initial = JSON.parse(saved);
  } catch (_) { /* пропускаємо */ }

  Object.entries(URL_MAP).forEach(([param, stateKey]) => {
    const val = urlParams.get(P(param));
    if (val !== null) initial[stateKey] = val;
  });

  Object.assign(state, sanitize(initial));
  syncControls();
  goTo(1);
  render();

  /* Публічний API екземпляра */
  const api = {
    destroy() {
      ac.abort();
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      window.cancelAnimationFrame(chartRaf);
      chartRaf = 0;
      window.clearTimeout(statusTimer);
      instances.delete(root);
    }
  };
  instances.set(root, api);
  return api;
}

/* Автоініціалізація всіх симуляторів на сторінці */
document.querySelectorAll('[data-savings-sim]').forEach((root) => {
  createSavingsSim(root);
});

})();