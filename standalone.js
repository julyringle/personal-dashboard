(()=>{
  const CONFIG_KEY='pdStandaloneConfigV1';
  const TOKEN_KEY='pdStandaloneTokenV1';
  const DEFAULT_CLIENT_ID='768938791390-06nk1l8csltji5vsmah53oub1kninm1b.apps.googleusercontent.com';
  const DEFAULT_SCRIPT_ID='1PzhUVJDtTUuoBiG6k5jamDylCbGisMfEjdkc71do4mU_i1qaeT0Y0OOQ';
  const DASHBOARD_SHEET_ID='1YO8y-6BI_9caO1hOmU5vSF8xQzZFId6q6Pj8gJSGZfg';
  const OFFLINE_DB='pdOfflineV1';
  const LAST_SYNC_KEY='pdLastSyncAtV1';
  const LAST_DAY_KEY='pdLastDayKeyV1';
  const BRIDGE_CONFIG_KEY='pdBridgeConfigV1';
  const DEFAULT_BRIDGE_URL='https://script.google.com/macros/s/AKfycbyEuDlaExgHOHgpj_dfRkJnoDLD-z_ijobrcTiou3_9dhFLiQYzo3nIAq-u04aVpWiy/exec';
  const SCOPES=[
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request'
  ].join(' ');
  let gate=null,configPromise=null,authPromise=null,bridgeFrame=null,bridgeReadyPromise=null,bridgePeer=null,bridgePeerOrigin='*',bridgeSeq=0;
  const bridgePending=new Map();

  function inAppsScriptHost(){
    return typeof google!=='undefined' && google.script && google.script.run;
  }
  if(inAppsScriptHost()) return;

  window.__DASHBOARD_STANDALONE__=true;
  function savedBridgeConfig(){
    try{
      const x=JSON.parse(localStorage.getItem(BRIDGE_CONFIG_KEY)||'null');
      if(x&&x.url&&x.key)return x;
    }catch(e){}
    return null;
  }
  function normalizeBridgeUrl(url){
    let s=String(url||'').trim();
    if(!s)return'';
    try{
      const u=new URL(s);
      u.search='';u.hash='';
      s=u.toString().replace(/\/$/,'');
    }catch(e){}
    return s;
  }
  function clearBridgeFrame(){
    bridgePending.forEach(p=>p.reject(new Error('Dashboard API reset.')));
    bridgePending.clear();
    if(bridgeFrame){try{bridgeFrame.remove()}catch(e){}}
    bridgeFrame=null;bridgeReadyPromise=null;bridgePeer=null;bridgePeerOrigin='*';
  }
  function saveBridgeConfig(url,key){
    const cfg={url:normalizeBridgeUrl(url||DEFAULT_BRIDGE_URL),key:String(key||'').trim()};
    if(!cfg.url||!/\/exec$/.test(cfg.url))throw new Error('Use the Apps Script Web app URL ending in /exec.');
    if(cfg.key.length<12)throw new Error('Dashboard key looks too short.');
    localStorage.setItem(BRIDGE_CONFIG_KEY,JSON.stringify(cfg));
    window.dashboardBridgeActive=true;
    return cfg;
  }
  function dashboardApiRead(method,args){
    const cfg=savedBridgeConfig();
    if(!cfg)return Promise.reject(new Error('Dashboard backend is not configured.'));
    return new Promise((resolve,reject)=>{
      const id='__pdcb'+Date.now().toString(36)+(++bridgeSeq).toString(36);
      const script=document.createElement('script');
      const timer=setTimeout(()=>{
        try{delete window[id]}catch(e){}
        try{script.remove()}catch(e){}
        reject(new Error('Dashboard backend did not respond. Check the Web app deployment and key.'));
      },15000);
      window[id]=(payload)=>{
        clearTimeout(timer);
        try{delete window[id]}catch(e){}
        try{script.remove()}catch(e){}
        if(payload&&payload.ok)resolve(payload.result);
        else reject(new Error(payload&&payload.error?payload.error:'Dashboard backend request failed.'));
      };
      const q=new URLSearchParams({
        mode:'api',
        key:cfg.key,
        method:String(method||''),
        payload:JSON.stringify(args||[]),
        callback:id,
        _t:String(Date.now())
      });
      script.async=true;
      script.onerror=()=>{
        clearTimeout(timer);
        try{delete window[id]}catch(e){}
        try{script.remove()}catch(e){}
        reject(new Error('Dashboard backend could not be loaded.'));
      };
      script.src=cfg.url+'?'+q.toString();
      document.head.appendChild(script);
    });
  }
  async function dashboardApiWrite(method,args){
    const cfg=savedBridgeConfig();
    if(!cfg)throw new Error('Dashboard backend is not configured.');
    const body=new URLSearchParams({
      mode:'api',
      key:cfg.key,
      method:String(method||''),
      payload:JSON.stringify(args||[])
    });
    await fetch(cfg.url,{
      method:'POST',
      mode:'no-cors',
      cache:'no-store',
      credentials:'omit',
      redirect:'follow',
      body
    });
    if(method==='toggleHabit'){
      const p=args&&args[0]||{},habits=await dashboardApiRead('getLiveHabits',[]);
      const h=(habits||[]).find(x=>String(x.cardId)===String(p.cardId));
      return {done:Boolean(h&&h.done),logId:h&&h.logId||null};
    }
    if(method==='toggleTask'){
      const id=args&&args[0],data=await dashboardApiRead('getTaskDashboardData',[]);
      const all=[...(data&&data.open||[]),...(data&&data.completed||[])];
      const t=all.find(x=>String(x.id)===String(id));
      return {ok:true,id,done:Boolean(t&&t.done)};
    }
    if(method==='setHabitState'){
      const p=args&&args[0]||{},habits=await dashboardApiRead('getLiveHabits',[]);
      const h=(habits||[]).find(x=>String(x.cardId)===String(p.cardId));
      return {done:Boolean(h&&h.done),logId:h&&h.logId||null};
    }
    return {ok:true};
  }
  async function bridgeCall(method,args){
    const writes=new Set(['toggleHabit','setHabitState','toggleTask','updateTask','deleteTask','createQuickItem']);
    return writes.has(method)?dashboardApiWrite(method,args||[]):dashboardApiRead(method,args||[]);
  }
  window.dashboardBridgeActive=Boolean(savedBridgeConfig());

  function savedConfig(){
    try{
      const x=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');
      if(x&&x.clientId&&x.scriptId) return x;
    }catch(e){}
    return {clientId:DEFAULT_CLIENT_ID,scriptId:DEFAULT_SCRIPT_ID};
  }
  function savedToken(){
    try{
      const x=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null');
      return x&&x.accessToken&&x.expiresAt>Date.now()+60000?x:null;
    }catch(e){return null}
  }
  function ensureGate(){
    if(gate) return gate;
    gate=document.createElement('div');
    gate.id='standaloneGate';
    gate.innerHTML='<div class="standalone-gate-card" id="standaloneGateCard"></div>';
    document.body.appendChild(gate);
    return gate;
  }
  function hideGate(){
    if(gate) gate.classList.remove('open');
  }
  function showCard(html){
    ensureGate();
    document.getElementById('standaloneGateCard').innerHTML=html;
    gate.classList.add('open');
  }
  function waitForGIS(){
    return new Promise((resolve,reject)=>{
      const start=Date.now();
      const tick=()=>{
        if(typeof google!=='undefined'&&google.accounts&&google.accounts.oauth2) return resolve();
        if(Date.now()-start>15000) return reject(new Error('Google sign-in failed to load. Check your connection and reload.'));
        setTimeout(tick,100);
      };
      tick();
    });
  }
  function ensureConfig(){
    const cfg=savedConfig();
    localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg));
    return Promise.resolve(cfg);
  }
  function saveTokenResponse(resp){
    if(!resp||resp.error)throw new Error((resp&&resp.error_description)||(resp&&resp.error)||'Google authorization failed.');
    const token={accessToken:resp.access_token,expiresAt:Date.now()+(Number(resp.expires_in||3600)*1000)};
    localStorage.setItem(TOKEN_KEY,JSON.stringify(token));
    hideGate();
    return token;
  }
  async function requestTokenSilent(cfg){
    await waitForGIS();
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};
      const client=google.accounts.oauth2.initTokenClient({
        client_id:cfg.clientId,
        scope:SCOPES,
        callback:(resp)=>{
          try{
            if(resp&&resp.error)return finish(reject,new Error(resp.error_description||resp.error));
            finish(resolve,saveTokenResponse(resp));
          }catch(e){finish(reject,e)}
        },
        error_callback:(err)=>finish(reject,new Error(err&&err.message?err.message:'Silent Google authorization was unavailable.'))
      });
      const timer=setTimeout(()=>finish(reject,new Error('Silent Google authorization timed out.')),7000);
      try{client.requestAccessToken({prompt:''})}catch(e){finish(reject,e)}
    });
  }
  async function requestTokenInteractive(cfg){
    await waitForGIS();
    return new Promise((resolve,reject)=>{
      showCard(`
        <div class="standalone-kicker">PRIVATE DASHBOARD // 認証</div>
        <h1>Reconnect Google</h1>
        <p>Your saved dashboard can still open, but live Calendar and Sheets data need Google access.</p>
        <button id="standaloneGoogleSignIn" class="standalone-primary">RECONNECT GOOGLE</button>
        <div class="standalone-note">This should only appear when Google cannot silently renew access.</div>
      `);
      document.getElementById('standaloneGoogleSignIn').onclick=()=>{
        let settled=false;
        const finish=(fn,value)=>{if(settled)return;settled=true;fn(value)};
        const client=google.accounts.oauth2.initTokenClient({
          client_id:cfg.clientId,
          scope:SCOPES,
          callback:(resp)=>{
            try{
              if(resp&&resp.error)return finish(reject,new Error(resp.error_description||resp.error));
              finish(resolve,saveTokenResponse(resp));
            }catch(e){finish(reject,e)}
          },
          error_callback:(err)=>finish(reject,new Error(err&&err.message?err.message:'Google sign-in was cancelled.'))
        });
        try{client.requestAccessToken({prompt:''})}catch(e){finish(reject,e)}
      };
    });
  }
  async function ensureToken(cfg,interactive){
    const existing=savedToken();
    if(existing)return existing;
    if(authPromise){
      try{return await authPromise}catch(e){if(!interactive)throw e}
    }
    authPromise=requestTokenSilent(cfg).finally(()=>{authPromise=null});
    try{return await authPromise}catch(silentErr){
      if(!interactive)throw silentErr;
      return requestTokenInteractive(cfg);
    }
  }
  async function execute(cfg,token,method,args){
    const response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(cfg.scriptId)+':run',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token.accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({function:method,parameters:args||[]})
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401||response.status===403){
      const err=new Error((data.error&&data.error.message)||'Google authorization expired.');
      err.auth=true;throw err;
    }
    if(!response.ok) throw new Error((data.error&&data.error.message)||('Google API error '+response.status));
    if(data.error){
      const detail=data.error.details&&data.error.details[0];
      throw new Error((detail&&detail.errorMessage)||data.error.message||'Apps Script execution failed.');
    }
    return data.response?data.response.result:null;
  }


  function boolish(v){
    return v===true||String(v||'').toUpperCase()==='TRUE'||String(v||'')==='1';
  }
  function dateKeyCentral(d){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const obj={};parts.forEach(p=>{if(p.type!=='literal')obj[p.type]=p.value});
    return obj.year+'-'+obj.month+'-'+obj.day;
  }
  function normalizeDateKey(v){
    if(!v)return'';
    const s=String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    const d=new Date(s);
    return isNaN(d)?s.slice(0,10):dateKeyCentral(d);
  }
  function advanceRepeatDate(dateKey,repeat){
    const p=String(dateKey||'').split('-').map(Number);
    if(p.length!==3||p.some(x=>!x))return'';
    const d=new Date(Date.UTC(p[0],p[1]-1,p[2],12));
    const k=String(repeat||'').toLowerCase();
    if(k==='daily')d.setUTCDate(d.getUTCDate()+1);
    else if(k==='weekly')d.setUTCDate(d.getUTCDate()+7);
    else if(k==='monthly')d.setUTCMonth(d.getUTCMonth()+1);
    else if(k==='yearly')d.setUTCFullYear(d.getUTCFullYear()+1);
    else return'';
    return d.toISOString().slice(0,10);
  }
  async function sheetsApiFor(token,spreadsheetId,path,options={}){
    const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId)+'/'+path,{
      method:options.method||'GET',
      headers:{'Authorization':'Bearer '+token.accessToken,'Content-Type':'application/json'},
      body:options.body===undefined?undefined:JSON.stringify(options.body)
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401||response.status===403){const err=new Error((data.error&&data.error.message)||'Google authorization expired.');err.auth=true;throw err}
    if(!response.ok)throw new Error((data.error&&data.error.message)||('Google Sheets API error '+response.status));
    return data;
  }
  async function sheetsApi(token,path,options={}){
    return sheetsApiFor(token,DASHBOARD_SHEET_ID,path,options);
  }
  async function healthSheetValues(token){
    const data=await sheetsApi(token,'values/'+encodeURIComponent('Health!A:R'));
    return data.values||[];
  }
  function healthSummaryFromValues(values){
    if(!values.length)return null;
    const h=taskHeaderMap(values);
    const num=v=>{if(v===undefined||v===null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
    const rows=values.slice(1).filter(row=>{
      const type=String(row[h['Type']]||'');
      return !type||type==='Daily Check-In';
    }).map(row=>({
      date:normalizeDateKey(row[h['Date']]),
      weight:num(row[h['Morning Weight (lb)']]),
      sleepHours:num(row[h['Sleep Hours']]),
      sleepScore:num(row[h['Sleep Score']]),
      hrv:num(row[h['HRV']]),
      restingHR:num(row[h['Resting HR']]),
      steps:num(row[h['Steps']]),
      protein:num(row[h['Protein (g)']]),
      bodyBattery:num(row[h['Body Battery']]),
      energy:num(row[h['Energy']]),
      stress:num(row[h['Stress']]),
      soreness:num(row[h['Soreness']]),
      mood:String(row[h['Mood']]||''),
      calories:num(row[h['Calories']]),
      carbs:num(row[h['Carbs (g)']]),
      fat:num(row[h['Fat (g)']])
    })).filter(x=>x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(!rows.length)return null;
    const todayKey=dateKeyCentral(new Date());
    const today=rows.find(x=>x.date===todayKey)||{
      date:todayKey,weight:null,sleepHours:null,sleepScore:null,hrv:null,restingHR:null,steps:null,
      protein:null,bodyBattery:null,energy:null,stress:null,soreness:null,mood:'',calories:null,carbs:null,fat:null
    };
    const hasRecovery=x=>[x.weight,x.sleepHours,x.sleepScore,x.hrv,x.restingHR,x.steps,x.bodyBattery].some(v=>v!==null);
    const latest=rows.find(hasRecovery)||rows[0];
    const weights=rows.filter(x=>x.weight!==null);
    const latestWeight=weights[0]||null,oldestWeight=weights.length?weights[weights.length-1]:null;
    return {
      latest,
      today,
      weightTrend30d:latestWeight&&oldestWeight?Math.round((latestWeight.weight-oldestWeight.weight)*10)/10:null,
      series:rows.slice().reverse()
    };
  }
  async function getNutritionTodayDirect(token,sourceId){
    if(!sourceId)return null;
    const data=await sheetsApiFor(token,sourceId,'values/'+encodeURIComponent('Nutrition Daily!A:Q'));
    const values=data.values||[];if(values.length<2)return null;
    const h=taskHeaderMap(values),today=dateKeyCentral(new Date());
    const row=values.slice(1).find(r=>normalizeDateKey(r[h['Date']])===today);if(!row)return null;
    const num=v=>{if(v===undefined||v===null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
    return {date:today,calories:num(row[h['Energy (kcal)']]),protein:num(row[h['Protein (g)']]),carbs:num(row[h['Carbs (g)']]),fat:num(row[h['Fat (g)']])};
  }
  async function getHealthSummaryDirect(token,sourceId){
    const health=healthSummaryFromValues(await healthSheetValues(token));
    if(!health)return health;
    try{
      const nutrition=await getNutritionTodayDirect(token,sourceId);
      if(nutrition){
        health.today={...(health.today||{date:nutrition.date}),...nutrition};
        const blank={date:nutrition.date,weight:null,sleepHours:null,sleepScore:null,hrv:null,restingHR:null,steps:null,protein:null,bodyBattery:null,energy:null,stress:null,soreness:null,mood:'',calories:null,carbs:null,fat:null};
        let found=false;
        health.series=(health.series||[]).map(row=>{
          if(row.date!==nutrition.date)return row;
          found=true;
          return {...row,...nutrition};
        });
        if(!found)health.series.push({...blank,...nutrition});
        health.series.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      }
    }catch(e){}
    return health;
  }

  async function taskSheetValues(token){
    const data=await sheetsApi(token,'values/'+encodeURIComponent('Tasks!A:M'));
    return data.values||[];
  }
  function taskHeaderMap(values){
    const h=(values[0]||[]).map(String),m={};h.forEach((x,i)=>m[x]=i);return m;
  }
  function taskFromValues(row,h){
    const get=name=>row[h[name]]===undefined?'':row[h[name]];
    return {
      id:String(get('ID')||''),url:'',title:String(get('Task')||''),status:String(get('Status')||''),
      priority:String(get('Priority')||''),area:String(get('Area')||''),due:get('Due')?normalizeDateKey(get('Due')):null,
      done:boolish(get('Done')),details:String(get('Details')||''),course:String(get('Course')||''),
      repeat:String(get('Repeat')||''),repeatUntil:get('Repeat Until')?normalizeDateKey(get('Repeat Until')):null,
      completedAt:get('Completed At')?String(get('Completed At')):null
    };
  }
  async function batchTaskUpdates(token,data){
    if(!data.length)return;
    await sheetsApi(token,'values:batchUpdate',{method:'POST',body:{valueInputOption:'USER_ENTERED',data}});
  }
  async function rollRecurringTasksDirect(token){
    const values=await taskSheetValues(token);if(values.length<2)return;
    const h=taskHeaderMap(values),today=dateKeyCentral(new Date()),updates=[];
    for(let i=1;i<values.length;i++){
      const row=values[i],repeat=String(row[h['Repeat']]||''),due=normalizeDateKey(row[h['Due']]),done=boolish(row[h['Done']]),completedDay=normalizeDateKey(row[h['Completed At']]);
      if(!repeat||!due||!done||due>=today||(completedDay&&completedDay>=today))continue;
      let next=due;
      do{next=advanceRepeatDate(next,repeat)}while(next&&next<today);
      const until=normalizeDateKey(row[h['Repeat Until']]);
      const n=i+1;
      if(!next||(until&&next>until)){
        updates.push({range:'Tasks!C'+n,values:[['Archived']]});
      }else{
        updates.push({range:'Tasks!C'+n,values:[['To Do']]});
        updates.push({range:'Tasks!F'+n,values:[[next]]});
        updates.push({range:'Tasks!G'+n,values:[[false]]});
        updates.push({range:'Tasks!M'+n,values:[['']]});
      }
    }
    await batchTaskUpdates(token,updates);
  }
  async function getTaskDashboardDataDirect(token){
    await rollRecurringTasksDirect(token);
    const values=await taskSheetValues(token),h=taskHeaderMap(values),today=dateKeyCentral(new Date());
    const all=values.slice(1).map(r=>taskFromValues(r,h)).filter(t=>t.title&&t.status!=='Archived');
    const rank={High:0,Medium:1,Low:2};
    const open=all.filter(t=>!t.done&&t.status!=='Done').sort((a,b)=>{
      const ad=a.due||'9999-12-31',bd=b.due||'9999-12-31';
      return ad!==bd?ad.localeCompare(bd):(rank[a.priority]??9)-(rank[b.priority]??9);
    });
    const completed=all.filter(t=>t.done||t.status==='Done').sort((a,b)=>String(b.completedAt||b.due||'').localeCompare(String(a.completedAt||a.due||''))).slice(0,40);
    return {today,open,completed};
  }
  async function toggleTaskDirect(token,taskId){
    const values=await taskSheetValues(token),h=taskHeaderMap(values),id=String(taskId||'');
    for(let i=1;i<values.length;i++){
      if(String(values[i][h['ID']]||'')!==id)continue;
      const nowDone=!boolish(values[i][h['Done']]),n=i+1;
      await batchTaskUpdates(token,[
        {range:'Tasks!C'+n,values:[[nowDone?'Done':'To Do']]},
        {range:'Tasks!G'+n,values:[[nowDone]]},
        {range:'Tasks!M'+n,values:[[nowDone?new Date().toISOString():'']]}
      ]);
      return {ok:true,id,done:nowDone};
    }
    throw new Error('Task not found.');
  }
  async function createTaskDirect(token,type,payload){
    payload=payload||{};const title=String(payload.title||'').trim();if(!title)throw new Error('Task title is required.');
    const row=[
      (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(16).slice(2)),
      title,'To Do',payload.priority||'',type==='school_task'?'School':(payload.area||'Personal'),payload.due||'',false,
      payload.details||'',payload.course||'','',payload.repeat||'',payload.repeatUntil||'',''
    ];
    await sheetsApi(token,'values/'+encodeURIComponent('Tasks!A:M')+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',{method:'POST',body:{values:[row]}});
    return {ok:true,id:row[0]};
  }

  async function updateTaskDirect(token,taskId,payload){
    payload=payload||{};
    const values=await taskSheetValues(token),h=taskHeaderMap(values),id=String(taskId||'');
    for(let i=1;i<values.length;i++){
      if(String(values[i][h['ID']]||'')!==id)continue;
      const n=i+1,row=values[i],wasDone=boolish(row[h['Done']]);
      const done=payload.done===undefined?wasDone:boolish(payload.done);
      const completed=done?(row[h['Completed At']]||new Date().toISOString()):'';
      const updates=[
        {range:'Tasks!B'+n,values:[[String(payload.title??row[h['Task']]??'').trim()]]},
        {range:'Tasks!C'+n,values:[[done?'Done':'To Do']]},
        {range:'Tasks!D'+n,values:[[payload.priority??row[h['Priority']]??'']]},
        {range:'Tasks!E'+n,values:[[payload.area??row[h['Area']]??'']]},
        {range:'Tasks!F'+n,values:[[payload.due??normalizeDateKey(row[h['Due']])??'']]},
        {range:'Tasks!G'+n,values:[[done]]},
        {range:'Tasks!H'+n,values:[[payload.details??row[h['Details']]??'']]},
        {range:'Tasks!I'+n,values:[[payload.course??row[h['Course']]??'']]},
        {range:'Tasks!K'+n,values:[[payload.repeat??row[h['Repeat']]??'']]},
        {range:'Tasks!L'+n,values:[[payload.repeatUntil??normalizeDateKey(row[h['Repeat Until']])??'']]},
        {range:'Tasks!M'+n,values:[[completed]]}
      ];
      await batchTaskUpdates(token,updates);
      return {ok:true,id,done};
    }
    throw new Error('Task not found.');
  }

  async function deleteTaskDirect(token,taskId){
    const values=await taskSheetValues(token),h=taskHeaderMap(values),id=String(taskId||'');
    for(let i=1;i<values.length;i++){
      if(String(values[i][h['ID']]||'')!==id)continue;
      const n=i+1;
      await batchTaskUpdates(token,[
        {range:'Tasks!C'+n,values:[['Archived']]},
        {range:'Tasks!G'+n,values:[[true]]},
        {range:'Tasks!M'+n,values:[[new Date().toISOString()]]}
      ]);
      return {ok:true,id,deleted:true};
    }
    throw new Error('Task not found.');
  }


  function openOfflineDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(OFFLINE_DB,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache',{keyPath:'key'});
        if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'id',autoIncrement:true});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function dbGet(store,key){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readonly').objectStore(store).get(key);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }
  async function dbPut(store,value){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).put(value);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function dbAdd(store,value){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).add(value);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function dbDelete(store,key){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).delete(key);
      req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error);
    });
  }
  async function dbAll(store){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readonly').objectStore(store).getAll();
      req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
    });
  }
  function cacheKey(method,args){return method+'::'+JSON.stringify(args||[])}
  const CACHEABLE=new Set(['getBootstrapData','getTaskDashboardData','getCalendarWeek','getHabitDashboardData','getCollectionData']);
  async function readCached(method,args){return dbGet('cache',cacheKey(method,args))}
  async function writeCached(method,args,value){
    await dbPut('cache',{key:cacheKey(method,args),method,args:args||[],value,at:Date.now()});
  }
  async function queueCount(){return (await dbAll('queue')).length}
  function setLastSync(){localStorage.setItem(LAST_SYNC_KEY,String(Date.now()))}
  function emitState(extra={}){
    const state={
      online:navigator.onLine,
      queued:0,
      lastSync:Number(localStorage.getItem(LAST_SYNC_KEY)||0)||null,
      needsAuth:!savedBridgeConfig()&&!savedToken()&&navigator.onLine,
      fromCache:false,
      ...extra
    };
    window.dashboardOfflineState=state;
    queueCount().then(n=>{
      state.queued=n;window.dashboardOfflineState=state;
      window.dispatchEvent(new CustomEvent('dashboard-sync-state',{detail:state}));
    }).catch(()=>window.dispatchEvent(new CustomEvent('dashboard-sync-state',{detail:state})));
  }
  function cloneValue(v){return v==null?v:JSON.parse(JSON.stringify(v))}
  function blankHealthToday(day){
    return {date:day,weight:null,sleepHours:null,sleepScore:null,hrv:null,restingHR:null,steps:null,
      protein:null,bodyBattery:null,energy:null,stress:null,soreness:null,mood:'',calories:null,carbs:null,fat:null};
  }
  function normalizeCachedValue(method,record){
    const value=cloneValue(record&&record.value);
    if(!record||!value)return value;
    const today=dateKeyCentral(new Date());
    const recordDay=record.at?dateKeyCentral(new Date(record.at)):'';
    if(recordDay===today)return value;
    if(method==='getBootstrapData'){
      if(Array.isArray(value.habits))value.habits=value.habits.map(h=>({...h,done:false,logId:null}));
      if(value.health)value.health={...value.health,today:blankHealthToday(today)};
      if(value.calendar){
        const now=Date.now(),ws=Date.parse(value.calendar.weekStart||''),we=Date.parse(value.calendar.weekEnd||'');
        if(!Number.isFinite(ws)||!Number.isFinite(we)||now<ws||now>=we)value.calendar=null;
      }
    }else if(method==='getCalendarWeek'&&value){
      const now=Date.now(),ws=Date.parse(value.weekStart||''),we=Date.parse(value.weekEnd||'');
      if((args=>Array.isArray(args)&&Number(args[0]||0)===0)(record.args)&&(!Number.isFinite(ws)||!Number.isFinite(we)||now<ws||now>=we))return null;
    }else if(method==='getHabitDashboardData'&&value&&Array.isArray(value.days)){
      value.days=value.days.map(d=>{
        if(!d||!d.date)return d;
        if(d.date===today)return {...d,future:false};
        return {...d,future:String(d.date)>today};
      });
    }
    return value;
  }
  async function rollCachedDayForward(){
    const today=dateKeyCentral(new Date());
    const previous=localStorage.getItem(LAST_DAY_KEY)||'';
    if(previous===today)return false;
    localStorage.setItem(LAST_DAY_KEY,today);
    const rec=await readCached('getBootstrapData',[]);
    if(rec&&rec.value){
      const value=normalizeCachedValue('getBootstrapData',rec);
      await dbPut('cache',{...rec,value,at:Date.now()});
    }
    return true;
  }
  function patchTaskTree(value,id,mode,payload){
    if(Array.isArray(value)){
      const out=[];
      value.forEach(item=>{
        const p=patchTaskTree(item,id,mode,payload);
        if(p!==null)out.push(p);
      });
      return out;
    }
    if(!value||typeof value!=='object')return value;
    if(String(value.id||'')===String(id)&&('title'in value||'done'in value)){
      if(mode==='delete')return null;
      const x={...value};
      if(mode==='toggle'){x.done=!x.done;x.status=x.done?'Done':'To Do';x.completedAt=x.done?new Date().toISOString():null;}
      if(mode==='update'){
        if(payload.title!==undefined)x.title=payload.title;
        if(payload.priority!==undefined)x.priority=payload.priority;
        if(payload.area!==undefined)x.area=payload.area;
        if(payload.due!==undefined)x.due=payload.due||null;
        if(payload.details!==undefined)x.details=payload.details;
        if(payload.course!==undefined)x.course=payload.course;
        if(payload.repeat!==undefined)x.repeat=payload.repeat;
        if(payload.repeatUntil!==undefined)x.repeatUntil=payload.repeatUntil||null;
        if(payload.done!==undefined){x.done=boolish(payload.done);x.status=x.done?'Done':'To Do';x.completedAt=x.done?(x.completedAt||new Date().toISOString()):null;}
      }
      return x;
    }
    const out={};
    Object.keys(value).forEach(k=>{out[k]=patchTaskTree(value[k],id,mode,payload)});
    return out;
  }
  async function mutateCaches(mutator){
    const records=await dbAll('cache');
    for(const rec of records){
      const value=mutator(cloneValue(rec.value),rec);
      if(value!==undefined)await dbPut('cache',{...rec,value,at:Date.now()});
    }
  }
  async function patchTaskCaches(id,mode,payload={}){
    await mutateCaches(value=>patchTaskTree(value,id,mode,payload));
  }
  async function findCachedTask(id){
    const rec=await readCached('getTaskDashboardData',[]);
    if(rec&&rec.value){
      const all=[...(rec.value.open||[]),...(rec.value.completed||[])];
      const t=all.find(x=>String(x.id)===String(id));if(t)return t;
    }
    const boot=await readCached('getBootstrapData',[]);
    if(boot&&boot.value){
      const all=[...(boot.value.focus||[]),...(boot.value.school||[]),...(boot.value.projectTasks||[])];
      return all.find(x=>String(x.id)===String(id))||null;
    }
    return null;
  }
  async function patchHabitCaches(cardId,desiredDone){
    await mutateCaches(value=>{
      function walk(v){
        if(Array.isArray(v))return v.map(walk);
        if(!v||typeof v!=='object')return v;
        const x={...v};
        if(String(x.cardId||'')===String(cardId)&&'done'in x){x.done=desiredDone;x.logId=desiredDone?('offline-'+Date.now()):null;}
        Object.keys(x).forEach(k=>{if(k!=='cardId'&&k!=='done'&&k!=='logId')x[k]=walk(x[k])});
        return x;
      }
      return walk(value);
    });
  }
  async function addTaskToCaches(task){
    const rec=await readCached('getTaskDashboardData',[]);
    if(rec&&rec.value){
      const v=cloneValue(rec.value);v.open=[task,...(v.open||[])];await writeCached('getTaskDashboardData',[],v);
    }
    const boot=await readCached('getBootstrapData',[]);
    if(boot&&boot.value){
      const v=cloneValue(boot.value);
      if(task.due)v.focus=[task,...(v.focus||[])].slice(0,25);
      if(task.area==='School')v.school=[task,...(v.school||[])];
      if(task.area==='Projects')v.projectTasks=[task,...(v.projectTasks||[])];
      await writeCached('getBootstrapData',[],v);
    }
  }
  async function queueWrite(method,args){
    await dbAdd('queue',{method,args:args||[],createdAt:Date.now()});
    emitState({fromCache:true});
  }
  async function offlineWrite(method,args){
    if(method==='toggleTask'){
      const id=args&&args[0],task=await findCachedTask(id);if(!task)throw new Error('Task is not available offline yet.');
      const done=!task.done;await patchTaskCaches(id,'toggle');await queueWrite(method,args);return{ok:true,id,done,offline:true};
    }
    if(method==='updateTask'){
      const id=args&&args[0],payload=(args&&args[1])||{};
      await patchTaskCaches(id,'update',payload);await queueWrite(method,args);return{ok:true,id,done:boolish(payload.done),offline:true};
    }
    if(method==='deleteTask'){
      const id=args&&args[0];await patchTaskCaches(id,'delete');await queueWrite(method,args);return{ok:true,id,deleted:true,offline:true};
    }
    if(method==='toggleHabit'){
      const payload=(args&&args[0])||{},boot=await readCached('getBootstrapData',[]);
      const h=boot&&boot.value&&(boot.value.habits||[]).find(x=>String(x.cardId)===String(payload.cardId));
      if(!h)throw new Error('Habit is not available offline yet.');
      const desiredDone=!h.done;
      await patchHabitCaches(payload.cardId,desiredDone);
      await queueWrite('setHabitState',[{cardId:payload.cardId,habitId:payload.habitId,desiredDone}]);
      return{done:desiredDone,logId:desiredDone?('offline-'+Date.now()):null,offline:true};
    }
    if(method==='createQuickItem'&&args&&['task','school_task'].includes(String(args[0]||'').toLowerCase())){
      const type=String(args[0]).toLowerCase(),p=args[1]||{},id=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(16).slice(2));
      const task={id,title:String(p.title||'').trim(),status:'To Do',priority:p.priority||'',area:type==='school_task'?'School':(p.area||'Personal'),due:p.due||null,done:false,details:p.details||'',course:p.course||'',repeat:p.repeat||'',repeatUntil:p.repeatUntil||null,completedAt:null};
      if(!task.title)throw new Error('Task title is required.');
      await addTaskToCaches(task);await queueWrite(method,[type,{...p,__offlineId:id}]);return{ok:true,id,offline:true};
    }
    throw new Error('This action needs an internet connection.');
  }
  async function flushQueueBridge(){
    const items=(await dbAll('queue')).sort((a,b)=>Number(a.id)-Number(b.id));
    for(const item of items){
      const method=item.method==='setHabitState'?'setHabitState':item.method;
      let args=item.args||[];
      if(method==='createQuickItem'&&args[1]&&typeof args[1]==='object'){
        const p={...args[1]};delete p.__offlineId;args=[args[0],p];
      }
      await bridgeCall(method,args);
      await dbDelete('queue',item.id);
    }
    if(items.length)setLastSync();
    emitState({needsAuth:false,fromCache:false});
    return items.length;
  }
  async function performQueued(cfg,token,item){
    if(item.method==='setHabitState'){
      const wanted=(item.args&&item.args[0])||{};
      const boot=await execute(cfg,token,'getBootstrapData',[]);
      const h=(boot.habits||[]).find(x=>String(x.cardId)===String(wanted.cardId));
      if(h&&Boolean(h.done)!==Boolean(wanted.desiredDone)){
        await execute(cfg,token,'toggleHabit',[{cardId:h.cardId,habitId:h.habitId,logId:h.logId}]);
      }
      return{ok:true};
    }
    return performOnlineWrite(cfg,token,item.method,item.args||[]);
  }
  async function flushQueue(cfg,token){
    const items=(await dbAll('queue')).sort((a,b)=>Number(a.id)-Number(b.id));
    for(const item of items){
      await performQueued(cfg,token,item);
      await dbDelete('queue',item.id);
    }
    if(items.length)setLastSync();
    emitState({needsAuth:false});
    return items.length;
  }
  async function performOnlineWrite(cfg,token,method,args){
    if(method==='toggleTask')return toggleTaskDirect(token,args&&args[0]);
    if(method==='updateTask')return updateTaskDirect(token,args&&args[0],args&&args[1]);
    if(method==='deleteTask')return deleteTaskDirect(token,args&&args[0]);
    if(method==='createQuickItem'&&args&&['task','school_task'].includes(String(args[0]||'').toLowerCase())){
      const p={...(args[1]||{})};delete p.__offlineId;return createTaskDirect(token,String(args[0]).toLowerCase(),p);
    }
    return execute(cfg,token,method,args);
  }
  function isWrite(method,args){
    return ['toggleTask','updateTask','deleteTask','toggleHabit'].includes(method)||
      (method==='createQuickItem'&&args&&['task','school_task'].includes(String(args[0]||'').toLowerCase()));
  }
  async function dispatch(cfg,token,method,args){
    if(method==='getBootstrapData'){
      const boot=await execute(cfg,token,method,args);
      const nutritionSetting=(boot.settings||[]).find(x=>x.setting==='Nutrition Sheet ID');
      try{boot.health=await getHealthSummaryDirect(token,nutritionSetting&&nutritionSetting.value)}catch(e){}
      return boot;
    }
    if(method==='getTaskDashboardData')return getTaskDashboardDataDirect(token);
    if(method==='toggleTask')return toggleTaskDirect(token,args&&args[0]);
    if(method==='updateTask')return updateTaskDirect(token,args&&args[0],args&&args[1]);
    if(method==='deleteTask')return deleteTaskDirect(token,args&&args[0]);
    if(method==='createQuickItem'&&args&&['task','school_task'].includes(String(args[0]||'').toLowerCase()))return createTaskDirect(token,String(args[0]).toLowerCase(),args[1]||{});
    return execute(cfg,token,method,args);
  }

  async function refreshPrimaryCaches(cfg,token){
    await flushQueue(cfg,token);
    const boot=await dispatch(cfg,token,'getBootstrapData',[]);
    await writeCached('getBootstrapData',[],boot);
    try{
      const tasks=await dispatch(cfg,token,'getTaskDashboardData',[]);
      await writeCached('getTaskDashboardData',[],tasks);
    }catch(e){}
    try{
      const habits=await dispatch(cfg,token,'getHabitDashboardData',[]);
      await writeCached('getHabitDashboardData',[],habits);
    }catch(e){}
    setLastSync();
    localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));
    emitState({fromCache:false,needsAuth:false});
    window.dispatchEvent(new CustomEvent('dashboard-data-refreshed',{detail:{bootstrap:cloneValue(boot)}}));
    return boot;
  }

  async function trySilentRefresh(){
    if(!navigator.onLine)return false;
    if(savedBridgeConfig()){
      try{
        await flushQueueBridge();
        const boot=await bridgeCall('getBootstrapData',[]);
        await writeCached('getBootstrapData',[],boot);
        try{await writeCached('getTaskDashboardData',[],await bridgeCall('getTaskDashboardData',[]))}catch(e){}
        try{await writeCached('getHabitDashboardData',[],await bridgeCall('getHabitDashboardData',[]))}catch(e){}
        setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));
        emitState({fromCache:false,needsAuth:false});
        window.dispatchEvent(new CustomEvent('dashboard-data-refreshed',{detail:{bootstrap:cloneValue(boot)}}));
        return true;
      }catch(e){
        emitState({fromCache:true,needsAuth:false});
        return false;
      }
    }
    const cfg=await ensureConfig();
    let token=savedToken();
    if(!token){
      try{token=await ensureToken(cfg,false)}catch(e){emitState({needsAuth:true,fromCache:true});return false}
    }
    try{await refreshPrimaryCaches(cfg,token);return true}
    catch(e){
      if(e&&e.auth)localStorage.removeItem(TOKEN_KEY);
      emitState({needsAuth:!savedToken(),fromCache:true});
      return false;
    }
  }

  window.dashboardRemoteRun=async function(method,args){
    args=args||[];
    const cached=CACHEABLE.has(method)?await readCached(method,args):null;

    if(savedBridgeConfig()){
      if(!navigator.onLine){
        if(isWrite(method,args))return offlineWrite(method,args);
        if(cached){emitState({fromCache:true,needsAuth:false});return normalizeCachedValue(method,cached)}
        throw new Error('OFFLINE // No saved copy of this data yet.');
      }
      try{
        await flushQueueBridge();
        const result=await bridgeCall(method,args);
        if(CACHEABLE.has(method))await writeCached(method,args,result);
        setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));
        emitState({fromCache:false,needsAuth:false});
        return result;
      }catch(err){
        const networkish=!navigator.onLine||/failed to fetch|network|load failed|offline|timed out|bridge/i.test(String(err&&err.message||err));
        if(networkish&&isWrite(method,args))return offlineWrite(method,args);
        if(CACHEABLE.has(method)&&cached){emitState({fromCache:true,needsAuth:false});return normalizeCachedValue(method,cached)}
        throw err;
      }
    }
    if(!navigator.onLine){
      if(isWrite(method,args))return offlineWrite(method,args);
      if(cached){emitState({fromCache:true,needsAuth:false});return normalizeCachedValue(method,cached)}
      throw new Error('OFFLINE // No saved copy of this data yet.');
    }

    const cfg=await ensureConfig();
    let token=savedToken();
    if(!token){
      try{token=await ensureToken(cfg,false)}
      catch(silentErr){
        if(isWrite(method,args))token=await ensureToken(cfg,true);
        else if(cached){emitState({fromCache:true,needsAuth:true});return normalizeCachedValue(method,cached)}
        else token=await ensureToken(cfg,true);
      }
    }

    try{
      await flushQueue(cfg,token);
      const result=await dispatch(cfg,token,method,args);
      if(CACHEABLE.has(method))await writeCached(method,args,result);
      if(method==='getBootstrapData'){
        getTaskDashboardDataDirect(token).then(v=>writeCached('getTaskDashboardData',[],v)).catch(()=>{});
        execute(cfg,token,'getHabitDashboardData',[]).then(v=>writeCached('getHabitDashboardData',[],v)).catch(()=>{});
      }
      setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));emitState({fromCache:false,needsAuth:false});
      return result;
    }catch(err){
      if(err&&err.auth){
        localStorage.removeItem(TOKEN_KEY);
        try{
          token=await ensureToken(cfg,false);
          await flushQueue(cfg,token);
          const result=await dispatch(cfg,token,method,args);
          if(CACHEABLE.has(method))await writeCached(method,args,result);
          setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));emitState({fromCache:false,needsAuth:false});
          return result;
        }catch(refreshErr){
          if(isWrite(method,args))token=await ensureToken(cfg,true);
          else if(CACHEABLE.has(method)&&cached){emitState({fromCache:true,needsAuth:true});return normalizeCachedValue(method,cached)}
          else token=await ensureToken(cfg,true);
          await flushQueue(cfg,token);
          const result=await dispatch(cfg,token,method,args);
          if(CACHEABLE.has(method))await writeCached(method,args,result);
          setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));emitState({fromCache:false,needsAuth:false});
          return result;
        }
      }
      const networkish=!navigator.onLine||/failed to fetch|network|load failed|offline/i.test(String(err&&err.message||err));
      if(networkish&&isWrite(method,args))return offlineWrite(method,args);
      if(CACHEABLE.has(method)&&cached){emitState({fromCache:true});return normalizeCachedValue(method,cached)}
      throw err;
    }
  };

  window.forceDashboardSync=async function(){
    if(!navigator.onLine){emitState({fromCache:true,needsAuth:false});return false}
    if(savedBridgeConfig()){
      await flushQueueBridge();
      const boot=await bridgeCall('getBootstrapData',[]);
      await writeCached('getBootstrapData',[],boot);
      try{await writeCached('getTaskDashboardData',[],await bridgeCall('getTaskDashboardData',[]))}catch(e){}
      try{await writeCached('getHabitDashboardData',[],await bridgeCall('getHabitDashboardData',[]))}catch(e){}
      setLastSync();localStorage.setItem(LAST_DAY_KEY,dateKeyCentral(new Date()));
      emitState({fromCache:false,needsAuth:false});
      window.dispatchEvent(new CustomEvent('dashboard-data-refreshed',{detail:{bootstrap:cloneValue(boot)}}));
      return true;
    }
    const cfg=await ensureConfig();
    let token=savedToken();
    if(!token){
      try{token=await ensureToken(cfg,false)}
      catch(e){token=await ensureToken(cfg,true)}
    }
    await refreshPrimaryCaches(cfg,token);
    return true;
  };

  window.dashboardAutoSync=trySilentRefresh;

  window.addEventListener('online',()=>{emitState();trySilentRefresh().catch(()=>{})});
  window.addEventListener('offline',()=>emitState({fromCache:true,needsAuth:false}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    const last=Number(localStorage.getItem(LAST_SYNC_KEY)||0);
    const dayChanged=(localStorage.getItem(LAST_DAY_KEY)||'')!==dateKeyCentral(new Date());
    rollCachedDayForward().then(changed=>{
      if(changed)window.dispatchEvent(new CustomEvent('dashboard-day-changed',{detail:{day:dateKeyCentral(new Date())}}));
      if(dayChanged||Date.now()-last>120000)trySilentRefresh().catch(()=>{});
    }).catch(()=>{});
  });
  setInterval(()=>{
    rollCachedDayForward().then(changed=>{
      if(!changed)return;
      window.dispatchEvent(new CustomEvent('dashboard-day-changed',{detail:{day:dateKeyCentral(new Date())}}));
      trySilentRefresh().catch(()=>{});
    }).catch(()=>{});
  },60000);
  rollCachedDayForward().then(changed=>{
    if(changed)window.dispatchEvent(new CustomEvent('dashboard-day-changed',{detail:{day:dateKeyCentral(new Date())}}));
  }).catch(()=>{});
  emitState();

  window.resetDashboardConnection=function(){
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(BRIDGE_CONFIG_KEY);
    clearBridgeFrame();
    location.reload();
  };

  function showBridgeSetup(){
    const existing=savedBridgeConfig()||{url:DEFAULT_BRIDGE_URL,key:''};
    showCard(`
      <div class="standalone-kicker">PRIVATE DASHBOARD // BRIDGE</div>
      <h1>Connect dashboard backend</h1>
      <p>This is a one-time setup for this device. The private key stays in this browser and is never saved to GitHub.</p>
      <label style="display:block;text-align:left;margin:14px 0 5px">Apps Script Web app URL</label>
      <input id="bridgeUrl" autocomplete="off" spellcheck="false" value="${existing.url||DEFAULT_BRIDGE_URL}" placeholder="https://script.google.com/macros/s/.../exec" style="width:100%;box-sizing:border-box;padding:12px" readonly>
      <label style="display:block;text-align:left;margin:14px 0 5px">Private dashboard key</label>
      <input id="bridgeKey" type="password" autocomplete="off" spellcheck="false" value="" placeholder="EMBED_KEY from Apps Script properties" style="width:100%;box-sizing:border-box;padding:12px">
      <button id="bridgeSave" class="standalone-primary" style="margin-top:16px">TEST & SAVE</button>
      <div id="bridgeStatus" class="standalone-note">The key is stored only on this device.</div>
    `);
    document.getElementById('bridgeSave').onclick=async()=>{
      const status=document.getElementById('bridgeStatus');
      try{
        const url=document.getElementById('bridgeUrl').value;
        const key=document.getElementById('bridgeKey').value||(existing.key||'');
        saveBridgeConfig(url,key);
        status.textContent='Testing bridge…';
        const habits=await bridgeCall('getLiveHabits',[]);
        if(!Array.isArray(habits))throw new Error('Bridge returned an unexpected response.');
        status.textContent='Connected. Reloading…';
        const u=new URL(location.href);u.searchParams.delete('bridgeSetup');history.replaceState(null,'',u.toString());
        setTimeout(()=>location.reload(),250);
      }catch(e){
        status.textContent='Could not connect: '+(e&&e.message?e.message:String(e));
        localStorage.removeItem(BRIDGE_CONFIG_KEY);window.dashboardBridgeActive=false;clearBridgeFrame();
      }
    };
  }

  if(new URLSearchParams(location.search).get('bridgeSetup')==='1'){
    setTimeout(showBridgeSetup,0);
  }

  if(new URLSearchParams(location.search).get('setup')==='1'){
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
})();