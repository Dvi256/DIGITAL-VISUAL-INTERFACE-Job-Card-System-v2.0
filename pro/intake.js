/* Describe-a-job intake: a deterministic local text parser, not an AI model.
   It extracts only what the description states, matches names already in the
   registers, and flags anything missing or ambiguous. It never creates register
   records, never saves, and makes no network requests. The person reviews every
   field in the normal job editor before saving. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviIntake=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_RE='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const KW={
 setup:/\b(set\s?-?\s?up|setup|build(?:ing)?|rig(?:ging)?|load[- ]?in|install(?:ation)?|mount(?:ing)?)\b/i,
 finish:/\b(finish(?:es|ing)?|ends?|ending|wrap(?:s|ping)?|crew released|release|strike|load[- ]?out|de-?rig)\b/i,
 event:/\b(event|show|showtime|starts?|doors|conference|launch|wedding|concert|meeting|agm|symposium|exhibition|workshop|ceremony|gala|dinner|summit|run|marathon|party|celebration|session|forum)\b/i
};
const pad=n=>String(n).padStart(2,'0');
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function validDate(y,m,d){if(!(y>=1000&&y<=9999&&m>=1&&m<=12&&d>=1))return false;return d<=new Date(Date.UTC(y,m,0)).getUTCDate();}
function addDays(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monthIndex(word){return MONTHS.indexOf(String(word).slice(0,3).toLowerCase())+1;}
// Dates mentioned in a clause, in order. Missing years are filled but reported as assumptions.
function findDates(text,today){
 const out=[],year=Number(today.slice(0,4)),seen=[];
 const push=(index,y,m,d,assumedYear,raw)=>{if(seen.some(([a,b])=>index>=a&&index<b))return null;if(!validDate(y,m,d))return null;const item={index,iso:y+'-'+pad(m)+'-'+pad(d),assumedYear,raw};out.push(item);seen.push([index,index+raw.length]);return item;};
 const resolveYear=(m,d)=>{let y=year;if(validDate(y,m,d)&&(y+'-'+pad(m)+'-'+pad(d))<addDays(today,-31))y++;return y;};
 let r;
 const range=new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|until|till|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?'+MONTH_RE+'\\.?(?:,?\\s+(\\d{4}))?','gi');
 while((r=range.exec(text))){const m=monthIndex(r[3]),y=r[4]?Number(r[4]):resolveYear(m,Number(r[1])),item=push(r.index,y,m,Number(r[1]),!r[4],r[0]);if(item&&validDate(y,m,Number(r[2]))&&Number(r[2])>Number(r[1]))item.rangeEnd=y+'-'+pad(m)+'-'+pad(Number(r[2]));}
 const iso=/\b(\d{4})-(\d{2})-(\d{2})\b/g;while((r=iso.exec(text)))push(r.index,Number(r[1]),Number(r[2]),Number(r[3]),false,r[0]);
 const slash=/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g;while((r=slash.exec(text))){if(!r[3]&&/\d[.]\d/.test(r[0]))continue;const y=r[3]?(r[3].length===2?2000+Number(r[3]):Number(r[3])):resolveYear(Number(r[2]),Number(r[1]));push(r.index,y,Number(r[2]),Number(r[1]),!r[3],r[0]);}
 const dm=new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?'+MONTH_RE+'\\.?(?:,?\\s+(\\d{4}))?','gi');
 while((r=dm.exec(text))){const m=monthIndex(r[2]),d=Number(r[1]),y=r[3]?Number(r[3]):resolveYear(m,d);push(r.index,y,m,d,!r[3],r[0]);}
 const md=new RegExp('\\b'+MONTH_RE+'\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b','gi');
 while((r=md.exec(text))){const m=monthIndex(r[1]),d=Number(r[2]),y=r[3]?Number(r[3]):resolveYear(m,d);push(r.index,y,m,d,!r[3],r[0]);}
 const rel=/\b(day after tomorrow|tomorrow|today|tonight)\b/gi;while((r=rel.exec(text))){const n=/after/i.test(r[1])?2:/tomorrow/i.test(r[1])?1:0;const iso=addDays(today,n);push(r.index,Number(iso.slice(0,4)),Number(iso.slice(5,7)),Number(iso.slice(8,10)),false,r[0]);}
 return out.sort((a,b)=>a.index-b.index);
}
function findTimes(text){
 const out=[];let r;
 const re=/\b(noon|midday|midnight)\b|\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)|\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/gi;
 while((r=re.exec(text))){
  let h,m;
  if(r[1]){h=/midnight/i.test(r[1])?0:12;m=0;}
  else if(r[2]){h=Number(r[2]);m=Number(r[3]||0);if(h<1||h>12||m>59)continue;const pm=/p/i.test(r[4]);if(pm&&h<12)h+=12;if(!pm&&h===12)h=0;}
  else{h=Number(r[5]);m=Number(r[6]);}
  out.push({index:r.index,end:r.index+r[0].length,value:pad(h)+':'+pad(m),raw:r[0]});
 }
 // "9 to 5pm": a bare hour joined to a meridiem time shares its meridiem.
 const bare=/\b(\d{1,2})\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
 while((r=bare.exec(text))){if(out.some(t=>t.index===r.index))continue;let h=Number(r[1]);if(h<1||h>12)continue;const pm=/p/i.test(r[4]);if(pm&&h<12&&h<Number(r[2]))h+=12;out.push({index:r.index,end:r.index+r[1].length,value:pad(h)+':00',raw:r[1]});}
 return out.sort((a,b)=>a.index-b.index);
}
function clauses(text){return text.split(/\n+|;|\.(?!\d)|,(?!\s*\d{4})/).map(s=>s.trim()).filter(Boolean);}
function matchCatalog(text,items,minLen){
 const hay=' '+norm(text)+' ';
 return (items||[]).filter(it=>{const n=norm(it.name);return n.length>=(minLen||3)&&hay.includes(' '+n+' ');});
}
function singular(w){return w.replace(/(ies)$/,'y').replace(/(ses|xes)$/,s=>s.slice(0,-2)).replace(/([^s])s$/,'$1');}
const SYN={mic:'microphone',mics:'microphone',mike:'microphone',mikes:'microphone',genset:'generator',gen:'generator',tv:'tv',pa:'pa',speakers:'speaker',projectors:'projector',lights:'lighting',light:'lighting'};
const tokens=s=>norm(s).split(' ').filter(Boolean).map(w=>SYN[w]||singular(w));
function matchEquipment(text,catalog){
 const found=[];
 // Match within list segments so a size or quantity stays with its own item.
 for(const segment of String(text||'').split(/[,;\n]|\band\b|\bplus\b|\.(?!\d)/i))matchSegment(segment,catalog,found);
 return found;
}
function matchSegment(text,catalog,found){
 const words=tokens(text);
 for(const item of catalog||[]){
  if(found.some(f=>f.itemId===item.id))continue;
  const need=tokens(item.name).filter(w=>!['for','of','and','the','with'].includes(w));if(!need.length)continue;
  for(let i=0;i<words.length;i++){
   const window=words.slice(i,i+need.length+2);
   if(window[0]!==need[0])continue;
   if(need.every(w=>window.includes(w))){
    // Size/dimension may sit either side ("6x3m LED screen", "LED screen 6x3m"); a bare quantity only precedes it.
    const last=i+Math.max(...need.map(w=>window.indexOf(w)));
    const before=words.slice(Math.max(0,i-3),i),after=words.slice(last+1,last+2);
    const dim=w=>/^\d+(?:\.\d+)?x\d+(?:\.\d+)?m?$|^\d+(?:\.\d+)?m$/.test(w);
    const spec=[...before].reverse().find(dim)||after.find(dim)||[...before].reverse().find(w=>/^\d+$/.test(w))||'';
    found.push({itemId:item.id,name:item.name,spec});
    break;
   }
  }
 }
}
function personMatch(name,technicians){const n=norm(name);const m=(technicians||[]).filter(t=>norm(t.name)===n);return m.length===1?m[0]:null;}
function parse(text,catalog,today){
 text=String(text||'').trim();catalog=catalog||{};
 const review=[],flags=[],fields={status:'Draft',priority:'Normal'},crew=[];
 const note=(key,label,display,status,detail)=>review.push({key,label,display:display||'',status,detail:detail||''});
 if(!text)return {fields,crew,equipment:[],review,flags,empty:true};
 // Event name: explicit quotes or "called/titled" first, otherwise the opening words (to confirm).
 let r=text.match(/["“]([^"”]{2,90})["”]/)||text.match(/\b(?:event name|called|titled|named)\s*:?\s+([^,.;\n]{2,80})/i);
 if(r){fields.event=r[1].trim();note('event','Event name',fields.event,'found','Stated explicitly');}
 else{const first=clauses(text)[0]||'',lead=first.split(/\s+(?:for|at|on|in|with|from)\s+/i)[0].trim();
  if(lead&&lead.split(/\s+/).length<=8&&!/^\d/.test(lead)){fields.event=lead.replace(/^(?:a|an|the)\s+/i,'').replace(/^./,c=>c.toUpperCase());note('event','Event name',fields.event,'ambiguous','Taken from the opening words — confirm the name');}
  else note('event','Event name','','missing','Required before saving');}
 // Register matches.
 const types=matchCatalog(text,catalog.eventTypes);
 if(types.length===1){fields.typeId=types[0].id;note('type','Event type',types[0].name,'found','Matches event-type register');}
 else if(types.length>1)note('type','Event type',types.map(t=>t.name).join(' / '),'ambiguous','Several types mentioned — choose one');
 else note('type','Event type','','missing','');
 for(const [kind,label,cue] of [['clients','Client','for'],['venues','Venue','at']]){
  const hits=matchCatalog(text,catalog[kind]),key=kind==='clients'?'clientId':'venueId';
  if(hits.length===1){fields[key]=hits[0].id;note(key,label,hits[0].name,'found','Matches '+label.toLowerCase()+' register');}
  else if(hits.length>1)note(key,label,hits.map(h=>h.name).join(' / '),'ambiguous','More than one register match — choose one');
  else{const m=text.match(new RegExp('\\b'+cue+'\\s+(?:the\\s+)?([A-Z][\\w&\'’-]*(?:\\s+(?:[A-Z][\\w&\'’-]*|of|de|&)){0,5})'));
   if(m&&!KW.event.test(m[1])&&!new RegExp('^'+MONTH_RE+'$','i').test(m[1].split(' ')[0])){note(key,label,m[1].trim(),'unmatched','Not in the '+label.toLowerCase()+' register — add it from the editor if correct');flags.push(label+' “'+m[1].trim()+'” is not in your register. Nothing was created; add it from the editor if it is correct.');}
   else note(key,label,'','missing','');}
 }
 // Site manager and named crew (people already in the crew register only).
 let manager=null;const mm=text.match(/\b(?:site manager|manager|lead|overseer)(?:\s+is|\s+will be)?\s*:?\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})/);
 if(mm){manager=personMatch(mm[1],catalog.technicians);if(manager){fields.siteManagerId=manager.id;note('siteManagerId','Site manager',manager.name,'found','Matches crew register');}else{note('siteManagerId','Site manager',mm[1],'unmatched','Not found in crew register (or name is shared)');flags.push('Site manager “'+mm[1]+'” is not a unique person in the crew register.');}}
 else note('siteManagerId','Site manager','','missing','');
 for(const t of matchCatalog(text,catalog.technicians,4)){if(manager&&t.id===manager.id)continue;if((catalog.technicians||[]).filter(x=>norm(x.name)===norm(t.name)).length>1)continue;crew.push({techId:t.id,roleId:t.role||null});}
 note('crew','Named crew',crew.length?crew.map(c=>(catalog.technicians.find(t=>t.id===c.techId)||{}).name).join(', '):'',crew.length?'found':'missing',crew.length?'People already in the crew register':'');
 const roleAsks=[];for(const role of catalog.roles||[]){const m=text.match(new RegExp('\\b(\\d+)\\s+'+escRe(norm(role.name)).replace(/ /g,'\\s+')+'?s?\\b','i'));if(m)roleAsks.push(m[1]+' × '+role.name);}
 if(roleAsks.length)flags.push('Requested roles without names: '+roleAsks.join(', ')+'. Choose people in the editor.');
 // Equipment from the equipment catalogue only.
 const equipment=matchEquipment(text,catalog.equipment);
 note('equipment','Equipment',equipment.map(e=>(e.spec?e.spec+' ':'')+e.name).join(', '),equipment.length?'found':'missing',equipment.length?'Matches equipment catalogue':'');
 if(/\burgent\b/i.test(text))fields.priority='Urgent';else if(/\bhigh[- ]priority\b|\bpriority:?\s*high\b/i.test(text))fields.priority='High';
 if(fields.priority!=='Normal')note('priority','Priority',fields.priority,'found','Stated in description');
 // Dates and company-zone times by phase.
 const assumed=new Set();let eventDates=[],setupDates=[],eventTimes=[],setupTimes=[],finishTimes=[],looseDates=[],looseTimes=[];
 for(const c of clauses(text)){
  const ds=findDates(c,today),ts=findTimes(c);ds.forEach(d=>{if(d.assumedYear)assumed.add(d.iso);});
  const isSetup=KW.setup.test(c),isFinish=!isSetup&&KW.finish.test(c)&&!KW.event.test(c.replace(KW.finish,'')),isEvent=!isSetup&&!isFinish&&KW.event.test(c);
  const dateList=ds.flatMap(d=>d.rangeEnd?[d.iso,d.rangeEnd]:[d.iso]);
  if(isSetup){setupDates.push(...dateList);setupTimes.push(...ts.map(t=>t.value));}
  else if(isFinish){finishTimes.push(...ts.map(t=>t.value));if(dateList.length)eventDates.push(...dateList.slice(-1));}
  else if(isEvent){eventDates.push(...dateList);if(ts[0])eventTimes.push(ts[0].value);if(ts[1])finishTimes.push(ts[1].value);}
  else{looseDates.push(...dateList);looseTimes.push(...ts.map(t=>t.value));}
 }
 if(!eventDates.length&&looseDates.length){eventDates=looseDates;flags.push('Dates without “setup” or “event” were placed on the event dates — confirm.');}
 if(!eventTimes.length&&looseTimes.length){eventTimes=[looseTimes[0]];if(looseTimes[1]&&!finishTimes.length)finishTimes=[looseTimes[1]];flags.push('Times without “setup” or “event” were treated as event times — confirm.');}
 const span=list=>{const s=[...new Set(list)].sort();return s.length?[s[0],s[s.length-1]]:[];};
 const [ef,et]=span(eventDates),[sf,st]=span(setupDates);
 if(ef){fields.eventFrom=ef;if(et!==ef)fields.eventTo=et;}
 if(sf){fields.setupFrom=sf;if(st!==sf)fields.setupTo=st;fields.setupDate=sf;}
 if(setupTimes[0]&&fields.setupFrom)fields.setupStartAt=fields.setupFrom+'T'+setupTimes[0];
 else if(setupTimes[0])flags.push('Setup time '+setupTimes[0]+' was given without a setup date, so it was not used.');
 if(eventTimes[0]&&fields.eventFrom)fields.eventStartAt=fields.eventFrom+'T'+eventTimes[0];
 else if(eventTimes[0])flags.push('Event time '+eventTimes[0]+' was given without an event date, so it was not used.');
 if(finishTimes[0]){const day=fields.eventTo||fields.eventFrom;
  if(!day)flags.push('Finish time '+finishTimes[0]+' was given without an event date, so it was not used.');
  else if(fields.eventStartAt&&day===fields.eventFrom&&!fields.eventTo&&finishTimes[0]<=eventTimes[0])flags.push('Finish '+finishTimes[0]+' is not after the event start on the same date. If it runs past midnight, enter the finish date in the editor.');
  else fields.finishAt=day+'T'+finishTimes[0];}
 const fmt=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
 const assumedNote=list=>list.some(d=>assumed.has(d))?'Year not stated — assumed; confirm':'';
 note('setupDates','Setup dates',fields.setupFrom?fmt(fields.setupFrom)+(fields.setupTo?' – '+fmt(fields.setupTo):''):'',fields.setupFrom?(assumedNote([fields.setupFrom,fields.setupTo])?'ambiguous':'found'):'missing',assumedNote([fields.setupFrom,fields.setupTo]));
 note('eventDates','Event dates',fields.eventFrom?fmt(fields.eventFrom)+(fields.eventTo?' – '+fmt(fields.eventTo):''):'',fields.eventFrom?(assumedNote([fields.eventFrom,fields.eventTo])?'ambiguous':'found'):'missing',assumedNote([fields.eventFrom,fields.eventTo]));
 // Zone tag for the draft's own time (daylight saving changes the abbreviation).
 const zoneTag=s=>{if(typeof DviScheduling==='undefined'||!DviScheduling.zoneAbbr)return 'EAT';const t=s?DviScheduling.timestamp(s):null,at=t===null?undefined:t;return DviScheduling.zoneAbbr(null,at)||DviScheduling.zoneOffsetText(null,at);};
 for(const [key,label] of [['setupStartAt','Setup start ('+zoneTag(fields.setupStartAt)+')'],['eventStartAt','Event start ('+zoneTag(fields.eventStartAt)+')'],['finishAt','Finish ('+zoneTag(fields.finishAt)+')']])note(key,label,fields[key]?fields[key].slice(11)+' · '+fmt(fields[key].slice(0,10)):'',fields[key]?'found':'missing',fields[key]?'':'Not stated — overlap checks need all three times');
 fields.notes='Drafted from description:\n'+text;
 return {fields,crew,equipment,review,flags,empty:false};
}
return {parse,findDates,findTimes,matchEquipment};
});

if(typeof document!=='undefined'){
 let intakeDraft=null;
 const statusTag={found:'<span class="tag ok">FOUND</span>',ambiguous:'<span class="tag warn">CONFIRM</span>',unmatched:'<span class="tag warn">NOT IN REGISTER</span>',missing:'<span class="tag">MISSING</span>'};
 window.openIntake=function(){const m=$('intakeModal');m.classList.add('open');runIntake();setTimeout(()=>$('intakeText').focus(),40);};
 window.closeIntake=function(){$('intakeModal').classList.remove('open');};
 window.runIntake=function(){
  const text=$('intakeText').value;
  intakeDraft=DviIntake.parse(text,state,todayISO());
  const errors=intakeDraft.empty?[]:DviScheduling.validateJob(Object.assign({},intakeDraft.fields));
  $('intakeOpen').disabled=intakeDraft.empty;
  $('intakeReview').innerHTML=intakeDraft.empty?'<div class="intake-empty"><b>Draft preview</b><p>Write a description and choose Extract draft. Each field shows whether it was found, needs confirming, or is missing.</p></div>'
   :`<table class="intake-table"><tbody>${intakeDraft.review.map(r=>`<tr class="${r.status}"><th scope="row">${esc(r.label)}</th><td><b>${esc(r.display||'—')}</b>${r.detail?`<small>${esc(r.detail)}</small>`:''}</td><td>${statusTag[r.status]||''}</td></tr>`).join('')}</tbody></table>${intakeDraft.flags.length||errors.length?`<div class="intake-flags">${errors.map(e=>`<div><b>Check</b><span>${esc(e)}</span></div>`).join('')}${intakeDraft.flags.map(f=>`<div><b>Note</b><span>${esc(f)}</span></div>`).join('')}</div>`:''}<p class="panel-note" style="margin-top:8px">Status will be <b>Draft</b>. The original description is copied into Notes.</p>`;
 };
 window.openIntakeDraft=function(){
  if(!intakeDraft||intakeDraft.empty)return;
  const d=intakeDraft;closeIntake();openJobModal();
  const set=(id,v)=>{const el=$(id);if(el&&v!=null&&v!=='')el.value=v;};
  set('f_event',d.fields.event);set('f_status','Draft');set('f_priority',d.fields.priority);
  for(const [id,v] of [['f_type',d.fields.typeId],['f_client',d.fields.clientId],['f_venue',d.fields.venueId],['f_site_manager',d.fields.siteManagerId]]){set(id,v);const el=$(id);if(el)el.dataset.prev=el.value;}
  set('f_setup_from',d.fields.setupFrom);set('f_setup_to',d.fields.setupTo);set('f_from',d.fields.eventFrom);set('f_to',d.fields.eventTo);
  set('f_setupStartAt',d.fields.setupStartAt);set('f_eventStartAt',d.fields.eventStartAt);set('f_finishAt',d.fields.finishAt);set('f_notes',d.fields.notes);
  if(d.equipment.length){$('equipRows').innerHTML='';d.equipment.forEach(e=>addEquipRow(e));}
  if(d.crew.length){$('crewRows').innerHTML='';d.crew.forEach(c=>addCrewRow(c));}
  const fieldFor={event:'f_event',type:'f_type',clientId:'f_client',venueId:'f_venue',siteManagerId:'f_site_manager',setupDates:'f_setup_from',eventDates:'f_from',setupStartAt:'f_setupStartAt',eventStartAt:'f_eventStartAt',finishAt:'f_finishAt'};
  document.querySelectorAll('#jobModal .field.attention').forEach(f=>{f.classList.remove('attention');const n=f.querySelector('.field-note');if(n)n.remove();});
  for(const r of d.review){const id=fieldFor[r.key];if(!id||r.status==='found')continue;const field=$(id)&&$(id).closest('.field');if(!field)continue;field.classList.add('attention');const n=document.createElement('span');n.className='field-note';n.textContent=r.status==='missing'?'Not in description':r.detail||'Confirm';field.appendChild(n);}
  updateDatePreview();
  // Notify editor listeners (overlap checks, unsaved-changes indicator) of the prefilled values.
  $('jobModal').dispatchEvent(new Event('change'));
  toast('Draft opened for review — nothing is saved until you press Save.');
 };
 // Clear review highlights once the editor closes.
 const beforeIntakeClose=closeJobModal;closeJobModal=function(){beforeIntakeClose();document.querySelectorAll('#jobModal .field.attention').forEach(f=>{f.classList.remove('attention');const n=f.querySelector('.field-note');if(n)n.remove();});};
}
