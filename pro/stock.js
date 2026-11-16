/* Stock: pure functions over saved records, with the same rules as Classic (the live v2.0 look), so both
   looks show the same numbers (docs/SHARED_RECORDS.md). No storage, network, clock or randomness: callers
   pass today's date and a lookup for equipment items.
   - An equipment item's `stock` is the number owned: a whole number as text; empty means not tracked.
   - `category` is one of CATEGORIES. A missing one is guessed from the name for display; it is never written.
   - `unitSize` is the size of one panel or deck ("500x1000" in mm, "1.2x2.4" in m).
   - A job holds stock while it is Scheduled, Setup or In Progress, from its first setup day to its last
     event day (366 days at most). Draft cards are checked against others but hold nothing.
   - A job's equipment line may carry `hire`: units hired in from a partner, not taken from the store.
   - A line's units come from its "Qty / Size": "6" = 6, "2 x 75KVA" = 2, "8x3m" = panels or decks when
     the item has a unit size, otherwise 1. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviStock=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const HOLDS=['Scheduled','Setup','In Progress'];
const CATEGORIES=['Screens & video','Sound','Lighting','Staging','Power','Furniture & décor','Media & services','Other'];
// Common types a company can add in one go (Stock › Add common types); each starts untracked.
const STARTER_TYPES=[
 ['LED panel P2.6 indoor (500×500)','Screens & video','500x500'],
 ['LED panel P3.9 indoor (500×500)','Screens & video','500x500'],
 ['LED panel P3.9 indoor (500×1000)','Screens & video','500x1000'],
 ['LED panel P4.8 outdoor (500×1000)','Screens & video','500x1000'],
 ['LED mesh panel (500×1000)','Screens & video','500x1000'],
 ['LED transparent panel (500×1000)','Screens & video','500x1000'],
 ['Stage deck 1.2 × 1.2 m','Staging','1.2x1.2'],
 ['Stage deck 1.2 × 2.4 m','Staging','1.2x2.4'],
 ['Moving head spot','Lighting',''],
 ['Moving head wash','Lighting',''],
 ['Moving head beam','Lighting',''],
 ['LED PAR','Lighting',''],
 ['LED uplighter','Lighting',''],
 ['Follow spot','Lighting',''],
 ['Strobe / blinder','Lighting','']
];
// A calendar date as stored (YYYY-MM-DD); anything else counts as no date.
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T12:00:00Z'))?v:'';
function addDays(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function parseUnitSize(v){
 const m=String(v==null?'':v).trim().toUpperCase().replace(/×/g,'X').match(/^(\d+(?:\.\d+)?)\s*(MM|M)?\s*X\s*(\d+(?:\.\d+)?)\s*(MM|M)?$/);
 if(!m)return null;
 let a=+m[1],b=+m[3];
 if(m[2]==='MM'||m[4]==='MM'||a>20||b>20){a/=1000;b/=1000;}   // 500x1000 means millimetres
 return a>0&&b>0?[a,b]:null;
}
function owned(it){if(!it||it.stock==null)return null;const v=String(it.stock).trim();return /^\d+$/.test(v)?Number(v):null;}
function unitsFor(line,it){
 const spec=String((line&&line.spec)||'').trim().toUpperCase().replace(/×/g,'X').replace(/\s+/g,' ');
 if(!spec)return 1;
 let m=spec.match(/^X?\s*(\d+)\s*(PCS?|PIECES?|UNITS?|SETS?|PAIRS?|NOS?\.?|NO\.?|X)?$/);
 if(m)return Number(m[1]);
 m=spec.match(/^(\d+(?:\.\d+)?)\s*M?\s*X\s*(\d+(?:\.\d+)?)\s*M?$/);
 if(m){const u=parseUnitSize(it&&it.unitSize);return u?Math.ceil(m[1]/u[0]-1e-9)*Math.ceil(m[2]/u[1]-1e-9):1;}
 m=spec.match(/^(\d+)\s*X\s*\S/);
 if(m)return Number(m[1]);
 return 1;
}
function hireOf(line){const n=parseInt(line&&line.hire,10);return n>0?n:0;}
function lineNeed(line,it){return Math.max(0,unitsFor(line,it)-hireOf(line));}
// The days a job holds its equipment: first setup day to last event day, at most 366 days.
function days(j){
 if(!j)return null;
 let a=day(j.setupFrom)||day(j.setupDate)||day(j.setupTo)||day(j.eventFrom)||day(j.eventTo);
 let b=day(j.eventTo)||day(j.eventFrom)||day(j.setupTo)||day(j.setupFrom)||day(j.setupDate)||a;
 if(!a)return null;
 if(b<a){const x=a;a=b;b=x;}
 const cap=addDays(a,366);
 return [a,b>cap?cap:b];
}
const lines=j=>(j&&Array.isArray(j.equipment)?j.equipment:[]).filter(e=>e&&typeof e==='object');
// Every holding job card per item: Map itemId -> [{job, s, e, n}] (n = units taken from the store).
function index(jobs,itemOf){
 const idx=new Map();
 for(const j of Array.isArray(jobs)?jobs:[]){
  if(!j||!HOLDS.includes(j.status))continue;
  const d=days(j);if(!d)continue;
  const per=new Map();
  for(const e of lines(j))if(e.itemId)per.set(e.itemId,(per.get(e.itemId)||0)+lineNeed(e,itemOf(e.itemId)));
  for(const [id,n] of per){if(!n)continue;if(!idx.has(id))idx.set(id,[]);idx.get(id).push({job:j,s:d[0],e:d[1],n});}
 }
 return idx;
}
const holders=(idx,id,iso,exceptId)=>(idx.get(id)||[]).filter(r=>r.s<=iso&&iso<=r.e&&r.job.id!==exceptId);
const used=(idx,id,iso,exceptId)=>holders(idx,id,iso,exceptId).reduce((n,r)=>n+r.n,0);
// For each catalogue item on a job: the units it takes from the store and its tightest day against every
// other booking. k: untracked (no number owned), nodates, short, full (takes the last ones) or ok.
function check(job,idx,itemOf){
 const out={},d=days(job),all=lines(job);
 for(const id of [...new Set(all.map(e=>e.itemId).filter(Boolean))]){
  const it=itemOf(id),have=owned(it),rows=all.filter(e=>e.itemId===id);
  const need=rows.reduce((n,e)=>n+lineNeed(e,it),0),hired=rows.reduce((n,e)=>n+hireOf(e),0);
  if(have===null){out[id]={k:'untracked',need,hired};continue;}
  if(!d){out[id]={k:'nodates',need,hired,owned:have};continue;}
  let worst=null;
  for(let iso=d[0];iso<=d[1];iso=addDays(iso,1)){
   const free=have-used(idx,id,iso,job.id);
   if(!worst||free-need<worst.spare)worst={iso,free,spare:free-need};
  }
  out[id]=Object.assign({k:worst.spare<0?'short':(worst.spare===0&&need>0)?'full':'ok',need,hired,owned:have},worst);
 }
 return out;
}
function shortList(job,idx,itemOf){const c=check(job,idx,itemOf);return Object.keys(c).filter(id=>c[id].k==='short').map(id=>Object.assign({id},c[id]));}
// Job cards whose stock is worth checking: the holding statuses, and drafts before they are confirmed.
const watched=j=>!!j&&(HOLDS.includes(j.status)||j.status==='Draft');
function guessCategory(name){
 const n=String(name||'').toLowerCase();
 if(/light|moving head|\bpar\b|uplight|follow ?spot|strobe|blinder|\bwash\b|\bbeam\b|haze|fog/.test(n))return 'Lighting';
 if(/\bled\b|screen|panel|projector|\btv\b|monitor|video ?wall|display|pixel/.test(n))return 'Screens & video';
 if(/\bpa\b|speaker|micro|\bmics?\b|mixer|amplifier|sound|audio|sub ?woofer|line array/.test(n))return 'Sound';
 if(/platform|stage|deck|truss|plinth|podium|frame|backdrop|dance floor|riser|barricade|steps?\b/.test(n))return 'Staging';
 if(/generator|cable|extension|power|distro|\bups\b|kva/.test(n))return 'Power';
 if(/carpet|chair|table|tent|d[eé]cor|drap|flower|furniture/.test(n))return 'Furniture & décor';
 if(/photo|video|stream|camera|service/.test(n))return 'Media & services';
 return 'Other';
}
const category=it=>it&&it.category&&CATEGORIES.includes(it.category)?it.category:guessCategory(it&&it.name);
function unitSizeText(u,cat){
 if(!u)return '';
 const t=(u[0]<=1&&u[1]<=1)?Math.round(u[0]*1000)+' × '+Math.round(u[1]*1000)+' mm':u[0]+' × '+u[1]+' m';
 return t+' '+(cat==='Staging'?'decks':cat==='Screens & video'?'panels':'units');
}
// Days from `today` on which tracked items are over-booked, as runs held by the same job cards.
function shortages(items,idx,today){
 const out=[];
 for(const it of Array.isArray(items)?items:[]){
  const have=owned(it),rs=it?idx.get(it.id)||[]:[];
  if(have===null||!rs.length)continue;
  const last=rs.reduce((m,r)=>r.e>m?r.e:m,today);
  let cur=null;
  for(let iso=today;iso<=last;iso=addDays(iso,1)){
   const hs=holders(idx,it.id,iso),n=hs.reduce((s,r)=>s+r.n,0);
   if(n<=have){cur=null;continue;}
   const key=hs.map(r=>r.job.id).join(',');
   if(cur&&cur.key===key){cur.to=iso;cur.max=Math.max(cur.max,n-have);}
   else{cur={item:it,key,from:iso,to:iso,max:n-have,holders:hs};out.push(cur);}
  }
 }
 return out;
}
// Hires still to come: lines with `hire` on checked job cards that have not ended before today.
function plannedHires(jobs,today){
 const out=[];
 for(const j of Array.isArray(jobs)?jobs:[]){
  if(!watched(j))continue;
  const d=days(j);if(d&&d[1]<today)continue;
  for(const e of lines(j)){const n=hireOf(e);if(n)out.push({job:j,line:e,n,days:d});}
 }
 return out;
}
return Object.freeze({HOLDS,CATEGORIES,STARTER_TYPES,addDays,parseUnitSize,owned,unitsFor,hireOf,lineNeed,days,index,holders,used,check,shortList,watched,guessCategory,category,unitSizeText,shortages,plannedHires});
});
