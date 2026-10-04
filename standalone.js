(()=>{
  const CONFIG_KEY='pdStandaloneConfigV1';
  const TOKEN_KEY='pdStandaloneTokenV1';
  const DEFAULT_CLIENT_ID='768938791390-06nk1l8csltji5vsmah53oub1kninm1b.apps.googleusercontent.com';
  const DEFAULT_SCRIPT_ID='1PzhUVJDtTUuoBiG6k5jamDylCbGisMfEjdkc71do4mU_i1qaeT0Y0OOQ';
  const DASHBOARD_SHEET_ID='1YO8y-6BI_9caO1hOmU5vSF8xQzZFId6q6Pj8gJSGZfg';
  const SCOPES=[
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request'
  ].join(' ');
  let gate=null,configPromise=null,authPromise=null;

  function inAppsScriptHost(){
    return typeof google!=='undefined' && google.script && google.script.run;
  }
  if(inAppsScriptHost()) return;

  window.__DASHBOARD_STANDALONE__=true;

  function savedConfig(){
    try{
      const x=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');
      if(x&&x.clientId&&x.scriptId) return x;
    }catch(e){}
    return {clientId:DEFAULT_CLIENT_ID,scriptId:DEFAULT_SCRIPT_ID};
  }
  function savedToken(){
    try{
      const x=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');
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
  async function requestToken(cfg){
    await waitForGIS();
    return new Promise((resolve,reject)=>{
      showCard(`
        <div class="standalone-kicker">PRIVATE DASHBOARD // 認証</div>
        <h1>Sign in to continue</h1>
        <p>Google authentication protects your Calendar, Sheets, habits, health, school, and project data.</p>
        <button id="standaloneGoogleSignIn" class="standalone-primary">SIGN IN WITH GOOGLE</button>
        <div class="standalone-note">Only the Google account authorized for the Apps Script API executable can load the dashboard.</div>
      `);
      document.getElementById('standaloneGoogleSignIn').onclick=()=>{
        const client=google.accounts.oauth2.initTokenClient({
          client_id:cfg.clientId,
          scope:SCOPES,
          callback:(resp)=>{
            if(resp.error){reject(new Error(resp.error_description||resp.error));return}
            const token={accessToken:resp.access_token,expiresAt:Date.now()+(Number(resp.expires_in||3600)*1000)};
            sessionStorage.setItem(TOKEN_KEY,JSON.stringify(token));
            hideGate();
            resolve(token);
          },
          error_callback:(err)=>reject(new Error(err&&err.message?err.message:'Google sign-in was cancelled.'))
        });
        client.requestAccessToken({prompt:''});
      };
    });
  }
  async function ensureToken(cfg,force){
    if(!force){
      const existing=savedToken();
      if(existing) return existing;
    }
    if(authPromise&&!force) return authPromise;
    authPromise=requestToken(cfg).finally(()=>{authPromise=null});
    return authPromise;
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
  async function sheetsApi(token,path,options={}){
    const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+DASHBOARD_SHEET_ID+'/'+path,{
      method:options.method||'GET',
      headers:{'Authorization':'Bearer '+token.accessToken,'Content-Type':'application/json'},
      body:options.body===undefined?undefined:JSON.stringify(options.body)
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401||response.status===403){const err=new Error((data.error&&data.error.message)||'Google authorization expired.');err.auth=true;throw err}
    if(!response.ok)throw new Error((data.error&&data.error.message)||('Google Sheets API error '+response.status));
    return data;
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
      const row=values[i],repeat=String(row[h['Repeat']]||''),due=normalizeDateKey(row[h['Due']]),done=boolish(row[h['Done']]);
      if(!repeat||!due||!done||due>=today)continue;
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
      (crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(16).slice(2)),
      title,'To Do',payload.priority||'',type==='school_task'?'School':(payload.area||'Personal'),payload.due||'',false,
      payload.details||'',payload.course||'','',payload.repeat||'',payload.repeatUntil||'',''
    ];
    await sheetsApi(token,'values/'+encodeURIComponent('Tasks!A:M')+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',{method:'POST',body:{values:[row]}});
    return {ok:true,id:row[0]};
  }
  async function dispatch(cfg,token,method,args){
    if(method==='getBootstrapData'){
      await rollRecurringTasksDirect(token);
      return execute(cfg,token,method,args);
    }
    if(method==='getTaskDashboardData')return getTaskDashboardDataDirect(token);
    if(method==='toggleTask')return toggleTaskDirect(token,args&&args[0]);
    if(method==='createQuickItem'&&args&&['task','school_task'].includes(String(args[0]||'').toLowerCase()))return createTaskDirect(token,String(args[0]).toLowerCase(),args[1]||{});
    return execute(cfg,token,method,args);
  }

  window.dashboardRemoteRun=async function(method,args){
    const cfg=await ensureConfig();
    let token=await ensureToken(cfg,false);
    try{
      return await dispatch(cfg,token,method,args);
    }catch(err){
      if(!err.auth) throw err;
      sessionStorage.removeItem(TOKEN_KEY);
      token=await ensureToken(cfg,true);
      return dispatch(cfg,token,method,args);
    }
  };

  window.resetDashboardConnection=function(){
    localStorage.removeItem(CONFIG_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  };

  if(new URLSearchParams(location.search).get('setup')==='1'){
    localStorage.removeItem(CONFIG_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
})();