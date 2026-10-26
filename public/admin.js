const TOKEN_KEY = 'voda-admin-token';
const ZONE_TIME = new Intl.DateTimeFormat('sr-Latn', { timeZone: 'Europe/Sarajevo', dateStyle: 'short', timeStyle: 'short' });

const message = document.getElementById('message');
const summary = document.getElementById('summary');
const table = document.getElementById('table');
const top = document.getElementById('top');
const tokenInput = document.getElementById('token');

function el(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function card(label, value, className) {
  const box = el('div', '', 'card');
  box.append(el('span', label, 'muted'), el('strong', value, className));
  return box;
}

function minutesAgo(epochMs) {
  const minutes = Math.round((Date.now() - epochMs) / 60000);
  return minutes < 90 ? `prije ${minutes} min` : `prije ${Math.round(minutes / 60)} h`;
}

function render(stats) {
  const cron = stats.lastCron;
  const problem = stats.sourceProblem?.kind;
  const week = stats.days.slice(0, 7);
  const sum = key => week.reduce((total, day) => total + day[key], 0);
  summary.replaceChildren(
    card('Pretplatnika', String(stats.subscribers)),
    card('Zadnji cron', cron ? minutesAgo(cron.at) : 'nikad', cron && Date.now() - cron.at > 20 * 60000 ? 'bad' : 'ok'),
    card('Izvor (vikis.info)', problem ? `problem: ${problem}` : 'u redu', problem ? 'bad' : 'ok'),
    card('Prekida u planu', cron ? String(cron.closures) : '–'),
    card('Pushova 7 dana: poslato', String(sum('pushOk'))),
    card('Pushova 7 dana: neuspjelo', String(sum('pushFailed')), sum('pushFailed') > 0 ? 'bad' : ''),
    card('Uklonjeno (odjavljeni uređaji)', String(sum('pushGone'))),
    card('Otvaranja u Instagram/FB pregledniku (7 dana)', String(sum('inApp'))),
  );
  const head = ['Dan', 'Posjetioci', 'Otvaranja', 'Sa ekrana', 'ЋИР', 'LAT', 'EN', 'Push ok', 'Push greška'];
  const rows = stats.days.map(day => [day.day, day.visitors, day.opens, day.appOpens, day.sr, day.srLatn, day.en, day.pushOk, day.pushFailed]);
  const grid = document.createElement('table');
  const thead = document.createElement('tr');
  head.forEach(label => thead.append(el('th', label)));
  grid.append(thead);
  rows.forEach(values => {
    const tr = document.createElement('tr');
    values.forEach(value => tr.append(el('td', String(value))));
    grid.append(tr);
  });
  table.replaceChildren(grid);
  const sourceList = document.getElementById('sources');
  sourceList.replaceChildren(...(stats.sources ?? []).map(item => el('li', `${item.source} – ${item.visits}`)));
  top.replaceChildren(...stats.topWatches.map(item => el('li', `${item.watch} – ${item.subscribers}`)));
}

async function load(token) {
  message.textContent = 'Učitavam…';
  const response = await fetch('/api/stats', { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    message.textContent = response.status === 401 ? 'Pogrešan ključ.' : 'Greška na serveru.';
    return false;
  }
  render(await response.json());
  message.textContent = `Osvježeno ${ZONE_TIME.format(new Date())}`;
  return true;
}

document.getElementById('login').addEventListener('submit', async event => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (token && (await load(token))) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* the key is simply asked for again */ }
    tokenInput.value = '';
  }
});

try {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) load(saved);
} catch { /* no saved key */ }

document.getElementById('test-mail').addEventListener('click', async () => {
  const result = document.getElementById('test-result');
  let token = tokenInput.value.trim();
  try { token ||= sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { /* no saved key */ }
  if (!token) {
    result.textContent = 'Prvo upiši ključ i pritisni Prikaži.';
    return;
  }
  result.textContent = 'Šaljem…';
  const response = await fetch('/api/test-alert', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  result.textContent = response.ok ? 'Probni mejl je poslat. Provjeri inbox (i spam).' : `Nije poslato: ${body.detail ?? body.error ?? response.status}`;
});
