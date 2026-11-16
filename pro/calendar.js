/* Local calendar studio: civil dates and company-zone times, no transport or persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviCalendar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const date=s=>new Date(s+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
function add(s,n){const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function week(s){return add(s,-((date(s).getUTCDay()+6)%7));}
function shiftMonth(s,n){const d=date(s),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d);}
function monthDays(s){const first=s.slice(0,8)+'01',start=week(first);return Array.from({length:42},(_,i)=>add(start,i));}
function minutes(t){return Number(t.slice(11,13))*60+Number(t.slice(14,16));}
function phases(j){if(j.status==='Cancelled')return [];return [{kind:'setup',start:j.setupStartAt,end:j.eventStartAt,from:j.setupFrom||j.setupDate||j.setupTo,to:j.setupTo||j.setupFrom||j.setupDate},{kind:'event',start:j.eventStartAt,end:j.finishAt,from:j.eventFrom||j.eventTo,to:j.eventTo||j.eventFrom}];}
function segments(j,day){return phases(j).flatMap(p=>{
 const start=p.start||'',end=p.end||'',validRange=start&&end&&end>start;
 const covered=p.from&&p.from<=day&&day<=(p.to||p.from);
 if(validRange){const a=start.slice(0,10),b=end.slice(0,10);if(day<a||day>b||day===b&&minutes(end)===0)return [];return [{job:j,kind:p.kind,start:day===a?minutes(start):0,end:day===b?minutes(end):1440,continuesBefore:day>a,continuesAfter:day<b,timed:true}];}
 if(start.slice(0,10)===day)return [{job:j,kind:p.kind,start:minutes(start),end:null,timed:true}];
 if(covered)return [{job:j,kind:p.kind,timed:false}];return [];
 });}
function layout(entries){const list=entries.map(e=>({...e})).sort((a,b)=>a.start-b.start);let group=[],until=-1;function flush(){const ends=[];for(const e of group){let lane=ends.findIndex(t=>t<=e.start);if(lane<0)lane=ends.length;ends[lane]=Math.max(e.end||e.start+45,e.start+45);e.lane=lane;}for(const e of group)e.lanes=ends.length;group=[];}for(const e of list){if(e.start>=until){flush();until=-1;}group.push(e);until=Math.max(until,Math.max(e.end||e.start+45,e.start+45));}flush();return list;}
// Civil dates shown by each view: month grid (42), Monday-first week (7), day (1), agenda (30 ahead).
function periodDays(mode,selected){return mode==='month'?monthDays(selected):mode==='week'?Array.from({length:7},(_,i)=>add(week(selected),i)):mode==='agenda'?Array.from({length:30},(_,i)=>add(selected,i)):[selected];}
// Phase entries for one civil date: timed first by start, then date-only; optional phase filter.
function dayEntries(jobs,day,show){const s=show||{setup:true,event:true};return (jobs||[]).flatMap(j=>segments(j,day)).filter(e=>s[e.kind]).sort((a,b)=>(a.timed?a.start:1e4)-(b.timed?b.start:1e4)||String(a.job.event).localeCompare(String(b.job.event)));}
// Agenda: only dates that have entries, in order.
function agenda(jobs,start,count,show){return Array.from({length:count||30},(_,i)=>add(start,i)).map(day=>({day,items:dayEntries(jobs,day,show)})).filter(g=>g.items.length);}
return {add,week,shiftMonth,monthDays,segments,layout,periodDays,dayEntries,agenda};
});

function initCalendarStudio(){
 const shell=document.getElementById('dvcStudio');if(!shell||shell.dataset.ready)return;shell.dataset.ready='1';
 const C=DviCalendar,E=esc,canvas=document.getElementById('dvcCanvas'),pop=document.getElementById('dvcPopover'),main=shell.querySelector('.dvc-main');
 const phone=()=>window.matchMedia?window.matchMedia('(max-width: 759px)').matches:window.innerWidth<760;
 let selected=todayISO(),mode=phone()?'agenda':'month',show={setup:true,event:true},popJob=null;
 const label=(s,options)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{...options,timeZone:'UTC'});
 const time=n=>n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const timing=e=>!e.timed?'Time not set':e.end===null?time(e.start)+' · end not set':(e.continuesBefore?'← ':'')+time(e.start)+'–'+time(e.end)+(e.continuesAfter?' →':'');
 const phaseName=k=>k==='setup'?'Setup & build':'Event & showtime';
 const entries=s=>C.dayEntries(state.jobs,s,show);
 // Zone tag for an instant (omitted: now); compact offset ("UTC+14") where there is no abbreviation.
 const TZA=ms=>{if(typeof zoneLabels!=='function')return 'EAT';const z=zoneLabels(ms);return z.named?z.abbr:z.compact;};
 const atStamp=s=>s&&typeof DviScheduling!=='undefined'?DviScheduling.timestamp(s):null;
 const entryStamp=e=>e&&e.job?(e.kind==='setup'?e.job.setupStartAt:e.job.eventStartAt):null;
 const nowKampala=()=>{const p=new Date().toLocaleString('sv-SE',{timeZone:typeof DviScheduling!=='undefined'?DviScheduling.TIME_ZONE:'Africa/Kampala'});return {day:p.slice(0,10),min:Number(p.slice(11,13))*60+Number(p.slice(14,16))};};
 // Compact chips (month, untimed rows) show only the start, like Google Calendar's month grid.
 const chipTime=e=>!e.timed?'':e.continuesBefore?'↳':time(e.start);
 const jobButton=(e,cls='',style='')=>{const compact=/compact/.test(cls),t=compact?chipTime(e):timing(e);return '<button class="dvc-event '+e.kind+' '+cls+(e.timed?'':' untimed')+(e.continuesBefore?' cont-before':'')+(e.continuesAfter?' cont-after':'')+'" data-cal-job="'+E(e.job.id)+'" data-cal-kind="'+e.kind+'"'+(style?' style="'+style+'"':'')+' title="'+E(phaseName(e.kind)+' · '+e.job.event+' · '+timing(e)+(e.timed?' '+TZA(atStamp(entryStamp(e))):''))+'">'+(t?'<span class="dvc-event-time">'+E(t)+'</span>':'')+'<b>'+E(e.job.event||'Untitled job')+'</b><small>'+E([phaseName(e.kind),e.job.venueId?nameOf('venues',e.job.venueId):''].filter(Boolean).join(' · '))+'</small></button>';};
 function sync(){const p=selected.split('-').map(Number);calY=p[0];calM=p[1]-1;const ref=document.getElementById('opsBriefDate');if(ref)ref.value=selected;}
 const periodDays=()=>C.periodDays(mode,selected);
 function widgets(){
  const today=todayISO(),todays=entries(today),people=new Set(),upcoming=[];
  for(const e of todays)for(const [k,n] of DviScheduling.crewKeys(e.job,state.technicians))people.add(n+'|'+k);
  for(let i=0;i<30&&upcoming.length<5;i++){const s=C.add(today,i);for(const e of entries(s)){if(upcoming.length>=5)break;if(i===0&&e.timed){const end=atStamp(e.kind==='setup'?e.job.eventStartAt:e.job.finishAt);if(end!==null&&end<=new Date().getTime())continue;}upcoming.push({e,s});}}
  const row=(e,s,lead)=>`<button class="widget-row ${e.kind}" data-cal-job="${E(e.job.id)}" data-cal-kind="${e.kind}"><span class="w-time">${E(lead||(e.timed?time(e.start):'—'))}</span><span class="w-main"><b>${E(e.job.event)}</b><small>${E(phaseName(e.kind)+(e.timed?'':' · time not set'))}${s?' · '+E(label(s,{weekday:'short',day:'numeric',month:'short'})):''}</small></span></button>`;
  const names=[...people].map(p=>p.split('|')[0]).sort();
  document.getElementById('dvcWidgets').innerHTML=`<div class="widget"><div class="widget-head"><b>Today</b><span class="widget-kind">In-app widget</span></div><div class="widget-body">${todays.length?todays.slice(0,4).map(e=>row(e)).join('')+(todays.length>4?`<button class="dvc-more" data-cal-open-date="${today}">+${todays.length-4} more</button>`:''):'<div class="widget-empty">No setups or events today.</div>'}</div></div>
  <div class="widget"><div class="widget-head"><b>Coming up</b><span class="widget-kind">30 days</span></div><div class="widget-body">${upcoming.length?upcoming.map(({e,s})=>row(e,s,label(s,{day:'numeric',month:'short'}))).join(''):'<div class="widget-empty">Nothing scheduled in the next 30 days.</div>'}</div></div>
  <div class="widget"><div class="widget-head"><b>People assigned today</b><span class="widget-kind">In-app</span></div><div class="widget-body"><div class="widget-big"><b>${names.length}</b><span>${names.length?E(names.slice(0,3).join(', '))+(names.length>3?' +'+(names.length-3):''):'none recorded'}</span></div></div></div>
  <p class="widget-note">These panels are widgets inside this web app. Native phone home-screen widgets are not provided by a browser app.</p>`;
 }
 function render(){
  closePopover();
  shell.querySelectorAll('[data-cal-filter]').forEach(input=>{input.checked=show[input.dataset.calFilter];});
  shell.querySelectorAll('[data-cal-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(show[b.dataset.calToggle])));
  const priorScroll=canvas.querySelector('.dvc-time-scroll'),scrollTop=priorScroll&&priorScroll.dataset.mode===mode?priorScroll.scrollTop:null;
  sync();const today=todayISO(),now=nowKampala();
  shell.querySelectorAll('[data-cal-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.calMode===mode);b.setAttribute('aria-pressed',String(b.dataset.calMode===mode));});
  document.getElementById('calLabel').textContent=mode==='day'?label(selected,{weekday:phone()?'short':'long',day:'numeric',month:'long',year:'numeric'}):mode==='week'?label(C.week(selected),{day:'numeric',month:'short'})+' – '+label(C.add(C.week(selected),6),{day:'numeric',month:'short',year:'numeric'}):mode==='agenda'?'From '+label(selected,{day:'numeric',month:'short',year:'numeric'}):label(selected,{month:'long',year:'numeric'});
  const busy=new Set();for(const s of C.monthDays(selected))if(entries(s).length)busy.add(s);
  document.getElementById('dvcMini').innerHTML='<div class="dvc-mini-title"><b>'+label(selected,{month:'long',year:'numeric'})+'</b><button data-cal-action="mini-prev" aria-label="Previous month">‹</button><button data-cal-action="mini-next" aria-label="Next month">›</button></div><div class="dvc-mini-grid">'+['M','T','W','T','F','S','S'].map(x=>'<span>'+x+'</span>').join('')+C.monthDays(selected).map(s=>'<button class="'+(s===selected?'selected ':'')+(s===today?'today ':'')+(busy.has(s)?'busy ':'')+(s.slice(0,7)!==selected.slice(0,7)?'outside':'')+'" data-cal-date="'+s+'" aria-label="'+label(s,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(busy.has(s)?', has scheduled work':'')+'" aria-pressed="'+(s===selected)+'">'+Number(s.slice(8))+'</button>').join('')+'</div>';
  widgets();
  const days=periodDays(),inPeriod=mode==='month'?days.filter(s=>s.slice(0,7)===selected.slice(0,7)):days;
  const count=new Set(inPeriod.flatMap(s=>entries(s).map(e=>e.job.id))).size,noun={month:'month',week:'week',day:'day',agenda:'next 30 days'}[mode];
  document.getElementById('dvcRangeSummary').textContent=count?count+' job card'+(count===1?'':'s')+' · this '+noun:'Nothing scheduled this '+noun;
  if(mode==='month'){
   canvas.innerHTML='<div class="dvc-month-scroll"><div class="dvc-weekdays">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<span>'+x+'</span>').join('')+'</div><div id="calGrid" class="dvc-month" role="grid" aria-label="'+E(label(selected,{month:'long',year:'numeric'}))+'">'+days.map(s=>{const items=entries(s),wd=new Date(s+'T12:00:00Z').getUTCDay(),cap=phone()?4:3;return '<div class="dvc-day '+(s.slice(0,7)!==selected.slice(0,7)?'outside ':'')+(wd===0||wd===6?'weekend ':'')+(s===today?'today ':'')+(s===selected?'selected':'')+'" role="gridcell"><button class="dvc-day-number" data-cal-open-date="'+s+'" aria-label="Open '+label(s,{weekday:'long',day:'numeric',month:'long'})+', '+items.length+' item'+(items.length===1?'':'s')+'">'+Number(s.slice(8))+'</button>'+items.slice(0,cap).map(e=>jobButton(e,'compact')).join('')+(items.length>cap?'<button class="dvc-more" data-cal-day-list="'+s+'">+'+(items.length-cap)+' more</button>':'')+'</div>';}).join('')+'</div></div>';
  }else if(mode==='agenda'){
   const groups=C.agenda(state.jobs,selected,30,show).map(g=>({s:g.day,items:g.items}));
   canvas.innerHTML=groups.length?'<div class="dvc-agenda">'+groups.map(g=>'<div class="dvc-agenda-day'+(g.s===today?' today':'')+'"><div class="dvc-agenda-date"><b>'+Number(g.s.slice(8))+'</b><span>'+label(g.s,{weekday:'short'})+'<br>'+label(g.s,{month:'short'})+'</span></div><div class="dvc-agenda-items">'+g.items.map(e=>'<button class="dvc-agenda-item" data-cal-job="'+E(e.job.id)+'" data-cal-kind="'+e.kind+'"><span class="a-time'+(e.timed?'':' untimed')+'">'+E(timing(e))+'</span><i class="dot '+e.kind+'"></i><span class="a-main"><b>'+E(e.job.event)+'</b><small>'+E([phaseName(e.kind),e.job.venueId?nameOf('venues',e.job.venueId):'',jobSiteManager(e.job)].filter(Boolean).join(' · '))+'</small></span>'+statusPill(e.job.status)+'</button>').join('')+'</div></div>').join('')+'</div>':'<div class="empty"><span class="empty-icon" data-icon="calendar"></span><b>Nothing in the next 30 days</b><p>No setup or event dates from '+E(label(selected,{day:'numeric',month:'long'}))+'. Cancelled jobs are hidden.</p><button class="btn sm" data-cal-action="create">Create job card</button></div>';
  }else{
   const columns=days.length;
   canvas.innerHTML='<div class="dvc-time-scroll" data-mode="'+mode+'"><div class="dvc-time-inner" style="--dvc-cols:'+columns+'"><div class="dvc-time-head"><span>'+E(TZA(atStamp(days[0]+'T12:00')))+'</span>'+days.map(s=>'<button data-cal-open-date="'+s+'" class="'+(s===today?'today':'')+'" aria-label="'+label(s,{weekday:'long',day:'numeric',month:'long'})+'"><small>'+label(s,{weekday:'short'})+'</small><b>'+Number(s.slice(8))+'</b></button>').join('')+'</div><div class="dvc-unscheduled"><span>Time<br>not set</span>'+days.map(s=>'<div>'+entries(s).filter(e=>!e.timed).map(e=>jobButton(e,'compact')).join('')+'</div>').join('')+'</div><div class="dvc-time-body"><div class="dvc-hours">'+Array.from({length:24},(_,h)=>'<span style="top:calc('+h+' * var(--hour))">'+String(h).padStart(2,'0')+':00</span>').join('')+'</div>'+days.map(s=>'<div class="dvc-time-column'+(s===today?' today':'')+'" aria-label="'+label(s,{weekday:'long',day:'numeric',month:'long'})+'">'+C.layout(entries(s).filter(e=>e.timed)).map(e=>{const dur=(e.end===null?45:e.end-e.start);return jobButton(e,'timed'+(e.end===null?' unknown-end':'')+(dur<75?' short':''),'top:calc('+(e.start/60).toFixed(3)+' * var(--hour));height:max(22px, calc('+(Math.max(dur,20)/60).toFixed(3)+' * var(--hour) - 2px));left:calc('+(e.lane/e.lanes*100).toFixed(2)+'% + 2px);width:calc('+(100/e.lanes).toFixed(2)+'% - 4px)');}).join('')+(s===now.day?'<div class="dvc-now" style="top:calc('+(now.min/60).toFixed(3)+' * var(--hour))" title="Now · '+time(now.min)+' '+E(TZA())+'"></div>':'')+'</div>').join('')+'</div></div></div>';
   const scroller=canvas.querySelector('.dvc-time-scroll'),hour=parseFloat(getComputedStyle(canvas.querySelector('.dvc-time-inner')).getPropertyValue('--hour'))||46;
   const starts=days.flatMap(s=>entries(s).filter(e=>e.timed).map(e=>e.start)),focusHour=days.includes(now.day)?Math.floor(now.min/60)-2:starts.length?Math.floor(Math.min(...starts)/60)-1:7;
   scroller.scrollTop=scrollTop!==null?scrollTop:Math.max(0,focusHour)*hour;
  }
 }
 function closePopover(){if(!pop||pop.hidden)return false;pop.hidden=true;pop.innerHTML='';popJob=null;return true;}
 window.closeCalendarPopover=closePopover;
 function place(anchor){
  const m=main.getBoundingClientRect(),a=anchor.getBoundingClientRect();
  pop.hidden=false;
  if(phone())return;
  const w=pop.offsetWidth,h=pop.offsetHeight;
  let left=a.right-m.left+8;if(left+w>m.width-8)left=a.left-m.left-w-8;if(left<8)left=Math.max(8,Math.min(m.width-w-8,a.left-m.left));
  let top=a.top-m.top;top=Math.max(8,Math.min(m.height-h-8,top));
  pop.style.left=left+'px';pop.style.top=top+'px';
 }
 function openJobPopover(id,kind,anchor){
  const j=state.jobs.find(x=>x.id===id);if(!j)return;
  const segs=C.segments(j,selected).concat(C.segments(j,j.eventFrom||selected)),seg=segs.find(s=>s.kind===kind);
  const stampFrom=kind==='setup'?j.setupStartAt:j.eventStartAt,stampTo=kind==='setup'?j.eventStartAt:j.finishAt;
  const dateFrom=kind==='setup'?setupStart(j):j.eventFrom,dateTo=kind==='setup'?setupEnd(j):(j.eventTo||j.eventFrom);
  const when=stampFrom?label(stampFrom.slice(0,10),{weekday:'short',day:'numeric',month:'short'})+', '+stampFrom.slice(11,16)+(stampTo?' – '+(stampTo.slice(0,10)!==stampFrom.slice(0,10)?label(stampTo.slice(0,10),{weekday:'short',day:'numeric',month:'short'})+', ':'')+stampTo.slice(11,16):' · end not set')+' '+TZA(atStamp(stampFrom)):(dateFrom?fmtRange(dateFrom,dateTo)+' · time not set':'Date not set');
  const crew=DviDispatch.crew(j,state.technicians,state.roles).filter(c=>c.name!=='Unassigned');
  const issues=scheduleMessages(j);
  popJob=id;
  pop.innerHTML=`<div class="pop-head"><button class="icon-btn" onclick="closeCalendarPopover();openJobModal('${E(j.id)}')" aria-label="Edit job card" title="Edit"><span data-icon="edit"></span></button><button class="icon-btn" onclick="printJob('${E(j.id)}')" aria-label="Print job card" title="Print"><span data-icon="print"></span></button><button class="icon-btn" onclick="closeCalendarPopover()" aria-label="Close details" title="Close"><span data-icon="x"></span></button></div>
  <div class="pop-body"><div class="pop-title" style="--c:var(--${kind==='setup'?'setup':'event'})"><i></i><div><h3 id="dvcPopTitle">${E(j.event)}</h3><small>${E(phaseName(kind))} · ${E(when)}</small></div></div>
  <div class="pop-row"><span data-icon="folder"></span><div><b class="mono">${E(j.no)}</b> &nbsp;${statusPill(j.status)}${j.priority&&j.priority!=='Normal'?` <span class="prio ${E(j.priority.toLowerCase())}">${E(j.priority)}</span>`:''}</div></div>
  <div class="pop-row"><span data-icon="pin"></span><div><b>${E(j.venueId?nameOf('venues',j.venueId):'Venue not set')}</b>${j.clientId?'<br>'+E(nameOf('clients',j.clientId)):''}</div></div>
  <div class="pop-row"><span data-icon="people"></span><div><b>${E(jobSiteManager(j)||'Site manager not set')}</b><br>${crew.length?E(crew.slice(0,4).map(c=>c.name+' ('+c.role+')').join(', '))+(crew.length>4?' +'+(crew.length-4):''):'No crew assigned'}</div></div>
  ${issues.length?`<div class="pop-row"><span data-icon="alert"></span><div>${issues.slice(0,3).map(m=>`<span class="tag ${/^Crew overlap with/.test(m)?'danger':'warn'}" style="margin:0 4px 4px 0" title="${E(m)}">${/^Crew overlap with/.test(m)?'CREW OVERLAP':/^Missing/.test(m)?'TIMES MISSING':'CHECK'}</span>`).join('')}</div></div>`:''}
  <div class="pop-actions"><button class="btn primary sm" onclick="closeCalendarPopover();openView('${E(j.id)}')">Open job card</button><button class="btn sm" onclick="closeCalendarPopover();openDay('${E(seg&&seg.timed===false?selected:(stampFrom||dateFrom||selected).slice(0,10))}')">Running order</button></div></div>`;
  place(anchor);
  const first=pop.querySelector('.pop-actions .btn');if(first)first.focus({preventScroll:true});
 }
 function openDayList(s,anchor){
  const items=entries(s);
  pop.innerHTML=`<div class="pop-head"><button class="icon-btn" onclick="closeCalendarPopover()" aria-label="Close" title="Close"><span data-icon="x"></span></button></div><div class="pop-body"><div class="pop-title"><i style="background:var(--accent)"></i><div><h3 id="dvcPopTitle">${E(label(s,{weekday:'long',day:'numeric',month:'long'}))}</h3><small>${items.length} item${items.length===1?'':'s'} · ${E(TZA(atStamp(s+'T12:00')))}</small></div></div><div class="pop-list">${items.map(e=>jobButton(e,'compact')).join('')}</div><div class="pop-actions"><button class="btn sm" data-cal-open-date="${s}">Day view</button><button class="btn sm" onclick="closeCalendarPopover();newJobOn('${s}')">New job on this date</button></div></div>`;
  place(anchor);
 }
 window.newJobOn=function(s){openJobModal();const f=document.getElementById('f_from');if(f){f.value=s;updateDatePreview();renderEditorScheduleWarnings();}toast('Event date prefilled — review and save when ready.');};
 window.showJobInCalendar=function(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;selected=setupStart(j)||j.eventFrom||todayISO();mode=phone()?'agenda':'week';switchView('schedule');render();};
 window.setCalendarMode=function(m,day){if(['month','week','day','agenda'].includes(m))mode=m;if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day))selected=day;render();};
 function shift(n){selected=mode==='month'?C.shiftMonth(selected,n):C.add(selected,n*(mode==='week'?7:mode==='agenda'?30:1));render();}
 shell.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!shell.contains(b))return;const d=b.dataset;
  if(d.calJob){e.stopPropagation();if(popJob===d.calJob&&!pop.hidden){closePopover();return;}openJobPopover(d.calJob,d.calKind||'event',b);return;}
  if(d.calDayList){e.stopPropagation();openDayList(d.calDayList,b);return;}
  if(d.calToggle){show[d.calToggle]=!show[d.calToggle];}
  else if(d.calMode){mode=d.calMode;}
  else if(d.calDate){selected=d.calDate;if(mode==='agenda'&&!phone())mode='day';}
  else if(d.calOpenDate){selected=d.calOpenDate;mode='day';}
  else if(d.calAction==='create'){openJobModal();return;}
  else if(d.calAction==='today'){selected=todayISO();}
  else if(d.calAction==='mini-prev'||d.calAction==='mini-next'){selected=C.shiftMonth(selected,d.calAction==='mini-prev'?-1:1);}
  else if(d.calAction==='prev'||d.calAction==='next'){shift(d.calAction==='prev'?-1:1);return;}
  else return;
  render();
 });
 shell.addEventListener('change',e=>{if(e.target.dataset.calFilter){show[e.target.dataset.calFilter]=e.target.checked;render();}});
 document.addEventListener('click',e=>{if(!pop.hidden&&!pop.contains(e.target)&&!e.target.closest('[data-cal-job],[data-cal-day-list]'))closePopover();});
 document.addEventListener('keydown',e=>{
  if(!document.getElementById('view-schedule').classList.contains('active')||document.querySelector('.modal.open')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  const k=e.key.toLowerCase(),modes={m:'month',w:'week',d:'day',a:'agenda'};
  if(modes[k]){mode=modes[k];render();}else if(k==='t'){selected=todayISO();render();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(document.activeElement.closest&&document.activeElement.closest('.dvc-time-scroll'))return;shift(e.key==='ArrowLeft'?-1:1);}else return;
  e.preventDefault();
 });
 // Keep the "now" line (company zone) and widgets current without touching records.
 setInterval(()=>{if(document.getElementById('view-schedule').classList.contains('active')&&pop.hidden&&(mode==='week'||mode==='day'))render();},60000);
 const previousSwitch=window.switchView;window.switchView=function(v){previousSwitch(v);if(v==='schedule')render();else closePopover();};
 renderSchedule=render;calShift=shift;calToday=function(){selected=todayISO();render();};render();
}
