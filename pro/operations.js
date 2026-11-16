/* DVI Operations workflow layer. All records remain in the existing isolated store. */
let jobMode='list';
let editorBaseline='';
const originalOpenJob=openJobModal;
openJobModal=function(id){originalOpenJob(id);editorBaseline=editorSnapshot();const dirty=document.getElementById('editorDirty');if(dirty)dirty.hidden=true;};
function editorSnapshot(){return JSON.stringify([...document.querySelectorAll('#jobModal input,#jobModal select,#jobModal textarea')].map(x=>[x.id||x.className,x.value]));}
function requestCloseJob(){if(editorSnapshot()!==editorBaseline){confirmBox('Discard the unsaved changes to this job card? Your last saved version will be kept.',closeJobModal);}else closeJobModal();}
const studioTitles={dashboard:'Overview',jobs:'Job cards',schedule:'Schedule',dispatch:'Dispatch',stock:'Stock',insights:'Insights',settings:'People & resources'};
const originalSwitchView=switchView;
switchView=function(v){originalSwitchView(v);const scroller=document.getElementById('workspaceContent');if(scroller&&scroller.scrollTo)scroller.scrollTo({top:0});if(window.scrollTo)window.scrollTo({top:0,behavior:'instant'});$('topTitle').textContent=studioTitles[v]||TITLES[v];document.querySelectorAll('.navbtn[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===v?'page':'false'));document.querySelectorAll('[data-workspace]').forEach(b=>{b.classList.toggle('active',b.dataset.workspace===v);b.setAttribute('aria-current',b.dataset.workspace===v?'page':'false');});if(v==='insights'&&typeof renderInsights==='function')renderInsights();};
function icon(name){return '<span data-icon="'+name+'"></span>';}
function jobPrimaryDate(j){return j.eventFrom||setupStart(j)||j.eventTo||'';}
function jobLiveOn(j,iso){return !!(j.eventFrom&&j.eventFrom<=iso&&iso<=(j.eventTo||j.eventFrom));}
function activeJobs(){return state.jobs.filter(j=>ACTIVE.includes(j.status));}
function daysAhead(n){return addDaysISO(todayISO(),n);}
// Civil date (no clock involved): formatted at noon UTC so no time zone can shift the day.
function dayShort(iso){return new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});}
function timeShort(value){return value?value.slice(11,16):'Time not set';}
function jobGapLabels(j){return [!byId('clients',j.clientId)&&'Client',!byId('venues',j.venueId)&&'Venue',!jobSiteManager(j)&&'Site manager',(!j.crew.length||!j.crew.every(c=>(c.techId&&byId('technicians',c.techId))||(!c.techId&&(c.name||c.techName))))&&'Crew',(!j.setupStartAt||!j.eventStartAt||!j.finishAt)&&'Timing'].filter(Boolean);}
function selectJobStatus(status){$('jStatus').value=status;renderJobs();}
function showJobs(status=''){switchView('jobs');$('jq').value='';$('jClient').value='';selectJobStatus(status);}
// Phase time on a given civil date: exact start on its own date, otherwise an honest label.
function phaseTimeOn(j,iso,kind){
 const stamp=kind==='setup'?j.setupStartAt:j.eventStartAt;
 if(!stamp)return {label:'Time not set',timed:false};
 return stamp.slice(0,10)===iso?{label:stamp.slice(11,16),timed:true}:{label:'Cont.',timed:true};
}
function openDay(iso){
 const jobs=state.jobs.filter(j=>j.status!=='Cancelled'&&(setupCovers(j,iso)||jobLiveOn(j,iso))).sort((a,b)=>(a.setupStartAt||a.eventStartAt||'').localeCompare(b.setupStartAt||b.eventStartAt||''));
 $('dayTitle').textContent=dayShort(iso);
 $('dayContents').innerHTML=jobs.length?'<p class="muted sm">'+jobs.length+' job card'+(jobs.length===1?'':'s')+' · All times are '+esc((z=>z.named?z.abbr+' / '+z.off:z.off)(zoneLabels(DviScheduling.timestamp(iso+'T12:00'))))+'.</p>'+jobs.map(j=>`<button class="day-job" onclick="closeDay();openView('${j.id}')"><div class="day-time"><b>${timeShort(setupCovers(j,iso)?j.setupStartAt:j.eventStartAt)}</b><span>${setupCovers(j,iso)?'Setup':'Event'}</span></div><div><small>${esc(j.no)}</small><h3>${esc(j.event)}</h3><p>${esc(nameOf('venues',j.venueId))} · ${esc(jobSiteManager(j)||'Manager unassigned')}</p></div>${statusPill(j.status)}<span aria-hidden="true" class="row-arrow">→</span></button>`).join('')+`<div class="data-btns" style="margin-top:12px"><button class="btn sm" onclick="closeDay();switchView('dispatch');$('dispatchDate').value='${iso}';renderDispatch()">${icon('signal')}Open in Dispatch</button></div>`:'<div class="empty"><span class="empty-icon" data-icon="calendar"></span><b>Nothing scheduled</b><p>No setup days or events are scheduled for this date.</p><button class="btn primary" onclick="closeDay();openJobModal()">New job card</button></div>';
 $('dayModal').classList.add('open');
}
function closeDay(){$('dayModal').classList.remove('open');}
function openCommand(){$('commandQuery').value='';renderCommand();$('commandModal').classList.add('open');setTimeout(()=>$('commandQuery').focus(),30);}
function closeCommand(){$('commandModal').classList.remove('open');}
function renderCommand(){
 const q=$('commandQuery').value.trim().toLowerCase();
 const jobs=state.jobs.filter(j=>(j.event+' '+j.no+' '+nameOf('clients',j.clientId)+' '+nameOf('venues',j.venueId)).toLowerCase().includes(q)).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,8);
 const actions=[['plus','Create a job card',"closeCommand();openJobModal()",'N'],['text','Describe a job (local draft)',"closeCommand();openIntake()",''],['calendar','Open production schedule',"closeCommand();switchView('schedule')",''],['signal','Open today’s dispatch',"closeCommand();switchView('dispatch')",''],['box','Open stock: two weeks ahead, shortages and hires',"closeCommand();switchView('stock')",''],['chart','Open insights',"closeCommand();switchView('insights')",''],['people','Manage people & resources',"closeCommand();switchView('settings')",''],['download','Export a test backup',"closeCommand();exportJSON()",''],['contrast','Switch light / dark theme',"closeCommand();toggleTheme()",'']];
 $('commandResults').innerHTML=(!q?'<div class="search-group">QUICK ACTIONS</div>'+actions.map(a=>`<button class="search-result" onclick="${a[2]}">${icon(a[0])}<span>${a[1]}</span>${a[3]?`<kbd>${a[3]}</kbd>`:'<span class="result-arrow">→</span>'}</button>`).join(''):'')+(jobs.length?'<div class="search-group">'+(q?'MATCHING JOB CARDS':'RECENT JOB CARDS')+'</div>'+jobs.map(j=>`<button class="search-result" onclick="closeCommand();openView('${j.id}')">${icon('folder')}<span><b>${esc(j.event)}</b><small>${esc(j.no)} · ${esc(nameOf('clients',j.clientId))}</small></span>${statusPill(j.status)}</button>`).join(''):q?'<div class="empty"><b>No matching job cards.</b><p>Try a job number, event, client or venue.</p></div>':'');
}
// Blender factor slider (read-only number field with a proportional fill).
function factorHTML(label,value,max,opts={}){const pct=max?Math.max(0,Math.min(100,value/max*100)):0;return `<${opts.onclick?'button type="button"':'div'} class="factor"${opts.onclick?` onclick="${opts.onclick}"`:''}${opts.title?` title="${esc(opts.title)}"`:''}><i style="width:${pct}%${opts.color?';background:'+opts.color:''}"></i><span>${opts.tag?`<b class="tagc" style="--c:${opts.tag}"></b>`:''}${esc(label)}</span><em>${esc(opts.text!=null?opts.text:String(value))}</em></${opts.onclick?'button':'div'}>`;}
function peopleKeysFor(list){const keys=new Set();for(const j of list)for(const k of DviScheduling.crewKeys(j,state.technicians).keys())keys.add(k);return keys;}
/* Overview, action first (17 November 2026): what is next and what needs doing. Saved records only; nothing here
   writes a record except the "Mark completed" button, which is the card view's own status change. */
// One row per active job card that needs something: most serious first, then the soonest.
const ATTENTION_RANK={critical:0,serious:1,caution:2};
let attentionShowAll=false;
function attentionList(){
 const today=todayISO(),overlaps=DviScheduling.conflictIndex(state.jobs,state.technicians),short=new Map();
 const S=typeof stockLib==='function'&&typeof stockItem!=='undefined'?stockLib():null;
 if(S){const idx=S.index(state.jobs,stockItem);for(const j of state.jobs){if(!S.HOLDS.includes(j.status))continue;const d=S.days(j);if(!d||d[1]<today)continue;const list=S.shortList(j,idx,stockItem);if(list.length)short.set(j.id,list);}}
 const some=list=>list.slice(0,2).join(', ')+(list.length>2?' +'+(list.length-2):''),rows=[];
 for(const j of activeJobs()){
  const issues=[],clash=overlaps.get(j)||[],lack=short.get(j.id),end=j.eventTo||j.eventFrom,gaps=jobGapLabels(j),date=jobPrimaryDate(j);
  // An event that has passed only needs closing: its other gaps no longer matter. These come last.
  if(end&&end<today){rows.push({job:j,sev:'caution',rank:3,date,issues:[j.status==='Draft'?{sev:'caution',text:'Event date passed, still a draft',fix:'Review',act:'view'}:{sev:'caution',text:'Event passed, still '+j.status,fix:'Mark completed',act:'complete'}]});continue;}
  if(clash.length)issues.push({sev:'critical',text:'Crew overlap: '+some([...new Set(clash.flatMap(c=>c.crew))]),fix:'Edit crew',act:'edit'});
  if(lack)issues.push({sev:'serious',text:'Stock short: '+some([...new Set(lack.map(x=>nameOf('equipment',x.id)))]),fix:'Plan hire',act:'edit'});
  if(gaps.length)issues.push({sev:'caution',text:'Missing: '+gaps.join(', ').toLowerCase(),fix:gaps.length===1&&gaps[0]==='Timing'?'Set times':'Complete card',act:'edit'});
  if(issues.length)rows.push({job:j,issues,sev:issues[0].sev,rank:ATTENTION_RANK[issues[0].sev],date});
 }
 return rows.sort((a,b)=>a.rank-b.rank||(a.date||'9999').localeCompare(b.date||'9999')||String(a.job.no).localeCompare(String(b.job.no)));
}
function renderAttention(){
 const box=$('dAttention');if(!box||!state||!Array.isArray(state.jobs))return;
 const rows=attentionList(),count=$('dAttentionCount'),LIMIT=6,shown=attentionShowAll?rows:rows.slice(0,LIMIT);
 if(count)count.textContent=rows.length?String(rows.length):'';
 box.innerHTML=rows.length?shown.map(r=>{
  const j=r.job,top=r.issues[0],id=esc(j.id),fix=top.act==='complete'?`setJobStatus('${id}','Completed')`:top.act==='view'?`openView('${id}')`:`openJobModal('${id}')`;
  return `<div class="att-row" data-sev="${r.sev}"><button type="button" class="att-main" onclick="openView('${id}')" title="${esc('Open '+j.no+' · '+r.issues.map(i=>i.text).join(' · '))}">${statusSymbol(r.sev,r.sev==='critical'?'Critical':r.sev==='serious'?'Serious':'Caution')}<span class="att-text"><b>${esc(j.event)}</b><small>${esc([r.date?dayShort(r.date):'No date',...r.issues.map(i=>i.text)].join(' · '))}</small></span></button><button type="button" class="btn sm att-fix" onclick="${fix}">${esc(top.fix)}</button></div>`;
 }).join('')+(rows.length>LIMIT?`<button type="button" class="att-more" onclick="attentionShowAll=!attentionShowAll;renderAttention()">${attentionShowAll?'Show fewer':'Show all '+rows.length}</button>`:''):`<div class="att-clear">${statusSymbol('normal','Complete')}<span>Nothing needs attention.</span></div>`;
}
// The setups and events still to come on confirmed cards (Scheduled, Setup, In Progress), soonest first. A phase
// with a time counts until that time; a phase with only a date counts for the whole of that day, after the timed ones.
function nextUpMoments(nowMs){
 const today=todayISO(),out=[];
 for(const j of state.jobs){
  if(!['Scheduled','Setup','In Progress'].includes(j.status))continue;
  for(const [kind,date,stamp] of [['setup',setupStart(j),j.setupStartAt],['event',j.eventFrom,j.eventStartAt]]){
   if(!date)continue;
   const at=stamp&&stamp.slice(0,10)===date?DviScheduling.timestamp(stamp):null;
   if(at!==null){if(at>=nowMs)out.push({job:j,kind,date,time:stamp.slice(11,16),at});}
   else if(date>=today)out.push({job:j,kind,date,time:'',at:null});
  }
 }
 return out.sort((a,b)=>(a.date+'T'+(a.time||'99:99')).localeCompare(b.date+'T'+(b.time||'99:99'))||String(a.job.no).localeCompare(String(b.job.no)));
}
function dayGap(from,to){return Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);}
function nextUpWhen(m){const d=dayGap(todayISO(),m.date);return (d<=0?'Today':d===1?'Tomorrow':dayShort(m.date))+(m.time?' '+m.time:'');}
function nextUpUntil(m,nowMs){
 if(m.at===null){const d=dayGap(todayISO(),m.date);return (d<=0?'today':d===1?'tomorrow':'in '+d+' days')+' · time not set';}
 const min=Math.max(0,Math.round((m.at-nowMs)/60000));
 if(min<60)return 'in '+min+' min';
 if(min<48*60){const h=Math.floor(min/60),r=min%60;return 'in '+h+' h'+(r?' '+r+' min':'');}
 return 'in '+Math.round(min/1440)+' days';
}
function renderNextUp(){
 const box=$('dNextUp');if(!box||!state||!Array.isArray(state.jobs))return;
 const nowMs=Date.now(),list=nextUpMoments(nowMs),m=list[0];
 if(!m){box.innerHTML=`<div class="nu-when"><small>Next up</small><b>Nothing scheduled</b></div><div class="nu-main"><span class="nu-meta">No confirmed setup or event from today on.</span></div><div class="nu-acts"><button type="button" class="btn sm" onclick="openJobModal()">${icon('plus')}New job card</button></div>`;return;}
 const j=m.job,id=esc(j.id),venue=j.venueId?nameOf('venues',j.venueId):'',client=j.clientId?nameOf('clients',j.clientId):'',manager=jobSiteManager(j);
 const meta=[j.no,venue!=='—'&&venue,client!=='—'&&client,j.crew.length+' crew',j.equipment.length+' item'+(j.equipment.length===1?'':'s'),manager&&'Site manager '+manager].filter(Boolean).join(' · ');
 const then=list.find(x=>x.job!==j);
 box.innerHTML=`<div class="nu-when"><small>Next up · ${m.kind==='setup'?'Setup':'Event'}</small><b>${esc(nextUpWhen(m))}</b><span class="nu-until">${esc(nextUpUntil(m,nowMs))}</span></div>`+
  `<button type="button" class="nu-main" onclick="openView('${id}')" title="${esc('Open '+j.no)}"><b><i class="tagc ${m.kind}"></i><span>${esc(j.event)}</span></b><span class="nu-meta">${esc(meta)}</span></button>`+
  (then?`<button type="button" class="nu-then" onclick="openView('${esc(then.job.id)}')" title="${esc('Open '+then.job.no)}"><small>Then · ${esc(nextUpWhen(then))}</small><span>${esc(then.job.event)}</span></button>`:'')+
  `<div class="nu-acts"><button type="button" class="btn sm" onclick="openView('${id}')">${icon('folder')}Open</button><button type="button" class="btn sm" onclick="printJob('${id}')">${icon('print')}Print</button><button type="button" class="btn sm" onclick="switchView('dispatch');$('dispatchDate').value='${esc(m.date)}';renderDispatch()">${icon('signal')}Dispatch</button></div>`;
}
renderDashboard=function(){
 const today=todayISO(),jobs=state.jobs,active=activeJobs(),open=jobs.filter(j=>j.status!=='Cancelled');
 const live=open.filter(j=>jobLiveOn(j,today)),setups=open.filter(j=>setupCovers(j,today));
 const horizon=daysAhead(13),upcoming=active.filter(j=>{const d=jobPrimaryDate(j);return d&&d>=today&&d<=horizon;}).sort((a,b)=>jobPrimaryDate(a).localeCompare(jobPrimaryDate(b)));
 const overdue=active.filter(j=>(j.eventTo||j.eventFrom)&&(j.eventTo||j.eventFrom)<today);
 const incomplete=active.filter(j=>jobGapLabels(j).length),overlaps=DviScheduling.conflictIndex(jobs,state.technicians),conflicted=active.filter(j=>(overlaps.get(j)||[]).length);
 const attention=new Set([...incomplete,...conflicted].map(j=>j.id)).size;
 const completed=jobs.filter(j=>j.status==='Completed');
 const todayPeople=peopleKeysFor(open.filter(j=>jobLiveOn(j,today)||setupCovers(j,today))).size;
 const nowStamp=new Date().toLocaleString('sv-SE',{timeZone:DviScheduling.TIME_ZONE}).slice(0,16).replace(' ','T');
 const nowMs=new Date().getTime(),liveNow=open.filter(j=>{const a=DviScheduling.timestamp(j.eventStartAt),b=DviScheduling.timestamp(j.finishAt);return a!==null&&b!==null&&a<=nowMs&&nowMs<b;});
 const next=upcoming.find(j=>jobPrimaryDate(j)>today)||upcoming[0];
 // Header info line, like Blender's editor header text: plain facts, no decoration.
 $('dHero').innerHTML=[`${esc(dayShort(today))} · <span id="heroClock">${esc(nowStamp.slice(11))}</span> ${esc(zoneLabels().abbr)}`,`${live.length} event${live.length===1?'':'s'}, ${setups.length} setup${setups.length===1?'':'s'} today`,liveNow.length?`${statusSymbol('normal','Live')} Live ${liveNow.length}`:'',next?`Next: ${esc(next.no)} ${esc(dayShort(jobPrimaryDate(next)))}`:''].filter(Boolean).join('<span class="sep">|</span>');
 // Statistics panel (Blender scene statistics): label / value rows, each opens its list.
 const statRow=(label,value,onclick,sym,title)=>`<button type="button" class="prop-row stat-row" onclick="${onclick}"${title?` title="${esc(title)}"`:''}><span class="prop-label">${label}</span><span class="prop-value"><b>${sym||''}${value}</b></span></button>`;
 $('dStats').innerHTML=[
  statRow('Events today',live.length,"openDay(todayISO())",'',live.map(j=>j.event).join(', ')),
  statRow('Setups today',setups.length,"openDay(todayISO())",'',setups.map(j=>j.event).join(', ')),
  statRow('Starting ≤ 14 days',upcoming.length,"showJobs('')",'','Active job cards by first date'),
  statRow('People today',todayPeople,"switchView('dispatch');resetDispatchDate()",'','Crew and site managers assigned to today’s jobs (not attendance)'),
  statRow('Completed',`${completed.length} / ${jobs.length}`,"showJobs('Completed')",'')
 ].join('');
 const [year,month]=today.split('-').map(Number),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,monthDays=new Date(Date.UTC(year,month,0)).getUTCDate();
 $('dCalTitle').textContent=MONTHS[month-1]+' '+year;
 let calendar=['M','T','W','T','F','S','S'].map(d=>'<div class="cal-mini-dow">'+d+'</div>').join('')+Array(offset).fill('<div class="cal-mini-day blank"></div>').join('');
 for(let d=1;d<=monthDays;d++){const iso=year+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0');const su=open.some(j=>setupCovers(j,iso)),ev=open.some(j=>jobLiveOn(j,iso)),n=open.filter(j=>setupCovers(j,iso)||jobLiveOn(j,iso)).length;calendar+=`<button class="cal-mini-day${iso===today?' today':''}${n?' has':''}" onclick="openDay('${iso}')" aria-label="${dayShort(iso)}, ${n} job${n===1?'':'s'}"><span>${d}</span>${n?`<span class="cal-dots">${su?'<i style="--c:var(--setup)"></i>':''}${ev?'<i style="--c:var(--event)"></i>':''}</span>`:''}</button>`;}
 $('dMonthCalendar').innerHTML=calendar;
 // Next 7 days as outliner rows: day collections with phase rows (time, colour tag, name, venue).
 let agenda='';
 for(let d=0;d<7;d++){
  const iso=daysAhead(d),rows=[];
  for(const j of open){
   if(setupCovers(j,iso))rows.push({j,kind:'setup',time:phaseTimeOn(j,iso,'setup')});
   if(jobLiveOn(j,iso))rows.push({j,kind:'event',time:phaseTimeOn(j,iso,'event')});
  }
  if(!rows.length)continue;
  rows.sort((a,b)=>(a.time.timed?a.time.label:'99').localeCompare(b.time.timed?b.time.label:'99'));
  agenda+=`<div class="ol-group${d===0?' today':''}"><div class="ol-head"><span class="bl-tri open"></span><span>${d===0?'Today':d===1?'Tomorrow':esc(dayShort(iso))}</span><small>${rows.length}</small></div>${rows.map(r=>`<button class="ol-row ag-row ${r.kind}" onclick="openView('${r.j.id}')" title="${esc((r.kind==='setup'?'Setup':'Event')+' · '+r.j.event+(r.j.venueId?' · '+nameOf('venues',r.j.venueId):'')+(r.time.timed?'':' · time not set'))}"><span class="ol-time${r.time.timed?'':' untimed'}">${esc(r.time.timed?r.time.label:'—')}</span><i class="tagc ${r.kind}"></i><span class="ag-text"><span class="ol-name">${esc(r.j.event)}</span><span class="ol-dim">${esc([r.kind==='setup'?'Setup':'Event',r.j.venueId?nameOf('venues',r.j.venueId):'',r.j.status!=='Scheduled'?r.j.status||'Draft':''].filter(Boolean).join(' · '))}</span></span></button>`).join('')}</div>`;
 }
 $('dAgenda').innerHTML=agenda||`<div class="empty"><b>No setups or events in the next 7 days.</b><button class="btn sm" onclick="openJobModal()">${icon('plus')}New Job Card</button></div>`;
 renderNextUp();renderAttention();
 const recent=[...jobs].sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt)).slice(0,8);
 $('dRecent').innerHTML=recent.length?recent.map(j=>`<button class="ol-row" onclick="openView('${j.id}')"><span class="ol-time mono">${esc(String(j.no).split('-').at(-1))}</span><b class="tagc" style="--c:${SMETA[j.status]?SMETA[j.status][0]:'var(--st-draft)'}"></b><span class="ol-name">${esc(j.event)}</span><span class="ol-dim">${j.eventFrom?esc(dayShort(j.eventFrom)):'No date'} · ${esc(j.status||'Draft')}</span></button>`).join(''):'<div class="empty">No job cards yet.</div>';
 // Pipeline: one read-only factor slider per status (Blender number slider).
 $('dTrend').innerHTML=STATUSES.map(s=>factorHTML(s,jobs.filter(j=>j.status===s).length,jobs.length,{onclick:`showJobs('${s}')`,tag:SMETA[s][0],title:'Show '+s+' job cards'})).join('');
 const ready=active.length-incomplete.length;
 $('dForecast').innerHTML=factorHTML('Complete briefs',ready,active.length||1,{text:active.length?Math.round(ready/active.length*100)+'%':'—',title:'Active job cards with client, venue, site manager, crew and all three times'})+
  (incomplete.length?`<div class="ol-list">${incomplete.slice(0,6).map(j=>`<button class="ol-row" onclick="openJobModal('${j.id}')" title="Edit ${esc(j.no)}">${statusSymbol('caution','Incomplete')}<span class="ol-name">${esc(j.event)}</span><span class="ol-dim">${esc(jobGapLabels(j).join(', '))}</span></button>`).join('')}${incomplete.length>6?`<button class="ol-row" onclick="switchView('dispatch');$('dispatchNeeds').checked=true;renderDispatch()"><span class="ol-name">${incomplete.length-6} more…</span></button>`:''}</div>`:'')+
  `<div class="prop-row"><span class="prop-label">Crew overlaps</span><span class="prop-value"><b>${conflicted.length?statusSymbol('critical','Overlap'):statusSymbol('normal','None')} ${conflicted.length}</b></span></div><p class="prop-hint">Checks recorded details only, not approval.</p>`;
 $('navJobCount').textContent=jobs.length;
 const tabCount=document.getElementById('tabJobCount');if(tabCount){tabCount.textContent=jobs.length;tabCount.hidden=!jobs.length;}
 if(typeof renderProductionChart==='function')renderProductionChart();
};
const originalRenderJobs=renderJobs;
renderJobs=function(){
 originalRenderJobs();
 const tabs=[['','All'],['Draft','Draft'],['Scheduled','Scheduled'],['Setup','Setup'],['In Progress','In progress'],['Completed','Completed'],['Cancelled','Cancelled']];
 $('jobTabs').innerHTML=tabs.map(([s,label])=>`<button class="${$('jStatus').value===s?'active':''}" onclick="selectJobStatus('${s}')" aria-pressed="${$('jStatus').value===s}">${label}<span>${s?state.jobs.filter(j=>j.status===s).length:state.jobs.length}</span></button>`).join('');
 const q=$('jq').value.toLowerCase().trim(),st=$('jStatus').value,cl=$('jClient').value;
 let jobs=state.jobs.filter(j=>(!st||j.status===st)&&(!cl||j.clientId===cl)&&(!q||(j.event+' '+j.no+' '+nameOf('clients',j.clientId)+' '+nameOf('venues',j.venueId)+' '+jobSiteManager(j)+' '+jobCardCreator(j)).toLowerCase().includes(q)));
 const sort=$('jSort').value;jobs.sort((a,b)=>sort==='created'?b.createdAt-a.createdAt:sort==='ev_asc'?jobPrimaryDate(a).localeCompare(jobPrimaryDate(b)):jobPrimaryDate(b).localeCompare(jobPrimaryDate(a)));
 $('jobBoard').innerHTML=(st?[st]:STATUSES).map(s=>`<section class="board-column"><div class="board-heading"><i style="background:${SMETA[s][0]}"></i><h3>${s}</h3><span>${jobs.filter(j=>j.status===s).length}</span></div><div class="board-items">${jobs.filter(j=>j.status===s).map(j=>`<button class="board-card" onclick="openView('${j.id}')"><small>${esc(j.no)}</small><h4>${esc(j.event)}</h4><p>${esc(nameOf('clients',j.clientId))}</p><span class="board-venue">${icon('pin')}${esc(nameOf('venues',j.venueId))}</span><div class="board-foot"><span>${j.eventFrom?dayShort(j.eventFrom):'Date not set'}</span><span>${icon('people')}${j.crew.length}</span></div>${j.priority!=='Normal'?'<span class="prio '+esc((j.priority||'').toLowerCase())+'">'+esc(j.priority||'')+'</span>':''}</button>`).join('')||'<div class="board-empty">No '+s.toLowerCase()+' jobs</div>'}</div></section>`).join('');
 $('jobBoard').hidden=jobMode!=='board';
 $('jobsTable').closest('.table-scroll').hidden=jobMode==='board';
 $('jobsEmpty').hidden=jobMode==='board';
};
function setJobMode(mode){jobMode=mode;for(const key of ['list','board']){$(key+'Mode').classList.toggle('active',mode===key);$(key+'Mode').setAttribute('aria-pressed',String(mode===key));}renderJobs();}
// Month grid used before the calendar studio initialises (and by headless tests).
renderSchedule=function(){
 const first=new Date(calY,calM,1),offset=(first.getDay()+6)%7,days=new Date(calY,calM+1,0).getDate(),today=todayISO();
 $('calLabel').textContent=MONTHS[calM]+' '+calY;if(!$('opsBriefDate').value)$('opsBriefDate').value=today;
 let html=Array(offset).fill('<div class="cal-cell blank"></div>').join('');
 for(let d=1;d<=days;d++){const iso=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');const setup=state.jobs.filter(j=>setupCovers(j,iso)&&j.status!=='Cancelled');const event=state.jobs.filter(j=>jobLiveOn(j,iso)&&j.status!=='Cancelled');const chips=setup.map(j=>`<button class="chip setup" onclick="openView('${j.id}')" title="Setup: ${esc(j.event)}">${esc(j.event)}</button>`).concat(event.map(j=>`<button class="chip" onclick="openView('${j.id}')" title="Event: ${esc(j.event)}">${esc(j.event)}</button>`));html+=`<div class="cal-cell${iso===today?' today':''}"><button class="cal-d" aria-label="Open ${dayShort(iso)} running order" onclick="openDay('${iso}')">${d}</button>${chips.slice(0,3).join('')}${chips.length>3?`<button class="chip more" onclick="openDay('${iso}')">+${chips.length-3} more</button>`:''}</div>`;}
 $('calGrid').innerHTML=html;
};
function refreshKampalaHeader(){const now=new Date();$('topDate').textContent=now.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:DviScheduling.TIME_ZONE});const hm=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:DviScheduling.TIME_ZONE});if($('kampalaClock'))$('kampalaClock').textContent=hm;const hero=document.getElementById('heroClock');if(hero)hero.textContent=hm;if(typeof renderNextUp==='function')renderNextUp();}
// Capture before legacy keyboard handlers: dismiss one layer, never discard its parent.
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();
 // An open header menu is the topmost layer: close it first and return focus to its button.
 const menu=document.getElementById('menuPopup');if(menu&&!menu.hidden&&typeof closeMenus==='function'){const btn=document.querySelector('[data-menu][aria-expanded="true"]');closeMenus();if(btn)btn.focus();return;}
 // On the 3D charts, Escape clears the selection and its tooltip first.
 if(document.activeElement&&document.activeElement.id==='vpCharts'&&!document.querySelector('.modal.open')&&typeof chartsCommand==='function'){chartsCommand('deselect');return;}
 const modal=[...document.querySelectorAll('.modal.open')].sort((a,b)=>Number(getComputedStyle(a).zIndex)-Number(getComputedStyle(b).zIndex)).at(-1);if(modal){if(modal.id==='jobModal')requestCloseJob();else if(modal.id==='quickModal')closeQuick();else if(modal.id==='viewModal')closeView();else modal.classList.remove('open');}else{if(typeof closeCalendarPopover==='function'&&closeCalendarPopover())return;toggleNavigation(false);if(typeof toggleInspector==='function')toggleInspector(false);$('notifPanel').classList.remove('open');}return;}if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('.modal.open')){e.preventDefault();openCommand();}},true);
function renderRecoveryPanel(){
 const panel=$('recoveryPanel');if(!panel||typeof localStorage.key!=='function')return;
 const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith(DB+'_recovery_'))keys.push(key);}
 panel.innerHTML=keys.length?'<div class="recovery-notice"><b>Preserved recovery files</b><p>'+keys.length+' unreadable saved dataset'+(keys.length===1?' was':'s were')+' kept unchanged. Download a copy before clearing browser storage. These files require review before import.</p><div class="data-btns">'+keys.map((key,i)=>'<button class="btn sm" onclick="downloadRecovery(\''+esc(key)+'\')">Download recovery '+(i+1)+'</button>').join('')+'</div></div>':'';
}
function downloadRecovery(key){if(!key.startsWith(DB+'_recovery_'))return;const raw=localStorage.getItem(key);if(raw!==null)dl(companyFileSlug()+'-preserved-recovery-'+key.split('_recovery_')[1]+'.txt',raw,'text/plain');}
renderRecoveryPanel();
renderAll();switchView('dashboard');refreshKampalaHeader();setInterval(refreshKampalaHeader,30000);
