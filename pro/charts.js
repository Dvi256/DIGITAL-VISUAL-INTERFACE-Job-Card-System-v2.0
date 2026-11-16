/* DVI production charts. Presentation only: no storage or network access.
   Every plotted value is a count of saved, non-cancelled job records — nothing
   is estimated, smoothed or sampled. */
(function(root){
 'use strict';
 const RANGES=[[7,'7D'],[30,'1M'],[90,'3M'],[182,'6M'],[365,'1Y']];
 const view={range:30,start:null,events:true,setups:true,people:true,mode:'area',table:false,index:null};
 const SERIES={events:'Events',setups:'Setups',people:'People assigned'};

 // Daily counts. helpers: addDays, live(job,date), setup(job,date), optional people(job) -> person keys.
 function model(jobs,start,days,helpers){
  const eligible=jobs.filter(j=>j.status!=='Cancelled');
  const rows=Array.from({length:days},(_,i)=>{
   const date=helpers.addDays(start,i),active=eligible.filter(j=>helpers.live(j,date)||helpers.setup(j,date));
   const row={date,events:eligible.filter(j=>helpers.live(j,date)).length,setups:eligible.filter(j=>helpers.setup(j,date)).length,people:0};
   if(helpers.people){const keys=new Set();for(const j of active)for(const k of helpers.people(j))keys.add(k);row.people=keys.size;}
   return row;
  });
  const end=rows[rows.length-1].date;
  const unique=eligible.filter(j=>rows.some(r=>helpers.live(j,r.date)||helpers.setup(j,r.date))).length;
  return {rows,end,unique,eventDays:rows.reduce((n,r)=>n+r.events,0),setupDays:rows.reduce((n,r)=>n+r.setups,0),peak:Math.max(0,...rows.map(r=>r.events)),peakPeople:Math.max(0,...rows.map(r=>r.people))};
 }
 function stepPath(rows,key,left,top,width,height,max){
  const unit=width/rows.length,y=v=>top+height-height*v/max;
  return rows.map((r,i)=>(i?'V':'M')+(i?'':left+' ')+y(r[key])+'H'+(left+(i+1)*unit)).join('');
 }
 // Integer axis with 2–5 steps; never fractional people or jobs.
 function niceScale(max,steps){
  steps=steps||4;const top=Math.max(1,max);const raw=top/steps;
  const step=[1,2,5,10,20,25,50,100,200,500,1000].find(s=>s>=raw)||Math.ceil(raw);
  const ceiling=Math.max(step,Math.ceil(top/step)*step);
  return {step,ceiling,ticks:Array.from({length:Math.round(ceiling/step)+1},(_,i)=>i*step)};
 }

 const env=()=>typeof document!=='undefined'&&typeof state!=='undefined'&&typeof jobLiveOn==='function'&&typeof setupCovers==='function';
 const peopleOf=j=>typeof DviScheduling!=='undefined'?[...DviScheduling.crewKeys(j,state.technicians).keys()]:[];
 const helpers=()=>({addDays:addDaysISO,live:jobLiveOn,setup:setupCovers,people:peopleOf});
 const civil=(iso,opts)=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',...opts});
 const narrow=()=>typeof window!=='undefined'&&(window.matchMedia?window.matchMedia('(max-width: 759px)').matches:window.innerWidth<760);
 let frame=null;

 function render(){
  if(!env())return;
  const host=document.getElementById('productionChart');if(!host)return;
  if(!view.start)view.start=DviAnalytics.add(todayISO(),-Math.floor(view.range/3));
  const focusKey=host.contains(document.activeElement)?document.activeElement.getAttribute('data-focus'):null;
  const button=(label,action,value,on,extra)=>`<button type="button" data-action="${action}" data-value="${value}" data-focus="${action}-${value}" aria-pressed="${on}" class="${on?'is-active':''}"${extra||''}>${label}</button>`;
  host.classList.add('production-chart');
  host.innerHTML=`<div class="area-header pc-head"><span data-icon="chart"></span><span class="hdr-label">Production Activity</span><span class="hdr-info">Job-days per day from saved job cards</span><span class="spacer"></span><div class="aligned pc-ranges" role="group" aria-label="Date range">${RANGES.map(([n,l])=>button(l,'range',n,view.range===n,` title="${n} days"`)).join('')}</div></div>
  <div class="area-sub pc-toolbar"><div class="pc-date-tools hdr-group"><button class="icon-btn" type="button" data-action="prev" data-focus="prev" aria-label="Earlier ${view.range} days"><span data-icon="chevron-left"></span></button><label><span class="pc-sr">Start date</span><input type="date" value="${view.start}" min="1900-01-01" max="9998-12-31" data-focus="start" aria-label="Chart start date"></label><button class="icon-btn" type="button" data-action="next" data-focus="next" aria-label="Later ${view.range} days"><span data-icon="chevron-right"></span></button><button class="btn sm" type="button" data-action="today" data-focus="today">Today</button></div>
  <div class="aligned pc-series" role="group" aria-label="Visible channels">${button('<i class="tagc event"></i>Events','series','events',view.events)}${button('<i class="tagc setup"></i>Setups','series','setups',view.setups)}${button('<i class="tagc crew"></i>People','series','people',view.people)}</div>
  <div class="aligned pc-type" role="group" aria-label="Interpolation">${button('Constant','mode','area',view.mode==='area')}${button('Bars','mode','bars',view.mode==='bars')}</div></div>
  <div class="pc-stage"><div class="pc-legend" aria-hidden="true"></div><svg class="pc-svg" role="img"></svg><div class="pc-interaction" tabindex="0" role="group" aria-roledescription="chart" aria-label="Inspect daily production counts. Use Left and Right arrow keys, Home or End; Shift plus arrows pans the range; Enter opens that day’s running order."></div><div class="pc-axis-tag x" hidden></div><div class="pc-axis-tag y" hidden></div><div class="pc-tooltip" hidden></div><div class="pc-empty-host"></div></div>
  <div class="pc-navigator" title="Overview of all recorded activity. Click to move the visible window."><svg preserveAspectRatio="none" role="img" aria-label="Overview of all recorded event activity"></svg></div>
  <div class="pc-stats stat-line"></div>
  <div class="pc-footer"><span class="pc-range-text"></span><button class="text-link" type="button" data-action="table" data-focus="table" aria-expanded="${view.table}" aria-controls="pc-data-table">${view.table?'Hide':'View'} daily data ${view.table?'↑':'→'}</button></div><div class="pc-sr" role="status" aria-live="polite" id="pc-inspection-status"></div>
  <div class="pc-data-host"></div>`;
  host.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{
   const a=el.dataset.action,v=el.dataset.value;
   if(a==='range'){const centre=DviAnalytics.add(view.start,Math.floor(view.range/2));view.range=Number(v);view.start=DviAnalytics.add(centre,-Math.floor(view.range/2));}
   if(a==='mode')view.mode=v;if(a==='series')view[v]=!view[v];if(a==='table')view.table=!view.table;
   if(a==='today')view.start=DviAnalytics.add(todayISO(),-Math.floor(view.range/3));
   if(a==='prev'||a==='next')pan((a==='prev'?-1:1)*view.range,false);
   if(a==='jump'&&v)view.start=DviAnalytics.add(v,-Math.floor(view.range/3));
   view.index=null;render();
  }));
  host.querySelector('input[type="date"]').addEventListener('change',e=>{if(e.target.value&&e.target.checkValidity()){view.start=e.target.value;view.index=null;render();}});
  wire(host);
  draw(host);
  if(focusKey){const target=host.querySelector('[data-focus="'+focusKey+'"]');if(target)target.focus({preventScroll:true});}
 }
 function pan(daysBy,redraw){
  const next=DviAnalytics.add(view.start,daysBy);
  if(next>='1900-01-01'&&next<='9998-01-01')view.start=next;
  if(redraw){const host=document.getElementById('productionChart');if(host)draw(host);}
 }
 function geometry(host){
  const stage=host.querySelector('.pc-stage');
  const W=Math.max(300,stage.clientWidth||600),small=narrow();
  // Blender graph editor: 23 px scrub strip (date ruler + playhead) on top, values legend below it.
  const L=8,R=small?30:40,T=46,PH=small?132:206,GAP=small?14:16,SH=view.people?(small?40:56):0,B=6;
  return {W,L,R,T,PH,GAP,SH,B,H:T+PH+(SH?GAP+SH:0)+B,PW:W-L-R};
 }
 function draw(host){
  const g=geometry(host),data=model(state.jobs,view.start,view.range,helpers()),rows=data.rows;
  const unit=g.PW/rows.length,x=i=>g.L+(i+.5)*unit;
  const enabled=['events','setups'].filter(k=>view[k]);
  const scale=niceScale(Math.max(2,...rows.flatMap(r=>enabled.map(k=>r[k]))),narrow()?3:4),y=v=>g.T+g.PH-g.PH*v/scale.ceiling;
  const pscale=niceScale(Math.max(2,...rows.map(r=>r.people)),2),subTop=g.T+g.PH+g.GAP,py=v=>subTop+g.SH-g.SH*v/pscale.ceiling;
  const today=todayISO(),todayIndex=rows.findIndex(r=>r.date===today);
  frame={g,rows,unit,x,y,py,scale,data,enabled};
  let svg='';
  // Weekend columns help read crew load across a working week.
  if(unit>=4)svg+=rows.map((r,i)=>{const wd=new Date(r.date+'T12:00:00Z').getUTCDay();return wd===0||wd===6?`<rect class="pc-weekend" x="${g.L+i*unit}" y="${g.T}" width="${unit}" height="${g.PH}"/>`:'';}).join('');
  svg+=scale.ticks.map(v=>`<line x1="${g.L}" y1="${y(v)}" x2="${g.W-g.R}" y2="${y(v)}" class="pc-grid"/><text x="${g.W-g.R+6}" y="${y(v)+3.5}" class="pc-axis">${v}</text>`).join('');
  // Time axis: day labels for short ranges, month starts for long ones.
  const ticks=[];
  if(view.range<=31){const every=Math.max(1,Math.ceil(rows.length/Math.max(3,Math.floor(g.PW/58))));rows.forEach((r,i)=>{if(i%every===0)ticks.push([i,civil(r.date,{day:'numeric',month:'short'})]);});}
  else{rows.forEach((r,i)=>{if(r.date.slice(8)==='01'||i===0){const label=r.date.slice(5,7)==='01'||i===0?civil(r.date,{month:'short',year:'2-digit'}):civil(r.date,{month:'short'});ticks.push([i,label]);}});
   const minGap=narrow()?40:52;for(let k=ticks.length-1;k>0;k--)if((ticks[k][0]-ticks[k-1][0])*unit<minGap)ticks.splice(k===1?1:k,1);}
  const bottom=g.H-g.B;
  svg+=`<rect x="0" y="0" width="${g.W}" height="23" class="pc-scrub"/>`;
  svg+=ticks.map(([i,label])=>`<line x1="${g.L+i*unit}" y1="23" x2="${g.L+i*unit}" y2="${bottom}" class="pc-grid"/><text x="${g.L+i*unit+3}" y="15.5" class="pc-axis">${esc(label)}</text>`).join('');
  svg+=`<line x1="${g.L}" y1="${bottom}" x2="${g.W-g.R}" y2="${bottom}" class="pc-axis-line"/><line x1="${g.W-g.R}" y1="${g.T}" x2="${g.W-g.R}" y2="${bottom}" class="pc-axis-line"/>`;
  for(const key of enabled){
   const cls=key==='events'?'event':'setup';
   if(view.mode==='area'){
    const path=stepPath(rows,key,g.L,g.T,g.PW,g.PH,scale.ceiling);
    svg+=`<path d="${path}V${g.T+g.PH}H${g.L}Z" style="fill:var(--${cls});fill-opacity:.12"/><path d="${path}" style="fill:none;stroke:var(--${cls});stroke-width:1.6;stroke-linejoin:miter"/>`;
   }else{
    const n=enabled.length,slot=unit*.74/n,bw=Math.max(.8,slot-(unit>8?1:0));
    svg+=rows.map((r,i)=>r[key]?`<rect x="${g.L+i*unit+unit*.13+enabled.indexOf(key)*slot}" y="${y(r[key])}" width="${bw}" height="${g.T+g.PH-y(r[key])}" rx="${Math.min(1.5,bw/3)}" style="fill:var(--${cls})"/>`:'').join('');
   }
  }
  if(g.SH){
   svg+=`<line x1="${g.L}" y1="${subTop-g.GAP/2}" x2="${g.W-g.R}" y2="${subTop-g.GAP/2}" class="pc-axis-line"/><text x="${g.L+4}" y="${subTop+9}" class="pc-pane-label">PEOPLE ASSIGNED / DAY</text>`;
   svg+=pscale.ticks.filter(v=>v).map(v=>`<line x1="${g.L}" y1="${py(v)}" x2="${g.W-g.R}" y2="${py(v)}" class="pc-grid"/><text x="${g.W-g.R+6}" y="${py(v)+3.5}" class="pc-axis">${v}</text>`).join('');
   const bw=Math.max(.8,unit*.66);
   svg+=rows.map((r,i)=>r.people?`<rect x="${g.L+i*unit+(unit-bw)/2}" y="${py(r.people)}" width="${bw}" height="${subTop+g.SH-py(r.people)}" rx="${Math.min(1.5,bw/3)}" style="fill:var(--crew);opacity:.75"/>`:'').join('');
  }
  // Blender playhead: solid line in the selection colour with the frame (date) in a filled box.
  if(todayIndex>=0){const label=civil(today,{day:'numeric',month:'short'}),bw=Math.max(34,label.length*6.4+10),bx=Math.max(g.L,Math.min(g.W-g.R-bw,x(todayIndex)-bw/2));svg+=`<line x1="${x(todayIndex)}" y1="21" x2="${x(todayIndex)}" y2="${bottom}" class="pc-today"/><rect x="${bx}" y="2" width="${bw}" height="19" rx="4" class="pc-today-box"/><text x="${bx+bw/2}" y="15.5" text-anchor="middle" class="pc-today-label">${esc(label)}</text>`;}
  svg+=`<g class="pc-crosshair" visibility="hidden"><line class="pc-cross-line pc-cross-v" y1="${g.T}" y2="${bottom}"/><line class="pc-cross-line pc-cross-h" x1="${g.L}" x2="${g.W-g.R}"/><circle r="3.5" class="pc-cross-dot" style="fill:var(--event);stroke:var(--chart-bg);stroke-width:2"/></g>`;
  const el=host.querySelector('.pc-svg');
  el.setAttribute('viewBox',`0 0 ${g.W} ${g.H}`);el.setAttribute('height',g.H);
  el.setAttribute('aria-label',`Daily production load from ${civil(view.start,{day:'numeric',month:'long',year:'numeric'})} to ${civil(data.end,{day:'numeric',month:'long',year:'numeric'})}: ${data.eventDays} event job-days, ${data.setupDays} setup job-days, ${data.unique} distinct job cards. Use the daily data table for every count.`);
  el.innerHTML=svg;
  const ia=host.querySelector('.pc-interaction');
  Object.assign(ia.style,{left:g.L/g.W*100+'%',right:g.R/g.W*100+'%',top:'0',bottom:g.B/g.H*100+'%'});
  host.querySelector('.pc-date-tools input').value=view.start;
  // Legend idles on range totals, like a chart symbol line.
  legend(host,null);
  const nearest=!data.unique?nearestActivity():null;
  host.querySelector('.pc-empty-host').innerHTML=!data.unique?`<div class="pc-empty"><b>No scheduled activity in this window</b><p>Only saved events and setup days appear here — nothing is estimated.</p>${nearest?`<button class="btn sm" type="button" data-jump="${nearest}" style="pointer-events:auto">Jump to ${esc(civil(nearest,{day:'numeric',month:'short',year:'numeric'}))}</button>`:''}</div>`:!enabled.length&&!view.people?'<div class="pc-empty"><b>All series are hidden</b><p>Turn on Events, Setups or People.</p></div>':'';
  const jump=host.querySelector('[data-jump]');if(jump)jump.addEventListener('click',()=>{view.start=DviAnalytics.add(jump.dataset.jump,-Math.floor(view.range/3));render();});
  host.querySelector('.pc-stats').innerHTML=[['Job cards',data.unique],['<i class="tagc event"></i>Event job-days',data.eventDays],['<i class="tagc setup"></i>Setup job-days',data.setupDays],['Peak events / day',data.peak],['<i class="tagc crew"></i>Peak people / day',data.peakPeople]].map(([l,v])=>`<span>${l}&nbsp;&nbsp;<b>${v}</b></span>`).join('');
  host.querySelector('.pc-range-text').textContent=civil(view.start,{weekday:'short',day:'numeric',month:'short',year:'numeric'})+' – '+civil(data.end,{weekday:'short',day:'numeric',month:'short',year:'numeric'})+' · '+zoneLabels().city+' dates · cancelled jobs excluded';
  host.querySelector('.pc-data-host').innerHTML=view.table?`<div class="pc-data-wrap" id="pc-data-table" tabindex="0" aria-label="Daily production count data"><table><caption>Daily counts. A multi-day job counts on each covered day; one job can have setup and event activity on the same day. People = distinct crew and site managers assigned to jobs active that day (not attendance).</caption><thead><tr><th scope="col">Date</th><th scope="col">Events</th><th scope="col">Setups</th><th scope="col">People</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${esc(civil(r.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'}))}</th><td>${r.events}</td><td>${r.setups}</td><td>${r.people}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total job-days</th><td>${data.eventDays}</td><td>${data.setupDays}</td><td>—</td></tr></tfoot></table></div>`:'';
  navigator(host);
  if(view.index!==null)inspect(host,view.index,false);
 }
 function nearestActivity(){
  const ext=DviAnalytics.extent(state.jobs);if(!ext)return null;
  const mid=DviAnalytics.add(view.start,Math.floor(view.range/2));
  let best=null,bestGap=Infinity;
  for(const j of state.jobs){if(j.status==='Cancelled')continue;for(const d of [j.eventFrom,j.setupFrom,j.setupDate,j.eventTo,j.setupTo]){if(!d)continue;const gap=Math.abs(DviAnalytics.span(mid,d));if(gap<bestGap){bestGap=gap;best=d;}}}
  return best;
 }
 function legend(host,row){
  const el=host.querySelector('.pc-legend');if(!el||!frame)return;
  const d=frame.data;
  el.innerHTML=row?`<span class="lg-date">${esc(civil(row.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'}))}</span>${view.events?`<span><i class="dot event"></i>Events <b>${row.events}</b></span>`:''}${view.setups?`<span><i class="dot setup"></i>Setups <b>${row.setups}</b></span>`:''}${view.people?`<span><i class="dot crew"></i>People <b>${row.people}</b></span>`:''}`
   :`<span class="lg-date">${view.range}D</span><span><i class="dot event"></i>Events <b>${d.eventDays}</b></span><span><i class="dot setup"></i>Setups <b>${d.setupDays}</b></span><span>Jobs <b>${d.unique}</b></span>`;
 }
 function jobsOn(iso){return state.jobs.filter(j=>j.status!=='Cancelled'&&(jobLiveOn(j,iso)||setupCovers(j,iso)));}
 function inspect(host,index,announce){
  if(!frame)return;
  const {g,rows,x,y}=frame;
  view.index=Math.min(rows.length-1,Math.max(0,index));const r=rows[view.index],xx=x(view.index);
  const cross=host.querySelector('.pc-crosshair');if(!cross)return;
  cross.setAttribute('visibility','visible');
  const v=cross.querySelector('.pc-cross-v');v.setAttribute('x1',xx);v.setAttribute('x2',xx);
  const key=view.events?'events':view.setups?'setups':null,h=cross.querySelector('.pc-cross-h'),dot=cross.querySelector('.pc-cross-dot');
  const tagX=host.querySelector('.pc-axis-tag.x'),tagY=host.querySelector('.pc-axis-tag.y'),stage=host.querySelector('.pc-stage'),sx=stage.clientWidth/g.W;
  if(key){const yy=y(r[key]);h.setAttribute('y1',yy);h.setAttribute('y2',yy);h.setAttribute('visibility','visible');dot.setAttribute('cx',xx);dot.setAttribute('cy',yy);dot.style.fill=key==='events'?'var(--event)':'var(--setup)';dot.setAttribute('visibility','visible');tagY.hidden=false;tagY.textContent=r[key];tagY.style.left=(g.W-g.R+2)*sx+'px';tagY.style.top=yy*sx+'px';}
  else{h.setAttribute('visibility','hidden');dot.setAttribute('visibility','hidden');tagY.hidden=true;}
  tagX.hidden=false;tagX.textContent=civil(r.date,{weekday:'short',day:'2-digit',month:'short',year:'2-digit'});
  tagX.style.left=Math.max(40,Math.min(stage.clientWidth-50,xx*sx))+'px';tagX.style.top=2*sx+'px';
  legend(host,r);
  const tip=host.querySelector('.pc-tooltip'),list=jobsOn(r.date);
  if(list.length){
   tip.hidden=false;
   tip.innerHTML=`<b>${list.length} job card${list.length===1?'':'s'}</b><div class="pc-tip-jobs">${list.slice(0,5).map(j=>`<i>${setupCovers(j,r.date)&&!jobLiveOn(j,r.date)?'Setup':'Event'} · ${esc(j.event)}</i>`).join('')}${list.length>5?`<i>+${list.length-5} more</i>`:''}</div><span>Click or press Enter for the running order</span>`;
   const left=xx*sx+14;tip.style.left=(left+tip.offsetWidth>stage.clientWidth-8?xx*sx-tip.offsetWidth-14:left)+'px';
  }else tip.hidden=true;
  const n=(v,one,many)=>v+' '+(v===1?one:many);
  if(announce)host.querySelector('#pc-inspection-status').textContent=`${civil(r.date,{weekday:'long',day:'numeric',month:'long'})}: ${n(r.events,'event','events')}, ${n(r.setups,'setup','setups')}, ${n(r.people,'person','people')} assigned.`;
 }
 function hide(host){
  const cross=host.querySelector('.pc-crosshair');if(cross)cross.setAttribute('visibility','hidden');
  host.querySelectorAll('.pc-axis-tag,.pc-tooltip').forEach(el=>el.hidden=true);legend(host,null);
 }
 function wire(host){
  const ia=host.querySelector('.pc-interaction');let drag=null;
  const indexAt=e=>{const r=ia.getBoundingClientRect();return Math.floor((e.clientX-r.left)/r.width*frame.rows.length);};
  ia.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,start:view.start,moved:false,id:e.pointerId};try{ia.setPointerCapture(e.pointerId);}catch(_){}} );
  ia.addEventListener('pointermove',e=>{
   if(drag){const dx=e.clientX-drag.x,unitPx=ia.getBoundingClientRect().width/frame.rows.length,shift=Math.round(-dx/unitPx);
    if(Math.abs(dx)>4)drag.moved=true;
    if(drag.moved&&e.pointerType!=='touch'){ia.classList.add('dragging');const next=DviAnalytics.add(drag.start,shift);if(next!==view.start){view.start=next;draw(host);}return;}}
   inspect(host,indexAt(e),false);
  });
  const end=e=>{if(!drag)return;const wasMoved=drag.moved;drag=null;ia.classList.remove('dragging');if(!wasMoved&&e.type==='pointerup'){const i=indexAt(e);if(frame.rows[i]&&typeof openDay==='function')openDay(frame.rows[i].date);}else if(wasMoved)render();};
  ia.addEventListener('pointerup',end);ia.addEventListener('pointercancel',end);
  ia.addEventListener('pointerleave',()=>{if(!drag&&document.activeElement!==ia)hide(host);});
  ia.addEventListener('focus',()=>{const t=frame.rows.findIndex(r=>r.date===todayISO());inspect(host,view.index===null?Math.max(0,t):view.index,true);});
  ia.addEventListener('blur',()=>hide(host));
  ia.addEventListener('keydown',e=>{
   if(['ArrowLeft','ArrowRight'].includes(e.key)&&e.shiftKey){e.preventDefault();pan(e.key==='ArrowRight'?1:-1,true);inspect(host,view.index===null?0:view.index,true);return;}
   if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();inspect(host,e.key==='Home'?0:e.key==='End'?frame.rows.length-1:(view.index===null?0:view.index)+(e.key==='ArrowRight'?1:-1),true);}
   if(e.key==='Enter'&&view.index!==null&&typeof openDay==='function'){e.preventDefault();openDay(frame.rows[view.index].date);}
  });
 }
 // Overview strip: every recorded event-day, with the visible window outlined.
 function navigator(host){
  const nav=host.querySelector('.pc-navigator svg');if(!nav)return;
  const W=Math.max(300,nav.clientWidth||600),H=34,today=todayISO();
  const ext=DviAnalytics.extent(state.jobs)||{start:today,end:today};
  let a=[ext.start,today,view.start].sort()[0],b=[ext.end,today,frame.data.end].sort().at(-1);
  a=DviAnalytics.add(a,-14);b=DviAnalytics.add(b,14);
  const total=DviAnalytics.span(a,b)+1,bucket=total>540?14:total>180?7:1,n=Math.ceil(total/bucket);
  const counts=Array.from({length:n},(_,i)=>{let c=0;for(let k=0;k<bucket;k++){const d=DviAnalytics.add(a,i*bucket+k);for(const j of state.jobs)if(j.status!=='Cancelled'&&jobLiveOn(j,d))c++;}return c;});
  const max=counts.reduce((m,c)=>c>m?c:m,1),u=W/n;   // a loop, not a spread: very long date ranges overflow the call stack
  const path='M0 '+H+counts.map((c,i)=>'L'+(i*u).toFixed(1)+' '+(H-3-(H-8)*c/max).toFixed(1)+'L'+((i+1)*u).toFixed(1)+' '+(H-3-(H-8)*c/max).toFixed(1)).join('')+'L'+W+' '+H+'Z';
  const wx=DviAnalytics.span(a,view.start)/total*W,ww=Math.max(3,view.range/total*W),tx=DviAnalytics.span(a,today)/total*W;
  nav.setAttribute('viewBox',`0 0 ${W} ${H}`);
  nav.innerHTML=`<path d="${path}" class="nav-area"/><rect class="nav-shade" x="0" y="0" width="${Math.max(0,wx)}" height="${H}"/><rect class="nav-shade" x="${wx+ww}" y="0" width="${Math.max(0,W-wx-ww)}" height="${H}"/><rect class="nav-window" x="${wx}" y="0.5" width="${ww}" height="${H-1}" rx="2"/><line x1="${tx}" x2="${tx}" y1="0" y2="${H}" class="pc-today"/><text x="4" y="11" class="nav-label">${esc(civil(a,{month:'short',year:'numeric'}))}</text><text x="${W-4}" y="11" text-anchor="end" class="nav-label">${esc(civil(b,{month:'short',year:'numeric'}))}</text>`;
  const strip=host.querySelector('.pc-navigator');
  strip.onclick=e=>{const r=strip.getBoundingClientRect(),d=DviAnalytics.add(a,Math.round((e.clientX-r.left)/r.width*total));view.start=DviAnalytics.add(d,-Math.floor(view.range/2));view.index=null;render();};
 }

 /* ---------- Insights workspace ---------- */
 const insights={preset:'quarter',from:null,to:null};
 function insightsRange(){
  const t=todayISO(),A=DviAnalytics;
  if(insights.preset==='month'){const first=t.slice(0,8)+'01';return [first,A.add(A.add(first,32).slice(0,8)+'01',-1)];}
  if(insights.preset==='quarter')return [A.add(t,-89),t];
  if(insights.preset==='next')return [t,A.add(t,89)];
  if(insights.preset==='year')return [t.slice(0,4)+'-01-01',t.slice(0,4)+'-12-31'];
  if(insights.preset==='all'){const e=A.extent(state.jobs);return e?[e.start,e.end]:[t,t];}
  return [insights.from||A.add(t,-29),insights.to||t];
 }
 // Blender number slider rows: the fill shows the share of the largest value; text gives the exact count.
 function factors(rows,valueKey,unitLabel,tagOf){
  const max=Math.max(1,...rows.map(r=>r[valueKey]));
  return rows.length?`<div class="factor-list">${rows.map(r=>`<div class="factor" title="${esc(r.name)}: ${r[valueKey]} ${unitLabel}"><i style="width:${r[valueKey]/max*100}%"></i><span>${tagOf?`<b class="tagc" style="--c:${tagOf(r)}"></b>`:''}${esc(r.name)}</span><em>${r[valueKey]}</em></div>`).join('')}</div>`:'<p class="prop-hint">No records in this period.</p>';
 }
 function dataTable(head,rows){return `<details class="ins-data"><summary>Data</summary><table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${esc(c)}</td>`:`<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')||`<tr><td colspan="${head.length}">No records</td></tr>`}</tbody></table></details>`;}
 function panel(title,body,note){return `<section class="bl-panel open"><button class="bl-panel-head" type="button" aria-expanded="true"><span class="bl-tri"></span>${title}${note?`<span class="spacer"></span><span class="count">${note}</span>`:''}</button><div class="bl-panel-body">${body}</div></section>`;}
 function renderInsights(){
  if(!env())return;
  const body=document.getElementById('insightsBody'),tools=document.getElementById('insightsTools');if(!body)return;
  const A=DviAnalytics,[from,to]=insightsRange(),jobs=state.jobs;
  const keysOf=j=>typeof DviScheduling!=='undefined'?[...DviScheduling.crewKeys(j,state.technicians)]:[];
  const presets=[['month','This Month'],['quarter','Last 90 Days'],['next','Next 90 Days'],['year','This Year'],['all','All']];
  tools.innerHTML=`<div class="aligned" role="group" aria-label="Insights period">${presets.map(([k,l])=>`<button type="button" aria-pressed="${insights.preset===k}" class="${insights.preset===k?'is-active':''}" onclick="setInsightsPreset('${k}')">${l}</button>`).join('')}</div><div class="aligned-row"><input type="date" aria-label="From date" value="${from}" onchange="setInsightsRange(this.value,null)"><input type="date" aria-label="To date" value="${to}" onchange="setInsightsRange(null,this.value)"></div>`;
  const s=A.summary(jobs,from,to,j=>keysOf(j).map(k=>k[0]));
  const statusColors={Draft:'var(--st-draft)',Scheduled:'var(--st-scheduled)',Setup:'var(--st-setup)','In Progress':'var(--st-progress)',Completed:'var(--st-completed)',Cancelled:'var(--st-cancelled)'};
  const mix=A.statusMix(jobs,from,to),mixTotal=mix.reduce((n,r)=>n+r.count,0);
  const week=A.weekdayLoad(jobs,from,to);
  const people=A.topPeople(jobs,from,to,keysOf,8);
  const equipment=A.topEquipment(jobs,from,to,8);
  const venues=A.topBy(jobs,from,to,j=>[j.venueId],k=>nameOf('venues',k),6).filter(r=>r.name!=='—');
  const clients=A.topBy(jobs,from,to,j=>[j.clientId],k=>nameOf('clients',k),6).filter(r=>r.name!=='—');
  const completeness=[['All three times',s.timed,'var(--status-normal)'],['Some times',s.partial,'var(--status-caution)'],['Date only',s.dateOnly,'var(--status-off)']];
  const stat=(l,v,h)=>`<div class="prop-row"${h?` title="${esc(h)}"`:''}><span class="prop-label">${l}</span><span class="prop-value"><b>${v}</b></span></div>`;
  const fmt=d=>civil(d,{day:'numeric',month:'short',year:'numeric'});
  body.innerHTML=`<div class="ins-columns">
   <div class="ins-col">
    ${panel('Statistics',stat('Period',esc(fmt(from))+' – '+esc(fmt(to)))+stat('Job cards',s.jobs+(s.cancelled?` <span class="muted">(${s.cancelled} cancelled not counted)</span>`:''))+stat('Event job-days',s.eventDays,'One job covering one day by its recorded event dates')+stat('Setup job-days',s.setupDays,'One job covering one day by its recorded setup dates')+stat('People assigned',s.people,'Distinct crew and site managers (not attendance)')+stat('Venues used',s.venues)+stat('Clients served',s.clients))}
    ${panel('Status Mix',factors(mix.map(r=>({name:r.status,count:r.count})),'count','job cards',r=>statusColors[r.name])+dataTable(['Status','Job cards'],mix.map(r=>[r.status,r.count])),mixTotal+' incl. cancelled')}
    ${panel('Timing Completeness',factors(completeness.map(r=>({name:r[0],count:r[1],c:r[2]})),'count','job cards',r=>r.c)+'<p class="prop-hint">Overlap checks need all three '+esc(zoneLabels().city)+' times.</p>'+dataTable(['Timing','Job cards'],completeness.map(r=>[r[0],r[1]])))}
    ${panel('Load by Weekday',factors(week.map(r=>({name:r.day,events:r.events,setups:r.setups,total:r.events+r.setups})),'total','job-days')+dataTable(['Weekday','Events','Setups'],week.map(r=>[r.day,r.events,r.setups])))}
   </div>
   <div class="ins-col">
    ${panel('Most-Assigned People',factors(people,'days','days assigned',()=> 'var(--crew)')+dataTable(['Person','Days','Job cards'],people.map(p=>[p.name,p.days,p.jobs])),'days · not attendance')}
    ${panel('Equipment Demand',factors(equipment,'jobs','job cards')+dataTable(['Item','Job cards'],equipment.map(e=>[e.name,e.jobs])),'job cards')}
    ${panel('Venues',factors(venues,'jobs','job cards')+dataTable(['Venue','Job cards'],venues.map(v=>[v.name,v.jobs])))}
    ${panel('Clients',factors(clients,'jobs','job cards')+dataTable(['Client','Job cards'],clients.map(c=>[c.name,c.jobs])))}
    ${panel('Operations Brief',`<div class="prop-row"><span class="prop-label">Date</span><span class="prop-value"><input type="date" id="insightsBriefDate" aria-label="Report reference date" value="${esc(todayISO())}"></span></div><div class="prop-row"><span class="prop-label">Print</span><span class="prop-value"><span class="aligned"><button type="button" onclick="insightsBrief('day')">Day</button><button type="button" onclick="insightsBrief('week')">Week</button><button type="button" onclick="insightsBrief('month')">Month</button></span></span></div><p class="prop-hint">Opens a printable 16:9 summary; use Save as PDF in the print dialog.</p>`)}
   </div>
  </div>`;
 }
 root.setInsightsPreset=function(p){insights.preset=p;renderInsights();};
 root.setInsightsRange=function(from,to){const [f,t]=insightsRange();insights.preset='custom';insights.from=from||f;insights.to=to||t;if(insights.to<insights.from)insights.to=insights.from;renderInsights();};
 root.insightsBrief=function(mode){const v=document.getElementById('insightsBriefDate').value,ref=document.getElementById('opsBriefDate');if(ref&&v)ref.value=v;downloadOpsSummary(mode);};
 root.renderProductionChart=render;
 root.renderInsights=renderInsights;
 if(typeof module!=='undefined'&&module.exports)module.exports={model,stepPath,niceScale};
 if(typeof window!=='undefined'){let timer,lastW=0;const soon=()=>{clearTimeout(timer);timer=setTimeout(()=>{render();},140);};window.addEventListener('resize',soon);
  // A chart drawn while its workspace was hidden used a fallback width; redraw at the real
  // width once it is shown, so 11px labels stay 11px instead of being scaled with the SVG.
  const host=document.getElementById('productionChart');
  if(host&&typeof ResizeObserver==='function')new ResizeObserver(es=>{const w=Math.round(es[0].contentRect.width);if(!w){lastW=0;return;}if(w!==lastW){lastW=w;soon();}}).observe(host);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();}
})(typeof window!=='undefined'?window:globalThis);
