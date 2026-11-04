// UI only: state, screens and rendering. All numbers come from model.js / result.js.
import { t, STRINGS } from './i18n.js';
import { CITIES } from './cities.js';
import { ASSUMPTIONS, SOURCES, DIY_PRESETS, cfmToM3h } from './model.js';
import { buildResult } from './result.js';
import { omUrl, toHourly } from './openmeteo.js';

const $ = (s) => document.querySelector(s);
const STEPS = ['place', 'room', 'windows', 'purifier', 'who', 'result'];
const state = { lang: navigator.language?.startsWith('hi') ? 'hi' : 'en', step: 0, place: null };
const L = (k, v) => t(state.lang, k, v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Anonymous counter: event name and language only (plus two readings for feedback).
function track(event, extra = {}) {
  try { navigator.sendBeacon?.('/api/event', JSON.stringify({ event, lang: state.lang, ...extra })); } catch { /* offline */ }
}

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = L(el.dataset.t); });
  document.querySelectorAll('[data-ph]').forEach((el) => { el.placeholder = L(el.dataset.ph); });
  $('#lang').textContent = L('lang_other');
  $('#lang').lang = state.lang === 'en' ? 'hi' : 'en';
  $('#few-note').textContent = L('win_few_note', { open: ASSUMPTIONS.fewTimes.openHours, closed: ASSUMPTIONS.fewTimes.closedHours });
  $('#diy-list').innerHTML = DIY_PRESETS.map((d, i) => `<label class="opt"><input type="radio" name="diy" value="${d.key}"${i === 4 ? ' checked' : ''}>
    <span>${esc(L(`diy_${d.key}`))}<small>${esc(L('diy_cadr', { cfm: d.cfm, pm: d.pm }))}</small></span></label>`).join('');
  renderCities();
  renderHow();
  show();
  if (STEPS[state.step] === 'result' && state.forecast) renderResult();
}

function renderCities() {
  const q = $('#city-q').value.trim().toLowerCase();
  const list = q ? CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)) : CITIES.slice(0, 8);
  $('#place-msg').textContent = q && !list.length ? L('place_none') : '';
  $('#cities').innerHTML = list.slice(0, 8).map((c) => `<li><button type="button" class="city${state.place?.id === c.id ? ' on' : ''}" data-id="${c.id}">
    ${esc(c.name)} <small>${esc(c.state)}</small></button></li>`).join('');
}

function renderHow() {
  const A = ASSUMPTIONS;
  const src = (k) => `<a href="${SOURCES[k].url}">${esc(SOURCES[k].name)}</a>`;
  const rows = [
    [L('how_P', A.P), src(A.P.source)],
    [L('how_k', A.k), `${src('xiang')}; ${src('cao')}`],
    [L('how_aClosed', A.aClosed), `${src('xiang')}; ${src('liao')}`],
    [L('how_aOpen', A.aOpen), `${src('liao')}; ${src('xiang')}`],
    [L('how_few', { open: A.fewTimes.openHours, closed: A.fewTimes.closedHours }), ''],
  ];
  $('#how-body').innerHTML = `<p class="eq">${esc(L('how_eq'))}</p><p>${esc(L('how_terms'))}</p><p>${esc(L('how_low_high'))}</p>
    <ul>${rows.map(([a, s]) => `<li>${esc(a)}${s ? `<br><small>${s}</small>` : ''}</li>`).join('')}</ul>
    <p>${esc(L('how_liao'))}</p><p>${esc(L('how_not'))}</p>
    <p>${esc(L('how_burden', { deaths: 1.67, pct: 17.8, amb: 0.98, hh: 0.61, oz: 0.17 }))} <small>${src('lancet')}</small></p>
    <h3>${esc(L('how_sources'))}</h3><ul class="src">${Object.keys(SOURCES).map((k) => `<li>${src(k)}</li>`).join('')}</ul>`;
}

function show() {
  const name = STEPS[state.step];
  document.querySelectorAll('.step').forEach((s) => { s.hidden = s.dataset.step !== name; });
  $('#progress').textContent = name === 'result' ? '' : L('step', { n: state.step + 1, total: STEPS.length - 1 });
  $('#back').hidden = state.step === 0;
  $('#back').textContent = name === 'result' ? L('again') : L('back');
  $('#next').hidden = name === 'result';
  $('#next').textContent = name === 'who' ? L('make_plan') : L('next');
  $('#next').disabled = name === 'place' && !state.place;
  const pur = document.querySelector('input[name=pur]:checked').value;
  $('#pur-commercial').hidden = pur !== 'commercial';
  $('#pur-diy').hidden = pur !== 'diy';
}

function go(i) { state.step = i; show(); window.scrollTo(0, 0); document.querySelector(`[data-step=${STEPS[i]}] h1`)?.focus?.(); }

function readRoom() {
  const v = ['#len', '#wid', '#hei'].map((s) => Number($(s).value));
  const unit = document.querySelector('input[name=unit]:checked').value;
  if (!v.every((x) => Number.isFinite(x) && x > 0)) return null;
  return { length: v[0], width: v[1], height: v[2], unit };
}

function readPurifier() {
  const type = document.querySelector('input[name=pur]:checked').value;
  if (type === 'commercial') {
    const x = Number($('#cadr').value);
    if (!(Number.isFinite(x) && x > 0)) return null;
    return { type, cadrM3h: $('#cadr-unit').value === 'cfm' ? cfmToM3h(x) : x };
  }
  if (type === 'diy') return { type, diy: document.querySelector('input[name=diy]:checked').value };
  return { type };
}

function validate(name) {
  if (name === 'room') {
    const ok = !!readRoom();
    $('#room-msg').textContent = ok ? '' : L('room_bad');
    return ok;
  }
  if (name === 'purifier') {
    const ok = !!readPurifier();
    $('#pur-msg').textContent = ok ? '' : L('pur_cadr_bad');
    return ok;
  }
  return true;
}

async function getForecast(place) {
  const q = place.id ? `city=${place.id}` : `lat=${place.lat}&lon=${place.lon}`;
  try {
    const r = await fetch(`/api/forecast?${q}`, { signal: AbortSignal.timeout(12000) });
    if (r.ok) return (await r.json()).hourly;
  } catch { /* fall through to Open-Meteo directly */ }
  // shortcut: direct browser call when the Worker is absent (static server); same API and terms.
  const r = await fetch(omUrl([place]), { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('forecast');
  return toHourly(await r.json());
}

async function makePlan() {
  go(STEPS.indexOf('result'));
  $('#result').innerHTML = `<p class="loading">${esc(L('loading'))}</p>`;
  try {
    state.forecast = await getForecast(state.place);
    state.forecastAt = new Date();
    renderResult();
    track('plan');
  } catch {
    $('#result').innerHTML = `<p class="msg">${esc(L('forecast_fail'))}</p><button type="button" class="primary" id="retry">${esc(L('retry'))}</button>`;
    $('#retry').onclick = makePlan;
  }
}

function renderResult() {
  const r = buildResult({
    lang: state.lang,
    placeName: state.place.id ? state.place.name : L('place_mine'),
    hourly: state.forecast,
    now: new Date(),
    room: readRoom(),
    windows: document.querySelector('input[name=windows]:checked').value,
    purifier: readPurifier(),
    who: [...document.querySelectorAll('input[name=who]:checked')].map((x) => x.value),
    url: `${location.origin}/`,
  });
  const lines = (b) => b.lines.map((l) => `<p class="ln ${l.kind}">${esc(l.text)}</p>`).join('');
  const html = r.blocks.map((b) => {
    if (b.id === 'indoor') {
      return `<section class="card indoor"><h2>${esc(b.title)}</h2><p class="hint">${esc(b.note)}</p>
        <table><thead><tr><th></th><th>${esc(L('col_now'))}</th><th>${esc(L('col_24'))}</th></tr></thead><tbody>
        ${b.rows.map((row) => `<tr><th scope="row">${esc(row.label)}</th><td>${esc(row.now)}</td><td>${esc(row.day)}</td></tr>`).join('')}
        </tbody></table></section>`;
    }
    return `<section class="card ${b.id}${b.cat ? ` cat-${b.cat}` : ''}">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${lines(b)}</section>`;
  }).join('');
  $('#result').innerHTML = `<h1>${esc(r.title)}</h1>${html}
    <div class="row"><a class="primary wa" id="share" href="https://wa.me/?text=${encodeURIComponent(r.shareText)}" target="_blank" rel="noopener">${esc(L('share'))}</a></div>
    <section class="card fb"><h2>${esc(L('fb_title'))}</h2><p class="hint">${esc(L('fb_note'))}</p>
      <form id="fb" class="fb-row" novalidate>
        <label class="field"><span>${esc(L('fb_before'))}</span><input name="before" type="number" inputmode="decimal" min="0" max="2000"></label>
        <label class="field"><span>${esc(L('fb_after'))}</span><input name="after" type="number" inputmode="decimal" min="0" max="2000"></label>
        <button class="primary" type="submit">${esc(L('fb_send'))}</button>
      </form><p class="msg" id="fb-msg" role="status"></p></section>`;
  $('#share').onclick = () => track('share');
  $('#fb').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const [before, after] = ['before', 'after'].map((k) => (f.get(k) === '' ? NaN : Number(f.get(k))));
    if (![before, after].every((x) => Number.isFinite(x) && x >= 0 && x <= 2000)) { $('#fb-msg').textContent = L('fb_bad'); return; }
    track('feedback', { before, after });
    e.target.hidden = true;
    $('#fb-msg').textContent = L('fb_thanks');
  };
}

// Events
$('#lang').onclick = () => { state.lang = state.lang === 'en' ? 'hi' : 'en'; applyLang(); };
$('#city-q').oninput = renderCities;
$('#cities').onclick = (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  state.place = CITIES.find((c) => c.id === b.dataset.id);
  renderCities();
  go(1);
};
$('#locate').onclick = () => {
  $('#place-msg').textContent = L('place_locating');
  navigator.geolocation?.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    // Within ~25 km of a listed city: use its cached forecast; otherwise ask Open-Meteo for this spot.
    const near = CITIES.map((c) => ({ c, d: Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos((lat * Math.PI) / 180)) }))
      .sort((a, b) => a.d - b.d)[0];
    state.place = near.d < 0.23 ? near.c : { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
    $('#place-msg').textContent = '';
    go(1);
  }, () => { $('#place-msg').textContent = L('place_locate_fail'); }, { timeout: 15000, maximumAge: 600000 });
  if (!navigator.geolocation) $('#place-msg').textContent = L('place_locate_fail');
};
$('#presets').onclick = (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const [l, w, h] = b.dataset.preset.split(',');
  document.querySelector('input[name=unit][value=ft]').checked = true;
  [['#len', l], ['#wid', w], ['#hei', h]].forEach(([s, v]) => { $(s).value = v; });
  $('#room-msg').textContent = '';
};
document.querySelectorAll('input[name=pur]').forEach((r) => { r.onchange = () => { $('#pur-msg').textContent = ''; show(); }; });
$('#next').onclick = () => {
  const name = STEPS[state.step];
  if (!validate(name)) return;
  if (name === 'who') makePlan(); else go(state.step + 1);
};
$('#back').onclick = () => go(STEPS[state.step] === 'result' ? 1 : state.step - 1);

if (!STRINGS[state.lang]) state.lang = 'en';
applyLang();
