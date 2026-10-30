// Версия для GitHub Pages: прямое подключение к Google Таблице (Apps Script)
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzh_-ZDcAslrWnHDIEdbJqjAjFhG0qTfqK4li9FeGaaKBRCl_nbxyUHMcwxZ7Z8CGnj/exec';
/* Каталог выкрасов Derufa — PWA, все данные хранятся локально в браузере (localStorage). */
(function () {
'use strict';

const STORAGE_KEY = 'vykrasy-db-v1';
const ME_KEY = 'vykrasy-me';

/* ---------------- Цветовые семейства ---------------- */
const FAMILIES = [
  { id: 'white',  name: 'Белые',        color: '#f7f5ee', re: /бел|молоч|слив|слонов|жемчуж|алебастр|папирус/ },
  { id: 'beige',  name: 'Бежевые',      color: '#dcc7a6', re: /беж|песоч|капучин|латте|кофе|какао|тауп|кремов|телесн/ },
  { id: 'brown',  name: 'Коричневые',   color: '#7a5236', re: /коричн|шоколад|мокко|кофейн|землист/ },
  { id: 'gray',   name: 'Серые',        color: '#9aa0a3', re: /сер(?!д)|графит|антрацит|пепельн|сланц|гранит|стальн|дымчат|тауп/ },
  { id: 'black',  name: 'Чёрные',       color: '#222628', re: /черн/ },
  { id: 'yellow', name: 'Жёлтые',       color: '#ecc94b', re: /желт|охр|горчич|ванил|соломен/ },
  { id: 'orange', name: 'Оранжевые',    color: '#ed8936', re: /оранж|мандарин|персик|рыж/ },
  { id: 'terra',  name: 'Терракота',    color: '#b5573b', re: /терракот|кирпич/ },
  { id: 'red',    name: 'Красные',      color: '#c53030', re: /красн|алый|бордов|рубин|винн|брусни|ягодн/ },
  { id: 'pink',   name: 'Розовые',      color: '#ec9fb4', re: /розов|пудров|роза|коралл|коррал|малин/ },
  { id: 'violet', name: 'Сиреневые',    color: '#9f7aea', re: /сирен|лаванд|лилов|фиолет|баклажан/ },
  { id: 'lblue',  name: 'Голубые',      color: '#90cdf4', re: /голуб|небесн|льдист/ },
  { id: 'blue',   name: 'Синие',        color: '#2b5ea8', re: /(^|[^а-я])син|индиго|кобальт|лазур|василь|джинс|океан/ },
  { id: 'teal',   name: 'Бирюзовые',    color: '#38b2ac', re: /бирюз|тиффани|аквамарин|морск|ментол|мят/ },
  { id: 'green',  name: 'Зелёные',      color: '#48a160', re: /зелен|шалфе|олив|мох|мшист|хаки|фисташ|мят|ментол|салат|хвойн|горошек|травян/ },
];
const FAM_BY_ID = Object.fromEntries(FAMILIES.map(f => [f.id, f]));

function familiesOf(color) {
  const c = String(color || '').toLowerCase().replace(/ё/g, 'е');
  return FAMILIES.filter(f => f.re.test(c)).map(f => f.id);
}

/* ---------------- Настоящий цвет DRF (палитра из цветовой стены, derufa-palette.js) ---------------- */
// Цвет берётся только у веера DRF: четыре цифры бывают и у RAL, SW, NCS.
function drfBase(number) {
  const m = String(number || '').match(/^\s*(?:DRF\s*)?(\d{3,5})(?!\d)/i);
  return m && (window.DERUFA_PALETTE || {})[m[1]] ? m[1] : null;
}
function drfInfo(fan, number) {
  if (norm(fan) !== 'drf') return null;
  const base = drfBase(number); if (!base) return null;
  // «1171 -30%», «1841 -50% Q-Base» → показываем базовый цвет и честно об этом пишем
  const mod = String(number).replace(/^\s*(?:DRF\s*)?\d+\s*/i, '').trim();
  return { base, hex: window.DERUFA_PALETTE[base], mod };
}
function hexToLab(hex) {
  const v = parseInt(hex.slice(1), 16);
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(v >> 16 & 255), g = lin(v >> 8 & 255), b = lin(v & 255);
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
// Ближайшие по цвету листы DRF в каталоге. Тот же номер в других красках не берём — он показан отдельно.
function nearestSheets(hex, n = 6, skipBase = null) {
  const lab = hexToLab(hex);
  return db.swatches.map(s => ({ s, d: drfInfo(s.fan, s.number) }))
    .filter(x => x.d && x.d.base !== skipBase)
    .map(x => ({ ...x, de: deltaE(lab, hexToLab(x.d.hex)) }))
    .sort((a, b) => a.de - b.de || frank(a.s.folder) - frank(b.s.folder) || cmpPos(a.s.pos, b.s.pos)).slice(0, n);
}
function closeness(de) { return de < 3 ? 'почти такой же' : de < 8 ? 'близкий' : 'похожий'; }
function chipc(hex, title = '', cls = '') { return `<span class="chipc ${cls}" style="background:${hex}"${title ? ` title="${esc(title)}"` : ''}></span>`; }
function colorMark(s) {
  const d = drfInfo(s.fan, s.number);
  return d ? chipc(d.hex, `DRF ${d.base} · ${d.hex.toUpperCase()}${d.mod ? ' · базовый цвет' : ''}`) : famDots(s);
}
function nearList(near) {
  return `<ul class="history">${near.map(x => `<li><a href="#" data-goto="${x.s.id}" class="row" style="gap:8px;flex-wrap:nowrap">${chipc(x.d.hex)}<span>${esc(x.s.paint)} · DRF ${esc(x.s.number)} <span class="muted">· ${esc(x.s.color)}</span></span></a><span class="small muted">${closeness(x.de)} · папка ${fl(x.s.folder)}, №${esc(x.s.pos)} · ${availability(x.s).free > 0 ? 'в наличии' : 'выдан'}</span></li>`).join('')}</ul>`;
}

/* ---------------- Утилиты ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y.slice(2)}`;
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
// Приведение похожих кириллических/латинских букв к одному виду для сравнения
const HOMO = { 'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'т': 't', 'х': 'x', 'у': 'y', 'ё': 'e' };
function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[авсекмнортхуё]/g, ch => HOMO[ch] || ch).replace(/["«»\s]+/g, '');
}
// Нормализация кода (номера выкраса) для поиска: регистр, гомоглифы, префикс S у NCS, пробелы, дефисы
function codeNorm(s) {
  let x = String(s == null ? '' : s).toUpperCase().replace(/Ё/g, 'Е');
  x = x.replace(/[АВСЕКМНОРТХУ]/g, ch => ({ 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y' }[ch]));
  x = x.replace(/^NCS\s*/, '').replace(/^S\s*(?=\d)/, '').replace(/№/g, '');
  return x.replace(/[\s\-–—"]+/g, '');
}
function codeTokens(number) {
  // "1502-Y50R -50%" -> ["1502Y50R","50%"]; "скан 1002-Y" -> ["СКАН","1002Y"]; "S2060-R" -> ["2060R"]
  return String(number || '').split(/[\s,()]+/).filter(Boolean).map(codeNorm).filter(Boolean);
}
function posNum(p) { const m = String(p).match(/^(\d+)(.*)$/); return m ? [parseInt(m[1], 10), m[2]] : [99999, String(p)]; }
function cmpPos(a, b) { const x = posNum(a), y = posNum(b); return x[0] - y[0] || x[1].localeCompare(y[1]); }
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

// Разбор даты из строки «Где искать»: "сп.136 от 09.04.26", "8/16/2020", "May-23"
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function refDate(ref) {
  const s = String(ref || '');
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/g);
  if (m) {
    const last = m[m.length - 1].split('.');
    let y = parseInt(last[2], 10); if (y < 100) y += 2000;
    return `${y}-${String(last[1]).padStart(2, '0')}-${String(last[0]).padStart(2, '0')}`;
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/([A-Za-z]{3})-(\d{2})/);
  if (m && MONTHS[m[1].toLowerCase()]) return `20${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-01`;
  return null;
}

/* ---------------- Данные ---------------- */
const DEFAULT_SETTINGS = {
  capacity: 80,
  loanDays: 14,
  managers: ['Администратор', 'Менеджер 1', 'Менеджер 2', 'Менеджер 3', 'Менеджер 4', 'Менеджер 5'],
  paintOrder: ['Инт 7А', 'Инт 7ВА', 'Инт 7С', 'Инт 20А', 'Инт 20С', 'Инт 3', 'Evolution A', 'Evolution C', 'Expo A', 'Expo C',
    'Fassaden Farbe A', 'Fassaden Farbe C', 'Fassaden Farbe', 'Latexmatt', 'Mattlatex A', 'Mattlatex C',
    'Supracryl п/м', 'Supracryl мат.А', 'Supracryl мат.С', 'Supracryl'],
  fanOrder: ['Чистый', 'NCS', 'DRF', 'DUL', 'FL', 'LG', 'RAL', 'SW', 'TIK', 'Лучшие', 'LAB', 'скан'],
};
let db = null;

function seedDb() {
  const seed = window.SEED_DATA || { folders: [], swatches: [] };
  const now = new Date().toISOString();
  return {
    version: 1,
    folders: seed.folders.map(f => ({ ...f })),
    swatches: seed.swatches.map(s => ({ ...s, refs: [...(s.refs || [])], madeBy: '', madeDate: '', note: '', created: now })),
    loans: [],
    log: [{ id: uid(), t: now, who: 'система', action: 'init', text: `Загружен исходный каталог: ${seed.swatches.length} выкрасов, ${seed.folders.length} папок` }],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}
const ADMIN_NAME = 'Администратор';
let remoteStamp = '';
let pushing = false;
let pullTimer = null;

function canEdit() { return me() === ADMIN_NAME; }
function guardEdit() {
  if (canEdit()) return true;
  toast('Только просмотр. Изменения делает администратор.');
  return false;
}
function normalizeDb(raw) {
  const next = raw && typeof raw === 'object' ? raw : {};
  next.folders = next.folders || [];
  next.swatches = next.swatches || [];
  next.loans = next.loans || [];
  next.log = next.log || [];
  next.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), next.settings || {});
  if (JSON.stringify(next.settings.fanOrder) === JSON.stringify(['Чистый', 'NCS', 'DRF', 'DUL', 'FL', 'LG', 'RAL', 'SW', 'TIK', 'LAB', 'Лучшие', 'скан'])) next.settings.fanOrder = [...DEFAULT_SETTINGS.fanOrder];
  if (!next.settings.managers.includes(ADMIN_NAME)) next.settings.managers.unshift(ADMIN_NAME);
  return next;
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { db = normalizeDb(JSON.parse(raw)); return; }
  } catch (e) { console.error(e); }
  db = seedDb();
}
function rememberLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* копия не обязательна */ }
}
function save() {
  if (!db || !canEdit()) return;
  rememberLocal();
  updateBadge();
  clearTimeout(save._t);
  save._t = setTimeout(pushDb, 300);
}
async function pushDb() {
  if (!db || !canEdit() || pushing) return;
  pushing = true;
  const sent = JSON.stringify(db);
  try {
    const response = await fetch(SHEETS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ op: 'replace', db }) });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || 'таблица не записала');
    remoteStamp = sent;
  } catch (e) {
    toast('Не записалось в Google Таблицу: ' + e.message);
  } finally {
    pushing = false;
  }
}
async function pullDb() {
  const response = await fetch(SHEETS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('нет связи с таблицей');
  return normalizeDb(await response.json());
}
function applyRemote(next) {
  db = next;
  remoteStamp = JSON.stringify(db);
  rememberLocal();
  updateBadge();
  fillMe();
  if ($('#modal').hidden) render();
}
function me() { return localStorage.getItem(ME_KEY) || ''; }
function logEvt(action, text, swatchId) {
  db.log.unshift({ id: uid(), t: new Date().toISOString(), who: me() || '—', action, text, swatchId: swatchId || null });
  if (db.log.length > 5000) db.log.length = 5000;
}

const folderByNo = no => db.folders.find(f => f.no === Number(no));
const folderName = no => (folderByNo(no) || {}).name || '';
/* ---- Части разделённой папки: «10/1», «10/2»…
   Внутренний номер папки (f.no) остаётся числом, вся логика работает по нему.
   У частей есть f.group (исходный номер, 10) и f.part (1, 2, …) — это только подпись.
   Новые части получают внутренние номера от 1001, чтобы не путаться с обычными папками. */
const PART_BASE = 1000;
function fl(no) { const f = folderByNo(no); return f && f.group ? `${f.group}/${f.part}` : String(no); }
function flPad(no) { const f = folderByNo(no); return f && f.group ? `${String(f.group).padStart(2, '0')}/${f.part}` : String(no).padStart(2, '0'); }
function frank(no) { const f = folderByNo(no); return f && f.group ? f.group * 1000 + f.part : Number(no) * 1000; }
function foldersSorted() { return [...db.folders].sort((a, b) => frank(a.no) - frank(b.no)); }
function groupParts(no) { const f = folderByNo(no); if (!f) return []; if (!f.group) return [f]; return db.folders.filter(x => x.group === f.group).sort((a, b) => a.part - b.part); }
function folderByLabel(v) {
  const t = String(v == null ? '' : v).replace(/\s+/g, '');
  const m = t.match(/^(\d+)\/(\d+)$/);
  if (m) { const f = db.folders.find(x => x.group === +m[1] && x.part === +m[2]); return f ? f.no : null; }
  const n = parseInt(t, 10); return n && folderByNo(n) ? n : null;
}
const swById = id => db.swatches.find(s => s.id === id);
const activeLoans = sid => db.loans.filter(l => l.swatchId === sid && !l.returned);
function availability(s) {
  const loans = activeLoans(s.id);
  const copies = Math.max(1, Number(s.copies) || 1);
  return { loans, copies, free: Math.max(0, copies - loans.length) };
}
function isOverdue(l) { return !l.returned && l.due && l.due < todayISO(); }
function folderPositions(no) { return new Set(db.swatches.filter(s => s.folder === Number(no)).map(s => String(s.pos))).size; }
function nextPos(no) {
  let max = 0;
  db.swatches.filter(s => s.folder === Number(no)).forEach(s => { const n = posNum(s.pos)[0]; if (n < 99999 && n > max) max = n; });
  return String(max + 1);
}
/* ---- Место нового выкраса по правилу раскладки (краска → веер) ----
   Существующие номера НЕ меняются. Новый выкрас встаёт:
   1) сразу после последнего выкраса той же краски и того же веера в папке;
   2) если такой группы в папке нет — после последнего выкраса, который по правилу идёт раньше;
   3) если место в конце папки — получает следующий номер (57), иначе номер с буквой (15а, 15б…). */
const POS_LETTERS = 'абвгдежзиклмнопрстуфхцчшщэюя';
function groupKey(s) { return [orderIndex(db.settings.paintOrder, s.paint), orderIndex(db.settings.fanOrder, s.fan)]; }
function cmpGroup(a, b) { return a[0] - b[0] || a[1] - b[1]; }
function maxPosNum(items) { let m = 0; items.forEach(s => { const n = posNum(s.pos)[0]; if (n < 99999 && n > m) m = n; }); return m; }
function placeInFolder(folderNo, paint, fan, extra = [], excludeId = null) {
  const no = Number(folderNo);
  const items = db.swatches.filter(s => s.folder === no && s.id !== excludeId)
    .concat(extra.filter(e => Number(e.folder) === no))
    .sort((a, b) => cmpPos(a.pos, b.pos));
  if (!items.length) return { pos: '1', after: null, before: null, mode: 'empty', fits: true };
  const nk = groupKey({ paint, fan });
  let idx = -1, mode = 'rule';
  items.forEach((it, i) => { const k = groupKey(it); if (k[0] === nk[0] && k[1] === nk[1]) { idx = i; mode = 'group'; } });
  if (idx < 0) items.forEach((it, i) => { if (cmpGroup(groupKey(it), nk) <= 0) idx = i; });
  const after = idx >= 0 ? items[idx] : null, before = items[idx + 1] || null;
  if (!before) return { pos: String(maxPosNum(items) + 1), after, before: null, mode, fits: true };
  const used = new Set(items.map(s => String(s.pos).toLowerCase()));
  const [n, suf] = after ? posNum(after.pos) : [0, ''];
  const last = String(suf).trim().toLowerCase().slice(-1);
  let li = last && POS_LETTERS.includes(last) ? POS_LETTERS.indexOf(last) + 1 : 0;
  for (; li < POS_LETTERS.length; li++) {
    const cand = n + POS_LETTERS[li];
    if (!used.has(cand)) return { pos: cand, after, before, mode, fits: cmpPos(cand, before.pos) < 0 };
  }
  return { pos: String(maxPosNum(items) + 1), after, before, mode: 'overflow', fits: false };
}
// Если папка разделена (10/1, 10/2…), выбрать часть, где выкрас должен лежать по правилу раскладки
function routePart(no, paint, fan) {
  const parts = groupParts(no);
  if (parts.length < 2 || !paint || !fan || !canonFan(fan)) return Number(no);
  const nk = groupKey({ paint, fan }); let same = null, best = parts[0].no;
  parts.forEach(p => {
    const items = db.swatches.filter(s => s.folder === p.no).sort((a, b) => cmpPos(a.pos, b.pos));
    if (items.some(s => { const k = groupKey(s); return k[0] === nk[0] && k[1] === nk[1]; })) same = p.no;
    if (items.length && cmpGroup(groupKey(items[0]), nk) <= 0) best = p.no;
  });
  return same != null ? same : best;
}
function placeText(pl) {
  const d = s => `№${esc(s.pos)} (${esc(s.paint)} · ${esc(s.fan)} ${esc(s.number)})`;
  if (pl.mode === 'empty') return 'папка пустая — это будет первый выкрас';
  if (!pl.after) return `перед ${d(pl.before)} — в начале папки`;
  if (!pl.before) return `после ${d(pl.after)} — в конце папки`;
  return `между ${d(pl.after)} и ${d(pl.before)}`;
}
/* ---- Веер по номеру ----
   NCS: [NCS] [S] 4 цифры, тире, тон — «S 1001-Y», «1002-Y20R», «0500-N», «1000N».
   TIK (Тиккурила): одна буква + 2–3 цифры — «S448», «F482», «Х 37».
   У NCS после S идут 4 цифры и тон, у TIK — 2–3 цифры, поэтому их не спутать.
   Проверено на всём исходном каталоге: 278/278 NCS и 31/31 TIK. */
function guessFan(number) {
  let x = String(number || '').trim().toUpperCase().replace(/Ё/g, 'Е')
    .replace(/[АВСЕКМНОРТХУ]/g, ch => ({ 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y' }[ch]));
  x = x.replace(/^C(?=\s*\d{4})/, 'S');               // русская «С» вместо латинской S
  if (/^NCS(?![A-Z])/.test(x)) return 'NCS';
  if (/^RAL(?![A-Z])/.test(x)) return 'RAL';
  if (/^(S\s*)?\d{4}\s*-?\s*(N|[YRGB](\d{2}[YRGB])?)(?![A-Z0-9])/.test(x)) return 'NCS';
  if (/^[A-Z]\s?\d{2,3}(?![\dA-Z.,\/])/.test(x)) return 'TIK';
  return null;
}
// Веера, у которых свой формат номера (для «скан», «Лучшие», LAB, «Чистый» сверку не делаем)
const CODE_FANS = ['NCS', 'TIK', 'RAL', 'DRF', 'DUL', 'FL', 'LG', 'SW'];
function canonFan(fan) { const i = orderIndex(db.settings.fanOrder, fan); return i === 999 ? null : db.settings.fanOrder[i]; }
function fanCheck(fan, number) {
  const guess = guessFan(number), f = String(fan || '').trim();
  if (!f) return { problem: 'empty', guess, text: 'Не указан веер — программа не знает, куда положить выкрас.' + (guess ? ` По номеру похоже на ${guess}.` : '') };
  const cf = canonFan(f);
  if (!cf) return { problem: 'unknown', guess, text: `Веера «${f}» нет в списке (${db.settings.fanOrder.join(', ')}). Выкрас попадёт в конец своей краски. Проверьте, как написан веер.` };
  if (guess && CODE_FANS.some(c => norm(c) === norm(cf)) && norm(guess) !== norm(cf))
    return { problem: 'mismatch', guess, text: `Номер «${String(number).trim()}» похож на ${guess}, а веер указан «${f}». Проверьте веер.` };
  return { problem: null, guess };
}
// «NCS 1001-Y» при веере NCS → «1001-Y» (слово NCS уже есть в поле «Веер»)
function cleanNumber(fan, number) {
  const n = String(number || '').trim();
  return canonFan(fan) === 'NCS' ? n.replace(/^NCS\s*/i, '') || n : n;
}
function swLabel(s) { return `${s.paint} · ${s.fan} ${s.number}`; }

function orderIndex(list, value) {
  const v = norm(value);
  let best = -1, bestLen = -1;
  list.forEach((p, i) => { const k = norm(p); if ((v === k || v.startsWith(k)) && k.length > bestLen) { best = i; bestLen = k.length; } });
  return best < 0 ? 999 : best;
}
function ruleCompare(a, b) {
  const so = db.settings;
  return orderIndex(so.paintOrder, a.paint) - orderIndex(so.paintOrder, b.paint)
    || orderIndex(so.fanOrder, a.fan) - orderIndex(so.fanOrder, b.fan)
    || collator.compare(a.number, b.number);
}
function lastRefDate(s) {
  let best = null;
  (s.refs || []).forEach(r => { const d = refDate(r); if (d && (!best || d > best)) best = d; });
  return best;
}

/* ---------------- Поиск ---------------- */
function fanFromQuery(q) {
  const m = q.match(/^\s*(NCS|RAL|DRF|DUL|FL|LG|SW|TIK|LAB)\b\s*(.*)$/i);
  if (m && m[2]) return { fan: m[1].toUpperCase(), code: m[2] };
  return { fan: null, code: q };
}
function matchCode(s, query) {
  const { fan, code } = fanFromQuery(query);
  if (fan && norm(s.fan) !== norm(fan)) return 0;
  const q = codeNorm(code);
  if (!q) return 0;
  const full = codeNorm(s.number);
  if (full === q) return 3;                         // точное совпадение
  const toks = codeTokens(s.number);
  if (toks.includes(q)) return 2;                   // тот же код с модификатором (-50%, по Q-Base…)
  if (q.length >= 3 && full.includes(q)) return 1;  // частичное
  return 0;
}
function looksLikeCode(t) {
  // Есть цифры и нет «длинных» русских слов → это номер выкраса
  return /\d/.test(t) && !/[а-яё]{4,}/i.test(t.replace(/скан/i, ''));
}
function textMatch(s, words) {
  const hay = (s.paint + ' ' + s.fan + ' ' + s.number + ' ' + s.color + ' ' + (s.refs || []).join(' ') + ' ' + (s.note || '') + ' ' + (s.madeBy || '')).toLowerCase().replace(/ё/g, 'е');
  return words.every(w => hay.includes(w));
}

/* ---------------- Отрисовка ---------------- */
const state = {
  view: 'search',
  q: '', fams: new Set(), paint: '', fan: '', folder: '', avail: '', folderPick: null,
  openFolder: null, folderSort: 'pos', addFolder: '',
};

function setView(v, opts = {}) {
  Object.assign(state, opts);
  state.view = v;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  render();
  window.scrollTo(0, 0);
}
function render() {
  const fn = { search: renderSearch, folders: renderFolders, loans: renderLoans, add: renderAdd, log: renderLog, settings: renderSettings }[state.view];
  const root = $('#view');
  root.innerHTML = '';
  fn(root);
  lockView(root);
  paintRole();
}
function lockView(root) {
  if (canEdit()) return;
  ['addFolderBtn', 'renameF', 'renumF', 'splitF', 'addHere', 'addOk', 'bulkOk', 'sSave', 'dReset'].forEach(id => {
    const el = $('#' + id, root);
    if (el) el.remove();
  });
  ['dJsonIn', 'dXlsxIn'].forEach(id => {
    const input = $('#' + id, root);
    const label = input && input.closest('label');
    if (label) label.remove();
  });
  $$('[data-ret]', root).forEach(b => b.remove());
}
function paintRole() {
  const note = $('#roleNote');
  if (!note) return;
  if (canEdit()) { note.hidden = true; note.innerHTML = ''; return; }
  note.hidden = false;
  const who = me() ? esc(me()) : 'выберите себя';
  note.innerHTML = `<div class="alert info">Только просмотр · ${who}. Менять каталог может только администратор.</div>`;
}

function statusHtml(s) {
  const a = availability(s);
  if (!a.loans.length) return `<span class="status free">В наличии${a.copies > 1 ? ` (${a.copies})` : ''}</span>`;
  const l = a.loans[0];
  const over = a.loans.some(isOverdue);
  const who = esc(l.to) + (l.due ? ` до ${fmtDate(l.due)}` : '');
  if (a.free > 0) return `<span class="status part">${a.free} из ${a.copies} в наличии</span><div class="small muted">выдан: ${who}</div>`;
  return `<span class="status ${over ? 'over' : 'out'}">${over ? 'Просрочен' : 'Выдан'}</span><div class="small muted">${who}${a.loans.length > 1 ? ` и ещё ${a.loans.length - 1}` : ''}</div>`;
}
function famDots(s) {
  return familiesOf(s.color).map(id => `<span class="dot" title="${esc(FAM_BY_ID[id].name)}" style="background:${FAM_BY_ID[id].color}"></span>`).join('');
}
function swRow(s, showFolder = true) {
  const last = lastRefDate(s);
  return `<tr data-sw="${esc(s.id)}">
    ${showFolder ? `<td class="num">П.${fl(s.folder)}</td>` : ''}
    <td class="num">№${esc(s.pos)}${s.conflict ? '<span class="tag bad" title="В исходной таблице два разных выкраса с этим номером">дубль №</span>' : ''}</td>
    <td>${esc(s.paint)}</td>
    <td>${esc(s.fan)}</td>
    <td class="code">${esc(s.number)}</td>
    <td><span class="row" style="gap:5px;flex-wrap:nowrap">${colorMark(s)}<span>${esc(s.color)}</span></span></td>
    <td>${statusHtml(s)}</td>
    <td class="small hide-sm">${(s.refs || []).length ? esc(s.refs[0]) + (s.refs.length > 1 ? ` <span class="tag">+${s.refs.length - 1}</span>` : '') : '<span class="muted">—</span>'}${last ? '' : ''}</td>
  </tr>`;
}
function swTable(list, showFolder = true) {
  if (!list.length) return '<div class="empty">Ничего не найдено</div>';
  return `<div class="tablewrap"><table><thead><tr>${showFolder ? '<th>Папка</th>' : ''}<th>№</th><th>Краска</th><th>Веер</th><th>Номер</th><th>Цвет</th><th>Наличие</th><th class="hide-sm">Где искать</th></tr></thead>
  <tbody>${list.map(s => swRow(s, showFolder)).join('')}</tbody></table></div>`;
}
function bindRows(root) {
  $$('tr[data-sw]', root).forEach(tr => tr.addEventListener('click', () => openSwatch(tr.dataset.sw)));
}
function sortBF(a, b) { return frank(a.folder) - frank(b.folder) || cmpPos(a.pos, b.pos); }

/* ---- Вкладка «Поиск» ---- */
function renderSearch(root) {
  const paints = [...new Set(db.swatches.map(s => s.paint))].sort((a, b) => orderIndex(db.settings.paintOrder, a) - orderIndex(db.settings.paintOrder, b));
  const fans = [...new Set(db.swatches.map(s => s.fan))].sort((a, b) => orderIndex(db.settings.fanOrder, a) - orderIndex(db.settings.fanOrder, b));
  const famCounts = {};
  db.swatches.forEach(s => familiesOf(s.color).forEach(f => famCounts[f] = (famCounts[f] || 0) + 1));
  const out = db.loans.filter(l => !l.returned).length, over = db.loans.filter(isOverdue).length;

  const total = db.swatches.length, freeN = db.swatches.filter(x => availability(x).free > 0).length;
  const capAll = db.folders.length * db.settings.capacity, usedAll = db.folders.reduce((a, f) => a + folderPositions(f.no), 0);
  root.innerHTML = `
  <section class="hero no-print">
    <span class="microlabel">Каталог · ${db.folders.length} папок · ${total} выкрасов</span>
    <h1>Найди выкрас <em>в любой папке</em></h1>
    <p>Введите <b>номер</b> из веера — или сразу несколько, или опишите <b>цвет словами</b>. Программа покажет папку, место в ней и у кого выкрас сейчас.</p>
  </section>
  <div class="stats no-print">
    <div class="stat" data-go="folders">${ring(usedAll / capAll * 100, total, 'шт', '')}<div class="lbl"><b>В каталоге</b><span>занято ${usedAll} из ${capAll} мест</span></div></div>
    <div class="stat" data-go="loans">${ring(total ? out / total * 100 : 0, out, 'выд', out ? 'warn' : '')}<div class="lbl"><b>Выдано</b><span>в наличии ${freeN}</span></div></div>
    <div class="stat" data-go="loans">${ring(out ? over / out * 100 : 0, over, 'проср', over ? 'bad' : '')}<div class="lbl"><b>Просрочено</b><span>${over ? 'пора напомнить' : 'всё вовремя'}</span></div></div>
    <div class="stat" data-go="add">${ring(100, '+', 'new', '')}<div class="lbl"><b>Новинка</b><span>добавить выкрас</span></div></div>
  </div>
  <div class="card corner no-print">
    <span class="microlabel" style="margin-bottom:14px">01 · Поиск</span>
    <div class="searchbox">
      <input type="search" id="q" placeholder="0505-R, 0507-Y40R, RAL 9003 … или «шалфей»" value="${esc(state.q)}" autocomplete="off">
      <button class="btn" id="clear">Сбросить</button>
    </div>
    <div class="hint">Несколько номеров — через запятую · веер можно указать: RAL 9003, SW 6084 · приставка S у NCS не нужна</div>
    <div class="chips" id="fams">
      ${FAMILIES.map(f => `<span class="chip ${state.fams.has(f.id) ? 'on' : ''}" data-fam="${f.id}"><span class="dot" style="background:${f.color}"></span>${f.name} <span class="n">${famCounts[f.id] || 0}</span></span>`).join('')}
    </div>
    <div class="filters">
      <label>Краска<select id="fPaint"><option value="">Все</option>${paints.map(p => `<option ${p === state.paint ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <label>Веер<select id="fFan"><option value="">Все</option>${fans.map(p => `<option ${p === state.fan ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <label>Папка<select id="fFolder"><option value="">Все</option>${foldersSorted().map(f => `<option value="${f.no}" ${String(f.no) === String(state.folder) ? 'selected' : ''}>${fl(f.no)}. ${esc(f.name)}</option>`).join('')}</select></label>
      <label>Наличие<select id="fAvail"><option value="">Любое</option><option value="free" ${state.avail === 'free' ? 'selected' : ''}>Есть в наличии</option><option value="out" ${state.avail === 'out' ? 'selected' : ''}>Выдан</option><option value="over" ${state.avail === 'over' ? 'selected' : ''}>Просрочен</option></select></label>
    </div>
  </div>
  <div id="results"></div>`;

  $$('[data-go]', root).forEach(el => el.addEventListener('click', () => setView(el.dataset.go)));
  const q = $('#q', root);
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; state.folderPick = null; renderResults(); }, 150); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { state.q = q.value; renderResults(); } });
  $('#clear', root).onclick = () => { Object.assign(state, { q: '', fams: new Set(), paint: '', fan: '', folder: '', avail: '', folderPick: null }); render(); };
  $$('#fams .chip', root).forEach(c => c.addEventListener('click', () => {
    const id = c.dataset.fam; state.fams.has(id) ? state.fams.delete(id) : state.fams.add(id);
    c.classList.toggle('on'); state.folderPick = null; renderResults();
  }));
  $('#fPaint', root).onchange = e => { state.paint = e.target.value; renderResults(); };
  $('#fFan', root).onchange = e => { state.fan = e.target.value; renderResults(); };
  $('#fFolder', root).onchange = e => { state.folder = e.target.value; renderResults(); };
  $('#fAvail', root).onchange = e => { state.avail = e.target.value; renderResults(); };
  renderResults();
  setTimeout(() => q.focus(), 0);
}

// Листа нет, но номер есть в палитре DRF → показать цвет и ближайшие листы. Голые цифры — только с оговоркой.
function drfMissHtml(p) {
  const { fan, code } = fanFromQuery(p);
  if (fan ? fan !== 'DRF' : !/^\s*\d{4}\s*$/.test(code)) return '';
  const base = drfBase(code); if (!base) return '';
  const hex = window.DERUFA_PALETTE[base];
  const near = nearestSheets(hex, 5);
  return `<div class="drfmiss"><div class="row" style="gap:10px">${chipc(hex, hex.toUpperCase(), 'lg')}<span>${fan ? '' : 'Если это DRF: '}<b>DRF ${base}</b> — так выглядит цвет. Ближайшие листы в папках:</span></div>${near.length ? nearList(near) : ''}</div>`;
}

function baseFilter(s) {
  if (state.paint && s.paint !== state.paint) return false;
  if (state.fan && s.fan !== state.fan) return false;
  if (state.folder && String(s.folder) !== String(state.folder)) return false;
  if (state.fams.size) { const f = familiesOf(s.color); if (![...state.fams].some(x => f.includes(x))) return false; }
  if (state.avail) {
    const a = availability(s);
    if (state.avail === 'free' && a.free === 0) return false;
    if (state.avail === 'out' && !a.loans.length) return false;
    if (state.avail === 'over' && !a.loans.some(isOverdue)) return false;
  }
  return true;
}

function renderResults() {
  const box = $('#results'); if (!box) return;
  const raw = state.q.trim();
  const parts = raw.split(/[\n;,]+/).map(x => x.trim()).filter(Boolean);
  const codeMode = parts.length > 0 && parts.every(looksLikeCode);

  if (codeMode) {
    // Поиск по списку номеров
    const rows = parts.map(p => {
      const hits = db.swatches.filter(baseFilter).map(s => ({ s, sc: matchCode(s, p) })).filter(x => x.sc > 0);
      const best = hits.length ? Math.max(...hits.map(h => h.sc)) : 0;
      const shown = hits.filter(h => h.sc >= Math.min(best, 2) || best === 1).sort((a, b) => b.sc - a.sc || sortBF(a.s, b.s));
      return { p, hits: shown, best };
    });
    const allFolders = {};
    rows.forEach(r => r.hits.forEach(h => { allFolders[h.s.folder] = (allFolders[h.s.folder] || 0) + 1; }));
    box.innerHTML = `
    <div class="card">
      <span class="microlabel">02 · Результат</span>
      <h2 style="margin-top:8px">Где искать <em>${parts.length} ${plural(parts.length, 'номер', 'номера', 'номеров')}</em></h2>
      <div class="summary"><b>Папки:</b> ${Object.keys(allFolders).length ? Object.keys(allFolders).sort((a, b) => frank(a) - frank(b)).map(f => `<span class="fpill" data-open-folder="${f}" title="${esc(folderName(f))}">Папка ${fl(f)} <span class="n">${allFolders[f]} шт.</span></span>`).join('') : '<span class="muted">—</span>'}</div>
    </div>
    <div class="tablewrap"><table class="qres"><thead><tr><th>Запрос</th><th>Папка</th><th>№</th><th>Краска</th><th>Веер</th><th>Номер</th><th>Цвет</th><th>Наличие</th></tr></thead><tbody>
    ${rows.map(r => r.hits.length ? r.hits.map((h, i) => `<tr data-sw="${esc(h.s.id)}">
        <td class="q">${i === 0 ? esc(r.p) : ''}${i === 0 && r.best === 1 ? '<div class="small muted">похожие</div>' : ''}</td>
        <td class="num">П.${fl(h.s.folder)}</td><td class="num">№${esc(h.s.pos)}</td><td>${esc(h.s.paint)}</td><td>${esc(h.s.fan)}</td>
        <td class="code">${esc(h.s.number)}</td><td><span class="row" style="gap:5px;flex-wrap:nowrap">${colorMark(h.s)}<span>${esc(h.s.color)}</span></span></td><td>${statusHtml(h.s)}</td></tr>`).join('')
      : `<tr><td class="q">${esc(r.p)}</td><td colspan="7"><span class="notfound">Не найден в каталоге</span>${drfMissHtml(r.p)}</td></tr>`).join('')}
    </tbody></table></div>`;
    bindRows(box);
    $$('[data-goto]', box).forEach(el => el.onclick = e => { e.preventDefault(); openSwatch(el.dataset.goto); });
    $$('[data-open-folder]', box).forEach(el => el.onclick = () => setView('folders', { openFolder: Number(el.dataset.openFolder) }));
    return;
  }

  // Обычный поиск: слова + фильтры
  const words = raw.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  const active = words.length || state.fams.size || state.paint || state.fan || state.folder || state.avail;
  if (!active) {
    box.innerHTML = `<div class="card"><span class="microlabel gray" style="margin-bottom:18px">Как пользоваться</span>
      <ul class="howto">
        <li><i>01</i><div><b>Все оттенки цвета</b>Нажмите «Зелёные» — увидите, в каких папках они лежат и сколько их.</div></li>
        <li><i>02</i><div><b>Список номеров</b>Вставьте «0505-R, 0507-Y40R, 2002-R» — папка и место для каждого.</div></li>
        <li><i>03</i><div><b>Наличие</b>У каждого выкраса статус: в наличии или кому выдан и до какого числа.</div></li>
        <li><i>04</i><div><b>Карточка</b>Клик по строке — выдать, вернуть, история, редактирование.</div></li>
      </ul></div>`;
    return;
  }
  let list = db.swatches.filter(s => baseFilter(s) && (!words.length || textMatch(s, words)));
  const byFolder = {};
  list.forEach(s => byFolder[s.folder] = (byFolder[s.folder] || 0) + 1);
  if (state.folderPick) list = list.filter(s => s.folder === state.folderPick);
  list.sort(sortBF);
  const freeCount = list.filter(s => availability(s).free > 0).length;
  box.innerHTML = `
  <div class="card">
    <div class="summary"><b>Найдено: ${Object.values(byFolder).reduce((a, b) => a + b, 0)}</b>
      <span class="muted">· в наличии ${freeCount} из ${list.length} показанных · по папкам:</span>
      ${Object.keys(byFolder).sort((a, b) => frank(a) - frank(b)).map(f => `<span class="fpill ${state.folderPick === Number(f) ? 'on' : ''}" data-pick="${f}" title="${esc(folderName(f))}">Папка ${fl(f)} <span class="n">${byFolder[f]}</span></span>`).join('')}
      ${state.folderPick ? '<button class="btn sm" id="unpick">Показать все папки</button>' : ''}
    </div>
    ${state.folderPick ? `<div class="small muted" style="margin-top:6px">Папка ${fl(state.folderPick)}: ${esc(folderName(state.folderPick))}</div>` : ''}
  </div>
  ${swTable(list)}`;
  bindRows(box);
  $$('[data-pick]', box).forEach(el => el.onclick = () => { const f = Number(el.dataset.pick); state.folderPick = state.folderPick === f ? null : f; renderResults(); });
  const u = $('#unpick', box); if (u) u.onclick = () => { state.folderPick = null; renderResults(); };
}
function ring(pct, val, sub, cls) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="ring ${cls || ''}" style="--p:${p.toFixed(1)}"><i>${esc(val)}${sub ? `<s>${esc(sub)}</s>` : ''}</i></div>`;
}
function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }

/* ---- Вкладка «Папки» ---- */
function renderFolders(root) {
  if (state.openFolder != null && folderByNo(state.openFolder)) return renderFolder(root, state.openFolder);
  const cap = db.settings.capacity;
  const usedAll = db.folders.reduce((a, f) => a + folderPositions(f.no), 0);
  root.innerHTML = `<div class="row no-print" style="align-items:flex-end;margin-bottom:6px"><div class="grow"><span class="microlabel">Папки · лимит ${cap} мест</span><h1>${db.folders.length} папок · <em>${usedAll}</em> мест занято</h1></div><button class="btn" id="addFolderBtn">＋ Новая папка</button></div>
  <div class="folders-grid">${foldersSorted().map(f => {
    const n = folderPositions(f.no);
    const outN = db.swatches.filter(s => s.folder === f.no && activeLoans(s.id).length).length;
    const cls = n > cap ? 'bad' : n >= cap - 5 ? 'warn' : '';
    return `<div class="fcard ${n > cap ? 'full' : n >= cap - 5 ? 'near' : ''}" data-f="${f.no}">
      ${ring(n / cap * 100, n, '/' + cap, cls)}
      <div class="finfo">
        <div class="fno">Папка ${flPad(f.no)}</div>
        <div class="fname">${esc(f.name)}</div>
        <div class="fstats"><span>${n > cap ? `<b>переполнена +${n - cap}</b>` : n >= cap ? '<b>заполнена</b>' : `свободно ${cap - n}`}</span>${outN ? `<span style="color:var(--warn)">выдано ${outN}</span>` : ''}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
  $$('.fcard', root).forEach(c => c.onclick = () => { state.openFolder = Number(c.dataset.f); render(); });
  $('#addFolderBtn', root).onclick = () => {
    const no = Math.max(0, ...db.folders.filter(f => f.no < PART_BASE).map(f => f.group || f.no)) + 1;
    const name = prompt(`Название новой папки №${no}:`, '');
    if (name == null) return;
    db.folders.push({ no, name: name.trim() || `Папка ${no}` });
    logEvt('folder', `Создана папка ${no}: ${name}`); save(); render(); toast(`Папка ${no} создана`);
  };
}
function renderFolder(root, no) {
  const f = folderByNo(no); const cap = db.settings.capacity;
  let list = db.swatches.filter(s => s.folder === no);
  list.sort(state.folderSort === 'rule' ? (a, b) => ruleCompare(a, b) || cmpPos(a.pos, b.pos) : (a, b) => cmpPos(a.pos, b.pos));
  const n = folderPositions(no);
  root.innerHTML = `
  <div class="row no-print"><button class="btn" id="back">← Все папки</button><div class="grow"></div>
    <select id="sortSel" style="width:auto;border-radius:999px"><option value="pos" ${state.folderSort === 'pos' ? 'selected' : ''}>По номеру в папке</option><option value="rule" ${state.folderSort === 'rule' ? 'selected' : ''}>По порядку вееров (как должно быть)</option></select>
    <button class="btn" id="renameF">Переименовать</button>
    <button class="btn" id="renumF">Перенумеровать по порядку</button>
    <button class="btn" id="splitF">✂ Разделить папку</button>
    <button class="btn" id="printF">🖨 Печать</button>
    <button class="btn primary" id="addHere" ${n >= cap ? 'disabled title="Папка заполнена"' : ''}>＋ Добавить сюда</button></div>
  <span class="microlabel" style="margin-top:22px">Папка ${flPad(no)} · ${n} / ${cap}</span><h1>${esc(f.name)}</h1>
  <div class="print-only small">Распечатано ${new Date().toLocaleDateString('ru-RU')}</div>
  ${n > cap ? `<div class="alert bad">В папке ${n} номеров при лимите ${cap}. Перенесите часть выкрасов в другую папку (карточка выкраса → «Переместить»).</div>` : n >= cap - 5 ? `<div class="alert warn">Папка почти заполнена: ${n} из ${cap}.</div>` : `<div class="muted small">${n} из ${cap} мест занято, свободно ${cap - n}.</div>`}
  ${list.some(s => s.conflict) ? '<div class="alert warn no-print">Есть номера, под которыми в исходной таблице записаны два разных выкраса (отмечены «дубль №»). Проверьте папку физически и исправьте номер в карточке.</div>' : ''}
  ${f.moveList ? `<div class="alert info no-print">Эта папка создана ${fmtDate(f.moveList.date)} при разделении папки ${esc(f.moveList.from)}. <button class="btn sm" id="moveListBtn">📋 Список переноса</button></div>` : ''}
  <div style="margin-top:16px">${swTable(list, false)}</div>`;
  bindRows(root);
  $('#splitF', root).onclick = () => splitFolderDialog(no);
  if ($('#moveListBtn', root)) $('#moveListBtn', root).onclick = () => showMoveList(no);
  $('#back', root).onclick = () => { state.openFolder = null; render(); };
  $('#sortSel', root).onchange = e => { state.folderSort = e.target.value; render(); };
  $('#printF', root).onclick = () => window.print();
  $('#addHere', root).onclick = () => setView('add', { addFolder: String(no) });
  $('#renameF', root).onclick = () => {
    const name = prompt(`Новое название папки №${fl(no)}:`, f.name); if (name == null) return;
    logEvt('folder', `Папка ${fl(no)} переименована: «${f.name}» → «${name}»`); f.name = name.trim() || f.name; save(); render();
  };
  $('#renumF', root).onclick = () => {
    if (!confirm(`Перенумеровать все выкрасы папки ${fl(no)} с 1 по ${list.length} в порядке: краска (${db.settings.paintOrder.slice(0, 4).join(', ')}…) → веер (${db.settings.fanOrder.slice(0, 5).join(', ')}…)?\n\nНомера на физических выкрасах нужно будет переписать — после перенумерации распечатайте список.`)) return;
    const sorted = db.swatches.filter(s => s.folder === no).sort((a, b) => ruleCompare(a, b) || cmpPos(a.pos, b.pos));
    sorted.forEach((s, i) => { s.pos = String(i + 1); delete s.conflict; });
    logEvt('renumber', `Папка ${fl(no)} перенумерована по порядку (${sorted.length} шт.)`);
    save(); state.folderSort = 'pos'; render(); toast('Папка перенумерована');
  };
}

/* ---- Разделение папки ----
   Начало папки остаётся на месте со старыми номерами, хвост (с выбранного выкраса до конца)
   переезжает в новую часть и нумеруется с 1 по правилу раскладки. Резать можно только
   на границе краски или веера, чтобы порядок раскладки не ломался. */
function splitOptions(no) {
  const items = db.swatches.filter(s => s.folder === Number(no)).sort((a, b) => cmpPos(a.pos, b.pos));
  const uniq = arr => new Set(arr.map(s => String(s.pos))).size;
  const opts = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1], b = items[i];
    if (String(a.pos) === String(b.pos)) continue;               // один номер не разрываем
    const level = norm(a.paint) !== norm(b.paint) ? 'paint' : norm(a.fan) !== norm(b.fan) ? 'fan' : null;
    if (!level) continue;
    opts.push({ i, level, first: b, last: a, stay: uniq(items.slice(0, i)), move: uniq(items.slice(i)) });
  }
  let rec = null;
  opts.forEach(o => { o.score = Math.abs(o.stay - o.move) + (o.level === 'fan' ? 4 : 0); if (!rec || o.score < rec.score) rec = o; });
  if (rec) rec.rec = true;
  return { items, opts };
}
function splitFolderDialog(no) {
  no = Number(no);
  const f = folderByNo(no), cap = db.settings.capacity;
  const { items, opts } = splitOptions(no);
  if (!opts.length) return alert(`Папку ${fl(no)} нельзя разделить: в ней нет границы между красками или веерами.`);
  const G = f.group || f.no, P = f.part || 1;
  const later = db.folders.filter(x => x.group === G && x.part > P).sort((a, b) => a.part - b.part);
  const sel0 = opts.find(o => o.rec) || opts[0];
  openModal(`<span class="microlabel">Папка ${flPad(no)} · ${folderPositions(no)} / ${cap}</span>
    <h2 style="margin:8px 0 6px">Разделить папку ${fl(no)}</h2>
    <div class="muted" style="line-height:1.5">Выберите, <b>с какого выкраса начинается вторая часть</b>.<br>
      Всё, что лежит <b>до него</b>, останется в папке <b>${G}/${P}</b> — номера не меняются.<br>
      Всё, начиная с него <b>до конца папки</b>, переедет в новую папку <b>${G}/${P + 1}</b> и получит номера с 1 по правилу раскладки.</div>
    <div id="spList" style="margin-top:14px;max-height:42vh;overflow:auto;border:1px solid var(--line);border-radius:14px">
      ${opts.map((o, k) => `<label class="row" style="gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer;align-items:flex-start">
        <input type="radio" name="spOpt" value="${k}" ${o === sel0 ? 'checked' : ''} style="width:20px;height:20px;margin-top:3px;flex:0 0 auto">
        <div class="grow"><b>с №${esc(o.first.pos)}</b> — ${esc(o.first.paint)} · ${esc(o.first.fan)} ${esc(o.first.number)}
          ${o.rec ? ' <span style="margin-left:6px;background:var(--lime);color:#111;border:1px solid #111;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">рекомендуем</span>' : ''}
          <div class="small muted">граница ${o.level === 'paint' ? 'краски' : 'веера'}: после №${esc(o.last.pos)} (${esc(o.last.paint)} · ${esc(o.last.fan)}) · останется ${o.stay} · переедет ${o.move}</div></div>
      </label>`).join('')}
    </div>
    <div id="spPrev" style="margin-top:12px"></div>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="spOk">✂ Разделить</button><button class="btn" id="spCancel">Отмена</button></div>`,
  body => {
    const cur = () => opts[Number(($('input[name=spOpt]:checked', body) || {}).value || 0)];
    const prev = () => {
      const o = cur();
      $('#spPrev', body).innerHTML = `<div class="alert info">В папке <b>${G}/${P}</b> останется <b>${o.stay}</b> (№${esc(items[0].pos)}–№${esc(o.last.pos)}), свободно станет ${cap - o.stay}.<br>
        В новую папку <b>${G}/${P + 1}</b> переедет <b>${o.move}</b>: они получат номера 1–${o.move}, свободно будет ${cap - o.move}.</div>` +
        (!f.group ? `<div class="alert warn">Обложку старой папки нужно будет переподписать: <b>${G}</b> → <b>${G}/1</b>.</div>` : '') +
        (later.length ? `<div class="alert warn">Следующие части сдвинутся на один номер — переподпишите их обложки: ${later.map(x => `<b>${G}/${x.part}</b> → <b>${G}/${x.part + 1}</b>`).join(', ')}.</div>` : '') +
        (o.stay > cap ? `<div class="alert warn">В первой части останется больше ${cap} — после этого разделите её ещё раз.</div>` : '');
    };
    $$('input[name=spOpt]', body).forEach(r => r.onchange = prev); prev();
    $('#spCancel', body).onclick = closeModal;
    $('#spOk', body).onclick = () => {
      const o = cur();
      if (!confirm(`Разделить папку ${fl(no)}?\n\nОстанется в ${G}/${P}: ${o.stay}\nПереедет в ${G}/${P + 1}: ${o.move} (с №${o.first.pos} до конца)\n\nПосле этого программа покажет список: какой выкрас достать и какой новый номер на нём написать.`)) return;
      const nf = doSplit(no, o.i); closeModal(); state.openFolder = no; render(); showMoveList(nf);
    };
  });
}
function doSplit(no, cutIndex) {
  const f = folderByNo(no), { items } = splitOptions(no);
  const tail = items.slice(cutIndex), oldLabel = fl(no);
  const G = f.group || f.no, P = f.part || 1;
  const renamed = [];
  db.folders.filter(x => x.group === G && x.part > P).sort((a, b) => b.part - a.part)
    .forEach(x => { renamed.push(`${G}/${x.part} → ${G}/${x.part + 1}`); x.part++; });
  if (!f.group) { f.group = G; f.part = 1; }
  const nf = { no: Math.max(PART_BASE, ...db.folders.map(x => x.no)) + 1, group: G, part: P + 1, name: f.name };
  db.folders.push(nf);
  // порядок в новой части: по правилу (краска → веер), внутри группы — как лежали
  const ordered = tail.map((s, k) => ({ s, k })).sort((a, b) => cmpGroup(groupKey(a.s), groupKey(b.s)) || a.k - b.k).map(x => x.s);
  const map = new Map(); let n = 0; const list = [];
  ordered.forEach(s => {
    const op = String(s.pos);
    if (!map.has(op)) map.set(op, String(++n));
    const np = map.get(op);
    list.push({ id: s.id, from: `${oldLabel} №${op}`, to: np, paint: s.paint, fan: s.fan, number: s.number });
    logEvt('move', `${swLabel(s)}: папка ${oldLabel} №${op} → папка ${G}/${P + 1} №${np} (разделение папки)`, s.id);
    s.folder = nf.no; s.pos = np;
  });
  nf.moveList = { date: todayISO(), from: oldLabel, items: list };
  logEvt('folder', `Папка ${oldLabel} разделена: в ${G}/${P} осталось ${folderPositions(no)}, в ${G}/${P + 1} переехало ${n}${!f.part || oldLabel !== `${G}/${P}` ? ` (папка ${oldLabel} теперь ${G}/${P})` : ''}${renamed.length ? '; переименованы: ' + renamed.join(', ') : ''}`);
  save();
  return nf.no;
}
function showMoveList(no) {
  const f = folderByNo(no); if (!f || !f.moveList) return;
  const ml = f.moveList, rows = ml.items;
  const table = `<table><thead><tr><th>Новый №<br>в ${fl(no)}</th><th>Где лежал</th><th>Краска</th><th>Веер · номер</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="num"><b>${esc(r.to)}</b></td><td>${esc(r.from)}</td><td>${esc(r.paint)}</td><td class="code">${esc(r.fan)} ${esc(r.number)}</td></tr>`).join('')}</tbody></table>`;
  const steps = `<ol style="line-height:1.6;margin:8px 0 0;padding-left:22px">
      <li>Подпишите новую пустую папку: <b>${fl(no)}</b>. Если старая папка была без дроби, переподпишите её обложку на <b>${esc(String(f.group))}/1</b>.</li>
      <li>Идите по списку сверху вниз: достаньте выкрас из старого места, <b>зачеркните старый номер и напишите новый</b>.</li>
      <li>Кладите выкрасы в новую папку <b>по порядку новых номеров</b>: 1, 2, 3…</li></ol>`;
  openModal(`<span class="microlabel">Разделение папки · ${fmtDate(ml.date)}</span>
    <h2 style="margin:8px 0 6px">Что переложить в папку ${fl(no)}</h2>
    <div class="muted">Из папки ${esc(ml.from)} переезжает ${rows.length} выкрасов.</div>${steps}
    <div class="tablewrap" style="margin-top:12px;max-height:44vh;overflow:auto">${table}</div>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="mlPrint">🖨 Печать списка</button><button class="btn" id="mlClose">Закрыть</button></div>`,
  body => {
    $('#mlClose', body).onclick = closeModal;
    $('#mlPrint', body).onclick = () => {
      const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
      document.body.appendChild(fr);
      const d = fr.contentWindow.document;
      d.open(); d.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Перенос в папку ${fl(no)}</title><style>
        body{font-family:system-ui,Arial,sans-serif;color:#000;margin:14mm;font-size:12pt}h1{font-size:20pt;margin:0 0 4px}
        table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #000;padding:6px 8px;text-align:left;font-size:12pt}
        th{background:#eee}td.num{font-size:15pt;text-align:center;width:22mm}td.chk{width:12mm}ol{line-height:1.6}</style></head><body>
        <h1>Перенос в папку ${fl(no)}</h1><div>Из папки ${esc(ml.from)} · ${rows.length} выкрасов · ${fmtDate(ml.date)}</div>${steps}
        <table><thead><tr><th>Новый №</th><th>Где лежал</th><th>Краска</th><th>Веер · номер</th><th>✓</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="num"><b>${esc(r.to)}</b></td><td>${esc(r.from)}</td><td>${esc(r.paint)}</td><td>${esc(r.fan)} ${esc(r.number)}</td><td class="chk"></td></tr>`).join('')}
        </tbody></table></body></html>`); d.close();
      setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 1500); }, 200);
    };
  });
}

/* ---- Карточка выкраса ---- */
function openModal(html, onMount) {
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  if (onMount) onMount($('#modalBody'));
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

function openSwatch(id) {
  const s = swById(id); if (!s) return;
  const a = availability(s);
  const allLoans = db.loans.filter(l => l.swatchId === id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const refs = (s.refs || []).map(r => ({ r, d: refDate(r) })).sort((x, y) => (y.d || '').localeCompare(x.d || ''));
  const same = db.swatches.filter(o => o.id !== s.id && codeTokens(o.number)[0] && codeTokens(o.number)[0] === codeTokens(s.number)[0] && norm(o.fan) === norm(s.fan));
  const drf = drfInfo(s.fan, s.number);
  const near = drf ? nearestSheets(drf.hex, 6, drf.base) : [];
  openModal(`
    <span class="microlabel">Папка ${flPad(s.folder)} · место №${esc(s.pos)}</span>
    <h2 style="margin:10px 0 6px;font-size:26px"><span class="code">${esc(s.fan)} ${esc(s.number)}</span></h2>
    <div class="row" style="gap:8px">${colorMark(s)}<span class="muted">${esc(s.paint)} · ${esc(s.color)}</span></div>
    ${drf ? `<div class="drfband" style="background:${drf.hex}"></div>
    <div class="small muted">DRF ${drf.base} · ${drf.hex.toUpperCase()}${drf.mod ? ` · показан базовый DRF ${drf.base}, без учёта «${esc(drf.mod)}»` : ''} · цвет на экране приблизительный, сверяйте с листом</div>` : ''}
    ${s.conflict ? '<div class="alert warn">В исходной таблице под этим номером в папке записан ещё один выкрас. Проверьте и исправьте номер.</div>' : ''}
    <dl class="kv">
      <dt>Где лежит</dt><dd><b>Папка ${fl(s.folder)}</b>, номер <b>${esc(s.pos)}</b><div class="small muted">${esc(folderName(s.folder))}</div></dd>
      <dt>Наличие</dt><dd>${statusHtml(s)}</dd>
      <dt>Экземпляров</dt><dd>${a.copies}</dd>
      ${s.madeBy || s.madeDate ? `<dt>Сделал</dt><dd>${esc(s.madeBy || '—')}${s.madeDate ? ', ' + fmtDate(s.madeDate) : ''}</dd>` : ''}
      ${s.note ? `<dt>Примечание</dt><dd>${esc(s.note)}</dd>` : ''}
    </dl>
    ${canEdit() ? `<div class="row">
      ${a.free > 0 ? '<button class="btn primary" id="mIssue">📤 Выдать</button>' : ''}
      ${a.loans.length ? '<button class="btn ok" id="mReturn">📥 Вернуть</button>' : ''}
      <button class="btn" id="mRef">＋ Запись «где искать»</button>
      <button class="btn" id="mEdit">✏️ Редактировать</button>
      <button class="btn" id="mMove">↪ Переместить</button>
      <button class="btn danger" id="mDel">Удалить</button>
    </div>` : ''}
    ${a.loans.length ? `<h3>Сейчас на руках</h3><ul class="history">${a.loans.map(l => `<li><span><b>${esc(l.to)}</b>${l.contact ? ' · ' + esc(l.contact) : ''}<br><span class="small muted">выдал ${esc(l.by || '—')} ${fmtDate(l.date)}${l.note ? ' · ' + esc(l.note) : ''}</span></span><span class="${isOverdue(l) ? 'notfound' : ''}">${l.due ? 'вернёт ' + fmtDate(l.due) : ''}</span></li>`).join('')}</ul>` : ''}
    <h3>Где искать / история изготовления</h3>
    ${refs.length ? `<ul class="history">${refs.map(x => `<li><span>${esc(x.r)}</span><span class="muted small">${x.d ? fmtDate(x.d) : ''}</span></li>`).join('')}</ul>` : '<div class="muted small">Записей пока нет</div>'}
    ${allLoans.filter(l => l.returned).length ? `<h3>История выдач</h3><ul class="history">${allLoans.filter(l => l.returned).map(l => `<li><span>${esc(l.to)} <span class="small muted">· выдал ${esc(l.by || '—')}</span></span><span class="small muted">${fmtDate(l.date)} → ${fmtDate(l.returned)}</span></li>`).join('')}</ul>` : ''}
    ${same.length ? `<h3>Этот же цвет в других вариантах</h3><ul class="history">${same.map(o => `<li><a href="#" data-goto="${o.id}">${esc(o.paint)} · ${esc(o.number)}</a><span class="small muted">папка ${o.folder}, №${esc(o.pos)}</span></li>`).join('')}</ul>` : ''}
    ${near.length ? `<h3>Похожие листы в каталоге</h3>${nearList(near)}` : ''}
  `, body => {
    const b = id2 => $(id2, body);
    if (b('#mIssue')) b('#mIssue').onclick = () => issueForm(s);
    if (b('#mReturn')) b('#mReturn').onclick = () => returnForm(s);
    if (b('#mRef')) b('#mRef').onclick = () => refForm(s);
    if (b('#mEdit')) b('#mEdit').onclick = () => editForm(s);
    if (b('#mMove')) b('#mMove').onclick = () => moveForm(s);
    if (b('#mDel')) b('#mDel').onclick = () => {
      if (activeLoans(s.id).length) return alert('Выкрас сейчас выдан — сначала оформите возврат.');
      if (!confirm(`Удалить выкрас ${swLabel(s)} (папка ${fl(s.folder)}, №${s.pos})?`)) return;
      db.swatches = db.swatches.filter(x => x.id !== s.id);
      logEvt('delete', `Удалён: ${swLabel(s)}, папка ${fl(s.folder)} №${s.pos}`, s.id);
      save(); closeModal(); render(); toast('Удалено');
    };
    $$('[data-goto]', body).forEach(el => el.onclick = e => { e.preventDefault(); openSwatch(el.dataset.goto); });
  });
}

function requireMe() {
  if (me()) return true;
  alert('Сначала выберите себя в поле «Я:» вверху справа (список менеджеров — в Настройках).');
  return false;
}
function issueForm(s) {
  if (!requireMe()) return;
  openModal(`<span class="microlabel">Действие</span><h2 style="margin:8px 0 6px">Выдать выкрас</h2>
    <div class="muted">${esc(swLabel(s))} — папка ${fl(s.folder)}, №${esc(s.pos)}</div>
    <div class="formgrid" style="margin-top:14px">
      <label class="wide">Кому (ФИО / организация) *<input type="text" id="iTo" required></label>
      <label>Телефон / контакт<input type="text" id="iContact"></label>
      <label>Вернёт до<input type="date" id="iDue" value="${addDaysISO(db.settings.loanDays)}"></label>
      <label class="wide">Комментарий<input type="text" id="iNote" placeholder="напр. дизайнер, объект"></label>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="iOk">Выдать</button><button class="btn" id="iCancel">Отмена</button><span class="muted small">Выдаёт: ${esc(me())}</span></div>`,
  body => {
    $('#iTo', body).focus();
    $('#iCancel', body).onclick = () => openSwatch(s.id);
    $('#iOk', body).onclick = () => {
      const to = $('#iTo', body).value.trim(); if (!to) return $('#iTo', body).focus();
      const l = { id: uid(), swatchId: s.id, to, contact: $('#iContact', body).value.trim(), due: $('#iDue', body).value, note: $('#iNote', body).value.trim(), date: todayISO(), by: me(), returned: null };
      db.loans.push(l);
      logEvt('issue', `Выдан ${swLabel(s)} (папка ${fl(s.folder)} №${s.pos}) → ${to}${l.due ? ', вернёт до ' + fmtDate(l.due) : ''}`, s.id);
      save(); openSwatch(s.id); render(); toast('Выдача записана');
    };
  });
}
function returnForm(s, loanId) {
  const loans = activeLoans(s.id);
  const doReturn = l => {
    l.returned = todayISO(); l.returnedTo = me();
    logEvt('return', `Возвращён ${swLabel(s)} (папка ${fl(s.folder)} №${s.pos}) от ${l.to}`, s.id);
    save(); render(); toast(`Возвращено — положите в папку ${fl(s.folder)} на место №${s.pos}`);
  };
  if (loanId) { const l = loans.find(x => x.id === loanId); if (l) doReturn(l); return; }
  if (loans.length === 1) { if (confirm(`Принять возврат от ${loans[0].to}?\nПоложить в папку ${fl(s.folder)}, номер ${s.pos}.`)) { doReturn(loans[0]); openSwatch(s.id); } return; }
  openModal(`<span class="microlabel">Действие</span><h2 style="margin:8px 0 6px">Чей экземпляр вернули?</h2><ul class="history">${loans.map(l => `<li><span>${esc(l.to)} · выдан ${fmtDate(l.date)}</span><button class="btn sm ok" data-l="${l.id}">Вернуть</button></li>`).join('')}</ul>`,
    body => $$('[data-l]', body).forEach(b => b.onclick = () => { doReturn(loans.find(x => x.id === b.dataset.l)); openSwatch(s.id); }));
}
function refForm(s) {
  openModal(`<span class="microlabel">Действие</span><h2 style="margin:8px 0 6px">Новая запись «где искать»</h2>
    <div class="muted">${esc(swLabel(s))}</div>
    <div class="formgrid" style="margin-top:14px">
      <label>Документ<select id="rType"><option value="сп.">Спецификация (сп.)</option><option value="зак.">Заказ (зак.)</option></select></label>
      <label>Номер<input type="text" id="rNo"></label>
      <label>Дата<input type="date" id="rDate" value="${todayISO()}"></label>
      <label>Кто делал выкрас<input type="text" id="rWho" value="${esc(me())}"></label>
      <label class="wide">или произвольный текст<input type="text" id="rFree" placeholder="напр. «постер»"></label>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="rOk">Добавить</button><button class="btn" id="rCancel">Отмена</button></div>`,
  body => {
    $('#rCancel', body).onclick = () => openSwatch(s.id);
    $('#rOk', body).onclick = () => {
      const free = $('#rFree', body).value.trim();
      const no = $('#rNo', body).value.trim(), d = $('#rDate', body).value, who = $('#rWho', body).value.trim();
      const txt = free || `${$('#rType', body).value}${no}${d ? ' от ' + fmtDate(d) : ''}${who ? ' — ' + who : ''}`;
      if (!free && !no) return $('#rNo', body).focus();
      s.refs = [txt, ...(s.refs || [])];
      logEvt('ref', `Добавлена запись «${txt}» к ${swLabel(s)}`, s.id);
      save(); openSwatch(s.id); render();
    };
  });
}
function moveForm(s) {
  const cap = db.settings.capacity;
  openModal(`<span class="microlabel">Действие</span><h2 style="margin:8px 0 6px">Переместить в другую папку</h2>
    <div class="muted">${esc(swLabel(s))} — сейчас папка ${fl(s.folder)}, №${esc(s.pos)}</div>
    <div class="formgrid" style="margin-top:14px">
      <label class="wide">Папка<select id="mvF">${foldersSorted().map(f => { const n = folderPositions(f.no); return `<option value="${f.no}" ${f.no === s.folder ? 'selected' : ''} ${n >= cap && f.no !== s.folder ? 'disabled' : ''}>${fl(f.no)}. ${esc(f.name)} (${n}/${cap})</option>`; }).join('')}</select></label>
      <label>Номер в папке<input type="text" id="mvP"></label>
    </div>
    <div id="mvHint"></div>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="mvOk">Переместить</button><button class="btn" id="mvCancel">Отмена</button></div>`,
  body => {
    const sel = $('#mvF', body), p = $('#mvP', body), hintEl = $('#mvHint', body);
    const upd = () => {
      if (Number(sel.value) === s.folder) { p.value = s.pos; hintEl.innerHTML = ''; return; }
      const pl = placeInFolder(sel.value, s.paint, s.fan, [], s.id); p.value = pl.pos;
      hintEl.innerHTML = `<div class="alert info">По правилу раскладки: ${placeText(pl)}.</div>`;
    };
    sel.onchange = upd; upd();
    $('#mvCancel', body).onclick = () => openSwatch(s.id);
    $('#mvOk', body).onclick = () => {
      const nf = Number(sel.value), np = p.value.trim() || placeInFolder(nf, s.paint, s.fan, [], s.id).pos;
      const clash = db.swatches.find(x => x.id !== s.id && x.folder === nf && String(x.pos) === np);
      if (clash && !confirm(`Номер ${np} в папке ${fl(nf)} уже занят (${swLabel(clash)}). Всё равно переместить?`)) return;
      logEvt('move', `${swLabel(s)}: папка ${fl(s.folder)} №${s.pos} → папка ${fl(nf)} №${np}`, s.id);
      s.folder = nf; s.pos = np; delete s.conflict;
      save(); openSwatch(s.id); render(); toast(`Перемещено: папка ${fl(nf)}, №${np}`);
    };
  });
}
function editForm(s) {
  openModal(`<span class="microlabel">Действие</span><h2 style="margin:8px 0 6px">Редактировать выкрас</h2>${swatchFields(s)}
    <label class="small muted" style="display:block;margin-top:10px">Записи «где искать» (по одной на строку)<textarea id="eRefs">${esc((s.refs || []).join('\n'))}</textarea></label>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="eOk">Сохранить</button><button class="btn" id="eCancel">Отмена</button></div>`,
  body => {
    $('#eCancel', body).onclick = () => openSwatch(s.id);
    $('#eOk', body).onclick = () => {
      const v = readSwatchFields(body); if (!v) return;
      const clash = db.swatches.find(x => x.id !== s.id && x.folder === v.folder && String(x.pos) === String(v.pos));
      if (clash && !confirm(`Номер ${v.pos} в папке ${fl(v.folder)} уже занят (${swLabel(clash)}). Сохранить всё равно?`)) return;
      Object.assign(s, v, { refs: $('#eRefs', body).value.split('\n').map(x => x.trim()).filter(Boolean), updated: new Date().toISOString() });
      if (!clash) delete s.conflict;
      logEvt('edit', `Изменён: ${swLabel(s)} (папка ${fl(s.folder)} №${s.pos})`, s.id);
      save(); openSwatch(s.id); render(); toast('Сохранено');
    };
  });
}

/* ---- Поля формы выкраса (добавление/редактирование) ---- */
function datalist(id, values) { return `<datalist id="${id}">${[...new Set(values)].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`; }
function swatchFields(s = {}) {
  const paints = [...db.settings.paintOrder, ...db.swatches.map(x => x.paint)];
  const fans = [...db.settings.fanOrder, ...db.swatches.map(x => x.fan)];
  const colors = db.swatches.map(x => x.color);
  return `<div class="formgrid">
    <label>Краска *<input type="text" id="fPaintI" list="dlPaint" value="${esc(s.paint || '')}" placeholder="Инт 7А"></label>
    <label>Веер *<input type="text" id="fFanI" list="dlFan" value="${esc(s.fan || '')}" placeholder="NCS"></label>
    <label>Номер выкраса *<input type="text" id="fNumI" value="${esc(s.number || '')}" placeholder="0505-R50B"><span class="drfprev small muted" id="fDrfPrev">${drfPreview(s.fan, s.number)}</span></label>
    <label>Цвет словами *<input type="text" id="fColorI" list="dlColor" value="${esc(s.color || '')}" placeholder="серо-зелёный (шалфей)"></label>
    <label>Папка *<select id="fFolderI">${foldersSorted().map(f => `<option value="${f.no}" ${Number(s.folder) === f.no ? 'selected' : ''}>${fl(f.no)}. ${esc(f.name)} (${folderPositions(f.no)}/${db.settings.capacity})</option>`).join('')}</select></label>
    <label>Номер в папке<input type="text" id="fPosI" value="${esc(s.pos || '')}"></label>
    <label>Экземпляров<input type="number" min="1" id="fCopiesI" value="${esc(s.copies || 1)}"></label>
    <label>Кто сделал<input type="text" id="fMadeByI" list="dlMgr" value="${esc(s.madeBy || '')}"></label>
    <label>Дата изготовления<input type="date" id="fMadeDateI" value="${esc(s.madeDate || '')}"></label>
    <label class="wide">Примечание<input type="text" id="fNoteI" value="${esc(s.note || '')}" placeholder="напр. по Q-Base, подложка 2000N"></label>
  </div>${datalist('dlPaint', paints)}${datalist('dlFan', fans)}${datalist('dlColor', colors)}${datalist('dlMgr', db.settings.managers)}`;
}
function drfPreview(fan, number) {
  const d = drfInfo(fan, number);
  return d ? `${chipc(d.hex)} цвет DRF ${d.base}${d.mod ? ' (базовый)' : ''}` : '';
}
function readSwatchFields(body) {
  const v = {
    paint: $('#fPaintI', body).value.trim(), fan: $('#fFanI', body).value.trim(), number: $('#fNumI', body).value.trim(),
    color: $('#fColorI', body).value.trim(), folder: Number($('#fFolderI', body).value), pos: $('#fPosI', body).value.trim(),
    copies: Math.max(1, parseInt($('#fCopiesI', body).value, 10) || 1), madeBy: $('#fMadeByI', body).value.trim(),
    madeDate: $('#fMadeDateI', body).value, note: $('#fNoteI', body).value.trim(),
  };
  for (const [k, label] of [['paint', 'Краска'], ['fan', 'Веер'], ['number', 'Номер выкраса'], ['color', 'Цвет словами']]) {
    if (!v[k]) { alert(`Заполните поле «${label}»`); return null; }
  }
  if (!v.pos) v.pos = placeInFolder(v.folder, v.paint, v.fan).pos;
  return v;
}
// Подбор папки для нового выкраса: у DRF — папка ближайшего по цвету листа,
// иначе по совпадению цветового семейства и краски с уже лежащими там
function suggestFolder(color, paint, fan, number) {
  const cap = db.settings.capacity;
  const drf = drfInfo(fan, number);
  if (drf) {
    const hit = nearestSheets(drf.hex, 5).find(x => x.de < 10 && folderPositions(x.s.folder) < cap);
    if (hit) return hit.s.folder;
  }
  const fam = familiesOf(color); if (!fam.length && !paint) return null;
  let best = null, bestScore = 0;
  db.folders.forEach(f => {
    const items = db.swatches.filter(s => s.folder === f.no); if (!items.length) return;
    let sc = 0;
    items.forEach(s => { const sf = familiesOf(s.color); const ov = fam.filter(x => sf.includes(x)).length; if (ov) sc += ov * (norm(s.paint) === norm(paint) ? 2 : 1); });
    sc = sc / items.length;
    // бонус за совпадение слов цвета с названием папки («светло-», «темно-», «тиффани»…)
    const fname = f.name.toLowerCase().replace(/ё/g, 'е');
    String(color || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/).filter(w => w.length >= 4).forEach(w => { if (fname.includes(w.slice(0, 5))) sc += 0.3; });
    if (folderPositions(f.no) >= cap) sc *= 0.01;
    if (sc > bestScore) { bestScore = sc; best = f.no; }
  });
  return best;
}

/* ---- Вкладка «Добавить» ---- */
function renderAdd(root) {
  root.innerHTML = `<span class="microlabel">Новый выкрас</span><h1>Добавить <em>новинку</em></h1>
  <div class="card corner">
    <span class="microlabel gray" style="margin-bottom:16px">01 · Один выкрас</span>
    <div id="addForm">${swatchFields({ folder: state.addFolder || '', copies: 1, madeBy: me(), madeDate: todayISO() })}</div>
    <div class="formgrid" style="margin-top:12px">
      <label class="wide">Где искать (спецификация/заказ)<input type="text" id="fRefI" placeholder="сп.123 от ${fmtDate(todayISO())}"></label>
    </div>
    <div id="addInfo" style="margin-top:10px"></div>
    <label id="fanOkWrap" class="row" style="display:none;margin-top:8px;gap:10px;font-weight:700;cursor:pointer"><input type="checkbox" id="fanOk" style="width:22px;height:22px"> Я проверил — веер указан правильно, всё равно добавить</label>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="addOk">Добавить в каталог</button><span class="muted small">Номер в папке подбирается по правилу раскладки (краска → веер): в конце папки — следующий номер, в середине — с буквой (15а, 15б…). Можно изменить вручную. Веер подставляется сам по номеру: S 1001-Y → NCS, S448 → TIK.</span></div>
  </div>
  <div class="card">
    <span class="microlabel gray">02 · Списком из Excel</span>
    <h2 style="margin-top:8px">Массовое добавление</h2>
    <div class="small muted">Скопируйте строки из Excel и вставьте сюда. Порядок колонок: <b>Краска · Веер · Номер · Цвет словами · Папка · Где искать</b> (последние две можно не заполнять — папка подберётся по цвету). Разделитель — табуляция (как при копировании из Excel) или «;».</div>
    <textarea id="bulk" placeholder="Инт 7А&#9;NCS&#9;1010-G10Y&#9;пастельно-зеленый&#9;6&#9;сп.400 от 06.10.26"></textarea>
    <div class="row" style="margin-top:10px"><button class="btn" id="bulkCheck">Проверить</button><button class="btn primary" id="bulkOk" disabled>Добавить всё</button></div>
    <div id="bulkPrev" style="margin-top:10px"></div>
  </div>`;
  const body = $('#addForm', root);
  const fSel = $('#fFolderI', body), posI = $('#fPosI', body);
  let userPickedFolder = !!state.addFolder;
  const info = () => {
    let no = Number(fSel.value);
    const v = { number: $('#fNumI', body).value.trim(), fan: $('#fFanI', body).value.trim(), paint: $('#fPaintI', body).value.trim() };
    // папка разделена на части (10/1, 10/2…) → выбрать часть по правилу раскладки
    let routeMsg = '';
    const routed = routePart(no, v.paint, v.fan);
    if (routed !== no) {
      if (!userPickedFolder) { const was = fl(no); fSel.value = String(routed); no = routed; routeMsg = `<div class="alert info">Папка ${was.split('/')[0]} разделена на части — по правилу раскладки этот выкрас пойдёт в папку <b>${fl(no)}</b>.</div>`; }
      else routeMsg = `<div class="alert warn">По правилу раскладки этот выкрас должен лежать в папке <b>${fl(routed)}</b>, а выбрана ${fl(no)}. <button class="btn sm" id="goRoute" data-r="${routed}">Перейти в ${fl(routed)}</button></div>`;
    }
    const n = folderPositions(no), cap = db.settings.capacity;
    const pl = placeInFolder(no, v.paint, v.fan);
    const ready = v.paint && v.fan && canonFan(v.fan);
    if (!posI.dataset.touched) posI.value = ready ? pl.pos : '';
    const fc = fanCheck(v.fan, v.number);
    const showFan = v.number && fc.problem && !(fc.problem === 'empty' && !v.fan && !v.number);
    $('#fanOkWrap', root).style.display = showFan && fc.problem !== 'empty' ? '' : 'none';
    const typed = posI.value.trim();
    const taken = typed && db.swatches.find(s => s.folder === no && String(s.pos).toLowerCase() === typed.toLowerCase());
    const dupes = v.number ? db.swatches.filter(s => matchCode(s, (v.fan ? v.fan + ' ' : '') + v.number) >= 2) : [];
    $('#addInfo', root).innerHTML =
      (n >= cap ? `<div class="alert bad">Папка ${fl(no)} заполнена (${n}/${cap}). Выберите другую папку или создайте новую.</div>` : n >= cap - 5 ? `<div class="alert warn">В папке ${fl(no)} осталось мест: ${cap - n}.</div>` : (typed ? `<div class="alert info">Ляжет в папку ${fl(no)} под номером <b>${esc(typed)}</b>${posI.dataset.touched ? ' (номер введён вручную)' : ` — по правилу раскладки: ${placeText(pl)}`}. Мест занято ${n}/${cap}.</div>` : `<div class="alert info">Ляжет в папку ${fl(no)}. Номер в папке появится, когда будут указаны краска и веер. Мест занято ${n}/${cap}.</div>`)) +
      routeMsg + (showFan ? `<div class="alert bad">⚠️ ${esc(fc.text)}</div>` : '') +
      (taken ? `<div class="alert bad">Номер ${esc(typed)} в папке ${fl(no)} уже занят: ${esc(swLabel(taken))}.</div>` : '') +
      (!posI.dataset.touched && v.paint && v.fan && !pl.fits ? `<div class="alert warn">Точно нужное место занято буквенными номерами — предложен ближайший свободный. Проверьте и при необходимости исправьте номер вручную.</div>` : '') +
      (dupes.length ? `<div class="alert warn">Такой номер уже есть в каталоге: ${dupes.slice(0, 5).map(d => `${esc(d.paint)} · ${esc(d.number)} — папка ${fl(d.folder)} №${esc(d.pos)}`).join('; ')}${dupes.length > 5 ? '…' : ''}</div>` : '');
  };
  fSel.onchange = () => { userPickedFolder = true; posI.dataset.touched = ''; info(); };
  $('#addInfo', root).addEventListener('click', e => {
    const b = e.target.closest('#goRoute'); if (!b) return;
    fSel.value = b.dataset.r; posI.dataset.touched = ''; info();
  });
  posI.oninput = () => { posI.dataset.touched = '1'; info(); };
  const autoFolder = () => {
    if (userPickedFolder) return info();
    const sug = suggestFolder($('#fColorI', body).value, $('#fPaintI', body).value, $('#fFanI', body).value, $('#fNumI', body).value);
    if (sug) fSel.value = String(sug);
    info();
  };
  ['#fColorI', '#fPaintI', '#fFanI', '#fNumI'].forEach(id => $(id, body).addEventListener('input', autoFolder));
  const fanI = $('#fFanI', body), numI = $('#fNumI', body);
  // Веер подставляется по номеру, пока пользователь сам не вписал веер
  numI.addEventListener('input', () => {
    if (!fanI.value.trim() || fanI.dataset.auto === '1') {
      const g = guessFan(numI.value);
      fanI.value = g ? (canonFan(g) || g) : ''; fanI.dataset.auto = g ? '1' : '';
    }
    $('#fanOk', root).checked = false; info();
  });
  fanI.addEventListener('input', () => { fanI.dataset.auto = ''; $('#fanOk', root).checked = false; info(); });
  info();
  $('#addOk', root).onclick = () => {
    const fc = fanCheck(fanI.value, numI.value);
    if (fc.problem === 'empty') { alert(fc.text + '\nВпишите веер (NCS, TIK, RAL…).'); return fanI.focus(); }
    if (fc.problem && !$('#fanOk', root).checked) {
      alert(fc.text + '\n\nЕсли вы уверены, что всё правильно, поставьте галочку «Я проверил — веер указан правильно».');
      return fanI.focus();
    }
    const v = readSwatchFields(body); if (!v) return;
    v.number = cleanNumber(v.fan, v.number);
    if (folderPositions(v.folder) >= db.settings.capacity && !db.swatches.some(s => s.folder === v.folder && String(s.pos) === String(v.pos))) {
      return alert(`В папке ${fl(v.folder)} уже ${db.settings.capacity} номеров — больше класть нельзя, папка сломается. Выберите другую папку.`);
    }
    if (db.swatches.some(s => s.folder === v.folder && String(s.pos).toLowerCase() === String(v.pos).toLowerCase())
        && !confirm(`Номер ${v.pos} в папке ${fl(v.folder)} уже занят. Всё равно добавить с этим номером?`)) return;
    const ref = $('#fRefI', root).value.trim();
    const s = { id: uid(), ...v, refs: ref ? [ref] : [], created: new Date().toISOString() };
    db.swatches.push(s);
    logEvt('create', `Добавлен: ${swLabel(s)} → папка ${fl(s.folder)} №${s.pos}`, s.id);
    save(); state.addFolder = String(v.folder); render(); toast(`Добавлено: папка ${fl(s.folder)}, №${s.pos}`);
    openSwatch(s.id);
  };

  // Массовое добавление
  let parsed = [];
  $('#bulkCheck', root).onclick = () => {
    const lines = $('#bulk', root).value.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
    const planned = []; parsed = [];
    lines.forEach((l, i) => {
      const c = (l.includes('\t') ? l.split('\t') : l.split(';')).map(x => x.trim());
      let [paint, fan, number, color, folderRaw, ref] = c;
      if (!fan && number) { const g = guessFan(number); if (g) fan = canonFan(g) || g; }   // веер по номеру
      if (fan && number) number = cleanNumber(fan, number);
      const r = { line: i + 1, paint, fan, number, color, ref: ref || '', err: '' };
      if (!paint || !fan || !number || !color) r.err = 'нужны Краска, Веер, Номер, Цвет';
      if (!r.err) { const fc = fanCheck(fan, number); if (fc.problem) r.err = fc.text + ' Исправьте строку или добавьте этот выкрас через форму «Один выкрас».'; }
      let folder = folderByLabel(folderRaw);
      if (!folder && String(folderRaw || '').trim()) r.err = `нет папки «${folderRaw}»`;
      if (!folder) folder = suggestFolder(color, paint, fan, number);
      if (folder && !/\//.test(String(folderRaw || ''))) folder = routePart(folder, paint, fan);   // часть разделённой папки по правилу
      if (!folderByNo(folder)) r.err = r.err || 'не удалось определить папку';
      r.folder = folder;
      if (!r.err) {
        const used = folderPositions(folder) + planned.filter(x => x.folder === folder).length;
        if (used >= db.settings.capacity) r.err = `папка ${fl(folder)} заполнена`;
        else {
          const pl = placeInFolder(folder, paint, fan, planned);
          r.pos = pl.pos; r.where = placeText(pl); r.fits = pl.fits;
          planned.push({ folder, pos: pl.pos, paint, fan, number });
        }
      }
      parsed.push(r);
    });
    const ok = parsed.filter(r => !r.err).length;
    $('#bulkPrev', root).innerHTML = parsed.length ? `<div class="tablewrap"><table><thead><tr><th>Стр.</th><th>Краска</th><th>Веер</th><th>Номер</th><th>Цвет</th><th>Куда</th><th>Где искать</th></tr></thead><tbody>
      ${parsed.map(r => `<tr><td>${r.line}</td><td>${esc(r.paint)}</td><td>${esc(r.fan)}</td><td class="code">${esc(r.number)}</td><td>${esc(r.color)}</td><td>${r.err ? `<span class="notfound">${esc(r.err)}</span>` : `<b>папка ${fl(r.folder)}, №${esc(r.pos)}</b><div class="small muted">${r.where || ''}</div>${r.fits === false ? '<div class="small" style="color:var(--warn)">проверьте номер</div>' : ''}`}</td><td>${esc(r.ref)}</td></tr>`).join('')}
      </tbody></table></div><div class="small muted" style="margin-top:6px">Будет добавлено: ${ok} из ${parsed.length}</div>` : '<div class="muted">Нет строк</div>';
    $('#bulkOk', root).disabled = !ok;
  };
  $('#bulkOk', root).onclick = () => {
    const ok = parsed.filter(r => !r.err); if (!ok.length) return;
    const now = new Date().toISOString();
    ok.forEach(r => db.swatches.push({ id: uid(), folder: r.folder, pos: r.pos, paint: r.paint, fan: r.fan, number: r.number, color: r.color, refs: r.ref ? [r.ref] : [], copies: 1, madeBy: me(), madeDate: todayISO(), note: '', created: now }));
    logEvt('create', `Массовое добавление: ${ok.length} выкрасов (${[...new Set(ok.map(r => 'папка ' + fl(r.folder)))].join(', ')})`);
    save(); toast(`Добавлено ${ok.length}`); render();
  };
}

/* ---- Вкладка «Выдано» ---- */
function renderLoans(root) {
  const act = db.loans.filter(l => !l.returned).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const done = db.loans.filter(l => l.returned).sort((a, b) => b.returned.localeCompare(a.returned)).slice(0, 200);
  const row = (l, active) => {
    const s = swById(l.swatchId) || { paint: '?', fan: '', number: '(удалён)', folder: '?', pos: '?' };
    return `<tr data-sw="${esc(l.swatchId)}"><td><b>${esc(l.to)}</b>${l.contact ? `<div class="small muted">${esc(l.contact)}</div>` : ''}</td>
      <td class="num">П.${fl(s.folder)} №${esc(s.pos)}</td><td>${esc(s.paint)}</td><td class="code">${esc(s.fan)} ${esc(s.number)}</td>
      <td>${fmtDate(l.date)}<div class="small muted">${esc(l.by || '')}</div></td>
      <td>${active ? `<span class="${isOverdue(l) ? 'status over' : ''}">${l.due ? fmtDate(l.due) : '—'}</span>` : fmtDate(l.returned)}</td>
      <td class="small">${esc(l.note || '')}</td>
      ${active ? `<td><button class="btn sm ok" data-ret="${l.id}">Вернуть</button></td>` : ''}</tr>`;
  };
  root.innerHTML = `<div class="row" style="align-items:flex-end"><div class="grow"><span class="microlabel">На руках · ${act.length}</span><h1>Выданные <em>выкрасы</em></h1></div><input type="search" id="lq" placeholder="Поиск по фамилии или номеру" style="max-width:320px;border-radius:999px;margin-bottom:18px"></div>
  ${act.length ? `<div class="tablewrap" id="actTbl"><table><thead><tr><th>Кому</th><th>Где лежал</th><th>Краска</th><th>Номер</th><th>Выдан</th><th>Вернёт до</th><th>Комментарий</th><th></th></tr></thead><tbody>${act.map(l => row(l, true)).join('')}</tbody></table></div>` : '<div class="card empty">Сейчас ничего не выдано</div>'}
  <h2>История возвратов</h2>
  ${done.length ? `<div class="tablewrap"><table><thead><tr><th>Кому</th><th>Где лежит</th><th>Краска</th><th>Номер</th><th>Выдан</th><th>Возвращён</th><th>Комментарий</th></tr></thead><tbody>${done.map(l => row(l, false)).join('')}</tbody></table></div>` : '<div class="muted">Пока пусто</div>'}`;
  bindRows(root);
  $$('[data-ret]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const l = db.loans.find(x => x.id === b.dataset.ret); const s = swById(l.swatchId);
    if (!s) { l.returned = todayISO(); save(); render(); return; }
    if (confirm(`Принять возврат от ${l.to}?\nПоложить: папка ${fl(s.folder)}, номер ${s.pos}.`)) returnForm(s, l.id);
  });
  $('#lq', root).oninput = e => {
    const w = e.target.value.toLowerCase();
    $$('tbody tr', root).forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(w) ? '' : 'none');
  };
}

/* ---- Вкладка «Журнал» ---- */
function renderLog(root) {
  const names = { issue: 'Выдача', return: 'Возврат', create: 'Добавление', edit: 'Изменение', move: 'Перемещение', delete: 'Удаление', ref: 'Где искать', folder: 'Папка', renumber: 'Перенумерация', import: 'Импорт', init: 'Начало', settings: 'Настройки' };
  root.innerHTML = `<div class="row" style="align-items:flex-end"><div class="grow"><span class="microlabel">История · ${db.log.length} записей</span><h1>Журнал <em>действий</em></h1></div><input type="search" id="lgq" placeholder="Фильтр" style="max-width:320px;border-radius:999px;margin-bottom:18px"></div>
  <div class="tablewrap"><table><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Описание</th></tr></thead><tbody>
  ${db.log.slice(0, 1000).map(e => `<tr ${e.swatchId && swById(e.swatchId) ? `data-sw="${esc(e.swatchId)}"` : ''}><td class="small" style="white-space:nowrap">${fmtDateTime(e.t)}</td><td>${esc(e.who)}</td><td>${esc(names[e.action] || e.action)}</td><td>${esc(e.text)}</td></tr>`).join('')}
  </tbody></table></div>`;
  bindRows(root);
  $('#lgq', root).oninput = e => { const w = e.target.value.toLowerCase(); $$('tbody tr', root).forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(w) ? '' : 'none'); };
}

/* ---- Вкладка «Настройки» ---- */
function renderSettings(root) {
  const so = db.settings;
  root.innerHTML = `<span class="microlabel">Параметры</span><h1>Настройки</h1>
  <div class="card"><span class="microlabel gray">Менеджеры</span>
    <div class="small muted">По одному на строку. Сюда можно дописать Менеджер 3, Менеджер 4, Менеджер 5 и любое другое имя. Выбранный в поле «Я» человек записывается в журнал при выдаче, возврате и добавлении.</div>
    <textarea id="sMgr" style="min-height:80px">${esc(so.managers.join('\n'))}</textarea>
  </div>
  <div class="card"><span class="microlabel gray">Папки</span>
    <div class="formgrid">
      <label>Максимум номеров в папке<input type="number" id="sCap" min="1" value="${so.capacity}"></label>
      <label>Срок выдачи по умолчанию, дней<input type="number" id="sDays" min="1" value="${so.loanDays}"></label>
    </div>
    <h3>Названия папок</h3>
    <div class="formgrid">${foldersSorted().map(f => `<label class="wide">Папка ${fl(f.no)}<input type="text" data-fname="${f.no}" value="${esc(f.name)}"></label>`).join('')}</div>
  </div>
  <div class="card"><span class="microlabel gray">Порядок внутри папки</span>
    <div class="small muted">Используется для сортировки «как должно быть» и для перенумерации папки.</div>
    <div class="formgrid"><label>Краски (по одной на строку)<textarea id="sPaint" style="min-height:200px">${esc(so.paintOrder.join('\n'))}</textarea></label>
    <label>Веера<textarea id="sFan" style="min-height:200px">${esc(so.fanOrder.join('\n'))}</textarea></label></div>
  </div>
  <div class="row"><button class="btn primary" id="sSave">Сохранить настройки</button></div>

  <div class="card" style="margin-top:20px"><span class="microlabel gray">Данные и резервные копии</span>
    <div class="alert info">Каталог общий и лежит в Google Таблице. Его видят все компьютеры. Меняет данные только тот, кто в списке «Я» выбрал «Администратор».</div>
    <div class="row">
      <button class="btn" id="dXlsx">⬇ Выгрузить в Excel</button>
      <button class="btn" id="dJson">⬇ Резервная копия (JSON)</button>
      <label class="btn">⬆ Восстановить из JSON<input type="file" id="dJsonIn" accept=".json,application/json" hidden></label>
      <label class="btn">⬆ Загрузить каталог из Excel<input type="file" id="dXlsxIn" accept=".xlsx,.xls" hidden></label>
      <button class="btn danger" id="dReset">Сбросить к исходным данным</button>
    </div>
    <div class="small muted" style="margin-top:8px">Загрузка из Excel: первая строка — заголовки. Нужны колонки «Краска», «Веер», «Номер», «ГДЕ» (номер папки), «Цвет словами»; по желанию «ID» (номер в папке) и «ГДЕ ИСКАТЬ». Каталог будет заменён.</div>
    <div class="small muted" style="margin-top:8px">Последнее сохранение копии: ${localStorage.getItem('vykrasy-last-backup') ? fmtDateTime(localStorage.getItem('vykrasy-last-backup')) : 'ещё не делали'}</div>
  </div>`;

  $('#sSave', root).onclick = () => {
    const lines = id => $(id, root).value.split('\n').map(x => x.trim()).filter(Boolean);
    so.managers = lines('#sMgr'); so.paintOrder = lines('#sPaint'); so.fanOrder = lines('#sFan');
    so.capacity = Math.max(1, parseInt($('#sCap', root).value, 10) || 80);
    so.loanDays = Math.max(1, parseInt($('#sDays', root).value, 10) || 14);
    $$('[data-fname]', root).forEach(i => { const f = folderByNo(i.dataset.fname); if (f && i.value.trim()) f.name = i.value.trim(); });
    logEvt('settings', 'Изменены настройки'); save(); fillMe(); toast('Настройки сохранены');
  };
  $('#dXlsx', root).onclick = exportXlsx;
  $('#dJson', root).onclick = () => {
    download(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }), `vykrasy-backup-${todayISO()}.json`);
    localStorage.setItem('vykrasy-last-backup', new Date().toISOString());
  };
  $('#dJsonIn', root).onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(t => {
      const d = JSON.parse(t);
      if (!d.swatches || !d.folders) throw new Error('Это не файл резервной копии каталога');
      if (!confirm(`Восстановить копию: ${d.swatches.length} выкрасов, ${d.folders.length} папок? Текущие данные будут заменены.`)) return;
      db = d; db.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), d.settings || {}); db.loans = d.loans || []; db.log = d.log || [];
      logEvt('import', `Восстановлено из резервной копии ${file.name}`); save(); fillMe(); render(); toast('Восстановлено');
    }).catch(err => alert('Ошибка: ' + err.message));
  };
  $('#dXlsxIn', root).onchange = e => { const file = e.target.files[0]; if (file) importXlsx(file); };
  $('#dReset', root).onclick = () => {
    if (!confirm('Удалить все изменения, выдачи и журнал и вернуть исходный каталог?')) return;
    if (!confirm('Точно? Рекомендуем сначала сделать резервную копию.')) return;
    const keepSettings = db.settings; db = seedDb(); db.settings = keepSettings; save(); render(); toast('Сброшено');
  };
}

/* ---------------- Excel ---------------- */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportXlsx() {
  if (!window.XLSX) return alert('Модуль Excel не загрузился');
  const sw = [...db.swatches].sort(sortBF).map(s => {
    const a = availability(s);
    return {
      'ID': s.pos, 'Краска': s.paint, 'Веер': s.fan, 'Номер': s.number, 'ГДЕ': fl(s.folder), 'Название папки': folderName(s.folder),
      'Цвет словами': s.color, 'Статус': a.loans.length ? `Выдан: ${a.loans.map(l => l.to + (l.due ? ' до ' + fmtDate(l.due) : '')).join('; ')}` : 'В наличии',
      'Экземпляров': a.copies, 'ГДЕ ИСКАТЬ': (s.refs || []).join('; '), 'Кто сделал': s.madeBy || '', 'Дата изготовления': s.madeDate ? fmtDate(s.madeDate) : '', 'Примечание': s.note || '',
    };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sw);
  ws['!cols'] = [6, 18, 9, 26, 6, 40, 30, 30, 8, 40, 16, 12, 30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Выкрасы');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(foldersSorted().map(f => ({ 'Номер': fl(f.no), 'Название': f.name, 'Занято': folderPositions(f.no), 'Лимит': db.settings.capacity }))), 'Названия папок');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.loans.map(l => { const s = swById(l.swatchId) || {}; return { 'Кому': l.to, 'Контакт': l.contact || '', 'Папка': fl(s.folder), 'ID': s.pos, 'Краска': s.paint, 'Веер': s.fan, 'Номер': s.number, 'Выдан': fmtDate(l.date), 'Выдал': l.by, 'Вернуть до': fmtDate(l.due), 'Возвращён': fmtDate(l.returned), 'Комментарий': l.note || '' }; })), 'Выдачи');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.log.map(e => ({ 'Когда': fmtDateTime(e.t), 'Кто': e.who, 'Действие': e.action, 'Описание': e.text }))), 'Журнал');
  XLSX.writeFile(wb, `Каталог выкрасов ${todayISO()}.xlsx`);
  localStorage.setItem('vykrasy-last-backup', new Date().toISOString());
}
function importXlsx(file) {
  if (!window.XLSX) return alert('Модуль Excel не загрузился');
  file.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => /выкрас|каталог/i.test(n)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const hi = rows.findIndex(r => r.some(c => /краска/i.test(String(c))) && r.some(c => /номер/i.test(String(c))));
    if (hi < 0) throw new Error('Не найдена строка заголовков (нужны «Краска» и «Номер»)');
    const H = rows[hi].map(c => String(c).toLowerCase().replace(/\(.*?\)/g, '').trim());
    const col = (...re) => H.findIndex(h => re.some(r => r.test(h)));
    const ci = { id: col(/^a\b/, /^id$/), paint: col(/краск/), fan: col(/веер/), num: col(/^d\b/, /^номер$/), folder: col(/^f\b/, /^где$/), color: col(/цвет/), ref: col(/где искать/), copies: col(/экземпляр/) };
    if (ci.num < 0) ci.num = H.findIndex(h => /номер/.test(h));
    if (ci.paint < 0 || ci.num < 0 || ci.folder < 0) throw new Error('Нужны колонки «Краска», «Номер», «ГДЕ»');
    // Названия папок со второго листа, если есть
    const fSheet = wb.SheetNames.find(n => /назван/i.test(n));
    const groups = new Map(); const counters = {};
    rows.slice(hi + 1).forEach(r => {
      const paint = String(r[ci.paint] || '').trim(), number = String(r[ci.num] || '').trim();
      const fRaw = String(r[ci.folder] == null ? '' : r[ci.folder]).replace(/\s+/g, '');
      const folder = /^\d+\/\d+$/.test(fRaw) ? fRaw : parseInt(fRaw, 10);   // «10/2» — часть разделённой папки
      if (!paint || !number || !folder) return;
      let pos = ci.id >= 0 ? String(r[ci.id] || '').trim() : '';
      if (!pos) { counters[folder] = (counters[folder] || 0) + 1; pos = String(counters[folder]); }
      const fan = ci.fan >= 0 ? String(r[ci.fan] || '').trim() : '';
      const key = [folder, pos, norm(paint), norm(fan), norm(number)].join('|');
      const ref = ci.ref >= 0 ? String(r[ci.ref] || '').trim() : '';
      if (!groups.has(key)) groups.set(key, { id: uid(), folder, pos, paint, fan, number: number.replace(/\s*\n\s*/g, ' '), color: ci.color >= 0 ? String(r[ci.color] || '').replace(/\s*\n\s*/g, ' ').trim() : '', refs: [], copies: 0, madeBy: '', madeDate: '', note: '', created: new Date().toISOString() });
      const g = groups.get(key); g.copies++;
      if (ci.copies >= 0 && parseInt(r[ci.copies], 10) > g.copies) g.copies = parseInt(r[ci.copies], 10);
      ref.split(/\s*;\s*/).filter(Boolean).forEach(x => { if (!g.refs.includes(x)) g.refs.push(x); });
    });
    const list = [...groups.values()];
    if (!list.length) throw new Error('Не найдено ни одной строки с данными');
    const cnt = {}; list.forEach(s => { const k = s.folder + '|' + s.pos; cnt[k] = (cnt[k] || 0) + 1; });
    list.forEach(s => { if (cnt[s.folder + '|' + s.pos] > 1) s.conflict = true; });
    const act = db.loans.filter(l => !l.returned).length;
    if (!confirm(`Найдено ${list.length} выкрасов в ${new Set(list.map(s => s.folder)).size} папках на листе «${sheetName}».\nЗаменить ими текущий каталог?${act ? `\n\nВнимание: ${act} активных выдач будут закрыты.` : ''}`)) return;
    const partNames = {};
    if (fSheet) {
      XLSX.utils.sheet_to_json(wb.Sheets[fSheet], { header: 1, defval: '' }).forEach(r => {
        const lbl = String(r[0]).replace(/\s+/g, '');
        if (/^\d+\/\d+$/.test(lbl)) { if (r[1]) partNames[lbl] = String(r[1]).trim(); return; }
        const m = String(r[0]).match(/^(\d+)\.?\s*(.*)$/); let no, name;
        if (m && m[2]) { no = +m[1]; name = m[2]; } else if (parseInt(r[0], 10) && r[1]) { no = parseInt(r[0], 10); name = String(r[1]); }
        if (no && name) { const f = folderByNo(no); if (f) f.name = name.trim(); else db.folders.push({ no, name: name.trim() }); }
      });
    }
    // «10/2» → внутренний номер части (создаём части, которых ещё нет)
    const partNo = lbl => {
      const [G, P] = lbl.split('/').map(Number);
      let f = db.folders.find(x => x.group === G && x.part === P);
      if (!f && P === 1 && folderByNo(G) && !folderByNo(G).group) { f = folderByNo(G); f.group = G; f.part = 1; }
      if (!f) { f = { no: Math.max(PART_BASE, ...db.folders.map(x => x.no)) + 1, group: G, part: P, name: (folderByNo(G) || {}).name || `Папка ${lbl}` }; db.folders.push(f); }
      if (partNames[lbl]) f.name = partNames[lbl];
      return f.no;
    };
    list.forEach(s => { if (typeof s.folder === 'string') s.folder = partNo(s.folder); });
    new Set(list.map(s => s.folder)).forEach(no => { if (!folderByNo(no)) db.folders.push({ no, name: `Папка ${no}` }); });
    db.folders.sort((a, b) => a.no - b.no);
    db.loans.filter(l => !l.returned).forEach(l => { l.returned = todayISO(); l.note = (l.note || '') + ' [закрыто при импорте]'; });
    db.swatches = list;
    logEvt('import', `Каталог загружен из Excel «${file.name}»: ${list.length} выкрасов`);
    save(); render(); toast('Каталог загружен');
  }).catch(err => alert('Ошибка импорта: ' + err.message));
}

/* ---------------- Общее ---------------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function updateBadge() {
  const b = $('#loanBadge'); if (!b || !db) return;
  const n = db.loans.filter(l => !l.returned).length, o = db.loans.filter(isOverdue).length;
  b.textContent = n || ''; b.classList.toggle('bad', o > 0); b.title = o ? `просрочено: ${o}` : '';
  const c = $('#statusChip');
  if (c) { c.className = 'hchip ' + (o ? 'bad' : n ? 'warn' : 'ok'); c.querySelector('span').textContent = o ? `Просрочено · ${o}` : n ? `Выдано · ${n}` : 'Всё на месте'; }
}
function fitMe() {} // оставлено для совместимости
// Меню «Я: менеджер» — собственное, чтобы шрифт был как во всём приложении
function setMe(name) { localStorage.setItem(ME_KEY, name); fillMe(); closeMeMenu(); render(); if (name) toast(canEdit() ? `Администратор: можно менять каталог` : `Просмотр: ${name}`); }
function closeMeMenu() { const m = $('#meMenu'); if (m) m.hidden = true; const b = $('#meBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
function openMeMenu() {
  const m = $('#meMenu'); m.hidden = false; $('#meBtn').setAttribute('aria-expanded', 'true');
  const it = m.querySelector('.me-item.on') || m.querySelector('.me-item'); if (it) it.focus();
}
function fillMe() {
  const cur = me();
  const managers = (db && db.settings && db.settings.managers) || DEFAULT_SETTINGS.managers;
  const names = [...new Set([...managers, ...(cur ? [cur] : [])])];
  $('#meBox').classList.toggle('set', !!cur);
  $('#meName').textContent = cur || 'Выберите себя';
  $('#meMenu').innerHTML =
    `<div class="me-head">Кто сейчас работает?</div>` +
    names.map(n => `<button type="button" class="me-item ${n === cur ? 'on' : ''}" role="option" aria-selected="${n === cur}" data-name="${esc(n)}"><i></i><span>${esc(n)}</span>${n === cur ? '<b>✓</b>' : ''}</button>`).join('') +
    (names.length ? '' : '<div class="me-empty">Список пуст</div>') +
    `<div class="me-sep"></div>` +
    `<button type="button" class="me-item me-add" data-act="settings"><span>＋ Добавить менеджера</span></button>` +
    (cur ? `<button type="button" class="me-item me-out" data-name=""><span>Выйти</span></button>` : '');
  $$('#meMenu .me-item').forEach(b => b.onclick = () => {
    if (b.dataset.act === 'settings') {
      if (!canEdit()) { toast('Сначала выберите «Администратор». Добавлять менеджеров может только он.'); return; }
      closeMeMenu(); setView('settings'); setTimeout(() => { const t = $('#sMgr'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } }, 50); return;
    }
    setMe(b.dataset.name);
  });
}

async function bootCatalog() {
  const note = $('#roleNote');
  if (note) { note.hidden = false; note.innerHTML = '<div class="alert info">Загружаю каталог из Google Таблицы…</div>'; }
  try {
    let remote = await pullDb();
    if (!remote.swatches.length) {
      db = seedDb();
      const response = await fetch(SHEETS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ op: 'replace', db }) });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || 'не удалось записать исходный каталог');
      remote = normalizeDb(db);
    }
    applyRemote(remote);
  } catch (e) {
    load();
    fillMe();
    updateBadge();
    render();
    toast('Нет связи с Google Таблицей. Показана копия с этого компьютера.');
  }
  clearInterval(pullTimer);
  pullTimer = setInterval(async () => {
    if (pushing || !$('#modal').hidden) return;
    const active = document.activeElement;
    if (active && active.matches && active.matches('input, textarea, select')) return;
    try {
      const remote = await pullDb();
      if (JSON.stringify(remote) !== remoteStamp) applyRemote(remote);
    } catch (e) { /* следующая попытка через несколько секунд */ }
  }, 8000);
}
function init() {
  fillMe();
  $('#meBtn').onclick = e => { e.stopPropagation(); $('#meMenu').hidden ? openMeMenu() : closeMeMenu(); };
  document.addEventListener('click', e => { if (!e.target.closest('#meBox')) closeMeMenu(); });
  $('#meMenu').addEventListener('keydown', e => {
    const items = $$('#meMenu .me-item'); const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    if (e.key === 'Escape') { closeMeMenu(); $('#meBtn').focus(); }
  });
  $$('#tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view, b.dataset.view === 'folders' ? { openFolder: null } : {})));
  $('#modalClose').onclick = closeModal;
  $('#statusChip').onclick = () => setView('loans');
  // Переключатель темы
  const applyTheme = t => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('vykrasy-theme', t);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#F4EFE3' : '#060704';
    $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    fitMe();
  };
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeSet)));
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  // Превью цвета DRF в формах добавления и редактирования
  document.addEventListener('input', e => {
    if (e.target.id !== 'fNumI' && e.target.id !== 'fFanI') return;
    const box = e.target.closest('.formgrid'), p = box && $('#fDrfPrev', box);
    if (p) p.innerHTML = drfPreview($('#fFanI', box).value, $('#fNumI', box).value);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  // Синхронизация между вкладками браузера
  window.addEventListener('storage', e => { if (e.key === STORAGE_KEY && e.newValue) { db = JSON.parse(e.newValue); updateBadge(); if ($('#modal').hidden) render(); } });
  updateBadge();
  bootCatalog();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Экспорт для тестов
window.__vyk = { splitOptions, routePart, fl, guessFan, fanCheck, familiesOf, matchCode, codeNorm, refDate, looksLikeCode, placeInFolder, cmpPos, drfInfo, nearestSheets, suggestFolder, get db() { return db; } };
document.addEventListener('DOMContentLoaded', init);
})();
