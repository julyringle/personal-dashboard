const STATE = {
  route:(window.__INITIAL_VIEW__||'home'), bootstrap:null, weekOffset:0,
  collectionTab:'wishlist', collectionCache:{},
  pokemonGen:'1', pokemonFilter:'all', wishlistCategory:'all', onePiecePage:'all',
  modalType:null, habitDashboard:null
};
const LINKS = {
  health:'https://app.notion.com/p/3ea2911394258117a53ae060d1541d21',
  school:'https://app.notion.com/p/3ee291139425811baf35d4a5b303ae6b',
  projects:'https://app.notion.com/p/3ea2911394258152a31ee7240412fe64',
  collections:'https://app.notion.com/p/3ea29113942581baa19ff6a63c468344'
};
const GEN_COLORS={1:'#8E3E42',2:'#A8642A',3:'#A88D3E',4:'#4E725C',5:'#536979',6:'#6E547A',7:'#8A526C',8:'#79634F',9:'#73777C'};

function server(method,...args){
  return new Promise((resolve,reject)=>{
    try{
      const runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(err=>reject(new Error(err && err.message ? err.message : String(err))));
      runner[method](...args);
    }catch(e){reject(e)}
  });
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function attr(s){return esc(s).replace(/`/g,'&#096;')}
function fmtDate(v,opts={month:'short',day:'2-digit'}){if(!v)return'—';const d=new Date(v);return isNaN(d)?'—':new Intl.DateTimeFormat('en-US',opts).format(d)}
function fmtTime(v){if(!v)return'';return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(v))}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function startDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function setting(name){return (STATE.bootstrap?.settings||[]).find(x=>x.setting===name)}
function settingNum(name,fallback){const x=setting(name);return x && x.number!=null?Number(x.number):fallback}
function settingVal(name,fallback){const x=setting(name);return x && x.value?x.value:fallback}
function applyTheme(){
  const r=document.documentElement.style;
  r.setProperty('--bg',settingVal('Background','#0B0D0F'));r.setProperty('--panel',settingVal('Panel','#111418'));r.setProperty('--panel2',settingVal('Raised Panel','#171B20'));r.setProperty('--border',settingVal('Border','#292E35'));r.setProperty('--text',settingVal('Text','#E5E2DC'));r.setProperty('--muted',settingVal('Muted Text','#747A80'));r.setProperty('--red',settingVal('Primary Accent','#8E2027'));
}
function updateClock(){const n=new Date();document.getElementById('clock').innerHTML=`${new Intl.DateTimeFormat('en-US',{month:'short',day:'2-digit'}).format(n).toUpperCase()} // <strong>${new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit'}).format(n)}</strong>`}
setInterval(updateClock,30000);updateClock();

document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));
function navigate(route){STATE.route=route;document.body.dataset.page=route;document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));if(route==='habits')renderHabitsPage();else if(route==='collections')renderCollections();else renderHome();}

async function init(){
  try{STATE.bootstrap=await server('getBootstrapData');applyTheme();navigate(STATE.route);if(STATE.bootstrap.errors?.length)console.warn(STATE.bootstrap.errors)}catch(e){document.getElementById('app').innerHTML=`<div class="error">${esc(e.message)}</div>`}
}

function panel(title,jp,body,opts={}){return `<section class="panel ${opts.className||''}"><div class="panel-head"><div class="panel-title">${esc(title)} <span class="jp">${esc(jp||'')}</span></div>${opts.right||''}</div>${body}</section>`}
function renderHome(){
  const b=STATE.bootstrap||{};const root=document.getElementById('app');
  let html='<div class="home-grid">';
  html+=`<div class="span-12">${calendarPanel(b.calendar)}</div>`;
  html+=`<div class="span-12">${habitsPanel(b.habits||[])}</div>`;
  html+=`<div class="span-8">${focusPanel(b.focus||[])}</div>`;
  html+=`<div class="span-4">${healthPanel(b.health)}</div>`;
  html+=`<div class="span-4">${schoolPanel(b.school||[])}</div>`;
  html+=`<div class="span-4">${projectPanel(b.projects||[])}</div>`;
  html+=`<div class="span-4">${collectionLaunchPanel()}</div>`;
  html+='</div>';
  if(b.errors?.length)html+=`<div class="error">Some modules could not load: ${esc(b.errors.join(' · '))}</div>`;
  root.innerHTML=html;bindHome();
}
function bindHome(){
  document.querySelectorAll('[data-habit]').forEach(x=>x.onclick=()=>toggleHabitUI(x.dataset.habit));
  document.querySelectorAll('[data-week]').forEach(x=>x.onclick=()=>changeWeek(Number(x.dataset.week)));
  document.querySelectorAll('[data-open-route]').forEach(x=>x.onclick=()=>navigate(x.dataset.openRoute));
}

function quickPanel(){return panel('QUICK CAPTURE','即時入力',`<div class="panel-body"><div class="quick-row">
  <button class="action-btn" data-quick="task"><span class="label">NEW TASK</span><span class="mark">＋</span></button>
  <button class="action-btn" data-quick="school_task"><span class="label">SCHOOL TASK</span><span class="mark">＋</span></button>
  <button class="action-btn" data-quick="note"><span class="label">NEW NOTE</span><span class="mark">＋</span></button>
  <button class="action-btn" data-quick="wishlist"><span class="label">WISHLIST</span><span class="mark">＋</span></button>
</div></div>`)}
function habitsPanel(habits){
  const body=habits.length?`<div class="panel-body"><div class="habit-grid">${habits.map((h,i)=>`<div class="habit"><div class="habit-name">${esc(h.name)}</div><button class="toggle ${h.done?'on':''}" data-habit="${i}" title="${h.done?'Undo today':'Complete today'}"></button></div>`).join('')}</div></div>`:`<div class="empty">NO HABITS AVAILABLE</div>`;
  return panel('HABITS','習慣',body,{right:`<button class="panel-link" data-open-route="habits">13 WEEK TRACKER →</button>`});
}
async function toggleHabitUI(index){const h=STATE.bootstrap.habits[Number(index)];if(!h)return;try{const res=await server('toggleHabit',{cardId:h.cardId,habitId:h.habitId,logId:h.logId});h.done=res.done;h.logId=res.logId;STATE.habitDashboard=null;renderHome()}catch(e){alert(e.message)}}
function focusPanel(tasks){const n=settingNum('Focus Count',5);const show=tasks.slice(0,n);const body=show.length?`<div class="panel-body task-list">${show.map((t,i)=>taskRow(t,i)).join('')}</div>`:`<div class="empty">FOCUS QUEUE CLEAR</div>`;return panel('FOCUS','優先',body,{right:`<div class="panel-sub">${show.length} ACTIVE</div>`})}
function taskRow(t,i){const due=t.due?new Date(t.due):null;const overdue=due&&due<startDay(new Date());return `<a class="task-row" href="${attr(t.url||'#')}"><div class="task-num">${String(i+1).padStart(2,'0')}</div><div><div class="task-title">${esc(t.title)}</div><div class="task-meta"><span class="priority-${String(t.priority||'').toLowerCase()}">${esc(t.priority||'')}</span>${t.area?' · '+esc(t.area):''}</div></div><div class="due ${overdue?'overdue':''}">${t.due?fmtDate(t.due,{month:'short',day:'2-digit'}).toUpperCase():'—'}</div></a>`}
function healthPanel(h){if(!h||!h.latest)return panel('HEALTH','健康','<div class="empty">NO RECENT CHECK-IN</div>');const x=h.latest;const metrics=[['WEIGHT',x.weight!=null?x.weight+' LB':'—',h.weightTrend30d!=null?(h.weightTrend30d>0?'+':'')+h.weightTrend30d+' / 30D':''],['SLEEP',x.sleepHours!=null?x.sleepHours+' H':'—',x.sleepScore!=null?'SCORE '+x.sleepScore:''],['HRV',x.hrv??'—',''],['REST HR',x.restingHR??'—','BPM'],['STEPS',x.steps!=null?Number(x.steps).toLocaleString():'—',''],['PROTEIN',x.protein!=null?x.protein+' G':'—','']];return panel('HEALTH','健康',`<div class="panel-body"><div class="metric-grid">${metrics.map(m=>`<div class="metric"><div class="metric-k">${m[0]}</div><div class="metric-v">${esc(m[1])}</div><div class="metric-d">${esc(m[2])}</div></div>`).join('')}</div></div>`,{right:`<a class="panel-sub" href="${LINKS.health}">OPEN ↗</a>`})}
function schoolPanel(tasks){const show=tasks.slice(0,4);return panel('SCHOOL','学業',show.length?`<div class="panel-body task-list">${show.map((t,i)=>taskRow(t,i)).join('')}</div>`:`<div class="empty">NO OPEN SCHOOL TASKS</div>`,{right:`<a class="panel-sub" href="${LINKS.school}">OPEN ↗</a>`})}
function projectPanel(projects){const p=projects.find(x=>/rescue raft/i.test(x.name||''))||projects.find(x=>x.area==='Projects')||projects[0];if(!p)return panel('PROJECTS','計画','<div class="empty">NO ACTIVE PROJECT</div>');const progress=p.progress==null?null:Math.max(0,Math.min(1,Number(p.progress)));return panel('PROJECTS','計画',`<div class="panel-body project-card"><div class="project-name">${esc(p.name)}</div><div class="tagline">${p.phase?`<span class="tag">${esc(p.phase)}</span>`:''}${p.priority?`<span class="tag">${esc(p.priority)}</span>`:''}${p.targetDate?`<span class="tag">${fmtDate(p.targetDate).toUpperCase()}</span>`:''}</div>${p.summary?`<div class="project-summary">${esc(p.summary)}</div>`:''}${progress!=null?`<div class="progress"><i style="width:${Math.round(progress*100)}%"></i></div>`:''}</div>`,{right:`<a class="panel-sub" href="${attr(p.url||LINKS.projects)}">OPEN ↗</a>`})}
function collectionLaunchPanel(){return panel('COLLECTIONS','収集',`<div class="panel-body"><div class="collection-launch">
  <button class="launch-card" data-open-route="collections" onclick="STATE.collectionTab='wishlist'"><div class="launch-title">WISHLIST</div><div class="launch-jp">欲しい物</div><div class="launch-note">LIVE FROM SHEET</div></button>
  <button class="launch-card" data-open-route="collections" onclick="STATE.collectionTab='soccer'"><div class="launch-title">SOCCER</div><div class="launch-jp">ユニフォーム</div><div class="launch-note">SHEET ORDER</div></button>
  <button class="launch-card" data-open-route="collections" onclick="STATE.collectionTab='pokemon'"><div class="launch-title">POKÉMON</div><div class="launch-jp">世代</div><div class="launch-note">GEN I–IX</div></button>
  <button class="launch-card" data-open-route="collections" onclick="STATE.collectionTab='onepiece'"><div class="launch-title">ONE PIECE</div><div class="launch-jp">ページ</div><div class="launch-note">BINDER PAGES</div></button>
</div></div>`)}

function calendarPanel(cal){
  if(!cal)return panel('WEEK','週間','<div class="empty">CALENDAR UNAVAILABLE</div>');
  const startHour=settingNum('Calendar Start Hour',9),endHour=settingNum('Calendar End Hour',24),hourH=34,totalH=(endHour-startHour)*hourH;
  const weekStart=new Date(cal.weekStart);const days=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d});
  const now=new Date();
  const headers=days.map(d=>`<div class="cal-head-cell ${sameDay(d,now)?'today':''}"><b>${new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(d).toUpperCase()}</b>${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(d).toUpperCase()}</div>`).join('');
  const all=days.map(d=>`<div class="all-day-cell">${calendarDayEvents(cal.events,d,'all',startHour,endHour).map(e=>`<div class="all-chip" style="--event-color:${attr(e.color||'#536979')}">${esc(e.title)}</div>`).join('')}</div>`).join('');
  const midnight=days.map(d=>`<div class="midnight-cell">${calendarDayEvents(cal.events,d,'midnight',startHour,endHour).map(e=>`<div class="mid-chip" style="--event-color:${attr(e.color||'#8E2027')}">${esc(e.title)}</div>`).join('')}</div>`).join('');
  const timeLabels=Array.from({length:endHour-startHour},(_,i)=>`<div class="time-label" style="top:${i*hourH}px">${formatHour(startHour+i)}</div>`).join('');
  const dayCols=days.map(d=>`<div class="day-col ${sameDay(d,now)?'today':''}" style="height:${totalH}px">${hourLines(startHour,endHour,hourH)}${renderTimedEvents(cal.events,d,startHour,endHour,hourH)}${renderNow(d,now,startHour,endHour,hourH)}</div>`).join('');
  const right=`<div class="cal-toolbar"><button class="ghost-btn" data-week="${STATE.weekOffset-1}">‹</button><button class="ghost-btn" data-week="0">TODAY</button><button class="ghost-btn" data-week="${STATE.weekOffset+1}">›</button></div>`;
  return panel('WEEK','週間',`<div class="calendar-wrap"><div class="cal-header"><div></div>${headers}</div><div class="all-day-row"><div class="rail-label">ALL</div>${all}</div><div class="cal-main"><div class="time-col" style="height:${totalH}px">${timeLabels}</div><div class="days-grid">${dayCols}</div></div><div class="midnight-row"><div class="rail-label">12 AM</div>${midnight}</div></div>`,{right});
}
function formatHour(h){const x=h%24;if(x===0)return'12 AM';if(x===12)return'12 PM';return x>12?(x-12)+' PM':x+' AM'}
function hourLines(s,e,h){let out='';for(let i=0;i<e-s;i++){out+=`<div class="hour-line" style="top:${i*h}px"></div><div class="half-line" style="top:${i*h+h/2}px"></div>`}return out}
function calendarDayEvents(events,day,type,startHour,endHour){const ds=startDay(day),de=new Date(ds);de.setDate(de.getDate()+1);return (events||[]).filter(e=>{const s=new Date(e.start),en=new Date(e.end);if(!(s<de&&en>ds))return false;if(type==='all')return e.allDay;if(type==='midnight')return !e.allDay&&s.getTime()===ds.getTime();return false})}
function renderTimedEvents(events,day,startHour,endHour,hourH){const ds=startDay(day),de=new Date(ds);de.setDate(de.getDate()+1);const visStart=new Date(ds);visStart.setHours(startHour,0,0,0);const visEnd=new Date(ds);visEnd.setHours(endHour===24?24:endHour,0,0,0);return (events||[]).map(e=>{if(e.allDay)return'';const s=new Date(e.start),en=new Date(e.end);if(!(s<de&&en>ds))return'';if(s.getTime()===ds.getTime())return'';const a=new Date(Math.max(s,visStart)),b=new Date(Math.min(en,visEnd));if(b<=a)return'';const top=((a-visStart)/60000)/60*hourH,height=Math.max(16,((b-a)/60000)/60*hourH);return `<div class="cal-event" style="top:${top}px;height:${height}px;--event-color:${attr(e.color||'#536979')}"><div class="ev-title">${esc(e.title)}</div>${height>24?`<div class="ev-time">${fmtTime(s)}–${fmtTime(en)}</div>`:''}</div>`}).join('')}
function renderNow(day,now,startHour,endHour,hourH){if(!sameDay(day,now))return'';const mins=now.getHours()*60+now.getMinutes(),start=startHour*60,end=endHour*60;if(mins<start||mins>end)return'';return `<div class="now-line" style="top:${((mins-start)/60)*hourH}px"></div>`}
async function changeWeek(offset){STATE.weekOffset=offset;try{STATE.bootstrap.calendar=await server('getCalendarWeek',offset);renderHome()}catch(e){alert(e.message)}}


const HABIT_COLORS={Orange:'#a8642a',Blue:'#536979',Pink:'#8a526c',Yellow:'#a88d3e',Purple:'#6e547a',Green:'#4e725c',Red:'#8e3e42'};
async function renderHabitsPage(){
  const root=document.getElementById('app');
  root.innerHTML='<div class="loading">LOADING HABITS // 習慣データ読込</div>';
  try{
    if(!STATE.habitDashboard)STATE.habitDashboard=await server('getHabitDashboardData');
    renderHabitDashboard(STATE.habitDashboard);
  }catch(e){root.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function renderHabitDashboard(data){
  const root=document.getElementById('app');

  const elapsed=(data.days||[]).filter(d=>!d.future);
  const currentWeek=(data.days||[]).slice(-7).filter(d=>!d.future);
  const last7=elapsed.slice(-7);

  const weekDone=currentWeek.reduce((sum,d)=>sum+(d.count||0),0);
  const weekPossible=currentWeek.length*(data.habitCount||0);
  const last7Done=last7.reduce((sum,d)=>sum+(d.count||0),0);
  const last7Possible=last7.length*(data.habitCount||0);

  const bestDay=elapsed.reduce((best,d)=>{
    if(!best||Number(d.count||0)>Number(best.count||0))return d;
    return best;
  },null);

  const perfectDays=elapsed.filter(d=>
    data.habitCount>0 && Number(d.count||0)>=Number(data.habitCount)
  ).length;

  const bestDayDate=bestDay&&bestDay.date
    ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'})
        .format(new Date(bestDay.date+'T12:00:00')).toUpperCase()
    : '—';

  const overall=`
    <section class="habit-overall">
      <div class="heatmap-title-row">
        <div>
          <div class="heatmap-label">ALL HABITS // 全体</div>
          <div class="panel-sub">LAST 13 WEEKS · DAILY INTENSITY = HABITS COMPLETED</div>
        </div>
        <div class="overall-rate">
          <strong>${data.completionRate}%</strong>
          <span>13 WEEK RATE</span>
        </div>
      </div>

      <div class="overall-body">
        <div class="overall-map">
          ${habitHeatmap(data.days,null,'ALL HABITS')}
        </div>

        <div class="overall-stats">
          <div class="overall-stat">
            <b>${weekDone}<small>/${weekPossible||0}</small></b>
            <span>THIS WEEK</span>
          </div>
          <div class="overall-stat">
            <b>${last7Done}<small>/${last7Possible||0}</small></b>
            <span>LAST 7 DAYS</span>
          </div>
          <div class="overall-stat">
            <b>${bestDay?bestDay.count:0}<small>/${data.habitCount||0}</small></b>
            <span>BEST DAY · ${bestDayDate}</span>
          </div>
          <div class="overall-stat">
            <b>${perfectDays}</b>
            <span>PERFECT DAYS</span>
          </div>
        </div>
      </div>

      <div class="habit-day-detail" id="habitDayDetail">
        CLICK A SQUARE TO SEE WHAT YOU COMPLETED THAT DAY
      </div>
    </section>
  `;

  const cards=(data.habits||[]).map(h=>{
    const set=new Set(h.dates||[]);
    return `
      <section class="habit-analytics-card" style="--habit-accent:${HABIT_COLORS[h.color]||'#8e3e42'}">
        <div class="habit-card-head">
          <div class="habit-card-name">${esc(h.name)}</div>
          <div class="habit-card-rate">${h.rate}% // 13W</div>
        </div>

        <div class="habit-stat-row">
          <div class="habit-stat"><b>${h.currentStreak}</b><span>CURRENT STREAK</span></div>
          <div class="habit-stat"><b>${h.bestStreak}</b><span>BEST STREAK</span></div>
          <div class="habit-stat"><b>${h.thisWeek}</b><span>THIS WEEK</span></div>
          <div class="habit-stat"><b>${h.completions}</b><span>COMPLETIONS</span></div>
        </div>

        ${habitHeatmap(data.days,set,h.name)}
      </section>
    `;
  }).join('');

  root.innerHTML=`
    <div class="habits-page-head">
      <div>
        <div class="page-title">HABITS // 習慣</div>
        <div class="panel-sub" style="margin-top:5px">LOG ON HOME · REVIEW HERE</div>
      </div>
      <button class="ghost-btn" id="refreshHabits">REFRESH</button>
    </div>

    <div class="habit-summary-grid">
      <div class="habit-summary">
        <div class="habit-summary-k">13 WEEK RATE</div>
        <div class="habit-summary-v">${data.completionRate}%</div>
      </div>
      <div class="habit-summary">
        <div class="habit-summary-k">TOTAL COMPLETIONS</div>
        <div class="habit-summary-v">${data.totalCompletions}</div>
      </div>
      <div class="habit-summary">
        <div class="habit-summary-k">ACTIVE HABITS</div>
        <div class="habit-summary-v">${data.habitCount}</div>
      </div>
      <div class="habit-summary">
        <div class="habit-summary-k">WINDOW</div>
        <div class="habit-summary-v">13W</div>
      </div>
    </div>

    ${overall}

    <div class="habit-analytics-grid">
      ${cards}
    </div>
  `;

  document.getElementById('refreshHabits').onclick=async()=>{
    STATE.habitDashboard=null;
    await renderHabitsPage();
  };

  bindHabitCells();
}
function habitHeatmap(days,completedSet,label){
  const weeks=[];for(let i=0;i<days.length;i+=7)weeks.push(days.slice(i,i+7));
  let lastMonth='';
  const months=weeks.map(w=>{const d=new Date(w[0].date+'T12:00:00');const m=new Intl.DateTimeFormat('en-US',{month:'short'}).format(d).toUpperCase();const show=m!==lastMonth;lastMonth=m;return `<div class="heatmap-month">${show?m:''}</div>`}).join('');
  const cells=days.map(d=>{let level=d.level;if(completedSet)level=d.future?-1:(completedSet.has(d.date)?4:0);const detail=completedSet?`${label} // ${d.date} // ${level===4?'COMPLETED':'NOT COMPLETED'}`:`${d.date} // ${d.count} completed${d.habits&&d.habits.length?' // '+d.habits.join(', '):''}`;return `<button class="heat-cell ${d.future?'future':'l'+Math.max(0,level)}" data-habit-detail="${attr(detail)}" title="${attr(detail)}"></button>`}).join('');
  return `<div class="heatmap-wrap"><div class="heatmap-months"><div></div>${months}</div><div class="heatmap-layout"><div class="heatmap-weekdays">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(x=>`<div class="heatmap-weekday">${x}</div>`).join('')}</div><div class="heatmap-grid">${cells}</div></div><div class="heatmap-legend"><span>LESS</span><i class="legend-box l0"></i><i class="legend-box l1"></i><i class="legend-box l2"></i><i class="legend-box l3"></i><i class="legend-box l4"></i><span>MORE</span></div></div>`;
}
function bindHabitCells(){document.querySelectorAll('[data-habit-detail]').forEach(x=>x.onclick=()=>{const target=document.getElementById('habitDayDetail');if(target)target.textContent=x.dataset.habitDetail})}

async function renderCollections(){
  const root=document.getElementById('app');root.innerHTML=`<div class="collections-head"><div><div class="page-title">COLLECTIONS // 収集</div><div class="panel-sub" style="margin-top:5px">LIVE VIEWS FROM YOUR GOOGLE SHEETS</div></div><div class="tabs">${collectionTabs()}</div></div><div id="collectionBody"><div class="loading">LOADING COLLECTION // データ読込</div></div>`;
  bindCollectionTabs();await loadCollection(STATE.collectionTab);
}
function collectionTabs(){return [['wishlist','WISHLIST'],['soccer','SOCCER'],['pokemon','POKÉMON'],['onepiece','ONE PIECE']].map(x=>`<button class="chip ${STATE.collectionTab===x[0]?'active':''}" data-coltab="${x[0]}">${x[1]}</button>`).join('')}
function bindCollectionTabs(){document.querySelectorAll('[data-coltab]').forEach(b=>b.onclick=async()=>{STATE.collectionTab=b.dataset.coltab;document.querySelectorAll('[data-coltab]').forEach(x=>x.classList.toggle('active',x.dataset.coltab===STATE.collectionTab));await loadCollection(STATE.collectionTab)})}
async function loadCollection(kind){const body=document.getElementById('collectionBody');body.innerHTML='<div class="loading">LOADING // 読込中</div>';try{let key=kind;if(kind==='pokemon')key+=':'+STATE.pokemonGen;let data=STATE.collectionCache[key];if(!data){data=await server('getCollectionData',kind,kind==='pokemon'?{generation:STATE.pokemonGen}:{ });STATE.collectionCache[key]=data}renderCollectionData(data)}catch(e){body.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
function renderCollectionData(data){if(data.kind==='wishlist')renderWishlist(data);if(data.kind==='soccer')renderSoccer(data);if(data.kind==='pokemon')renderPokemon(data);if(data.kind==='onepiece')renderOnePiece(data)}
function imgBlock(url,label){return `<div class="image-wrap">${url?`<img loading="lazy" referrerpolicy="no-referrer" src="${attr(url)}" data-original-src="${attr(url)}" alt="${attr(label||'')}">`:`<div class="image-fallback">IMAGE<br>NOT AVAILABLE</div>`}</div>`}
function bindImageFallbacks(){document.querySelectorAll('.image-wrap img[data-original-src]').forEach(img=>{img.onerror=()=>{const original=img.dataset.originalSrc||'';if(img.dataset.fallbackStage!=='cdn'&&original.includes('www.footballkitarchive.com/cdn/')){img.dataset.fallbackStage='cdn';img.src=original.replace('https://www.footballkitarchive.com/cdn/','https://cdn.footballkitarchive.com/');return}const wrap=img.closest('.image-wrap');if(wrap)wrap.innerHTML='<div class="image-fallback">IMAGE<br>NOT AVAILABLE</div>'}})}
function renderWishlist(data){const body=document.getElementById('collectionBody');const cats=['all',...(data.categories||[])];let items=data.items||[];if(STATE.wishlistCategory!=='all')items=items.filter(x=>x.category===STATE.wishlistCategory);body.innerHTML=`<div class="collection-tools">${cats.map(c=>`<button class="chip ${STATE.wishlistCategory===c?'active':''}" data-wcat="${attr(c)}">${esc(c==='all'?'ALL':c.toUpperCase())}</button>`).join('')}</div><div class="card-grid">${items.map(x=>`<article class="visual-card">${imgBlock(x.image,x.name)}<div class="card-content"><div class="card-title">${esc(x.name)}</div><div class="card-meta">${esc(x.category)}${x.store?' · '+esc(x.store):''}</div>${x.price?`<div class="card-price">${esc(x.price)}</div>`:''}${x.link?`<div class="card-actions"><a class="card-link" href="${attr(x.link)}">OPEN ↗</a></div>`:''}</div></article>`).join('')}</div>`;document.querySelectorAll('[data-wcat]').forEach(b=>b.onclick=()=>{STATE.wishlistCategory=b.dataset.wcat;renderWishlist(data)});bindImageFallbacks()}
function renderSoccer(data){document.getElementById('collectionBody').innerHTML=`<div class="collection-tools"><span class="panel-sub">SHEET ORDER // TEAM COLORS PRESERVED AS ACCENTS</span></div><div class="card-grid soccer-grid">${(data.items||[]).map(x=>`<article class="visual-card soccer-card" style="--team:${attr(x.accent)}">${imgBlock(x.image,x.name)}<div class="card-content"><div class="card-title">${esc(x.name)}</div>${x.price?`<div class="card-price">${esc(x.price)}</div>`:''}</div></article>`).join('')}</div>`;bindImageFallbacks()}
function renderPokemon(data){const body=document.getElementById('collectionBody');let items=data.items||[];if(STATE.pokemonFilter==='owned')items=items.filter(x=>x.owned);if(STATE.pokemonFilter==='missing')items=items.filter(x=>!x.owned);body.innerHTML=`<div class="collection-tools"><button class="chip ${STATE.pokemonGen==='all'?'active':''}" data-gen="all">ALL</button>${(data.generations||[]).map(g=>`<button class="chip ${STATE.pokemonGen===g?'active':''}" data-gen="${g}" style="border-bottom-color:${GEN_COLORS[g]}">GEN ${g}</button>`).join('')}<span style="width:8px"></span>${['all','owned','missing'].map(f=>`<button class="chip ${STATE.pokemonFilter===f?'active':''}" data-pfilter="${f}">${f.toUpperCase()}</button>`).join('')}</div><div class="card-grid">${items.map(x=>`<article class="visual-card pokemon-card ${x.owned?'':'dim'}" style="--gen:${GEN_COLORS[x.generation]||'#73777C'}"><div class="status-mark ${x.owned?'owned':'wanted'}">${x.owned?'OWNED':'MISSING'}</div>${imgBlock(x.image,x.entry)}<div class="card-content"><div class="card-title">${esc(x.entry)}</div><div class="card-meta">${esc(x.dex)} · SLOT ${esc(x.slot||'—')}<br>${esc(x.region)} · GEN ${esc(x.generation)}</div>${x.targetCard?`<div class="card-price">${esc(x.targetCard)}${x.price?' · '+esc(x.price):''}</div>`:''}${x.collectr?`<div class="card-actions"><a class="card-link" href="${attr(x.collectr)}">COLLECTR ↗</a></div>`:''}</div></article>`).join('')}</div>`;document.querySelectorAll('[data-gen]').forEach(b=>b.onclick=async()=>{STATE.pokemonGen=b.dataset.gen;await loadCollection('pokemon')});document.querySelectorAll('[data-pfilter]').forEach(b=>b.onclick=()=>{STATE.pokemonFilter=b.dataset.pfilter;renderPokemon(data)});bindImageFallbacks()}
function renderOnePiece(data){const body=document.getElementById('collectionBody');const pages=data.pages||[];const nav=`<button class="chip ${STATE.onePiecePage==='all'?'active':''}" data-oppage="all">ALL</button>${pages.map(p=>`<button class="chip ${String(STATE.onePiecePage)===String(p.page)?'active':''}" data-oppage="${p.page}">${String(p.page).padStart(2,'0')}</button>`).join('')}`;const show=STATE.onePiecePage==='all'?pages:pages.filter(p=>String(p.page)===String(STATE.onePiecePage));body.innerHTML=`<div class="collection-tools">${nav}</div><div class="binder">${show.map(p=>{const owned=p.items.filter(x=>x.owned).length;return `<section class="binder-page"><div class="binder-head"><div class="binder-title">${esc(p.title)}</div><div class="binder-count">${owned}/${p.items.length} OWNED</div></div><div class="binder-grid">${p.items.map(x=>`<article class="visual-card ${x.owned?'':'dim'}"><div class="status-mark ${x.owned?'owned':'wanted'}">${x.owned?'OWNED':'WANTED'}</div>${imgBlock(x.image,x.name)}<div class="card-content"><div class="card-title">${esc(x.name)}</div><div class="card-meta">SLOT ${String(x.position).padStart(2,'0')}${x.set?' · '+esc(x.set):''}${x.affiliation?'<br>'+esc(x.affiliation):''}</div><div class="card-price">${esc(x.engPrice||'')}${x.jpPriceJpy?` · ${esc(x.jpPriceJpy)}`:''}</div><div class="card-actions">${x.tcg?`<a class="card-link" href="${attr(x.tcg)}">ENG ↗</a>`:''}${x.cardrush?`<a class="card-link" href="${attr(x.cardrush)}">JP ↗</a>`:''}</div></div></article>`).join('')}</div></section>`}).join('')}</div>`;document.querySelectorAll('[data-oppage]').forEach(b=>b.onclick=()=>{STATE.onePiecePage=b.dataset.oppage;renderOnePiece(data)});bindImageFallbacks()}

function openQuick(type){STATE.modalType=type;const backdrop=document.getElementById('modalBackdrop'),form=document.getElementById('quickForm'),title=document.getElementById('modalTitle');title.textContent=({task:'NEW TASK // 新規',school_task:'SCHOOL TASK // 学業',note:'NEW NOTE // メモ',wishlist:'WISHLIST // 欲しい物'})[type]||'NEW ITEM';form.innerHTML=quickFields(type);backdrop.classList.add('open');setTimeout(()=>form.querySelector('input')?.focus(),40)}
function quickFields(type){if(type==='task'||type==='school_task')return `<div class="field full"><label>Task</label><input name="title" required></div><div class="field"><label>Due</label><input name="due" type="date"></div><div class="field"><label>Priority</label><select name="priority"><option value="">None</option><option>High</option><option>Medium</option><option>Low</option></select></div>${type==='task'?`<div class="field"><label>Area</label><select name="area"><option>Personal</option><option>School</option><option>Health</option><option>Projects</option><option>Collections</option></select></div>`:''}<div class="field full"><label>Details</label><textarea name="details"></textarea></div>`;if(type==='note')return `<div class="field full"><label>Title</label><input name="title" required></div><div class="field"><label>Area</label><select name="area"><option>Personal</option><option>School</option><option>Health</option><option>Projects</option><option>Collections</option></select></div><div class="field"><label>Type</label><select name="noteType"><option>Reference</option><option>Plan</option><option>Research</option><option>Decision</option><option>Test Result</option><option>Meeting Note</option><option>Journal</option></select></div><div class="field full"><label>Body</label><textarea name="body"></textarea></div>`;return `<div class="field full"><label>Item</label><input name="title" required></div><div class="field"><label>Category</label><input name="category" placeholder="Disc Golf, Tech, Clothing…"></div><div class="field"><label>Price</label><input name="price" placeholder="$99.99"></div><div class="field"><label>Store</label><input name="store"></div><div class="field"><label>Want level</label><select name="wantLevel"><option>Interested</option><option>High</option><option>Maybe</option></select></div><div class="field full"><label>Link</label><input name="link" type="url"></div>`}
function closeModal(){document.getElementById('modalBackdrop').classList.remove('open');STATE.modalType=null}
document.getElementById('modalClose').onclick=closeModal;document.getElementById('modalCancel').onclick=e=>{e.preventDefault();closeModal()};document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
document.getElementById('modalSave').onclick=async e=>{e.preventDefault();const form=document.getElementById('quickForm');const fd=new FormData(form),payload={};for(const[k,v]of fd.entries())payload[k]=v;const btn=e.currentTarget;btn.disabled=true;btn.textContent='SAVING…';try{await server('createQuickItem',STATE.modalType,payload);closeModal();if(STATE.modalType==='wishlist'){STATE.collectionCache={};}STATE.bootstrap=await server('getBootstrapData');if(STATE.route==='home')renderHome();else await renderCollections()}catch(err){alert(err.message)}finally{btn.disabled=false;btn.textContent='SAVE'}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key.toLowerCase()==='h')navigate('habits');if(e.key.toLowerCase()==='c')navigate('collections')});

init();