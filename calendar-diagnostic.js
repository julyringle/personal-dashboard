(()=>{
  const RETRY='data-calendar-debug-retry';
  function calendarPanel(){
    return Array.from(document.querySelectorAll('.panel')).find(p=>/CALENDAR UNAVAILABLE/i.test(p.textContent||''));
  }
  function currentCalendarError(){
    const messages=Array.from(document.querySelectorAll('.error')).map(x=>x.textContent||'').join(' · ');
    const match=messages.match(/calendar:\s*([^·]+)/i);
    return match?match[1].trim():'No calendar error was included in the saved dashboard response. Retry will make a fresh request.';
  }
  function attach(){
    const panel=calendarPanel();
    if(!panel)return;
    let status=panel.querySelector('.calendar-diagnostic');
    if(!status){
      status=document.createElement('div');
      status.className='calendar-diagnostic';
      status.style.cssText='padding:0 12px 8px;text-align:center;overflow-wrap:anywhere;font:9px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#929aa3';
      status.textContent='CALENDAR CHECK // '+currentCalendarError();
      panel.appendChild(status);
    }
    if(!panel.querySelector('['+RETRY+']')){
      const button=document.createElement('button');
      button.className='ghost-btn';
      button.setAttribute(RETRY,'');
      button.textContent='RETRY CALENDAR';
      button.style.cssText='display:block;margin:0 auto 10px';
      button.addEventListener('click',async()=>{
        button.disabled=true;
        button.textContent='CHECKING...';
        status.textContent='CHECKING LIVE GOOGLE CALENDAR CONNECTION...';
        try{
          if(typeof window.dashboardRemoteRun!=='function')throw new Error('Dashboard API is not available in this page.');
          const fresh=await window.dashboardRemoteRun('getCalendarWeek',[0,Date.now()]);
          if(!fresh||!Array.isArray(fresh.events))throw new Error('The live calendar request returned an empty response.');
          const bootstrap=await window.dashboardRemoteRun('getBootstrapData',[]);
          if(!bootstrap||!bootstrap.calendar){
            const detail=(bootstrap&&Array.isArray(bootstrap.errors)?bootstrap.errors:[]).find(x=>/^calendar:/i.test(String(x)));
            throw new Error(detail||'The live calendar check succeeded, but the Home dashboard response still contains no calendar.');
          }
          status.textContent='CALENDAR CONNECTION RESTORED. RELOADING...';
          location.reload();
        }catch(error){
          status.textContent='CALENDAR ERROR // '+String(error&&error.message||error);
          button.disabled=false;
          button.textContent='RETRY CALENDAR';
        }
      });
      panel.appendChild(button);
    }
  }
  const observer=new MutationObserver(attach);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',attach);
  setTimeout(attach,500);
  setTimeout(attach,1500);
})();