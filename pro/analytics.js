/* Operational analytics: pure functions over saved job records.
   No storage, network, randomness or invented values. A "job-day" is one job
   covering one civil date by its recorded setup or event dates; cancelled jobs
   are excluded unless a function says otherwise. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviAnalytics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATUSES=['Draft','Scheduled','Setup','In Progress','Completed','Cancelled'];
const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const date=s=>new Date(s+'T12:00:00Z');
function add(s,n){const d=date(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function span(a,b){return Math.round((date(b)-date(a))/864e5);}
function days(start,end){const out=[];if(!start||!end||end<start)return out;for(let s=start;s<=end;s=add(s,1))out.push(s);return out;}
const setupFrom=j=>j.setupFrom||j.setupDate||j.setupTo||'';
const setupTo=j=>j.setupTo||j.setupFrom||j.setupDate||'';
const eventFrom=j=>j.eventFrom||j.eventTo||'';
const eventTo=j=>j.eventTo||j.eventFrom||'';
const cancelled=j=>j.status==='Cancelled';
function setupOn(j,d){const a=setupFrom(j),b=setupTo(j);return !!(a&&b&&a<=d&&d<=b);}
function eventOn(j,d){const a=eventFrom(j),b=eventTo(j);return !!(a&&b&&a<=d&&d<=b);}
function activeOn(j,d){return setupOn(j,d)||eventOn(j,d);}
// Every recorded date of a job, clipped to [start,end].
function coveredDays(j,start,end){
 const out=new Set();
 for(const [a,b] of [[setupFrom(j),setupTo(j)],[eventFrom(j),eventTo(j)]]){
  if(!a||!b||b<a)continue;
  const from=a<start?start:a,to=b>end?end:b;
  for(const d of days(from,to))out.add(d);
 }
 return [...out].sort();
}
function touches(j,start,end){return coveredDays(j,start,end).length>0;}
function inRange(jobs,start,end,includeCancelled){return (jobs||[]).filter(j=>(includeCancelled||!cancelled(j))&&touches(j,start,end));}
function extent(jobs){
 let min='',max='';
 for(const j of jobs||[]){if(cancelled(j))continue;for(const d of [setupFrom(j),setupTo(j),eventFrom(j),eventTo(j)]){if(!d)continue;if(!min||d<min)min=d;if(!max||d>max)max=d;}}
 return min?{start:min,end:max}:null;
}
function summary(jobs,start,end,keysOf){
 const list=inRange(jobs,start,end),people=new Set(),venues=new Set(),clients=new Set();
 let eventDays=0,setupDays=0,timed=0,partial=0,dateOnly=0;
 for(const j of list){
  for(const d of days(start,end)){if(eventOn(j,d))eventDays++;if(setupOn(j,d))setupDays++;}
  if(keysOf)for(const k of keysOf(j))people.add(k);
  if(j.venueId)venues.add(j.venueId);if(j.clientId)clients.add(j.clientId);
  const n=['setupStartAt','eventStartAt','finishAt'].filter(k=>j[k]).length;
  if(n===3)timed++;else if(n)partial++;else dateOnly++;
 }
 return {jobs:list.length,cancelled:inRange(jobs,start,end,true).filter(cancelled).length,eventDays,setupDays,people:people.size,venues:venues.size,clients:clients.size,timed,partial,dateOnly};
}
function statusMix(jobs,start,end){
 const list=inRange(jobs,start,end,true);
 return STATUSES.map(status=>({status,count:list.filter(j=>(j.status||'Draft')===status).length}));
}
function weekdayLoad(jobs,start,end){
 const rows=WEEKDAYS.map(day=>({day,events:0,setups:0}));
 const list=inRange(jobs,start,end);
 for(const d of days(start,end)){
  const i=(date(d).getUTCDay()+6)%7;
  for(const j of list){if(eventOn(j,d))rows[i].events++;if(setupOn(j,d))rows[i].setups++;}
 }
 return rows;
}
// People ranked by distinct civil days they are assigned (crew or site manager) in range.
function topPeople(jobs,start,end,keysOf,limit){
 const m=new Map();
 for(const j of inRange(jobs,start,end)){
  const covered=coveredDays(j,start,end),keys=keysOf(j);
  for(const [key,label] of keys){
   if(!m.has(key))m.set(key,{key,name:label,days:new Set(),jobs:new Set()});
   const p=m.get(key);covered.forEach(d=>p.days.add(d));p.jobs.add(j.id);
  }
 }
 return [...m.values()].map(p=>({key:p.key,name:p.name,days:p.days.size,jobs:p.jobs.size})).sort((a,b)=>b.days-a.days||b.jobs-a.jobs||a.name.localeCompare(b.name)).slice(0,limit||8);
}
function topBy(jobs,start,end,keyOf,labelOf,limit){
 const m=new Map();
 for(const j of inRange(jobs,start,end)){
  for(const key of new Set(keyOf(j).filter(Boolean))){
   if(!m.has(key))m.set(key,{key,name:labelOf(key),jobs:0});
   m.get(key).jobs++;
  }
 }
 return [...m.values()].sort((a,b)=>b.jobs-a.jobs||String(a.name).localeCompare(String(b.name))).slice(0,limit||8);
}
function topEquipment(jobs,start,end,limit){
 return topBy(jobs,start,end,j=>(j.equipment||[]).map(e=>String(e.name||'').trim().toLowerCase()),k=>k,limit).map(r=>{
  const any=(jobs||[]).flatMap(j=>j.equipment||[]).find(e=>String(e.name||'').trim().toLowerCase()===r.key);
  return {...r,name:any?String(any.name).trim():r.key};
 });
}
return {STATUSES,WEEKDAYS,add,span,days,setupOn,eventOn,activeOn,coveredDays,inRange,extent,summary,statusMix,weekdayLoad,topPeople,topBy,topEquipment};
});
