const APP = Object.freeze({
  TZ: 'America/Chicago',
  SHEETS: {
    WISHLIST: '19yizVWGTcdQqMJ6lYlZxvSSKAxOdD3nbukzd2OlfRaQ',
    SOCCER: '1-2l_FPSFpCYDHae2yOTkUIeXljKytsJasa1Ucum1K_w',
    POKEMON: '124BX4CxKL3V-YyxdWQkclvXOTH3mC47udDvy2AifRlE',
    ONE_PIECE: '1zyFonUdg2Mz0wS6t-y2tDD6EfAS8YZCPfxil1MexSDI'
  }
});

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('EMBED_KEY');
  const supplied = e && e.parameter ? e.parameter.key : '';

  if (!expected || supplied !== expected) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><body style="background:#0b0d0f;color:#e5e2dc;font:14px system-ui;padding:28px">' +
      '<b>Dashboard locked.</b><br><span style="color:#747a80">Missing or invalid embed key.</span></body></html>'
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  let html;
  try {
    html = getFrontendHtml_();
  } catch (err) {
    html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  }

  const requestedView = e && e.parameter ? String(e.parameter.view || '').toLowerCase() : '';
  const initialView = ['home', 'tasks', 'habits', 'health', 'school', 'projects', 'collections'].indexOf(requestedView) >= 0 ? requestedView : 'home';
  html = html.replace('__INITIAL_VIEW__', initialView);

  return HtmlService.createHtmlOutput(html)
    .setTitle('Home')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getFrontendHtml_() {
  const props = PropertiesService.getScriptProperties();
  const repo = props.getProperty('GITHUB_REPO');
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';
  const token = props.getProperty('GITHUB_TOKEN');
  const useGithub = String(props.getProperty('USE_GITHUB_FRONTEND')).toLowerCase() === 'true';

  if (!useGithub || !repo) {
    return HtmlService.createHtmlOutputFromFile('Index').getContent();
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'frontend:' + repo + ':' + branch;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let html = '';
  if (token) {
    const url = 'https://api.github.com/repos/' + repo + '/contents/Index.html?ref=' + encodeURIComponent(branch);
    const resp = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 300) throw new Error('GitHub frontend fetch failed: ' + resp.getContentText());
    const body = JSON.parse(resp.getContentText());
    html = Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, ''))).getDataAsString();
  } else {
    const raw = 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/Index.html';
    const resp = UrlFetchApp.fetch(raw, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 300) throw new Error('GitHub raw frontend fetch failed');
    html = resp.getContentText();
  }

  cache.put(cacheKey, html, 300);
  return html;
}

function clearFrontendCache() {
  const props = PropertiesService.getScriptProperties();
  const repo = props.getProperty('GITHUB_REPO');
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';
  if (repo) CacheService.getScriptCache().remove('frontend:' + repo + ':' + branch);
  return true;
}

function getBootstrapData() {
  const out = {
    now: new Date().toISOString(),
    timezone: APP.TZ,
    setup: {
      backend: 'sheets',
      dataReady: true,
      dataStoreUrl: dashboardSpreadsheet_().getUrl()
    },
    settings: [],
    calendar: null,
    focus: [],
    habits: [],
    health: null,
    school: [],
    projects: [],
    projectTasks: []
  };

  const errors = [];
  try { rollRecurringTasks_(); } catch (e) { errors.push('recurring tasks: ' + e.message); }
  try { out.settings = getDashboardSettings_(); } catch (e) { errors.push('settings: ' + e.message); }
  try { out.calendar = getCalendarWeek(0); } catch (e) { errors.push('calendar: ' + e.message); }
  try { out.focus = getFocusTasks_(); } catch (e) { errors.push('focus: ' + e.message); }
  try { out.habits = getHabits_(); } catch (e) { errors.push('habits: ' + e.message); }
  try { out.health = getHealthSummary_(); } catch (e) { errors.push('health: ' + e.message); }
  try { out.school = getSchoolSummary_(); } catch (e) { errors.push('school: ' + e.message); }
  try { out.projects = getProjectsSummary_(); } catch (e) { errors.push('projects: ' + e.message); }
  try { out.projectTasks = getProjectTasks_(); } catch (e) { errors.push('project tasks: ' + e.message); }

  out.errors = errors;
  return out;
}

function getDashboardSettings_() {
  return getDashboardSettingsSheet_();
}

function getCalendarWeek(weekOffset) {
  weekOffset = Number(weekOffset || 0);
  const now = new Date();
  const start = mondayStart_(now);
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const calendars = getSelectedCalendars_();
  const events = [];
  const seen = {};

  calendars.forEach(function(cal) {
    cal.getEvents(start, end).forEach(function(ev) {
      const key = ev.getId() + '|' + ev.getStartTime().getTime();
      if (seen[key]) return;
      seen[key] = true;
      events.push({
        id: ev.getId(),
        title: ev.getTitle() || '(untitled)',
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        allDay: ev.isAllDayEvent(),
        calendar: cal.getName(),
        color: safeEventColor_(ev, cal),
        location: ev.getLocation() || '',
        url: calendarEventUrl_(ev, cal)
      });
    });
  });

  events.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
  return {
    weekOffset: weekOffset,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    events: events
  };
}

function getSelectedCalendars_() {
  const props = PropertiesService.getScriptProperties();
  const ids = (props.getProperty('CALENDAR_IDS') || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  if (!ids.length) return [CalendarApp.getDefaultCalendar()];
  const out = [];
  ids.forEach(function(id) {
    try {
      const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
      if (cal) out.push(cal);
    } catch (e) {}
  });
  return out.length ? out : [CalendarApp.getDefaultCalendar()];
}

function safeCalendarColor_(cal) {
  try { return cal.getColor() || '#536979'; } catch (e) { return '#536979'; }
}

function safeEventColor_(ev, cal) {
  const colors = {
    '1': '#A4BDFC', '2': '#7AE7BF', '3': '#DBADFF', '4': '#FF887C',
    '5': '#FBD75B', '6': '#FFB878', '7': '#46D6DB', '8': '#E1E1E1',
    '9': '#5484ED', '10': '#51B749', '11': '#DC2127'
  };
  try {
    const eventColor = String(ev.getColor() || '');
    if (colors[eventColor]) return colors[eventColor];
  } catch (e) {}
  return safeCalendarColor_(cal);
}

function calendarEventUrl_(ev, cal) {
  try {
    const payload = String(ev.getId() || '') + ' ' + String(cal.getId() || '');
    const eid = Utilities.base64EncodeWebSafe(payload).replace(/=+$/g, '');
    return 'https://calendar.google.com/calendar/u/0/r/eventedit?eid=' + encodeURIComponent(eid);
  } catch (e) {
    return 'https://calendar.google.com/calendar/u/0/r';
  }
}

function mondayStart_(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return d;
}

function getFocusTasks_() {
  return getFocusTasksSheet_();
}

function getSchoolSummary_() {
  return getSchoolSummarySheet_();
}


function getProjectsSummary_() {
  return getProjectsSummarySheet_();
}

function getProjectTasks_() {
  return getProjectTasksSheet_();
}

function getHealthSummary_() {
  return getHealthSummarySheet_();
}

function getHabits_() {
  return getHabitsSheet_();
}


function getHabitDashboardData() {
  return getHabitDashboardDataSheet_();
}

function toggleHabit(payload) {
  return toggleHabitSheet_(payload);
}

function createQuickItem(type, payload) {
  if (String(type || '').toLowerCase() === 'wishlist') return appendWishlist_(payload || {});
  return createQuickItemSheet_(type, payload);
}

function appendWishlist_(payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Wishlist item name is required.');
  const ss = SpreadsheetApp.openById(APP.SHEETS.WISHLIST);
  const sh = ss.getSheetByName('Wishlist');
  sh.appendRow([
    payload.category || 'Other',
    payload.wantLevel || 'Interested',
    payload.rank || '',
    payload.image || '',
    title,
    payload.price || '',
    payload.store || '',
    payload.link || ''
  ]);
  return { ok: true };
}

function getCollectionData(kind, options) {
  kind = String(kind || '').toLowerCase();
  options = options || {};
  if (kind === 'wishlist') return getWishlist_();
  if (kind === 'soccer') return getSoccer_();
  if (kind === 'pokemon') return getPokemon_(options.generation || 'all');
  if (kind === 'onepiece') return getOnePiece_();
  throw new Error('Unknown collection.');
}

function getWishlist_() {
  const sh = SpreadsheetApp.openById(APP.SHEETS.WISHLIST).getSheetByName('Wishlist');
  const lastRow = sh.getLastRow();
  if (lastRow < 4) return { kind: 'wishlist', items: [], categories: [] };
  const range = sh.getRange(1, 1, lastRow, 8);
  const values = range.getDisplayValues();
  const formulas = range.getFormulas();
  const items = [];
  for (let r = 3; r < values.length; r++) {
    const row = values[r];
    if (!row[4]) continue;
    items.push({
      category: row[0] || 'Other',
      wantLevel: row[1] || '',
      rank: row[2] || '',
      image: extractImageUrl_(formulas[r][3]) || row[3] || '',
      name: row[4],
      price: row[5] || '',
      store: row[6] || '',
      link: row[7] || ''
    });
  }
  const categories = unique_(items.map(function(x) { return x.category; }));
  return { kind: 'wishlist', items: items, categories: categories };
}

function getSoccer_() {
  const sh = SpreadsheetApp.openById(APP.SHEETS.SOCCER).getSheetByName('Kits');
  const lastRow = sh.getLastRow();
  const range = sh.getRange(1, 1, Math.max(lastRow, 1), 4);
  const values = range.getDisplayValues();
  const formulas = range.getFormulas();
  const backgrounds = range.getBackgrounds();
  const fontColors = range.getFontColors();
  const items = [];

  for (let r = 1; r + 2 < values.length; r += 3) {
    for (let c = 0; c < 4; c++) {
      const name = values[r][c];
      if (!name) continue;
      items.push({
        name: name,
        price: values[r + 1] ? values[r + 1][c] : '',
        image: formulas[r + 2] ? extractImageUrl_(formulas[r + 2][c]) : '',
        accent: backgrounds[r][c] || '#292E35',
        textColor: fontColors[r][c] || '#E5E2DC'
      });
    }
  }
  return { kind: 'soccer', items: items };
}

function getPokemon_(generation) {
  const sh = SpreadsheetApp.openById(APP.SHEETS.POKEMON).getSheetByName('Binder List');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { kind: 'pokemon', items: [], generations: [] };
  const values = sh.getRange(1, 1, lastRow, 12).getDisplayValues();
  const raw = sh.getRange(1, 1, lastRow, 12).getValues();
  const items = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rawRow = raw[r];
    const entry = row[4];
    if (!entry) continue;
    const gen = row[6] || '';
    if (generation !== 'all' && String(gen) !== String(generation)) continue;
    items.push({
      owned: rawRow[1] === true || String(row[1]).toUpperCase() === 'TRUE',
      slot: Number(row[2]) || null,
      dex: row[3] || '',
      entry: entry,
      region: row[5] || '',
      generation: gen,
      ownedCard: row[7] || '',
      targetCard: row[8] || '',
      price: row[9] || '',
      collectr: row[10] || '',
      image: row[11] || ''
    });
  }
  items.sort(function(a, b) { return (a.slot || 99999) - (b.slot || 99999); });
  return { kind: 'pokemon', items: items, generations: ['1','2','3','4','5','6','7','8','9'] };
}

function getOnePiece_() {
  const ss = SpreadsheetApp.openById(APP.SHEETS.ONE_PIECE);
  const listSh = ss.getSheetByName('Card List');
  const listValues = listSh.getDataRange().getDisplayValues();
  const headers = listValues[0] || [];
  const idx = headerIndex_(headers);
  const cards = {};
  for (let r = 1; r < listValues.length; r++) {
    const row = listValues[r];
    const name = row[idx['Card']];
    if (!name) continue;
    cards[name] = {
      name: name,
      set: row[idx['Set / Number']] || '',
      affiliation: row[idx['Affiliation']] || '',
      tcg: row[idx['TCGplayer Link']] || '',
      cardrush: row[idx['CardRush Link']] || '',
      image: row[idx['Image URL']] || '',
      notes: row[idx['Notes']] || '',
      engPrice: row[idx['ENG Price (TCGplayer)']] || '',
      jpPriceJpy: row[idx['JP Price (JPY)']] || '',
      jpPriceUsd: row[idx['JP Price (USD)']] || ''
    };
  }

  const colSh = ss.getSheetByName('Collection');
  const values = colSh.getDataRange().getValues();
  const display = colSh.getDataRange().getDisplayValues();
  const pages = [];
  for (let r = 0; r + 2 < values.length; r += 4) {
    const heading = String(display[r] && display[r][0] || '').trim();
    if (!heading || heading.indexOf('PAGE ') !== 0) continue;
    const ownedRow = values[r + 1] || [];
    const namesRow = display[r + 2] || [];
    const pageItems = [];
    for (let c = 0; c < namesRow.length; c++) {
      const name = String(namesRow[c] || '').trim();
      if (!name) continue;
      const detail = cards[name] || { name: name, set: '', affiliation: '', tcg: '', cardrush: '', image: '', notes: '', engPrice: '', jpPriceJpy: '', jpPriceUsd: '' };
      pageItems.push(Object.assign({}, detail, {
        owned: ownedRow[c] === true || String(ownedRow[c]).toUpperCase() === 'TRUE',
        position: c + 1
      }));
    }
    const m = heading.match(/^PAGE\s+(\d+)/i);
    pages.push({
      page: m ? Number(m[1]) : pages.length + 1,
      title: heading,
      items: pageItems
    });
  }
  return { kind: 'onepiece', pages: pages };
}

function headerIndex_(headers) {
  const out = {};
  headers.forEach(function(h, i) { out[String(h)] = i; });
  return out;
}

function extractImageUrl_(formula) {
  if (!formula) return '';
  const m = String(formula).match(/IMAGE\(\s*"([^"]+)"/i);
  return m ? m[1] : '';
}

function unique_(arr) {
  const seen = {};
  return arr.filter(function(x) {
    if (!x || seen[x]) return false;
    seen[x] = true;
    return true;
  });
}


const DASHBOARD_TABLES = Object.freeze({
  Settings: ['Setting','Group','Value','Number','Enabled','Order','Accent','Japanese','Notes'],
  Tasks: ['ID','Task','Status','Priority','Area','Due','Done','Details','Course','Source URL','Repeat','Repeat Until','Completed At'],
  Projects: ['ID','Name','Status','Phase','Priority','Progress','Target Date','Summary','Area','Budget','Source URL'],
  Health: ['ID','Date','Type','Morning Weight (lb)','Sleep Hours','Sleep Score','HRV','Resting HR','Steps','Protein (g)','Body Battery','Energy','Stress','Soreness','Mood'],
  Habits: ['Card ID','Habit ID','Name','Color','Order','Active'],
  HabitHistory: ['ID','Date','Habit Card ID','Habit ID','Habit Name'],
  Notes: ['ID','Title','Area','Status','Type','Date','Body','Source URL']
});


function dashboardSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('DASHBOARD_DATA_SHEET_ID');
  if (!id) throw new Error('Dashboard data sheet has not been created yet.');
  return SpreadsheetApp.openById(id);
}

function createDashboardDataStore_() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('DASHBOARD_DATA_SHEET_ID');
  let ss = null;
  if (existing) {
    try { ss = SpreadsheetApp.openById(existing); } catch (e) {}
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Personal Dashboard Data');
    props.setProperty('DASHBOARD_DATA_SHEET_ID', ss.getId());
  }
  ensureDashboardSheets_(ss);
  return ss;
}

function ensureDashboardSheets_(ss) {
  const names = Object.keys(DASHBOARD_TABLES);
  const first = ss.getSheets()[0];
  if (first && names.indexOf(first.getName()) < 0 && first.getLastRow() === 0) first.setName(names[0]);

  names.forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = DASHBOARD_TABLES[name];
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      const current = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
      if (current.join('|') !== headers.join('|')) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#171B20').setFontColor('#E5E2DC');
  });
}

function sheetObjects_(name) {
  const sh = dashboardSpreadsheet_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(function(row) {
    return row.some(function(v) { return v !== '' && v !== null; });
  }).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    obj.__row = row;
    return obj;
  });
}

function writeTableObjects_(ss, name, objects) {
  ensureDashboardSheets_(ss);
  const sh = ss.getSheetByName(name);
  const headers = DASHBOARD_TABLES[name];
  sh.clearContents();
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#171B20').setFontColor('#E5E2DC');
  if (objects.length) {
    const rows = objects.map(function(obj) {
      return headers.map(function(h) {
        const v = obj[h];
        return v === undefined || v === null ? '' : v;
      });
    });
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, Math.min(headers.length, 12)); } catch (e) {}
}

function appendTableObject_(name, obj) {
  const ss = dashboardSpreadsheet_();
  const sh = ss.getSheetByName(name);
  const headers = DASHBOARD_TABLES[name];
  sh.appendRow(headers.map(function(h) {
    const v = obj[h];
    return v === undefined || v === null ? '' : v;
  }));
}

function truthySheet_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
}

function numOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function dateKeySheet_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v).slice(0,10);
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd');
}

function taskFromSheet_(r) {
  return {
    id: String(r['ID'] || ''),
    url: '',
    title: String(r['Task'] || ''),
    status: String(r['Status'] || ''),
    priority: String(r['Priority'] || ''),
    area: String(r['Area'] || ''),
    due: r['Due'] ? dateKeySheet_(r['Due']) : null,
    done: truthySheet_(r['Done']),
    details: String(r['Details'] || ''),
    course: String(r['Course'] || ''),
    repeat: String(r['Repeat'] || ''),
    repeatUntil: r['Repeat Until'] ? dateKeySheet_(r['Repeat Until']) : null,
    completedAt: r['Completed At'] ? new Date(r['Completed At']).toISOString() : null
  };
}

function getDashboardSettingsSheet_() {
  return sheetObjects_('Settings').map(function(r) {
    return {
      id: '',
      setting: String(r['Setting'] || ''),
      group: String(r['Group'] || ''),
      value: String(r['Value'] || ''),
      number: numOrNull_(r['Number']),
      enabled: truthySheet_(r['Enabled']),
      order: numOrNull_(r['Order']),
      accent: String(r['Accent'] || ''),
      japanese: String(r['Japanese'] || ''),
      notes: String(r['Notes'] || '')
    };
  }).sort(function(a,b){ return (a.order || 9999) - (b.order || 9999); });
}

function openTaskRowsSheet_() {
  return sheetObjects_('Tasks').map(taskFromSheet_).filter(function(t) {
    return t.title && !t.done && t.status !== 'Done' && t.status !== 'Archived';
  });
}

function getFocusTasksSheet_() {
  return openTaskRowsSheet_().filter(function(t) { return !!t.due; }).sort(function(a,b) {
    return String(a.due).localeCompare(String(b.due));
  }).slice(0,25);
}

function getSchoolSummarySheet_() {
  return openTaskRowsSheet_().filter(function(t) { return t.area === 'School'; }).sort(function(a,b) {
    return String(a.due || '9999').localeCompare(String(b.due || '9999'));
  }).slice(0,50);
}

function getProjectTasksSheet_() {
  return openTaskRowsSheet_().filter(function(t) { return t.area === 'Projects'; }).sort(function(a,b) {
    return String(a.due || '9999').localeCompare(String(b.due || '9999'));
  }).slice(0,50);
}

function advanceRepeatDate_(dateKey, repeat) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(function(x){ return !x; })) return '';
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  const kind = String(repeat || '').toLowerCase();
  if (kind === 'daily') d.setDate(d.getDate() + 1);
  else if (kind === 'weekly') d.setDate(d.getDate() + 7);
  else if (kind === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (kind === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else return '';
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd');
}

function rollRecurringTasks_() {
  const sh = dashboardSpreadsheet_().getSheetByName('Tasks');
  if (!sh || sh.getLastRow() < 2) return;
  const range = sh.getDataRange();
  const values = range.getValues();
  const headers = values[0].map(String);
  const idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });
  const today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  const updates = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const repeat = String(row[idx['Repeat']] || '');
    const due = row[idx['Due']] ? dateKeySheet_(row[idx['Due']]) : '';
    const done = truthySheet_(row[idx['Done']]);
    const completedDay = row[idx['Completed At']] ? dateKeySheet_(row[idx['Completed At']]) : '';
    if (!repeat || !due || !done || due >= today || (completedDay && completedDay >= today)) continue;

    let next = due;
    do {
      next = advanceRepeatDate_(next, repeat);
    } while (next && next < today);

    const until = row[idx['Repeat Until']] ? dateKeySheet_(row[idx['Repeat Until']]) : '';
    if (!next || (until && next > until)) {
      row[idx['Status']] = 'Archived';
      updates.push({ row: i + 1, status: 'Archived', due: due, done: true, completedAt: row[idx['Completed At']] || '' });
      continue;
    }

    row[idx['Status']] = 'To Do';
    row[idx['Due']] = next;
    row[idx['Done']] = false;
    row[idx['Completed At']] = '';
    updates.push({ row: i + 1, status: 'To Do', due: next, done: false, completedAt: '' });
  }

  updates.forEach(function(u) {
    sh.getRange(u.row, idx['Status'] + 1).setValue(u.status);
    sh.getRange(u.row, idx['Due'] + 1).setValue(u.due);
    sh.getRange(u.row, idx['Done'] + 1).setValue(u.done);
    sh.getRange(u.row, idx['Completed At'] + 1).setValue(u.completedAt);
  });
}

function getTaskDashboardData() {
  rollRecurringTasks_();
  const all = sheetObjects_('Tasks').map(taskFromSheet_).filter(function(t) {
    return t.title && t.status !== 'Archived';
  });
  const open = all.filter(function(t) { return !t.done && t.status !== 'Done'; }).sort(function(a, b) {
    const ad = a.due || '9999-12-31', bd = b.due || '9999-12-31';
    if (ad !== bd) return ad.localeCompare(bd);
    const rank = {High:0, Medium:1, Low:2};
    return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
  });
  const completed = all.filter(function(t) { return t.done || t.status === 'Done'; }).sort(function(a, b) {
    return String(b.completedAt || b.due || '').localeCompare(String(a.completedAt || a.due || ''));
  }).slice(0, 40);
  return {
    today: Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'),
    open: open,
    completed: completed
  };
}

function toggleTask(taskId) {
  taskId = String(taskId || '');
  if (!taskId) throw new Error('Task identity missing.');
  const sh = dashboardSpreadsheet_().getSheetByName('Tasks');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx['ID']] || '') !== taskId) continue;
    const wasDone = truthySheet_(values[i][idx['Done']]);
    const nowDone = !wasDone;
    sh.getRange(i + 1, idx['Done'] + 1).setValue(nowDone);
    sh.getRange(i + 1, idx['Status'] + 1).setValue(nowDone ? 'Done' : 'To Do');
    sh.getRange(i + 1, idx['Completed At'] + 1).setValue(nowDone ? new Date() : '');
    return { ok: true, id: taskId, done: nowDone };
  }
  throw new Error('Task not found.');
}

function projectFromSheet_(r) {
  return {
    id: String(r['ID'] || ''),
    url: '',
    name: String(r['Name'] || ''),
    status: String(r['Status'] || ''),
    phase: String(r['Phase'] || ''),
    priority: String(r['Priority'] || ''),
    progress: numOrNull_(r['Progress']),
    targetDate: r['Target Date'] ? dateKeySheet_(r['Target Date']) : null,
    summary: String(r['Summary'] || ''),
    area: String(r['Area'] || ''),
    budget: numOrNull_(r['Budget'])
  };
}

function getProjectsSummarySheet_() {
  return sheetObjects_('Projects').map(projectFromSheet_).filter(function(p) {
    return p.name && p.status === 'Active';
  });
}

function healthFromSheet_(r) {
  return {
    date: r['Date'] ? dateKeySheet_(r['Date']) : null,
    weight: numOrNull_(r['Morning Weight (lb)']),
    sleepHours: numOrNull_(r['Sleep Hours']),
    sleepScore: numOrNull_(r['Sleep Score']),
    hrv: numOrNull_(r['HRV']),
    restingHR: numOrNull_(r['Resting HR']),
    steps: numOrNull_(r['Steps']),
    protein: numOrNull_(r['Protein (g)']),
    bodyBattery: numOrNull_(r['Body Battery']),
    energy: numOrNull_(r['Energy']),
    stress: numOrNull_(r['Stress']),
    soreness: numOrNull_(r['Soreness']),
    mood: String(r['Mood'] || '')
  };
}

function getHealthSummarySheet_() {
  const data = sheetObjects_('Health').filter(function(r) {
    return !r['Type'] || String(r['Type']) === 'Daily Check-In';
  }).map(healthFromSheet_).filter(function(x) { return x.date; }).sort(function(a,b) {
    return String(b.date).localeCompare(String(a.date));
  });
  if (!data.length) return null;
  const latest = data[0];
  const oldestWeight = data.slice().reverse().find(function(x) { return x.weight !== null; });
  const latestWeight = data.find(function(x) { return x.weight !== null; });
  return {
    latest: latest,
    weightTrend30d: latestWeight && oldestWeight ? round1_(latestWeight.weight - oldestWeight.weight) : null,
    series: data.slice().reverse()
  };
}

function getHabitsSheet_() {
  const habits = sheetObjects_('Habits').filter(function(r) {
    return r['Name'] && (r['Active'] === '' || truthySheet_(r['Active']));
  }).sort(function(a,b){ return (Number(a['Order']) || 9999) - (Number(b['Order']) || 9999); });
  const today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  const logs = sheetObjects_('HabitHistory').filter(function(r) { return dateKeySheet_(r['Date']) === today; });
  const byCard = {};
  logs.forEach(function(r) { if (r['Habit Card ID']) byCard[String(r['Habit Card ID'])] = String(r['ID'] || ''); });
  return habits.map(function(r) {
    const cardId = String(r['Card ID'] || '');
    return {
      cardId: cardId,
      habitId: String(r['Habit ID'] || cardId),
      name: String(r['Name'] || ''),
      order: numOrNull_(r['Order']),
      color: String(r['Color'] || ''),
      done: !!byCard[cardId],
      logId: byCard[cardId] || null
    };
  });
}

function buildHabitDashboardFromSheet_() {
  const habitRows = sheetObjects_('Habits').filter(function(r) {
    return r['Name'] && (r['Active'] === '' || truthySheet_(r['Active']));
  }).sort(function(a,b){ return (Number(a['Order']) || 9999) - (Number(b['Order']) || 9999); });
  const habitCards = habitRows.map(function(r) {
    return {
      cardId: String(r['Card ID'] || ''),
      habitId: String(r['Habit ID'] || r['Card ID'] || ''),
      name: String(r['Name'] || ''),
      color: String(r['Color'] || ''),
      order: numOrNull_(r['Order'])
    };
  });

  const today = new Date(); today.setHours(12,0,0,0);
  const currentMonday = mondayStart_(today); currentMonday.setHours(12,0,0,0);
  const start = new Date(currentMonday); start.setDate(start.getDate()-84);
  const end = new Date(currentMonday); end.setDate(end.getDate()+6);
  const startKey = Utilities.formatDate(start, APP.TZ, 'yyyy-MM-dd');
  const todayKey = Utilities.formatDate(today, APP.TZ, 'yyyy-MM-dd');

  const byCard = {}, byHabit = {};
  habitCards.forEach(function(card){ byCard[card.cardId]=card; byHabit[card.habitId]=card; });

  const completeByCard = {}, completeByDay = {};
  sheetObjects_('HabitHistory').forEach(function(r) {
    const dateKey = dateKeySheet_(r['Date']);
    if (!dateKey || dateKey < startKey || dateKey > Utilities.formatDate(end, APP.TZ, 'yyyy-MM-dd')) return;
    const card = byCard[String(r['Habit Card ID'] || '')] || byHabit[String(r['Habit ID'] || '')];
    if (!card) return;
    if (!completeByCard[card.cardId]) completeByCard[card.cardId] = {};
    completeByCard[card.cardId][dateKey] = true;
    if (!completeByDay[dateKey]) completeByDay[dateKey] = {};
    completeByDay[dateKey][card.cardId] = card.name;
  });

  const days=[], cursor=new Date(start);
  while(cursor<=end){
    const key=Utilities.formatDate(cursor,APP.TZ,'yyyy-MM-dd');
    const dayMap=completeByDay[key]||{},names=Object.keys(dayMap).map(function(id){return dayMap[id];});
    const future=key>todayKey,count=names.length,ratio=habitCards.length?count/habitCards.length:0;
    days.push({date:key,count:count,level:future?-1:(count===0?0:Math.max(1,Math.min(4,Math.ceil(ratio*4)))),habits:names,future:future});
    cursor.setDate(cursor.getDate()+1);
  }

  const elapsedDays=days.filter(function(d){return !d.future;}).length;
  const currentMondayKey=Utilities.formatDate(currentMonday,APP.TZ,'yyyy-MM-dd');
  const habits=habitCards.map(function(card){
    const map=completeByCard[card.cardId]||{},dates=Object.keys(map).sort();
    let currentStreak=0,streakCursor=new Date(today),streakKey=Utilities.formatDate(streakCursor,APP.TZ,'yyyy-MM-dd');
    if(!map[streakKey]){streakCursor.setDate(streakCursor.getDate()-1);streakKey=Utilities.formatDate(streakCursor,APP.TZ,'yyyy-MM-dd');}
    while(map[streakKey]){currentStreak++;streakCursor.setDate(streakCursor.getDate()-1);streakKey=Utilities.formatDate(streakCursor,APP.TZ,'yyyy-MM-dd');}
    let bestStreak=0,run=0;
    days.forEach(function(day){if(day.future)return;if(map[day.date]){run++;if(run>bestStreak)bestStreak=run;}else run=0;});
    const thisWeek=dates.filter(function(d){return d>=currentMondayKey&&d<=todayKey;}).length;
    return {cardId:card.cardId,habitId:card.habitId,name:card.name,color:card.color,order:card.order,completions:dates.length,currentStreak:currentStreak,bestStreak:bestStreak,thisWeek:thisWeek,rate:elapsedDays?Math.round((dates.length/elapsedDays)*100):0,dates:dates};
  });
  const totalCompletions=days.filter(function(d){return !d.future;}).reduce(function(sum,d){return sum+d.count;},0);
  const totalPossible=elapsedDays*habitCards.length;
  return {startDate:startKey,endDate:Utilities.formatDate(end,APP.TZ,'yyyy-MM-dd'),today:todayKey,habitCount:habitCards.length,elapsedDays:elapsedDays,totalCompletions:totalCompletions,completionRate:totalPossible?Math.round((totalCompletions/totalPossible)*100):0,days:days,habits:habits};
}

function getHabitDashboardDataSheet_() {
  return buildHabitDashboardFromSheet_();
}

function toggleHabitSheet_(payload) {
  if (!payload || !payload.cardId) throw new Error('Habit identity missing.');
  const ss = dashboardSpreadsheet_(), sh = ss.getSheetByName('HabitHistory');
  if (payload.logId) {
    const values = sh.getDataRange().getValues();
    for (let i=1;i<values.length;i++) {
      if (String(values[i][0]) === String(payload.logId)) {
        sh.deleteRow(i+1);
        return {done:false,logId:null};
      }
    }
    return {done:false,logId:null};
  }
  const habits = sheetObjects_('Habits');
  const h = habits.find(function(r){ return String(r['Card ID']) === String(payload.cardId); });
  if (!h) throw new Error('Habit not found.');
  const id = Utilities.getUuid();
  appendTableObject_('HabitHistory',{
    'ID':id,
    'Date':Utilities.formatDate(new Date(),APP.TZ,'yyyy-MM-dd'),
    'Habit Card ID':String(h['Card ID']||''),
    'Habit ID':String(h['Habit ID']||''),
    'Habit Name':String(h['Name']||'')
  });
  return {done:true,logId:id};
}

function createQuickItemSheet_(type, payload) {
  payload = payload || {}; type = String(type || '').toLowerCase();
  if (type === 'task' || type === 'school_task') {
    const title=String(payload.title||'').trim(); if(!title)throw new Error('Task title is required.');
    appendTableObject_('Tasks',{
      'ID':Utilities.getUuid(),'Task':title,'Status':'To Do','Priority':payload.priority||'',
      'Area':type==='school_task'?'School':(payload.area||'Personal'),'Due':payload.due||'',
      'Done':false,'Details':payload.details||'','Course':payload.course||'','Source URL':'',
      'Repeat':payload.repeat||'','Repeat Until':payload.repeatUntil||'','Completed At':''
    });
    return {ok:true};
  }
  if (type === 'note') {
    const title=String(payload.title||'').trim(); if(!title)throw new Error('Note title is required.');
    appendTableObject_('Notes',{
      'ID':Utilities.getUuid(),'Title':title,'Area':payload.area||'Personal','Status':'Draft',
      'Type':payload.noteType||'Reference','Date':Utilities.formatDate(new Date(),APP.TZ,'yyyy-MM-dd'),
      'Body':payload.body||'','Source URL':''
    });
    return {ok:true};
  }
  throw new Error('Unknown quick-capture type.');
}


function validateSheetsBackend() {
  const info = getDashboardDataStoreInfo();
  const counts = {};
  Object.keys(DASHBOARD_TABLES).forEach(function(name) { counts[name] = sheetObjects_(name).length; });
  const result = { ok: true, backend: 'sheets', spreadsheetUrl: info.spreadsheetUrl, counts: counts };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function getDashboardDataStoreInfo() {
  const id = PropertiesService.getScriptProperties().getProperty('DASHBOARD_DATA_SHEET_ID');
  return {
    backend: 'sheets',
    spreadsheetId: id || '',
    spreadsheetUrl: id ? SpreadsheetApp.openById(id).getUrl() : ''
  };
}


function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}