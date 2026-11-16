/* DVI editor presentation. The timeline reads the existing phase model and never
   writes job data, preferences, catalogues, storage, or network state. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DviTimeline=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function model(jobs,start,days,calendar){
    return Array.from({length:days},(_,i)=>{
      const date=calendar.add(start,i),segments=jobs.flatMap(j=>calendar.segments(j,date));
      return {date,events:segments.filter(p=>p.kind==='event').length,setups:segments.filter(p=>p.kind==='setup').length};
    });
  }
  return {model};
});
if(typeof document!=='undefined'){
  let timelineStart=DviCalendar.add(todayISO(),-2),timelineSelection=todayISO();
  // Dope Sheet: channel region (left), frame ruler with playhead, keyframe diamonds and hold bars.
  function renderProductionTimeline(){
    const host=$('timelineGrid');if(!host)return;
    const DAYS=14,rows=DviTimeline.model(state.jobs,timelineStart,DAYS,DviCalendar),today=todayISO();
    const days=rows.map(r=>r.date),col=d=>days.indexOf(d);
    $('timelinePeriod').textContent=dayShort(days[0])+' – '+dayShort(days.at(-1));
    const jobs=state.jobs.filter(j=>j.status!=='Cancelled'&&days.some(d=>setupCovers(j,d)||jobLiveOn(j,d))).sort((a,b)=>(setupStart(a)||a.eventFrom||'').localeCompare(setupStart(b)||b.eventFrom||''));
    const shown=jobs.slice(0,10);
    // Contiguous runs of a phase inside the window become hold bars with keys at both ends.
    const runs=(j,kind)=>{const on=days.map(d=>kind==='setup'?setupCovers(j,d):jobLiveOn(j,d)),out=[];let s=-1;on.forEach((v,i)=>{if(v&&s<0)s=i;if((!v||i===on.length-1)&&s>=0){out.push([s,v?i:i-1]);s=-1;}});return out;};
    const keys=(r,kind)=>r.map(([a,b])=>`<span class="ds-hold ${kind}" style="grid-column:${a+1}/${b+2}"><i class="ds-key"></i>${b>a?'<i class="ds-key end"></i>':''}</span>`).join('');
    const sumKeys=kind=>rows.map((r,i)=>r[kind]?`<span class="ds-hold dot ${kind.slice(0,-1)}" style="grid-column:${i+1}" title="${r[kind]} ${kind}"><i class="ds-key"></i><b>${r[kind]>1?r[kind]:''}</b></span>`:'').join('');
    const any=rows.map((r,i)=>r.events||r.setups?`<span class="ds-hold dot" style="grid-column:${i+1}"><i class="ds-key summary"></i></span>`:'').join('');
    const ti=col(today),si=col(timelineSelection);
    host.style.setProperty('--days',DAYS);
    host.innerHTML=`<div class="ds-channels" aria-hidden="true"><div class="ds-scrub-pad"></div><div class="ds-ch summary"><span class="bl-tri open"></span>Summary</div><div class="ds-ch"><i class="tagc setup"></i>Setups</div><div class="ds-ch"><i class="tagc event"></i>Events</div>${shown.map(j=>`<div class="ds-ch job" title="${esc(j.no+' · '+j.event)}"><span class="mono">${esc(String(j.no).split('-').at(-1))}</span>${esc(j.event)}</div>`).join('')}${jobs.length>shown.length?`<div class="ds-ch more">+${jobs.length-shown.length} more</div>`:''}</div>
     <div class="ds-main">
      <div class="ds-scrub" role="group" aria-label="Days">${rows.map(r=>`<button class="ds-frame${r.date===today?' today':''}${r.date===timelineSelection?' selected':''}" data-timeline-date="${r.date}" aria-pressed="${r.date===timelineSelection}" aria-label="${esc(dayShort(r.date))}, ${r.events} events, ${r.setups} setups">${Number(r.date.slice(8))}</button>`).join('')}</div>
      <div class="ds-rows">
       <div class="ds-row summary">${any}</div><div class="ds-row">${sumKeys('setups')}</div><div class="ds-row">${sumKeys('events')}</div>
       ${shown.map(j=>`<button class="ds-row job" onclick="openView('${j.id}')" aria-label="${esc(j.no+' '+j.event)}">${keys(runs(j,'setup'),'setup')}${keys(runs(j,'event'),'event')}</button>`).join('')}
       ${jobs.length>shown.length?'<div class="ds-row more"></div>':''}
       ${si>=0?`<span class="ds-sel" style="grid-column:${si+1}"></span>`:''}
       ${ti>=0?`<span class="ds-playhead" style="grid-column:${ti+1}"></span>`:''}
      </div>
     </div>`;
    host.querySelectorAll('[data-timeline-date]').forEach(b=>{
      b.addEventListener('click',()=>{timelineSelection=b.dataset.timelineDate;renderProductionTimeline();host.querySelector('[data-timeline-date="'+timelineSelection+'"]').focus({preventScroll:true});});
      b.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();timelineSelection=b.dataset.timelineDate;openTimelineDay();}});
    });
  }
  window.shiftProductionTimeline=function(days){const next=DviCalendar.add(timelineStart,days);if(next>='1900-01-01'&&next<='9998-12-17'){timelineStart=next;timelineSelection=DviCalendar.add(timelineSelection,days);renderProductionTimeline();}};
  window.resetProductionTimeline=function(){timelineSelection=todayISO();timelineStart=DviCalendar.add(timelineSelection,-2);renderProductionTimeline();};
  window.openTimelineDay=function(){switchView('dispatch');$('dispatchDate').value=timelineSelection;renderDispatch();};
  function updateEditorPresentation(){
    if($('wbResourceCollections'))$('wbResourceCollections').innerHTML=[['people','Crew',state.technicians.length],['pin','Venues',state.venues.length],['settings','Equipment',state.equipment.length]].map(([symbol,name,count])=>`<button class="wb-resource-row" onclick="switchView('settings')"><span aria-hidden="true">›</span><span data-icon="${symbol}"></span><span>${name}</span><small>${count}</small></button>`).join('');

  }
  const previousRender=renderAll;renderAll=function(){previousRender();renderProductionTimeline();updateEditorPresentation();};
  const previousSwitch=switchView;switchView=function(view){previousSwitch(view);updateEditorPresentation();};
  const previousChart=renderProductionChart;renderProductionChart=function(){previousChart();updateEditorPresentation();};
  renderProductionTimeline();updateEditorPresentation();
}
