/* Pure local scheduling and backup validation. No network or storage access.
   Times are wall-clock "YYYY-MM-DDTHH:MM" in the company's IANA time zone (default
   Africa/Kampala, EAT, UTC+03:00, no daylight saving). Other zones are converted with the
   browser's own time-zone data, so daylight-saving gaps and repeats are handled. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviScheduling=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DEFAULT_ZONE='Africa/Kampala';
let zone=DEFAULT_ZONE;
const formatters=new Map(),stamps=new Map();
function validZone(z){if(typeof z!=='string'||!z||z.length>64)return false;try{new Intl.DateTimeFormat('en-US',{timeZone:z});return true;}catch(_){return false;}}
// The company zone used by timestamps, validation and every "today" / "now" in the app.
function setTimeZone(z){if(!validZone(z))return false;if(z!==zone){zone=z;stamps.clear();}return true;}
// Run fn with another zone in force (e.g. to validate a backup in its own zone).
function withTimeZone(z,fn){const before=zone;if(validZone(z))setTimeZone(z);try{return fn();}finally{setTimeZone(before);}}
function wallClock(z,ms){
 let f=formatters.get(z);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});formatters.set(z,f);}
 const p={};for(const x of f.formatToParts(new Date(ms)))p[x.type]=x.value;
 return {y:+p.year,mo:+p.month,d:+p.day,h:(+p.hour)%24,mi:+p.minute,s:+p.second};
}
// Minutes the zone is ahead of UTC at instant ms (e.g. 180 for Kampala).
function zoneOffset(z,ms){const w=wallClock(z,ms);return Math.round((Date.UTC(w.y,w.mo-1,w.d,w.h,w.mi,w.s)-Math.floor(ms/1000)*1000)/6e4);}
// Instant of a wall-clock stamp in zone z: the earlier one when the clock repeats,
// null when the time does not exist (skipped by a daylight-saving change).
function zonedEpoch(v,z){
 const wall=Date.UTC(+v.slice(0,4),+v.slice(5,7)-1,+v.slice(8,10),+v.slice(11,13),+v.slice(14,16));
 // Offsets range from -12h to +14h, so a day either side brackets any clock change.
 const offMs=t=>{const q=wallClock(z,t);return Date.UTC(q.y,q.mo-1,q.d,q.h,q.mi,q.s)-Math.floor(t/1000)*1000;};
 const found=[];
 for(const o of new Set([offMs(wall-864e5),offMs(wall+864e5)])){
  const ms=wall-o,w=wallClock(z,ms);
  if(Date.UTC(w.y,w.mo-1,w.d,w.h,w.mi)===wall)found.push(ms);
 }
 return found.length?Math.min(...found):null;
}
function pad2(n){return String(n).padStart(2,'0');}
function zoneCity(z){z=z||zone;if(/^(Etc\/)?(UTC|GMT)$/.test(z))return 'UTC';return z.split('/').pop().replace(/_/g,' ');}
function zoneOffsetText(z,ms){const m=zoneOffset(z||zone,ms==null?Date.now():ms),a=Math.abs(m);return 'UTC'+(m<0?'-':'+')+pad2(Math.floor(a/60))+':'+pad2(a%60);}
// Familiar abbreviations where the browser only knows "GMT+3"-style names.
const ABBR={'Africa/Kampala':'EAT','Africa/Nairobi':'EAT','Africa/Dar_es_Salaam':'EAT','Africa/Addis_Ababa':'EAT','Africa/Mogadishu':'EAT','Africa/Djibouti':'EAT','Africa/Asmara':'EAT','Indian/Antananarivo':'EAT','Indian/Comoro':'EAT','Indian/Mayotte':'EAT',
 'Africa/Kigali':'CAT','Africa/Bujumbura':'CAT','Africa/Lusaka':'CAT','Africa/Harare':'CAT','Africa/Maputo':'CAT','Africa/Blantyre':'CAT','Africa/Gaborone':'CAT','Africa/Lubumbashi':'CAT','Africa/Windhoek':'CAT','Africa/Juba':'CAT','Africa/Khartoum':'CAT',
 'Africa/Lagos':'WAT','Africa/Kinshasa':'WAT','Africa/Luanda':'WAT','Africa/Douala':'WAT','Africa/Libreville':'WAT','Africa/Brazzaville':'WAT','Africa/Malabo':'WAT','Africa/Niamey':'WAT','Africa/Ndjamena':'WAT','Africa/Porto-Novo':'WAT','Africa/Bangui':'WAT',
 'Africa/Johannesburg':'SAST','Africa/Maseru':'SAST','Africa/Mbabane':'SAST','Asia/Dubai':'GST','Asia/Kolkata':'IST','Asia/Calcutta':'IST'};
function zoneAbbr(z,ms){z=z||zone;if(ABBR[z])return ABBR[z];if(/^(Etc\/)?(UTC|GMT)$/.test(z))return 'UTC';
 const at=new Date(ms==null?Date.now():ms);
 for(const locale of ['en-US','en-GB']){
  try{const n=(new Intl.DateTimeFormat(locale,{timeZone:z,timeZoneName:'short'}).formatToParts(at).find(p=>p.type==='timeZoneName')||{}).value||'';
   // Browsers differ: London in winter is "GMT" in one and "GMT+0" in another.
   if(/^GMT([+-]0(:00)?)?$/.test(n))return 'GMT';
   if(n&&!/^(GMT|UTC)[+-]/.test(n))return n;}catch(_){}
 }
 return '';}
// "YYYY-MM-DDTHH:MM" wall clock now (or at ms) in the company zone.
function wallNow(ms){const w=wallClock(zone,ms==null?Date.now():ms);return w.y+'-'+pad2(w.mo)+'-'+pad2(w.d)+'T'+pad2(w.h)+':'+pad2(w.mi);}
const dates=['setupFrom','setupTo','setupDate','eventFrom','eventTo'];
const times=['setupStartAt','eventStartAt','finishAt'];
const labels={setupStartAt:'Setup start',eventStartAt:'Event start',finishAt:'Finish'};
const present=v=>v!==undefined&&v!==null&&v!=='';
function validDate(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const [y,m,d]=v.split('-').map(Number);if(y<1000||y>9999||m<1||m>12||d<1)return false;
 return d<=new Date(Date.UTC(y,m,0)).getUTCDate();
}
function timestamp(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)||!validDate(v.slice(0,10)))return null;
 if(Number(v.slice(11,13))>23||Number(v.slice(14,16))>59)return null;
 // Kampala keeps its exact fixed-offset rule; other zones use the browser's zone data.
 if(zone===DEFAULT_ZONE){const n=Date.parse(v+':00+03:00');return Number.isFinite(n)?n:null;}
 const key=zone+'|'+v;if(stamps.has(key))return stamps.get(key);
 const n=zonedEpoch(v,zone);if(stamps.size>50000)stamps.clear();stamps.set(key,n);return n;
}
// Well-formed wall-clock stamp (it may still be skipped by a clock change in some zones).
function wellFormed(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&validDate(v.slice(0,10))&&Number(v.slice(11,13))<=23&&Number(v.slice(14,16))<=59;}
const GAP=/ does not exist in .* \(the clocks go forward\)/;
function validateJob(j){
 const e=[];if(!j||typeof j!=='object'||Array.isArray(j))return ['Invalid job record.'];
 for(const k of dates)if(present(j[k])&&!validDate(j[k]))e.push('Invalid '+k+' date.');
 for(const k of times)if(present(j[k])&&timestamp(j[k])===null)e.push(wellFormed(j[k])?labels[k]+' '+j[k].slice(11)+' on '+j[k].slice(0,10)+' does not exist in '+zoneCity()+' (the clocks go forward); choose a later time.':labels[k]+' must be a valid '+zoneCity()+' date and time.');
 for(const [a,b,label] of [['setupFrom','setupTo','Setup'],['eventFrom','eventTo','Event']])if(validDate(j[a])&&validDate(j[b])&&j[a]>j[b])e.push(label+' end date is before its start date.');
 for(const [key,date,label] of [['setupStartAt',j.setupFrom||j.setupDate,'Setup start'],['eventStartAt',j.eventFrom,'Event start'],['finishAt',j.eventTo,'Finish']])if(timestamp(j[key])!==null&&validDate(date)&&j[key].slice(0,10)!==date)e.push(label+' date must match its existing date field.');
 const s=timestamp(j.setupStartAt),v=timestamp(j.eventStartAt),f=timestamp(j.finishAt);
 if(s!==null&&v!==null&&s>v)e.push('Setup start must be at or before event start.');
 if(v!==null&&f!==null&&v>=f)e.push('Finish must be after event start.');
 if(s!==null&&f!==null&&s>=f)e.push('Finish must be after setup start.');
 return e;
}
function interval(j){if(validateJob(j).length||times.some(k=>timestamp(j[k])===null))return null;return {start:timestamp(j.setupStartAt),end:timestamp(j.finishAt)};}
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
function crewKeys(j,technicians){
 const out=new Map();const techs=Array.isArray(technicians)?technicians:[];
 function add(id,name){
  if(present(id)){const t=techs.find(x=>x.id===id);out.set('id:'+String(id),t&&t.name||name||'Crew '+id);return;}
  const n=norm(name);if(!n)return;
  const matches=techs.filter(t=>norm(t.name)===n);
  if(matches.length===1){out.set('id:'+matches[0].id,matches[0].name);return;}
  // An ambiguous legacy name is not proof of a shared person; do not invent a conflict.
  if(matches.length>1)return;
  out.set('name:'+n,String(name).trim().replace(/\s+/g,' '));
 }
 for(const c of Array.isArray(j.crew)?j.crew:[])add(c.techId,c.name||c.techName);
 add(j.siteManagerId,j.siteManager||j.overallOverseer||j.overseer);
 return out;
}
function cancelled(j){return norm(j.status)==='cancelled';}
function conflicts(j,jobs,technicians){
 const a=interval(j);if(!a||cancelled(j))return [];
 const people=crewKeys(j,technicians);if(!people.size)return [];
 const out=[];
 for(const other of jobs||[]){
  if(other===j||(present(j.id)&&other.id===j.id)||cancelled(other))continue;
  const b=interval(other);if(!b||a.start>=b.end||b.start>=a.end)continue;
  const theirs=crewKeys(other,technicians),crew=[];
  for(const [key,label] of people)if(theirs.has(key))crew.push(label);
  if(crew.length)out.push({job:other,crew});
 }
 return out;
}
// Same results as conflicts() for every job at once, as a Map from job to its overlaps.
// Each interval and crew set is computed once and only jobs whose times overlap are
// compared (sorted sweep), so large registers and crafted backups stay fast.
function conflictIndex(jobs,technicians){
 const techs=Array.isArray(technicians)?technicians:[],byId=new Map(),byName=new Map();
 // Lookups built once; same first-match and ambiguity rules as crewKeys().
 for(const t of techs){if(!t)continue;if(!byId.has(t.id))byId.set(t.id,t);const n=norm(t.name);if(!byName.has(n))byName.set(n,[]);byName.get(n).push(t);}
 const keysOf=j=>{const out=new Map();
  const add=(id,name)=>{
   if(present(id)){const t=byId.get(id);out.set('id:'+String(id),t&&t.name||name||'Crew '+id);return;}
   const n=norm(name);if(!n)return;const matches=byName.get(n)||[];
   if(matches.length===1){out.set('id:'+matches[0].id,matches[0].name);return;}
   if(matches.length>1)return;
   out.set('name:'+n,String(name).trim().replace(/\s+/g,' '));
  };
  for(const c of Array.isArray(j.crew)?j.crew:[])add(c.techId,c.name||c.techName);
  add(j.siteManagerId,j.siteManager||j.overallOverseer||j.overseer);
  return out;};
 const items=[],groups=new Map(),seen=new Set(),hits=new Map(),out=new Map();
 (Array.isArray(jobs)?jobs:[]).forEach((j,i)=>{if(!j||typeof j!=='object'||cancelled(j))return;const iv=interval(j);if(!iv)return;const people=keysOf(j);if(!people.size)return;
  const it={j,i,iv,people};items.push(it);for(const key of people.keys()){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(it);}});
 const add=(a,b)=>{const crew=[];for(const [key,label] of a.people)if(b.people.has(key))crew.push(label);if(!crew.length)return;if(!hits.has(a.j))hits.set(a.j,[]);hits.get(a.j).push({i:b.i,job:b.j,crew});};
 // Sweep each person's bookings separately: only jobs that share someone are compared.
 for(const group of groups.values()){
  group.sort((a,b)=>a.iv.start-b.iv.start||a.i-b.i);let active=[];
  for(const a of group){
   active=active.filter(b=>b.iv.end>a.iv.start);
   for(const b of active){
    if(b.j===a.j||(present(a.j.id)&&b.j.id===a.j.id))continue;
    const pair=a.i<b.i?a.i+'|'+b.i:b.i+'|'+a.i;if(seen.has(pair))continue;seen.add(pair);
    add(a,b);add(b,a);
   }
   active.push(a);
  }
 }
 for(const [j,list] of hits)out.set(j,list.sort((x,y)=>x.i-y.i).map(({job,crew})=>({job,crew})));
 return out;
}
function warnings(j){
 const out=validateJob(j);const missing=times.filter(k=>!present(j[k]));
 if(missing.length)out.push('Missing '+missing.map(k=>labels[k].toLowerCase()).join(', ')+' time(s). Crew overlap cannot be checked until all three '+zoneCity()+' times are entered.');
 return out;
}
// opts.lenient: a well-formed time skipped by a clock change does not reject the records
// (it stays and is reported by warnings()). opts.knownZone: refuse a zone this browser lacks.
function normalizeBackup(raw,opts){
 const input0=raw&&typeof raw==='object'?(raw.state||raw):null,c=input0&&input0.company;
 const own=c&&typeof c==='object'&&typeof c.timeZone==='string'&&c.timeZone?c.timeZone:DEFAULT_ZONE;
 if(opts&&opts.knownZone&&!validZone(own))throw new Error('Invalid backup: time zone "'+String(own).slice(0,64)+'" is not recognised by this browser. Open it in an up-to-date browser.');
 return withTimeZone(validZone(own)?own:DEFAULT_ZONE,()=>normalizeBackupIn(raw,opts||{}));
}
function normalizeBackupIn(raw,opts){
 const fail=msg=>{throw new Error('Invalid backup: '+msg);};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('expected an object.');
 if(present(raw.backupVersion)&&raw.backupVersion!==2)fail('unsupported backup version.');
 const input=raw.state||raw;
 if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.jobs)||!Array.isArray(input.clients))fail('jobs and clients arrays are required.');
 let s;try{s=JSON.parse(JSON.stringify(input));}catch(_){fail('not JSON data.');}
 const object=(x,label)=>{if(!x||typeof x!=='object'||Array.isArray(x))fail(label+' must be an object.');for(const k of Object.keys(x))if(['__proto__','prototype','constructor'].includes(k))fail('unsafe object key.');};
 const str=(x,key,label)=>{if(present(x[key])&&typeof x[key]!=='string')fail(label+' '+key+' must be text.');if(present(x[key])&&/^(id|.*Id)$/.test(key)&&!/^[_A-Za-z0-9-]+$/.test(x[key]))fail(label+' '+key+' contains unsupported characters.');};
 function checkNested(value,depth){if(depth>40)fail('data is too deeply nested.');if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const child of value)checkNested(child,depth+1);return;}object(value,'record');for(const key of Object.keys(value)){if(/^(id|.*Id)$/.test(key))str(value,key,'record');checkNested(value[key],depth+1);}}
 checkNested(s,0);
 function rows(key,required){if(s[key]==null&&!required)s[key]=[];if(!Array.isArray(s[key]))fail(key+' must be an array.');const seen=new Set();for(const x of s[key]){object(x,key+' entry');if(typeof x.id!=='string'||!/^[_A-Za-z0-9-]+$/.test(x.id)||seen.has(x.id))fail(key+' IDs must be unique nonempty text.');seen.add(x.id);}}
 for(const key of ['jobs','clients','venues','technicians','roles','equipment','eventTypes'])rows(key,key==='jobs'||key==='clients');
 // Classic (the live v2.0 look) keeps a person's roles as a list of role ids: the one catalogue field that may be a list (shared records).
 const idList=(x,key,label)=>{for(const id of x[key])if(typeof id!=='string'||!/^[_A-Za-z0-9-]+$/.test(id))fail(label+' '+key+' must be a list of role ids.');};
 for(const key of ['clients','venues','technicians','roles','equipment','eventTypes'])for(const x of s[key]){if(typeof x.name!=='string'||!x.name.trim())fail(key+' name is required.');for(const k of Object.keys(x)){if(key==='technicians'&&k==='roles'&&Array.isArray(x[k]))idList(x,k,key);else str(x,k,key);}}
 if(s.company==null)s.company={};object(s.company,'company');for(const k of Object.keys(s.company))str(s.company,k,'company');
 if(s.meta==null)s.meta={};object(s.meta,'meta');
 if(present(s.seq)&&(!Number.isSafeInteger(s.seq)||s.seq<1))fail('sequence must be a positive integer.');
 for(const j of s.jobs){
  for(const k of [...dates,...times,'no','event','typeId','clientId','venueId','siteManagerId','siteManager','jobCardCreatorId','jobCardCreator','status','priority','notes','overallOverseer','overseer','creator'])str(j,k,'job');
  if(typeof j.event!=='string'||!j.event.trim())fail('job event name is required.');
  if(!present(j.no))j.no=j.id;
  if(!present(j.priority))j.priority='Normal';
  if(!['Normal','High','Urgent'].includes(j.priority))fail('unknown job priority.');
  if(!present(j.status))j.status='Draft';
  if(!['Draft','Scheduled','Setup','In Progress','Completed','Cancelled'].includes(j.status))fail('unknown job status.');
  for(const key of ['crew','equipment','history']){
   if(j[key]==null)j[key]=[];if(!Array.isArray(j[key]))fail('job '+key+' must be an array.');
   for(const x of j[key]){object(x,key+' entry');
    if(key==='crew')for(const k of ['techId','roleId','name','techName'])str(x,k,'crew');
    if(key==='equipment'){for(const k of ['itemId','name','spec'])str(x,k,'equipment');if(x.name==null)x.name='';if(x.spec==null)x.spec='';}
    if(key==='history'){str(x,'text','history');if(x.text==null)x.text='';if(present(x.ts)&&(!Number.isFinite(x.ts)||x.ts<0))fail('invalid history timestamp.');}
   }
  }
  const errors=validateJob(j).filter(e=>!(opts.lenient&&GAP.test(e)));if(errors.length)fail(errors.join(' '));
 }
 return s;
}
return {get TIME_ZONE(){return zone;},DEFAULT_ZONE,setTimeZone,withTimeZone,validZone,zoneOffset,zoneOffsetText,zoneAbbr,zoneCity,wallNow,validDate,timestamp,validateJob,interval,crewKeys,conflicts,conflictIndex,warnings,normalizeBackup};
});
