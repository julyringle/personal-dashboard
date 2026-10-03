(()=>{
  const CONFIG_KEY='pdStandaloneConfigV1';
  const TOKEN_KEY='pdStandaloneTokenV1';
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
      return x&&x.clientId&&x.deploymentId?x:null;
    }catch(e){return null}
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
    const existing=savedConfig();
    if(existing) return Promise.resolve(existing);
    if(configPromise) return configPromise;
    configPromise=new Promise(resolve=>{
      showCard(`
        <div class="standalone-kicker">PRIVATE DASHBOARD // 初期設定</div>
        <h1>Connect this device</h1>
        <p>This one-time setup connects the standalone dashboard to your private Google Apps Script backend. These two IDs are not passwords.</p>
        <label>OAuth client ID<input id="standaloneClientId" autocomplete="off" placeholder="...apps.googleusercontent.com"></label>
        <label>API executable deployment ID<input id="standaloneDeploymentId" autocomplete="off" placeholder="AKfy..."></label>
        <button id="standaloneSaveConfig" class="standalone-primary">SAVE & CONTINUE</button>
        <div class="standalone-note">The IDs stay in this browser only. Your Sheets and Calendar data are not stored in GitHub.</div>
      `);
      const btn=document.getElementById('standaloneSaveConfig');
      btn.onclick=()=>{
        const clientId=document.getElementById('standaloneClientId').value.trim();
        const deploymentId=document.getElementById('standaloneDeploymentId').value.trim();
        if(!clientId||!deploymentId){alert('Enter both IDs first.');return}
        const cfg={clientId,deploymentId};
        localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg));
        configPromise=null;
        resolve(cfg);
      };
    });
    return configPromise;
  }
  async function requestToken(cfg){
    await waitForGIS();
    return new Promise((resolve,reject)=>{
      showCard(`
        <div class="standalone-kicker">PRIVATE DASHBOARD // 認証</div>
        <h1>Sign in to continue</h1>
        <p>Google authentication protects your Calendar, Sheets, habits, health, school, and project data.</p>
        <button id="standaloneGoogleSignIn" class="standalone-primary">SIGN IN WITH GOOGLE</button>
        <button id="standaloneReset" class="standalone-secondary">CHANGE CONNECTION</button>
        <div class="standalone-note">Only the Google account authorized for the Apps Script API executable can load the dashboard.</div>
      `);
      document.getElementById('standaloneReset').onclick=()=>{
        localStorage.removeItem(CONFIG_KEY);sessionStorage.removeItem(TOKEN_KEY);
        location.reload();
      };
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
    const response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(cfg.deploymentId)+':run',{
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

  window.dashboardRemoteRun=async function(method,args){
    const cfg=await ensureConfig();
    let token=await ensureToken(cfg,false);
    try{
      return await execute(cfg,token,method,args);
    }catch(err){
      if(!err.auth) throw err;
      sessionStorage.removeItem(TOKEN_KEY);
      token=await ensureToken(cfg,true);
      return execute(cfg,token,method,args);
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