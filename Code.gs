const APP = Object.freeze({
  TZ: 'America/Chicago',
  NOTION_VERSION: '2025-09-03',
  DS: {
    SETTINGS: '859b0e5d-cecf-4ec3-afce-00d0cc7c5f4d',
    TASKS: '948c89d0-a4b1-4fff-b2c7-71925b8db37f',
    NOTES: 'd8adbe7e-c94a-41c5-bae2-b927f1a82ca8',
    PROJECTS: 'e44d6123-6059-4c70-98fe-6564f3b863fa',
    CHECKINS: 'ed679659-0afb-45f1-a241-6b39ecd037db',
    HABITS: '6ae29113-9425-83ba-a4f5-8741080a3450',
    HABIT_CARDS: 'e8763a45-95d5-4315-b942-a257225d5cc7',
    HABIT_HISTORY: '14e29113-9425-83b9-9177-07b64dd91447'
  },
  PAGES: {
    ALL_HABITS_HEATMAP: 'dad29113-9425-8264-bf9d-0146df8d2d20'
  },
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
  const initialView = ['home', 'habits', 'health', 'school', 'projects', 'collections'].indexOf(requestedView) >= 0 ? requestedView : 'home';
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
      notionConnected: !!PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN'),
      backend: useSheetsBackend_() ? 'sheets' : 'notion',
      dataReady: useSheetsBackend_() || !!PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN'),
      dataStoreUrl: useSheetsBackend_() ? dashboardSpreadsheet_().getUrl() : ''
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
  try { out.settings = getDashboardSettings_(); } catch (e) { errors.push('settings: ' + e.message); }
  try { out.calendar = getCalendarWeek(0); } catch (e) { errors.push('calendar: ' + e.message); }

  if (out.setup.dataReady) {
    try { out.focus = getFocusTasks_(); } catch (e) { errors.push('focus: ' + e.message); }
    try { out.habits = getHabits_(); } catch (e) { errors.push('habits: ' + e.message); }
    try { out.health = getHealthSummary_(); } catch (e) { errors.push('health: ' + e.message); }
    try { out.school = getSchoolSummary_(); } catch (e) { errors.push('school: ' + e.message); }
    try { out.projects = getProjectsSummary_(); } catch (e) { errors.push('projects: ' + e.message); }
    try { out.projectTasks = getProjectTasks_(); } catch (e) { errors.push('project tasks: ' + e.message); }
  }

  out.errors = errors;
  return out;
}

function getDashboardSettings_() {
  if (useSheetsBackend_()) return getDashboardSettingsSheet_();
  const rows = notionQueryAll_(APP.DS.SETTINGS, {
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 100
  });
  return rows.map(function(page) {
    return {
      id: page.id,
      setting: notionText_(page.properties.Setting),
      group: notionSelect_(page.properties.Group),
      value: notionText_(page.properties.Value),
      number: notionNumber_(page.properties.Number),
      enabled: notionCheckbox_(page.properties.Enabled),
      order: notionNumber_(page.properties.Order),
      accent: notionSelect_(page.properties.Accent),
      japanese: notionText_(page.properties.Japanese),
      notes: notionText_(page.properties.Notes)
    };
  });
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
  if (useSheetsBackend_()) return getFocusTasksSheet_();
  const rows = notionQueryAll_(APP.DS.TASKS, {
    filter: {
      and: [
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Status', select: { does_not_equal: 'Archived' } },
        { property: 'Done', checkbox: { equals: false } },
        { property: 'Due', date: { is_not_empty: true } }
      ]
    },
    sorts: [{ property: 'Due', direction: 'ascending' }],
    page_size: 25
  });

  return rows.map(taskFromNotion_).filter(function(x) { return x.title; });
}

function getSchoolSummary_() {
  if (useSheetsBackend_()) return getSchoolSummarySheet_();
  const rows = notionQueryAll_(APP.DS.TASKS, {
    filter: {
      and: [
        { property: 'Area', select: { equals: 'School' } },
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Status', select: { does_not_equal: 'Archived' } },
        { property: 'Done', checkbox: { equals: false } }
      ]
    },
    sorts: [{ property: 'Due', direction: 'ascending' }],
    page_size: 12
  });
  return rows.map(taskFromNotion_).filter(function(x) { return x.title; });
}

function taskFromNotion_(page) {
  return {
    id: page.id,
    url: page.url,
    title: notionText_(page.properties.Task),
    status: notionSelect_(page.properties.Status),
    priority: notionSelect_(page.properties.Priority),
    area: notionSelect_(page.properties.Area),
    due: notionDate_(page.properties.Due),
    done: notionCheckbox_(page.properties.Done),
    details: notionText_(page.properties.Details),
    course: notionSelect_(page.properties.Course) || notionText_(page.properties.Course)
  };
}

function getProjectsSummary_() {
  if (useSheetsBackend_()) return getProjectsSummarySheet_();
  const rows = notionQueryAll_(APP.DS.PROJECTS, {
    filter: { property: 'Status', select: { equals: 'Active' } },
    page_size: 20
  });
  return rows.map(function(page) {
    return {
      id: page.id,
      url: page.url,
      name: notionText_(page.properties.Name),
      phase: notionSelect_(page.properties.Phase),
      priority: notionSelect_(page.properties.Priority),
      progress: notionNumber_(page.properties.Progress),
      targetDate: notionDate_(page.properties['Target Date']),
      summary: notionText_(page.properties.Summary),
      area: notionSelect_(page.properties.Area),
      budget: notionNumber_(page.properties.Budget)
    };
  }).filter(function(x) { return x.name; });
}

function getProjectTasks_() {
  if (useSheetsBackend_()) return getProjectTasksSheet_();
  const rows = notionQueryAll_(APP.DS.TASKS, {
    filter: {
      and: [
        { property: 'Area', select: { equals: 'Projects' } },
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Status', select: { does_not_equal: 'Archived' } },
        { property: 'Done', checkbox: { equals: false } }
      ]
    },
    sorts: [{ property: 'Due', direction: 'ascending' }],
    page_size: 30
  });
  return rows.map(taskFromNotion_).filter(function(x) { return x.title; });
}

function getHealthSummary_() {
  if (useSheetsBackend_()) return getHealthSummarySheet_();
  const rows = notionQueryAll_(APP.DS.CHECKINS, {
    filter: { property: 'Type', select: { equals: 'Daily Check-In' } },
    sorts: [{ property: 'Date', direction: 'descending' }],
    page_size: 30
  });
  if (!rows.length) return null;

  const data = rows.map(function(page) {
    return {
      date: notionDate_(page.properties.Date),
      weight: notionNumber_(page.properties['Morning Weight (lb)']),
      sleepHours: notionNumber_(page.properties['Sleep Hours']),
      sleepScore: notionNumber_(page.properties['Sleep Score']),
      hrv: notionNumber_(page.properties.HRV),
      restingHR: notionNumber_(page.properties['Resting HR']),
      steps: notionNumber_(page.properties.Steps),
      protein: notionNumber_(page.properties['Protein (g)']),
      bodyBattery: notionNumber_(page.properties['Body Battery']),
      energy: notionNumber_(page.properties.Energy),
      stress: notionNumber_(page.properties.Stress),
      soreness: notionNumber_(page.properties.Soreness),
      mood: notionSelect_(page.properties.Mood)
    };
  });

  const latest = data[0];
  const oldestWeight = data.slice().reverse().find(function(x) { return x.weight !== null; });
  const latestWeight = data.find(function(x) { return x.weight !== null; });
  return {
    latest: latest,
    weightTrend30d: latestWeight && oldestWeight ? round1_(latestWeight.weight - oldestWeight.weight) : null,
    series: data.slice().reverse()
  };
}

function getHabits_() {
  if (useSheetsBackend_()) return getHabitsSheet_();
  const cards = notionQueryAll_(APP.DS.HABIT_CARDS, {
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 100
  });

  const today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = Utilities.formatDate(tomorrowDate, APP.TZ, 'yyyy-MM-dd');

  const logs = notionQueryAll_(APP.DS.HABIT_HISTORY, {
    filter: {
      and: [
        { property: 'Date', date: { on_or_after: today } },
        { property: 'Date', date: { before: tomorrow } }
      ]
    },
    page_size: 100
  });

  const byCard = {};
  logs.forEach(function(log) {
    const rel = notionRelationIds_(log.properties['Habit Card']);
    if (rel.length) byCard[rel[0]] = log.id;
  });

  return cards.map(function(page) {
    const habits = notionRelationIds_(page.properties.Habit);
    return {
      cardId: page.id,
      habitId: habits.length ? habits[0] : '',
      name: notionText_(page.properties.Name),
      order: notionNumber_(page.properties.Order),
      color: notionSelect_(page.properties.Color) || '',
      done: !!byCard[page.id],
      logId: byCard[page.id] || null
    };
  }).filter(function(x) { return x.name && x.habitId; });
}


function getHabitDashboardData() {
  if (useSheetsBackend_()) return getHabitDashboardDataSheet_();
  const cards = notionQueryAll_(APP.DS.HABIT_CARDS, {
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 100
  });

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const currentMonday = mondayStart_(today);
  currentMonday.setHours(12, 0, 0, 0);

  const start = new Date(currentMonday);
  start.setDate(start.getDate() - 84);
  const end = new Date(currentMonday);
  end.setDate(end.getDate() + 6);
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const startKey = Utilities.formatDate(start, APP.TZ, 'yyyy-MM-dd');
  const endExclusiveKey = Utilities.formatDate(endExclusive, APP.TZ, 'yyyy-MM-dd');
  const todayKey = Utilities.formatDate(today, APP.TZ, 'yyyy-MM-dd');

  const habitCards = cards.map(function(page) {
    const habitRel = notionRelationIds_(page.properties.Habit);
    return {
      cardId: page.id,
      habitId: habitRel.length ? habitRel[0] : '',
      name: notionText_(page.properties.Name),
      color: notionSelect_(page.properties.Color) || '',
      order: notionNumber_(page.properties.Order)
    };
  }).filter(function(x) { return x.name && x.habitId; });

  const byCard = {};
  const byHabit = {};
  habitCards.forEach(function(card) {
    byCard[card.cardId] = card;
    byHabit[card.habitId] = card;
  });

  const logs = notionQueryAll_(APP.DS.HABIT_HISTORY, {
    filter: {
      and: [
        { property: 'Date', date: { on_or_after: startKey } },
        { property: 'Date', date: { before: endExclusiveKey } }
      ]
    },
    page_size: 100
  });

  const completeByCard = {};
  const completeByDay = {};

  logs.forEach(function(log) {
    const rawDate = notionDate_(log.properties.Date);
    if (!rawDate) return;
    const dateKey = Utilities.formatDate(new Date(rawDate), APP.TZ, 'yyyy-MM-dd');

    let card = null;
    const cardRel = notionRelationIds_(log.properties['Habit Card']);
    if (cardRel.length) card = byCard[cardRel[0]] || null;
    if (!card) {
      const habitRel = notionRelationIds_(log.properties.Habit);
      if (habitRel.length) card = byHabit[habitRel[0]] || null;
    }
    if (!card) return;

    if (!completeByCard[card.cardId]) completeByCard[card.cardId] = {};
    completeByCard[card.cardId][dateKey] = true;

    if (!completeByDay[dateKey]) completeByDay[dateKey] = {};
    completeByDay[dateKey][card.cardId] = card.name;
  });

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = Utilities.formatDate(cursor, APP.TZ, 'yyyy-MM-dd');
    const dayMap = completeByDay[key] || {};
    const names = Object.keys(dayMap).map(function(id) { return dayMap[id]; });
    const future = key > todayKey;
    const count = names.length;
    const ratio = habitCards.length ? count / habitCards.length : 0;
    days.push({
      date: key,
      count: count,
      level: future ? -1 : (count === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(ratio * 4)))),
      habits: names,
      future: future
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const elapsedDays = days.filter(function(d) { return !d.future; }).length;
  const currentMondayKey = Utilities.formatDate(currentMonday, APP.TZ, 'yyyy-MM-dd');

  const habits = habitCards.map(function(card) {
    const map = completeByCard[card.cardId] || {};
    const dates = Object.keys(map).sort();

    let currentStreak = 0;
    const streakCursor = new Date(today);
    let streakKey = Utilities.formatDate(streakCursor, APP.TZ, 'yyyy-MM-dd');
    if (!map[streakKey]) {
      streakCursor.setDate(streakCursor.getDate() - 1);
      streakKey = Utilities.formatDate(streakCursor, APP.TZ, 'yyyy-MM-dd');
    }
    while (map[streakKey]) {
      currentStreak++;
      streakCursor.setDate(streakCursor.getDate() - 1);
      streakKey = Utilities.formatDate(streakCursor, APP.TZ, 'yyyy-MM-dd');
    }

    let bestStreak = 0;
    let run = 0;
    days.forEach(function(day) {
      if (day.future) return;
      if (map[day.date]) {
        run++;
        if (run > bestStreak) bestStreak = run;
      } else {
        run = 0;
      }
    });

    const thisWeek = dates.filter(function(d) {
      return d >= currentMondayKey && d <= todayKey;
    }).length;

    return {
      cardId: card.cardId,
      habitId: card.habitId,
      name: card.name,
      color: card.color,
      order: card.order,
      completions: dates.length,
      currentStreak: currentStreak,
      bestStreak: bestStreak,
      thisWeek: thisWeek,
      rate: elapsedDays ? Math.round((dates.length / elapsedDays) * 100) : 0,
      dates: dates
    };
  });

  const totalCompletions = days.filter(function(d) { return !d.future; })
    .reduce(function(sum, d) { return sum + d.count; }, 0);
  const totalPossible = elapsedDays * habitCards.length;

  return {
    startDate: startKey,
    endDate: Utilities.formatDate(end, APP.TZ, 'yyyy-MM-dd'),
    today: todayKey,
    habitCount: habitCards.length,
    elapsedDays: elapsedDays,
    totalCompletions: totalCompletions,
    completionRate: totalPossible ? Math.round((totalCompletions / totalPossible) * 100) : 0,
    days: days,
    habits: habits
  };
}

function toggleHabit(payload) {
  if (useSheetsBackend_()) return toggleHabitSheet_(payload);
  if (!payload || !payload.cardId || !payload.habitId) throw new Error('Habit identity missing.');

  if (payload.logId) {
    notionRequest_('/v1/pages/' + payload.logId, 'patch', { archived: true });
    return { done: false, logId: null };
  }

  const now = new Date().toISOString();
  const body = {
    parent: { type: 'data_source_id', data_source_id: APP.DS.HABIT_HISTORY },
    properties: {
      'Name (not important)': { title: [{ text: { content: 'Habit log' } }] },
      Date: { date: { start: now } },
      Habit: { relation: [{ id: payload.habitId }] },
      'Habit Card': { relation: [{ id: payload.cardId }] },
      Heatmap: { relation: [{ id: APP.PAGES.ALL_HABITS_HEATMAP }] }
    }
  };
  const created = notionRequest_('/v1/pages', 'post', body);
  return { done: true, logId: created.id };
}

function createQuickItem(type, payload) {
  if (useSheetsBackend_() && String(type || '').toLowerCase() !== 'wishlist') return createQuickItemSheet_(type, payload);
  payload = payload || {};
  type = String(type || '').toLowerCase();

  if (type === 'wishlist') return appendWishlist_(payload);

  if (type === 'task' || type === 'school_task') {
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('Task title is required.');
    const area = type === 'school_task' ? 'School' : (payload.area || 'Personal');
    const properties = {
      Task: { title: [{ text: { content: title } }] },
      Status: { select: { name: 'Inbox' } },
      Area: { select: { name: area } },
      Done: { checkbox: false }
    };
    if (payload.priority) properties.Priority = { select: { name: payload.priority } };
    if (payload.due) properties.Due = { date: { start: payload.due } };
    if (payload.details) properties.Details = { rich_text: [{ text: { content: String(payload.details) } }] };
    const page = notionRequest_('/v1/pages', 'post', {
      parent: { type: 'data_source_id', data_source_id: APP.DS.TASKS },
      properties: properties
    });
    return { ok: true, id: page.id, url: page.url };
  }

  if (type === 'note') {
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('Note title is required.');
    const properties = {
      Title: { title: [{ text: { content: title } }] },
      Area: { select: { name: payload.area || 'Personal' } },
      Status: { select: { name: 'Draft' } },
      Type: { select: { name: payload.noteType || 'Reference' } },
      Date: { date: { start: Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd') } }
    };
    const page = notionRequest_('/v1/pages', 'post', {
      parent: { type: 'data_source_id', data_source_id: APP.DS.NOTES },
      properties: properties,
      children: payload.body ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: String(payload.body) } }] } }] : []
    });
    return { ok: true, id: page.id, url: page.url };
  }

  throw new Error('Unknown quick-capture type.');
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
  Tasks: ['ID','Task','Status','Priority','Area','Due','Done','Details','Course','Source URL'],
  Projects: ['ID','Name','Status','Phase','Priority','Progress','Target Date','Summary','Area','Budget','Source URL'],
  Health: ['ID','Date','Type','Morning Weight (lb)','Sleep Hours','Sleep Score','HRV','Resting HR','Steps','Protein (g)','Body Battery','Energy','Stress','Soreness','Mood'],
  Habits: ['Card ID','Habit ID','Name','Color','Order','Active'],
  HabitHistory: ['ID','Date','Habit Card ID','Habit ID','Habit Name'],
  Notes: ['ID','Title','Area','Status','Type','Date','Body','Source URL']
});

function useSheetsBackend_() {
  return PropertiesService.getScriptProperties().getProperty('DATA_BACKEND') === 'sheets';
}

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
    course: String(r['Course'] || '')
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
      'ID':Utilities.getUuid(),'Task':title,'Status':'Inbox','Priority':payload.priority||'',
      'Area':type==='school_task'?'School':(payload.area||'Personal'),'Due':payload.due||'',
      'Done':false,'Details':payload.details||'','Course':payload.course||'','Source URL':''
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

function notionBlockText_(pageId) {
  try {
    const res = notionRequest_('/v1/blocks/' + pageId + '/children?page_size=100','get');
    return (res.results||[]).map(function(b){
      const obj=b[b.type]||{},rt=obj.rich_text||[];
      return rt.map(function(x){return x.plain_text||(x.text&&x.text.content)||'';}).join('');
    }).filter(Boolean).join('\n');
  } catch (e) { return ''; }
}

function migrateOffNotion() {
  const props=PropertiesService.getScriptProperties();
  if (!props.getProperty('NOTION_TOKEN')) throw new Error('NOTION_TOKEN is required for the one-time migration.');
  const ss=createDashboardDataStore_();

  const settings=getDashboardSettings_().map(function(x){return {
    'Setting':x.setting,'Group':x.group,'Value':x.value,'Number':x.number,'Enabled':x.enabled,
    'Order':x.order,'Accent':x.accent,'Japanese':x.japanese,'Notes':x.notes
  };});

  const taskPages=notionQueryAll_(APP.DS.TASKS,{page_size:100});
  const tasks=taskPages.map(function(page){
    const t=taskFromNotion_(page);return {
      'ID':page.id,'Task':t.title,'Status':t.status,'Priority':t.priority,'Area':t.area,
      'Due':t.due||'','Done':t.done,'Details':t.details,'Course':t.course||'','Source URL':page.url||''
    };
  });

  const projectPages=notionQueryAll_(APP.DS.PROJECTS,{page_size:100});
  const projects=projectPages.map(function(page){return {
    'ID':page.id,'Name':notionText_(page.properties.Name),'Status':notionSelect_(page.properties.Status),
    'Phase':notionSelect_(page.properties.Phase),'Priority':notionSelect_(page.properties.Priority),
    'Progress':notionNumber_(page.properties.Progress),'Target Date':notionDate_(page.properties['Target Date'])||'',
    'Summary':notionText_(page.properties.Summary),'Area':notionSelect_(page.properties.Area),
    'Budget':notionNumber_(page.properties.Budget),'Source URL':page.url||''
  };});

  const healthPages=notionQueryAll_(APP.DS.CHECKINS,{page_size:100});
  const health=healthPages.map(function(page){return {
    'ID':page.id,'Date':notionDate_(page.properties.Date)||'','Type':notionSelect_(page.properties.Type),
    'Morning Weight (lb)':notionNumber_(page.properties['Morning Weight (lb)']),
    'Sleep Hours':notionNumber_(page.properties['Sleep Hours']),'Sleep Score':notionNumber_(page.properties['Sleep Score']),
    'HRV':notionNumber_(page.properties.HRV),'Resting HR':notionNumber_(page.properties['Resting HR']),
    'Steps':notionNumber_(page.properties.Steps),'Protein (g)':notionNumber_(page.properties['Protein (g)']),
    'Body Battery':notionNumber_(page.properties['Body Battery']),'Energy':notionNumber_(page.properties.Energy),
    'Stress':notionNumber_(page.properties.Stress),'Soreness':notionNumber_(page.properties.Soreness),
    'Mood':notionSelect_(page.properties.Mood)
  };});

  const cardPages=notionQueryAll_(APP.DS.HABIT_CARDS,{sorts:[{property:'Order',direction:'ascending'}],page_size:100});
  const habits=cardPages.map(function(page){
    const rel=notionRelationIds_(page.properties.Habit);
    return {'Card ID':page.id,'Habit ID':rel[0]||'','Name':notionText_(page.properties.Name),
      'Color':notionSelect_(page.properties.Color),'Order':notionNumber_(page.properties.Order),'Active':true};
  }).filter(function(x){return x['Name']&&x['Habit ID'];});
  const byCard={},byHabit={};habits.forEach(function(h){byCard[h['Card ID']]=h;byHabit[h['Habit ID']]=h;});

  const logPages=notionQueryAll_(APP.DS.HABIT_HISTORY,{page_size:100});
  const history=logPages.map(function(page){
    const cardRel=notionRelationIds_(page.properties['Habit Card']),habitRel=notionRelationIds_(page.properties.Habit);
    const cardId=cardRel[0]||'',habitId=habitRel[0]||'',h=byCard[cardId]||byHabit[habitId]||{};
    return {'ID':page.id,'Date':notionDate_(page.properties.Date)||'','Habit Card ID':cardId||h['Card ID']||'',
      'Habit ID':habitId||h['Habit ID']||'','Habit Name':h['Name']||notionText_(page.properties.Name)||''};
  }).filter(function(x){return x['Date'];});

  const notePages=notionQueryAll_(APP.DS.NOTES,{page_size:100});
  const notes=notePages.map(function(page){return {
    'ID':page.id,'Title':notionText_(page.properties.Title),'Area':notionSelect_(page.properties.Area),
    'Status':notionSelect_(page.properties.Status),'Type':notionSelect_(page.properties.Type),
    'Date':notionDate_(page.properties.Date)||'','Body':notionBlockText_(page.id),'Source URL':page.url||''
  };});

  writeTableObjects_(ss,'Settings',settings);
  writeTableObjects_(ss,'Tasks',tasks);
  writeTableObjects_(ss,'Projects',projects);
  writeTableObjects_(ss,'Health',health);
  writeTableObjects_(ss,'Habits',habits);
  writeTableObjects_(ss,'HabitHistory',history);
  writeTableObjects_(ss,'Notes',notes);

  props.setProperty('DATA_BACKEND','sheets');
  return {
    ok:true,backend:'sheets',spreadsheetId:ss.getId(),spreadsheetUrl:ss.getUrl(),
    counts:{settings:settings.length,tasks:tasks.length,projects:projects.length,health:health.length,habits:habits.length,habitHistory:history.length,notes:notes.length}
  };
}

function rollbackToNotionBackend() {
  PropertiesService.getScriptProperties().deleteProperty('DATA_BACKEND');
  return {ok:true,backend:'notion'};
}

function getDashboardDataStoreInfo() {
  const props=PropertiesService.getScriptProperties(),id=props.getProperty('DASHBOARD_DATA_SHEET_ID');
  return {backend:useSheetsBackend_()?'sheets':'notion',spreadsheetId:id||'',spreadsheetUrl:id?SpreadsheetApp.openById(id).getUrl():''};
}


function notionRequest_(path, method, body) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN is not configured in Script Properties.');

  const options = {
    method: String(method || 'get').toUpperCase(),
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': APP.NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  if (body !== undefined && body !== null) options.payload = JSON.stringify(body);

  const resp = UrlFetchApp.fetch('https://api.notion.com' + path, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function notionQueryAll_(dataSourceId, body) {
  body = Object.assign({}, body || {});
  const out = [];
  let cursor = null;
  let pages = 0;
  do {
    if (cursor) body.start_cursor = cursor;
    const res = notionRequest_('/v1/data_sources/' + dataSourceId + '/query', 'post', body);
    (res.results || []).forEach(function(x) { out.push(x); });
    cursor = res.has_more ? res.next_cursor : null;
    pages++;
  } while (cursor && pages < 10);
  return out;
}

function notionText_(p) {
  if (!p) return '';
  const list = p.title || p.rich_text || [];
  if (Array.isArray(list)) return list.map(function(x) { return x.plain_text || (x.text && x.text.content) || ''; }).join('');
  if (p.formula && typeof p.formula.string === 'string') return p.formula.string;
  return '';
}

function notionSelect_(p) {
  if (!p) return '';
  if (p.select) return p.select.name || '';
  if (p.status) return p.status.name || '';
  return '';
}

function notionNumber_(p) {
  if (!p) return null;
  if (typeof p.number === 'number') return p.number;
  if (p.formula && typeof p.formula.number === 'number') return p.formula.number;
  return null;
}

function notionCheckbox_(p) {
  if (!p) return false;
  if (typeof p.checkbox === 'boolean') return p.checkbox;
  if (p.formula && typeof p.formula.boolean === 'boolean') return p.formula.boolean;
  return false;
}

function notionDate_(p) {
  if (!p || !p.date) return null;
  return p.date.start || null;
}

function notionRelationIds_(p) {
  if (!p || !Array.isArray(p.relation)) return [];
  return p.relation.map(function(x) { return x.id; }).filter(Boolean);
}

function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}