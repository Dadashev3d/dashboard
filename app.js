// ===== Хранилище =====
const KEY = 'dashboard.v1';
const defaults = () => ({
  name: '', exBalance: {}, flKeywords: '', exUse: [], // exUse — биржи, которыми человек пользуется
  tasks: [], projects: [], notes: [], habits: [], tx: [], events: [], agents: [],
  city: null,
  links: CORE_LINKS.map((l) => ({ id: uid(), ...l })),
});
// Основные сервисы. app: 'chrome' — плитка запускает сам браузер Chrome.
const CORE_LINKS = [
  { icon: '✉️', title: 'Gmail', url: 'https://mail.google.com' },
  { icon: '🌐', title: 'Google Chrome', url: 'https://www.google.com', app: 'chrome' },
  { icon: '📨', title: 'Outlook', url: 'https://outlook.live.com/mail/0/inbox' },
  { icon: '📁', title: 'Google Диск', url: 'https://drive.google.com' },
];
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
function migrateLinks() {
  if ((S.linksV || 0) >= 2) return;
  // убрать Яндекс Новости / Дзен и старую «Почту» (её заменяет Gmail)
  S.links = S.links.filter((l) => !/dzen\.ru|news\.yandex/.test(l.url) && !(l.title === 'Почта' && /mail\.google/.test(l.url)));
  const core = CORE_LINKS.filter((c) => !S.links.some((l) => (c.app ? l.app === c.app : hostOf(l.url) === hostOf(c.url))))
    .map((c) => ({ id: uid(), ...c }));
  S.links = [...core, ...S.links];
  S.linksV = 2;
  const s = JSON.stringify(S);
  if (API() && !S._fromLocal) API().save(s); else localStorage.setItem(KEY, s);
}
let S = defaults();
// В приложении данные хранятся в файле через Python (window.pywebview.api),
// в обычном браузере — в localStorage.
const API = () => window.pywebview?.api;
async function load() {
  let raw = null;
  try { raw = API() ? await API().load() : localStorage.getItem(KEY); } catch {}
  let saved = null;
  try { saved = JSON.parse(raw); } catch {}
  S = Object.assign(defaults(), saved || {});
  // Биржи — по выбору. У тех, кто уже пользовался программой до выбора, оставляем все.
  if (saved && saved.name && !Array.isArray(saved.exUse)) S.exUse = ['kwork', 'fl', 'freelance', 'freelancer', 'upwork', 'fiverr'];
  S.links.forEach((l) => { if (!l.icon) l.icon = '🔗'; });
  if (!API()) Object.defineProperty(S, '_fromLocal', { value: true, enumerable: false });
  migrateLinks();
}
function save() {
  W = null;
  S.updatedAt = Date.now(); // время правки: по нему компьютер и телефон понимают, чья копия новее
  const s = JSON.stringify(S);
  // данные из localStorage никогда не перезаписывают файл приложения
  if (API() && !S._fromLocal) { API().save(s); syncSoon(); } else localStorage.setItem(KEY, s);
  renderOverview(); renderBell();
}
// Синхронизация с другими устройствами: если в Google лежит копия новее (правки с телефона
// или другого компьютера) — подтягиваем её. Свои неотправленные правки не затираем.
let syncRemoteMark = '', syncPulling = false;
async function syncPull() {
  if (!API()?.cloud_peek || S._fromLocal || syncPulling) return;
  const el = document.activeElement; // человек что-то печатает — не мешаем, проверим позже
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value) return;
  syncPulling = true;
  try {
    const r = await API().cloud_peek(syncRemoteMark);
    if (!r?.ok || r.busy) return;
    if (r.last) syncRemoteMark = r.last;
    if (r.same || r.none || !r.data) return;
    const remote = JSON.parse(r.data);
    if ((remote.updatedAt || 0) <= (S.updatedAt || 0)) return;
    S = Object.assign(defaults(), remote);
    API().save(JSON.stringify(S), false); // только к себе, обратно в Google не отправляем
    renderAll();
  } catch {} finally { syncPulling = false; }
}

// ☁️ рядом с колокольчиком: сохранены ли изменения в Google
let syncTimer = null;
function syncSoon() {
  setSync('wait');
  clearTimeout(syncTimer); syncTimer = setTimeout(checkSync, 4000);
}
function setSync(st, title) {
  const b = $('#syncBtn'); if (!b) return;
  b.dataset.st = st;
  $('#syncMark').textContent = { ok: '✓', wait: '…', err: '!', off: '✕' }[st] || '';
  b.title = title || { ok: 'Всё сохранено в Google', wait: 'Сохраняю в Google…', off: 'Сохранение в Google не включено' }[st] || '';
}
async function checkSync() {
  if (!API()?.cloud_sync_state) return;
  let st; try { st = await API().cloud_sync_state(); } catch { return; }
  if (!st.drive) return setSync('off', 'Сохранение в Google не включено — «Настройки» → «Разрешить резервные копии»');
  if (st.pending || st.busy) { clearTimeout(syncTimer); syncTimer = setTimeout(checkSync, 3000); return setSync('wait'); }
  if (st.ok === false) return setSync('err', 'Не удалось сохранить в Google: ' + (st.error || ''));
  setSync('ok', st.at ? `Всё сохранено в Google — ${new Date(st.at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Всё сохранено в Google');
}

// ===== Утилиты =====
function uid() { return Math.random().toString(36).slice(2, 10); }
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); };
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const money = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const fmtDate = (s) => parseISO(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const dueChip = (due, done) => {
  if (!due) return '';
  const t = today();
  if (due < t && !done) return '<span class="chip red">Просрочено</span>';
  if (due === t) return '<span class="chip red">Сегодня</span>';
  if (due === tomorrow()) return '<span class="chip blue">Завтра</span>';
  return `<span class="chip">${fmtDate(due)}</span>`;
};
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};
const projectOf =(t) => S.projects.find((p) => p.id === t.project);

// ===== Иконки меню (линейные, цвет берут из текста) =====
const ICONS = {
  overview: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
  projects: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 11h18"/>',
  exchanges: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M3 12.5h18"/><path d="M11 12.5v2h2v-2"/>',
  notes: '<path d="M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8.5 12.5h7M8.5 16.5h5"/>',
  habits: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 12V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12v2.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  finance: '<path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M4 7.5V6.5A2.5 2.5 0 0 1 6.5 4H16v3.5"/><path d="M15 14.2h5"/><circle cx="15.8" cy="14.2" r=".6"/>',
  show: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/><path d="M3 5l1.5 1M21 5l-1.5 1M2 11h1.5M20.5 11H22"/>',
  analytics: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx=".8"/><rect x="10.5" y="5" width="3" height="13" rx=".8"/><rect x="16" y="8.5" width="3" height="9.5" rx=".8"/>',
  world: '<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1M2.5 8h1M4.1 4.1l.7.7M11.9 4.1l-.7.7"/><path d="M9.5 20.5h8.5a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10 1.3 3.2 3.2 0 0 0 1.1 6.3z"/>',
  converter: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
ICONS.more = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
document.querySelectorAll('nav button').forEach((b) => {
  const path = ICONS[b.dataset.view || (b.dataset.more && 'more')];
  if (path) b.insertAdjacentHTML('afterbegin',
    `<span class="nav-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`);
});

// ===== Навигация =====
const TAB_VIEWS = [...document.querySelectorAll('.tabbar button[data-view]')].map((b) => b.dataset.view);
function go(view) {
  if (view === 'show') { view = 'finance'; setFinSec('show'); } // «Шоу» — раздел внутри «Финансов»
  document.querySelectorAll('nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#tabMore')?.classList.toggle('active', !TAB_VIEWS.includes(view)); // раздел из «Ещё» — подсветить «Ещё»
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'analytics') renderAnalytics();
  if (view === 'converter') { renderConverter(); loadRates(); }
  document.body.classList.remove('menu-open'); // на телефоне — закрыть выезжающее меню
  window.scrollTo(0, 0);
}
// Узкий экран (телефон): меню выезжает по кнопке ☰
$('#menuBtn').onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('menu-open'); };
$('#menuShade').onclick = () => document.body.classList.remove('menu-open');
document.querySelectorAll('nav button[data-view]').forEach((b) => b.onclick = () => go(b.dataset.view));
document.querySelectorAll('[data-go]').forEach((c) => c.onclick = (e) => { e.stopPropagation(); go(c.dataset.go); });
// Нижнее меню телефона: «Ещё» открывает полное меню, «+» — новая задача
$('#tabMore').onclick = (e) => { e.stopPropagation(); document.body.classList.add('menu-open'); };
$('#fabAdd').onclick = () => { go('tasks'); setTimeout(() => $('#taskText').focus(), 60); };

// ===== Задачи =====
let taskFilter = 'active';
function addTask(text, extra = {}) {
  S.tasks.unshift({ id: uid(), text, due: null, done: false, prio: false, project: null, created: today(), ...extra });
  save(); renderTasks(); renderProjects(); renderCalendar();
}
$('#taskForm').onsubmit = (e) => {
  e.preventDefault();
  addTask($('#taskText').value.trim(), {
    due: $('#taskDue').value || null, prio: $('#taskPrio').checked, project: $('#taskProject').value || null,
  });
  $('#taskText').value = ''; $('#taskDue').value = ''; $('#taskPrio').checked = false;
};
document.querySelectorAll('#taskFilter button').forEach((b) => b.onclick = () => {
  taskFilter = b.dataset.f;
  document.querySelectorAll('#taskFilter button').forEach((x) => x.classList.toggle('active', x === b));
  renderTasks();
});
function toggleTask(t) {
  t.done = !t.done; t.doneAt = t.done ? today() : null;
  save(); renderTasks(); renderProjects(); renderCalendar();
}
function taskLi(t, { compact = false } = {}) {
  const li = document.createElement('li');
  if (t.done) li.className = 'done';
  const p = projectOf(t);
  li.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''}>
    <span class="grow">${esc(t.text)}${p && !compact ? ` <span class="proj-tag" style="--c:${esc(p.color)}">${esc(p.name)}</span>` : ''}</span>
    ${dueChip(t.due, t.done)}
    ${compact ? '' : `<button class="star ${t.prio ? 'on' : ''}" title="Приоритет">★</button><button class="del" title="Удалить">✕</button>`}`;
  li.querySelector('input').onchange = () => toggleTask(t);
  if (!compact) {
    li.querySelector('.star').onclick = () => { t.prio = !t.prio; save(); renderTasks(); };
    li.querySelector('.del').onclick = () => { S.tasks = S.tasks.filter((x) => x !== t); save(); renderTasks(); renderProjects(); renderCalendar(); };
  }
  return li;
}
function renderTasks() {
  $('#taskProject').innerHTML = '<option value="">Без проекта</option>' + S.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const list = $('#taskList'); list.innerHTML = '';
  const items = S.tasks.filter((t) => ({
    all: true, done: t.done, active: !t.done, prio: t.prio && !t.done,
  }[taskFilter]));
  if (!items.length) list.innerHTML = '<li class="empty">Пока пусто</li>';
  items.forEach((t) => list.appendChild(taskLi(t)));
}

// ===== Проекты =====
$('#projectForm').onsubmit = (e) => {
  e.preventDefault();
  S.projects.push({ id: uid(), name: $('#projectName').value.trim(), color: $('#projectColor').value });
  $('#projectName').value = '';
  save(); renderProjects(); renderTasks();
};
function projectStats(p) {
  const ts = S.tasks.filter((t) => t.project === p.id);
  const done = ts.filter((t) => t.done).length;
  return { ts, done, pct: ts.length ? Math.round(done / ts.length * 100) : 0 };
}
function renderProjects() {
  const box = $('#projectList'); box.innerHTML = '';
  if (!S.projects.length) { box.innerHTML = '<div class="empty">Проектов пока нет</div>'; return; }
  S.projects.forEach((p) => {
    const { ts, done, pct } = projectStats(p);
    const c = document.createElement('div');
    c.className = 'card project-card';
    c.style.setProperty('--c', p.color);
    c.innerHTML = `<div class="card-head"><h4>${esc(p.name)}</h4><button class="del">✕</button></div>
      <div class="muted">${done} из ${ts.length} задач · ${pct}%</div>
      <div class="bar"><div style="width:${pct}%;background:${esc(p.color)}"></div></div>
      <form class="row-form compact"><input placeholder="Новая задача в проект" required><button>+</button></form>
      <ul class="list"></ul>`;
    const ul = c.querySelector('ul');
    ts.filter((t) => !t.done).forEach((t) => ul.appendChild(taskLi(t, { compact: true })));
    c.querySelector('form').onsubmit = (e) => { e.preventDefault(); addTask(e.target[0].value.trim(), { project: p.id }); };
    c.querySelector('.del').onclick = () => {
      if (!confirm(`Удалить проект «${p.name}»? Задачи останутся, но без проекта.`)) return;
      S.tasks.forEach((t) => { if (t.project === p.id) t.project = null; });
      S.projects = S.projects.filter((x) => x !== p); save(); renderProjects(); renderTasks();
    };
    box.appendChild(c);
  });
}

// ===== Заметки =====
let curNote = null;
$('#newNoteBtn').onclick = () => {
  const n = { id: uid(), title: '', body: '', updated: Date.now() };
  S.notes.unshift(n); curNote = n.id; save(); renderNotes(); $('#noteTitle').focus();
};
let noteTimer;
['#noteTitle', '#noteBody'].forEach((s) => $(s).oninput = () => {
  const n = S.notes.find((x) => x.id === curNote);
  if (!n) { $('#newNoteBtn').click(); return; }
  n.title = $('#noteTitle').value; n.body = $('#noteBody').value; n.updated = Date.now();
  $('#noteSaved').textContent = 'Сохраняю…';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { save(); renderNoteList(); $('#noteSaved').textContent = 'Сохранено'; }, 500);
});
$('#delNoteBtn').onclick = () => {
  if (!curNote || !confirm('Удалить заметку?')) return;
  S.notes = S.notes.filter((x) => x.id !== curNote); curNote = S.notes[0]?.id || null; save(); renderNotes();
};
function renderNoteList() {
  const ul = $('#noteList'); ul.innerHTML = '';
  if (!S.notes.length) ul.innerHTML = '<li class="empty">Заметок пока нет</li>';
  [...S.notes].sort((a, b) => b.updated - a.updated).forEach((n) => {
    const li = document.createElement('li');
    li.className = 'note-item' + (n.id === curNote ? ' sel' : '');
    li.innerHTML = `<div class="grow"><b>${esc(n.title || 'Без названия')}</b><div class="muted small">${esc(n.body.slice(0, 60))}</div></div>`;
    li.onclick = () => { curNote = n.id; renderNotes(); };
    ul.appendChild(li);
  });
}
function renderNotes() {
  if (!curNote && S.notes.length) curNote = S.notes[0].id;
  const n = S.notes.find((x) => x.id === curNote);
  $('#noteTitle').value = n?.title || ''; $('#noteBody').value = n?.body || ''; $('#noteSaved').textContent = '';
  renderNoteList();
}

// ===== Привычки =====
$('#habitForm').onsubmit = (e) => {
  e.preventDefault();
  S.habits.push({ id: uid(), name: $('#habitName').value.trim(), log: {} });
  $('#habitName').value = '';
  save(); renderHabits();
};
function streak(h) {
  let n = 0; const d = new Date();
  if (!h.log[iso(d)]) d.setDate(d.getDate() - 1); // сегодня ещё можно успеть
  while (h.log[iso(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const last7 = () => [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
function renderHabits() {
  const days = last7();
  const t = $('#habitTable');
  if (!S.habits.length) { t.innerHTML = '<tr><td class="empty">Добавьте первую привычку</td></tr>'; return; }
  t.innerHTML = `<tr><th>Привычка</th>${days.map((d) => `<th>${d.toLocaleDateString('ru-RU', { weekday: 'short' })}<br>${d.getDate()}</th>`).join('')}<th>Серия</th><th></th></tr>`;
  S.habits.forEach((h) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(h.name)}</td>` +
      days.map((d) => `<td><button class="hcell ${h.log[iso(d)] ? 'on' : ''}" data-d="${iso(d)}"></button></td>`).join('') +
      `<td class="streak">🔥 ${streak(h)}</td><td><button class="del">✕</button></td>`;
    tr.querySelectorAll('.hcell').forEach((b) => b.onclick = () => {
      const k = b.dataset.d; if (h.log[k]) delete h.log[k]; else h.log[k] = true;
      save(); renderHabits();
    });
    tr.querySelector('.del').onclick = () => {
      if (confirm(`Удалить привычку «${h.name}»?`)) { S.habits = S.habits.filter((x) => x !== h); save(); renderHabits(); }
    };
    t.appendChild(tr);
  });
}

// ===== Финансы =====
let finMonth = new Date(); finMonth.setDate(1);
$('#txDate').value = today();
$('#finPrev').onclick = () => { finMonth.setMonth(finMonth.getMonth() - 1); renderFinance(); };
$('#finNext').onclick = () => { finMonth.setMonth(finMonth.getMonth() + 1); renderFinance(); };
// Разделы финансов. «Шоу» — свой учёт (категории, бюджет), остальные — обычные операции с полем sec.
const FIN_SECS = [
  { id: 'all', name: 'Все' },
  { id: 'show', name: '🎆 Шоу' },
  { id: 'personal', name: '🏠 Личные', cat: 'Категория: еда, жильё, транспорт…', hint: 'Личные расходы: еда, жильё, транспорт, покупки' },
  { id: 'work', name: '💼 Рабочие', cat: 'Категория: реклама, оборудование…', hint: 'Рабочие расходы: оборудование, реклама, сервисы, поездки' },
  { id: 'dev', name: '👨‍💻 Программисты', cat: 'Программист (имя)', hint: 'Оплата программистам — в категории укажите имя, чтобы видеть, сколько ушло каждому' },
  { id: 'agents', name: '🤝 Агенты', cat: 'Агент (имя)', hint: 'Оплата агентам — в категории укажите имя агента' },
];
let finSec = 'all';
// Старые записи без раздела: расходы — «Личные», доходы — только во «Все»
const secOf = (t) => t.sec ?? (t.type === 'in' ? '' : 'personal');
const secName = (id) => FIN_SECS.find((x) => x.id === id)?.name || '';
function setFinSec(id) { finSec = id; renderFinance(); if (id === 'show') renderShow(); }

// «Платил долларами»: курс обмена, по которому меняли доллары, — сохраняется в записи
function usdField(pre) {
  const cur = $(`#${pre}Cur`), on = $(`#${pre}UsdOn`), inp = $(`#${pre}UsdRate`), wrap = $(`#${pre}UsdWrap`);
  const box = $(`#${pre}UsdBox`), sym = $(`#${pre}UsdSym`), calc = $(`#${pre}UsdCalc`), amt = $(`#${pre}Amount`);
  const num2 = (v) => parseFloat(String(v).replace(',', '.'));
  const sync = () => {
    const c = cur.value, isUsd = c === 'USD';
    wrap.classList.toggle('hidden', isUsd);
    box.classList.toggle('hidden', isUsd || !on.checked);
    sym.textContent = CURS[c];
    const wh = $(`#${pre}WalHint`), wt = (typeof W !== 'undefined') && wallet().byTo[c];
    wh.classList.toggle('hidden', !wt || isUsd || on.checked);
    if (wt) wh.textContent = wt.left > 1e-9
      ? `💱 Спишется из ваших обменов: на руках ${fmt(wt.left, c)} — сколько это в своих деньгах, посчитаю сам. Галочку ниже ставить не нужно.`
      : `💱 Наменянные ${CURS[c]} закончились — запишите новый обмен (кнопка «Поменял деньги» вверху) или укажите курс ниже.`;
    let cb = null; try { cb = conv(1, 'USD', c); } catch { /* курс ЦБ ещё не загружен */ }
    const a = num2(amt.value), r = num2(inp.value);
    calc.textContent = a > 0 && r > 0
      ? `Значит, вы отдали ${fmt(a / r, 'USD')} за ${fmt(a, c)}`
      : `Впишите, сколько ${CURS[c]} давали за 1 $${cb ? ` (по ЦБ сейчас ≈ ${+cb.toFixed(2)})` : ''} — посчитаю, сколько долларов ушло`;
  };
  cur.addEventListener('change', sync);
  inp.addEventListener('input', sync);
  amt.addEventListener('input', sync);
  on.addEventListener('change', () => { sync(); if (on.checked) inp.focus(); });
  // первый показ — из renderFinance/renderShow (валюты и курс к этому времени готовы)
  return {
    // undefined — не платил долларами; null — галочка стоит, а курс не указан
    value: () => (on.checked && cur.value !== 'USD' ? (num2(inp.value) > 0 ? num2(inp.value) : null) : undefined),
    reset: () => { on.checked = false; inp.value = ''; sync(); },
    focus: () => inp.focus(),
    sync,
  };
}
// ===== Страны: где потрачены / получены деньги =====
const COUNTRIES = [
  { id: 'AZ', name: 'Азербайджан', cur: 'AZN' },
  { id: 'TR', name: 'Турция', cur: 'TRY' },
  { id: 'RU', name: 'Россия', cur: 'RUB' },
  { id: 'EG', name: 'Египет', cur: 'EGP' },
  { id: 'CN', name: 'Китай', cur: 'CNY' },
];
const ctryOf = (id) => COUNTRIES.find((c) => c.id === id);
// Флаги рисуем SVG — на Windows эмодзи-флаги не отображаются
const starPts = (cx, cy, r, n = 5, rot = -90, inner = 0.4) => Array.from({ length: n * 2 }, (_, i) => {
  const a = (rot + i * 180 / n) * Math.PI / 180, rr = i % 2 ? r * inner : r;
  return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
}).join(' ');
const FLAG_BODY = {
  RU: '<rect width="30" height="20" fill="#fff"/><rect y="6.67" width="30" height="6.67" fill="#0039a6"/><rect y="13.33" width="30" height="6.67" fill="#d52b1e"/>',
  AZ: `<rect width="30" height="6.67" fill="#00b5e2"/><rect y="6.67" width="30" height="6.67" fill="#ef3340"/><rect y="13.33" width="30" height="6.67" fill="#509e2f"/><circle cx="14" cy="10" r="2.7" fill="#fff"/><circle cx="14.7" cy="10" r="2.2" fill="#ef3340"/><polygon points="${starPts(17.6, 10, 1.25, 8, -90, 0.5)}" fill="#fff"/>`,
  TR: `<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.25" cy="10" r="4" fill="#e30a17"/><polygon points="${starPts(17.3, 10, 2.1, 5, 180)}" fill="#fff"/>`,
  EG: '<rect width="30" height="6.67" fill="#ce1126"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#000"/><path d="M15 7.6l1.6 1.2-.5 2.6h-2.2l-.5-2.6z" fill="#c09300"/>',
  CN: `<rect width="30" height="20" fill="#ee1c25"/><polygon points="${starPts(5, 5, 3)}" fill="#ffde00"/><polygon points="${starPts(10, 2, 1)}" fill="#ffde00"/><polygon points="${starPts(12, 4, 1)}" fill="#ffde00"/><polygon points="${starPts(12, 7, 1)}" fill="#ffde00"/><polygon points="${starPts(10, 9, 1)}" fill="#ffde00"/>`,
};
const flag = (id, cls = '') => (FLAG_BODY[id] ? `<svg class="flag ${cls}" viewBox="0 0 30 20" aria-hidden="true">${FLAG_BODY[id]}</svg>` : '');
const ctryLabel = (id) => { const c = ctryOf(id); return c ? `${flag(id)} ${c.name}` : ''; };

// Выбор страны в форме: флажки; повторное нажатие — снять. При выборе ставится валюта страны.
function ctryPicker(boxId, curId, onPick) {
  let val = S.lastCountry || '';
  const draw = () => {
    $(boxId).innerHTML = COUNTRIES.map((c) => `<button type="button" class="ctry-chip${c.id === val ? ' on' : ''}" data-c="${c.id}">${flag(c.id)}<span>${c.name}</span></button>`).join('');
    $(boxId).querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
      val = val === b.dataset.c ? '' : b.dataset.c;
      S.lastCountry = val;
      if (val) { const sel = $(curId); sel.value = ctryOf(val).cur; sel.dispatchEvent(new Event('change')); }
      draw(); onPick?.();
    });
  };
  return { get: () => val, draw };
}
const txCtry = ctryPicker('#txCtry', '#txCur');
const shCtry = ctryPicker('#shCtry', '#shCur');
let finCountry = 'all';
const ctryOk = (r) => finCountry === 'all' || (finCountry === 'none' ? !r.country : r.country === finCountry);
function renderCtryTabs() {
  const used = new Set([...S.tx, ...(S.show?.items || [])].map((r) => r.country).filter(Boolean));
  const list = COUNTRIES.filter((c) => used.has(c.id) || c.id === finCountry);
  $('#finCtry').classList.toggle('hidden', !list.length);
  $('#finCtry').innerHTML = `<button type="button" class="ctry-chip${finCountry === 'all' ? ' on' : ''}" data-c="all">🌍 <span>Все страны</span></button>` +
    list.map((c) => `<button type="button" class="ctry-chip${c.id === finCountry ? ' on' : ''}" data-c="${c.id}">${flag(c.id)}<span>${c.name}</span></button>`).join('');
  $('#finCtry').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { finCountry = b.dataset.c; renderFinance(); renderShow(); });
}
const txUsd = usdField('tx');
$('#txForm').onsubmit = (e) => {
  e.preventDefault();
  const usdRate = txUsd.value();
  if (usdRate === null) { alert('Укажите курс: сколько за 1 доллар'); txUsd.focus(); return; }
  const sec = finSec === 'all' ? $('#txSec').value : finSec;
  S.tx.push({
    id: uid(), type: $('#txType').value, amount: parseFloat($('#txAmount').value), cur: $('#txCur').value,
    cat: $('#txCat').value.trim(), date: $('#txDate').value, note: $('#txNote').value.trim(),
    ...(sec ? { sec } : {}), ...(usdRate ? { usdRate } : {}), ...(txCtry.get() ? { country: txCtry.get() } : {}),
  });
  $('#txAmount').value = ''; $('#txNote').value = ''; txUsd.reset();
  save(); renderFinance(); renderExchanges();
};

// ----- Валюты: ₽, $, € и курс ЦБ для пересчёта в рубли -----
const CURS = { RUB: '₽', USD: '$', EUR: '€', AZN: '₼', TRY: '₺', CNY: '¥', EGP: 'E£' };
const curOf = (t) => t.cur || 'RUB';
const fmt = (n, cur = 'RUB') => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + CURS[cur];
const rate = (cur) => (cur === 'RUB' ? 1 : S.rates?.[cur] || null);
const toRub = (amount, cur) => amount * (rate(cur) ?? 0);
// Разбирает «1500», «25$», «$25», «20 €», «20eur» → { n, cur }
function parseMoney(s) {
  s = String(s || '').trim();
  const cur = /\$|usd|дол/i.test(s) ? 'USD' : /€|eur|евро/i.test(s) ? 'EUR' : /₼|azn|манат/i.test(s) ? 'AZN' : /₺|try|лир/i.test(s) ? 'TRY' : /¥|cny|юан/i.test(s) ? 'CNY' : /e£|egp|фунт/i.test(s) ? 'EGP' : 'RUB';
  return { n: num(s.replace(/[^\d.,\s]/g, '')), cur };
}
async function loadRates() {
  try {
    const j = await fetch('https://www.cbr-xml-daily.ru/daily_json.js').then((r) => r.json());
    const r1 = (c) => j.Valute[c].Value / (j.Valute[c].Nominal || 1);
    S.rates = { USD: r1('USD'), EUR: r1('EUR'), AZN: r1('AZN'), ...Object.fromEntries(['TRY', 'CNY', 'EGP'].filter((c) => j.Valute[c]).map((c) => [c, r1(c)])), date: j.Date.slice(0, 10) };
    save(); renderFinance(); renderExchanges(); renderConverter();
  } catch { /* остаётся последний сохранённый курс */ }
}

// Запись, оплаченная долларами по своему курсу: сколько это в долларах
const usdOfRec = (t) => (t.usdRate > 0 && curOf(t) !== 'USD' ? t.amount / t.usdRate : null);
// Перевод записи в валюту: по своему курсу обмена, если он записан, иначе по курсу ЦБ
const recConv = (t, to) => {
  const u = usdOfRec(t);
  if (u !== null) return conv(u, 'USD', to);
  const c = walletCost(t);
  if (!c) return conv(t.amount, curOf(t), to);
  let sum = 0;
  for (const [k, v] of Object.entries(c.parts)) { const x = conv(v, k, to); if (x === null) return null; sum += x; }
  if (c.short) { const x = conv(c.short, curOf(t), to); if (x === null) return null; sum += x; }
  return sum;
};
// Пересчитано не по ЦБ, а по реальному курсу (свой курс или обмен)
const ownRate = (t) => usdOfRec(t) !== null || (walletCost(t) && !walletCost(t).short);
const recRub = (t) => recConv(t, 'RUB') ?? 0;
const usdNote = (t) => {
  const u = usdOfRec(t);
  if (u !== null) return `<div class="muted small">оплачено ${fmt(u, 'USD')} · курс 1 $ = ${fmt(t.usdRate, curOf(t))}</div>`;
  const c = walletCost(t);
  if (!c) return '';
  return `<div class="muted small wal-note">💱 из обмена: ${walletText(c)} · ${walletRate(c, curOf(t))}${c.short ? ` · ещё ${fmt(c.short, curOf(t))} сверх обменов` : ''}</div>`;
};

const monthKey = (d) => iso(d).slice(0, 7);
function monthTotals(key, sec = 'all') {
  const tx = S.tx.filter((t) => t.date.startsWith(key) && (sec === 'all' || secOf(t) === sec));
  const byCur = {};
  tx.forEach((t) => {
    const c = (byCur[curOf(t)] ||= { inc: 0, out: 0 });
    c[t.type === 'in' ? 'inc' : 'out'] += t.amount;
  });
  const sumRub = (type) => tx.filter((t) => t.type === type).reduce((a, t) => a + recRub(t), 0);
  return { tx, inc: sumRub('in'), out: sumRub('out'), byCur };
}
function curLines(byCur, key) {
  return Object.keys(CURS).filter((c) => byCur[c]?.[key]).map((c) => fmt(byCur[c][key], c)).join(' + ');
}
// В какой валюте показывать итоги (выбирается кнопками над итогами)
const finView = () => S.finView || 'RUB';
function renderFinance() {
  const key = monthKey(finMonth);
  const sec = FIN_SECS.find((x) => x.id === finSec) || FIN_SECS[0];
  $('#finTabs').innerHTML = FIN_SECS.map((x) => `<button data-s="${x.id}" class="${x.id === finSec ? 'active' : ''}">${x.name}</button>`).join('');
  $('#finTabs').querySelectorAll('button').forEach((b) => b.onclick = () => setFinSec(b.dataset.s));
  const isShow = finSec === 'show';
  $('#finTx').classList.toggle('hidden', isShow);
  $('#finShow').classList.toggle('hidden', !isShow);
  $('#finMonthSwitch').classList.toggle('hidden', isShow);
  renderCtryTabs();
  renderWallet();
  if (isShow) return;
  txUsd.sync(); txCtry.draw();
  $('#txSecFld').classList.toggle('hidden', finSec !== 'all');
  $('#txFormTitle').textContent = finSec === 'all' ? 'Новая запись' : `Новая запись — ${sec.name}`;
  $('#txCatLbl').textContent = finSec === 'dev' ? 'Программист' : finSec === 'agents' ? 'Агент' : 'Категория';
  $('#txCat').placeholder = sec.cat || 'Например, «Еда» или «Зарплата»';
  $('#finSecHint').textContent = sec.hint || '';
  $('#finMonth').textContent = `${MONTHS[finMonth.getMonth()]} ${finMonth.getFullYear()}`;
  $('#catList').innerHTML = [...new Set(S.tx.filter((t) => finSec === 'all' || secOf(t) === finSec).map((t) => t.cat))].map((c) => `<option value="${esc(c)}">`).join('');
  const tx = monthTotals(key, finSec).tx.filter(ctryOk);

  // ---- Итоги: всё пересчитано в одну валюту, которую выбрали кнопками ----
  const vc = finView();
  const sumOf = (list) => { let total = 0, miss = false; list.forEach((t) => { const v = recConv(t, vc); if (v === null) miss = true; else total += v; }); return { total, miss }; };
  const outs = tx.filter((t) => t.type === 'out'), ins = tx.filter((t) => t.type === 'in');
  const o = sumOf(outs), i = sumOf(ins), bal = i.total - o.total;
  const asWritten = (list) => { const by = {}; list.forEach((t) => (by[curOf(t)] ||= { v: 0 }).v += t.amount); return curLines(by, 'v'); };
  const mixed = tx.some((t) => curOf(t) !== vc);
  const ap = mixed ? '≈ ' : '';
  $('#finSumTitle').textContent = `Итоги: ${MONTHS[finMonth.getMonth()].toLowerCase()}`;
  $('#finSummary').innerHTML = `
    <div class="fin-view"><span class="muted small">Считать в:</span>${Object.keys(CURS).map((c) => `<button type="button" class="sh-chip${c === vc ? ' on' : ''}" data-c="${c}">${CURS[c]}</button>`).join('')}</div>
    <div class="sum-row"><span>Расходы</span><b class="neg">${outs.length ? ap + fmt(o.total, vc) : '—'}</b></div>
    ${outs.length && mixed ? `<div class="muted small sum-sub">записано: ${asWritten(outs)}</div>` : ''}
    ${ins.length ? `<div class="sum-row"><span>Доходы</span><b class="pos">${ap}${fmt(i.total, vc)}</b></div>
      ${mixed ? `<div class="muted small sum-sub">записано: ${asWritten(ins)}</div>` : ''}
      <div class="sum-row total"><span>Остаток</span><b class="${bal >= 0 ? 'pos' : 'neg'}">${ap}${fmt(bal, vc)}</b></div>` : ''}
    ${o.miss || i.miss ? '<div class="muted small">Часть сумм не пересчитана: курс ЦБ ещё не загружен</div>'
      : mixed ? `<div class="muted small fin-howto">Как пересчитано: по вашим обменам и своему курсу, остальное — по курсу ЦБ${S.rates ? ` на ${fmtDate(S.rates.date)}` : ''}</div>` : ''}`;
  $('#finSummary').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { S.finView = b.dataset.c; save(); renderFinance(); });

  // ---- «Все» — расходы по разделам (включая шоу); в разделе — по категориям ----
  const bars = (rows, onClick) => {
    rows = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    if (!rows.length) return '<div class="empty">Нет расходов</div>';
    const max = rows[0].v, sum = rows.reduce((a, r) => a + r.v, 0);
    return rows.map((r) => `<div class="bar-row"${onClick ? ` data-s="${r.id}" style="cursor:pointer"` : ''}>
      <div class="lbl"><span>${r.name}</span><span>${ap}${fmt(r.v, vc)} · ${Math.round(r.v / sum * 100)}%</span></div>
      <div class="bar"><div style="width:${r.v / max * 100}%"></div></div></div>`).join('');
  };
  $('#finSecsCard').classList.toggle('hidden', finSec !== 'all');
  $('#finCatsCard').classList.toggle('hidden', finSec === 'all');
  if (finSec === 'all') {
    $('#finSecs').innerHTML = bars(FIN_SECS.filter((x) => x.id !== 'all').map((x) => ({
      id: x.id, name: x.name,
      v: x.id === 'show'
        ? showData().items.filter((it) => it.date.startsWith(key) && ctryOk(it)).reduce((a, it) => a + (recConv(it, vc) ?? 0), 0)
        : S.tx.filter((t) => t.type === 'out' && t.date.startsWith(key) && secOf(t) === x.id && ctryOk(t)).reduce((a, t) => a + (recConv(t, vc) ?? 0), 0),
    })), true);
    $('#finSecs').querySelectorAll('[data-s]').forEach((el) => el.onclick = () => setFinSec(el.dataset.s));
  } else {
    const cats = {};
    outs.forEach((t) => cats[t.cat] = (cats[t.cat] || 0) + (recConv(t, vc) ?? 0));
    $('#finCats').innerHTML = bars(Object.entries(cats).map(([name, v]) => ({ name: esc(name), v })));
  }
  {
    const pool = [...outs, ...(finSec === 'all' ? showData().items.filter((it) => it.date.startsWith(key) && ctryOk(it)) : [])];
    const by = {}; pool.forEach((t) => { const k = t.country || ''; by[k] = (by[k] || 0) + (recConv(t, vc) ?? 0); });
    const has = Object.keys(by).some(Boolean);
    $('#finCtryCard').classList.toggle('hidden', !has || finCountry !== 'all');
    if (has) $('#finCtryBars').innerHTML = bars(Object.entries(by).map(([k, v]) => ({ id: k, name: k ? ctryLabel(k) : 'Без страны', v })), true);
    $('#finCtryBars').querySelectorAll('[data-s]').forEach((el) => el.onclick = () => { finCountry = el.dataset.s || 'none'; renderFinance(); renderShow(); });
  }

  // ---- Операции: две строки — что и сколько; дата, раздел и как оплачено ----
  const list = $('#txList'); list.innerHTML = '';
  if (!tx.length) list.innerHTML = `<li class="empty">Нет записей${finSec === 'all' ? '' : ' в этом разделе'} за этот месяц</li>`;
  tx.sort((a, b) => b.date.localeCompare(a.date)).forEach((t) => {
    const c = curOf(t), other = c !== vc && !ownRate(t) ? recConv(t, vc) : null;
    const li = document.createElement('li');
    li.className = 'tx-row';
    li.innerHTML = `<div class="tx-main">
        <div class="tx-top"><span class="tx-cat">${esc(t.cat)}</span><b class="tx-sum ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'}${fmt(t.amount, c)}</b></div>
        <div class="muted small">${t.country ? flag(t.country, 'sm') + ' ' : ''}${fmtDate(t.date)}${finSec === 'all' && secOf(t) ? ` · ${secName(secOf(t))}` : ''}${t.note ? ` · ${esc(t.note)}` : ''}</div>
        ${usdNote(t)}${other !== null ? `<div class="muted small">≈ ${fmt(other, vc)} по курсу ЦБ</div>` : ''}
      </div><button class="del" title="Удалить">✕</button>`;
    li.querySelector('.del').onclick = () => { if (!confirm('Удалить эту запись?')) return; S.tx = S.tx.filter((x) => x !== t); save(); renderFinance(); };
    list.appendChild(li);
  });
}

// ===== Обмен валюты: «кошелёк» =====
// Каждый обмен — пачка денег (например, 4 000 ₺ за 100 $). Расходы в этой валюте списываются
// из пачек по очереди (сначала из самой старой). Так видно, сколько осталось на руках
// и сколько своих денег (долларов и т. п.) реально ушло на каждую покупку.
var W = null; // кэш расчёта; сбрасывается в save()
const fxList = () => (S.fx ||= []);
const allSpends = () => [
  ...S.tx.filter((t) => t.type === 'out'),
  ...(S.show?.items || []),
];
function wallet() {
  if (W) return W;
  const cost = new Map(); // запись → { parts: {USD: 20}, rate: {USD: 40}, short: 0 }
  const byTo = {}; // валюта на руках → { got, spent, left, lots }
  const byFrom = {}; // своя валюта → { gave, spent }
  const lotsBy = {};
  fxList().slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((f) => {
    (lotsBy[f.toCur] ||= []).push({ f, left: f.toAmt, rate: f.toAmt / f.fromAmt });
    const t = (byTo[f.toCur] ||= { got: 0, spent: 0, left: 0, lots: [] });
    t.got += f.toAmt;
    (byFrom[f.fromCur] ||= { gave: 0, spent: 0, month: {} }).gave += f.fromAmt;
  });
  Object.entries(lotsBy).forEach(([cur, lots]) => {
    byTo[cur].lots = lots;
    const first = lots[0].f.date;
    const spends = allSpends().filter((t) => curOf(t) === cur && !(t.usdRate > 0) && t.date >= first)
      .sort((a, b) => a.date.localeCompare(b.date));
    spends.forEach((t) => {
      let a = t.amount;
      const c = { parts: {}, got: {}, short: 0, lots: [] };
      for (const lot of lots) {
        if (a <= 1e-9) break;
        if (lot.left <= 1e-9 || lot.f.date > t.date) continue;
        const take = Math.min(a, lot.left);
        lot.left -= take; a -= take;
        const k = lot.f.fromCur, own = take / lot.rate;
        c.parts[k] = (c.parts[k] || 0) + own;
        c.got[k] = (c.got[k] || 0) + take;
        c.lots.push({ take, rate: lot.rate, k });
        const fr = byFrom[k]; fr.spent += own;
        const m = t.date.slice(0, 7); fr.month[m] = (fr.month[m] || 0) + own;
      }
      c.short = a > 1e-9 ? a : 0;
      byTo[cur].spent += t.amount - c.short;
      if (Object.keys(c.parts).length) cost.set(t, c);
    });
    byTo[cur].left = lots.reduce((s, l) => s + l.left, 0);
  });
  return (W = { cost, byTo, byFrom });
}
// Сколько своих денег ушло на запись (по обменам): «20 $» или «20 $ + 500 ₽»
const walletCost = (t) => wallet().cost.get(t) || null;
const walletText = (c) => Object.entries(c.parts).map(([k, v]) => fmt(v, k)).join(' + ');
const walletRate = (c, cur) => {
  const r = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return c.lots.length > 1
    ? 'из разных обменов: ' + c.lots.map((l) => `${fmt(l.take, cur)} по ${r(l.rate)}`).join(' + ')
    : `1 ${CURS[c.lots[0].k]} = ${r(c.lots[0].rate)} ${CURS[cur]}`;
};

$('#fxDate').value = today();
const fxNum = (id) => parseFloat(String($(id).value).replace(',', '.'));
function fxCalc() {
  const a = fxNum('#fxFrom'), b = fxNum('#fxTo'), fc = $('#fxFromCur').value, tc = $('#fxToCur').value;
  $('#fxCalc').textContent = fc === tc ? 'Выберите разные валюты'
    : a > 0 && b > 0 ? `Курс: 1 ${CURS[fc]} = ${(b / a).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${CURS[tc]}`
    : 'Сколько отдали и сколько получили на руки — курс посчитаю сам';
}
['#fxFrom', '#fxTo'].forEach((id) => $(id).addEventListener('input', fxCalc));
['#fxFromCur', '#fxToCur'].forEach((id) => $(id).addEventListener('change', fxCalc));
const fxShow = (on) => { $('#fxForm').classList.toggle('hidden', !on); $('#fxAddBtn').classList.toggle('hidden', on); if (on) { fxCalc(); $('#fxFrom').focus(); } };
$('#fxAddBtn').onclick = () => fxShow(true);
$('#fxCancel').onclick = () => fxShow(false);
$('#fxForm').onsubmit = (e) => {
  e.preventDefault();
  const fromAmt = fxNum('#fxFrom'), toAmt = fxNum('#fxTo'), fromCur = $('#fxFromCur').value, toCur = $('#fxToCur').value;
  if (!(fromAmt > 0 && toAmt > 0) || fromCur === toCur) { fxCalc(); return; }
  fxList().push({ id: uid(), date: $('#fxDate').value, fromAmt, fromCur, toAmt, toCur, note: $('#fxNote').value.trim() });
  $('#fxFrom').value = ''; $('#fxTo').value = ''; $('#fxNote').value = '';
  fxShow(false); save(); renderFinance(); renderShow();
};
let walOpen = false;
const CUR_GEN = { RUB: 'рублей', USD: 'долларов', EUR: 'евро', AZN: 'манат', TRY: 'лир', CNY: 'юаней', EGP: 'фунтов' };
function renderWallet() {
  const w = wallet(), key = monthKey(finMonth);
  const tos = Object.keys(CURS).filter((c) => w.byTo[c]);
  if (!tos.length) {
    $('#walBody').innerHTML = '<div class="muted small">Поменяли доллары (или другую валюту)? Запишите обмен — расходы в этой валюте будут списываться из него, и я буду считать, сколько у вас осталось на руках и сколько долларов вы уже потратили.</div>';
    return;
  }
  const hand = tos.map((c) => {
    const t = w.byTo[c], pct = t.got ? Math.max(0, t.left) / t.got * 100 : 0;
    const back = t.lots.filter((l) => l.left > 1e-9).reduce((o, l) => { o[l.f.fromCur] = (o[l.f.fromCur] || 0) + l.left / l.rate; return o; }, {});
    const backTxt = Object.entries(back).map(([k, v]) => fmt(v, k)).join(' + ');
    return `<div class="wal-cur">
      <div class="sum-row"><span>Осталось ${CUR_GEN[c]}</span><b class="${t.left > 1e-9 ? 'pos' : 'neg'}">${fmt(Math.max(0, t.left), c)}</b></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="muted small">получено ${fmt(t.got, c)} · потрачено ${fmt(t.spent, c)}${backTxt ? ` · это ${backTxt} по курсу обмена` : ''}</div>
    </div>`;
  }).join('');
  const froms = Object.keys(CURS).filter((c) => w.byFrom[c]);
  const own = froms.map((c) => {
    const f = w.byFrom[c], m = f.month[key] || 0, pct = f.gave ? Math.max(0, f.gave - f.spent) / f.gave * 100 : 0;
    return `<div class="wal-own">
      <div class="sum-row"><span>Потрачено ${CURS[c]} всего</span><b class="neg">${fmt(f.spent, c)}</b></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="muted small">поменяли ${fmt(f.gave, c)} · ещё не потрачено ${fmt(Math.max(0, f.gave - f.spent), c)}${m ? ` · за ${MONTHS[finMonth.getMonth()].toLowerCase()} ${fmt(m, c)}` : ''}</div>
    </div>`;
  }).join('');
  const short = [...w.cost.values()].some((c) => c.short) || allSpends().some((t) => w.byTo[curOf(t)] && !(t.usdRate > 0) && !w.cost.get(t) && t.date >= w.byTo[curOf(t)].lots[0].f.date);
  const hist = fxList().slice().sort((a, b) => b.date.localeCompare(a.date)).map((f) => {
    const lot = w.byTo[f.toCur].lots.find((l) => l.f === f), left = lot ? lot.left : f.toAmt;
    return `<li class="tx-row"><div class="tx-main">
      <div class="tx-top"><span class="tx-cat">${fmt(f.fromAmt, f.fromCur)} → ${fmt(f.toAmt, f.toCur)}</span><b class="tx-sum ${left > 1e-9 ? 'pos' : 'muted'}">${left > 1e-9 ? 'осталось ' + fmt(left, f.toCur) : 'закончились'}</b></div>
      <div class="muted small">${fmtDate(f.date)} · 1 ${CURS[f.fromCur]} = ${(f.toAmt / f.fromAmt).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${CURS[f.toCur]}${f.note ? ` · ${esc(f.note)}` : ''}</div>
    </div><button class="del" data-fx="${f.id}" title="Удалить">✕</button></li>`;
  }).join('');
  $('#walBody').innerHTML = `
    <div class="wal-sec">На руках</div>${hand}
    <div class="wal-sec">Сколько своих денег ушло</div>${own}
    ${short ? '<div class="muted small wal-warn">⚠️ Часть расходов больше, чем вы наменяли — их посчитал по курсу ЦБ. Запишите следующий обмен, чтобы счёт был точным.</div>' : ''}
    <details class="wal-hist"${walOpen ? ' open' : ''}><summary>История обменов (${fxList().length})</summary><ul class="list">${hist}</ul></details>`;
  $('#walBody').querySelector('details').ontoggle = (e) => { walOpen = e.target.open; };
  $('#walBody').querySelectorAll('[data-fx]').forEach((b) => b.onclick = () => {
    if (!confirm('Удалить этот обмен?')) return;
    S.fx = fxList().filter((f) => f.id !== b.dataset.fx); save(); renderFinance(); renderShow();
  });
}

// ===== Отчёт о расходах в PDF («чек») =====
// Страницы рисуются на canvas (A4), затем собираются в PDF из JPEG-картинок — без библиотек, работает офлайн.
const REP = { W: 1240, H: 1754, M: 90, K: 1.5 }; // A4 при 150 dpi, рисуем в 1.5× для чёткости
const repFont = (size, w = 400) => `${w} ${size}px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const ddmm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const ddmmyy = (d) => `${ddmm(d)}.${d.slice(0, 4)}`;
const plainName = (n) => n.replace(/^[^\p{L}\d]+/u, '').trim();
const stripTags = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/^💱\s*/, '').trim(); };

function repRange(p) {
  const pad = (n) => String(n).padStart(2, '0'), endOf = (y, m) => `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  const y = finMonth.getFullYear(), m = finMonth.getMonth(), now = new Date();
  if (p === 'month') return [`${y}-${pad(m + 1)}-01`, endOf(y, m)];
  if (p === 'prev') { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, endOf(d.getFullYear(), d.getMonth())]; }
  if (p === 'year') return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
  if (p === 'all') return ['0000-01-01', '9999-12-31'];
  return [$('#repFrom').value || '0000-01-01', $('#repTo').value || '9999-12-31'];
}

// Что попадёт в отчёт: блоки (заголовки, строки, итоги) — потом раскладываются по страницам
function repBlocks({ from, to, sec, vc, ctry = 'all' }) {
  const inR0 = (d) => d >= from && d <= to;
  const cOk = (r) => ctry === 'all' || r.country === ctry;
  const spends = [];
  const inR = (d, r) => inR0(d) && (!r || cOk(r));
  if (sec !== 'show') S.tx.filter((t) => t.type === 'out' && inR(t.date, t) && (sec === 'all' || secOf(t) === sec))
    .forEach((t) => spends.push({ r: t, sec: secOf(t) || 'personal', cat: t.cat || 'Без категории', note: t.note || '' }));
  if (sec === 'all' || sec === 'show') (S.show?.items || []).filter((i) => inR(i.date, i))
    .forEach((i) => spends.push({ r: i, sec: 'show', cat: shCatOf(i.cat).name, note: [i.who, i.note].filter(Boolean).join(' · ') }));
  const incomes = sec === 'all' ? S.tx.filter((t) => t.type === 'in' && inR(t.date, t)) : [];
  const fx = fxList().filter((f) => inR0(f.date)).sort((a, b) => a.date.localeCompare(b.date));
  const val = (r) => recConv(r, vc);
  const sum = (list) => list.reduce((a, x) => a + (val(x.r || x) ?? 0), 0);
  const written = (list) => { const by = {}; list.forEach((x) => { const r = x.r || x; (by[curOf(r)] ||= { v: 0 }).v += r.amount; }); return curLines(by, 'v'); };
  const mixed = [...spends.map((x) => x.r), ...incomes].some((r) => curOf(r) !== vc);
  const ap = mixed ? '≈ ' : '';
  const total = sum(spends);
  const own = {}; spends.forEach((x) => { const c = walletCost(x.r); if (c) Object.entries(c.parts).forEach(([k, v]) => own[k] = (own[k] || 0) + v); });

  const dates = [...spends.map((x) => x.r.date), ...incomes.map((t) => t.date)].sort();
  const realFrom = from === '0000-01-01' ? dates[0] : from, realTo = to === '9999-12-31' ? dates[dates.length - 1] : to;
  const secTitle = (sec === 'all' ? 'все разделы' : plainName(secName(sec))) + (ctry !== 'all' ? `   ·   Страна: ${ctryOf(ctry)?.name}` : '');
  const B = [];
  B.push({ t: 'title', text: 'Мои расходы' });
  B.push({ t: 'sub', text: `Период: ${realFrom ? ddmmyy(realFrom) : '—'} — ${realTo ? ddmmyy(realTo) : '—'}   ·   Раздел: ${secTitle}` });
  B.push({ t: 'sub', text: `Сформировано: ${new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` });
  B.push({ t: 'gap', h: 24 });
  B.push({ t: 'boxStart' });
  B.push({ t: 'kv', l: 'Всего расходов', r: spends.length ? ap + fmt(total, vc) : '—', big: true });
  if (spends.length && mixed) B.push({ t: 'note', text: `записано: ${written(spends)}` });
  B.push({ t: 'kv', l: 'Операций', r: String(spends.length) });
  if (Object.keys(own).length) B.push({ t: 'kv', l: 'Своих денег ушло (по обменам)', r: Object.entries(own).map(([k, v]) => fmt(v, k)).join(' + ') });
  if (incomes.length) {
    const inc = sum(incomes);
    B.push({ t: 'kv', l: 'Доходы', r: ap + fmt(inc, vc) });
    B.push({ t: 'kv', l: 'Остаток', r: ap + fmt(inc - total, vc), bold: true });
  }
  B.push({ t: 'boxEnd' });

  if (!spends.length) { B.push({ t: 'gap', h: 30 }); B.push({ t: 'note', text: 'За этот период расходов нет.' }); }

  // Сводка по разделам
  const order = FIN_SECS.filter((x) => x.id !== 'all').map((x) => x.id);
  const groups = order.map((id) => ({ id, list: spends.filter((x) => x.sec === id) })).filter((g) => g.list.length);
  if (groups.length > 1) {
    B.push({ t: 'h', text: 'По разделам' });
    groups.map((g) => ({ g, v: sum(g.list) })).sort((a, b) => b.v - a.v)
      .forEach(({ g, v }) => B.push({ t: 'bar', l: plainName(secName(g.id)), r: `${ap}${fmt(v, vc)}  ·  ${total ? Math.round(v / total * 100) : 0}%`, p: total ? v / total : 0 }));
  }

  if (ctry === 'all' && spends.some((x) => x.r.country)) {
    const by = {}; spends.forEach((x) => { const k = x.r.country || ''; by[k] = (by[k] || 0) + (val(x.r) ?? 0); });
    B.push({ t: 'h', text: 'По странам' });
    Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => B.push({ t: 'bar', l: k ? ctryOf(k).name : 'Без страны', r: `${ap}${fmt(v, vc)}  ·  ${total ? Math.round(v / total * 100) : 0}%`, p: total ? v / total : 0 }));
  }

  // Подробно: раздел → категория (с итогом) → каждая покупка
  groups.map((g) => ({ g, v: sum(g.list) })).sort((a, b) => b.v - a.v).forEach(({ g, v: gv }) => {
    B.push({ t: 'h', text: plainName(secName(g.id)), r: ap + fmt(gv, vc) });
    const cats = {};
    g.list.forEach((x) => (cats[x.cat] ||= []).push(x));
    Object.entries(cats).map(([c, list]) => ({ c, list, v: sum(list) })).sort((a, b) => b.v - a.v).forEach(({ c, list, v }) => {
      B.push({ t: 'cat', l: c, r: `${ap}${fmt(v, vc)}  ·  ${list.length} шт.` });
      list.sort((a, b) => a.r.date.localeCompare(b.r.date)).forEach((x) => {
        const r = x.r, cur = curOf(r), o = val(r), sub = [r.country && ctry === 'all' ? ctryOf(r.country)?.name : '', stripTags(usdNote(r))].filter(Boolean).join(' · ');
        const r2 = cur !== vc && o !== null && !sub.includes(fmt(o, vc)) ? '≈ ' + fmt(o, vc) : '';
        B.push({ t: 'row', d: ddmm(r.date), l: x.note || '—', r: '−' + fmt(r.amount, cur), r2, sub });
      });
    });
  });

  if (incomes.length) {
    B.push({ t: 'h', text: 'Доходы', r: ap + fmt(sum(incomes), vc) });
    incomes.sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
      const cur = curOf(t), o = val(t);
      B.push({ t: 'row', d: ddmm(t.date), l: [t.cat, t.note].filter(Boolean).join(' — ') || '—', r: '+' + fmt(t.amount, cur), r2: cur !== vc && o !== null ? '≈ ' + fmt(o, vc) : '', pos: true });
    });
  }

  if (fx.length) {
    B.push({ t: 'h', text: 'Обмены валюты' });
    fx.forEach((f) => B.push({ t: 'row', d: ddmm(f.date), l: `${fmt(f.fromAmt, f.fromCur)} → ${fmt(f.toAmt, f.toCur)}${f.note ? ' · ' + f.note : ''}`,
      r: `1 ${CURS[f.fromCur]} = ${(f.toAmt / f.fromAmt).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${CURS[f.toCur]}`, plain: true }));
  }

  if (mixed) {
    B.push({ t: 'gap', h: 30 });
    B.push({ t: 'note', text: `Как пересчитано в ${CURS[vc]}: покупки из обменов — по курсу вашего обмена, с галочкой «свой курс» — по вашему курсу, остальное — по курсу ЦБ${S.rates ? ` на ${ddmmyy(S.rates.date)}` : ''}.` });
  }
  return { blocks: B, name: `rashody_${realFrom ? realFrom.slice(0, 7) : 'pusto'}${realTo && realFrom && realTo.slice(0, 7) !== realFrom.slice(0, 7) ? '_' + realTo.slice(0, 7) : ''}.pdf` };
}

// Раскладка блоков по страницам A4 и рисование
function repRender(blocks) {
  const { W, H, M, K } = REP, pages = [];
  let ctx, y, boxTop = null;
  const INK = '#15171c', MUTED = '#6b7280', LINE = '#d9dce3', RED = '#c0392b', GREEN = '#1e8e5a', ACC = '#3b5bdb';
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    ctx = c.getContext('2d'); ctx.scale(K, K);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'alphabetic';
    pages.push(c); y = M;
    if (pages.length > 1) { ctx.font = repFont(20); ctx.fillStyle = MUTED; ctx.fillText('Мои расходы (продолжение)', M, y); y += 40; }
  };
  const text = (s, x, yy, font, color = INK, align = 'left') => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, yy); ctx.textAlign = 'left'; };
  const wrap = (s, font, maxW) => {
    ctx.font = font; const out = []; let line = '';
    for (const w of String(s).split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line); return out.length ? out : [''];
  };
  const need = (h) => { if (y + h > H - M - 30) { if (boxTop !== null) boxTop = null; newPage(); } };
  newPage();
  for (const b of blocks) {
    if (b.t === 'title') { need(70); text(b.text, M, y + 46, repFont(52, 700)); y += 76; }
    else if (b.t === 'sub') { need(34); text(b.text, M, y + 22, repFont(22), MUTED); y += 34; }
    else if (b.t === 'gap') y += b.h;
    else if (b.t === 'boxStart') { need(120); boxTop = y; y += 22; }
    else if (b.t === 'boxEnd') {
      if (boxTop !== null) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.strokeRect(M - 4, boxTop, W - 2 * M + 8, y - boxTop + 10); }
      boxTop = null; y += 30;
    }
    else if (b.t === 'kv') {
      const h = b.big ? 52 : 40; need(h);
      text(b.l, M + 20, y + (b.big ? 36 : 28), repFont(b.big ? 30 : 24, b.big || b.bold ? 600 : 400));
      text(b.r, W - M - 20, y + (b.big ? 36 : 28), repFont(b.big ? 34 : 24, 700), b.big ? RED : INK, 'right'); y += h;
    }
    else if (b.t === 'note') {
      const lines = wrap(b.text, repFont(20), W - 2 * M - 40); need(lines.length * 28 + 6);
      lines.forEach((l) => { text(l, boxTop !== null ? M + 20 : M, y + 22, repFont(20), MUTED); y += 28; }); y += 6;
    }
    else if (b.t === 'h') {
      need(b.r ? 260 : 150); y += 34;
      text(b.text, M, y + 36, repFont(34, 700));
      if (b.r) text(b.r, W - M, y + 36, repFont(30, 700), INK, 'right');
      y += 52; ctx.fillStyle = INK; ctx.fillRect(M, y, W - 2 * M, 3); y += 16;
    }
    else if (b.t === 'bar') {
      need(66);
      text(b.l, M, y + 26, repFont(24, 600)); text(b.r, W - M, y + 26, repFont(24), INK, 'right');
      ctx.fillStyle = '#eef0f5'; ctx.fillRect(M, y + 38, W - 2 * M, 12);
      ctx.fillStyle = ACC; ctx.fillRect(M, y + 38, (W - 2 * M) * Math.max(0.005, b.p), 12); y += 66;
    }
    else if (b.t === 'cat') {
      need(170); y += 12;
      ctx.fillStyle = '#f2f4f8'; ctx.fillRect(M, y, W - 2 * M, 46);
      text(b.l, M + 14, y + 32, repFont(25, 700)); text(b.r, W - M - 14, y + 32, repFont(24, 600), INK, 'right'); y += 56;
    }
    else if (b.t === 'row') {
      const rightW = 300, leftX = M + 92, maxW = W - M - rightW - leftX - 10;
      const lines = wrap(b.l, repFont(24), maxW), subs = b.sub ? wrap(b.sub, repFont(19), W - M - leftX) : [];
      const h = Math.max(lines.length * 32 + 8, b.r2 ? 66 : 40) + subs.length * 26 + 10;
      need(h);
      text(b.d, M + 6, y + 28, repFont(22), MUTED);
      lines.forEach((l, i) => text(l, leftX, y + 28 + i * 32, repFont(24)));
      text(b.r, W - M - 6, y + 28, repFont(24, 700), b.plain ? INK : b.pos ? GREEN : RED, 'right');
      if (b.r2) text(b.r2, W - M - 6, y + 58, repFont(20), MUTED, 'right');
      let yy = y + Math.max(lines.length * 32 + 8, b.r2 ? 66 : 40);
      subs.forEach((s) => { text(s, leftX, yy + 14, repFont(19), MUTED); yy += 26; });
      y += h; ctx.fillStyle = LINE; ctx.fillRect(M, y - 4, W - 2 * M, 1);
    }
  }
  pages.forEach((c, i) => {
    const g = c.getContext('2d'); g.font = repFont(18); g.fillStyle = MUTED; g.textAlign = 'center';
    g.fillText(`Мой дашборд  ·  стр. ${i + 1} из ${pages.length}`, W / 2, H - M / 2); g.textAlign = 'left';
  });
  return pages;
}

// Сборка PDF из страниц-картинок (JPEG, DCTDecode)
function repPdf(pages) {
  const enc = new TextEncoder(), chunks = [], offs = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const PW = 595.28, PH = 841.89, n = pages.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
  pages.forEach((c, i) => {
    const p = 3 + i * 3, bin = atob(c.toDataURL('image/jpeg', 0.9).split(',')[1]);
    const img = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) img[k] = bin.charCodeAt(k);
    const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
    obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(p + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
  });
  const total = 3 + n * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0; chunks.forEach((b) => { out.set(b, o); o += b.length; });
  return out;
}

let repCache = null;
function repOpts() {
  const [from, to] = repRange($('#repPeriod').value);
  return { from, to, sec: $('#repSec').value, vc: $('#repCur').value, ctry: $('#repCtry').value };
}
function repRefresh() {
  $('#repDates').classList.toggle('hidden', $('#repPeriod').value !== 'custom');
  const { blocks, name } = repBlocks(repOpts());
  const pages = repRender(blocks);
  repCache = { pages, name };
  $('#repPreview').innerHTML = '';
  pages.forEach((c) => { const im = new Image(); im.src = c.toDataURL('image/jpeg', 0.8); im.alt = 'Страница отчёта'; $('#repPreview').appendChild(im); });
  $('#repMsg').textContent = `${pages.length} ${pages.length === 1 ? 'страница' : pages.length < 5 ? 'страницы' : 'страниц'} · файл ${name}`;
}
function repFile() {
  const bytes = repPdf(repCache.pages);
  return new File([bytes], repCache.name, { type: 'application/pdf' });
}
$('#repBtn').onclick = () => {
  $('#repSec').innerHTML = FIN_SECS.map((x) => `<option value="${x.id}">${x.id === 'all' ? 'Все разделы' : x.name}</option>`).join('');
  $('#repSec').value = finSec;
  $('#repCur').innerHTML = Object.keys(CURS).map((c) => `<option value="${c}">${CURS[c]} ${CUR_GEN[c]}</option>`).join('');
  $('#repCur').value = finView();
  $('#repCtry').innerHTML = '<option value="all">Все страны</option>' + COUNTRIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  $('#repCtry').value = ['all', 'none'].includes(finCountry) ? 'all' : finCountry;
  if (!$('#repFrom').value) { $('#repFrom').value = today().slice(0, 8) + '01'; $('#repTo').value = today(); }
  $('#repModal').classList.remove('hidden');
  $('#repShare').classList.toggle('hidden', !(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })));
  repRefresh();
};
['#repPeriod', '#repSec', '#repCur', '#repCtry', '#repFrom', '#repTo'].forEach((id) => $(id).addEventListener('change', repRefresh));
$('#repClose').onclick = () => $('#repModal').classList.add('hidden');
$('#repModal').onclick = (e) => { if (e.target.id === 'repModal') $('#repModal').classList.add('hidden'); };
$('#repSave').onclick = async () => {
  const f = repFile();
  if (API()?.save_pdf && !window.pywebview.mobile) {
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(f); });
    const path = await API().save_pdf(b64, f.name);
    $('#repMsg').textContent = path ? `Сохранено: ${path}` : 'Не сохранено';
  } else {
    const url = URL.createObjectURL(f);
    const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    $('#repMsg').textContent = `Готово: ${f.name} — ищите в «Загрузках» (Downloads)`;
  }
};
$('#repShare').onclick = async () => {
  try { await navigator.share({ files: [repFile()], title: 'Мои расходы' }); } catch { /* отменили */ }
};

// ===== Конвертер валют (по курсу ЦБ РФ) =====
const CV_CURS = [
  { c: 'TRY', name: 'Турецкая лира', f: 'TR' },
  { c: 'EGP', name: 'Египетский фунт', f: 'EG' },
  { c: 'RUB', name: 'Российский рубль', f: 'RU' },
  { c: 'AZN', name: 'Азербайджанский манат', f: 'AZ' },
  { c: 'CNY', name: 'Китайский юань', f: 'CN' },
  { c: 'USD', name: 'Доллар США' },
  { c: 'EUR', name: 'Евро' },
];
const cvState = () => { try { return JSON.parse(localStorage.getItem('conv.state')) || {}; } catch { return {}; } };
const cvBadge = (x) => x.f ? flag(x.f, 'cv-flag') : `<span class="cv-cur-badge">${CURS[x.c]}</span>`;
const cvNum = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: v >= 1 ? 2 : 4 });
const cvRate = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: v >= 10 ? 2 : 4 });
function renderConverter() {
  const st = cvState(), from = st.from || 'USD';
  if (st.amt != null && document.activeElement !== $('#cvAmount')) $('#cvAmount').value = st.amt;
  const a = parseFloat(String($('#cvAmount').value).replace(',', '.')) || 0;
  $('#cvSym').textContent = CURS[from];
  $('#cvFrom').innerHTML = CV_CURS.map((x) => `<button type="button" class="ctry-chip${x.c === from ? ' on' : ''}" data-c="${x.c}">${cvBadge(x)}<span>${x.f ? CURS[x.c] + ' ' : ''}${x.c}</span></button>`).join('');
  $('#cvFrom').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
    localStorage.setItem('conv.state', JSON.stringify({ ...cvState(), from: b.dataset.c })); renderConverter();
  });
  if (!S.rates) { $('#cvList').innerHTML = '<li class="empty">Загружаю курс ЦБ… нужен интернет</li>'; $('#cvNote').textContent = ''; return; }
  $('#cvList').innerHTML = CV_CURS.filter((x) => x.c !== from).map((x) => {
    const v = conv(a, from, x.c), one = conv(1, from, x.c);
    return `<li class="cv-row" data-c="${x.c}" data-v="${v ?? ''}">
      ${cvBadge(x)}
      <div class="cv-main"><b>${x.name}</b><span class="muted small">1 ${CURS[from]} = ${one !== null ? cvRate(one) : '—'} ${CURS[x.c]}</span></div>
      <b class="cv-val">${v !== null ? cvNum(v) + ' ' + CURS[x.c] : '—'}</b></li>`;
  }).join('');
  // нажали на валюту — пересчитать «от неё»
  $('#cvList').querySelectorAll('.cv-row').forEach((li) => li.onclick = () => {
    const v = parseFloat(li.dataset.v);
    localStorage.setItem('conv.state', JSON.stringify({ from: li.dataset.c, amt: Number.isFinite(v) ? +v.toFixed(2) : a }));
    renderConverter();
  });
  $('#cvNote').textContent = `Курс ЦБ РФ на ${fmtDate(S.rates.date)}. В обменнике курс обычно немного хуже. Нажмите на валюту в списке — посчитаю от неё.`;
}
$('#cvAmount').addEventListener('input', () => {
  localStorage.setItem('conv.state', JSON.stringify({ ...cvState(), amt: $('#cvAmount').value }));
  renderConverter();
});

// ===== Шоу: расходы на светодиодное шоу =====
const SHOW_CATS = [
  { id: 'dev', icon: '👨‍💻', name: 'Программист' },
  { id: 'agents', icon: '🤖', name: 'Агенты' },
  { id: 'mat', icon: '📦', name: 'Материалы' },
  { id: 'other', icon: '🧾', name: 'Прочее' },
];
function showData() {
  S.show ||= {};
  S.show.cats ||= SHOW_CATS.map((c) => ({ ...c }));
  S.show.items ||= [];
  return S.show;
}
let shMonth = new Date(); shMonth.setDate(1);
let shPeriod = 'month', shFilter = 'all', shCat = 'dev';
$('#shDate').value = today();
$('#shPrev').onclick = () => { shMonth.setMonth(shMonth.getMonth() - 1); renderShow(); };
$('#shNext').onclick = () => { shMonth.setMonth(shMonth.getMonth() + 1); renderShow(); };
$('#shPeriod').onclick = (e) => { const p = e.target.closest('button')?.dataset.p; if (p) { shPeriod = p; renderShow(); } };
let shUsd = null; // поле «Платил долларами» (создаётся, когда готова функция conv)
$('#shForm').onsubmit = (e) => {
  e.preventDefault();
  const amount = parseFloat($('#shAmount').value);
  if (!(amount > 0)) return;
  const usdRate = shUsd.value();
  if (usdRate === null) { alert('Укажите курс: сколько за 1 доллар'); shUsd.focus(); return; }
  showData().items.push({
    id: uid(), cat: shCat, amount, cur: $('#shCur').value, date: $('#shDate').value,
    who: $('#shWho').value.trim(), note: $('#shNote').value.trim(), ...(usdRate ? { usdRate } : {}), ...(shCtry.get() ? { country: shCtry.get() } : {}),
  });
  $('#shAmount').value = ''; $('#shNote').value = ''; $('#shWho').value = ''; shUsd.reset();
  // запись в месяце, который сейчас открыт, — чтобы сразу её увидеть
  const d = parseISO($('#shDate').value); shMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  save(); renderShow();
  $('#shAmount').focus();
};
$('#shBudgetForm').onsubmit = (e) => {
  e.preventDefault();
  const v = parseFloat($('#shBudgetInput').value);
  showData().budget = v > 0 ? v : null;
  showData().budgetCur = $('#shBudgetCur').value;
  $('#shBudgetInput').value = '';
  save(); renderShow();
};
$('#shCatForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#shCatName').value.trim();
  if (!name) return;
  const c = { id: uid(), icon: $('#shCatIcon').value.trim() || '🏷️', name };
  showData().cats.push(c); shCat = c.id;
  e.target.reset(); save(); renderShow();
};
const shCatOf = (id) => showData().cats.find((c) => c.id === id) || { icon: '🏷️', name: 'Без категории' };
// Перевод между любыми валютами через курс ЦБ (null — если курса нет)
const conv = (amount, from, to) => {
  if (from === to) return amount;
  const a = rate(from), b = rate(to);
  return a && b ? amount * a / b : null;
};
shUsd = usdField('sh');
const shView = () => showData().view || 'orig'; // 'orig' — как записано, иначе код валюты
const weightOf = (i) => recConv(i, 'RUB') ?? i.amount; // для долей и сортировки
// Сумма расходов для показа: «100 $ + 5 000 ₽» (как записано) или в выбранной валюте
function shMoney(items, view = shView()) {
  const byCur = {};
  items.forEach((i) => { (byCur[curOf(i)] ||= { out: 0 }).out += i.amount; });
  const lines = curLines(byCur, 'out') || '0';
  const curs = Object.keys(byCur);
  const weight = items.reduce((a, i) => a + weightOf(i), 0);
  if (view === 'orig') return { text: lines, lines, approx: false, weight };
  const parts = items.map((i) => recConv(i, view));
  if (parts.some((v) => v === null)) return { text: lines, lines, approx: false, weight, noRate: true };
  return { text: fmt(parts.reduce((a, v) => a + v, 0), view), lines, approx: curs.some((c) => c !== view), weight };
}
function renderShow() {
  shUsd?.sync();
  const sh = showData();
  const view = shView();
  const key = monthKey(shMonth);
  shCtry.draw();
  const shown = sh.items.filter(ctryOk);
  const monthItems = shown.filter((i) => i.date.startsWith(key));
  const period = shPeriod === 'month' ? monthItems : shown;
  const periodName = shPeriod === 'month' ? `${MONTHS[shMonth.getMonth()]} ${shMonth.getFullYear()}` : 'всё время';
  $('#shMonth').textContent = `${MONTHS[shMonth.getMonth()]} ${shMonth.getFullYear()}`;
  document.querySelectorAll('#shPeriod button').forEach((b) => b.classList.toggle('active', b.dataset.p === shPeriod));
  document.querySelectorAll('#shView button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
  if (!sh.cats.some((c) => c.id === shCat)) shCat = sh.cats[0]?.id;
  const ap = (m) => (m.approx ? '≈ ' : '');

  // Плитки категорий: за месяц и за всё время
  $('#shCats').innerHTML = sh.cats.map((c) => {
    const m = shMoney(monthItems.filter((i) => i.cat === c.id)), all = shMoney(shown.filter((i) => i.cat === c.id));
    return `<div class="card sh-cat${shFilter === c.id ? ' on' : ''}" data-cat="${c.id}">
      <div class="sh-cat-head"><span class="sh-ico">${esc(c.icon)}</span><span>${esc(c.name)}</span></div>
      <div class="big${m.text.length > 10 ? ' sh-long' : ''}">${ap(m)}${m.text}</div>
      <div class="muted small">за месяц${m.approx ? ` · записано: ${m.lines}` : ''}</div>
      <div class="muted small">всего: ${ap(all)}${all.text}</div></div>`;
  }).join('');
  $('#shCats').querySelectorAll('.sh-cat').forEach((el) => el.onclick = () => {
    shFilter = shFilter === el.dataset.cat ? 'all' : el.dataset.cat; renderShow();
  });

  // Выбор категории в форме
  $('#shPick').innerHTML = sh.cats.map((c) =>
    `<button type="button" class="sh-chip${c.id === shCat ? ' on' : ''}" data-cat="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('');
  $('#shPick').querySelectorAll('.sh-chip').forEach((b) => b.onclick = () => { shCat = b.dataset.cat; renderShow(); });
  $('#shWhoList').innerHTML = [...new Set(sh.items.map((i) => i.who).filter(Boolean))].map((w) => `<option value="${esc(w)}">`).join('');

  // Итоги
  const tot = shMoney(period), allTot = shMoney(shown);
  const noRate = tot.noRate || allTot.noRate;
  $('#shSumTitle').textContent = `Итоги: ${periodName}`;
  $('#shSummary').innerHTML = `
    <div class="sum-row total"><span>Потрачено</span><b class="neg">${ap(tot)}${tot.text}</b></div>
    ${tot.approx ? `<div class="muted small">записано: ${tot.lines}</div>` : ''}
    <div class="sum-row"><span>Записей</span><b>${period.length}</b></div>
    ${shPeriod === 'month' ? `<div class="sum-row"><span>За всё время</span><b>${ap(allTot)}${allTot.text}</b></div>` : ''}
    ${noRate ? '<div class="muted small">Курс ЦБ ещё не загружен — показываю как записано</div>'
      : (tot.approx || allTot.approx) && S.rates ? `<div class="muted small">Пересчёт по курсу ЦБ на ${fmtDate(S.rates.date)}</div>` : ''}`;

  // Доли по категориям
  const byCat = sh.cats.map((c) => { const items = period.filter((i) => i.cat === c.id); return { c, m: shMoney(items), n: items.length }; })
    .filter((x) => x.n).sort((a, b) => b.m.weight - a.m.weight);
  $('#shBars').innerHTML = byCat.length ? byCat.map(({ c, m }) => `
    <div class="bar-row"><div class="lbl"><span>${esc(c.icon)} ${esc(c.name)}</span><span>${ap(m)}${m.text} · ${Math.round(m.weight / tot.weight * 100)}%</span></div>
    <div class="bar"><div style="width:${m.weight / byCat[0].m.weight * 100}%"></div></div></div>`).join('') : '<div class="empty">Пока нет расходов</div>';

  // Бюджет (на всё шоу, в своей валюте; считается от всех расходов)
  const bCur = sh.budgetCur || 'RUB';
  $('#shBudgetCur').value = bCur;
  if (sh.budget) {
    const spent = shMoney(sh.items, bCur);
    if (spent.noRate) $('#shBudget').innerHTML = `<div class="sum-row"><span>Бюджет</span><b>${fmt(sh.budget, bCur)}</b></div>
      <div class="muted small">Нужен курс ЦБ, чтобы сравнить с расходами в других валютах</div>`;
    else {
      const used = sh.items.reduce((a, i) => a + recConv(i, bCur), 0);
      const pct = Math.round(used / sh.budget * 100), left = sh.budget - used;
      $('#shBudget').innerHTML = `
        <div class="sum-row"><span>Бюджет</span><b>${fmt(sh.budget, bCur)}</b></div>
        <div class="sum-row"><span>${left >= 0 ? 'Осталось' : 'Перерасход'}</span><b class="${left >= 0 ? 'pos' : 'neg'}">${spent.approx ? '≈ ' : ''}${fmt(Math.abs(left), bCur)}</b></div>
        <div class="bar sh-budget-bar${pct > 100 ? ' over' : ''}"><div style="width:${Math.min(pct, 100)}%"></div></div>
        <div class="muted small">Потрачено ${pct}% бюджета</div>`;
    }
  } else $('#shBudget').innerHTML = '<div class="muted small">Укажите общий бюджет — покажу, сколько осталось</div>';

  // Фильтр и список
  $('#shFilter').innerHTML = `<button data-f="all" class="${shFilter === 'all' ? 'active' : ''}">Все</button>` +
    sh.cats.map((c) => `<button data-f="${c.id}" class="${shFilter === c.id ? 'active' : ''}">${esc(c.icon)} ${esc(c.name)}</button>`).join('');
  $('#shFilter').querySelectorAll('button').forEach((b) => b.onclick = () => { shFilter = b.dataset.f; renderShow(); });
  const list = $('#shList'); list.innerHTML = '';
  const rows = period.filter((i) => shFilter === 'all' || i.cat === shFilter).sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) list.innerHTML = `<li class="empty">Нет расходов${shPeriod === 'month' ? ' в этом месяце' : ''}</li>`;
  rows.forEach((i) => {
    const c = shCatOf(i.cat), cur = curOf(i);
    const other = view !== 'orig' && cur !== view ? recConv(i, view) : null;
    const li = document.createElement('li');
    li.innerHTML = `<span class="badge">${i.country ? flag(i.country, 'sm') + ' ' : ''}${fmtDate(i.date)}</span>
      <span class="sh-ico sm">${esc(c.icon)}</span>
      <span class="grow"><b>${esc(c.name)}</b>${i.note ? ` — ${esc(i.note)}` : ''}${i.who ? ` <span class="muted">· ${esc(i.who)}</span>` : ''}</span>
      <b class="neg">−${fmt(i.amount, cur)}</b>
      ${usdNote(i)}
      ${other !== null ? `<span class="muted small">≈ ${fmt(other, view)}</span>` : ''}
      <button class="del" title="Удалить">✕</button>`;
    li.querySelector('.del').onclick = () => {
      if (!confirm('Удалить этот расход?')) return;
      sh.items = sh.items.filter((x) => x !== i); save(); renderShow();
    };
    list.appendChild(li);
  });
}
$('#shView').onclick = (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) { showData().view = v; save(); renderShow(); }
};

// ===== Календарь =====
let calMonth = new Date(); calMonth.setDate(1);
let selDay = today();
$('#calPrev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); };
$('#calNext').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); };
$('#eventForm').onsubmit = (e) => {
  e.preventDefault();
  const remind = $('#evRemind').checked;
  S.events.push({ id: uid(), date: selDay, time: $('#evTime').value || '', title: $('#evTitle').value.trim(), ...(remind ? { remind: true } : {}) });
  $('#evTitle').value = ''; $('#evTime').value = '';
  save(); renderCalendar();
  if (remind) askNotifyPermission();
  remSync(); checkReminders();
};
// ----- Напоминания -----
// Когда сработает: дата + время (без времени — в 9:00)
function remDue(ev) { return new Date(`${ev.date}T${ev.time || '09:00'}:00`).getTime(); }
const REM_KEY = 'remind.notified'; // на каком устройстве уже показали (у каждого своё)
const remNotified = () => { try { return new Set(JSON.parse(localStorage.getItem(REM_KEY)) || []); } catch { return new Set(); } };
const remMark = (id) => { const s = remNotified(); s.add(id); localStorage.setItem(REM_KEY, JSON.stringify([...s].slice(-500))); };
const activeRem = () => S.events.filter((ev) => ev.remind && !ev.done);
async function askNotifyPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* нет — не страшно */ }
  renderRemPerm();
}
function renderRemPerm() {
  const el = $('#remPerm'); if (!el) return;
  const mob = window.pywebview?.mobile;
  if (mob && 'Notification' in window && Notification.permission === 'denied')
    el.innerHTML = '⚠️ Уведомления запрещены. Разрешите их: Настройки телефона → Приложения → Мой дашборд → Уведомления.';
  else if (mob && 'Notification' in window && Notification.permission === 'default')
    el.innerHTML = '<button type="button" class="ghost" id="remAsk">🔔 Разрешить уведомления</button>';
  else el.textContent = mob ? 'Уведомление придёт в назначенное время. Если приложение было закрыто, телефон может прислать его с задержкой — а при открытии приложения оно покажется сразу.'
    : 'Уведомление Windows придёт в назначенное время, если программа запущена (можно свернуть). Если была закрыта — покажу при запуске.';
  $('#remAsk')?.addEventListener('click', askNotifyPermission);
}
// Список напоминаний — для сервис-воркера телефона (он проверяет их в фоне, когда приложение закрыто)
async function remSync() {
  if (!window.pywebview?.mobile || !('caches' in window)) return;
  try {
    const c = await caches.open('mydashboard-rem');
    const list = activeRem().map((ev) => ({ id: ev.id, title: ev.title, due: remDue(ev), time: ev.time }));
    await c.put('rem-list.json', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
    // что уже показал сервис-воркер — не показывать второй раз
    const r = await c.match('rem-done.json');
    if (r) (await r.json()).forEach(remMark);
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.periodicSync && list.length) await reg.periodicSync.register('reminders', { minInterval: 15 * 60_000 }).catch(() => {});
  } catch { /* фон недоступен — сработает при открытии */ }
}
function checkReminders() {
  const now = Date.now(), done = remNotified();
  activeRem().filter((ev) => remDue(ev) <= now && !done.has(ev.id) && remDue(ev) > now - 3 * 864e5).forEach((ev) => {
    remMark(ev.id);
    notifyUser('🔔 Напоминание', `${ev.time ? ev.time + ' — ' : ''}${ev.title}`, { tag: 'rem-' + ev.id, sound: true, reminder: true });
  });
  renderBell();
}
function renderRemList() {
  const list = activeRem().sort((a, b) => remDue(a) - remDue(b));
  const now = Date.now();
  $('#remList').innerHTML = list.length ? '' : '<li class="empty">Пока нет. Выберите день в календаре и добавьте заметку.</li>';
  list.forEach((ev) => {
    const li = document.createElement('li');
    const past = remDue(ev) <= now;
    li.className = 'rem-row' + (past ? ' past' : '');
    li.innerHTML = `<span class="badge">${fmtDate(ev.date)}${ev.time ? ' ' + ev.time : ''}</span><span class="grow">${past ? '🔔 ' : ''}${esc(ev.title)}</span>
      <button class="ghost rem-done" title="Готово — больше не напоминать">✓</button>`;
    li.querySelector('.grow').onclick = () => { selDay = ev.date; calMonth = new Date(parseISO(ev.date)); calMonth.setDate(1); renderCalendar(); };
    li.querySelector('.rem-done').onclick = () => { ev.done = true; save(); renderCalendar(); remSync(); };
    $('#remList').appendChild(li);
  });
  renderRemPerm();
}
function renderCalendar() {
  $('#calMonth').textContent = `${MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  const g = $('#calGrid');
  g.innerHTML = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="wd">${d}</div>`).join('');
  const start = new Date(calMonth); start.setDate(1 - ((start.getDay() + 6) % 7));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = iso(d);
    const n = S.events.filter((e) => e.date === k).length + S.tasks.filter((t) => t.due === k && !t.done).length;
    const b = document.createElement('button');
    b.className = 'cal-day' + (d.getMonth() !== calMonth.getMonth() ? ' other' : '') + (k === today() ? ' today' : '') + (k === selDay ? ' sel' : '');
    b.innerHTML = `<span>${d.getDate()}</span><span class="dots">${'<i></i>'.repeat(Math.min(n, 5))}</span>`;
    b.onclick = () => { selDay = k; renderCalendar(); };
    g.appendChild(b);
  }
  $('#calDayLabel').textContent = parseISO(selDay).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const list = $('#dayEvents'); list.innerHTML = '';
  const evs = S.events.filter((e) => e.date === selDay).sort((a, b) => a.time.localeCompare(b.time));
  const tasks = S.tasks.filter((t) => t.due === selDay);
  if (!evs.length && !tasks.length) list.innerHTML = '<li class="empty">Ничего не запланировано</li>';
  evs.forEach((ev) => {
    const li = document.createElement('li');
    const st = !ev.remind ? '' : ev.done ? ' <span class="muted small">✓ готово</span>' : ` <span class="muted small">🔔 ${ev.time || '9:00'}</span>`;
    li.innerHTML = `<span class="badge">${ev.time || 'весь день'}</span><span class="grow ev-text">${esc(ev.title)}${st}</span>
      ${ev.remind ? `<button class="ghost rem-done" title="${ev.done ? 'Снова напоминать' : 'Готово — больше не напоминать'}">${ev.done ? '↺' : '✓'}</button>` : ''}<button class="del">✕</button>`;
    li.querySelector('.rem-done')?.addEventListener('click', () => { ev.done = !ev.done; save(); renderCalendar(); remSync(); });
    li.querySelector('.del').onclick = () => { if (!confirm('Удалить эту заметку?')) return; S.events = S.events.filter((x) => x !== ev); save(); renderCalendar(); remSync(); };
    list.appendChild(li);
  });
  tasks.forEach((t) => list.appendChild(taskLi(t, { compact: true })));
  renderRemList();
}

// ===== Аналитика =====
function vbars(el, items, fmt = (v) => v) {
  const max = Math.max(1, ...items.map((i) => i.v));
  el.innerHTML = items.map((i) => `<div class="vbar"><span class="vval">${i.v ? fmt(i.v) : ''}</span>
    <div class="vfill" style="height:${i.v / max * 100}%"></div><span class="vlbl">${i.l}</span></div>`).join('');
}
function renderAnalytics() {
  const doneTotal = S.tasks.filter((t) => t.done).length;
  const overdue = S.tasks.filter((t) => !t.done && t.due && t.due < today()).length;
  const days = last7();
  const habitPct = S.habits.length
    ? Math.round(S.habits.reduce((a, h) => a + days.filter((d) => h.log[iso(d)]).length, 0) / (S.habits.length * 7) * 100) : 0;
  const weekDone = S.tasks.filter((t) => t.doneAt && t.doneAt >= iso(days[0])).length;
  $('#anStats').innerHTML = [
    ['Выполнено за неделю', weekDone], ['Всего выполнено', doneTotal],
    ['Просрочено', overdue], ['Привычки за неделю', habitPct + '%'],
  ].map(([l, v]) => `<div class="card"><h3>${l}</h3><div class="big">${v}</div></div>`).join('');
  vbars($('#anTasks'), days.map((d) => ({
    l: d.toLocaleDateString('ru-RU', { weekday: 'short' }), v: S.tasks.filter((t) => t.doneAt === iso(d)).length,
  })));
  $('#anHabits').innerHTML = S.habits.length ? S.habits.map((h) => {
    const n = days.filter((d) => h.log[iso(d)]).length;
    return `<div class="bar-row"><div class="lbl"><span>${esc(h.name)}</span><span>${n} / 7</span></div>
      <div class="bar"><div style="width:${n / 7 * 100}%;background:var(--green)"></div></div></div>`;
  }).join('') : '<div class="empty">Привычек пока нет</div>';
  vbars($('#anMoney'), [...Array(6)].map((_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i);
    return { l: MONTHS[d.getMonth()].slice(0, 3), v: monthTotals(monthKey(d)).out };
  }), (v) => Math.round(v / 1000) + 'к');
}

// Скачивание файла (копия данных в браузере)
function download(name, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== Погода =====
const WMO = {
  0: ['☀️', 'Ясно'], 1: ['🌤', 'Преимущественно ясно'], 2: ['⛅', 'Переменная облачность'], 3: ['☁️', 'Пасмурно'],
  45: ['🌫', 'Туман'], 48: ['🌫', 'Изморозь'], 51: ['🌦', 'Морось'], 53: ['🌦', 'Морось'], 55: ['🌦', 'Сильная морось'],
  61: ['🌧', 'Небольшой дождь'], 63: ['🌧', 'Дождь'], 65: ['🌧', 'Ливень'], 66: ['🌧', 'Ледяной дождь'], 67: ['🌧', 'Ледяной дождь'],
  71: ['🌨', 'Небольшой снег'], 73: ['🌨', 'Снег'], 75: ['❄️', 'Сильный снег'], 77: ['🌨', 'Снежная крупа'],
  80: ['🌦', 'Ливни'], 81: ['🌧', 'Ливни'], 82: ['⛈', 'Сильные ливни'], 85: ['🌨', 'Снегопад'], 86: ['❄️', 'Сильный снегопад'],
  95: ['⛈', 'Гроза'], 96: ['⛈', 'Гроза с градом'], 99: ['⛈', 'Гроза с градом'],
};
const wmo = (c) => WMO[c] || ['🌡', '—'];
let weather = null;
$('#cityForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#cityInput').value.trim();
  $('#weatherNow').innerHTML = '<div class="muted">Ищу город…</div>';
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru`).then((r) => r.json());
    if (!r.results?.length) { $('#weatherNow').innerHTML = '<div class="neg">Город не найден</div>'; return; }
    const c = r.results[0];
    S.city = { name: c.name, lat: c.latitude, lon: c.longitude };
    save(); loadWeather();
  } catch { $('#weatherNow').innerHTML = '<div class="neg">Нет связи с сервисом погоды</div>'; }
};
async function loadWeather() {
  if (!S.city) { $('#weatherNow').innerHTML = '<div class="muted">Укажите город, чтобы видеть погоду</div>'; return; }
  $('#cityInput').value = S.city.name;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${S.city.lat}&longitude=${S.city.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&wind_speed_unit=ms`;
    weather = await fetch(u).then((r) => r.json());
    const cur = weather.current; const [ico, txt] = wmo(cur.weather_code);
    $('#weatherNow').innerHTML = `<div class="weather-now"><span class="ico">${ico}</span><div>
      <div class="big">${Math.round(cur.temperature_2m)}° <span class="muted" style="font-size:16px">${esc(S.city.name)}</span></div>
      <div class="muted">${txt} · ощущается как ${Math.round(cur.apparent_temperature)}° · ветер ${Math.round(cur.wind_speed_10m)} м/с · влажность ${cur.relative_humidity_2m}%</div></div></div>`;
    const d = weather.daily;
    $('#weatherDays').innerHTML = d.time.map((t, i) => `<div class="day">
      <div class="muted">${i === 0 ? 'Сегодня' : parseISO(t).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</div>
      <div class="ico">${wmo(d.weather_code[i])[0]}</div>
      <div><b>${Math.round(d.temperature_2m_max[i])}°</b> <span class="muted">${Math.round(d.temperature_2m_min[i])}°</span></div></div>`).join('');
  } catch { $('#weatherNow').innerHTML = '<div class="neg">Не удалось загрузить погоду</div>'; }
  renderOverview();
}

// ===== Сервисы (ссылки) =====
$('#linkForm').onsubmit = (e) => {
  e.preventDefault();
  S.links.push({ id: uid(), icon: $('#linkIcon').value.trim() || '🔗', title: $('#linkTitle').value.trim(), url: $('#linkUrl').value.trim() });
  e.target.reset(); save(); renderLinks();
};
// У сервисов Google общий значок «G» — для них берём фирменные иконки
const FAVICONS = {
  'mail.google.com': 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  'drive.google.com': 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
  'calendar.google.com': 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png',
};
function linkTile(l, removable) {
  const a = document.createElement('a');
  a.className = removable ? 'link-tile' : 'service';
  a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
  const fav = l.app === 'chrome' ? 'https://www.google.com/s2/favicons?domain=chrome.google.com&sz=64'
    : FAVICONS[hostOf(l.url)] || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(l.url))}&sz=64`;
  const ico = `<span class="sico"><img src="${fav}" alt="" onerror="this.replaceWith(document.createTextNode(this.dataset.e))" data-e="${esc(l.icon)}"></span>`;
  a.innerHTML = removable
    ? `${ico}<span>${esc(l.title)}</span><button class="del">✕</button>`
    : `${ico}<span>${esc(l.title)}</span>`;
  a.onclick = (e) => {
    if (!API()) return;
    e.preventDefault();
    if (l.app === 'chrome') API().launch_chrome(); else API().open_url(l.url);
  };
  if (removable) a.querySelector('.del').onclick = (e) => {
    e.preventDefault(); e.stopPropagation(); S.links = S.links.filter((x) => x !== l); save(); renderLinks();
  };
  return a;
}
function renderLinks() {
  const box = $('#linkList'); box.innerHTML = '';
  S.links.forEach((l) => box.appendChild(linkTile(l, true)));
}

// ===== Главная =====
const QUOTES = [
  'Большие цели начинаются с маленьких шагов 🚀', 'Сделай сегодня то, за что завтра скажешь себе спасибо',
  'Не обязательно быть великим, чтобы начать', 'Маленький прогресс — тоже прогресс', 'Фокус на главном, остальное подождёт',
];
function renderOverview() {
  const h = new Date().getHours();
  const hello = h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  const icon = h < 6 || h >= 21 ? '🌙' : h < 18 ? '☀️' : '🌇';
  $('#greeting').textContent = `${hello}${S.name ? ', ' + S.name : ''}! ${icon}`;
  $('#todayLabel').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const t = today();
  const todayTasks = S.tasks.filter((x) => !x.done && x.due === t).length;
  const todayEv = S.events.filter((e) => e.date === t).length;
  $('#daySub').textContent = todayTasks || todayEv
    ? `Сегодня ${plural(todayEv, 'событие', 'события', 'событий')} и ${plural(todayTasks, 'задача', 'задачи', 'задач')}. Отличный день, чтобы делать важные дела.`
    : 'Отличный день, чтобы делать важные дела.';
  $('#avatar').textContent = (S.name || '?')[0].toUpperCase();
  $('#profileName').textContent = S.name || 'Гость';

  // Сегодня в календаре
  const ev = S.events.filter((e) => e.date === t).sort((a, b) => a.time.localeCompare(b.time));
  const nowHM = new Date().toTimeString().slice(0, 5);
  $('#ovToday').innerHTML = ev.length ? ev.map((e) => `<li class="${e.time && e.time < nowHM ? 'past' : ''}">
    <i></i><span class="time">${e.time || 'весь день'}</span><span>${esc(e.title)}</span></li>`).join('')
    : '<li class="empty">На сегодня событий нет</li>';

  // Приоритеты
  const prio = S.tasks.filter((x) => x.prio && (!x.done || x.doneAt === t));
  const ulP = $('#ovPrio'); ulP.innerHTML = '';
  if (!prio.length) ulP.innerHTML = '<li class="empty">Отметьте ★ важные задачи или добавьте здесь</li>';
  prio.slice(0, 7).forEach((x) => ulP.appendChild(taskLi(x, { compact: true })));

  // Ближайшие задачи
  const up = S.tasks.filter((x) => !x.done && x.due).sort((a, b) => a.due.localeCompare(b.due));
  const ulU = $('#ovUpcoming'); ulU.innerHTML = '';
  if (!up.length) ulU.innerHTML = '<li class="empty">Нет задач со сроком</li>';
  up.slice(0, 7).forEach((x) => ulU.appendChild(taskLi(x, { compact: true })));

  // Маленькие карточки
  $('#ovWeather').innerHTML = weather?.current
    ? `${wmo(weather.current.weather_code)[0]} ${Math.round(weather.current.temperature_2m)}° <span class="muted" style="font-size:15px">${esc(S.city.name)}</span>`
    : '<span class="muted" style="font-size:15px">Укажите город →</span>';
  const doneH = S.habits.filter((x) => x.log[t]).length;
  $('#ovHabits').innerHTML = S.habits.length
    ? `<div class="big">${doneH} / ${S.habits.length}</div><div class="bar"><div style="width:${doneH / S.habits.length * 100}%;background:var(--green)"></div></div>`
    : '<div class="muted">Привычек пока нет</div>';
  const { inc, out, byCur } = monthTotals(t.slice(0, 7)); const bal = inc - out;
  const foreign = Object.keys(byCur).some((c) => c !== 'RUB');
  $('#ovFinance').innerHTML = `<div class="big ${bal >= 0 ? 'pos' : 'neg'}">${foreign ? '≈ ' : ''}${fmt(bal)}</div>
    <div class="muted small">+${fmt(inc)} / −${fmt(out)}</div>
    ${foreign ? `<div class="muted small">Доход: ${curLines(byCur, 'inc') || '—'}</div>` : ''}`;
  {
    const sh = showData(), mk = monthKey(new Date());
    const m = shMoney(sh.items.filter((i) => i.date.startsWith(mk))), all = shMoney(sh.items);
    const top = sh.cats.map((c) => ({ c, v: sh.items.filter((i) => i.cat === c.id && i.date.startsWith(mk)).reduce((a, i) => a + weightOf(i), 0) }))
      .sort((a, b) => b.v - a.v)[0];
    $('#ovShow').innerHTML = `<div class="big neg${m.text.length > 10 ? ' sh-long' : ''}">${m.approx ? '≈ ' : ''}${m.text}</div>
      <div class="muted small">${top?.v ? `больше всего: ${esc(top.c.icon)} ${esc(top.c.name)}` : 'за этот месяц'}</div>
      <div class="muted small">всего: ${all.approx ? '≈ ' : ''}${all.text}</div>`;
  }
  $('#ovProjects').innerHTML = S.projects.length ? S.projects.slice(0, 3).map((p) => {
    const { pct } = projectStats(p);
    return `<div class="bar-row"><div class="lbl"><span>${esc(p.name)}</span><span>${pct}%</span></div>
      <div class="bar"><div style="width:${pct}%;background:${esc(p.color)}"></div></div></div>`;
  }).join('') : '<div class="muted">Проектов пока нет</div>';

  // Сервисы
  const sv = $('#ovServices'); sv.innerHTML = '';
  S.links.forEach((l) => sv.appendChild(linkTile(l, false)));
  exOverview();
}
$('#addPrioBtn').onclick = () => { $('#prioForm').classList.toggle('hidden'); $('#prioText').focus(); };
$('#prioForm').onsubmit = (e) => {
  e.preventDefault(); addTask($('#prioText').value.trim(), { prio: true });
  $('#prioText').value = ''; $('#prioForm').classList.add('hidden');
};

// ===== Уведомления =====
function notifications() {
  const t = today(), nowHM = new Date().toTimeString().slice(0, 5);
  // key — постоянный id уведомления: по нему помним, что вы его уже видели
  return [
    ...S.tasks.filter((x) => !x.done && x.due && x.due < t).map((x) => ({ key: `late:${x.id}`, ico: '⚠️', text: `Просрочено: ${x.text}`, view: 'tasks' })),
    ...S.tasks.filter((x) => !x.done && x.due === t).map((x) => ({ key: `today:${x.id}:${t}`, ico: '📌', text: `Сегодня: ${x.text}`, view: 'tasks' })),
    ...S.events.filter((e) => e.remind && !e.done && remDue(e) <= Date.now()).map((e) => ({ key: `rem:${e.id}`, ico: '🔔', text: `${fmtDate(e.date)}${e.time ? ' ' + e.time : ''} — ${e.title}`, view: 'calendar', day: e.date })),
    ...S.events.filter((e) => e.date === t && (!e.time || e.time >= nowHM) && !(e.remind && !e.done && remDue(e) <= Date.now())).map((e) => ({ key: `ev:${e.id}`, ico: '📅', text: `${e.time || 'Сегодня'} — ${e.title}`, view: 'calendar', day: e.date })),
    ...(exData.items || []).filter((i) => exUsed(i.exchange) && i.unread && i.ts > Date.now() - 864e5 && i.kind !== 'other').slice(0, 10)
      .map((i) => ({ key: `ex:${i.source}:${i.id}`, ico: KIND[i.kind][0], text: `${EX.find((e) => e.key === i.exchange).name}: ${i.subject}`, view: 'exchanges', link: i.link })),
  ];
}
const seenSet = () => new Set(S.bellSeen || []);
let bellHighlight = null; // новые на момент открытия колокольчика
function renderBell() {
  const n = notifications(), seen = seenSet();
  const fresh = n.filter((x) => !seen.has(x.key)).length; // на значке — только новые
  $('#bellCount').textContent = fresh || '';
  $('#bellCount').style.display = fresh ? '' : 'none';
  // Яркие — те, на которые вы ещё не нажимали; после нажатия — тусклые.
  // Оранжевая полоска — пришло с прошлого раза, как вы открывали колокольчик.
  const opened = new Set(S.bellOpened || []);
  const isNew = (x) => !seen.has(x.key) || bellHighlight?.has(x.key);
  const list = [...n.filter((x) => !opened.has(x.key)), ...n.filter((x) => opened.has(x.key))];
  $('#bellList').innerHTML = list.length
    ? list.map((x, i) => `<div class="dd-item ${opened.has(x.key) ? 'read' : 'unread'}${isNew(x) ? ' fresh' : ''}" data-i="${i}">${x.ico} ${esc(x.text)}</div>`).join('')
    : '<div class="dd-item muted">Уведомлений нет 🎉</div>';
  $('#bellList').querySelectorAll('[data-i]').forEach((el) => el.onclick = () => {
    const x = list[el.dataset.i];
    if (!opened.has(x.key)) { S.bellOpened = [...opened, x.key].slice(-500); save(); }
    if (x.day) { selDay = x.day; calMonth = new Date(parseISO(x.day)); calMonth.setDate(1); }
    if (x.link) openUrl(x.link); else go(x.view); // письмо с биржи открывается сразу
    closeBell();
  });
}
function closeBell() { $('#bellList').classList.remove('open'); bellHighlight = null; renderBell(); }
// Открыли колокольчик — всё, что в нём сейчас, считается просмотренным
function markBellSeen() {
  const keys = notifications().map((x) => x.key), seen = seenSet();
  if (keys.every((k) => seen.has(k))) return;
  S.bellSeen = [...seen, ...keys.filter((k) => !seen.has(k))].slice(-500);
  save();
}
$('#bellBtn').onclick = (e) => {
  e.stopPropagation();
  const opening = !$('#bellList').classList.contains('open');
  if (opening) {
    // пока список открыт, новые остаются подсвеченными; счётчик на значке сразу пропадает
    const seen = seenSet();
    bellHighlight = new Set(notifications().map((x) => x.key).filter((k) => !seen.has(k)));
    markBellSeen();
  } else bellHighlight = null;
  $('#bellList').classList.toggle('open', opening);
  renderBell();
};

// ===== Поиск =====
$('#searchInput').oninput = () => {
  const q = $('#searchInput').value.trim().toLowerCase();
  const box = $('#searchResults');
  if (!q) { box.classList.remove('open'); return; }
  const has = (s) => (s || '').toLowerCase().includes(q);
  const res = [
    ...S.tasks.filter((t) => has(t.text)).map((t) => ({ ico: t.done ? '☑️' : '✅', text: t.text, go: () => go('tasks') })),
    ...S.notes.filter((n) => has(n.title) || has(n.body)).map((n) => ({ ico: '📝', text: n.title || 'Без названия', go: () => { curNote = n.id; renderNotes(); go('notes'); } })),
    ...S.events.filter((e) => has(e.title)).map((e) => ({ ico: '📅', text: `${fmtDate(e.date)} — ${e.title}`, go: () => { selDay = e.date; calMonth = parseISO(e.date); calMonth.setDate(1); renderCalendar(); go('calendar'); } })),
    ...S.projects.filter((p) => has(p.name)).map((p) => ({ ico: '📁', text: p.name, go: () => go('projects') })),
  ].slice(0, 10);
  box.innerHTML = res.length ? res.map((r, i) => `<div class="dd-item" data-i="${i}">${r.ico} ${esc(r.text)}</div>`).join('') : '<div class="dd-item muted">Ничего не найдено</div>';
  box.querySelectorAll('[data-i]').forEach((el) => el.onclick = () => { res[el.dataset.i].go(); box.classList.remove('open'); $('#searchInput').value = ''; });
  box.classList.add('open');
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) $('#searchResults').classList.remove('open');
  if (!e.target.closest('.bell-wrap') && $('#bellList').classList.contains('open')) closeBell();
});

// ===== Фокус на главное =====
// Таймер хранится на этом устройстве (время окончания), поэтому идёт и при закрытом окне,
// и после перезапуска приложения. Пока идёт — виден вверху (⏱ 18:42).
const FOCUS_LEN = 25 * 60, FOCUS_KEY = 'focus.timer';
let focusList = [], focusIdx = 0, focusTick = null;
const fState = () => { try { return JSON.parse(localStorage.getItem(FOCUS_KEY)) || {}; } catch { return {}; } };
const fSave = (st) => (st ? localStorage.setItem(FOCUS_KEY, JSON.stringify(st)) : localStorage.removeItem(FOCUS_KEY));
const focusLeftNow = () => { const st = fState(); return st.end ? Math.max(0, Math.round((st.end - Date.now()) / 1000)) : (st.left ?? FOCUS_LEN); };
const fmtMin = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const hhmm = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
// Уведомление: на компьютере — звук и мигание окна, на телефоне — уведомление Android
function notifyUser(title, body, opts = {}) {
  try { window.pywebview?.api?.notify?.(title, body, opts); } catch { /* нет — не страшно */ }
}
function focusCandidates() {
  const t = today();
  const score = (x) => (x.prio ? 0 : 2) + (x.due && x.due <= t ? 0 : 1);
  return S.tasks.filter((x) => !x.done).sort((a, b) => score(a) - score(b) || (a.due || '9').localeCompare(b.due || '9'));
}
function showFocus() {
  const task = focusList[focusIdx];
  $('#focusTask').textContent = task ? task.text : 'Все задачи выполнены — можно отдохнуть 🎉';
  $('#focusDone').style.display = $('#focusSkip').style.display = task ? '' : 'none';
}
function drawTimer() {
  const st = fState(), left = focusLeftNow(), running = !!st.end, paused = !running && st.left != null;
  $('#focusTimer').textContent = fmtMin(left);
  $('#focusStart').textContent = running ? '⏸ Пауза' : paused ? '▶ Продолжить' : '▶ Старт';
  $('#focusReset').style.display = running || paused ? '' : 'none';
  $('#focusHint').textContent = running ? `Закончится в ${hhmm(st.end)}. Окно можно закрыть — таймер продолжит идти, он виден вверху ⏱`
    : paused ? 'Таймер на паузе' : '';
  const chip = $('#focusChip');
  chip.classList.toggle('hidden', !running && !paused);
  chip.classList.toggle('paused', paused);
  $('#focusChipTime').textContent = fmtMin(left);
}
function focusFinished() {
  const st = fState();
  clearInterval(focusTick); focusTick = null; fSave(null); drawTimer();
  const late = Date.now() - st.end > 90 * 1000; // приложение было закрыто, когда время вышло
  const text = late ? `Таймер фокуса закончился в ${hhmm(st.end)}.` : '25 минут прошло! Сделайте перерыв 5 минут.';
  if (!late) notifyUser('⏱ 25 минут прошло', 'Сделайте перерыв 5 минут.', { tag: 'focus', sound: true });
  else notifyUser('', '', { tag: 'focus', clear: true });
  setTimeout(() => alert(text), 50);
}
function focusLoop() {
  clearInterval(focusTick); focusTick = null;
  const st = fState();
  if (st.end && st.end <= Date.now()) { focusFinished(); return; }
  if (st.end) focusTick = setInterval(() => { const e = fState().end; if (e && e <= Date.now()) focusFinished(); else drawTimer(); }, 1000);
  drawTimer();
}
const focusTaskText = () => (focusList[focusIdx] ? focusList[focusIdx].text : '');
function openFocus() {
  focusList = focusCandidates();
  const want = fState().task;
  const i = want ? focusList.findIndex((x) => x.text === want) : -1;
  focusIdx = i >= 0 ? i : 0;
  showFocus(); drawTimer();
  $('#focusOverlay').classList.remove('hidden');
}
$('#focusBtn').onclick = openFocus;
$('#focusChip').onclick = openFocus;
$('#focusStart').onclick = () => {
  const st = fState();
  if (st.end) { // пауза
    fSave({ left: focusLeftNow(), task: st.task });
    notifyUser('', '', { tag: 'focus', clear: true });
  } else {
    const end = Date.now() + (st.left ?? FOCUS_LEN) * 1000;
    fSave({ end, task: focusTaskText() });
    notifyUser(`⏱ Фокус до ${hhmm(end)}`, focusTaskText() || 'Работайте без отвлечений', { tag: 'focus', silent: true, ask: true });
  }
  focusLoop();
};
$('#focusReset').onclick = () => { fSave(null); notifyUser('', '', { tag: 'focus', clear: true }); focusLoop(); };
$('#focusDone').onclick = () => { const x = focusList[focusIdx]; if (x) toggleTask(x); focusList = focusCandidates(); focusIdx = 0; showFocus(); const st = fState(); if (st.end || st.left != null) fSave({ ...st, task: focusTaskText() }); };
$('#focusSkip').onclick = () => { focusIdx = (focusIdx + 1) % Math.max(1, focusList.length); showFocus(); const st = fState(); if (st.end || st.left != null) fSave({ ...st, task: focusTaskText() }); };
$('#focusClose').onclick = () => $('#focusOverlay').classList.add('hidden');
// При возврате в приложение — сразу проверить, не вышло ли время
document.addEventListener('visibilitychange', () => { if (!document.hidden) focusLoop(); });
focusLoop();

// ===== Почта Gmail =====
const openUrl = (u) => API() ? API().open_url(u) : window.open(u, '_blank', 'noopener');
document.querySelectorAll('a.ext').forEach((a) => a.onclick = (e) => { e.preventDefault(); openUrl(a.href); });
function mailTime(ts) {
  const d = new Date(ts);
  return iso(d) === today() ? d.toTimeString().slice(0, 5) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function renderGmailState(st) {
  const box = $('#gmailState');
  if (!API()) { box.innerHTML = '<p class="muted">Подключение почты работает в установленной программе «Мой дашборд».</p>'; return; }
  const err = st.error ? `<p class="neg">${esc(st.error)}</p>` : '';
  const afterMail = (s) => { renderGmailState(s); loadMail(); loadExchanges(true); };
  if (st.connected) {
    const mail = st.mail
      ? `<p>📬 Почта подключена — письма и биржи видны в дашборде.</p>
         <div class="row-form"><button class="ghost" id="mailOff">Отключить почту</button><button class="ghost" id="gmOff">Выйти из Google</button></div>`
      : `<p class="muted">📭 Почта не подключена. Подключите, если хотите видеть непрочитанные письма и сообщения с бирж прямо в дашборде.</p>
         <p class="muted small">Google покажет предупреждение «Приложение не проверено» — это нормально для небольших приложений. Нажмите «Дополнительно» → «Перейти» и разрешите чтение почты. Дашборд письма только читает: не отправляет и не удаляет.</p>
         <div class="row-form"><button id="mailOn">Подключить почту</button><button class="ghost" id="gmOff">Выйти из Google</button></div>`;
    box.innerHTML = st.needLogin
      ? `<p class="neg">⚠️ Вход Google истёк${st.email ? ` (<b>${esc(st.email)}</b>)` : ''} — почта и копия в Google не обновляются.</p>
         <div class="row-form"><button id="gmAgain">Войти снова</button></div>${err}${mail}`
      : `<p>✅ Вход выполнен${st.email ? `: <b>${esc(st.email)}</b>` : ''}</p>${err}${mail}`;
    $('#gmAgain')?.addEventListener('click', loginAgain);
    $('#gmOff').onclick = async () => {
      if (!confirm('Выйти из Google? Данные останутся в программе, но перестанут копироваться в Google.')) return;
      afterMail(await API().gmail_disconnect()); renderCloud();
    };
    $('#mailOff')?.addEventListener('click', async () => afterMail(await API().mail_disconnect()));
    $('#mailOn')?.addEventListener('click', async () => {
      $('#mailOn').disabled = true; $('#mailOn').textContent = 'Ждём вход в браузере…';
      afterMail(await API().mail_connect());
    });
  } else if (st.hasClient) {
    box.innerHTML = `<p>Войдите через Google — тогда все ваши записи будут сами сохраняться в Google и вернутся на новом телефоне или компьютере.</p>${err}
      <div class="row-form"><button id="gmIn">Войти через Google</button><button class="ghost" id="gmKey">Заменить ключ</button></div>`;
    $('#gmIn').onclick = async () => {
      $('#gmIn').disabled = true; $('#gmIn').textContent = 'Ждём вход в браузере…';
      renderGmailState(await API().gmail_connect()); loadMail(); loadExchanges(true);
      await renderCloud(); maybeOfferRestore();
    };
    $('#gmKey').onclick = async () => renderGmailState(await API().gmail_choose_client_file());
  } else {
    box.innerHTML = `<p class="muted">Почта не подключена. Нужен файл ключа от Google — инструкция ниже.</p>${err}
      <div class="row-form"><button id="gmKey">Выбрать файл ключа</button></div>`;
    $('#gmKey').onclick = async () => renderGmailState(await API().gmail_choose_client_file());
    $('#gmailHelp').open = true;
  }
}
// Повторный вход Google, когда старый истёк (телефон)
function loginAgain(e) {
  if (e?.currentTarget) { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Открываю вход Google…'; }
  API().gmail_connect();
}
const againBtn = '<button class="ghost" data-again style="margin-top:8px">Войти снова</button>';
const wireAgain = (root) => root?.querySelectorAll('[data-again]').forEach((b) => b.onclick = loginAgain);
// ===== Общий блок почты на главной =====
let mailLoading = false;
async function loadMail() {
  const ul = $('#ovMail'), all = $('#mailAll');
  if (!API()) { ul.innerHTML = '<li class="empty">Работает в установленной программе</li>'; return; }
  if (mailLoading) return; mailLoading = true;
  try {
    const g = await API().gmail_unread();
    all.classList.add('hidden'); all.innerHTML = '';
    if (!g.connected) {
      ul.innerHTML = '<li class="empty">Почта не подключена. <a class="link" id="mailSetup">Подключить →</a></li>';
      $('#mailSetup').onclick = () => go('settings');
      return;
    }
    const msgs = (g.messages || []).map((m) => ({ ...m, src: 'G', link: m.link || `https://mail.google.com/mail/u/0/#inbox/${m.id}` }))
      .sort((a, b) => b.ts - a.ts).slice(0, 6);
    ul.innerHTML = msgs.length ? '' : '<li class="empty">Все письма прочитаны 🎉</li>';
    if (g.needLogin) {
      ul.innerHTML = `<li class="empty">Вход Google истёк — письма не обновляются.<br>${againBtn}</li>`;
      wireAgain(ul);
    } else if (g.error && !g.messages?.length) ul.innerHTML = `<li class="empty neg">Письма не загрузились: ${esc(g.error)}</li>`;
    msgs.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'mail-item';
      li.innerHTML = `<i></i><div class="grow"><div class="mail-from">${esc(m.from)}</div>
        <div class="muted small">${esc(m.subject)}</div></div>
        <span class="src src-${m.src}" title="Gmail">${m.src}</span><span class="muted small">${mailTime(m.ts)}</span>`;
      li.onclick = () => openUrl(m.link);
      ul.appendChild(li);
    });
    const btn = (label, url) => { const b = document.createElement('button'); b.className = 'ghost'; b.textContent = label; b.onclick = () => openUrl(url); all.appendChild(b); };
    if (g.connected) btn(`Gmail (${g.total ?? 0}) ›`, 'https://mail.google.com/mail/u/0/#inbox');
    all.classList.remove('hidden');
  } finally { mailLoading = false; }
}
$('#mailRefresh').onclick = (e) => { e.stopPropagation(); loadMail(); };

// ===== Биржи =====
const EX = [
  { key: 'kwork', name: 'Kwork', icon: '🟢', url: 'https://kwork.ru/inbox' },
  { key: 'fl', name: 'FL.ru', icon: '🔵', url: 'https://www.fl.ru/projects/' },
  { key: 'freelance', name: 'Freelance.ru', icon: '🟠', url: 'https://freelance.ru/project/search' },
  { key: 'freelancer', name: 'Freelancer', icon: '🔷', url: 'https://www.freelancer.com/dashboard' },
  { key: 'upwork', name: 'Upwork', icon: '🟩', url: 'https://www.upwork.com/nx/find-work/' },
  { key: 'fiverr', name: 'Fiverr', icon: '💚', url: 'https://www.fiverr.com/inbox' },
];
// Биржи, которыми человек пользуется (Настройки → «Мои биржи»). Остальные нигде не показываются.
const exOn = () => EX.filter((e) => (S.exUse || []).includes(e.key));
const exUsed = (key) => (S.exUse || []).includes(key);
const KIND = { order: ['📦', 'Заказ'], message: ['💬', 'Сообщение'], payment: ['💰', 'Оплата'], other: ['✉️', 'Письмо'] };
let exData = { items: [], gmail: false, loading: true }, exFilter = 'all', flItems = [];
const weekAgo = () => Date.now() - 7 * 864e5;
const exMonthTx = (ex) => S.tx.filter((t) => t.type === 'in' && t.cat === ex.name && t.date.startsWith(today().slice(0, 7)));
const exIncome = (ex) => exMonthTx(ex).reduce((a, t) => a + toRub(t.amount, curOf(t)), 0);
// Доход по валютам: «1 500 ₽ + 25 $»
const exIncomeLine = (ex) => {
  const by = {}; exMonthTx(ex).forEach((t) => by[curOf(t)] = (by[curOf(t)] || 0) + t.amount);
  return Object.keys(CURS).filter((c) => by[c]).map((c) => fmt(by[c], c)).join(' + ');
};
const balOf = (ex) => { const b = S.exBalance?.[ex.key]; return b == null ? null : typeof b === 'number' ? { n: b, cur: 'RUB' } : b; };
const num = (v) => parseFloat(String(v || '').replace(',', '.').replace(/\s/g, ''));

async function loadExchanges(force = false) {
  if (!exOn().length) { exData = { items: [], gmail: exData.gmail }; renderExchanges(); return; }
  if (!API()) { exData.loading = false; renderExchanges(); return; }
  $('#exNotice').innerHTML = '<p class="muted">Загружаю письма с бирж…</p>';
  try { exData = await API().exchanges_mail(force); } catch { exData = { items: [], error: true }; }
  renderExchanges(); renderOverview(); renderBell();
}
async function loadFl() {
  const ul = $('#flList');
  $('#flKeywords').value = S.flKeywords || '';
  if (!exUsed('fl')) { flItems = []; return; }
  if (!API()) { ul.innerHTML = '<li class="empty">Лента FL.ru работает в установленной программе</li>'; return; }
  ul.innerHTML = '<li class="empty">Загружаю…</li>';
  const r = await API().fl_projects(S.flKeywords || '');
  flItems = r.items || [];
  ul.innerHTML = r.ok ? (flItems.length ? '' : '<li class="empty">Нет проектов по вашим словам</li>') : '<li class="empty neg">FL.ru не отвечает</li>';
  flItems.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'fl-item';
    li.innerHTML = `<div class="grow"><div><b>${esc(p.title)}</b></div>
      <div class="muted small">${esc(p.category)}${p.desc ? ' · ' + esc(p.desc.slice(0, 110)) : ''}</div></div>
      <div class="fl-side">${p.budget ? `<span class="chip blue">${esc(p.budget)}</span>` : '<span class="chip">по договорённости</span>'}<span class="muted small">${mailTime(p.ts)}</span></div>`;
    li.onclick = () => openUrl(p.link);
    ul.appendChild(li);
  });
  renderOverview();
}
$('#flForm').onsubmit = (e) => { e.preventDefault(); S.flKeywords = $('#flKeywords').value.trim(); save(); loadFl(); };
$('#exRefresh').onclick = () => { loadExchanges(true); loadFl(); };
document.querySelectorAll('#exFilter button').forEach((b) => b.onclick = () => {
  exFilter = b.dataset.f;
  document.querySelectorAll('#exFilter button').forEach((x) => x.classList.toggle('active', x === b));
  renderExchanges();
});
$('#exSelect').onchange = () => renderExchanges();

function addIncome(ex, amount, note = '', mailId = null, date = today(), cur = 'RUB') {
  S.tx.push({ id: uid(), type: 'in', amount, cur, cat: ex.name, date, note, mailId });
  save(); renderFinance(); renderExchanges();
}
function renderExchanges() {
  applyExUse();
  const items = (exData.items || []).filter((i) => exUsed(i.exchange));
  const noMail = API() && !exData.gmail;
  $('#exNotice').innerHTML = !API()
    ? '<p class="muted">Письма с бирж загружаются в установленной программе.</p>'
    : noMail ? '<div class="notice">Подключите почту в <a class="link" id="exSetup">Настройках</a> — дашборд будет брать заказы, сообщения и оплаты из писем бирж.</div>'
    : exData.needLogin ? `<div class="notice">Вход Google истёк — письма с бирж не обновляются. ${againBtn}</div>`
    : exData.error ? `<p class="neg">Не удалось загрузить письма: ${esc(String(exData.error === true ? '' : exData.error))}</p>` : '';
  if ($('#exSetup')) $('#exSetup').onclick = () => go('settings');
  wireAgain($('#exNotice'));

  // Карточки бирж
  const cards = $('#exCards'); cards.innerHTML = '';
  exOn().forEach((ex) => {
    const mine = items.filter((i) => i.exchange === ex.key && i.ts >= weekAgo());
    const orders = mine.filter((i) => i.kind === 'order').length;
    const msgs = mine.filter((i) => i.kind === 'message').length;
    const bal = balOf(ex);
    const incLine = exIncomeLine(ex);
    const foreign = exMonthTx(ex).some((t) => curOf(t) !== 'RUB');
    const c = document.createElement('div');
    c.className = 'card ex-card';
    c.innerHTML = `<div class="card-head"><span class="ex-ico">${ex.icon}</span><a class="link op">Открыть ↗</a></div>
      <h4 class="ex-name" title="${ex.name}">${ex.name}</h4>
      <div class="ex-stats"><div><b>${orders}</b><span>заказов</span></div><div><b>${msgs}</b><span>сообщений</span></div></div>
      <div class="muted small">за 7 дней</div>
      <div class="sum-row"><span>Доход за месяц</span><b class="pos">${incLine || fmt(0)}</b></div>
      ${foreign ? `<div class="muted small" style="text-align:right">≈ ${fmt(exIncome(ex))}</div>` : ''}
      <div class="sum-row"><span>Баланс на бирже</span><b class="bal" title="Нажмите, чтобы изменить">${bal ? fmt(bal.n, bal.cur) : '—'} ✎</b></div>
      <button class="ghost wide inc">+ Записать доход</button>
      <form class="inc-form hidden"><input type="number" step="0.01" min="0" placeholder="Сумма" required>
        <select>${Object.keys(CURS).map((c) => `<option value="${c}">${CURS[c]}</option>`).join('')}</select><button>OK</button></form>`;
    c.querySelector('.op').onclick = () => openUrl(ex.url);
    c.querySelector('.bal').onclick = () => {
      const v = prompt(`Баланс на ${ex.name}. Можно с валютой: 1500, 25$ или 20€`, bal ? `${bal.n}${bal.cur === 'RUB' ? '' : CURS[bal.cur]}` : '');
      if (v === null) return;
      S.exBalance = S.exBalance || {};
      if (v.trim() === '') delete S.exBalance[ex.key]; else { const m = parseMoney(v); S.exBalance[ex.key] = { n: m.n || 0, cur: m.cur }; }
      save(); renderExchanges();
    };
    const f = c.querySelector('.inc-form');
    c.querySelector('.inc').onclick = () => { f.classList.toggle('hidden'); f[0].focus(); };
    f.onsubmit = (e) => { e.preventDefault(); const n = num(f[0].value); if (n > 0) addIncome(ex, n, 'Добавлено вручную', null, today(), f[1].value); };
    cards.appendChild(c);
  });

  // Лента писем
  const sel = $('#exSelect');
  const was = sel.value;
  sel.innerHTML = '<option value="">Все биржи</option>' + exOn().map((e) => `<option value="${e.key}">${e.name}</option>`).join('');
  sel.value = exUsed(was) ? was : '';
  const ul = $('#exFeed'); ul.innerHTML = '';
  const list = items.filter((i) => (exFilter === 'all' || i.kind === exFilter) && (!sel.value || i.exchange === sel.value));
  if (!list.length) ul.innerHTML = `<li class="empty">${noMail || !API() ? 'Нет подключённой почты' : 'Писем нет'}</li>`;
  list.slice(0, 60).forEach((m) => {
    const ex = EX.find((e) => e.key === m.exchange);
    const [ico, label] = KIND[m.kind] || KIND.other;
    const mailId = `${m.source}:${m.id}`;
    const counted = S.tx.some((t) => t.mailId === mailId);
    const li = document.createElement('li');
    li.className = 'mail-item' + (m.unread ? ' unread' : '');
    li.innerHTML = `<span class="kind" title="${label}">${ico}</span>
      <div class="grow"><div class="mail-from">${esc(m.subject)}</div>
      <div class="muted small">${ex.icon} ${ex.name} · ${esc(m.from)}</div></div>
      ${m.kind === 'payment' && m.amount ? (counted ? '<span class="chip">учтено</span>'
        : `<button class="ghost cnt" title="Учесть в доходах">+ ${fmt(m.amount, m.currency || 'RUB')}</button>`) : ''}
      <span class="src src-${m.source === 'gmail' ? 'G' : 'O'}">${m.source === 'gmail' ? 'G' : 'O'}</span>
      <span class="muted small">${mailTime(m.ts)}</span>`;
    li.onclick = () => openUrl(m.link);
    const cnt = li.querySelector('.cnt');
    if (cnt) cnt.onclick = (e) => {
      e.stopPropagation();
      addIncome(ex, m.amount, m.subject, mailId, iso(new Date(m.ts)), m.currency || 'RUB');
    };
    ul.appendChild(li);
  });
}
function exOverview() {
  const box = $('#ovExchanges');
  if (!box) return;
  const items = (exData.items || []).filter((i) => exUsed(i.exchange));
  const rows = exOn().map((ex) => {
    const mine = items.filter((i) => i.exchange === ex.key && i.ts >= weekAgo());
    const o = mine.filter((i) => i.kind === 'order').length, m = mine.filter((i) => i.kind === 'message').length;
    const inc = exIncomeLine(ex);
    if (!o && !m && !inc) return '';
    return `<div class="sum-row"><span>${ex.icon} ${ex.name}</span><span class="muted small">📦 ${o} · 💬 ${m}${inc ? ` · <b class="pos">${inc}</b>` : ''}</span></div>`;
  }).join('');
  const total = exOn().reduce((a, ex) => a + exIncome(ex), 0);
  const emptyMsg = exData.loading ? 'Загружаю письма с бирж…'
    : exData.needLogin ? `Вход Google истёк — письма с бирж не обновляются.<br>${againBtn}`
    : exData.error ? 'Не удалось загрузить письма — нажмите «Открыть» → ⟳'
    : API() && !exData.gmail ? 'Подключите почту, чтобы видеть заказы' : 'За неделю писем с бирж нет';
  box.innerHTML = (rows || `<div class="muted">${emptyMsg}</div>`) +
    `<div class="sum-row" style="margin-top:6px"><span>Доход с бирж за месяц</span><b class="pos">≈ ${fmt(total)}</b></div>` +
    (flItems.length ? `<div class="muted small">🆕 FL.ru: ${plural(flItems.length, 'новый проект', 'новых проекта', 'новых проектов')}${S.flKeywords ? ' по вашим словам' : ''}</div>` : '');
  wireAgain(box);
}

// Показ/скрытие всего, что связано с биржами, + выбор бирж в Настройках
function applyExUse() {
  const any = exOn().length > 0;
  document.querySelector('nav button[data-view="exchanges"]')?.classList.toggle('hidden', !any);
  $('#ovExCard')?.classList.toggle('hidden', !any);
  $('#flCard')?.classList.toggle('hidden', !exUsed('fl'));
  document.querySelector('.ex-layout')?.classList.toggle('single', !exUsed('fl'));
  const box = $('#exUsePick');
  if (box && !box.childElementCount) {
    box.innerHTML = EX.map((e) => `<label class="check ex-use"><input type="checkbox" value="${e.key}"> ${e.icon} ${e.name}</label>`).join('');
    box.querySelectorAll('input').forEach((cb) => cb.onchange = () => {
      S.exUse = [...box.querySelectorAll('input:checked')].map((x) => x.value);
      save(); renderExchanges(); renderOverview(); renderBell();
      if (cb.checked) { loadExchanges(true); if (cb.value === 'fl') loadFl(); }
    });
  }
  box?.querySelectorAll('input').forEach((cb) => { cb.checked = exUsed(cb.value); });
}

// ===== Настройки и резервная копия =====
$('#profileForm').onsubmit = (e) => { e.preventDefault(); S.name = $('#nameInput').value.trim(); save(); go('overview'); };
function applyBackup(text) {
  try {
    const data = JSON.parse(text);
    if (confirm('Заменить текущие данные данными из файла?')) { S = Object.assign(defaults(), data); save(); renderAll(); }
  } catch { alert('Не удалось прочитать файл'); }
}
$('#exportBtn').onclick = () => {
  const name = `dashboard-backup-${today()}.json`, text = JSON.stringify(S, null, 2);
  if (API()) API().export_backup(text, name); else download(name, text, 'application/json');
};
$('#importInput').onchange = async (e) => {
  const f = e.target.files[0]; if (f) applyBackup(await f.text());
  e.target.value = '';
};
document.querySelector('.file-btn').onclick = async (e) => {
  if (!API()) return; // в браузере работает обычный выбор файла
  e.preventDefault();
  const text = await API().import_backup(); if (text) applyBackup(text);
};

// ===== Резервная копия на Google Диске =====
const fmtWhen = (isoStr) => new Date(isoStr).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
// имя не считаем: на новом компьютере его вводят первым делом, а копию предложить всё равно нужно
const isEmptyData = () => !S.tasks.length && !S.tx.length && !S.notes.length && !S.habits.length
  && !S.events.length && !(S.show?.items?.length) && !(S.fx?.length);
async function renderCloud(msg = '') {
  const box = $('#cloudState');
  if (!API()) { box.innerHTML = '<p class="muted">Работает в установленной программе «Мой дашборд».</p>'; return null; }
  box.innerHTML = '<p class="muted">Проверяю Google Диск…</p>';
  const st = await API().cloud_status();
  const note = msg ? `<p>${msg}</p>` : '';
  if (st.ready) {
    box.innerHTML = `<p>✅ Включено. ${st.last ? `Последняя копия: <b>${fmtWhen(st.last)}</b>` : 'Копий пока нет — первая появится после любого изменения.'}</p>
      ${st.autoError ? `<p class="neg small">Последняя автокопия не удалась: ${esc(st.autoError)}</p>` : ''}${note}
      <div class="row-form"><button id="clSave">Сохранить сейчас</button><button class="ghost" id="clRestore">Восстановить из Google</button></div>`;
    $('#clSave').onclick = async () => {
      if (isEmptyData() && st.last && !confirm('В программе сейчас нет данных. Всё равно заменить ими копию в Google?')) return;
      $('#clSave').disabled = true; $('#clSave').textContent = 'Сохраняю…';
      const r = await API().cloud_backup();
      renderCloud(r.ok ? '☁️ Копия сохранена' : `<span class="neg">${esc(r.error)}</span>`);
    };
    $('#clRestore').onclick = () => restoreFromCloud(st.last);
  } else if (st.enableUrl) {
    box.innerHTML = `<p class="neg">${esc(st.error)}</p>
      <ol class="steps"><li>Откройте <a class="ext" href="${st.enableUrl}">Google Drive API</a> (тот же проект, что и для Gmail) и нажмите «Включить».</li>
      <li>Подождите минуту и нажмите «Проверить снова».</li></ol>
      <div class="row-form"><button id="clRetry">Проверить снова</button></div>`;
    box.querySelector('a.ext').onclick = (e) => { e.preventDefault(); openUrl(st.enableUrl); };
    $('#clRetry').onclick = () => renderCloud();
  } else if (st.connected || st.needScope) {
    box.innerHTML = `<p>Вход в Google выполнен, но доступа к Google Диску для копий ещё нет. Нажмите кнопку — откроется вход Google, разрешите доступ к «данным приложения на Google Диске».</p>${note}
      <div class="row-form"><button id="clGrant">Разрешить резервные копии</button></div>`;
    $('#clGrant').onclick = async () => {
      $('#clGrant').disabled = true; $('#clGrant').textContent = 'Ждём вход в браузере…';
      renderGmailState(await API().gmail_connect());
      await renderCloud(); maybeOfferRestore();
    };
  } else {
    box.innerHTML = `<p class="muted">Сначала войдите через Google (карточка «Аккаунт Google и почта» выше) — копии будут храниться в вашем аккаунте Google.</p>${st.error ? `<p class="neg small">${esc(st.error)}</p>` : ''}`;
  }
  return st;
}
async function restoreFromCloud(last, ask = true) {
  if (ask && !confirm(`Заменить данные в программе копией из Google${last ? ` от ${fmtWhen(last)}` : ''}?\nТекущие данные сохранятся в файл data.before-restore.json.`)) return;
  const r = await API().cloud_restore();
  if (!r.ok) { renderCloud(`<span class="neg">${esc(r.error)}</span>`); return; }
  S = Object.assign(defaults(), JSON.parse(r.data));
  save(); renderAll();
  renderCloud('✅ Данные восстановлены из Google');
}
// Новая установка с пустыми данными, а в Google есть копия — предложить восстановить
async function maybeOfferRestore() {
  if (!API() || !isEmptyData()) return;
  const st = await API().cloud_status();
  if (st.ready && st.last && confirm(`В Google найдена резервная копия ваших данных от ${fmtWhen(st.last)}.\nВосстановить её?`)) {
    restoreFromCloud(st.last, false);
  }
}

// ===== Тема оформления =====
// S.theme: 'auto' (день/ночь по часам) или конкретная тема. День = «Светлая», ночь = «Тёмная».
// Выбранная тема (любая, кроме «Авто») работает всегда — часы её не переключают.
const DARK_THEMES = ['dark', 'ocean'];
const DAY_FROM = 7, NIGHT_FROM = 19; // с 7:00 день, с 19:00 ночь
const isDayTime = () => { const h = new Date().getHours(); return h >= DAY_FROM && h < NIGHT_FROM; };
const effectiveTheme = () => {
  const t = S.theme || 'paper';
  return t === 'auto' ? (isDayTime() ? 'paper' : 'dark') : t;
};
function applyTheme() {
  const t = S.theme || 'paper', eff = effectiveTheme(), dark = DARK_THEMES.includes(eff);
  if (eff === 'paper') delete document.body.dataset.theme; else document.body.dataset.theme = eff;
  document.body.classList.toggle('is-dark', dark);
  document.querySelectorAll('.theme-opt').forEach((b) => b.classList.toggle('active', t !== 'auto' && b.dataset.theme === t));
  const mode = t === 'auto' ? 'auto' : t === 'paper' ? 'day' : t === 'dark' ? 'night' : '';
  document.querySelectorAll('#modePick button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#modeHint').textContent = t === 'auto'
    ? `Сейчас ${isDayTime() ? 'день — «Светлая» тема' : 'ночь — «Тёмная» тема'}. С ${DAY_FROM}:00 до ${NIGHT_FROM}:00 светлая, остальное время тёмная.`
    : mode ? '' : 'Выбрана тема — она работает всегда, день и ночь её не переключают.';
  // цвет полосы статуса телефона — под фон темы
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#171412');
  const dn = $('#dayNightBtn');
  dn.textContent = dark ? '☀️' : '🌙';
  dn.title = dark ? 'Включить дневной режим' : 'Включить ночной режим';
}
function setTheme(t) { S.theme = t; save(); applyTheme(); }
document.querySelectorAll('.theme-opt').forEach((b) => b.onclick = () => setTheme(b.dataset.theme));
document.querySelectorAll('#modePick button').forEach((b) => b.onclick = () =>
  setTheme({ day: 'paper', night: 'dark', auto: 'auto' }[b.dataset.mode]));
// Быстрый переключатель в верхней панели: день ↔ ночь вручную
$('#dayNightBtn').onclick = () => setTheme(DARK_THEMES.includes(effectiveTheme()) ? 'paper' : 'dark');

function renderAll() {
  applyTheme();
  $('#nameInput').value = S.name;
  $('#quote').textContent = QUOTES[new Date().getDate() % QUOTES.length];
  renderTasks(); renderProjects(); renderNotes(); renderHabits(); renderFinance(); renderShow(); renderCalendar();
  renderLinks(); renderOverview(); renderBell(); loadWeather(); renderCloud();
  loadMail(); renderExchanges(); loadExchanges(); loadFl(); loadRates();
  if (API()) {
    API().gmail_status().then(renderGmailState);
  } else { renderGmailState({}); }
}

// Запуск: в приложении ждём, пока Python подключится, в браузере стартуем сразу.
function waitForApp() {
  return new Promise((resolve) => {
    if (window.pywebview?.api) return resolve();
    window.addEventListener('pywebviewready', () => { $('#bootWait')?.remove(); resolve(); }, { once: true });
    const inApp = !!window.chrome?.webview;
    // В обычном браузере — короткий запасной таймер, данные из localStorage.
    if (!inApp) { setTimeout(resolve, 1500); return; }
    // В приложении НИКОГДА не стартуем без файла данных: иначе показался бы пустой профиль
    // («Гость»), будто всё пропало. Ждём, при задержке сами перезагружаем страницу.
    const box = Object.assign(document.createElement('div'), { id: 'bootWait' });
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'
      + 'background:#0f1117;color:#e8e6e3;font:16px system-ui;text-align:center;padding:24px';
    box.innerHTML = '<div>Загружаю ваши данные…</div>';
    document.body.appendChild(box);
    const tries = +(sessionStorage.getItem('bootTries') || 0);
    setTimeout(() => {
      if (window.pywebview?.api) return;
      if (tries < 2) { sessionStorage.setItem('bootTries', tries + 1); location.reload(); return; }
      box.innerHTML = `<div><p>Программа не смогла подключиться к файлу с данными.</p>
        <p><b>Ваши данные целы</b> — закройте программу и откройте её снова.</p>
        <button id="bootRetry">Попробовать ещё раз</button></div>`;
      $('#bootRetry').onclick = () => { sessionStorage.removeItem('bootTries'); location.reload(); };
    }, 12000);
  });
}
// Если мост всё же появился после запасного таймера — перезагрузить с настоящими данными
window.addEventListener('pywebviewready', () => { if (S._fromLocal) location.reload(); });
(async () => {
  await waitForApp();
  sessionStorage.removeItem('bootTries');
  await load();
  renderAll();
  // экран показываем, когда он уже заполнен (на телефоне до этого виден только фон темы)
  document.documentElement.classList.remove('booting');
  document.documentElement.style.background = '';
  $('#syncBtn').onclick = () => { go('settings'); $('#cloudCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  checkSync();
  syncPull(); // правки с телефона, сделанные, пока программа была закрыта
  setInterval(syncPull, 60_000);
  window.addEventListener('focus', syncPull);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPull(); });
  // Первый запуск: спросим имя
  if (!S.name) go('settings');
  maybeOfferRestore(); // новая установка — предложить данные из Google
  setInterval(() => { renderOverview(); renderBell(); if (S.theme === 'auto') applyTheme(); }, 60_000);
  setInterval(loadMail, 5 * 60_000); // почта — раз в 5 минут
  setInterval(() => { loadExchanges(true); loadFl(); }, 10 * 60_000); // биржи — раз в 10 минут
  setInterval(loadRates, 3 * 3600_000); // курс ЦБ — раз в 3 часа
  remSync().then(checkReminders);
  setInterval(checkReminders, 30_000); // напоминания
  document.addEventListener('visibilitychange', () => { if (!document.hidden) remSync().then(checkReminders); });
})();
