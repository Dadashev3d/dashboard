/* Мобильная версия «Мой дашборд».
   Заменяет Python-часть настольной программы (window.pywebview.api) на работу прямо в браузере телефона:
   данные — в памяти телефона (localStorage) + копия в Google Диске (та же, что у компьютера),
   почта и биржи — через Gmail API. Вход Google — по кнопке, без паролей в программе. */
(() => {
  const CFG = window.MOBILE_CONFIG || {};
  const KEY = 'dashboard.v1';
  const TOK = 'mobile.token';
  const AUTH_ERR = 'mobile.authErr';  // почему Google не продлил вход сам: {e, at}
  const authErr = () => { try { return JSON.parse(localStorage.getItem(AUTH_ERR)); } catch { return null; } };
  // Вход — только почта-адрес и скрытая папка на Диске (обычный доступ, без предупреждений Google).
  // Чтение Gmail — отдельно, по кнопке «Подключить почту» (у Google это «особый» доступ).
  const BASE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.appdata'];
  const MAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  const MAIL_ON = 'mobile.mail';
  const mailWanted = () => localStorage.getItem(MAIL_ON) === '1';
  const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const NAME = 'mydashboard-backup.json';
  const redirectUri = () => CFG.redirectUri || (location.origin + location.pathname);

  // ---------- Вход Google (токен на 1 час; продлевается сам при следующем открытии) ----------
  // Ответ Google приходит в адресе страницы после «#»: забираем токен и чистим адрес.
  (function takeTokenFromUrl() {
    if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return;
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('access_token')) {
      localStorage.setItem(TOK, JSON.stringify({
        t: p.get('access_token'), exp: Date.now() + (+p.get('expires_in') || 3600) * 1000 - 60000,
        scope: p.get('scope') || '', ever: true,
      }));
      localStorage.removeItem(AUTH_ERR);
    } else if (p.get('error')) {
      localStorage.setItem(AUTH_ERR, JSON.stringify({ e: p.get('error'), at: Date.now() }));
      // тихое продление не удалось (нужно подтвердить вход) — покажем кнопку «Войти»
      const old = tok(); if (old) { old.exp = 0; localStorage.setItem(TOK, JSON.stringify(old)); }
    }
    history.replaceState(null, '', location.pathname + location.search);
  })();
  function tok() { try { return JSON.parse(localStorage.getItem(TOK)); } catch { return null; } }
  const tokenValid = () => { const t = tok(); return !!(t && t.t && t.exp > Date.now()); };
  const everConnected = () => !!tok()?.ever;
  // Вход был, но истёк и сам не продлился — нужно нажать «Войти снова»
  const needLogin = () => !tokenValid() && everConnected();
  function signIn(silent = false) {
    if (!CFG.clientId) { alert('В мобильной версии не указан ключ Google (config.js).'); return; }
    // Тихое продление просит ровно то, что человек уже разрешил: если попросить что-то новое,
    // Google откажет без окна входа и почта перестанет обновляться.
    const granted = silent ? (tok()?.scope || '').trim() : '';
    const q = new URLSearchParams({
      client_id: CFG.clientId, redirect_uri: redirectUri(), response_type: 'token',
      scope: granted || [...BASE_SCOPES, ...(mailWanted() ? [MAIL_SCOPE] : [])].join(' '), include_granted_scopes: 'true',
    });
    // Если в телефоне несколько аккаунтов Google, без подсказки Google не знает, какой взять, и не продлевает вход сам
    const hint = localStorage.getItem('mobile.email');
    if (hint) q.set('login_hint', hint);
    if (silent) q.set('prompt', 'none');
    sessionStorage.setItem('mobile.silentTry', String(Date.now()));
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
  }
  // Токен скоро истечёт (или истёк), а вход уже был — тихо продлить (страница на миг перезагрузится).
  // Не чаще раза в 2 минуты; если Google отказал — снова пробуем через 20 минут, а не никогда.
  function renewIfNeeded(aheadMs = 0) {
    const t = tok();
    if (!everConnected() || !CFG.clientId || (t && t.t && t.exp - Date.now() > aheadMs)) return false;
    const last = +sessionStorage.getItem('mobile.silentTry') || 0, err = authErr();
    if (Date.now() - last < 120000 || (err && Date.now() - err.at < 20 * 60000)) return false;
    if (pending()) localStorage.setItem(KEY + '.unsent', '1');
    signIn(true);
    return true;
  }
  async function gfetch(url, opts = {}) {
    if (!tokenValid()) throw Object.assign(new Error('Нужно войти в Google'), { auth: true });
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + tok().t } });
    if (r.status === 401) { const t = tok(); if (t) { t.exp = 0; localStorage.setItem(TOK, JSON.stringify(t)); } throw Object.assign(new Error('Вход Google истёк'), { auth: true }); }
    return r;
  }
  // Запрос к Gmail: ошибку Google (нет доступа, выключен API) показываем словами, а не «0 писем»
  async function gjson(url) {
    const r = await gfetch(url);
    if (r.ok) return r.json();
    let msg = ''; try { msg = (await r.json()).error?.message || ''; } catch {}
    if (r.status === 403 && /scope|insufficient|permission/i.test(msg)) throw Object.assign(new Error('Google не дал доступ к почте'), { scope: true });
    throw new Error(/has not been used|disabled/i.test(msg) ? 'В проекте Google не включён Gmail API' : 'Gmail: ' + (msg || 'ошибка ' + r.status));
  }
  const hasScope = (s) => (tok()?.scope || '').includes(s);
  // Почта работает, если человек сам её подключил и Google выдал доступ
  const mailOn = () => mailWanted() && hasScope('gmail.readonly');
  // Кто подключался раньше (тогда почта входила во вход) — почта остаётся включённой
  if (localStorage.getItem(MAIL_ON) === null && hasScope('gmail.readonly')) localStorage.setItem(MAIL_ON, '1');

  // ---------- Почта ----------
  function parseFrom(v = '') {
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
    return m ? { name: m[1].trim(), addr: m[2].trim() } : { name: '', addr: v.trim() };
  }
  async function fetchMsgs(query, limit) {
    const ids = await gjson(`${GMAIL}/messages?` + new URLSearchParams({ q: query, maxResults: limit }));
    const list = ids.messages || [];
    return Promise.all(list.map(async (m) => {
      const msg = await gjson(`${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
      const h = {}; (msg.payload?.headers || []).forEach((x) => h[x.name.toLowerCase()] = x.value);
      const f = parseFrom(h.from);
      return {
        id: m.id, from: f.name || f.addr, email: f.addr, subject: h.subject || '(без темы)',
        snippet: (msg.snippet || '').replace(/\s+/g, ' ').slice(0, 300), ts: +msg.internalDate || 0,
        link: `https://mail.google.com/mail/u/0/#all/${m.id}`, unread: (msg.labelIds || []).includes('UNREAD'),
      };
    }));
  }
  let email = localStorage.getItem('mobile.email') || '';
  async function loadEmail() {
    if (email || !tokenValid()) return;
    try {
      email = hasScope('email') || hasScope('openid')
        ? (await (await gfetch('https://openidconnect.googleapis.com/v1/userinfo')).json()).email || ''
        : (await (await gfetch(`${GMAIL}/profile`)).json()).emailAddress || '';
      if (email) localStorage.setItem('mobile.email', email);
    } catch {}
  }

  // ---------- Биржи (то же, что exchanges.py на компьютере) ----------
  const EXCHANGES = [
    { key: 'kwork', domains: ['kwork.ru', 'kwork.com'] }, { key: 'fl', domains: ['fl.ru'] },
    { key: 'freelance', domains: ['freelance.ru', 'free-lance.ru'] }, { key: 'freelancer', domains: ['freelancer.com'] },
    { key: 'upwork', domains: ['upwork.com'] }, { key: 'fiverr', domains: ['fiverr.com'] },
  ];
  const KINDS = [
    ['payment', /оплат|выплат|зачислен|поступ|вывод|баланс|деньги|заработ|payment|paid|funds|earning|withdraw|payout|cleared/],
    ['message', /сообщени|написал|ответил|переписк|комментар|message|messaged|replied|chat/],
    ['order', /заказ|проект|задани|предложени|приглаш|отклик|выбрали|исполнител|кворк|order|job|offer|invit|proposal|contract|hired|gig/],
  ];
  const AMOUNTS = [
    [/(\d[\d\s ]*(?:[.,]\d{1,2})?)\s?(?:₽|руб\.?|р\.)/i, 'RUB'], [/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/, 'USD'],
    [/(\d[\d,]*(?:\.\d{1,2})?)\s?(?:USD|долл)/i, 'USD'], [/€\s?(\d[\d,]*(?:\.\d{1,2})?)/, 'EUR'],
    [/(\d[\d\s ]*(?:[.,]\d{1,2})?)\s?(?:€|EUR|евро)/i, 'EUR'],
  ];
  const exFor = (addr) => { addr = (addr || '').toLowerCase(); return EXCHANGES.find((e) => e.domains.some((d) => addr.endsWith('@' + d) || addr.endsWith('.' + d))); };
  const kindOf = (t) => { t = t.toLowerCase(); const k = KINDS.find(([, rx]) => rx.test(t)); return k ? k[0] : 'other'; };
  function amountOf(text) {
    for (const [rx, cur] of AMOUNTS) {
      const m = text.match(rx); if (!m) continue;
      let raw = m[1].replace(/[\s ]/g, '');
      raw = cur === 'USD' || (raw.includes('.') && raw.includes(',')) ? raw.replace(/,/g, '') : raw.replace(',', '.');
      const n = parseFloat(raw); if (!isNaN(n)) return [n, cur];
    }
    return [null, null];
  }
  let exCache = { t: 0, data: null };

  // ---------- Копия в Google Диске (общая с компьютером) ----------
  async function findFile() {
    const r = await gfetch(`${FILES}?` + new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${NAME}'`, fields: 'files(id, modifiedTime, size)' }));
    if (!r.ok) throw new Error(await explain(r));
    return (await r.json()).files?.[0] || null;
  }
  async function explain(r) {
    try { const e = (await r.json()).error || {}; return /has not been used|disabled/i.test(e.message || '') ? 'В проекте Google не включён Google Drive API' : 'Google Диск: ' + (e.message || r.status); }
    catch { return 'Google Диск: ошибка ' + r.status; }
  }
  const meaningful = (d) => { try { const o = JSON.parse(d); return !!(o.name || ['tasks', 'projects', 'notes', 'habits', 'tx', 'events'].some((k) => o[k]?.length) || o.show?.items?.length); } catch { return false; } };
  async function upload(data, auto) {
    const f = await findFile();
    if (auto && f && (!meaningful(data) || (+f.size > 4000 && new Blob([data]).size < +f.size * 0.4)))
      return { ok: false, skipped: true, error: 'автокопия пропущена: на телефоне намного меньше данных, чем в копии Google' };
    let r;
    if (f) {
      r = await gfetch(`${UPLOAD}/${f.id}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: data });
    } else {
      const b = 'mydashboard-boundary';
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NAME, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${b}--`;
      r = await gfetch(`${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
    }
    if (!r.ok) return { ok: false, error: await explain(r) };
    return { ok: true, last: (await r.json()).modifiedTime };
  }
  // Автокопия: через 3 с после правки, не дольше 15 с при непрерывных правках
  let pendingData = null, firstAt = 0, timer = null, busy = false, last = null;
  const pending = () => pendingData !== null || localStorage.getItem(KEY + '.unsent') === '1';
  function schedule(data) {
    pendingData = data; localStorage.setItem(KEY + '.unsent', '1');
    firstAt = firstAt || Date.now();
    clearTimeout(timer);
    timer = setTimeout(push, Math.max(0, Math.min(3000, firstAt + 15000 - Date.now())));
  }
  async function push() {
    if (busy) { timer = setTimeout(push, 1500); return; }
    const data = pendingData ?? localStorage.getItem(KEY);
    pendingData = null; firstAt = 0;
    if (!data || !tokenValid() || !hasScope('drive.appdata')) return; // отправим после входа (флаг unsent остаётся)
    busy = true;
    try {
      last = { ...(await upload(data, true)), at: Date.now() / 1000 };
      if (last.ok && pendingData === null) localStorage.removeItem(KEY + '.unsent');
    } catch (e) { last = { ok: false, error: e.message, at: Date.now() / 1000 }; } finally { busy = false; }
  }

  // ---------- Файлы ----------
  function pickFile() {
    return new Promise((res) => {
      const i = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
      i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsText(f); };
      i.click();
    });
  }

  // ---------- API — те же функции, что у настольной программы ----------
  const api = {
    load: async () => localStorage.getItem(KEY),
    save: async (data, backup = true) => { localStorage.setItem(KEY, data); if (backup) schedule(data); return true; },
    open_url: async (u) => { if (/^https?:\/\//.test(u)) window.open(u, '_blank', 'noopener'); return true; },
    launch_chrome: async () => { window.open('https://www.google.com', '_blank', 'noopener'); return true; },
    open_data_folder: async () => true,
    export_backup: async (text, name) => {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
      document.body.appendChild(a); a.click(); a.remove(); return true;
    },
    import_backup: pickFile,

    // connected — вход в Google выполнен; mail — почта подключена (отдельной кнопкой)
    gmail_status: async () => {
      await loadEmail();
      return { hasClient: !!CFG.clientId, connected: tokenValid() || everConnected(), needLogin: needLogin(), authErr: needLogin() ? authErr()?.e || '' : '', email, drive: hasScope('drive.appdata'),
               mail: mailWanted() && (hasScope('gmail.readonly') || !tokenValid()) };
    },
    gmail_choose_client_file: async () => api.gmail_status(),
    gmail_connect: async () => { localStorage.removeItem(AUTH_ERR); signIn(false); return new Promise(() => {}); },
    gmail_disconnect: async () => { localStorage.removeItem(TOK); localStorage.removeItem('mobile.email'); localStorage.removeItem(MAIL_ON); email = ''; exCache = { t: 0, data: null }; return api.gmail_status(); },
    mail_connect: async () => { localStorage.setItem(MAIL_ON, '1'); localStorage.removeItem(AUTH_ERR); signIn(false); return new Promise(() => {}); },
    mail_disconnect: async () => { localStorage.setItem(MAIL_ON, '0'); exCache = { t: 0, data: null }; return api.gmail_status(); },
    gmail_unread: async () => {
      if (!mailWanted()) return { connected: false, signedIn: tokenValid() || everConnected() };
      if (!tokenValid()) return everConnected() ? { connected: true, needLogin: true, messages: [], error: 'Вход Google истёк' } : { connected: false };
      if (!hasScope('gmail.readonly')) return { connected: false, signedIn: true };
      try {
        const total = (await gjson(`${GMAIL}/labels/INBOX`)).messagesUnread || 0;
        return { connected: true, total, messages: await fetchMsgs('is:unread in:inbox', 5) };
      } catch (e) {
        // Google забрал доступ к почте — показать «Подключить почту»
        if (e.scope) { const t = tok(); if (t) { t.scope = t.scope.replace(MAIL_SCOPE, ''); localStorage.setItem(TOK, JSON.stringify(t)); } return { connected: false, signedIn: true }; }
        return { connected: true, needLogin: needLogin(), error: e.message, messages: [] };
      }
    },

    exchanges_mail: async (force = false) => {
      if (!force && exCache.data && Date.now() - exCache.t < 120000) return exCache.data;
      if (!mailWanted()) return { gmail: false, items: [] };
      if (!tokenValid()) return { gmail: everConnected(), needLogin: needLogin(), items: [] };
      if (!mailOn()) return { gmail: false, items: [] };
      const domains = EXCHANGES.flatMap((e) => e.domains);
      let msgs = [];
      try { msgs = await fetchMsgs(`from:(${domains.join(' OR ')}) newer_than:30d`, 40); }
      catch (e) { return { gmail: true, needLogin: needLogin(), error: e.message, items: [] }; }
      const items = msgs.map((m) => {
        const ex = exFor(m.email); if (!ex) return null;
        const text = `${m.subject} ${m.snippet}`;
        const kind = kindOf(m.subject) !== 'other' ? kindOf(m.subject) : kindOf(text);
        const [amount, currency] = kind === 'payment' ? amountOf(text) : [null, null];
        return { ...m, source: 'gmail', exchange: ex.key, kind, amount, currency };
      }).filter(Boolean).sort((a, b) => b.ts - a.ts);
      exCache = { t: Date.now(), data: { gmail: true, items } };
      return exCache.data;
    },
    // Лента FL.ru: её раз в 30 минут собирает робот GitHub (файл fl.json рядом с приложением)
    fl_projects: async (keywords = '') => {
      try {
        const r = await fetch('fl.json?t=' + Math.floor(Date.now() / 300000));
        if (!r.ok) throw 0;
        let items = (await r.json()).items || [];
        const words = keywords.split(/[,;\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
        if (words.length) items = items.filter((i) => words.some((w) => `${i.title} ${i.category} ${i.desc}`.toLowerCase().includes(w)));
        return { ok: true, items: items.slice(0, 30) };
      } catch { return { ok: false, items: [] }; }
    },

    cloud_status: async () => {
      if (!tokenValid()) return { ready: false, connected: everConnected() };
      if (!hasScope('drive.appdata')) return { ready: false, connected: true, needScope: true };
      try { const f = await findFile(); return { ready: true, last: f?.modifiedTime, size: f ? +f.size : 0 }; }
      catch (e) { return { ready: false, error: e.message }; }
    },
    cloud_backup: async () => { try { return await upload(localStorage.getItem(KEY) || '{}', false); } catch (e) { return { ok: false, error: e.message }; } },
    cloud_restore: async () => {
      try {
        const f = await findFile(); if (!f) return { ok: false, error: 'На Google Диске ещё нет резервной копии' };
        const r = await gfetch(`${FILES}/${f.id}?alt=media`); if (!r.ok) return { ok: false, error: await explain(r) };
        const data = await r.text(); JSON.parse(data);
        localStorage.setItem(KEY + '.before-restore', localStorage.getItem(KEY) || '');
        return { ok: true, data, last: f.modifiedTime };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    cloud_peek: async (since = '') => {
      if (pending() || busy || !tokenValid() || !hasScope('drive.appdata')) return { ok: true, same: true, busy: true };
      try {
        const f = await findFile(); if (!f) return { ok: true, none: true };
        if (since && f.modifiedTime === since) return { ok: true, same: true, last: since };
        const r = await gfetch(`${FILES}/${f.id}?alt=media`); if (!r.ok) return { ok: false };
        return { ok: true, data: await r.text(), last: f.modifiedTime };
      } catch { return { ok: false }; }
    },
    cloud_sync_state: async () => ({
      pending: pendingData !== null || (pending() && tokenValid()), busy, drive: everConnected() && (hasScope('drive.appdata') || !tokenValid()),
      ok: last?.ok, skipped: last?.skipped, error: last?.error || (!tokenValid() && pending() ? 'ждёт входа в Google' : null), at: last?.at,
    }),
    exchanges_list: async () => EXCHANGES,
    // Уведомление Android (таймер фокуса). opts: tag, silent, sound, ask (спросить разрешение), clear (убрать)
    notify: async (title, body, opts = {}) => {
      try {
        if (!('Notification' in window) || !navigator.serviceWorker) return { ok: false };
        const reg = await navigator.serviceWorker.ready;
        if (opts.clear) { (await reg.getNotifications({ tag: opts.tag })).forEach((n) => n.close()); return { ok: true }; }
        if (Notification.permission === 'default' && opts.ask) await Notification.requestPermission();
        if (opts.sound && navigator.vibrate) navigator.vibrate([300, 150, 300]);
        if (Notification.permission !== 'granted') return { ok: false };
        if (opts.reminder) try {
          const c = await caches.open('mydashboard-rem'), r = await c.match('rem-done.json');
          const done = new Set(r ? await r.json() : []); done.add(String(opts.tag).replace(/^rem-/, ''));
          await c.put('rem-done.json', new Response(JSON.stringify([...done].slice(-500))));
        } catch { /* не страшно */ }
        await reg.showNotification(title, {
          body, tag: opts.tag, renotify: !opts.silent, silent: !!opts.silent,
          icon: 'icon-192.png', badge: 'icon-192.png', vibrate: opts.sound ? [300, 150, 300] : undefined,
        });
        return { ok: true };
      } catch { return { ok: false }; }
    },
  };

  window.pywebview = { api, mobile: true };
  document.documentElement.classList.add('is-mobile-app');

  // Открыли приложение после перерыва: продлить вход и отправить то, что не успело уйти
  // Продлеваем заранее — за 10 минут до конца часа, чтобы вход не истекал посреди работы
  if (!renewIfNeeded(10 * 60000) && tokenValid() && localStorage.getItem(KEY + '.unsent') === '1') setTimeout(push, 1500);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pendingData !== null) push(); return; }
    renewIfNeeded(10 * 60000);
  });
  // Приложение долго открыто: когда час прошёл — продлить, но не пока человек что-то вписывает
  setInterval(() => {
    if (document.hidden || tokenValid()) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (document.querySelector('.modal:not([hidden]), .rep-modal:not([hidden])')) return;
    renewIfNeeded();
  }, 60000);

  // Работа без интернета и установка на экран телефона
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});

  // Версия внизу «Настроек» — чтобы было видно, что приложение обновилось
  const showVersion = () => {
    const box = document.getElementById('view-settings');
    if (!box || !window.APP_BUILD || document.getElementById('appVersion')) return;
    const p = document.createElement('p');
    p.id = 'appVersion';
    p.className = 'muted small';
    p.style.cssText = 'text-align:center;margin:18px 0 6px';
    p.textContent = 'Версия приложения от ' + window.APP_BUILD + ' · ';
    const a = Object.assign(document.createElement('a'), { href: 'privacy.html', textContent: 'Политика конфиденциальности', className: 'link' });
    p.appendChild(a);
    box.appendChild(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showVersion);
  else showVersion();
})();
