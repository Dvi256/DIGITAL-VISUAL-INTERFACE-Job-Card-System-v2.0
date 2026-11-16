/* DVI Cloud sync for the Pro look on the website (docs/WEBSITE_SWITCH_PLAN.md).

   Pro uses the same saved records (dvi_jobcards_v1), the same device settings and the same connector as Classic,
   and follows Classic's rule: the copy with the newest change wins. It takes the newest copy when the page
   opens, every 15 seconds and when the window is focused, and sends after each save.

   Stricter than Classic, to protect the office records:
   - nothing is sent until one download has succeeded in this page;
   - a device that has never synced takes the cloud's records (its own earlier copy is kept aside);
   - a copy with far fewer job cards than the cloud holds is never sent by itself: the person must choose
     Restore Latest (take the cloud's) or Sync Now and confirm (send this device's);
   - records Pro cannot read are never replaced: Pro stops and sends the person back to Classic;
   - cloud records Pro cannot read are neither loaded nor overwritten.

   Loaded after app.js. It replaces app.js's inert cloud hooks; it has no storage of its own. */
(function(){
 'use strict';
 const DEFAULT_ENDPOINT='https://script.google.com/macros/s/AKfycbx5ckvFIKHAFpT-D9XNs-jPIi7ug_rz85JXytxFp8KdIeARcO_K1Hurvue-obAMizNh/exec';   // the connector Classic uses, read from the Classic page at build time
 const TEST_ENDPOINT='';       // empty in the published build
 const POLL_MS=15000;
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let cfg=null,busy=false,pending=false,saveTimer=null,liveTimer=null,pulledOnce=false,remoteUnreadable=false;
 let remoteJobs=null,heldToasted=false;   // job cards in the cloud's copy at the last download in this page
 let status={kind:'',title:'DVI Cloud',detail:''};

 const blocked=()=>!!window.DVI_WEB_BLOCKED;
 function endpointKind(value){
  const s=String(value||'').trim();
  if(!s)return 'missing';
  if(TEST_ENDPOINT&&s===TEST_ENDPOINT)return 'webapp';
  let url;try{url=new URL(s);}catch(e){return 'invalid';}
  return url.protocol==='https:'&&url.hostname.toLowerCase()==='script.google.com'&&/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)?'webapp':'other';
 }
 // The device's cloud settings are Classic's (same storage entry): address, on/off, device name, last sync times.
 function readConfig(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(CLOUD_KEY))||{};}catch(e){saved={};}
  let endpoint=String(saved.endpoint||'').trim();
  if(endpointKind(endpoint)!=='webapp')endpoint=DEFAULT_ENDPOINT;
  cfg=Object.assign({},saved,{endpoint,auto:saved.auto!==false,deviceName:String(saved.deviceName||'').trim()||('DVI Device '+shortDeviceId()),lastPull:saved.lastPull||0,lastPush:saved.lastPush||0,lastOk:saved.lastOk||0});
  cloudCfg=cfg;
  return cfg;
 }
 function writeConfig(){try{localStorage.setItem(CLOUD_KEY,JSON.stringify(cfg));}catch(e){}}
 const ready=()=>endpointKind(cfg&&cfg.endpoint)==='webapp';
 const enabled=()=>!!(cfg&&cfg.auto&&ready()&&!blocked()&&!remoteUnreadable);

 // Newest change in a copy of the records (Classic's cloudStateStamp).
 function stamp(s){
  if(!s)return 0;
  const stamps=[s.meta&&s.meta.updatedAt,s.meta&&s.meta.cloudUpdatedAt];
  if(Array.isArray(s.jobs))s.jobs.forEach(j=>stamps.push(j.updatedAt,j.createdAt));
  return Math.max(0,...stamps.map(Number).filter(Boolean));
 }
 // What to do with the cloud's copy on an automatic check. Pure, so it can be tested.
 function decide(v){
  if(!v.localJobs||v.remote>v.local)return 'take';
  if(v.firstEver&&v.remoteJobs)return 'take-first';
  if(v.local>v.remote&&!v.same)return shrinks(v.localJobs,v.remoteJobs)?'hold':'send';
  return 'none';
 }
 // Sending would replace the cloud's records with far fewer job cards: an empty or foreign copy, not an edit.
 function shrinks(localCount,remoteCount){return remoteCount>=4&&localCount<remoteCount/2;}
 function hold(){
  setStatus('err','Not sent: far fewer job cards here','This device has '+state.jobs.length+' job cards, DVI Cloud has '+remoteJobs+'. In Resources: Restore Latest takes the cloud\'s records; Sync Now sends this device\'s.');
  if(!heldToasted){heldToasted=true;toast('Not sent to DVI Cloud: this device has '+state.jobs.length+' job cards and the cloud has '+remoteJobs+'. Open Resources › DVI Cloud to choose.','err');}
 }

 function setStatus(kind,title,detail){
  status={kind:kind||'',title:title||'DVI Cloud',detail:detail||''};
  const top=document.getElementById('cloudState'),bar=document.getElementById('cloudStateBar'),box=document.getElementById('cloudStatus'),nav=document.getElementById('navStorageNote');
  for(const el of [top,bar]){if(!el)continue;el.title=status.title+(status.detail?' · '+status.detail:'');el.dataset.kind=status.kind;}
  if(top)top.textContent=status.title;
  if(bar){const label=bar.querySelector('span');if(label)label.textContent=status.title;}
  if(box)box.innerHTML='<span class="cloud-dot"></span><span><b>'+esc(status.title)+'</b><em>'+esc(status.detail)+'</em></span>';
  if(nav)nav.textContent=status.kind==='err'?'saved in this browser; DVI Cloud: '+status.title.toLowerCase():enabled()?'saved in this browser and synced with DVI Cloud':'saved in this browser only';
 }
 function showReady(){
  if(blocked()){setStatus('err','Pro is closed','Records on this device could not be read. Use Classic.');return;}
  if(remoteUnreadable){setStatus('err','Cloud records not readable in Pro','Nothing was changed. Use Classic.');return;}
  if(!cfg.auto){setStatus('','Local only','DVI Cloud is paused on this device (set in Classic › Settings).');return;}
  if(!ready()){setStatus('err','DVI Cloud not set up','Open Classic › Settings.');return;}
  const last=Math.max(cfg.lastOk||0,cfg.lastPull||0,cfg.lastPush||0);
  setStatus('ok','DVI Cloud ready',last?'Last sync check: '+fmtDT(last)+'.':'Waiting for the first sync.');
 }

 function url(action,extra){
  const u=new URL(cfg.endpoint);
  u.searchParams.set('action',action);u.searchParams.set('client',cloudClientId());u.searchParams.set('t',String(Date.now()));
  for(const k in (extra||{}))if(extra[k]!=null)u.searchParams.set(k,extra[k]);
  return u.toString();
 }
 // The connector answers downloads as a script that calls back (as Classic uses it).
 function jsonp(action,extra,timeoutMs){
  return new Promise((resolve,reject)=>{
   let script,timer;
   const cb='dviCloudCb_'+uid().replace(/\W/g,'');
   const cleanup=()=>{clearTimeout(timer);if(script)script.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}};
   window[cb]=data=>{cleanup();resolve(data||{});};
   try{
    script=document.createElement('script');
    script.src=url(action,Object.assign({},extra,{callback:cb}));
    script.onerror=()=>{cleanup();reject(new Error('DVI Cloud is not reachable. Saving on this device still works.'));};
    timer=setTimeout(()=>{cleanup();reject(new Error('DVI Cloud did not answer.'));},timeoutMs||16000);
    document.head.appendChild(script);
   }catch(e){cleanup();reject(e);}
  });
 }
 async function post(payload){
  await fetch(cfg.endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
 }

 // Put a newer copy in place of this device's, through Pro's own save (no time stamp added, nothing sent).
 function adopt(next,label){
  state=ensureStateShape(next);
  syncCompanyBranding();
  save({cloud:false,touch:false});
  renderAll();
  if(typeof refreshDocumentTitle==='function')refreshDocumentTitle();
  if(label)toast(label);
 }

 async function pull(opts){
  opts=opts||{};
  if(blocked()||!cfg||!ready()){showReady();return false;}
  if(busy)return false;
  let sendAfter=false,ok=false;
  busy=true;setStatus('busy','Syncing…','Getting the latest records from DVI Cloud.');
  try{
   const res=await jsonp('load');
   if(!res.ok)throw new Error(res.error||'Cloud sync failed');
   const firstEver=!cfg.lastPull;
   cfg.lastPull=Date.now();cfg.lastOk=cfg.lastPull;if(res.driveFileUrl||(res.meta&&res.meta.driveFileUrl))cfg.driveUrl=res.driveFileUrl||res.meta.driveFileUrl;writeConfig();
   pulledOnce=true;ok=true;
   if(!res.state||!Array.isArray(res.state.jobs)){showReady();if(!opts.auto)toast('DVI Cloud is empty.');return true;}
   let next;
   try{next=ensureStateShape(DviScheduling.normalizeBackup(res.state,{lenient:true}));}
   catch(error){remoteUnreadable=true;showReady();toast('The cloud records could not be read in Pro. Nothing was changed. Please use Classic.','err');return false;}
   const local=stamp(state),remote=stamp(next),same=JSON.stringify(state)===JSON.stringify(next);
   remoteJobs=next.jobs.length;
   let held=false;
   if(opts.auto){
    const what=decide({localJobs:state.jobs.length,remoteJobs:next.jobs.length,local,remote,same,firstEver});
    if(what==='take')adopt(next,opts.live?'':'Latest records loaded from DVI Cloud');
    else if(what==='take-first'){
     try{localStorage.setItem(DB+'_before_first_sync',JSON.stringify(state));}catch(e){}
     adopt(next,'This device had not synced before, so the DVI Cloud records were loaded. Its earlier records were kept aside in this browser.');
    }else if(what==='send')sendAfter=true;
    else if(what==='hold')held=true;
   }else if(same)toast('This device already matches the cloud');
   else if(state.jobs.length)confirmBox('Replace this device with the latest DVI Cloud data ('+next.jobs.length+' job cards)?',()=>{adopt(next,'Cloud data downloaded');heldToasted=false;showReady();});
   else adopt(next,'Cloud data downloaded');
   if(held)hold();else showReady();
   return true;
  }catch(e){
   setStatus('err',navigator.onLine===false?'Offline':'DVI Cloud error',(e&&e.message)||'Unable to sync');
   if(!opts.auto)toast((e&&e.message)||'DVI Cloud sync failed','err');
   return false;
  }finally{
   busy=false;
   if(sendAfter||(ok&&pending)){pending=false;setTimeout(()=>push({silent:true}),120);}
  }
 }
 async function push(opts){
  opts=opts||{};
  if(blocked()||remoteUnreadable||!cfg||!ready()){showReady();return false;}
  if(!pulledOnce){pending=true;pull({auto:true,live:true});return false;}   // never send before a download has succeeded
  if(busy){pending=true;return false;}
  if(!opts.force&&remoteJobs!==null&&shrinks(state.jobs.length,remoteJobs)){hold();return false;}
  busy=true;setStatus('busy','Syncing…','Sending this device\'s records to DVI Cloud.');
  try{
   state.meta=Object.assign({},state.meta,{cloudUpdatedAt:Date.now()});
   save({cloud:false});
   await post({action:'save',client:cloudClientId(),clientName:currentDeviceName(),savedAt:Date.now(),state});
   await wait(1200);
   const meta=await jsonp('meta',{},9000).catch(()=>({ok:true}));
   if(meta&&!meta.ok)throw new Error(meta.error||'Cloud did not confirm the upload');
   remoteJobs=state.jobs.length;heldToasted=false;
   cfg.lastPush=Date.now();cfg.lastOk=cfg.lastPush;writeConfig();
   showReady();
   if(!opts.silent)toast('DVI Cloud updated');
   return true;
  }catch(e){
   setStatus('err',navigator.onLine===false?'Offline':'DVI Cloud error',(e&&e.message)||'Unable to sync');
   if(!opts.silent)toast((e&&e.message)||'DVI Cloud sync failed','err');
   return false;
  }finally{
   busy=false;
   if(pending&&enabled()){pending=false;schedule();}
  }
 }
 function schedule(){
  if(!enabled())return;
  if(busy){pending=true;return;}
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>push({silent:true}),1000);
 }
 function configureLive(){
  if(!enabled()){if(liveTimer){clearInterval(liveTimer);liveTimer=null;}return;}
  if(!liveTimer)liveTimer=setInterval(()=>{if(!document.hidden)pull({auto:true,live:true});},POLL_MS);
 }
 function focusSync(){if(enabled())pull({auto:true,live:true});}

 function cover(id,html){
  const el=document.createElement('div');el.id=id;el.setAttribute('role','alertdialog');
  el.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,10,10,.82);color:#f2f2f2;font:14px/1.5 system-ui,sans-serif;text-align:center';
  el.innerHTML='<div style="max-width:440px;padding:22px 24px;border-radius:8px;background:#2b2b2b;box-shadow:0 12px 40px rgba(0,0,0,.5)">'+html+'</div>';
  document.body.appendChild(el);
  return el;
 }

 // ---- replace app.js's inert hooks (they are called by name, so these take effect at once)
 window.loadCloudConfig=readConfig;
 window.saveCloudConfig=writeConfig;
 window.defaultDeviceName=()=>'DVI Device '+shortDeviceId();
 window.currentDeviceName=()=>(cfg||readConfig()).deviceName;
 window.scheduleCloudSave=schedule;
 window.configureCloudLiveSync=configureLive;
 window.cloudFocusSync=focusSync;
 window.cloudLiveEnabled=enabled;
 window.cloudEndpointReady=ready;
 window.cloudPull=()=>pull({});
 window.cloudPush=push;
 window.cloudPushManual=()=>{
  if(!pulledOnce){pull({auto:true});return;}
  if(remoteJobs!==null&&shrinks(state.jobs.length,remoteJobs))confirmBox('Replace the DVI Cloud records ('+remoteJobs+' job cards) with this device\'s '+state.jobs.length+'? Everyone will get this device\'s records.',()=>push({force:true}));
  else push({});
 };
 window.cloudTest=()=>pull({auto:true});
 window.renderCloudStatus=()=>setStatus(status.kind,status.title,status.detail);
 window.setCloudStatus=setStatus;
 window.sandboxNotice=()=>toast('That is not available in Pro on the website yet. Please use Classic for it.');
 window.DviWebSync={stamp,decide,shrinks,endpointKind,pull,push,status:()=>Object.assign({},status),pulledOnce:()=>pulledOnce};

 // ---- start
 readConfig();
 if(blocked()){
  showReady();
  cover('proBlocked','<h2 style="margin:0 0 8px;font-size:17px">Pro cannot open the records on this device</h2><p style="margin:0 0 14px">Nothing was changed and nothing was sent. Please use Classic.</p><button type="button" id="proBlockedBack" style="padding:8px 16px;border:0;border-radius:6px;background:#f7a81b;color:#111;font-weight:700;cursor:pointer">Open Classic</button>');
  document.getElementById('proBlockedBack').addEventListener('click',()=>{if(window.DviLook){DviLook.set('classic');location.href=DviLook.target('classic','');}});
  return;
 }
 // Another tab on this device (Classic, or another Pro tab) saved: take its copy, as a cloud download would.
 window.addEventListener('storage',e=>{
  if(e.key!==DB||e.newValue===null)return;
  try{
   const next=ensureStateShape(DviScheduling.normalizeBackup(JSON.parse(e.newValue),{lenient:true}));
   committedRawJSON=e.newValue;state=next;syncCompanyBranding();committedStateJSON=JSON.stringify(state);
   renderAll();
  }catch(_){}
 });
 window.addEventListener('focus',focusSync);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)focusSync();});
 showReady();
 if(enabled()){
  // Hold the page until the newest records are in, so nobody edits an old copy. Gives way if the cloud does not answer.
  const first=cover('proFirstSync','<p style="margin:0">Getting the latest records from DVI Cloud…</p>');
  pull({auto:true}).finally(()=>{first.remove();configureLive();});
 }
})();
