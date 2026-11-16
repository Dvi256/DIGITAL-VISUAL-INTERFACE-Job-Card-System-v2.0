
/* ================= STATE ================= */
const DB='dvi_jobcards_v1';   // the website's saved records, the same entry Classic uses
const CLOUD_KEY='dvi_cloud_sync_v1';   // this device's cloud settings, as set in Classic
const CLOUD_CLIENT_KEY='dvi_cloud_client_v1';
const DVI_CLOUD_OWNER='';
const DVI_CLOUD_PROJECT_URL='';
const DVI_CLOUD_ENDPOINT='';
const DVI_CLOUD_POLL_MS=15000;
const DVI_GCAL={id:'',name:'Disconnected development calendar',ctz:'Africa/Nairobi',embed:'',ical:''};
const STATUSES=['Draft','Scheduled','Setup','In Progress','Completed','Cancelled'];
const ACTIVE=['Draft','Scheduled','Setup','In Progress'];
// Status colours resolve through theme tokens (gx.css), so light and dark stay coherent.
const SMETA={
 'Draft':['var(--st-draft)','color-mix(in srgb,var(--st-draft) 14%,transparent)'],
 'Scheduled':['var(--st-scheduled)','color-mix(in srgb,var(--st-scheduled) 14%,transparent)'],
 'Setup':['var(--st-setup)','color-mix(in srgb,var(--st-setup) 14%,transparent)'],
 'In Progress':['var(--st-progress)','color-mix(in srgb,var(--st-progress) 14%,transparent)'],
 'Completed':['var(--st-completed)','color-mix(in srgb,var(--st-completed) 14%,transparent)'],
 'Cancelled':['var(--st-cancelled)','color-mix(in srgb,var(--st-cancelled) 14%,transparent)']
};
const KINDS={
 clients:{label:'Clients / Companies',sing:'Client',icon:'🏢',fields:[['name','Company / client name *'],['contact','Contact person'],['phone','Phone']]},
 venues:{label:'Venues',sing:'Venue',icon:'📍',fields:[['name','Venue name *'],['area','Area / City']]},
 technicians:{label:'Crew / Labour Register',sing:'Crew Member',icon:'👷',fields:[['name','Full name *'],['role','__roleselect'],['otherRoles','__rolesmulti'],['workerType','__labourtype'],['source','Source / supplier / site'],['phone','Phone'],['rateNote','Rate / allowance notes']]},
 roles:{label:'Crew Roles',sing:'Crew Role',icon:'🎚',fields:[['name','Role name *'],['area','__jobarea']]},
 equipment:{label:'Equipment Catalogue',sing:'Equipment Item',icon:'🎛',fields:[['name','Equipment name *'],['category','__equipcat'],['stock','__stock'],['unitSize','__unitsize'],['area','__jobarea']]},
 eventTypes:{label:'Event Types',sing:'Event Type',icon:'🎪',fields:[['name','Event type *']]}
};
// 'DVI Staff' is the stored value for in-house crew in every existing record; it is shown
// with the company's own short name (labourTypeLabel) and never rewritten.
const LABOUR_TYPES=['DVI Staff','Casual','Freelancer','Outsourced Labour'];
// Company profile: this deployment's default. Any company can replace it in Resources;
// it is part of the record set, so it travels with backups.
const DEFAULT_COMPANY={
 name:'Digital Visual Interface',
 shortName:'DVI',
 tagline:'The Event & Conference Company',
 phone:'+256 772 699 467 / +256 701 699 467',
 email:'info@dviuganda.com',
 website:'dviuganda.com',
 address:'DVI offices | WareHouse, 0.2903499, 32.5798297',
 timeZone:'Africa/Kampala',
 jobPrefix:'DVI',
 brandColor:'#d4af37',
 logo:'bundled'
};
const BLANK_COMPANY={name:'Your Company',shortName:'',tagline:'',phone:'',email:'',website:'',address:'',timeZone:'Africa/Kampala',jobPrefix:'JOB',brandColor:'#4772b3',logo:''};
const LOGO_TYPES=['image/png','image/jpeg','image/webp'],LOGO_MAX_BYTES=256*1024;
const PRINT_GOLD='#d4af37';
let state=null, editingJobId=null;
// Last successful persisted snapshot: failed writes must never become committed UI state.
let committedStateJSON=null;
// Exact storage bytes are separate from normalized in-memory rollback state.
let committedRawJSON=null;
let quickKind=null, quickEditId=null, quickTrigger=null, confirmCb=null, confirmOpenedAt=0;
let calY, calM;
let cloudCfg=null, cloudBusy=false, cloudSaveTimer=null, cloudPendingSave=false, cloudLiveTimer=null;
// Set by load() when this browser's records could not be used and a fresh workspace was started:
// 'unreadable' (preserved under a recovery key) or 'missing' (no records saved here). The
// Google-connected page uses it so an empty restart is never sent to Google Drive as deletions.
let loadReset='';

/* ================= HELPERS ================= */
const $=id=>document.getElementById(id);
const uid=()=>'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayISO=()=>new Date().toLocaleDateString('en-CA',{timeZone:DviScheduling.TIME_ZONE});
// Labels for the company time zone: city "Kampala", abbreviation "EAT", offset "UTC+03:00".
// Pass the instant being described (a job's time, a day's local noon); omitted means now.
// "zone" is for views spanning many dates: "London time" when the offset changes in the year.
function zoneLabels(ms){
 const S=DviScheduling,at=Number.isFinite(ms)?ms:undefined,city=S.zoneCity(),off=S.zoneOffsetText(null,at),abbr=S.zoneAbbr(null,at);
 const m=/^UTC([+-])(\d\d):(\d\d)$/.exec(off),compact=m?'UTC'+m[1]+Number(m[2])+(m[3]!=='00'?':'+m[3]:''):off;
 const y=new Date(at==null?Date.now():at).getUTCFullYear(),varies=S.zoneOffsetText(null,Date.UTC(y,0,15,12))!==S.zoneOffsetText(null,Date.UTC(y,6,15,12));
 const long=city+' · '+(abbr?abbr+' · ':'')+off;
 return {city,abbr:abbr||off,off,compact,named:!!abbr,varies,short:city+' '+(abbr||off),long,zone:varies?city+' time':long};
}
// The instant a job is "at": its first recorded time, else local noon of its first date.
function jobInstant(j){for(const k of ['setupStartAt','eventStartAt','finishAt']){const t=j&&j[k]?DviScheduling.timestamp(j[k]):null;if(t!==null)return t;}const d=j&&(setupStart(j)||j.eventFrom||j.eventTo);return d?DviScheduling.timestamp(d+'T12:00'):null;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function daySuffix(d){const n=d%100;if(n>=11&&n<=13)return 'th';return d%10===1?'st':d%10===2?'nd':d%10===3?'rd':'th';}
function fmtDateParts(y,m,d){return String(Number(d))+' '+MONTHS[m-1]+' '+y;}
const fmtD=iso=>{if(!iso)return '—';const [y,m,d]=iso.split('-').map(Number);return y&&m&&d?fmtDateParts(y,m,d):'—';};
const fmtRange=(a,b)=>a&&b&&b!==a?fmtD(a)+' – '+fmtD(b):fmtD(a||b);
const fmtDayShort=iso=>{const p=String(iso||'').split('-').map(Number);return p[1]>=1&&p[1]<=12&&p[2]?p[2]+' '+MONTHS[p[1]-1].slice(0,3):'';};
const setupStart=j=>j?(j.setupFrom||j.setupDate||j.setupTo||''):'';
const setupEnd=j=>j?(j.setupTo||j.setupFrom||j.setupDate||''):'';
const fmtSetupRange=j=>fmtRange(setupStart(j),setupEnd(j));
const setupCovers=(j,iso)=>{const s=setupStart(j),e=setupEnd(j);return !!(s&&e&&s<=iso&&iso<=e);};
const fmtDateObj=d=>fmtDateParts(d.getFullYear(),d.getMonth()+1,d.getDate());
// Activity and "generated" stamps read in the company zone, like every other time.
// A stamp outside the range a date can hold (damaged or hand-edited data) shows as a dash instead of stopping the page.
const fmtDT=ts=>{if(typeof ts!=='number'||!Number.isFinite(ts)||Math.abs(ts)>8.64e15)return '—';const w=DviScheduling.wallNow(ts);return fmtD(w.slice(0,10))+' at '+w.slice(11);};
const byId=(k,id)=>state[k].find(x=>x.id===id)||null;
const nameOf=(k,id)=>{const x=byId(k,id);return x?x.name:'—';};
// Stock (dist/stock.js) is shared with Classic. A page or test that loads app.js without it shows no stock.
const stockLib=()=>typeof DviStock!=='undefined'?DviStock:null;
const stockItem=id=>byId('equipment',id);
const ADMIN_ROLE_RE=/admin|administrator|operations?|office|manager|coordinator|supervisor|overseer/i;
const technicianName=id=>{const t=id?byId('technicians',id):null;return t?t.name:'';};
const technicianIdByName=name=>{
 const n=String(name||'').trim().toLowerCase();
 if(!n)return '';
 // Exact spelling first, then the spacing-insensitive match the duplicate finder uses, so a
 // name-only reference still resolves after its spelling variant has been merged away.
 const key=crewNameKey(name);
 const t=state.technicians.find(x=>String(x.name||'').trim().toLowerCase()===n)||state.technicians.find(x=>crewNameKey(x.name)===key);
 return t?t.id:'';
};
const jobSiteManager=j=>technicianName(j&&j.siteManagerId)||String((j&&(j.siteManager||j.overallOverseer||j.overseer))||'').trim();
const jobCardCreator=j=>technicianName(j&&j.jobCardCreatorId)||String((j&&(j.jobCardCreator||j.creator))||'').trim();
const jobSiteManagerValue=j=>(j&&j.siteManagerId)||technicianIdByName(jobSiteManager(j));
const jobCardCreatorValue=j=>(j&&j.jobCardCreatorId)||technicianIdByName(jobCardCreator(j));
function technicianRoleName(t){return t&&t.role?nameOf('roles',t.role):'';}
function technicianSelectLabel(it){
 let lb=it.name;
 const role=technicianRoleName(it),more=Math.max(0,registeredRoles(it.id).length-1);
 if(role&&role!=='—')lb+=' — '+role+(more?' +'+more:'');
 const labourBits=[];
 const type=it.workerType||'DVI Staff';
 if(type!=='DVI Staff')labourBits.push(type);
 if(type!=='DVI Staff'&&it.source)labourBits.push(it.source);
 if(labourBits.length)lb+=' / '+labourBits.join(' / ');
 return lb;
}
function isAdminCrew(it){
 return ADMIN_ROLE_RE.test([technicianRoleName(it),...otherRoleIds(it).map(id=>nameOf('roles',id)),it.workerType||'',it.source||''].join(' '));
}
function labourMeta(t){
 if(t&&(t.workerType||'DVI Staff')==='DVI Staff')return '';
 if(!t)return '';
 return [t.workerType||'DVI Staff',t.source||''].filter(Boolean).join(' · ');
}
function crewDisplayName(id){
 const t=byId('technicians',id);
 if(!t)return '—';
 const meta=labourMeta(t);
 return t.name+(meta?' ('+meta+')':'');
}
function ensureStateShape(s){
 if(!s||typeof s!=='object')return null;
 if(!s.company)s.company={};
 for(const kind in KINDS){if(!Array.isArray(s[kind]))s[kind]=[];}
 if(!s.roles.some(r=>String(r.name||'').trim().toLowerCase()==='admin / operations'))s.roles.push({id:s.roles.some(r=>r.id==='r_admin')?uid():'r_admin',name:'Admin / Operations'});
 if(!Array.isArray(s.jobs))s.jobs=[];
 s.jobs.forEach(j=>{
  if(j.siteManagerId==null)j.siteManagerId='';
  if(j.jobCardCreatorId==null)j.jobCardCreatorId='';
  if(j.siteManager==null)j.siteManager='';
  if(j.jobCardCreator==null)j.jobCardCreator='';
 });
 if(Array.isArray(s.technicians))s.technicians.forEach(t=>{if(!t.workerType)t.workerType='DVI Staff';});
 if(!s.meta)s.meta={};
 // A counter that is missing, not a whole number, or absurdly large (damaged or hand-edited data)
 // is rebuilt from the job numbers, so creating a card can never push it past a safe number.
 if(!s.seq||!Number.isSafeInteger(s.seq)||s.seq<1||s.seq>999999999){
  const maxNo=s.jobs.reduce((m,j)=>{const n=String(j.no||'').match(/(\d+)$/),v=n?Number(n[1]):0;return v<999999999?Math.max(m,v):m;},0);
  s.seq=Math.max(maxNo+1,1);
 }
 return s;
}
function touchState(){
 if(!state)return;
 state.meta=Object.assign({},state.meta,{updatedAt:Date.now(),appVersion:'8.2-pro-web',updatedDeviceId:cloudClientId(),updatedDeviceName:currentDeviceName()});
}
function storageFailure(error,message){
 if(committedStateJSON!==null){state=JSON.parse(committedStateJSON);if(typeof applyCompanyTimeZone==='function')applyCompanyTimeZone();}
 const alert=$('storageAlert');if(alert){alert.textContent=message;alert.hidden=false;}
 toast(message,'err');
 // Existing mutation callers must stop before closing editors or reporting success.
 const failure=new Error(message);failure.cause=error;failure.name='DviStorageError';throw failure;
}
function save(opts){
 opts=opts||{};
 if(!state)return;
 if(window.DVI_WEB_BLOCKED)return;   // website: records Pro could not read are never replaced
 try{
  ensureStateShape(state);
  if(opts.touch!==false)touchState();
  const next=JSON.stringify(state);
  // Refuse a stale tab's write, including an external clear/restore. Never auto-reload a dirty editor.
  if(localStorage.getItem(DB)!==committedRawJSON){const conflict=new Error('Saved records changed in another tab.');conflict.name='DviStorageConflict';throw conflict;}
  // On the Google-connected page, older safety copies may be dropped to make room (window.dviFreeStorage
  // returns true when it removed one). The local page has no such hook and behaves exactly as before.
  for(;;){try{localStorage.setItem(DB,next);break;}catch(full){if(typeof window!=='undefined'&&window&&typeof window.dviFreeStorage==='function'&&window.dviFreeStorage())continue;throw full;}}
  committedStateJSON=next;committedRawJSON=next;
 }catch(error){storageFailure(error,error.name==='DviStorageConflict'?'Changes were not saved because another tab changed this workspace. The other tab’s records were not overwritten. Copy any unsaved editor details, then reload this tab before trying again.':'Changes were not saved. Browser storage is unavailable or full. Your previously saved records are unchanged; keep this editor open and retry.');}
 const alert=$('storageAlert');if(alert){alert.hidden=true;alert.textContent='';}
 if(opts.cloud!==false)scheduleCloudSave();
}
function load(){
 let raw;
 try{raw=localStorage.getItem(DB);}catch(error){storageFailure(error,'Could not read browser storage. No saved records were replaced. Allow storage access and reload.');}
 committedRawJSON=raw;
 if(raw===null){state=null;loadReset='missing';}
 if(raw!==null){
  try{state=DviScheduling.normalizeBackup(JSON.parse(raw),{lenient:true});}
  catch(error){
   // Never overwrite unreadable records unless their exact bytes have been preserved.
   // Website: records Pro cannot read are never replaced or sent. Nothing is written from this page (see
   // save()); websync.js shows the message and the way back to Classic.
   window.DVI_WEB_BLOCKED=String((error&&error.message)||error||'unreadable');
   committedStateJSON=null;
   state=null;loadReset='unreadable';
  }
  if(state)committedStateJSON=JSON.stringify(state);
 }
 if(!state){seed();}
 ensureStateShape(state);syncCompanyBranding();save({cloud:false,touch:false});
}
// An unedited default-company record (pre-8.1 data, or never saved in Resources).
function isLegacyDefaultCompany(c){return !!c&&c.profile!=='custom'&&(!c.name||['DVI CREATIVES','DVI Creatives',DEFAULT_COMPANY.name].includes(c.name));}
function syncCompanyBranding(){
 const c=state.company||{};
 // Only an unedited default-company record gets the legacy DVI fill-ins. A profile saved in
 // Resources (profile:'custom') or another company's record keeps its blanks as blanks.
 const legacyDefault=isLegacyDefaultCompany(c);
 if(!legacyDefault){
  state.company=Object.assign({},BLANK_COMPANY,{jobPrefix:'DVI',brandColor:PRINT_GOLD},c);
  if(!String(state.company.name||'').trim())state.company.name=BLANK_COMPANY.name;
  applyCompanyTimeZone();
  return;
 }
 state.company=Object.assign({},DEFAULT_COMPANY,c);
 if(!c.name||['DVI CREATIVES','DVI Creatives'].includes(c.name))state.company.name=DEFAULT_COMPANY.name;
 if(!c.tagline||c.tagline==='The Events & Advertising Company')state.company.tagline=DEFAULT_COMPANY.tagline;
 if(!c.phone||c.phone==='0701 699467 / 0772 699467')state.company.phone=DEFAULT_COMPANY.phone;
 if(!c.email)state.company.email=DEFAULT_COMPANY.email;
 if(!c.website)state.company.website=DEFAULT_COMPANY.website;
 if(!c.address||c.address==='Suite 407, Diamond Trust Blg, Plot 18/19, Kampala Road')state.company.address=DEFAULT_COMPANY.address;
 applyCompanyTimeZone();
}
// The company's IANA time zone (records without one are Kampala, as they always were).
function companyTimeZone(){const z=companyProfile().timeZone;return DviScheduling.validZone(z)?z:DviScheduling.DEFAULT_ZONE;}
function applyCompanyTimeZone(){DviScheduling.setTimeZone(companyTimeZone());}
// A stored zone this browser does not know: kept as saved, shown as Kampala, job saves blocked.
function zoneUnsupported(){const z=state&&state.company&&state.company.timeZone;return typeof z==='string'&&!!z&&!DviScheduling.validZone(z);}
function zoneUnsupportedMessage(){return 'Time zone "'+String(state.company.timeZone).slice(0,64)+'" is not supported by this browser. Times are shown as '+DviScheduling.DEFAULT_ZONE+' and job cards cannot be saved until a supported zone is chosen in Resources › Company Profile.';}
/* ---- Company profile helpers (white-label). Presentation only; records are never rewritten. ---- */
function companyProfile(){return (state&&state.company)||DEFAULT_COMPANY;}
function deriveShortName(name){const w=String(name||'').trim().split(/\s+/).filter(Boolean);if(!w.length)return '';return w.length>1?w.slice(0,3).map(x=>x[0]).join('').toUpperCase():w[0].slice(0,12);}
function companyShort(){const c=companyProfile();return String(c.shortName||'').trim()||deriveShortName(c.name)||'Company';}
function cleanJobPrefix(v){return String(v==null?'':v).toUpperCase().replace(/[^A-Z0-9-]+/g,'').replace(/^-+|-+$/g,'').slice(0,12);}
function companyJobPrefix(){const c=companyProfile();return c.jobPrefix==null?'DVI':cleanJobPrefix(c.jobPrefix);}
function labourTypeLabel(type){return (type||'DVI Staff')==='DVI Staff'?companyShort()+' Staff':type;}
function companyFileSlug(){return companyShort().replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'Company';}
function brandInitials(){return companyShort().replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase()||'CO';}
function validLogoData(v){return typeof v==='string'&&v.length<=Math.ceil(LOGO_MAX_BYTES*4/3)+40&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v);}
function companyLogoKind(){const l=companyProfile().logo;return l==='bundled'?'bundled':validLogoData(l)?'upload':'none';}
function hexRGB(h){const n=parseInt(h.slice(1),16);return [n>>16,n>>8&255,n&255];}
function mixHex(a,b,t){const x=hexRGB(a),y=hexRGB(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function relLum(h){return hexRGB(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
function contrastRatio(a,b){const x=relLum(a),y=relLum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
// Printed documents keep their dark header band; text on it is lightened until it reads at 4.5:1.
function brandPalette(hex){
 const brand=/^#[0-9a-f]{6}$/i.test(hex||'')?String(hex).toLowerCase():PRINT_GOLD;
 if(brand===PRINT_GOLD)return {brand,onDark:brand,ink:'#181203',tint:'#f3e3b3',wash:'#fffaf0'};
 let onDark=brand;for(let i=0;i<12&&contrastRatio(onDark,'#15161a')<4.5;i++)onDark=mixHex(onDark,'#ffffff',.15);
 return {brand,onDark,ink:contrastRatio(brand,'#ffffff')>=contrastRatio(brand,'#111111')?'#ffffff':'#111111',tint:mixHex(brand,'#ffffff',.72),wash:mixHex(brand,'#ffffff',.94)};
}
function brandCSS(css){
 const p=brandPalette(companyProfile().brandColor);
 if(p.brand===PRINT_GOLD)return css;
 // The restyled job card's dark-gold text and pale-gold headings follow the brand too; text keeps at least 4.5:1 on white.
 // The text must also read on the pale brand band (the darkest light background it sits on), not only on white (review).
 const band=mixHex(p.brand,'#ffffff',.86);
 let onLight=p.brand;for(let i=0;i<16&&contrastRatio(onLight,band)<4.5;i++)onLight=mixHex(onLight,'#000000',.15);
 return css.replace(/color:#d4af37/g,'color:'+p.onDark).replace(/#d4af37|#d7b45a/g,p.brand).replace(/#181203|#151105/g,p.ink).replace(/#f3e3b3/g,p.tint).replace(/#fffaf0|#fff7df/g,p.wash).replace(/#b88900/g,p.brand)
  .replace(/#8a6d14|#6b5512/g,onLight).replace(/#f6efdc/g,band).replace(/#e3d9bd|#ebe2c9/g,mixHex(p.brand,'#ffffff',.68));
}
function printLogoHTML(){
 const kind=companyLogoKind(),alt=esc(companyShort());
 if(kind==='bundled')return `<div class="pc-logo-crop"><img src="DVI%20logos%20png/dvi%20logo.png" alt="${alt}" onerror="this.style.display='none'"></div>`;
 if(kind==='upload')return `<div class="pc-logo-fit"><img src="${companyProfile().logo}" alt="${alt}"></div>`;
 return `<div class="pc-logo-mono" aria-hidden="true">${esc(brandInitials())}</div>`;
}
function renderBranding(){
 const c=companyProfile(),kind=companyLogoKind(),short=companyShort(),tile=$('brandTile');
 if(tile){tile.innerHTML=kind==='bundled'?'<img src="DVI%20logos%20png/dvi%20logo.png" alt="">':kind==='upload'?`<img class="fit" src="${c.logo}" alt="">`:`<b>${esc(brandInitials())}</b>`;if(tile.classList)tile.classList.toggle('mono',kind==='none');}
 const app=document.querySelector?document.querySelector('.tb-app'):null;
 if(app){app.setAttribute('aria-label',short+' menu');app.title=c.name+' Operations';}
 refreshDocumentTitle();
 if(document.querySelectorAll){const zl=zoneLabels();document.querySelectorAll('[data-tz]').forEach(el=>{const k=el.getAttribute('data-tz');if(zl[k]!=null)el.textContent=zl[k];});}
 if(typeof refreshKampalaHeader==='function'&&document.querySelector)refreshKampalaHeader();
 const p=brandPalette(c.brandColor),root=document.documentElement;
 if(root&&root.style){root.style.setProperty('--company',p.brand);root.style.setProperty('--company-ink',p.ink);}
 if(typeof window!=='undefined'&&typeof window.setCompanyAccent==='function')window.setCompanyAccent(p.brand);
}
// Intentionally inert: this development copy cannot configure, pull or push cloud data.
function sandboxNotice(){toast('Development copy: live cloud and external calendar connections are disabled.');}
function loadCloudConfig(){cloudCfg={endpoint:'',auto:false,deviceName:'Development sandbox',owner:'',driveUrl:''};return cloudCfg;}
function saveCloudConfig(){loadCloudConfig();}
function cloudClientId(){let id=localStorage.getItem(CLOUD_CLIENT_KEY);if(!id){id=uid();localStorage.setItem(CLOUD_CLIENT_KEY,id);}return id;}
function shortDeviceId(id){return String(id||cloudClientId()).slice(-8).toUpperCase();}
function defaultDeviceName(){return 'Development sandbox';}
function currentDeviceName(){return 'Development sandbox';}
function markJobDevice(j){j.updatedDeviceId=cloudClientId();j.updatedDeviceName=currentDeviceName();return j;}
function renderCloudSettings(){renderCloudStatus();}
function setCloudStatus(){renderCloudStatus();}
// The local page. (On the Google-connected page gsync.js replaces this function.) If Google saving
// was switched on there, say plainly that changes made on this page wait on this device.
function renderCloudStatus(){
 const box=$('cloudStatus');if(!box)return;
 let google=false;try{google=JSON.parse(localStorage.getItem('dvi_dev_df1a251_20261102_gsync_v1')||'{}').mode==='google';}catch(_){}
 box.innerHTML='<span class="cloud-dot"></span><span><b>Local only — no cloud backup</b><em>'+(google?'This page cannot connect to anything. Google saving is switched on for this workspace: changes made here stay on this device until the Google-connected version is next open and signed in.':'Records exist only in this browser profile on this device. Nothing is uploaded, synced or backed up automatically.')+'</em></span>';
}
function scheduleCloudSave(){}
function configureCloudLiveSync(){}
function cloudFocusSync(){}
function cloudLiveEnabled(){return false;}
function cloudEndpointReady(){return false;}
function saveCloudSettings(){sandboxNotice();}
function setCloudMode(){loadCloudConfig();sandboxNotice();}
function cloudPushManual(){sandboxNotice();}
function cloudPull(){sandboxNotice();}
function cloudPush(){sandboxNotice();return false;}
function cloudTest(){sandboxNotice();}
function cloudOpenDriveBackup(){sandboxNotice();}
function openCloudProject(){sandboxNotice();}
function copyCloudScript(){sandboxNotice();}
function statusPill(s){const known=SMETA[s]?s:'Draft';return `<span class="pill" data-status="${esc(known)}">${esc(s||'Draft')}</span>`;}
// Astro UXDS status symbol: colour and shape together (critical ▼, serious ◆, caution ■, normal ●, standby ○, off •).
function statusSymbol(status,label){return `<span class="ss" data-status="${esc(status)}" role="img" aria-label="${esc(label||status)}"></span>`;}
function toast(msg,type){const t=document.createElement('div');t.className='toast'+(type==='err'?' err':'');t.textContent=msg;$('toasts').appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),450);},3200);}
// opts (optional): okLabel for the OK button, and a second answer: altLabel with its callback alt.
let confirmAltCb=null;
function confirmBox(msg,fn,opts){
 opts=opts||{};$('cmMsg').textContent=msg;confirmCb=fn;confirmAltCb=opts.alt||null;confirmOpenedAt=Date.now();
 const ok=$('cmOk'),alt=$('cmAlt');if(ok)ok.textContent=opts.okLabel||'OK';if(alt){alt.hidden=!opts.alt;alt.textContent=opts.altLabel||'';}
 $('confirmModal').classList.add('open');
}
function confirmYes(){$('confirmModal').classList.remove('open');const cb=confirmCb;confirmCb=null;confirmAltCb=null;if(cb)cb();}
function confirmAlt(e){if(e&&e.detail>0&&Date.now()-confirmOpenedAt<400)return;$('confirmModal').classList.remove('open');const cb=confirmAltCb;confirmCb=null;confirmAltCb=null;if(cb)cb();}
function confirmIsOpen(){const m=$('confirmModal');return !!(m&&m.classList&&typeof m.classList.contains==='function'&&m.classList.contains('open'));}
// The OK button. A pointer press that lands within 400 ms of the dialog opening is the second
// tap of a double tap on the button underneath, not an answer. Keyboard use (detail 0) is never delayed.
function confirmClick(e){if(e&&e.detail>0&&Date.now()-confirmOpenedAt<400)return;confirmYes();}
function dl(name,content,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=name;a.click();}

/* ================= SEED (empty development records; generic catalogues only) ================= */
// `company` keeps an existing company profile when every record is cleared.
function seed(company){
 const R=[['r1','Riggers'],['r2','Screen'],['r3','Sound Technician'],['r4','Platform'],['r5','Lighting'],['r6','Plinths'],['r7','Power'],['r8','Driver'],['r9','Photography'],['r10','Videography'],['r_admin','Admin / Operations']];
 const T=[];
 const C=[];
 const V=[];
 const E=['LED Screen','Digital Podium','PA System','Wireless Microphones','Lapel Microphones','Fueled Generator','Extension Cables','Platform','Red Carpet','Steel Frames for Banners','Plinths','Stage Lighting','Mixer','Projector','TV Screen','Truss','Backdrop','Photography','Videography','Dance Floor'];
 const Y=['Wedding','Conference','AGM','Board Meeting','Symposium','Exhibition','Book Launch','Birthday','Corporate Event','Government Event','Workshop','Run / Marathon','Concert'];
 state={
  company:Object.assign({},company||DEFAULT_COMPANY),
  roles:R.map(r=>({id:r[0],name:r[1]})),
  technicians:T.map((t,i)=>({id:'t'+(i+1),name:t[0],role:t[1],workerType:'DVI Staff',source:'',phone:'',rateNote:''})),
  clients:C.map((c,i)=>({id:'c'+(i+1),name:c,contact:'',phone:''})),
  venues:V.map((v,i)=>({id:'v'+(i+1),name:v[0],area:v[1]})),
  equipment:E.map((e,i)=>({id:'e'+(i+1),name:e})),
  eventTypes:Y.map((y,i)=>({id:'y'+(i+1),name:y})),
  jobs:[],seq:1
 };
 applyCompanyTimeZone();
 save({cloud:false});
}

/* ================= NAV ================= */
const TITLES={dashboard:'Overview',jobs:'Job cards',schedule:'Schedule',dispatch:'Dispatch',stock:'Stock',insights:'Insights',settings:'People & resources'};
let currentView='dashboard';
function refreshDocumentTitle(){document.title=TITLES[currentView]+' · '+companyShort()+' Operations';}
// One navigation state drives desktop workspace tabs, the phone tab bar and the More sheet.
function switchView(v){
 if(!TITLES[v])v='dashboard';
 document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='view-'+v));
 document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
 document.querySelectorAll('[data-workspace]').forEach(b=>{b.classList.toggle('active',b.dataset.workspace===v);b.setAttribute('aria-current',b.dataset.workspace===v?'page':'false');});
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===v||(b.dataset.tab==='more'&&['stock','insights','settings'].includes(v))));
 if($('topTitle'))$('topTitle').textContent=TITLES[v];
 currentView=v;refreshDocumentTitle();
 if(typeof toggleNavigation==='function')toggleNavigation(false);
}

/* ================= SELECT FILLERS ================= */
function fillTechnicianSelect(sel,ph,val,noAdd){
 const items=[...state.technicians].sort((a,b)=>a.name.localeCompare(b.name));
 let h=`<option value="">${esc(ph)}</option>`;
 if(sel&&sel.dataset.adminFirst==='1'){
  const admin=items.filter(isAdminCrew),other=items.filter(it=>!isAdminCrew(it));
  if(admin.length)h+=`<optgroup label="Admin crew">${admin.map(it=>`<option value="${it.id}">${esc(technicianSelectLabel(it))}</option>`).join('')}</optgroup>`;
  if(other.length)h+=`<optgroup label="Other crew">${other.map(it=>`<option value="${it.id}">${esc(technicianSelectLabel(it))}</option>`).join('')}</optgroup>`;
 }else{
  for(const it of items)h+=`<option value="${it.id}">${esc(technicianSelectLabel(it))}</option>`;
 }
 if(!noAdd)h+=`<option value="__add">＋ Add new…</option>`;
 sel.innerHTML=h;sel.value=val||'';sel.dataset.prev=sel.value;
}
// Equipment grouped by category, with the number owned, as Classic lists it.
function fillEquipmentSelect(sel,ph,val,noAdd){
 const S=stockLib(),groups=new Map();
 for(const it of state.equipment){const c=S.category(it);if(!groups.has(c))groups.set(c,[]);groups.get(c).push(it);}
 let h=`<option value="">${esc(ph)}</option>`;
 for(const c of S.CATEGORIES){
  const list=(groups.get(c)||[]).sort((a,b)=>a.name.localeCompare(b.name));if(!list.length)continue;
  h+=`<optgroup label="${esc(c)}">${list.map(it=>`<option value="${it.id}">${esc(it.name)}${S.owned(it)!==null?' · '+S.owned(it)+' owned':''}</option>`).join('')}</optgroup>`;
 }
 if(!noAdd)h+=`<option value="__add">＋ Add new…</option>`;
 sel.innerHTML=h;sel.value=val||'';sel.dataset.prev=sel.value;
}
function fillSelect(sel,kind,ph,val,noAdd){
 if(kind==='technicians'){fillTechnicianSelect(sel,ph,val,noAdd);return;}
 if(kind==='equipment'&&stockLib()){fillEquipmentSelect(sel,ph,val,noAdd);return;}
 const items=[...state[kind]].sort((a,b)=>a.name.localeCompare(b.name));
 let h=`<option value="">${esc(ph)}</option>`;
 for(const it of items){
  let lb=it.name;
  h+=`<option value="${it.id}">${esc(lb)}</option>`;
 }
 if(!noAdd)h+=`<option value="__add">＋ Add new…</option>`;
 sel.innerHTML=h;sel.value=val||'';sel.dataset.prev=sel.value;
}
function maybeQuickAdd(sel){
 if(sel.value==='__add'){sel.value=sel.dataset.prev||'';openQuickAdd(sel.dataset.kind,null,sel);}
 else sel.dataset.prev=sel.value;
}
function fillFilter(sel,kind,ph){
 const v=sel.value;
 let h=`<option value="">${ph}</option>`;
 for(const it of [...state[kind]].sort((a,b)=>a.name.localeCompare(b.name)))h+=`<option value="${it.id}">${esc(it.name)}</option>`;
 sel.innerHTML=h;sel.value=v;
}

/* ================= QUICK ADD / EDIT ================= */
function openQuickAdd(kind,editId,trigger){
 quickKind=kind;quickEditId=editId||null;quickTrigger=trigger||null;
 const K=KINDS[kind];const item=editId?byId(kind,editId):{};
 $('qmTitle').textContent=(editId?'Edit ':'Add new ')+K.sing;
 let h='';
 for(const [key,lab] of K.fields){
  if(lab==='__roleselect')h+=`<label for="qf_${key}">Primary role</label><select id="qf_${key}" onchange="quickRolesCollect();quickRolesRender()"></select>`;
  // Other responsibilities: a tick list kept in a hidden text field (comma-separated role ids).
  else if(lab==='__rolesmulti')h+=`<span class="qf-label" id="qf_${key}_label">Other responsibilities</span><input type="hidden" id="qf_${key}" value="${esc(otherRoleIds(item).join(','))}"><div class="role-checks" id="qf_${key}_list" role="group" aria-labelledby="qf_${key}_label"></div><small class="prop-hint">Tick every other responsibility this person takes on. On a job card the primary role is filled in first, and any ticked role is accepted without a question.</small>`;
  // An imported labour type outside the list is offered as-is, so editing other fields never rewrites it.
  else if(lab==='__labourtype')h+=`<label for="qf_${key}">Labour type</label><select id="qf_${key}">${LABOUR_TYPES.concat(item.workerType&&!LABOUR_TYPES.includes(item.workerType)?[item.workerType]:[]).map(x=>`<option value="${esc(x)}">${esc(labourTypeLabel(x))}</option>`).join('')}</select>`;
  // Stock fields, stored as Classic stores them: category, number owned (whole number as text; empty =
  // not tracked) and the size of one panel or deck.
  else if(lab==='__equipcat'){const S=stockLib(),cur=S?S.category(item):'';h+=`<label for="qf_${key}">Category</label><select id="qf_${key}">${(S?S.CATEGORIES:[]).map(c=>`<option${c===cur?' selected':''}>${esc(c)}</option>`).join('')}</select>`;}
  else if(lab==='__stock')h+=`<label for="qf_${key}">Number owned</label><input id="qf_${key}" type="number" min="0" step="1" inputmode="numeric" placeholder="Not tracked" value="${esc(item.stock==null?'':String(item.stock).trim())}"><small class="prop-hint">For stock tracking. Leave it empty to not track this item.</small>`;
  else if(lab==='__unitsize')h+=`<label for="qf_${key}">Size of one panel or deck</label><input id="qf_${key}" spellcheck="false" placeholder="e.g. 500x500 mm, 500x1000 mm or 1.2x2.4 m" value="${esc(item.unitSize||'')}"><small class="prop-hint">Only if you count it in panels or decks: a job line of “6x3m” is then worked out in panels or decks.</small>`;
  // Job card area: Automatic reads it from the name (shown in brackets); a choice here is saved as `area`.
  else if(lab==='__jobarea')h+=`<label for="qf_${key}">Job card area</label><select id="qf_${key}"><option value="">Automatic${item.name?' ('+esc(jobArea(areaOf({name:item.name,category:item.category},kind))[1])+')':''}</option>${JOB_AREAS.map(a=>`<option value="${a[0]}"${item.area===a[0]?' selected':''}>${esc(a[1])}</option>`).join('')}</select><small class="prop-hint">On the printed job card, equipment and crew in the same area share a colour and sit side by side.</small>`;
  else h+=`<label for="qf_${key}">${lab}</label><input id="qf_${key}" value="${esc(item[key]||'')}">`;
 }
 $('qmFields').innerHTML=h;
 if(kind==='technicians')fillSelect($('qf_role'),'roles','— Select role —',item.role||'',true);
 if(kind==='technicians'&&$('qf_workerType'))$('qf_workerType').value=item.workerType||'DVI Staff';
 if(kind==='technicians')quickRolesRender();
 $('quickModal').classList.add('open');
 setTimeout(()=>{const f=$('qmFields').querySelector('input');if(f)f.focus();},60);
}
// The tick list of other responsibilities in the crew form. The primary role is shown ticked and
// locked, so the list always reads as everything the person is registered for.
function quickRolesRender(){
 const box=$('qf_otherRoles_list'),hidden=$('qf_otherRoles'),primary=$('qf_role');if(!box||!hidden)return;
 const on=new Set(String(hidden.value||'').split(',').filter(Boolean)),main=primary?primary.value:'';
 box.innerHTML=state.roles.map(r=>`<label class="role-check${r.id===main?' is-primary':''}"><input type="checkbox" value="${esc(r.id)}"${r.id===main||on.has(r.id)?' checked':''}${r.id===main?' disabled':''} onchange="quickRolesCollect()"><span>${esc(r.name)}</span>${r.id===main?'<em>primary</em>':''}</label>`).join('')||'<span class="prop-hint">No roles in the register yet.</span>';
}
function quickRolesCollect(){
 const box=$('qf_otherRoles_list'),hidden=$('qf_otherRoles'),primary=$('qf_role');if(!box||!hidden||typeof box.querySelectorAll!=='function')return;
 const main=primary?primary.value:'';
 // The locked box is the primary role (or the one that just stopped being primary): never carried over.
 hidden.value=[...box.querySelectorAll('input[type="checkbox"]')].filter(c=>c.checked&&!c.disabled&&c.value!==main).map(c=>c.value).join(',');
}
function saveQuick(){
 const K=KINDS[quickKind];
 const vals={};
 for(const [key] of K.fields){const el=$('qf_'+key);if(el)vals[key]=el.value.trim();}
 if(!vals.name){toast('Name is required','err');return;}
 if(quickKind==='equipment'){
  const S=stockLib();
  if(vals.stock&&!/^\d+$/.test(vals.stock)){toast('Number owned must be a whole number, e.g. 144','err');return;}
  if(vals.unitSize&&S&&!S.parseUnitSize(vals.unitSize)){toast('Size should look like 500x500 mm or 1.2x2.4 m','err');return;}
  if(!vals.category||(S&&!S.CATEGORIES.includes(vals.category)))delete vals.category;
 }
 // Other responsibilities: known roles only, never repeating the primary one.
 if(quickKind==='technicians'&&'otherRoles' in vals)vals.otherRoles=[...new Set(vals.otherRoles.split(',').map(x=>x.trim()))].filter(id=>id&&id!==vals.role&&byId('roles',id)).join(',');
 let obj;
 if(quickEditId){obj=byId(quickKind,quickEditId);Object.assign(obj,vals);}
 else{obj=Object.assign({id:uid()},vals);state[quickKind].push(obj);}
 if(quickKind==='technicians'&&!obj.otherRoles)delete obj.otherRoles;
 // Job card area: only a real choice is stored; Automatic leaves the record without the field.
 if('area' in vals&&quickKind!=='venues'&&!JOB_AREAS.some(a=>a[0]===vals.area))delete obj.area;
 // Classic reads a person's responsibilities from `roles` (primary first): written from the same ticks.
 if(quickKind==='technicians')obj.roles=[...new Set([obj.role,...String(obj.otherRoles||'').split(',')].filter(Boolean))];
 save();
 const kind=quickKind, newId=obj.id, trig=quickTrigger, wasEdit=!!quickEditId;
 const trigPrev=trig&&trig.dataset?trig.dataset.prev||'':'';
 document.querySelectorAll(`select[data-kind="${kind}"]`).forEach(s=>{
  const v=(trig&&s===trig&&!wasEdit)?newId:s.value;
  fillSelect(s,kind,s.dataset.ph||'— Select —',v);
 });
 // A role or person added from a crew line follows the same responsibility rules as a pick.
 if(trig&&!wasEdit&&trig.classList){
  if(trig.classList.contains('cr-tech'))crewTechChanged(trig);
  else if(trig.classList.contains('cr-role')){trig.dataset.prev=trigPrev;crewRoleChanged(trig);}
 }
 document.querySelectorAll('#crewRows .dyn-row').forEach(crewRowNote);
 closeQuick();renderAll();toast((wasEdit?'Updated ':'Added ')+obj.name+' ✓');
}
function closeQuick(){$('quickModal').classList.remove('open');quickKind=null;quickEditId=null;quickTrigger=null;}

/* ================= JOB FORM ================= */
// New numbers use the company's current prefix; numbers already issued are never rewritten.
function nextNoPreview(){const p=companyJobPrefix();return (p?p+'-':'')+todayISO().slice(0,4)+'-'+String(state.seq).padStart(3,'0');}
function openJobModal(id){
 editingJobId=id||null;
 const j=id?state.jobs.find(x=>x.id===id):null;
 $('jmTitle').textContent=j?('Edit '+j.no):'New Job Card';
 $('f_no').value=j?j.no:nextNoPreview();
 $('f_event').value=j?j.event:'';
 fillSelect($('f_type'),'eventTypes','— Event type —',j?j.typeId:'');
 fillSelect($('f_client'),'clients','— Client / Company —',j?j.clientId:'');
 fillSelect($('f_venue'),'venues','— Venue —',j?j.venueId:'');
 $('f_setup_from').value=j?setupStart(j):'';
 $('f_setup_to').value=j&&j.setupTo?j.setupTo:'';
 $('f_from').value=j&&j.eventFrom?j.eventFrom:'';
 $('f_to').value=j&&j.eventTo?j.eventTo:'';
 for(const key of ['setupStartAt','eventStartAt','finishAt'])$('f_'+key).value=j&&j[key]||'';
 fillSelect($('f_site_manager'),'technicians','— Site manager / overseer —',j?jobSiteManagerValue(j):'');
 fillSelect($('f_creator'),'technicians','— Job card creator —',j?jobCardCreatorValue(j):'');
 updateDatePreview();
 $('f_status').value=j?j.status:'Scheduled';
 $('f_priority').value=j?(j.priority||'Normal'):'Normal';
 $('f_notes').value=j?(j.notes||''):'';
 $('equipRows').innerHTML='';$('crewRows').innerHTML='';
 if(j&&j.equipment.length)j.equipment.forEach(e=>addEquipRow(e));else addEquipRow();
 if(j&&j.crew.length)j.crew.forEach(c=>addCrewRow(c));else addCrewRow();
 $('jobModal').classList.add('open');
 renderEditorScheduleWarnings();
 setTimeout(()=>$('f_event').focus(),60);
}
function updateDatePreview(){
 $('f_setup_fmt').textContent=($('f_setup_from').value||$('f_setup_to').value)?fmtRange($('f_setup_from').value,$('f_setup_to').value):'';
 $('f_event_fmt').textContent=($('f_from').value||$('f_to').value)?fmtRange($('f_from').value,$('f_to').value):'';
}
function closeJobModal(){$('jobModal').classList.remove('open');editingJobId=null;}
function addEquipRow(d){
 d=d||{};
 const row=document.createElement('div');row.className='dyn-row eq-row';
 row._line=d;   // the saved line, so saving keeps what this editor does not show (shared records)
 const hire=parseInt(d.hire,10)>0?parseInt(d.hire,10):'';
 // Hire: units hired in from a partner for a shortfall; they are not taken from the store (Classic's `hire`).
 row.innerHTML=`<input class="eq-spec" placeholder="e.g. 6x3m, 4, 12" aria-label="Quantity or size" value="${esc(d.spec||'')}">`+
  `<select class="eq-sel" data-kind="equipment" data-ph="— Equipment item —" aria-label="Equipment item" onchange="maybeQuickAdd(this)"></select>`+
  `<input class="eq-hire" type="number" min="0" step="1" inputmode="numeric" aria-label="Units to hire in" title="Units hired in from a partner: they are not taken from your store" value="${hire}">`+
  `<button type="button" class="row-x" title="Remove equipment line" onclick="this.parentElement.remove()"><span data-icon="x"></span></button>`+
  `<div class="eq-av" aria-live="polite"></div>`;
 $('equipRows').appendChild(row);
 let val=d.itemId||'';
 if(!val&&d.name){const m=state.equipment.find(e=>e.name.toLowerCase()===d.name.toLowerCase());if(m)val=m.id;}
 fillSelect(row.querySelector('select'),'equipment','— Equipment item —',val);
}
/* ---- Stock in the job editor ----
   Each item's line shows what it takes from the store on this card's dates against every other booking
   (the numbers Classic shows), with a Hire button when it is short. Refreshed with the schedule checks. */
function editorStockJob(){
 const v=id=>($(id)&&$(id).value)||'';
 return {id:editingJobId||'__new',status:v('f_status'),
  setupFrom:v('f_setup_from')||v('f_setupStartAt').slice(0,10)||null,setupTo:v('f_setup_to')||null,
  eventFrom:v('f_from')||v('f_eventStartAt').slice(0,10)||null,eventTo:v('f_to')||v('f_finishAt').slice(0,10)||null,
  equipment:[...document.querySelectorAll('#equipRows .dyn-row')].map(r=>{const sel=r.querySelector('select'),spec=r.querySelector('.eq-spec'),h=r.querySelector('.eq-hire');
   return {itemId:sel&&sel.value&&sel.value!=='__add'?sel.value:null,spec:spec?spec.value:'',hire:h?Math.max(0,parseInt(h.value,10)||0):0,_row:r};})};
}
function stockHintHTML(c,it,j){
 if(!c||c.k==='untracked')return '';
 const uses='Uses '+c.need+(c.hired?' + hire '+c.hired:'');
 const draft=j.status==='Draft'?'<span class="sv mut">Draft: not holding stock yet</span>':'';
 if(c.k==='nodates')return `<span class="sv mut">${uses} · add the setup or event dates to check stock</span>`;
 if(c.k==='short')return `<span class="sv short">${statusSymbol('critical','Short')}${uses} · short ${-c.spare} on ${fmtDayShort(c.iso)} (${Math.max(0,c.free)} of ${c.owned} free)</span><button type="button" class="btn sm" onclick="planHire('${it.id}',${-c.spare})">Hire ${-c.spare}</button>${draft}`;
 if(c.k==='full')return `<span class="sv full">${statusSymbol('caution','Full')}${uses} · takes the last ones on ${fmtDayShort(c.iso)}</span>${draft}`;
 return `<span class="sv ok">${statusSymbol('normal','Available')}${uses} · ${c.spare} of ${c.owned} spare on these dates</span>${draft}`;
}
function refreshStockHints(){
 const S=stockLib();if(!S||!state||!$('equipRows'))return;
 const j=editorStockJob(),c=S.check(j,S.index(state.jobs,stockItem),stockItem),seen=new Set(),closed=j.status==='Completed'||j.status==='Cancelled';
 for(const e of j.equipment){
  const box=e._row.querySelector('.eq-av');if(!box)continue;
  const it=e.itemId?stockItem(e.itemId):null;
  if(!it||closed||seen.has(it.id)){box.innerHTML='';continue;}
  seen.add(it.id);box.innerHTML=stockHintHTML(c[it.id],it,j);
 }
}
function planHire(itemId,n){
 const row=[...document.querySelectorAll('#equipRows .dyn-row')].find(r=>{const s=r.querySelector('select');return s&&s.value===itemId;});
 const h=row&&row.querySelector('.eq-hire');if(!h)return;
 h.value=(parseInt(h.value,10)||0)+n;
 crewEdited();refreshStockHints();toast('Hire '+n+' added. Save the job card to keep it.');
}
/* ---- Crew responsibilities ----
   A person's registered responsibilities (Resources > Crew) are a primary role plus any
   others they take on. The primary role is the default on a job card and any of the others is
   accepted without a question. A role outside that set is allowed, but only after an
   "Are you sure?" confirmation; the line then stays marked and the change is written to the
   card's history. Existing cards are never changed or prompted when they are opened. */
// The other responsibilities are stored as a comma-separated list of role ids in `otherRoles`:
// plain text, so backups stay readable by every earlier version, which ignores the field.
// Classic (the live v2.0 look) keeps the same thing as an array of role ids in `roles` (primary
// included). Both are read, so a person has the same responsibilities in either look (shared records).
function otherRoleIds(t){
 if(!t)return [];
 const fromText=String(t.otherRoles||'').split(',').map(x=>x.trim()).filter(Boolean);
 const fromList=Array.isArray(t.roles)?t.roles.map(x=>String(x==null?'':x).trim()).filter(Boolean):[];
 return [...new Set(fromText.concat(fromList))].filter(id=>id!==t.role);
}
function registeredRoles(techId){
 const t=techId?byId('technicians',techId):null,out=[];if(!t)return out;
 for(const id of [t.role,...otherRoleIds(t)])if(id&&!out.includes(id)&&byId('roles',id))out.push(id);
 return out;
}
function registeredRole(techId){return registeredRoles(techId)[0]||'';}
function listText(items){return items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items[items.length-1];}
function registeredRolesText(techId,joiner){const names=registeredRoles(techId).map(id=>nameOf('roles',id));return joiner?names.join(joiner):listText(names);}
// A person was picked on a line whose role box holds `current`. `auto` means that role came
// from a person's registration rather than a deliberate choice. Returns the role to show and,
// in `ask`, a deliberately chosen role outside their responsibilities that may only be kept
// after confirmation.
function roleOnPersonPicked(techId,current,auto){
 const regs=registeredRoles(techId);
 if(!regs.length)return {role:current||'',ask:''};
 if(!current||auto)return {role:regs[0],ask:''};
 if(regs.includes(current))return {role:current,ask:''};
 return {role:regs[0],ask:current};
}
function roleChangeNeedsConfirm(techId,wanted){const regs=registeredRoles(techId);return !!(regs.length&&wanted&&!regs.includes(wanted));}
function roleConfirmText(techId,wanted){return `Are you sure? ${technicianName(techId)} is registered as ${registeredRolesText(techId)}. Assign them as ${nameOf('roles',wanted)} on this job card?`;}
// Crew lines whose role on the card is outside the person's registered responsibilities.
function crewRoleOverrides(crew){
 return (Array.isArray(crew)?crew:[]).filter(c=>c&&c.techId&&c.roleId&&roleChangeNeedsConfirm(c.techId,c.roleId))
  .map(c=>({techId:c.techId,roleId:c.roleId,name:technicianName(c.techId),role:nameOf('roles',c.roleId),registered:registeredRolesText(c.techId,', ')}));
}
// History text for differences that are new on this save (unchanged ones are not repeated).
function roleOverrideHistory(previousCrew,crew){
 const before=new Set(crewRoleOverrides(previousCrew).map(o=>o.techId+'|'+o.roleId));
 const fresh=crewRoleOverrides(crew).filter(o=>!before.has(o.techId+'|'+o.roleId));
 return fresh.length?'Responsibility changed on this card: '+fresh.map(o=>`${o.name} as ${o.role} (registered ${o.registered})`).join('; '):'';
}
function crewRowNote(row){
 const tech=row.querySelector('.cr-tech').value,role=row.querySelector('.cr-role').value,note=row.querySelector('.cr-note');
 const o=crewRoleOverrides([{techId:tech,roleId:role}])[0];
 const waiting=!!o&&typeof row.querySelectorAll==='function'&&[...row.querySelectorAll('select')].some(s=>s.dataset&&s.dataset.pending);
 row.classList.toggle('override',!!o);
 if(note){note.hidden=!o;note.textContent=o?`${o.name} is registered as ${o.registered}; on this job card: ${o.role}.`+(waiting?' Not confirmed yet: you will be asked when you leave this field.':''):'';}
}
function addCrewRow(c){
 c=c||{};
 const row=document.createElement('div');row.className='dyn-row';
 row._line=c;   // the saved line, so saving keeps what this editor does not show (shared records)
 // Keyboard steps through a closed list are settled once, on leaving the field (crewSelectKey).
 const keys=` onkeydown="crewSelectKey(event)" onpointerdown="this.dataset.kbd=''" onblur="crewSettle(this)"`;
 row.innerHTML=`<select class="cr-role" data-kind="roles" data-ph="— Role —" onchange="crewRoleChanged(this)"${keys}></select>`+
  `<select class="cr-tech" data-kind="technicians" data-ph="— Technician —" onchange="crewTechChanged(this)"${keys}></select>`+
  `<button type="button" class="row-x" title="Remove crew line" onclick="this.parentElement.remove()"><span data-icon="x"></span></button>`+
  `<small class="cr-note" role="note" hidden></small>`;
 $('crewRows').appendChild(row);
 const roleSel=row.querySelector('.cr-role');
 fillSelect(roleSel,'roles','— Role —',c.roleId||'');
 fillSelect(row.querySelector('.cr-tech'),'technicians','— Technician —',c.techId||'');
 roleSel.dataset.auto=c.techId&&c.roleId&&c.roleId===registeredRole(c.techId)?'1':'';
 crewRowNote(row);
}
/* Arrow keys and typed letters change a closed list one step at a time, and every step fires
   a change event. Asking "Are you sure?" on each step would make the list unusable from the
   keyboard, so those steps are kept and the question is asked once: on leaving the field, on
   Enter, or before the card is saved. Choosing with the mouse or from the opened list asks at once. */
function crewSelectKey(e){
 const sel=e&&e.currentTarget;if(!sel||!sel.dataset)return;
 if(e.key==='Enter'){if(sel.dataset.pending){e.preventDefault();crewSettle(sel);}return;}
 if(e.altKey||e.ctrlKey||e.metaKey||e.key==='F4'||e.key===' '){sel.dataset.kbd='';return;}      // these open the list
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)||(e.key&&e.key.length===1))sel.dataset.kbd='1';
}
function crewStepping(sel){return !!(sel.dataset&&sel.dataset.kbd==='1'&&typeof document!=='undefined'&&document.activeElement===sel);}
// The editor's "Unsaved" badge listens for events inside the dialog; a confirmed change is set by script.
function crewEdited(){const m=$('jobModal');if(m&&typeof m.dispatchEvent==='function'&&typeof Event==='function')m.dispatchEvent(new Event('change'));}
function crewTechChanged(sel){
 if(sel.value==='__add'){maybeQuickAdd(sel);return;}
 maybeQuickAdd(sel);
 if(crewStepping(sel)){sel.dataset.pending='1';crewRowNote(sel.closest('.dyn-row'));return;}
 crewTechApply(sel);
}
function crewTechApply(sel){
 delete sel.dataset.pending;
 const row=sel.closest('.dyn-row'),roleSel=row.querySelector('.cr-role'),tech=sel.value;
 const d=roleOnPersonPicked(tech,roleSel.value,roleSel.dataset.auto==='1');
 // Default: the person's registered role.
 // "auto" marks a role that is simply the person's primary one; another of their responsibilities was chosen on purpose.
 roleSel.value=d.role;roleSel.dataset.prev=d.role;if(registeredRole(tech))roleSel.dataset.auto=d.role===registeredRole(tech)?'1':'';
 crewRowNote(row);
 if(d.ask){const keep=d.ask;confirmBox(roleConfirmText(tech,keep)+' Cancel keeps their registered role.',()=>{if(sel.value!==tech)return;roleSel.value=keep;roleSel.dataset.prev=keep;roleSel.dataset.auto='';markCrewConfirmed(row);crewRowNote(row);crewEdited();},
  crewRoleChoice(tech,keep,()=>{if(sel.value!==tech)return;roleSel.value=keep;roleSel.dataset.prev=keep;roleSel.dataset.auto='';}));}
}
// "This card only" marks the line as Classic does (override, confirmed by the job card creator) when saved.
function markCrewConfirmed(row){if(row&&row.dataset){row.dataset.override='1';row.dataset.confirmedBy=($('f_creator')&&$('f_creator').value)||'';}}
// The other answer to "Are you sure?": add the role to the person's responsibilities. Saved to the crew
// register at once, as Classic does, so later cards need no question.
function crewRoleChoice(techId,roleId,apply){
 const t=byId('technicians',techId),role=nameOf('roles',roleId);
 if(!t||!byId('roles',roleId))return {okLabel:'This card only'};
 return {okLabel:'This card only',altLabel:'Add '+role+' to '+t.name,alt:()=>{
  if(!addResponsibility(techId,roleId))return;
  apply();
  document.querySelectorAll('#crewRows .dyn-row').forEach(crewRowNote);
  crewEdited();toast(role+' added to '+t.name+'’s responsibilities ✓');
 }};
}
// Writes both fields (shared records): `otherRoles` for Pro, `roles` (primary first) for Classic.
function addResponsibility(techId,roleId){
 const t=byId('technicians',techId);if(!t||!roleId||!byId('roles',roleId))return false;
 const others=[...new Set([...otherRoleIds(t),roleId])].filter(id=>id&&id!==t.role);
 t.otherRoles=others.join(',');
 t.roles=[...new Set([t.role,...others].filter(Boolean))];
 save();
 return true;
}
function crewRoleChanged(sel){
 if(sel.value==='__add'){maybeQuickAdd(sel);return;}
 const row=sel.closest('.dyn-row'),tech=row.querySelector('.cr-tech').value,wanted=sel.value;
 if(roleChangeNeedsConfirm(tech,wanted)){
  if(crewStepping(sel)){sel.dataset.pending='1';crewRowNote(row);return;}
  crewAskRole(sel,row,tech,wanted);
  return;
 }
 delete sel.dataset.pending;
 sel.dataset.prev=wanted;sel.dataset.auto=wanted&&wanted===registeredRole(tech)?'1':'';crewRowNote(row);
}
function crewAskRole(sel,row,tech,wanted){
 // The previous role stays until the change is confirmed, so closing the dialog in any way is safe.
 delete sel.dataset.pending;sel.value=sel.dataset.prev||'';crewRowNote(row);
 confirmBox(roleConfirmText(tech,wanted),()=>{if(row.querySelector('.cr-tech').value!==tech)return;sel.value=wanted;sel.dataset.prev=wanted;sel.dataset.auto='';markCrewConfirmed(row);crewRowNote(row);crewEdited();},
  crewRoleChoice(tech,wanted,()=>{if(row.querySelector('.cr-tech').value!==tech)return;sel.value=wanted;sel.dataset.prev=wanted;sel.dataset.auto='';}));
}
// Asks the question a keyboard change deferred. Returns true when a confirmation was opened.
function crewSettle(sel){
 if(!sel||!sel.dataset||!sel.dataset.pending)return false;
 const row=sel.closest?sel.closest('.dyn-row'):null,editor=$('jobModal');
 if(!row||sel.isConnected===false){delete sel.dataset.pending;return false;}
 if(editor&&editor.classList&&typeof editor.classList.contains==='function'&&!editor.classList.contains('open'))return false;
 if(confirmIsOpen())return false;                 // another question is on screen; this one is asked before saving
 sel.dataset.kbd='';
 if(sel.classList.contains('cr-tech')){crewTechApply(sel);crewEdited();return confirmIsOpen();}
 const tech=row.querySelector('.cr-tech').value,wanted=sel.value;
 if(!roleChangeNeedsConfirm(tech,wanted)){delete sel.dataset.pending;sel.dataset.prev=wanted;sel.dataset.auto=wanted&&wanted===registeredRole(tech)?'1':'';crewRowNote(row);return false;}
 crewAskRole(sel,row,tech,wanted);return true;
}
function crewSettleAll(){
 if(typeof document==='undefined'||!document.querySelectorAll)return false;
 let asked=false;
 for(const sel of document.querySelectorAll('#crewRows select'))if(crewSettle(sel))asked=true;
 return asked;
}
function saveJobForm(){
 if(zoneUnsupported()){toast(zoneUnsupportedMessage(),'err');return;}
 // A responsibility changed from the keyboard and not confirmed yet is asked about before saving.
 if(crewSettleAll())return;
 const ev=$('f_event').value.trim();
 if(!ev){toast('Please enter the event name','err');$('f_event').focus();return;}
 // A line keeps what this editor does not show (Classic's hire, sign-in and role-confirmation marks,
 // any newer field) while it is still the same item, or the same person in the same role. A changed
 // line drops them, as Classic does: they belonged to the old item or person (shared records).
 const keepLine=(orig,next,same)=>orig&&typeof orig==='object'&&same(orig)?Object.assign({},orig,next):next;
 const equipment=[...document.querySelectorAll('#equipRows .dyn-row')].map(r=>{
  const sel=r.querySelector('select');const it=byId('equipment',sel.value);
  const next={itemId:it?it.id:null,name:it?it.name:'',spec:r.querySelector('.eq-spec').value.trim()};
  const line=keepLine(r._line,next,o=>(o.itemId||null)===next.itemId);
  // The Hire box decides `hire` (empty or 0 removes it); a row without one keeps what it had.
  const hireBox=r.querySelector('.eq-hire');
  if(hireBox){const n=Math.max(0,parseInt(hireBox.value,10)||0);if(n)line.hire=n;else delete line.hire;}
  return line;
 }).filter(e=>e.name);
 const creatorNow=$('f_creator').value||'';
 const crew=[...document.querySelectorAll('#crewRows .dyn-row')].map(r=>{
  const next={roleId:r.querySelector('.cr-role').value||null,techId:r.querySelector('.cr-tech').value||null};
  const line=keepLine(r._line,next,o=>(o.techId||null)===next.techId&&(o.roleId||null)===next.roleId);
  // A role outside the person's responsibilities confirmed in this editor ("This card only") is marked as
  // Classic marks it, with the job card creator as the one who confirmed (shared records).
  if(r.dataset&&r.dataset.override==='1'&&next.techId&&next.roleId&&roleChangeNeedsConfirm(next.techId,next.roleId)){
   line.override=true;const by=r.dataset.confirmedBy||creatorNow;if(by)line.confirmedBy=by;
  }
  return line;
 }).filter(c=>c.techId);
 const setupFrom=$('f_setup_from').value||null,setupTo=$('f_setup_to').value||null;
 const siteManagerId=$('f_site_manager').value||null,siteManagerTech=byId('technicians',siteManagerId);
 const jobCardCreatorId=$('f_creator').value||null,jobCardCreatorTech=byId('technicians',jobCardCreatorId);
 const fields={event:ev,typeId:$('f_type').value||null,clientId:$('f_client').value||null,venueId:$('f_venue').value||null,
  setupStartAt:$('f_setupStartAt').value||null,eventStartAt:$('f_eventStartAt').value||null,finishAt:$('f_finishAt').value||null,
  setupFrom,setupTo,setupDate:setupFrom||setupTo,eventFrom:$('f_from').value||null,eventTo:$('f_to').value||null,
  siteManagerId,siteManager:siteManagerTech?siteManagerTech.name:'',
  jobCardCreatorId,jobCardCreator:jobCardCreatorTech?jobCardCreatorTech.name:'',
  status:$('f_status').value,priority:$('f_priority').value,notes:$('f_notes').value.trim(),
  equipment,crew,updatedAt:Date.now()};
 // Keep the original date-based calendar/reports populated without overwriting supplied dates.
 if(fields.setupStartAt&&!fields.setupFrom)fields.setupFrom=fields.setupStartAt.slice(0,10);
 if(fields.eventStartAt&&!fields.eventFrom)fields.eventFrom=fields.eventStartAt.slice(0,10);
 if(fields.finishAt&&!fields.eventTo)fields.eventTo=fields.finishAt.slice(0,10);
 fields.setupDate=fields.setupFrom||fields.setupTo;
 const scheduleErrors=DviScheduling.validateJob(fields);
 if(scheduleErrors.length){toast(scheduleErrors[0],'err');renderEditorScheduleWarnings();return;}
 markJobDevice(fields);
 if(fields.setupFrom&&fields.setupTo&&fields.setupTo<fields.setupFrom){toast('Setup end date is before the start date','err');return;}
 if(fields.eventFrom&&fields.eventTo&&fields.eventTo<fields.eventFrom){toast('Event end date is before the start date','err');return;}
 let j;
 if(editingJobId){
  j=state.jobs.find(x=>x.id===editingJobId);
  const old=j.status,roleNote=roleOverrideHistory(j.crew,fields.crew);Object.assign(j,fields);
  j.history.push({ts:Date.now(),text:old!==j.status?('Updated · status '+old+' → '+j.status):'Details updated'});
  if(roleNote)j.history.push({ts:Date.now(),text:roleNote});
 }else{
  j=Object.assign({id:uid(),no:nextNoPreview(),createdAt:Date.now(),history:[{ts:Date.now(),text:'Job card created'}]},fields);
  const roleNote=roleOverrideHistory([],fields.crew);if(roleNote)j.history.push({ts:Date.now(),text:roleNote});
  j.createdDeviceId=cloudClientId();j.createdDeviceName=currentDeviceName();
  state.seq++;state.jobs.push(j);
 }
 save();closeJobModal();renderAll();toast('Job card '+j.no+' saved ✓');openView(j.id);
}

/* ================= JOB CARD AREAS =================
   The printed job card puts each piece of equipment beside the crew who look after it. Equipment and crew roles are
   sorted into the same areas, Screen first, and an area's colour runs down both sides. The area is the one chosen
   in Resources (`area` on the role or equipment item); without one it is read from the name, and for equipment
   from its stock category when the name says nothing. Each row: id, label, colour, words that put a name there. */
const JOB_AREAS=[
 ['screen','Screen','#2563c9',/screen|\bled\b|\btv\b|projector|\blcd\b|monitor|video ?wall/],
 ['sound','Sound','#0d8f72',/sound|audio|\bpa\b|\bmics?\b|microphone|mixer|speaker/],
 ['lighting','Lighting','#d99300',/light|\bpars?\b|moving ?head|wash|spot/],
 ['power','Power','#d2382c',/power|generator|extension|cable|distribution/],
 ['podium','Podium & plinths','#c13f86',/podium|plinth|comfort monitor|lectern/],
 ['signage','Signage & branding','#6a4fd0',/\bsign|banner|brand|\b2d\b|backdrop|board|sticker|poster/],
 ['staging','Staging & rigging','#5d8f1f',/rigg|platform|stag|truss|carpet|marley|floor|goal ?post|\btents?\b|frame|roof/],
 ['booths','Booths & furniture','#8b5e34',/booth|panel|seat|\btables?\b|stool|desk|counter|\bracks?\b|separator|exhibition|chair|furniture/],
 ['virtual','Virtual & streaming','#1297b3',/virtual|conferenc|stream|live ?feed|zoom/],
 ['media','Photo & video','#4a5b85',/photo|videograph|camera/],
 ['transport','Transport','#6b6b6b',/driver|transport|truck|\bvan\b/],
 ['general','Other','#a39b86',null]
];
// A name that fits two areas takes the first one here: "Podium mic" is sound, "Stage Lighting" is lighting,
// "Comfort monitor" goes with the podium, "Generator for lights" is power, "Box truss for banner" is staging.
const JOB_AREA_MATCH=['media','virtual','power','sound','lighting','podium','screen','booths','staging','signage','transport'];
const STOCK_AREA={'Screens & video':'screen','Sound':'sound','Lighting':'lighting','Staging':'staging','Power':'power','Furniture & décor':'booths','Media & services':'media'};
function jobArea(id){return JOB_AREAS.find(a=>a[0]===id)||JOB_AREAS[JOB_AREAS.length-1];}
function guessJobArea(name){const s=String(name||'').toLowerCase();return JOB_AREA_MATCH.find(id=>jobArea(id)[3].test(s))||'general';}
function areaOf(rec,kind){
 if(rec&&rec.area&&JOB_AREAS.some(a=>a[0]===rec.area))return rec.area;
 const g=guessJobArea(rec&&rec.name);
 return g==='general'&&kind==='equipment'&&rec&&STOCK_AREA[rec.category]?STOCK_AREA[rec.category]:g;
}
function areaTint(hex){return '#'+[1,3,5].map(i=>Math.round(255-(255-parseInt(hex.slice(i,i+2),16))*.12).toString(16).padStart(2,'0')).join('');}
// One band per area in use on the card, in JOB_AREAS order. A person is listed once in a band with every role
// they hold there; someone with responsibilities in two areas is in both bands under the same key.
function jobBands(j){
 const m=new Map(JOB_AREAS.map(a=>[a[0],{id:a[0],label:a[1],colour:a[2],equipment:[],crew:[]}]));
 for(const e of j.equipment){
  const it=e.itemId?state.equipment.find(x=>x.id===e.itemId):null;
  let id=it&&it.area?areaOf(it,'equipment'):guessJobArea(e.name);
  if(id==='general'&&it)id=areaOf(it,'equipment');
  m.get(id).equipment.push(e);
 }
 j.crew.forEach((c,i)=>{
  const role=c.roleId?state.roles.find(r=>r.id===c.roleId):null;
  const b=m.get(role?areaOf(role,'roles'):'general'),key=c.techId||'line'+i,rn=c.roleId?nameOf('roles',c.roleId):'Crew';
  const p=b.crew.find(x=>x.key===key);
  if(p){if(!p.roles.includes(rn))p.roles.push(rn);}
  else b.crew.push({key,name:crewDisplayName(c.techId),roles:[rn]});
 });
 return [...m.values()].filter(b=>b.equipment.length||b.crew.length);
}

/* ================= JOB VIEW ================= */
function crewGrouped(j){
 const m=new Map();
 for(const c of j.crew){
  const rn=c.roleId?nameOf('roles',c.roleId):'Crew';
  if(!m.has(rn))m.set(rn,[]);
  m.get(rn).push(crewDisplayName(c.techId));
 }
 return m;
}
function visibleHistoryText(text){
 const t=String(text||'');
 return t
  .replace(/^(Job card created) from .+$/,'$1')
  .replace(/^(Details updated) from .+$/,'$1')
  .replace(/^(Updated .+) from .+$/,'$1')
  .replace(/^(Status: .+) from .+$/,'$1')
  .replace(/^(Duplicated from .+?) on .+$/,'$1');
}
function phaseCardHTML(kind,label,stamp,fallbackDate){
 const tag=kind==='finish'?'':`<i class="tagc ${kind}"></i>`;
 if(stamp)return `<div class="prop-row"><span class="prop-label">${tag}${label}</span><span class="prop-value"><b class="tnum">${esc(stamp.slice(11,16))}&nbsp;&nbsp;<span class="muted">${esc(fmtD(stamp.slice(0,10)))}</span></b></span></div>`;
 return `<div class="prop-row"><span class="prop-label">${tag}${label}</span><span class="prop-value"><b>${statusSymbol('caution','Caution')}&nbsp;Time not set&nbsp;&nbsp;<span class="muted">${fallbackDate?esc(fmtD(fallbackDate))+' · date only':'no date recorded'}</span></b></span></div>`;
}
// Advisory checks as Blender report rows with Astro status symbols.
function checkKind(m){return /^Crew overlap with/.test(m)?'overlap':/^Missing/.test(m)?'times':/^Stock short/.test(m)?'stock':'check';}
function checksHTML(messages,clearText){
 if(!messages.length)return `<div class="chk ok">${statusSymbol('normal','Normal')}<p>${esc(clearText)}</p></div>`;
 const sev={overlap:['critical','Overlap'],times:['caution','Times'],stock:['critical','Stock'],check:['serious','Check']};
 return messages.map(m=>{const k=checkKind(m);return `<div class="chk" data-kind="${k}">${statusSymbol(sev[k][0],sev[k][1])}<p><b>${sev[k][1]}</b> ${esc(m)}</p></div>`;}).join('');
}
// One equipment line's stock state on the job card view: short, last ones, spare, plus any hire.
function stockLineBadge(c,hired){
 const hire=hired?`<span class="sv hire">hire ${hired}</span>`:'';
 if(!c)return hire;
 if(c.k==='short')return `<span class="sv short">${statusSymbol('critical','Short')}short ${-c.spare} on ${esc(fmtDayShort(c.iso))}</span>`+hire;
 if(c.k==='full')return `<span class="sv full">${statusSymbol('caution','Full')}last ones on ${esc(fmtDayShort(c.iso))}</span>`+hire;
 if(c.k==='ok')return `<span class="sv ok">${statusSymbol('normal','Available')}${c.spare} spare</span>`+hire;
 if(c.k==='nodates')return '<span class="sv mut">add dates to check stock</span>'+hire;
 return hire;
}
function openView(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
 $('notifPanel').classList.remove('open');
 const c=byId('clients',j.clientId),v=byId('venues',j.venueId);
 const row=(label,value,sub)=>`<div class="prop-row"><span class="prop-label">${label}</span><span class="prop-value"><b${value?'':' class="muted"'}>${esc(value||'Not set')}${sub?`&nbsp;&nbsp;<span class="muted">${esc(sub)}</span>`:''}</b></span></div>`;
 const panel=(title,body,extra)=>`<section class="bl-panel open"><button class="bl-panel-head" type="button" aria-expanded="true"><span class="bl-tri"></span>${title}${extra?`<span class="spacer"></span><span class="count">${extra}</span>`:''}</button><div class="bl-panel-body">${body}</div></section>`;
 // Crew grouped by role as on the printed card; a role that differs from the person's registered role is marked.
 const crewRows=[],differs=new Map(crewRoleOverrides(j.crew).map(o=>[o.techId+'|'+o.roleId,o])),crewByRole=new Map();
 for(const c of j.crew){const rn=c.roleId?nameOf('roles',c.roleId):'Crew';if(!crewByRole.has(rn))crewByRole.set(rn,[]);crewByRole.get(rn).push(c);}
 for(const [r,list] of crewByRole)for(const c of list){const o=differs.get(c.techId+'|'+c.roleId);crewRows.push(`<div class="list-row${o?' role-differs':''}"><span data-icon="user"></span><span class="lr-name">${esc(crewDisplayName(c.techId))}</span><span class="lr-dim">${esc(r)}</span>${o?`<span class="lr-flag">${statusSymbol('caution','Differs from registered role')}registered ${esc(o.registered)}</span>`:''}</div>`);}
 // Stock against every other booking (the same check Classic shows), and the units hired in.
 const S=stockLib(),sc=S&&S.watched(j)?S.check(j,S.index(state.jobs,stockItem),stockItem):{};
 const eqRows=j.equipment.map((e,i)=>`<div class="list-row"><span class="lr-idx">${i+1}</span><span class="lr-name">${esc(e.name||'Unnamed item')}</span><span class="lr-dim mono">${esc(e.spec||'')}</span>${stockLineBadge(sc[e.itemId],S?S.hireOf(e):0)}</div>`);
 const stockChecks=Object.keys(sc).filter(id=>sc[id].k==='short').map(id=>'Stock short: '+nameOf('equipment',id)+' short '+(-sc[id].spare)+' on '+fmtDayShort(sc[id].iso)+'. Plan a hire on its line or free some up.');
 const history=[...(j.history||[])].reverse();
 $('vmBody').innerHTML=`
 <div class="mb-head"><span data-icon="sheet"></span><h2 id="vmTitle">${esc(j.event)}</h2><span class="mb-sub mono">${esc(j.no)}</span><span class="spacer"></span><button class="x" onclick="closeView()" aria-label="Close job card"><span data-icon="x"></span></button></div>
 <div class="detail-toolbar">
  <div class="aligned"><button type="button" onclick="printJob('${j.id}')"><span data-icon="print"></span>Print / PDF</button><button type="button" onclick="downloadJobPdf('${j.id}')" title="Save the job card as a PDF named after the card"><span data-icon="download"></span>Download PDF</button><button type="button" onclick="printDeliveryNote('${j.id}')"><span data-icon="truck"></span>Delivery Note</button></div>
  <div class="aligned"><button type="button" onclick="closeView();openJobModal('${j.id}')"><span data-icon="edit"></span>Edit</button><button type="button" onclick="duplicateJob('${j.id}')"><span data-icon="copy"></span>Duplicate</button></div>
  ${typeof showJobInCalendar==='function'?`<button class="btn" type="button" onclick="closeView();showJobInCalendar('${j.id}')"><span data-icon="calendar"></span>Show in Schedule</button>`:''}
  <span class="spacer"></span>
  <button class="btn danger" type="button" onclick="askDeleteJob('${j.id}')"><span data-icon="trash"></span>Delete</button>
 </div>
 <div class="detail-body">
  <div class="detail-main">
   ${panel('Production',row('Client',c?c.name:'',c?[c.contact,c.phone].filter(Boolean).join(' · '):'')+row('Venue',v?v.name:'',v?v.area:'')+row('Site Manager',jobSiteManager(j))+row('Created By',jobCardCreator(j))+row('Event Type',j.typeId&&byId('eventTypes',j.typeId)?nameOf('eventTypes',j.typeId):'')+row('Priority',j.priority||'Normal'))}
   ${panel('Timing',row('Setup Dates',setupStart(j)?fmtSetupRange(j):'')+row('Event Dates',j.eventFrom||j.eventTo?fmtRange(j.eventFrom,j.eventTo):'')+phaseCardHTML('setup','Setup Start',j.setupStartAt,setupStart(j))+phaseCardHTML('event','Event Start',j.eventStartAt,j.eventFrom)+phaseCardHTML('finish','Finish',j.finishAt,j.eventTo||j.eventFrom),(z=>z.city+' · '+z.abbr)(zoneLabels(jobInstant(j))))}
   ${panel('Checks','<div class="schedule-warnings editor-checks">'+checksHTML(scheduleMessages(j).concat(stockChecks),'All three '+zoneLabels().city+' times are set and no timed crew overlap was found in this browser.')+'</div>')}
   ${panel('Equipment',`<div class="ui-list">${eqRows.join('')||'<div class="list-row empty-row">No equipment listed</div>'}</div>`,j.equipment.length)}
   ${panel('Crew',`<div class="ui-list">${crewRows.join('')||'<div class="list-row empty-row">No crew assigned</div>'}</div>`,j.crew.length)}
   ${j.notes?panel('Notes',`<div class="vw-notes">${esc(j.notes)}</div>`):''}
  </div>
  <aside class="detail-side">
   ${panel('Status',`<div class="aligned-col vw-status" role="group" aria-label="Update status">${STATUSES.map(s=>`<button class="st-pill${s===j.status?' on':''}" style="--c:${SMETA[s][0]}" aria-pressed="${s===j.status}" onclick="setJobStatus('${j.id}','${s}')"><i class="tagc"></i>${s}</button>`).join('')}</div>`)}
   ${panel('Activity',`<div class="vw-hist">${history.map(h=>`<div class="hist-row"><span class="tnum">${h.ts?fmtDT(h.ts):'Time not recorded'}</span>${esc(visibleHistoryText(h.text))}</div>`).join('')||'<span class="muted">No activity recorded</span>'}</div>`,history.length)}
  </aside>
 </div>`;
 $('viewModal').classList.add('open');
}
function closeView(){$('viewModal').classList.remove('open');}
function setJobStatus(id,s){
 const j=state.jobs.find(x=>x.id===id);
 if(!j||j.status===s)return;
 j.history.push({ts:Date.now(),text:'Status: '+j.status+' → '+s});
 j.status=s;j.updatedAt=Date.now();markJobDevice(j);
 save();renderAll();openView(id);toast(j.no+' → '+s+' ✓');
}
function duplicateJob(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
 const copy=JSON.parse(JSON.stringify(j));
 copy.id=uid();copy.no=nextNoPreview();state.seq++;
 copy.status='Draft';copy.createdAt=Date.now();copy.updatedAt=Date.now();
 copy.createdDeviceId=cloudClientId();copy.createdDeviceName=currentDeviceName();markJobDevice(copy);
 copy.history=[{ts:Date.now(),text:'Duplicated from '+j.no}];
 state.jobs.push(copy);save();closeView();renderAll();
 toast('Duplicated as '+copy.no+' ✓');openJobModal(copy.id);
}
function askDeleteJob(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
 confirmBox('Delete job card '+j.no+' — "'+j.event+'"? This cannot be undone.',()=>{
  state.jobs=state.jobs.filter(x=>x.id!==id);
  save();closeView();renderAll();toast('Job card deleted','err');
 });
}

/* ================= PRINT ================= */
function printJob(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
 const title=jobCardFileName(j);
 const win=window.open('','_blank');
 if(!win){toast('Allow pop-ups to open the job card in a new tab','err');return;}
 win.document.open();
 win.document.write(buildPrintDocument(j,title));
 win.document.close();
 win.focus();
}
function printDeliveryNote(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
 const title=deliveryNoteFileName(j);
 const win=window.open('','_blank');
 if(!win){toast('Allow pop-ups to open the delivery note in a new tab','err');return;}
 win.document.open();
 win.document.write(buildDeliveryNoteDocument(j,title));
 win.document.close();
 win.focus();
}
function cleanFilePart(s){return String(s||'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();}
function jobCardFileName(j){
 const parts=[j.no,j.event,j.clientId?nameOf('clients',j.clientId):'',j.venueId?nameOf('venues',j.venueId):''].map(cleanFilePart).filter(Boolean);
 return parts.join(' - ')||companyShort()+' Job Card';
}
function deliveryNoteFileName(j){return 'Delivery Note - '+jobCardFileName(j);}
/* Download PDF: the printed job card (or delivery note) saved as an A4 PDF under the card's own name, so nobody
   types a file name. Made in this browser with html2canvas 1.4.1 and jsPDF 2.5.1, stored with the app in
   dist/vendor and loaded the first time someone downloads (nothing comes from the internet). The method is
   Classic's: the print page is laid out off screen with its print rules, drawn, and cut into A4 pages at the
   bottom of a row or block so no line is split. */
const PDF_LIBS=['vendor/html2canvas.min.js','vendor/jspdf.umd.min.js'];
let pdfLibs=null,pdfBusy=false;
function loadPdfLibs(){
 if(window.html2canvas&&window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();
 if(!pdfLibs)pdfLibs=PDF_LIBS.reduce((ready,src)=>ready.then(()=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej(new Error('could not load '+src.split('/').pop()));document.head.appendChild(s);})),Promise.resolve())
  .catch(error=>{pdfLibs=null;throw error;});
 return pdfLibs;
}
async function makeJobPdf(j,kind){
 const dn=kind==='delivery',name=(dn?deliveryNoteFileName(j):jobCardFileName(j))+'.pdf';
 await loadPdfLibs();
 const fr=document.createElement('iframe');
 try{
  fr.setAttribute('aria-hidden','true');fr.tabIndex=-1;fr.style.cssText='position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0';
  document.body.appendChild(fr);
  const d=fr.contentDocument;
  d.open();d.write((dn?buildDeliveryNoteDocument(j,name):buildPrintDocument(j,name)).replace(/<script>[\s\S]*?<\/script>/g,''));d.close();
  await new Promise(r=>{if(d.readyState==='complete')r();else fr.addEventListener('load',()=>r(),{once:true});setTimeout(r,4000);});
  // The printed look: the page's print rules applied on screen, and the 12 mm page margin as padding.
  const printRules=[...d.styleSheets].flatMap(sh=>{try{return [...sh.cssRules];}catch(e){return [];}}).filter(r=>r.media&&/print/i.test(r.media.mediaText)).map(r=>[...r.cssRules].map(x=>x.cssText).join('\n')).join('\n');
  const st=d.createElement('style');st.textContent=printRules+'\nhtml,body{margin:0!important;background:#fff!important}body{padding:12mm!important}.print-tools{display:none!important}';d.head.appendChild(st);
  if(d.fonts)await d.fonts.ready;
  const images=()=>Promise.all([...d.images].map(im=>im.complete?0:new Promise(r=>{im.onload=im.onerror=r;})));
  await images();
  // html2canvas draws inline SVG poorly, so any becomes an image with its colours baked in (as Classic does).
  for(const svg of [...d.querySelectorAll('svg')]){
   const r=svg.getBoundingClientRect();if(!r.width||!r.height)continue;
   const clone=svg.cloneNode(true),src=[svg,...svg.querySelectorAll('*')],dst=[clone,...clone.querySelectorAll('*')];
   src.forEach((el,i)=>{const cs=d.defaultView.getComputedStyle(el);if(dst[i]&&el!==svg)dst[i].setAttribute('style',`fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};opacity:${cs.opacity};font-family:${cs.fontFamily};font-weight:${cs.fontWeight}`);});
   clone.setAttribute('width',r.width);clone.setAttribute('height',r.height);clone.removeAttribute('class');clone.removeAttribute('style');
   if(!clone.getAttribute('xmlns'))clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
   const img=d.createElement('img');img.className=svg.getAttribute('class')||'';if(svg.getAttribute('style'))img.setAttribute('style',svg.getAttribute('style'));
   img.style.setProperty('width',r.width+'px','important');img.style.setProperty('height',r.height+'px','important');img.style.setProperty('max-width','none','important');
   img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));
   svg.replaceWith(img);
  }
  await images();
  // SVG images (the seal) are drawn as PNGs at twice their size: html2canvas leaves out an SVG image it cannot size.
  for(const im of [...d.images].filter(im=>/^data:image\/svg\+xml/i.test(im.getAttribute('src')||''))){
   const r=im.getBoundingClientRect();if(!r.width||!r.height||!im.complete)continue;
   const cv=d.createElement('canvas');cv.width=Math.round(r.width*2);cv.height=Math.round(r.height*2);
   try{cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);im.src=cv.toDataURL('image/png');}catch(e){/* kept as it is */}
  }
  await images();
  const W=794,pageH=1123,scale=2;
  // html2canvas finds each font's baseline with a 1 x 1 image it adds to THIS page, where workspace.css makes every
  // image a block. The image then drops to its own line and all text is drawn 4 px too low (the status label sat on
  // its own border). Only that measuring image is kept in the line, and only while the page is drawn.
  const inLine=document.createElement('style');inLine.textContent='body>div[style*="visibility"]>img[width="1"][height="1"]{display:inline!important}';document.head.appendChild(inLine);
  let canvas;
  try{canvas=await window.html2canvas(d.body,{scale,backgroundColor:'#ffffff',width:W,windowWidth:W,useCORS:true,logging:false});}
  finally{inLine.remove();}
  const total=Math.ceil(canvas.height/scale);
  // Page breaks fall at the bottom of a row or block, never through a line of text.
  const stops=[...new Set([...d.querySelectorAll('tr,table,section,h1,h2,h3,p,li,.band,.title,.details,.cols,.sign,.foot,.notes,.section-head,.sheet>*')].map(el=>Math.round(el.getBoundingClientRect().bottom)))].sort((a,b)=>a-b);
  const pdf=new window.jspdf.jsPDF({unit:'px',format:[W,pageH],hotfixes:['px_scaling'],compress:true});
  pdf.setProperties({title:name.replace(/\.pdf$/,''),creator:companyShort()+' Operations'});
  let top=0,pages=0;const breaks=[];
  while(top<total-2&&pages<20){
   let end=Math.min(top+pageH,total);
   if(end<total){const ok=stops.filter(s=>s>top+pageH*.5&&s<=top+pageH);if(ok.length)end=ok[ok.length-1];breaks.push({at:end,atStop:ok.length>0});}
   const slice=document.createElement('canvas');slice.width=W*scale;slice.height=Math.max(1,Math.round((end-top)*scale));
   const g=slice.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,slice.width,slice.height);g.drawImage(canvas,0,Math.round(top*scale),W*scale,slice.height,0,0,W*scale,slice.height);
   if(pages)pdf.addPage([W,pageH]);
   pdf.addImage(slice.toDataURL('image/jpeg',0.92),'JPEG',0,0,W,end-top);
   top=end;pages++;
  }
  return {pdf,name,pages,canvas,breaks};
 }finally{fr.remove();}
}
async function downloadJobPdf(id,kind){
 const j=state.jobs.find(x=>x.id===id);if(!j||pdfBusy)return;
 pdfBusy=true;toast('Preparing the PDF…');
 try{const out=await makeJobPdf(j,kind);out.pdf.save(out.name);toast('Downloaded '+out.name+' ✓');}
 catch(error){toast('The PDF could not be made ('+(error&&error.message||error)+'). Use Print / PDF and choose Save as PDF instead.','err');}
 finally{pdfBusy=false;}
}
function buildPrintDocument(j,title){
 const base=location.href.slice(0,location.href.lastIndexOf('/')+1);
	 const calUrl=dviGoogleCalendarUrl(j);
 const calBtn=calUrl?`<a href="${esc(calUrl)}" target="_blank" rel="noopener">Google Calendar</a>`:'';
 return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=840"><title>${esc(title)}</title><base href="${esc(base)}"><style>${brandCSS(jobCardCSS())}</style></head><body><div class="print-tools">${calBtn}<button type="button" onclick="window.print()">Print / Save PDF</button><button type="button" onclick="if(window.opener&amp;&amp;window.opener.downloadJobPdf)window.opener.downloadJobPdf('${j.id}')">Download PDF</button></div>${buildPrintHTML(j)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`;
}
function buildDeliveryNoteDocument(j,title){
 const base=location.href.slice(0,location.href.lastIndexOf('/')+1);
 return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><base href="${esc(base)}"><style>${brandCSS(printDocCSS()+deliveryNoteCSS())}</style></head><body><div class="print-tools"><button onclick="window.print()">Print / Save PDF</button><button type="button" onclick="if(window.opener&amp;&amp;window.opener.downloadJobPdf)window.opener.downloadJobPdf('${j.id}','delivery')">Download PDF</button></div>${buildDeliveryNoteHTML(j)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`;
}
function printDocCSS(){
 return `@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-tools{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:10px;padding:10px 12px;background:#15161a;border-bottom:2px solid #d4af37}.print-tools a,.print-tools button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:9px 15px;border-radius:8px;border:1px solid #d4af37;background:#d4af37;color:#181203;text-decoration:none;font:700 13px 'Segoe UI',Arial,sans-serif;cursor:pointer}.print-tools button:disabled{opacity:.45;cursor:not-allowed}.pc{padding:10mm}.pc-band{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#15161a;color:#fff;padding:14px 20px;border-radius:0}.pc-logo-crop{width:75px;height:65px;position:relative;overflow:hidden;flex-shrink:0}.pc-logo-crop img{position:absolute;width:325px;height:auto;max-width:none;left:-80px;top:-60px}.pc-co{flex:1;text-align:center}.pc-name{font-size:21px;font-weight:800;color:#d4af37;letter-spacing:1.5px}.pc-tag{font-size:11px;color:#ddd;letter-spacing:.6px;margin-top:2px}.pc-contact{font-size:10.5px;color:#bbb;margin-top:4px}.pc-address{font-size:9.5px;color:#aaa;margin-top:3px}.pc-title{text-align:right}.pc-jc{font-size:21px;font-weight:800;letter-spacing:3px}.pc-no{color:#d4af37;font-weight:700;font-family:Consolas,monospace;margin-top:2px}.pc-statusp{font-size:10px;border:1px solid #d4af37;color:#d4af37;display:inline-block;padding:2px 9px;border-radius:10px;margin-top:5px;letter-spacing:1px}.pc-main{width:100%;border-collapse:collapse;margin-top:14px}.pc-main th{background:#f3e3b3;border:1px solid #333;padding:6px 9px;font-size:10.5px;text-align:left;letter-spacing:.5px}.pc-main td{border:1px solid #333;padding:9px;font-size:12px;font-weight:600;vertical-align:top}.pc-sub{font-weight:400;font-size:10.5px;color:#555}.pc-cols{display:flex;gap:16px;margin-top:16px;align-items:flex-start}.pc-cols>div{flex:1}.pc h4{margin:0 0 7px;font-size:12px;letter-spacing:1.2px;border-bottom:2px solid #d4af37;padding-bottom:4px}.pc-list{width:100%;border-collapse:collapse}.pc-list td{border:1px solid #444;padding:5px 8px;font-size:11px}.pc-list td.num{width:24px;text-align:center;color:#777}.rolecell{background:#f3e3b3;font-weight:700;width:40%;font-size:10px;letter-spacing:.6px;vertical-align:top}.pc-notes{margin-top:14px;border:1px solid #444;border-radius:6px;padding:9px 12px}.pc-notes p{margin:0;font-size:11.5px;line-height:1.55}@media print{body{margin:0}.print-tools{display:none}.pc{padding:0}}.pc-logo-fit{width:75px;height:65px;flex-shrink:0;display:flex;align-items:center;justify-content:center}.pc-logo-fit img{max-width:100%;max-height:100%;object-fit:contain}.pc-logo-mono{width:65px;height:65px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#d4af37;color:#181203;font:800 22px 'Segoe UI',Arial,sans-serif;letter-spacing:1px}`;
}
function deliveryNoteCSS(){
 return `.dn .pc-band{padding:13px 18px}.dn .pc-jc{font-size:19px}.dn-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.dn-meta div{border:1px solid #333;padding:8px 9px;min-height:46px}.dn-meta span{display:block;font-size:9.5px;color:#555;text-transform:uppercase;letter-spacing:.8px;font-weight:700}.dn-meta b{display:block;margin-top:4px;font-size:12px}.dn-note{margin:12px 0 0;border:1px solid #333;border-left:5px solid #d4af37;background:#fffaf0;padding:10px 12px;font-size:11.3px;line-height:1.5}.dn-items{width:100%;border-collapse:collapse;margin-top:12px}.dn-items th{background:#f3e3b3;border:1px solid #333;padding:7px 8px;font-size:10px;text-align:left;letter-spacing:.45px}.dn-items td{border:1px solid #333;padding:8px;font-size:11.2px;vertical-align:top}.dn-items .num{width:30px;text-align:center;color:#777}.dn-items .qty{width:22%}.dn-items .remarks{width:31%}.dn-remarks{border:1px solid #333;margin-top:12px;padding:10px 12px;min-height:96px}.dn-remarks h4{border:0;margin:0 0 8px;padding:0;font-size:11px;letter-spacing:1px}.dn-write-line{border-bottom:1px solid #111;height:20px;margin-top:9px}.dn-accept{margin-top:12px;border:1px solid #333;background:#f7f7f7;padding:10px 12px;font-size:10.9px;line-height:1.45}.dn-sign{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;break-inside:avoid}.dn-signbox{border:1px solid #333;padding:12px;min-height:142px}.dn-signbox b{display:block;font-size:11px;letter-spacing:1px;margin-bottom:12px}.dn-line{display:grid;grid-template-columns:82px 1fr;gap:9px;align-items:end;margin-top:14px}.dn-line span{font-size:9.6px;color:#555;text-transform:uppercase;letter-spacing:.7px}.dn-line i{display:block;border-bottom:1px solid #111;height:20px}.dn-footer-note{margin-top:10px;font-size:9.8px;color:#444;line-height:1.45}@media(max-width:700px){.dn-meta,.dn-sign{grid-template-columns:1fr}}`;
}
function addJobToCalendar(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;
	 const url=dviGoogleCalendarUrl(j);
 if(!url){sandboxNotice();return;}
 window.open(url,'_blank','noopener');
}
function addDaysISO(iso,days){
 const d=new Date(iso+'T00:00');d.setDate(d.getDate()+days);
 return d.toLocaleDateString('en-CA');
}
function compactISO(iso){return String(iso||'').replace(/-/g,'');}
function calendarDateRange(j){
 const start=j.eventFrom||j.eventTo||setupStart(j);
 const end=j.eventTo||j.eventFrom||setupEnd(j);
 return start&&end?compactISO(start)+'/'+compactISO(addDaysISO(end,1)):'';
}
function jobCalendarDetails(j){
 const crew=[...crewGrouped(j)].map(([role,names])=>role+': '+names.join(', ')).join('\n');
 const equipment=j.equipment.map((e,i)=>(i+1)+'. '+((e.spec?e.spec+' ':'')+e.name)).join('\n');
 const siteManager=jobSiteManager(j);
 const creator=jobCardCreator(j);
 return [
  'Job Card: '+j.no,
  'Client: '+nameOf('clients',j.clientId),
  'Venue: '+nameOf('venues',j.venueId),
  'Setup Date: '+fmtSetupRange(j),
  'Event Date: '+fmtRange(j.eventFrom,j.eventTo),
  siteManager?'The Site Manager: '+siteManager:'',
  creator?'Job Card Created by: '+creator:'',
  '',
  'Equipment:',
  equipment||'-',
  '',
  'Crew:',
  crew||'-',
  j.notes?'\nNotes:\n'+j.notes:''
 ].filter(Boolean).join('\n');
}
function googleCalendarUrl(){return '';}
function dviGoogleCalendarUrl(){return '';}
function openDviCalendar(){sandboxNotice();}
function openDviIcal(){sandboxNotice();}
function copyDviCalendarId(){sandboxNotice();}
/* ===== Job card print / PDF: restyled design copied from DVI-Job-Card-Sample.html (the layout used in the other environments).
   The delivery note keeps printDocCSS(); only the job card uses jobCardCSS(). ===== */
function fmtLongDate(iso){const [y,m,d]=String(iso||'').split('-').map(Number);return y&&m>=1&&m<=12&&d?d+daySuffix(d)+' '+MONTHS[m-1]+' '+y:'—';}
function fmtLongRange(a,b){
 if(!(a&&b&&a!==b))return fmtLongDate(a||b);
 const [y1,m1,d1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number),la=fmtLongDate(a),lb=fmtLongDate(b);
 if(la==='—'||lb==='—')return la+' – '+lb;
 if(y1===y2&&m1===m2)return d1+daySuffix(d1)+' – '+lb;
 if(y1===y2)return la.replace(' '+y1,'')+' – '+lb;
 return la+' – '+lb;
}
function fmtLongStamp(ts){return typeof ts==='number'&&Number.isFinite(ts)&&Math.abs(ts)<=8.64e15?fmtLongDate(DviScheduling.wallNow(ts).slice(0,10)):'—';}
// DVI-J badge from the sample. It is DVI's own artwork, so it is drawn only for the default DVI profile (like the bundled logo).
// The ribbon always reads GODRICK, as in the sample (owner's choice, 15 November 2026). Drawn as an image so its
// internal #references resolve inside the SVG itself and not against the print document's <base>.
function jobCardSealHTML(name){
 const label=String(name||'').toUpperCase().slice(0,14)||'DVI';
 const natural=label.length*50.8,len=Math.min(natural,400),size=natural>400?66*400/natural:66,start=(923.6-len)/2;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1240" height="1240" viewBox="0 0 1240 1240"><defs><path id="ring" d="M620,1008 A388,388 0 1 1 620,232 A388,388 0 1 1 620,1008"/><path id="name" d="M238.1,840.5 A441,441 0 0 0 1001.9,840.5"/><clipPath id="disc"><circle cx="620" cy="620" r="364"/></clipPath></defs><circle cx="620" cy="620" r="592" fill="none" stroke="#dadde2" stroke-width="14"/><circle cx="620" cy="620" r="592" stroke="#ffffff" stroke-width="11" fill="#54565a"/><circle cx="620" cy="620" r="509" fill="none" stroke="#ffffff" stroke-width="18"/><circle cx="620" cy="620" r="482" fill="none" stroke-width="34" stroke="#f7a81b"/><circle cx="620" cy="620" r="364" fill="#d41367"/><g clip-path="url(#disc)" fill="#ffffff"><polygon points="487.1,220 1020,220 1020,394 585.4,394"/><polygon points="220,842.5 657,842.5 750.7,1020 220,1020"/></g><g font-family="Montserrat,'Segoe UI',Arial,sans-serif" fill="#ffffff"><text font-size="70" font-weight="600"><textPath href="#ring" xlink:href="#ring" lengthAdjust="spacing" textLength="1517" startOffset="460.5">CERTIFIED TECHNOLOGY SPECIALIST</textPath></text><path d="M457.3,947.8 A366,366 0 0 0 782.7,947.8 L841.9,1067 A499,499 0 0 1 398.1,1067 Z" fill="#f7a81b"/><text font-size="${size.toFixed(2)}" font-weight="600"><textPath href="#name" xlink:href="#name" lengthAdjust="spacing" textLength="${len.toFixed(1)}" startOffset="${start.toFixed(1)}">${esc(label)}</textPath></text><text x="368.25" y="495" font-size="71.4" font-weight="700" textLength="503.5" lengthAdjust="spacingAndGlyphs">DVI JOB CARDS</text><text x="323.25" y="726" font-size="254" font-weight="700" textLength="593.5" lengthAdjust="spacingAndGlyphs">DVI-J</text></g></svg>`;
 return `<img class="seal" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
}
function jobCardCSS(){
 return `@page{size:A4;margin:12mm}*{box-sizing:border-box}html,body{margin:0}
body{background:#e9e6df;color:#1b1b1b;font:400 12px/1.5 'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.print-tools{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;background:#15161a;border-bottom:1px solid #d4af37}
.print-tools a,.print-tools button{display:inline-flex;align-items:center;min-height:34px;padding:0 16px;border-radius:2px;font:600 10.5px/1 'Segoe UI',Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;text-decoration:none;cursor:pointer}
.print-tools a{color:#d4af37;border:1px solid #d4af378c;background:transparent}
.print-tools button{color:#181203;background:#d4af37;border:1px solid #d4af37}
.sheet{width:210mm;max-width:calc(100% - 24px);min-height:297mm;margin:20px auto 36px;padding:12mm;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.08);display:flex;flex-direction:column}
.band{position:relative;display:grid;grid-template-columns:130px 1fr 130px;align-items:center;gap:12px;padding:22px 18px;min-height:140px;background:#15161a;border-bottom:1px solid #d4af37}
.pc-logo-crop{width:75px;height:65px;position:relative;overflow:hidden}.pc-logo-crop img{position:absolute;width:325px;height:auto;max-width:none;left:-80px;top:-60px}
.pc-logo-fit{width:110px;height:65px;display:flex;align-items:center}.pc-logo-fit img{max-width:100%;max-height:100%;object-fit:contain}
.pc-logo-mono{width:65px;height:65px;display:flex;align-items:center;justify-content:center;background:#d4af37;color:#181203;font:700 22px 'Segoe UI',Arial,sans-serif;letter-spacing:1px}
.co{text-align:left;padding-right:80px}.co-name{font-size:21px;line-height:1.25;font-weight:600;letter-spacing:1.5px;color:#d4af37}
.co-tag{margin-top:2px;font-size:8.5px;letter-spacing:2.4px;color:#d6d6d6;text-transform:uppercase}.co-contact{margin-top:5px;font-size:10px;color:#a6a6a6}.co-address{margin-top:1px;font-size:8.5px;color:#858585}
.doc{align-self:start;text-align:center}.doc-title{font-size:17px;line-height:1.2;font-weight:300;letter-spacing:4px;color:#fff;white-space:nowrap}
.doc-no{margin-top:4px;font:400 12px/1.3 Consolas,'SFMono-Regular',Menlo,monospace;color:#d4af37}
.doc-status{display:inline-block;margin-top:6px;padding:1px 9px;border:1px solid #d4af37;border-radius:10px;font-size:8.5px;line-height:1.5;letter-spacing:1.5px;color:#d4af37;text-transform:uppercase}
.seal{display:block;position:absolute;right:130px;bottom:-53px;width:100px;height:100px;filter:drop-shadow(0 4px 9px rgba(0,0,0,.28))}
.label{font-size:8.5px;line-height:1.3;font-weight:600;letter-spacing:1.6px;color:#77715f;text-transform:uppercase}.value{margin-top:3px;font-size:12px;line-height:1.35;color:#111}.sub{margin-top:1px;font-size:10px;color:#77715f}
.section-head{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:5px;border-bottom:1px solid #e6e0d3;font-size:9px;line-height:1.3;font-weight:600;letter-spacing:2px;color:#8a6d14;text-transform:uppercase}
.title{margin-top:16px}.has-seal .title{padding-right:242px}.eyebrow{font-size:9px;font-weight:600;letter-spacing:2px;color:#8a6d14;text-transform:uppercase}
.event{margin:3px 0 0;font-size:22px;line-height:1.25;font-weight:300;letter-spacing:-.2px;color:#111}
.details{display:grid;grid-template-columns:1.2fr 1.3fr 1fr 1fr;margin-top:12px;background:#faf8f3;border:1px solid #e6e0d3}
.details>div{padding:9px 12px;border-left:1px solid #e6e0d3}.details>.nl{border-left:0}.details>.r2{grid-column:span 2;border-top:1px solid #e6e0d3}.details>.r3{border-top:1px solid #e6e0d3}.details>.r4{grid-column:1/-1;border-top:1px solid #e6e0d3}.details .value{font-weight:600}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px;align-items:start}
.grid{width:100%;border-collapse:collapse;border:1px solid #ddd6c6}.grid th,.grid td{text-align:left;vertical-align:middle}.grid tr{break-inside:avoid}
.grid .cap th{padding:7px 10px;background:#15161a;border:1px solid #15161a;border-bottom-color:#d4af37;font-size:9px;line-height:1.4;font-weight:600;letter-spacing:2px;color:#d4af37;text-transform:uppercase}
.grid .cap em{float:right;font-style:normal;font-size:9.5px;font-weight:400;letter-spacing:.4px;color:#9b9b9b;text-transform:none}
.grid .colh th{padding:5px 10px;background:#f6efdc;border-bottom:1px solid #e3d9bd;border-left:1px solid #ebe2c9;font-size:8px;line-height:1.4;font-weight:600;letter-spacing:1.4px;color:#6b5512;text-transform:uppercase}.grid .colh th:first-child{border-left:0}
.grid td{padding:6px 10px;border-top:1px solid #ece7dc;border-left:1px solid #f0ece3;font-size:11.5px;line-height:1.4;color:#1f1d19}.grid td.n,.grid td.role{border-left:0}
.grid th.n,.grid td.n{width:32px;padding-left:4px;padding-right:4px;text-align:center}.grid td.n{font-size:9.5px;letter-spacing:.5px;color:#a39b86}.grid td.spec{font-size:10.5px;color:#77715f}
.grid tbody td:not(.n):not(.role):not(.spec):not(.tick):not(.signin){font-weight:600}
.grid th.tick,.grid td.tick{width:38px;padding-left:0;padding-right:0;text-align:center}.grid td.tick i{display:inline-block;width:10px;height:10px;border:1px solid #b9b2a2;border-radius:2px;vertical-align:middle}
.grid td.role{width:38%;background:#faf8f3;font-size:8.5px;font-weight:600;letter-spacing:1.3px;color:#77715f;text-transform:uppercase}.grid th.signin,.grid td.signin{width:66px}
.plan{margin-top:18px}.grid.bands{table-layout:fixed}.grid.bands tbody{break-inside:avoid;page-break-inside:avoid}.grid.bands tbody tr:first-child td{border-top-color:#cfc7b4}
.grid.bands th.n,.grid.bands td.n,.grid.bands th.tick,.grid.bands td.tick,.grid.bands th.signin,.grid.bands td.signin{width:auto}.grid.bands .colh th.who{border-left:4px solid #e3d9bd}
.grid td.area{padding:7px 6px 7px 8px;border-left:5px solid #a39b86;vertical-align:top;font-size:8.5px;line-height:1.35;letter-spacing:1.1px;color:#3d3a34;text-transform:uppercase;overflow-wrap:anywhere}
.grid td.who{border-left:4px solid #a39b86}.grid td.spec.none{border-left:0;color:#b9b2a2}
.grid .duty{display:block;margin-top:1px;font-size:8px;line-height:1.3;letter-spacing:1px;color:#77715f;text-transform:uppercase}
.grid td.signin.again{padding-left:2px;padding-right:2px;font-size:8px;line-height:1.2;letter-spacing:.3px;color:#a39b86;text-align:center}
.notes{margin-top:18px}.notes p{margin:7px 0 0;font-size:11.5px;line-height:1.6;color:#3d3a34}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin:40px 0 16px}.sign>div{padding-top:5px;border-top:1px solid #bdb6a6}.sign .value{min-height:16px;font-size:11px}
.foot{display:flex;justify-content:space-between;gap:12px;margin-top:auto;padding-top:7px;border-top:1px solid #efebe2;font-size:8.5px;letter-spacing:.4px;color:#a39b86}
.band,.title,.details,.sign,.foot{break-inside:avoid;page-break-inside:avoid}.section-head{break-after:avoid;page-break-after:avoid}.notes p{orphans:3;widows:3}
@media print{body{background:#fff}.print-tools{display:none}.sheet{width:auto;max-width:none;min-height:270mm;margin:0;padding:0;box-shadow:none}}
@media screen and (max-width:640px){.sheet{width:auto;max-width:none;min-height:0;margin:0;padding:16px}.band{grid-template-columns:1fr;justify-items:center;text-align:center}.doc{text-align:center}.co{text-align:center;padding-right:0}.has-seal .title{padding-right:84px}.details,.cols,.sign{grid-template-columns:1fr}.details>div,.details>.r2,.details>.r4{grid-column:auto;border-left:0;border-top:1px solid #e6e0d3}.details>div:first-child{border-top:0}.seal{right:12px;bottom:-30px;width:72px;height:72px}}`;
}
function buildPrintHTML(j){
 const c=byId('clients',j.clientId);
 const co=state.company;
 const web=[co.email,co.website].filter(Boolean).map(esc).join(' &middot; ');
 const contact=[co.phone?esc(co.phone):'',web].filter(Boolean).join('<br>');
 const siteManager=jobSiteManager(j);
 const creator=jobCardCreator(j);
 const seal=companyLogoKind()==='bundled'?jobCardSealHTML('GODRICK'):'';
 // Equipment and crew in bands by area (jobBands): the area's colour is the stripe on both sides, equipment is
 // numbered down the page, and a person in more than one band signs in once, on their first line.
 const signed=new Set();let bandRows='',no=0;
 for(const b of jobBands(j)){
  const n=Math.max(b.equipment.length,b.crew.length);
  bandRows+='<tbody>';
  for(let i=0;i<n;i++){
   const e=b.equipment[i],p=b.crew[i],again=!!p&&signed.has(p.key);
   if(p)signed.add(p.key);
   const duty=p?p.roles.filter(r=>r!=='Crew'&&r.toLowerCase()!==b.label.toLowerCase()).join(', '):'';
   bandRows+='<tr>'+(i?'':`<td class="area" rowspan="${n}" style="border-left-color:${b.colour};background:${areaTint(b.colour)}">${esc(b.label)}</td>`)
    +(e?`<td class="n">${String(++no).padStart(2,'0')}</td><td>${esc(e.name||'—')}</td><td class="spec">${e.spec?esc(e.spec):'&mdash;'}</td><td class="tick"><i></i></td><td class="tick"><i></i></td>`:`<td class="spec none" colspan="5">${i||b.equipment.length?'':'&mdash;'}</td>`)
    +`<td class="who" style="border-left-color:${b.colour}">${p?esc(p.name)+(duty?`<span class="duty">${esc(duty)}</span>`:''):''}</td><td class="signin${again?' again':''}">${again?'signs above':''}</td></tr>`;
  }
  bandRows+='</tbody>';
 }
 const items=j.equipment.length,people=new Set(j.crew.map((c,i)=>c.techId||'line'+i)).size;
 const clientSub=c&&(c.contact||c.phone)?`<div class="sub">${esc([c.contact,c.phone].filter(Boolean).join(' · '))}</div>`:'';
 const zone=(z=>esc(z.city)+' · '+esc(z.named?z.abbr+' ('+z.off+')':z.off))(zoneLabels(jobInstant(j)));
 return `<main class="sheet${seal?' has-seal':''}">
 <header class="band">
  ${printLogoHTML()}
  <div class="co">
   <div class="co-name">${esc(co.name)}</div>
   ${co.tagline?`<div class="co-tag">${esc(co.tagline)}</div>`:''}
   ${contact?`<div class="co-contact">${contact}</div>`:''}
   ${co.address?`<div class="co-address">${esc(co.address)}</div>`:''}
  </div>
  <div class="doc">
   <div class="doc-title">JOB CARD</div>
   <div class="doc-no">${esc(j.no)}</div>
   <div class="doc-status">${esc(j.status)}</div>
  </div>
  ${seal}
 </header>
 <section class="title">
  ${j.typeId?`<div class="eyebrow">${esc(nameOf('eventTypes',j.typeId))}</div>`:''}
  <h1 class="event">${esc(j.event)}</h1>
 </section>
 <section class="details">
  <div class="nl"><div class="label">Client</div><div class="value">${esc(nameOf('clients',j.clientId))}</div>${clientSub}</div>
  <div><div class="label">Venue</div><div class="value">${esc(nameOf('venues',j.venueId))}</div></div>
  <div><div class="label">Set up date</div><div class="value">${fmtLongRange(setupStart(j),setupEnd(j))}</div></div>
  <div><div class="label">Event date</div><div class="value">${fmtLongRange(j.eventFrom,j.eventTo)}</div></div>
  <div class="r2 nl"><div class="label">Site manager</div><div class="value">${esc(siteManager||'—')}</div></div>
  <div class="r3"><div class="label">Created by</div><div class="value">${esc(creator||'—')}</div></div>
  <div class="r3"><div class="label">Created on</div><div class="value">${fmtLongStamp(j.createdAt)}</div></div>
  <div class="r4 nl"><div class="label">Schedule · ${zone}</div><div class="value">${esc(printTimedSummary(j))}</div></div>
 </section>
 <section class="plan">
  <table class="grid bands">
   <colgroup><col style="width:92px"><col style="width:30px"><col><col style="width:96px"><col style="width:36px"><col style="width:36px"><col style="width:178px"><col style="width:62px"></colgroup>
   <thead>
    <tr class="cap"><th colspan="6">Equipment <em>${items} item${items===1?'':'s'}</em></th><th colspan="2">Crew assignment <em>${people} ${people===1?'person':'people'}</em></th></tr>
    <tr class="colh"><th>Area</th><th class="n">No.</th><th>Item</th><th>Specification</th><th class="tick">Out</th><th class="tick">Back</th><th class="who">Crew member</th><th class="signin">Sign-in</th></tr>
   </thead>
   ${bandRows||'<tbody><tr><td class="spec" colspan="8">No equipment or crew listed</td></tr></tbody>'}
  </table>
 </section>
 ${j.notes?`<section class="notes"><div class="section-head">Notes / instructions</div><p>${esc(j.notes).replace(/\n/g,'<br>')}</p></section>`:''}
 <section class="sign">
  <div><div class="label">Prepared by</div><div class="value">${esc(creator)}</div></div>
  <div><div class="label">Site manager</div><div class="value">${esc(siteManager)}</div></div>
  <div><div class="label">Client representative</div><div class="value"></div></div>
 </section>
 <footer class="foot"><span>${esc(co.name)} &middot; Job Card System v2.0</span><span>${esc(j.no)} &middot; Printed ${fmtLongDate(todayISO())}</span></footer>
</main>`;
}
function buildDeliveryNoteHTML(j){
 const c=byId('clients',j.clientId);
 const co=state.company;
 const contactLine=[co.phone,co.email,co.website].filter(Boolean).map(esc).join(' &middot; ');
 const clientName=nameOf('clients',j.clientId);
 const clientContact=c&&(c.contact||c.phone)?`<br><span class="pc-sub">${esc([c.contact,c.phone].filter(Boolean).join(' &middot; '))}</span>`:'';
 const itemRows=j.equipment.map((e,n)=>`<tr><td class="num">${n+1}</td><td>${esc(e.spec||'')}</td><td>${esc(e.name)}</td><td></td></tr>`).join('')||'<tr><td class="num">-</td><td colspan="3">No delivered items listed on this job card.</td></tr>';
 return `<div class="pc dn">
 <div class="pc-band">
  ${printLogoHTML()}
  <div class="pc-co">
   <div class="pc-name">${esc(co.name)}</div>
   ${co.tagline?`<div class="pc-tag">${esc(co.tagline.toUpperCase())}</div>`:''}
   <div class="pc-contact">${contactLine}</div>
   ${co.address?`<div class="pc-address">${esc(co.address)}</div>`:''}
  </div>
  <div class="pc-title">
   <div class="pc-jc">DELIVERY NOTE</div>
   <div class="pc-no">${esc(j.no)}-DN</div>
   <div class="pc-statusp">CLIENT COPY</div>
  </div>
 </div>
 <div class="dn-meta">
  <div><span>Delivery note no.</span><b>${esc(j.no)}-DN</b></div>
  <div><span>Job card no.</span><b>${esc(j.no)}</b></div>
  <div><span>Issued date</span><b>${fmtD(todayISO())}</b></div>
 </div>
 <table class="pc-main">
  <thead><tr><th>EVENT</th><th>CLIENT / COMPANY</th><th>VENUE</th><th>SET UP DATE</th><th>EVENT DATE</th></tr></thead>
  <tbody><tr>
   <td>${esc(j.event.toUpperCase())}${j.typeId?`<br><span class="pc-sub">${esc(nameOf('eventTypes',j.typeId))}</span>`:''}</td>
   <td>${esc(clientName.toUpperCase())}${clientContact}</td>
   <td>${esc(nameOf('venues',j.venueId).toUpperCase())}</td>
   <td>${fmtSetupRange(j)}</td>
   <td>${fmtRange(j.eventFrom,j.eventTo)}</td>
  </tr></tbody>
 </table>
 <div class="dn-note"><b>Delivery acknowledgement:</b> the items below have been delivered for the event stated above. Any missing item, damage, substitution, or client-requested change should be written in the remarks section before signing.</div>
 <table class="dn-items">
  <thead><tr><th>No.</th><th class="qty">Qty / Size / Spec</th><th>Delivered Item</th><th class="remarks">Condition / Client Remarks</th></tr></thead>
  <tbody>${itemRows}</tbody>
 </table>
 <div class="dn-remarks"><h4>DELIVERY REMARKS / CLIENT REQUESTS</h4><div class="dn-write-line"></div><div class="dn-write-line"></div><div class="dn-write-line"></div></div>
 <div class="dn-accept"><b>Acceptance:</b> by signing below, the client representative confirms that the listed items were delivered to site, except for any notes written above.</div>
 <div class="dn-sign">
  <div class="dn-signbox">
   <b>CLIENT RECEIVED BY</b>
   <div class="dn-line"><span>Name</span><i></i></div>
   <div class="dn-line"><span>Signature</span><i></i></div>
   <div class="dn-line"><span>Date / Time</span><i></i></div>
  </div>
  <div class="dn-signbox">
   <b>${esc(companyShort().toUpperCase())} DELIVERED BY</b>
   <div class="dn-line"><span>Name</span><i></i></div>
   <div class="dn-line"><span>Signature</span><i></i></div>
   <div class="dn-line"><span>Date / Time</span><i></i></div>
  </div>
 </div>
 <div class="dn-footer-note">Keep a signed copy of this Delivery Note with the job record.</div>
</div>`;
}

/* ================= DASHBOARD ================= */
// The overview is rendered by operations.js once all modules have loaded.
// Earlier editions' free-floating panel layout was retired; its stored layout key is left untouched.
function renderDashboard(){}

/* ================= JOBS LIST ================= */
// One overlap index per render pass (scheduling.js conflictIndex); renderers pass it down.
function overlapIndex(){return DviScheduling.conflictIndex(state.jobs,state.technicians);}
function jobOverlaps(j,idx){return idx?(idx.get(j)||[]):DviScheduling.conflicts(j,state.jobs,state.technicians);}
function timingChip(j,idx){
 const times=['setupStartAt','eventStartAt','finishAt'].filter(k=>j[k]).length;
 if(j.status!=='Cancelled'&&times===3&&jobOverlaps(j,idx).length)return `<span class="time-chip conflict" title="Timed crew overlap with another job">${statusSymbol('critical','Critical')}Overlap</span>`;
 if(times===3)return `<span class="time-chip" title="Setup, event and finish times recorded (${esc(zoneLabels(jobInstant(j)).abbr)})">${statusSymbol('normal','Normal')}Timed</span>`;
 return `<span class="time-chip missing" title="${3-times} of 3 ${esc(zoneLabels().city)} times missing; overlap cannot be checked">${statusSymbol('caution','Caution')}${times?times+'/3 times':'No times'}</span>`;
}
// Compact civil range for dense tables: "27–28 Nov 2026", "30 Nov – 2 Dec 2026".
function fmtRangeShort(a,b){
 const p=iso=>{const [y,m,d]=String(iso||'').split('-').map(Number);return y&&m&&d?{y,m,d}:null;};
 const s=p(a||b),e=p(b||a);if(!s)return '—';
 const mon=m=>MONTHS[m-1].slice(0,3);
 if(!e||(a||b)===(b||a))return s.d+' '+mon(s.m)+' '+s.y;
 if(s.y===e.y&&s.m===e.m)return s.d+'–'+e.d+' '+mon(s.m)+' '+s.y;
 if(s.y===e.y)return s.d+' '+mon(s.m)+' – '+e.d+' '+mon(e.m)+' '+s.y;
 return s.d+' '+mon(s.m)+' '+s.y+' – '+e.d+' '+mon(e.m)+' '+e.y;
}
function clearJobFilters(){$('jq').value='';$('jStatus').value='';$('jClient').value='';renderJobs();}
function renderJobs(){
 fillFilter($('jClient'),'clients','All clients');
 const q=$('jq').value.toLowerCase().trim(),st=$('jStatus').value,cl=$('jClient').value,sort=$('jSort').value;
 let list=state.jobs.filter(j=>{
  if(st&&j.status!==st)return false;
  if(cl&&j.clientId!==cl)return false;
  if(q){const hay=(j.event+' '+j.no+' '+nameOf('clients',j.clientId)+' '+nameOf('venues',j.venueId)+' '+jobSiteManager(j)+' '+jobCardCreator(j)).toLowerCase();if(!hay.includes(q))return false;}
  return true;
 });
 const key=j=>j.eventFrom||setupStart(j)||'';
 if(sort==='ev_desc')list.sort((a,b)=>key(b).localeCompare(key(a)));
 else if(sort==='ev_asc')list.sort((a,b)=>key(a).localeCompare(key(b)));
 else list.sort((a,b)=>b.createdAt-a.createdAt);
 $('jobsCount').textContent=list.length===state.jobs.length?state.jobs.length+' job card'+(state.jobs.length===1?'':'s'):'Showing '+list.length+' of '+state.jobs.length;
 const cell=v=>v&&v!=='—'?esc(v):'<span class="muted">—</span>',idx=overlapIndex();
 // "Stock short" beside the status of a card still to come that cannot take all its equipment (as Classic flags it).
 const S=stockLib(),sIdx=S?S.index(state.jobs,stockItem):null,today=todayISO();
 const stockFlag=j=>{
  if(!S||!S.watched(j))return '';const d=S.days(j);if(!d||d[1]<today)return '';
  const sh=S.shortList(j,sIdx,stockItem);
  return sh.length?` <span class="sv short" title="${esc(sh.map(x=>nameOf('equipment',x.id)+': short '+(-x.spare)+' on '+fmtDayShort(x.iso)).join('; '))}">${statusSymbol('critical','Short')}Stock short</span>`:'';
 };
 $('jobsTbody').innerHTML=list.map(j=>`<tr onclick="openView('${j.id}')">
  <td class="job-no" data-label="Job no.">${esc(j.no)}</td>
  <td class="job-event" data-label="Event"><button class="job-title-link" onclick="event.stopPropagation();openView('${j.id}')"><b>${esc(j.event)}</b>${j.typeId&&byId('eventTypes',j.typeId)?`<small>${esc(nameOf('eventTypes',j.typeId))}</small>`:''}</button></td>
  <td data-label="Client">${cell(j.clientId?nameOf('clients',j.clientId):'')}</td>
  <td data-label="Venue">${cell(j.venueId?nameOf('venues',j.venueId):'')}</td>
  <td data-label="Setup">${setupStart(j)?esc(fmtRangeShort(setupStart(j),setupEnd(j))):'<span class="muted">—</span>'}</td>
  <td data-label="Event date">${j.eventFrom||j.eventTo?esc(fmtRangeShort(j.eventFrom,j.eventTo)):'<span class="muted">—</span>'}</td>
  <td data-label="Times">${timingChip(j,idx)}</td>
  <td data-label="Site manager">${cell(jobSiteManager(j))}</td>
  <td class="num" data-label="Crew">${j.crew.length||'<span class="muted">—</span>'}</td>
  <td data-label="Status">${statusPill(j.status)}${stockFlag(j)}</td>
  <td class="act-cell" data-label="Actions" onclick="event.stopPropagation()"><div class="acts">
   <button title="Edit ${esc(j.no)}" onclick="openJobModal('${j.id}')"><span data-icon="edit"></span></button>
   <button title="Print ${esc(j.no)}" onclick="printJob('${j.id}')"><span data-icon="print"></span></button>
   <button title="Duplicate ${esc(j.no)}" onclick="duplicateJob('${j.id}')"><span data-icon="copy"></span></button>
  </div></td></tr>`).join('');
 $('jobsTable').style.display=list.length?'':'none';
 $('jobsEmpty').style.display=list.length?'none':'';
 $('jobsEmpty').innerHTML=state.jobs.length?'<span class="empty-icon" data-icon="search"></span><b>No job cards match these filters</b><p>Try another search term, status or client.</p><button class="btn sm" onclick="clearJobFilters()">Clear filters</button>'
  :'<span class="empty-icon" data-icon="folder"></span><b>No job cards yet</b><p>Job cards you create in this browser appear here.</p><div class="data-btns"><button class="btn primary" onclick="openJobModal()"><span data-icon="plus"></span>New job card</button><button class="btn" onclick="openIntake()"><span data-icon="text"></span>Describe a job</button></div>';
}

/* ================= SCHEDULE ================= */
// The calendar studio (calendar.js) replaces this once it has loaded.
function renderSchedule(){}
function calShift(n){calM+=n;if(calM<0){calM=11;calY--;}if(calM>11){calM=0;calY++;}renderSchedule();}
function calToday(){const n=todayISO().split('-').map(Number);calY=n[0];calM=n[1]-1;if($('opsBriefDate'))$('opsBriefDate').value=todayISO();renderSchedule();}
function opsBriefDate(){const el=$('opsBriefDate');if(el&&!el.value)el.value=todayISO();return el&&el.value?el.value:todayISO();}
function weekStartISO(iso){
 const d=new Date(iso+'T00:00:00');
 const back=(d.getDay()+6)%7;
 d.setDate(d.getDate()-back);
 return d.toLocaleDateString('en-CA');
}
function monthStartISO(iso){
 const d=new Date(iso+'T00:00:00');
 return new Date(d.getFullYear(),d.getMonth(),1).toLocaleDateString('en-CA');
}
function monthEndISO(iso){
 const d=new Date(iso+'T00:00:00');
 return new Date(d.getFullYear(),d.getMonth()+1,0).toLocaleDateString('en-CA');
}
function jobEventCovers(j,iso){
 const f=j.eventFrom,to=j.eventTo||j.eventFrom;
 return !!(f&&f<=iso&&iso<=to);
}
function opsJobPhase(j,iso){
 const p=[];
 if(setupCovers(j,iso))p.push('Setup');
 if(jobEventCovers(j,iso))p.push('Event');
 return p.join(' + ')||'Job';
}
function opsJobsForDay(iso){
 return state.jobs.filter(j=>j.status!=='Cancelled'&&(setupCovers(j,iso)||jobEventCovers(j,iso)))
  .sort((a,b)=>(setupStart(a)||a.eventFrom||'').localeCompare(setupStart(b)||b.eventFrom||'')||a.event.localeCompare(b.event));
}
function opsDateList(start,end){
 const days=[];
 for(let iso=start;iso<=end;iso=addDaysISO(iso,1))days.push(iso);
 return days;
}
function opsJobDates(j,days,kind){
 return days.filter(iso=>kind==='setup'?setupCovers(j,iso):kind==='event'?jobEventCovers(j,iso):(setupCovers(j,iso)||jobEventCovers(j,iso)));
}
function opsDateListText(list){return list.length?list.map(fmtD).join(', '):'-';}
function opsSummaryJobs(days){
 const seen=new Set(),jobs=[];
 for(const iso of days)for(const j of opsJobsForDay(iso))if(!seen.has(j.id)){seen.add(j.id);jobs.push(j);}
 return jobs;
}
function opsJobPeriodText(j,days){
 const setup=opsJobDates(j,days,'setup'),event=opsJobDates(j,days,'event');
 return [
  setup.length?'Setup: '+opsDateListText(setup):'',
  event.length?'Event: '+opsDateListText(event):''
 ].filter(Boolean).join('<br>')||'-';
}
function opsTeamAllocations(days){
 const m=new Map();
 const add=(name,role,iso,event,kind)=>{
  if(!name)return;
  const k=name.toLowerCase();
  if(!m.has(k))m.set(k,{name,roles:new Set(),items:[],days:new Set(),jobs:new Set(),kind:kind||'Crew'});
  const row=m.get(k);
  row.roles.add(role);
  row.days.add(iso);
  row.jobs.add(event);
  row.items.push(fmtD(iso)+' - '+role+' - '+event);
 };
 for(const iso of days){
  for(const j of opsJobsForDay(iso)){
   add(jobSiteManager(j),'The Site Manager',iso,j.event,'Admin');
   add(jobCardCreator(j),'Created by',iso,j.event,'Admin');
   for(const c of (j.crew||[]))add(crewDisplayName(c.techId),c.roleId?nameOf('roles',c.roleId):'Crew',iso,j.event,'Labour');
  }
 }
 return [...m.values()].map(x=>Object.assign(x,{role:[...x.roles].join(', ')})).sort((a,b)=>a.name.localeCompare(b.name));
}
function opsEquipmentDistribution(jobs){
 const m=new Map();
 for(const j of jobs){
  for(const e of (j.equipment||[])){
   const name=(e.name||'Equipment').trim();
   const k=name.toLowerCase();
   if(!m.has(k))m.set(k,{name,count:0,specs:new Set(),jobs:[]});
   const row=m.get(k);
   row.count++;
   if(e.spec)row.specs.add(e.spec);
   row.jobs.push(j.no+' - '+j.event);
  }
 }
 return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function opsTransportRows(days){
  const rows=[];
  const transportRe=/driver|transport|logistics|dispatch/i;
  const vehicleRe=/truck|vehicle|van|pickup|car|bus|fuel|transport/i;
 for(const iso of days){
  for(const j of opsJobsForDay(iso)){
   const drivers=(j.crew||[]).filter(c=>transportRe.test(c.roleId?nameOf('roles',c.roleId):'')).map(c=>crewDisplayName(c.techId));
   const vehicles=(j.equipment||[]).filter(e=>vehicleRe.test((e.name||'')+' '+(e.spec||''))).map(e=>(e.spec?e.spec+' ':'')+e.name);
   if(drivers.length||vehicles.length)rows.push({iso,job:j,drivers,vehicles});
  }
  }
  return rows;
}
function opsUniqueList(list){return [...new Set((list||[]).map(x=>String(x||'').trim()).filter(Boolean))];}
function opsBriefList(list,limit){
 const clean=opsUniqueList(list);
 if(!clean.length)return '-';
 const shown=clean.slice(0,limit);
 const more=clean.length>limit?`<span class="ops-more">+${clean.length-limit} more</span>`:'';
 return esc(shown.join('\n')).replace(/\n/g,'<br>')+more;
}
function opsRoleDistribution(team){
 const m=new Map();
 for(const t of team){
  const roles=t.roles&&t.roles.size?[...t.roles]:[(t.role||'Crew')];
  for(const role of roles){
   const key=(role||'Crew').trim()||'Crew';
   if(!m.has(key))m.set(key,{role:key,people:new Set(),days:0,jobs:0});
   const row=m.get(key);
   row.people.add(t.name);
   row.days+=t.days.size;
   row.jobs+=t.jobs.size;
  }
 }
 return [...m.values()].sort((a,b)=>b.days-a.days||a.role.localeCompare(b.role));
}
function opsMissingTransport(days,transport){
 const routed=new Set(transport.map(r=>r.iso+'|'+r.job.id));
 const rows=[];
 for(const iso of days){
  for(const j of opsJobsForDay(iso)){
   if(!routed.has(iso+'|'+j.id))rows.push({iso,job:j});
  }
 }
 return rows;
}
function opsSummaryCSS(){
 return `@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;background:#1b202b;color:#14161a;font-family:'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-tools{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:10px;padding:10px 12px;background:#111827;border-bottom:2px solid #d7b45a}.print-tools button{min-height:38px;padding:9px 15px;border-radius:8px;border:1px solid #d7b45a;background:#d7b45a;color:#151105;font:800 13px 'Segoe UI',Arial,sans-serif;cursor:pointer}.ops-sheet{padding:14px}.ops-page{width:13.333in;min-height:7.5in;aspect-ratio:16/9;background:#f7f8fb;border:1px solid #c8ced8;box-shadow:0 1px 3px rgba(0,0,0,.18);padding:.32in;margin:0 auto 14px;position:relative;overflow:hidden;break-after:page}.ops-page:last-child{break-after:auto}.ops-page:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:#d7b45a}.ops-top,.ops-page-head{display:grid;grid-template-columns:1.45fr .55fr;gap:10px;align-items:stretch}.ops-brand,.ops-headline{background:#111827;color:#fff;padding:12px 15px;border-left:7px solid #d7b45a;min-height:.82in}.ops-brand h1,.ops-headline h1{margin:0;font-size:25px;line-height:1.05;letter-spacing:0}.ops-brand p,.ops-headline p{margin:5px 0 0;color:#d3d8e2;font-size:11px;line-height:1.3}.ops-window,.ops-period{background:#fff;border:1px solid #1f2937;padding:11px 12px}.ops-window span,.ops-period span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.75px;color:#5a6170;font-weight:900}.ops-window b,.ops-period b{display:block;margin-top:4px;font-size:16px;line-height:1.15;color:#111827}.ops-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:0;margin-top:9px;border:1px solid #20242c;background:#fff}.ops-stat{padding:5px 8px;border-right:1px solid #c8ced8}.ops-stat:last-child{border-right:0}.ops-stat b{display:block;font-size:15px;color:#111827;line-height:1.1}.ops-stat span{display:block;margin-top:4px;font-size:7.7px;text-transform:uppercase;letter-spacing:.55px;color:#545b66;font-weight:900}.ops-command-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.ops-command-card{background:#111827;color:#fff;border-left:4px solid #d7b45a;padding:8px 9px;min-height:.55in}.ops-command-card span{display:block;color:#b8c0cf;font-size:7px;text-transform:uppercase;letter-spacing:.65px;font-weight:900}.ops-command-card b{display:block;margin-top:3px;font-size:14px;line-height:1.05}.ops-command-card small{display:block;margin-top:3px;color:#d8dee9;font-size:7.4px;line-height:1.2}.ops-timeline{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin:8px 0}.ops-tick{min-height:.42in;background:#fff;border:1px solid #c9d0da;padding:5px 6px;position:relative}.ops-tick.hot{background:#fff7df;border-color:#b88900}.ops-tick b{display:block;font-size:8px;color:#313844}.ops-tick span{display:inline-block;margin-top:1px;font-size:15px;font-weight:900;color:#1f5a92}.ops-tick small{position:absolute;right:6px;bottom:5px;font-size:7px;color:#555}.ops-board{display:grid;grid-template-columns:1.08fr .92fr;gap:10px;align-items:start}.ops-section{margin-top:8px;position:relative;z-index:1}.ops-section h2,.ops-block-title{margin:0 0 6px;font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;border-bottom:2px solid #d7b45a;padding-bottom:4px;color:#111827}.ops-table{width:100%;border-collapse:collapse;background:#fff}.ops-table th{background:#e9edf4;border:1px solid #20242c;padding:4px 5px;font-size:7px;text-align:left;text-transform:uppercase;letter-spacing:.3px}.ops-table td{border:1px solid #20242c;padding:4px 5px;font-size:7.6px;vertical-align:top;line-height:1.18}.ops-table b{font-size:8.2px}.ops-note{color:#5f6672;font-size:7.1px}.ops-more{display:block;margin-top:2px;color:#1f5a92;font-weight:900;font-size:7px}.ops-empty{padding:8px;background:#fff;border:1px dashed #8b95a7;color:#555;font-size:7.8px}.ops-focus-list{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ops-focus-card{background:#fff;border:1px solid #20242c;padding:7px 8px;min-height:.62in}.ops-focus-card b{display:block;font-size:10px;color:#111827;line-height:1.12}.ops-focus-card span{display:block;margin-top:3px;color:#596170;font-size:7.4px;line-height:1.2}.ops-focus-card strong{display:block;margin-top:4px;color:#1f5a92;font-size:7.4px}.ops-distribution-grid{display:grid;grid-template-columns:1.04fr .96fr;gap:10px;align-items:start;margin-top:7px}.ops-resource-hero{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.ops-resource-card{border:1px solid #20242c;background:#fff;padding:7px 8px;min-height:.62in}.ops-resource-card span{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.65px;color:#687081;font-weight:900}.ops-resource-card b{display:block;margin:3px 0;font-size:11.6px;color:#111827;line-height:1.05}.ops-resource-card small{display:block;color:#1f5a92;font-weight:900;font-size:7.6px}.ops-resource-card p{margin:4px 0 0;font-size:7px;line-height:1.15;color:#525965}.ops-meter{height:6px;background:#e2e8f0;border:1px solid #a8b1bf;margin-top:3px}.ops-meter i{display:block;height:100%;background:#2f7d68}.ops-role-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:7px 0}.ops-role{background:#111827;color:#fff;border-left:4px solid #d7b45a;padding:6px 7px;min-height:.4in}.ops-role b{display:block;font-size:14px;line-height:1}.ops-role span{display:block;margin-top:4px;font-size:6.8px;text-transform:uppercase;letter-spacing:.4px;color:#dce3ef}.ops-route-list{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px}.ops-route{border:1px solid #20242c;background:#fff;padding:6px 7px;min-height:.52in}.ops-route b{display:block;font-size:8.4px;color:#111827}.ops-route span{display:block;margin-top:2px;font-size:6.9px;color:#596170;line-height:1.16}.ops-route strong{display:block;margin-top:4px;font-size:7.2px;color:#2f7d68}.ops-route.pending strong{color:#a15c00}.ops-mini-note{font-size:7px;color:#677181;margin-top:4px;line-height:1.22}.ops-footer-note{position:absolute;left:.32in;right:.32in;bottom:.14in;border-top:1px solid #d6dce5;padding-top:4px;font-size:7.4px;color:#6a7280;text-align:right;z-index:1}@media(max-width:900px){.ops-page{width:100%;height:auto;min-height:0}.ops-top,.ops-page-head,.ops-board,.ops-distribution-grid,.ops-stats,.ops-command-grid,.ops-resource-hero,.ops-role-strip,.ops-route-list,.ops-focus-list{grid-template-columns:1fr}.ops-timeline{grid-template-columns:1fr 1fr}}@media print{body{background:#fff}.print-tools{display:none}.ops-sheet{padding:0}.ops-page{width:13.333in;height:7.5in;min-height:7.5in;margin:0;border:0;box-shadow:none;break-after:page}.ops-page:last-child{break-after:auto}}`;
}
function buildOpsSummaryHTML(mode,start,end){
  const days=opsDateList(start,end);
  const jobs=opsSummaryJobs(days);
  const setupCount=days.reduce((n,iso)=>n+opsJobsForDay(iso).filter(j=>setupCovers(j,iso)).length,0);
  const eventCount=days.reduce((n,iso)=>n+opsJobsForDay(iso).filter(j=>jobEventCovers(j,iso)).length,0);
  const crewCount=new Set(jobs.flatMap(j=>(j.crew||[]).map(c=>c.techId).filter(Boolean))).size;
  const equipment=opsEquipmentDistribution(jobs);
  const transport=opsTransportRows(days);
  const missingTransport=opsMissingTransport(days,transport);
  const activeDays=days.filter(iso=>opsJobsForDay(iso).length);
  const movementDays=mode==='month'&&activeDays.length?activeDays:days;
  const team=opsTeamAllocations(days);
  const roleDistribution=opsRoleDistribution(team);
  const maxEq=Math.max(1,...equipment.map(e=>e.count));
  const totalEqLines=equipment.reduce((n,e)=>n+e.count,0);
  const jobsWithEquipment=new Set(equipment.flatMap(e=>e.jobs)).size;
  const eqSorted=equipment.slice().sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const topEq=eqSorted[0];
  const topRole=roleDistribution[0];
  const busiest=days.map(iso=>({iso,count:opsJobsForDay(iso).length})).sort((a,b)=>b.count-a.count||a.iso.localeCompare(b.iso))[0];
  const transportTouches=transport.length+missingTransport.length;
  const dispatchPct=transportTouches?Math.round(transport.length/transportTouches*100):0;
  const commandCards=[
   ['Busiest day',busiest&&busiest.count?fmtD(busiest.iso):'No active day',busiest&&busiest.count?busiest.count+' job touch'+(busiest.count===1?'':'es'):'No movement scheduled'],
   ['Equipment pressure',topEq?topEq.name:'No equipment',topEq?topEq.count+' line'+(topEq.count===1?'':'s')+' across '+opsUniqueList(topEq.jobs).length+' job'+(opsUniqueList(topEq.jobs).length===1?'':'s'):'No asset allocation yet'],
   ['Labour load',topRole?topRole.role:'No labour',topRole?topRole.people.size+' people / '+topRole.days+' day line'+(topRole.days===1?'':'s'):'No crew assigned'],
   ['Dispatch readiness',transportTouches?dispatchPct+'% routed':'No dispatch lines',transport.length+' routed / '+missingTransport.length+' gap'+(missingTransport.length===1?'':'s')]
  ].map(c=>`<div class="ops-command-card"><span>${esc(c[0])}</span><b>${esc(c[1])}</b><small>${esc(c[2])}</small></div>`).join('');
  const priorityRank={Urgent:3,High:2,Normal:1};
  const jobDate=j=>setupStart(j)||j.eventFrom||setupEnd(j)||j.eventTo||'';
  const focusJobs=jobs.slice().sort((a,b)=>(priorityRank[b.priority]||0)-(priorityRank[a.priority]||0)||jobDate(a).localeCompare(jobDate(b))||String(a.event||'').localeCompare(String(b.event||''))).slice(0,4);
  const focusCards=focusJobs.map(j=>`<div class="ops-focus-card"><b>${esc(j.no)} / ${esc(j.event)}</b><span>${esc(nameOf('venues',j.venueId)||'Venue not listed')} / ${opsJobPeriodText(j,days).replace(/<br>/g,' / ')}</span><strong>${esc((j.priority&&j.priority!=='Normal'?j.priority+' priority / ':'')+(jobSiteManager(j)||'Lead not listed'))} / ${(j.equipment||[]).length} eq. / ${(j.crew||[]).length} crew</strong></div>`).join('')||'<div class="ops-empty">No priority job focus for this period.</div>';
  const timelineSource=mode==='month'&&activeDays.length?activeDays:days;
  const timelineLimit=mode==='month'?15:14;
  const timelineDays=timelineSource.slice(0,timelineLimit);
  const hiddenTimeline=Math.max(0,timelineSource.length-timelineDays.length);
  const timeline=timelineDays.map(iso=>{const n=opsJobsForDay(iso).length;const d=new Date(iso+'T00:00:00');return `<div class="ops-tick${n?' hot':''}"><b>${WEEKDAYS[d.getDay()].slice(0,3)}</b><span>${d.getDate()}</span><small>${n} job${n===1?'':'s'}</small></div>`;}).join('')+(hiddenTimeline?`<div class="ops-tick hot"><b>More</b><span>+${hiddenTimeline}</span><small>active day${hiddenTimeline===1?'':'s'}</small></div>`:'');
  const jobLimit=mode==='month'?9:8;
  const movementLimit=mode==='month'?7:6;
  const jobRows=jobs.slice(0,jobLimit).map(j=>`<tr><td><b>${esc(j.no)}</b><br>${esc(j.event)}</td><td>${esc(nameOf('clients',j.clientId))}<br><span class="ops-note">${esc(nameOf('venues',j.venueId))}</span></td><td>${opsJobPeriodText(j,days)}</td><td>${esc(jobSiteManager(j)||'-')}<br><span class="ops-note">${esc(jobCardCreator(j)||'-')}</span></td><td>${(j.crew||[]).length}</td><td>${(j.equipment||[]).length}</td><td>${esc(j.status)}</td></tr>`).join('')+(jobs.length>jobLimit?`<tr><td colspan="7"><b>${jobs.length-jobLimit} additional job card${jobs.length-jobLimit===1?'':'s'} included in distribution totals.</b></td></tr>`:'')||'<tr><td colspan="7">No jobs scheduled in this period.</td></tr>';
  const dayRows=movementDays.slice(0,movementLimit).map(iso=>{
   const rows=opsJobsForDay(iso);
   const d=new Date(iso+'T00:00:00');
   const setup=rows.filter(j=>setupCovers(j,iso)).map(j=>j.no+' '+j.event);
   const events=rows.filter(j=>jobEventCovers(j,iso)).map(j=>j.no+' '+j.event);
   const leads=[...new Set(rows.map(jobSiteManager).filter(Boolean))];
   return `<tr><td><b>${WEEKDAYS[d.getDay()].slice(0,3)}</b><br>${fmtD(iso)}</td><td>${esc(setup.join('\n')||'-').replace(/\n/g,'<br>')}</td><td>${esc(events.join('\n')||'-').replace(/\n/g,'<br>')}</td><td>${esc(leads.join(', ')||'-')}</td></tr>`;
  }).join('')+(movementDays.length>movementLimit?`<tr><td colspan="4"><b>${movementDays.length-movementLimit} additional active day${movementDays.length-movementLimit===1?'':'s'} summarized in totals.</b></td></tr>`:'')||'<tr><td colspan="4">No movement scheduled in this period.</td></tr>';
  const roleCards=roleDistribution.slice(0,5).map(r=>`<div class="ops-role"><b>${r.people.size}</b><span>${esc(r.role)} / ${r.days} day line${r.days===1?'':'s'}</span></div>`).join('')||'<div class="ops-empty">No labour roles allocated yet.</div>';
  const teamLimit=mode==='month'?8:6;
  const teamRows=team.sort((a,b)=>b.days.size-a.days.size||b.jobs.size-a.jobs.size||a.name.localeCompare(b.name)).slice(0,teamLimit).map(t=>`<tr><td><b>${esc(t.name)}</b><br><span class="ops-note">${esc(t.role)}</span></td><td>${t.days.size}</td><td>${t.jobs.size}</td><td>${opsBriefList(t.items,3)}</td></tr>`).join('')+(team.length>teamLimit?`<tr><td colspan="4"><b>${team.length-teamLimit} additional crew member${team.length-teamLimit===1?'':'s'} included in totals.</b></td></tr>`:'')||'<tr><td colspan="4">No labour allocation yet.</td></tr>';
  const eqCards=eqSorted.slice(0,4).map((e,i)=>`<div class="ops-resource-card"><span>Equipment priority ${i+1}</span><b>${esc(e.name)}</b><small>${e.count} line${e.count===1?'':'s'} / ${opsUniqueList(e.jobs).length} job${opsUniqueList(e.jobs).length===1?'':'s'}</small><p>${opsBriefList([...e.specs],2)}</p></div>`).join('')||'<div class="ops-empty">No equipment distribution yet.</div>';
  const eqLimit=mode==='month'?10:8;
  const eqRows=eqSorted.slice(0,eqLimit).map(e=>`<tr><td><b>${esc(e.name)}</b><div class="ops-meter"><i style="width:${Math.max(8,Math.round(e.count/maxEq*100))}%"></i></div></td><td>${e.count}</td><td>${opsBriefList([...e.specs],3)}</td><td>${opsBriefList(e.jobs,4)}</td></tr>`).join('')+(equipment.length>eqLimit?`<tr><td colspan="4"><b>${equipment.length-eqLimit} additional equipment type${equipment.length-eqLimit===1?'':'s'} included in totals.</b></td></tr>`:'')||'<tr><td colspan="4">No equipment distribution yet.</td></tr>';
  const routeCards=transport.slice(0,4).map(r=>`<div class="ops-route"><b>${fmtD(r.iso)} / ${esc(r.job.no)}</b><span>${esc(r.job.event)}<br>${esc(nameOf('venues',r.job.venueId))}</span><strong>${esc(r.drivers.join(', ')||'Driver not assigned')} / ${esc(r.vehicles.join('; ')||'Vehicle not listed')}</strong></div>`).join('')||'<div class="ops-empty">No dedicated transport or driver allocation found in this period.</div>';
  const pendingCards=missingTransport.slice(0,2).map(r=>`<div class="ops-route pending"><b>${fmtD(r.iso)} / ${esc(r.job.no)}</b><span>${esc(r.job.event)}<br>${esc(nameOf('venues',r.job.venueId))}</span><strong>Transport detail not listed</strong></div>`).join('');
  const transportLimit=mode==='month'?6:5;
  const transportRows=transport.slice(0,transportLimit).map(r=>`<tr><td>${fmtD(r.iso)}<br><b>${esc(r.job.no)}</b></td><td>${esc(r.job.event)}<br><span class="ops-note">${esc(nameOf('venues',r.job.venueId))}</span></td><td>${esc(r.drivers.join(', ')||'Not assigned')}</td><td>${esc(r.vehicles.join('; ')||'Not listed')}</td></tr>`).join('')+(transport.length>transportLimit?`<tr><td colspan="4"><b>${transport.length-transportLimit} additional dispatch line${transport.length-transportLimit===1?'':'s'} included in totals.</b></td></tr>`:'')||'<tr><td colspan="4">No dedicated transport or driver allocation found in this period.</td></tr>';
  const co=state.company||DEFAULT_COMPANY;
  const label=mode==='month'?'Monthly Operations Summary':mode==='week'?'Weekly Operations Summary':'Daily Operations Summary';
  const range=start===end?fmtD(start):fmtD(start)+' - '+fmtD(end);
  return `<div class="ops-sheet">
  <section class="ops-page"><div class="ops-top">
   <div class="ops-brand"><h1>${esc(label)}</h1><p>${esc(co.name||DEFAULT_COMPANY.name)} / jobs, movement, labour, equipment, and transport command view</p></div>
   <div class="ops-window"><span>16:9 schedule window</span><b>${range}</b><span style="margin-top:8px">Generated ${fmtDT(Date.now())}</span></div>
  </div>
  <div class="ops-stats">
   <div class="ops-stat"><b>${jobs.length}</b><span>Job cards</span></div>
   <div class="ops-stat"><b>${setupCount}</b><span>Setup calls</span></div>
   <div class="ops-stat"><b>${eventCount}</b><span>Event calls</span></div>
   <div class="ops-stat"><b>${crewCount}</b><span>Crew named</span></div>
   <div class="ops-stat"><b>${equipment.length}</b><span>Equipment types</span></div>
   <div class="ops-stat"><b>${transport.length}</b><span>Transport lines</span></div>
   </div>
   <div class="ops-command-grid">${commandCards}</div>
   ${timeline?`<div class="ops-timeline">${timeline}</div>`:''}
   <div class="ops-board"><section class="ops-section"><h2>Executive job matrix</h2><table class="ops-table"><thead><tr><th>Job</th><th>Client / Venue</th><th>Dates</th><th>Lead / Created by</th><th>Crew</th><th>Eq.</th><th>Status</th></tr></thead><tbody>${jobRows}</tbody></table></section><section class="ops-section"><h2>Priority focus</h2><div class="ops-focus-list">${focusCards}</div><h2 style="margin-top:8px">Daily movement board</h2><table class="ops-table"><thead><tr><th>Day</th><th>Setup</th><th>Event</th><th>Lead</th></tr></thead><tbody>${dayRows}</tbody></table></section></div><div class="ops-footer-note">Page 1 / Best summary, jobs, and movement / 16:9</div></section>
 <section class="ops-page"><div class="ops-page-head"><div class="ops-headline"><h1>Equipment Distribution Board</h1><p>Asset load, labour distribution, transport routing, and dispatch gaps on one executive page.</p></div><div class="ops-period"><span>Resource coverage</span><b>${totalEqLines} equipment lines / ${team.length} crew / ${transport.length} dispatch</b><span style="margin-top:8px">${range}</span></div></div><div class="ops-resource-hero">${eqCards}</div><div class="ops-role-strip">${roleCards}</div><div class="ops-distribution-grid"><section class="ops-section"><h2>Equipment allocation matrix</h2><table class="ops-table"><thead><tr><th>Equipment</th><th>Lines</th><th>Specification / Notes</th><th>Assigned jobs</th></tr></thead><tbody>${eqRows}</tbody></table><p class="ops-mini-note">Equipment coverage: ${totalEqLines} listed item line${totalEqLines===1?'':'s'} across ${jobsWithEquipment} job card${jobsWithEquipment===1?'':'s'}.</p></section><section class="ops-section"><h2>Labour distribution</h2><table class="ops-table"><thead><tr><th>Person</th><th>Days</th><th>Jobs</th><th>Assignments</th></tr></thead><tbody>${teamRows}</tbody></table><h2 style="margin-top:8px">Transport and dispatch</h2><div class="ops-route-list">${routeCards}${pendingCards}</div><table class="ops-table" style="margin-top:6px"><thead><tr><th>Date / Job</th><th>Event / Venue</th><th>Driver</th><th>Vehicle / Items</th></tr></thead><tbody>${transportRows}</tbody></table></section></div><div class="ops-footer-note">Page 2 / Equipment, labour, transport, and dispatch / 16:9</div></section>
  </div>`;
}
function downloadOpsSummary(mode){
 const picked=opsBriefDate();
 const start=mode==='month'?monthStartISO(picked):mode==='week'?weekStartISO(picked):picked;
 const end=mode==='month'?monthEndISO(picked):mode==='week'?addDaysISO(start,6):picked;
 const title=companyShort()+(mode==='month'?' Monthly Operations Brief ':mode==='week'?' Weekly Operations Brief ':' Daily Operations Brief ')+(start===end?fmtD(start):fmtD(start)+' - '+fmtD(end));
 const win=window.open('','_blank');
 if(!win){toast('Allow pop-ups to open the operations summary','err');return;}
 win.document.open();
 win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${brandCSS(opsSummaryCSS())}</style></head><body><div class="print-tools"><button onclick="window.print()">Print / Save PDF</button></div>${buildOpsSummaryHTML(mode,start,end)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
 win.document.close();
 win.focus();
}

/* ================= SETTINGS ================= */
function renderSettings(){
 renderCompanyForm();
 const icons={clients:'building',venues:'pin',technicians:'people',roles:'badge',equipment:'box',eventTypes:'tag'};
 const order=['technicians','clients','venues','equipment','roles','eventTypes'];
 let h='';
 for(const kind of order){
  const K=KINDS[kind];
  const items=[...state[kind]].sort((a,b)=>a.name.localeCompare(b.name));
  h+=`<section class="bl-panel open list-card" aria-label="${esc(K.label)}"><div class="bl-panel-head static"><span data-icon="${icons[kind]}"></span>${K.label}<span class="spacer"></span><span class="count">${items.length}</span>
   <button class="btn sm" onclick="openQuickAdd('${kind}')" title="Add ${esc(K.sing)}"><span data-icon="plus"></span>Add</button></div><div class="bl-panel-body flush">${kind==='technicians'?crewDuplicateNoteHTML():''}${items.length>6?`<div class="list-filter input-icon"><span data-icon="search"></span><input type="search" placeholder="Filter" aria-label="Filter ${esc(K.label)}" oninput="filterResourceList(this)"></div>`:''}<div class="list-body ui-list">`+
   (items.map(it=>{
    let meta='';
    if(kind==='clients')meta=[it.contact||'',it.phone||''].filter(Boolean).join(' · ');
    else if(kind==='venues')meta=it.area||'';
    else if(kind==='technicians')meta=[registeredRoles(it.id).length?registeredRolesText(it.id,', '):(it.role?nameOf('roles',it.role):''),labourTypeLabel(it.workerType),it.source||'',it.phone||'',it.rateNote||''].filter(Boolean).join(' · ');
    else if(kind==='equipment'&&stockLib()){const S=stockLib(),c=S.category(it),o=S.owned(it);meta=[c,o!==null?'Owned: '+o:'',S.unitSizeText(S.parseUnitSize(it.unitSize),c),'Job card: '+jobArea(areaOf(it,kind))[1]].filter(Boolean).join(' · ');}
    else if(kind==='roles')meta='Job card: '+jobArea(areaOf(it,kind))[1];
    const used=usageCount(kind,it.id);
    return `<div class="list-row" data-filter="${esc((it.name+' '+meta).toLowerCase())}" title="${esc(meta||it.name)}"><span class="lr-name">${esc(it.name)}</span><span class="lr-dim">${esc(meta)}</span>${used?`<span class="lr-count" title="Referenced ${used} time${used===1?'':'s'}">${used}</span>`:''}
     <span class="row-acts"><button onclick="openQuickAdd('${kind}','${it.id}')" title="Edit ${esc(it.name)}" aria-label="Edit ${esc(it.name)}"><span data-icon="edit"></span></button><button class="del" onclick="removeItem('${kind}','${it.id}')" title="Delete ${esc(it.name)}" aria-label="Delete ${esc(it.name)}"><span data-icon="x"></span></button></span></div>`;
   }).join('')||`<div class="list-row empty-row">No ${esc(K.label.toLowerCase())} yet</div>`)+
  `</div></div></section>`;
 }
 $('listsWrap').innerHTML=h;
 renderCloudSettings();
}
function filterResourceList(input){
 const q=input.value.trim().toLowerCase();
 input.closest('.list-card').querySelectorAll('.list-row').forEach(row=>{row.hidden=!!q&&!row.dataset.filter.includes(q);});
}
function renderCompanyForm(){
 const c=companyProfile(),set=(id,v)=>{const el=$(id);if(el)el.value=v==null?'':v;};
 set('sName',c.name);set('sShort',c.shortName);set('sTag',c.tagline);set('sPhone',c.phone);set('sEmail',c.email);
 set('sWebsite',c.website);set('sAddress',c.address);set('sPrefix',companyJobPrefix());set('sBrand',brandPalette(c.brandColor).brand);
 if($('sShort'))$('sShort').placeholder=deriveShortName(c.name)||'Short name';
 renderZoneSelect();
 if($('sNextNo'))$('sNextNo').textContent='Next new card: '+nextNoPreview()+'. Numbers already issued never change.';
 const kind=companyLogoKind(),prev=$('sLogoPreview');
 if(prev)prev.innerHTML=kind==='bundled'?'<span class="logo-chip"><img src="DVI%20logos%20png/dvi%20logo.png" alt=""></span><span>Bundled logo</span>':kind==='upload'?`<span class="logo-chip fit"><img src="${c.logo}" alt=""></span><span>Uploaded logo</span>`:`<span class="logo-chip mono">${esc(brandInitials())}</span><span>No logo · initials are used</span>`;
 renderBranding();
}
// Saving marks the profile as the company's own, so blank fields stay blank on reload.
function saveCompany(){
 const v=id=>($(id)&&$(id).value||'').trim(),name=v('sName');
 if(!name){toast('Company name is required. The previous name was kept.','err');renderCompanyForm();return;}
 const brand=/^#[0-9a-f]{6}$/i.test(v('sBrand'))?v('sBrand').toLowerCase():brandPalette(companyProfile().brandColor).brand;
 const previous=state.company;
 // The bundled logo belongs to the default company; another company never inherits it.
 const dropLogo=previous.logo==='bundled'&&name!==DEFAULT_COMPANY.name;
 state.company=Object.assign({},previous,{name,shortName:v('sShort').slice(0,16),tagline:v('sTag'),phone:v('sPhone'),email:v('sEmail'),website:v('sWebsite'),address:v('sAddress'),jobPrefix:cleanJobPrefix(v('sPrefix')),brandColor:brand,profile:'custom'},dropLogo?{logo:''}:{});
 // On failure the typed values stay in the form so nothing has to be retyped.
 try{save();}catch(error){state.company=previous;return;}
 renderAll();renderCompanyForm();
 toast(dropLogo?'Company profile saved ✓ The default logo was replaced by initials; upload your own logo below.':'Company profile saved ✓');
}
// Time-zone list: common choices first, then every zone this browser knows, by region.
const COMMON_ZONES=['Africa/Kampala','Africa/Nairobi','Africa/Dar_es_Salaam','Africa/Kigali','Africa/Addis_Ababa','Africa/Lagos','Africa/Accra','Africa/Johannesburg','Africa/Cairo','Europe/London','Europe/Paris','Asia/Dubai','Asia/Kolkata','Asia/Singapore','America/New_York','America/Chicago','America/Los_Angeles','Australia/Sydney','UTC'];
let zoneOptionsHTML='';
function zoneOptionLabel(z){const city=DviScheduling.zoneCity(z),off=DviScheduling.zoneOffsetText(z);return city+' · '+off;}
const LEGACY_ZONES={'Europe/Kiev':'Europe/Kyiv','Asia/Calcutta':'Asia/Kolkata','Asia/Saigon':'Asia/Ho_Chi_Minh','Asia/Katmandu':'Asia/Kathmandu','Asia/Rangoon':'Asia/Yangon','Atlantic/Faeroe':'Atlantic/Faroe','Pacific/Truk':'Pacific/Chuuk','Pacific/Ponape':'Pacific/Pohnpei','Pacific/Enderbury':'Pacific/Kanton','America/Godthab':'America/Nuuk','Asia/Ulan_Bator':'Asia/Ulaanbaatar','Africa/Asmera':'Africa/Asmara','America/Buenos_Aires':'America/Argentina/Buenos_Aires'};
function zoneList(){let all=[];try{if(typeof Intl.supportedValuesOf==='function')all=Intl.supportedValuesOf('timeZone');}catch(_){}return [...new Set(COMMON_ZONES.concat(all).map(z=>LEGACY_ZONES[z]&&DviScheduling.validZone(LEGACY_ZONES[z])?LEGACY_ZONES[z]:z))].filter(z=>DviScheduling.validZone(z));}
function renderZoneSelect(){
 const sel=$('sTimeZone'),z=companyTimeZone();if(!sel)return;
 if(!zoneOptionsHTML){const zones=zoneList(),groups=new Map();for(const id of zones){if(COMMON_ZONES.includes(id))continue;const region=id.includes('/')?id.split('/')[0]:'Other';if(!groups.has(region))groups.set(region,[]);groups.get(region).push(id);}
  zoneOptionsHTML='<optgroup label="Common">'+COMMON_ZONES.filter(id=>DviScheduling.validZone(id)).map(id=>`<option value="${esc(id)}">${esc(zoneOptionLabel(id))}</option>`).join('')+'</optgroup>'+[...groups].map(([region,ids])=>`<optgroup label="${esc(region)}">${ids.map(id=>`<option value="${esc(id)}">${esc(zoneOptionLabel(id))}</option>`).join('')}</optgroup>`).join('');}
 const extra=zoneOptionsHTML.includes('value="'+esc(z)+'"')?'':`<option value="${esc(z)}">${esc(zoneOptionLabel(z))}</option>`;
 sel.innerHTML=extra+zoneOptionsHTML;sel.value=z;
 const apply=$('sZoneApply');if(apply)apply.disabled=true;
 const alertBox=$('sZoneAlert');if(alertBox){if(zoneRefusal){alertBox.hidden=false;alertBox.innerHTML=`Not changed to ${esc(zoneRefusal.zone)}: these job cards have times that do not exist there (the clocks go forward). Edit them first: ${zoneRefusal.jobs.map(j=>`<button type="button" class="link-btn" onclick="openJobModal('${esc(j.id)}')">${esc(j.no)}</button>`).join(', ')}`;}else{alertBox.hidden=true;alertBox.innerHTML='';}}
 if(zoneUnsupported()){const hint=$('sZoneNow');if(hint)hint.textContent=zoneUnsupportedMessage();return;}
 const hint=$('sZoneNow');if(hint){const zl=zoneLabels(),now=DviScheduling.wallNow();hint.textContent=`Now ${now.slice(11)} on ${fmtD(now.slice(0,10))} in ${zl.long}. Recorded times are local times in this zone; changing it never changes them.`;}
}
// A zone change keeps every recorded time exactly as typed and reads it in the new zone.
// It is refused while any time would not exist there (skipped by a clock change), so the
// saved records always stay valid and loadable.
let zoneRefusal=null;
// Choosing a zone only previews it; Apply makes the change (arrow keys never apply one).
function previewCompanyTimeZone(sel){const z=sel&&sel.value,apply=$('sZoneApply');if(apply)apply.disabled=!z||z===companyTimeZone();const hint=$('sZoneNow');if(hint&&DviScheduling.validZone(z)&&z!==companyTimeZone())hint.textContent='Selected '+z+' ('+DviScheduling.zoneOffsetText(z)+' now). Press Apply to use it; recorded times are not changed.';}
function changeCompanyTimeZone(sel){
 const next=sel&&sel.value,prev=zoneUnsupported()?null:companyTimeZone();
 if(!DviScheduling.validZone(next)){toast('That time zone is not recognised by this browser.','err');renderCompanyForm();return;}
 if(next===prev)return;
 const broken=DviScheduling.withTimeZone(next,()=>state.jobs.filter(j=>DviScheduling.validateJob(j).length));
 zoneRefusal=broken.length?{zone:next,jobs:broken.map(j=>({id:j.id,no:j.no||j.event}))}:null;
 if(broken.length){toast(`Not changed: ${broken.length} job card${broken.length===1?' has a time':'s have times'} that ${broken.length===1?'does':'do'} not exist in ${DviScheduling.zoneCity(next)} (clocks skip forward): ${broken.slice(0,3).map(j=>j.no).join(', ')}${broken.length>3?'…':''}. Edit those times first.`,'err');renderCompanyForm();return;}
 const timed=state.jobs.filter(j=>j.setupStartAt||j.eventStartAt||j.finishAt).length;
 const go=()=>{
  const previous=state.company;state.company=Object.assign({},previous,{timeZone:next,profile:'custom'});applyCompanyTimeZone();
  try{save();}catch(error){state.company=previous;applyCompanyTimeZone();renderCompanyForm();return;}
  renderAll();renderCompanyForm();if(typeof refreshKampalaHeader==='function')refreshKampalaHeader();
  toast('Time zone set to '+zoneLabels().long+'. Recorded times were not changed.');
 };
 if(timed){renderCompanyForm();confirmBox(`Use ${next} for this company? ${timed} job card${timed===1?' has':'s have'} recorded times. They stay exactly as typed (08:00 stays 08:00) and are read as ${DviScheduling.zoneCity(next)} time from now on. Today, overlap checks and printed documents follow the new zone.`,go);}
 else go();
}
function chooseCompanyLogo(){const f=$('sLogoFile');if(f){f.value='';f.click();}}
function uploadCompanyLogo(input){
 const file=input&&input.files&&input.files[0];if(!file)return;
 if(!LOGO_TYPES.includes(file.type)){toast('Logo must be a PNG, JPEG or WebP image.','err');input.value='';return;}
 if(file.size>LOGO_MAX_BYTES){toast('Logo is larger than 256 KB. Export a smaller image and try again.','err');input.value='';return;}
 const reader=new FileReader();
 reader.onerror=()=>{toast('The logo file could not be read. Nothing was changed.','err');input.value='';};
 reader.onload=()=>{
  input.value='';const data=String(reader.result||'');
  if(!validLogoData(data)){toast('That file is not a supported image. Nothing was changed.','err');return;}
  const previous=state.company;state.company=Object.assign({},previous,{logo:data,profile:'custom'});
  try{save();}catch(error){state.company=previous;renderCompanyForm();return;}
  renderAll();renderCompanyForm();toast('Logo saved ✓ It is included in backups.');
 };
 reader.readAsDataURL(file);
}
function removeCompanyLogo(){
 const previous=state.company;state.company=Object.assign({},previous,{logo:'',profile:'custom'});
 try{save();}catch(error){state.company=previous;renderCompanyForm();return;}
 renderAll();renderCompanyForm();toast('Logo removed. Initials are used instead.');
}
function resetCompanyProfile(kind){
 const blank=kind==='blank';
 confirmBox(blank?'Clear the company profile so another company can enter its own name, logo, colour and job-number prefix? Job cards, crew and other records are not changed.':'Restore the default company profile ('+DEFAULT_COMPANY.name+', time zone '+DEFAULT_COMPANY.timeZone+')? Job cards and other records are not changed.',()=>{
  // A blank profile keeps the current time zone; restoring the default returns to Kampala.
  const previous=state.company;state.company=Object.assign({},blank?BLANK_COMPANY:DEFAULT_COMPANY,{profile:'custom'},blank?{timeZone:companyTimeZone()}:{});applyCompanyTimeZone();
  try{save();}catch(error){state.company=previous;renderCompanyForm();return;}
  renderAll();renderCompanyForm();toast(blank?'Company profile cleared. Enter the new company details.':'Default company profile restored.');
 });
}
function usageCount(kind,id){
 let n=0;
 for(const j of state.jobs){
  if(kind==='clients'&&j.clientId===id)n++;
  else if(kind==='venues'&&j.venueId===id)n++;
  else if(kind==='eventTypes'&&j.typeId===id)n++;
  else if(kind==='equipment'&&j.equipment.some(e=>e.itemId===id))n++;
  else if(kind==='technicians'&&(j.crew.some(c=>c.techId===id)||j.siteManagerId===id||j.jobCardCreatorId===id))n++;
  else if(kind==='roles'&&j.crew.some(c=>c.roleId===id))n++;
 }
 if(kind==='roles')n+=state.technicians.filter(t=>t.role===id||otherRoleIds(t).includes(id)).length;
 return n;
}
function removeItem(kind,id){
 const it=byId(kind,id);if(!it)return;
 const n=usageCount(kind,id);
 confirmBox('Delete "'+it.name+'"?'+(n?' It is used in '+n+' place(s) — those references will show as "—".':''),()=>{
  state[kind]=state[kind].filter(x=>x.id!==id);
  save();renderAll();toast('Deleted "'+it.name+'"','err');
 });
}

/* ---- Duplicate crew entries ----
   Register entries with the same name are treated as different people: a double-booking
   across them is not detected and each has its own registered role. Merging moves every
   job-card reference to one entry and removes the other. Nothing is merged automatically. */
function crewNameKey(name){return String(name||'').trim().replace(/\s+/g,' ').toLowerCase();}
function crewDuplicateGroups(){
 const groups=new Map();
 for(const t of state.technicians){const k=crewNameKey(t.name);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
 return [...groups.values()].filter(list=>list.length>1).sort((a,b)=>a[0].name.localeCompare(b[0].name));
}
function crewSameName(keep){const key=crewNameKey(keep.name);return state.technicians.filter(t=>t!==keep&&crewNameKey(t.name)===key);}
function crewMergeHistory(j,name,removed,ts){if(!Array.isArray(j.history))j.history=[];j.history.push({ts,text:`Crew register: duplicate entries for ${name} were merged; ${removed} repeated crew line${removed===1?' was':'s were'} removed`});}
// Merges `dropId` into `keepId` in memory (no save, no rendering).
// Returns a summary, or null when there is nothing to merge. `removedByJob` (a Map) collects
// the repeated lines removed per card, so merging several entries writes one history line per card.
function mergeCrewEntries(keepId,dropId,removedByJob){
 const keep=byId('technicians',keepId),drop=byId('technicians',dropId);
 if(!keep||!drop||keep===drop)return null;
 let cards=0,lines=0,removedLines=0,refs=0;const now=Date.now();
 for(const j of state.jobs){
  const crew=Array.isArray(j.crew)?j.crew:[];
  const mine=crew.some(c=>c.techId===dropId),manager=j.siteManagerId===dropId,creator=j.jobCardCreatorId===dropId;
  if(!mine&&!manager&&!creator)continue;
  cards++;
  if(mine){
   // A moved line that would repeat one the kept entry already has on this card (same role) is dropped.
   const roles=new Set(crew.filter(c=>c.techId===keepId).map(c=>c.roleId||'')),next=[];let removed=0;
   for(const c of crew){
    if(c.techId!==dropId){next.push(c);continue;}
    const r=c.roleId||'';
    if(roles.has(r)){removed++;continue;}
    roles.add(r);c.techId=keepId;lines++;next.push(c);
   }
   j.crew=next;
   if(removed){removedLines+=removed;if(removedByJob)removedByJob.set(j,(removedByJob.get(j)||0)+removed);else crewMergeHistory(j,keep.name,removed,now);}
  }
  if(manager){j.siteManagerId=keepId;j.siteManager=keep.name;refs++;}
  if(creator){j.jobCardCreatorId=keepId;j.jobCardCreator=keep.name;refs++;}
 }
 // A phone or rate note only the removed entry had is kept; nothing on the kept entry is
 // overwritten. Its registered role and labour type never change in a merge (that would re-mark
 // old job cards), and a supplier is only taken from an entry of the same labour type.
 for(const k of ['phone','rateNote'])if(!keep[k]&&drop[k])keep[k]=drop[k];
 if(!keep.source&&drop.source&&(keep.workerType||'DVI Staff')===(drop.workerType||'DVI Staff'))keep.source=drop.source;
 state.technicians=state.technicians.filter(t=>t!==drop);
 return {name:keep.name,cards,lines,removedLines,refs};
}
// Merges every other entry with the same name into `keepId` and saves.
// A failed save restores the last saved records (storageFailure) and throws.
function mergeCrewGroup(keepId){
 const keep=byId('technicians',keepId);if(!keep)return null;
 const others=crewSameName(keep);
 if(!others.length)return null;
 const total={name:keep.name,entries:others.length,lines:0,removedLines:0,refs:0},removed=new Map(),now=Date.now();
 for(const o of others){const r=mergeCrewEntries(keepId,o.id,removed);if(r){total.lines+=r.lines;total.removedLines+=r.removedLines;total.refs+=r.refs;}}
 for(const [j,n] of removed)crewMergeHistory(j,keep.name,n,now);
 save();
 return total;
}
// What merging into `keepId` will do, worked out with the same rule as mergeCrewEntries.
function mergeCrewPreview(keepId){
 const keep=byId('technicians',keepId);if(!keep)return null;
 const others=crewSameName(keep);if(!others.length)return null;
 const ids=new Set(others.map(o=>o.id));let moved=0,removed=0,removedCards=0,refs=0;
 for(const j of state.jobs){
  const crew=Array.isArray(j.crew)?j.crew:[],roles=new Set(crew.filter(c=>c.techId===keepId).map(c=>c.roleId||''));let gone=0;
  for(const c of crew){if(!ids.has(c.techId))continue;const r=c.roleId||'';if(roles.has(r))gone++;else{roles.add(r);moved++;}}
  if(gone){removed+=gone;removedCards++;}
  if(ids.has(j.siteManagerId))refs++;
  if(ids.has(j.jobCardCreatorId))refs++;
 }
 const otherRoles=[...new Set(others.flatMap(o=>registeredRoles(o.id)).map(id=>nameOf('roles',id)))];
 return {keep,others,moved,removed,removedCards,refs,registered:registeredRolesText(keepId),otherRoles};
}
function mergeCrewQuestion(p){
 const n=p.others.length,count=(k,one,many)=>k+' '+(k===1?one:many),parts=[`Merge the other ${n===1?'entry':n+' entries'} named "${p.keep.name}" into this one?`];
 parts.push(p.moved?count(p.moved,'job-card line moves','job-card lines move')+' to it.':'No job-card lines move.');
 if(p.removed)parts.push(count(p.removed,'repeated line (same person, same role) is','repeated lines (same person, same role) are')+` removed from ${count(p.removedCards,'job card','job cards')} and noted in ${p.removedCards===1?'its':'their'} history.`);
 if(p.refs)parts.push(count(p.refs,'site manager or created-by reference changes','site manager or created-by references change')+' to this entry.');
 parts.push(`The other ${n===1?'entry is':'entries are'} removed.`);
 const lost=p.otherRoles.filter(r=>!registeredRoles(p.keep.id).some(id=>nameOf('roles',id)===r));
 parts.push((p.registered?`This entry stays registered as ${p.registered}.`:'This entry has no registered role.')+(lost.length?` The other ${n===1?'entry’s':'entries’'} registration (${lost.join(', ')}) is not carried over; add it in the register afterwards if it applies.`:''));
 parts.push('This cannot be undone except by restoring a backup.');
 return parts.join(' ');
}
function crewEntrySummary(t){
 const roles=new Map();let cards=0;
 for(const j of state.jobs){
  let on=false;
  for(const c of j.crew||[])if(c.techId===t.id){on=true;const r=c.roleId?nameOf('roles',c.roleId):'no role';roles.set(r,(roles.get(r)||0)+1);}
  if(on||j.siteManagerId===t.id||j.jobCardCreatorId===t.id)cards++;
 }
 return {cards,roles:[...roles].map(([r,n])=>r+' ×'+n).join(', '),registered:registeredRolesText(t.id,', ')};
}
function crewDuplicateNoteHTML(){
 const n=crewDuplicateGroups().length;if(!n)return '';
 return `<div class="dup-note" role="note">${statusSymbol('caution','Caution')}<span>${n} name${n===1?' appears':'s appear'} more than once</span><span class="spacer"></span><button type="button" class="btn sm" onclick="openCrewDuplicates()">Review…</button></div>`;
}
function crewDuplicatesHTML(){
 const groups=crewDuplicateGroups();
 if(!groups.length)return '<p>No crew names appear more than once.</p>';
 return `<p class="prop-hint">Entries with the same name are treated as different people: a double-booking across them is not detected, and each has its own registered role. If they are one person, choose the entry to keep. The other entry’s job-card lines move to it and the other entry is removed. A line that would repeat the same role on the same card is removed and noted in that card’s history. The kept entry’s registered role does not change. Export a backup first if you are unsure.</p>`+
  groups.map(list=>`<section class="dup-group" aria-label="${esc(list[0].name)}"><h3>${esc(list[0].name)}</h3>${list.map(t=>{
   const s=crewEntrySummary(t),meta=[labourTypeLabel(t.workerType),t.source||'',t.phone||'',t.rateNote?'rate: '+t.rateNote:''].filter(Boolean).join(' · '),did='dupd_'+esc(t.id);
   return `<div class="dup-entry"><div id="${did}"><b>${s.registered?'Registered: '+esc(s.registered):'No registered role'}</b><small>${esc(meta)}${meta?' · ':''}${s.cards?`on ${s.cards} job card${s.cards===1?'':'s'}${s.roles?' ('+esc(s.roles)+')':''}`:'not on any job card'}</small></div><button type="button" class="btn sm" aria-label="Keep this entry: ${s.registered?'registered '+esc(s.registered):'no registered role'}, ${esc(t.name)}" aria-describedby="${did}" onclick="askMergeCrew('${esc(t.id)}')">Keep this entry</button></div>`;
  }).join('')}</section>`).join('');
}
function openCrewDuplicates(){if(typeof openInfo==='function')openInfo('Crew names that appear more than once',crewDuplicatesHTML());}
function askMergeCrew(keepId){
 // One question at a time: a second press must never swap the pending merge for another person's.
 if(confirmIsOpen())return;
 const p=mergeCrewPreview(keepId);if(!p)return;
 confirmBox(mergeCrewQuestion(p),()=>{
  let r;try{r=mergeCrewGroup(keepId);}catch(error){renderAll();return;}
  if(!r)return;
  renderAll();
  toast(`Merged ${r.name}: ${r.lines} job-card line${r.lines===1?'':'s'} moved`+(r.removedLines?`, ${r.removedLines} repeated line${r.removedLines===1?'':'s'} removed`:''));
  const info=$('infoModal');
  if(info&&info.classList&&typeof info.classList.contains==='function'&&info.classList.contains('open')){
   openCrewDuplicates();
   // The button that opened the list was re-rendered; closing the list returns focus to its replacement.
   if(typeof modalFocus!=='undefined'&&typeof document.querySelector==='function')modalFocus.set(info,document.querySelector('.dup-note button')||document.querySelector('#listsWrap button'));
  }
 });
}

/* ================= DATA ================= */
function exportJSON(){
 const exportedAt=new Date().toISOString();
 const backup={app:'DVI Job Card System',backupVersion:2,environment:'isolated-development',timezone:DviScheduling.TIME_ZONE,exportedAt,state};
 dl(companyFileSlug()+'-backup-'+exportedAt.replace(/[:.]/g,'-')+'.json',JSON.stringify(backup,null,2),'application/json');
 toast('Timestamped local backup downloaded ✓');
}
function normalizeImportedState(raw){return DviScheduling.normalizeBackup(raw,{lenient:true,knownZone:true});}
function importJSON(inp){
 const f=inp.files[0];if(!f)return;
 if(f.size>10*1024*1024){toast('Backup is too large (10 MB maximum)','err');inp.value='';return;}
 const r=new FileReader();
 r.onload=()=>{
  try{
   const raw=JSON.parse(r.result);
   const d=normalizeImportedState(raw);
   if(!d||!Array.isArray(d.jobs))throw 0;
   const label='validated local backup';
   confirmBox('Replace ALL current data with this '+label+' ('+d.jobs.length+' job cards)?',()=>{state=ensureStateShape(d);syncCompanyBranding();save();renderAll();toast('Backup restored ✓');});
  }catch(e){toast('Invalid backup: '+(e.message||'unrecognised file'),'err');}
  inp.value='';
 };
 r.onerror=()=>{toast('Could not read backup file','err');inp.value='';};
 r.readAsText(f);
}
function exportCSV(){
 const head=['Job No','Event','Type','Client','Venue','The Site Manager','Job Card Created by','Setup From','Setup To','Event From','Event To','Status','Priority','Equipment','Crew','Notes'];
 const q=s=>{const text=String(s==null?'':s);const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';};
 const rows=state.jobs.map(j=>[
  j.no,j.event,j.typeId?nameOf('eventTypes',j.typeId):'',j.clientId?nameOf('clients',j.clientId):'',j.venueId?nameOf('venues',j.venueId):'',
  jobSiteManager(j),jobCardCreator(j),setupStart(j)||'',setupEnd(j)||'',j.eventFrom||'',j.eventTo||'',j.status,j.priority||'',
  j.equipment.map(e=>(e.spec?e.spec+' ':'')+e.name).join('; '),
  j.crew.map(c=>crewDisplayName(c.techId)+(c.roleId?' ['+nameOf('roles',c.roleId)+']':'')).join('; '),
  j.notes||''
 ].map(q).join(','));
 dl(companyFileSlug()+'-jobcards-'+todayISO()+'.csv','﻿'+[head.map(q).join(',')].concat(rows).join('\r\n'),'text/csv');
 toast('CSV exported ✓');
}
function clearAll(){
 confirmBox('⚠ Delete ALL data — job cards, clients, venues, technicians, everything? A company profile saved in Resources is kept. Consider exporting a backup first.',()=>{
  const keep=state&&state.company&&!isLegacyDefaultCompany(state.company)?Object.assign({},state.company):null;
  seed(keep);
  renderAll();toast('All data cleared — fresh start','err');
 });
}

/* ================= NOTIFICATIONS ================= */
function notifList(){
 const t=todayISO();const list=[];
 for(const j of state.jobs){
  if(!ACTIVE.includes(j.status))continue;
  if(setupCovers(j,t))list.push({icon:'setup',label:'SETUP',text:'Setup today — '+j.event,id:j.id});
  const f=j.eventFrom,to=j.eventTo||j.eventFrom;
  if(f&&f<=t&&t<=to)list.push({icon:'event',label:'LIVE',text:'Event live today — '+j.event,id:j.id});
  else if(f&&to<t)list.push({icon:'warn',label:'OPEN',text:'Past event still open — '+j.event+' ('+j.status+')',id:j.id});
 }
 // Confirmed cards that cannot take all their equipment from the store on some day still to come.
 const S=stockLib();
 if(S){
  const idx=S.index(state.jobs,stockItem);
  for(const j of state.jobs){
   if(!S.HOLDS.includes(j.status))continue;
   const d=S.days(j);if(!d||d[1]<t)continue;
   for(const x of S.shortList(j,idx,stockItem))list.push({icon:'stock',label:'STOCK',text:'Short on stock — '+j.event+': '+nameOf('equipment',x.id)+' short '+(-x.spare)+' on '+fmtDayShort(x.iso),id:j.id});
  }
 }
 return list;
}
function updateBell(){
 const n=notifList();const b=$('bellBadge');
 b.style.display=n.length?'flex':'none';b.textContent=n.length>9999?'10K':n.length;
 // Astro monitoring icon: the badge takes the highest severity among today's items.
 const sev={setup:'standby',event:'normal',warn:'caution',stock:'serious'};
 const top=n.some(x=>x.icon==='stock')?'serious':n.some(x=>x.icon==='warn')?'caution':n.some(x=>x.icon==='event')?'normal':n.length?'standby':'off';
 const btn=$('bellBtn');if(btn){if(btn.dataset)btn.dataset.status=top;btn.title=n.length?n.length+' alert'+(n.length===1?'':'s')+' today · highest: '+top:'No alerts today';}
 $('notifPanel').innerHTML='<div class="np-head">Today · '+esc(zoneLabels().city)+'<small>'+n.length+'</small></div>'+
  (n.length?n.map(x=>`<div class="np-item" onclick="openView('${x.id}')">${statusSymbol(sev[x.icon]||'off',x.label)}<span>${esc(x.text)}</span></div>`).join('')
  :'<div class="np-empty">No setups, live events or overdue open jobs today.</div>');
}
function toggleNotif(e){e.stopPropagation();$('notifPanel').classList.toggle('open');}


/* Timed scheduling is advisory and entirely browser-local. */
// Printed summary: when a job's times fall either side of a clock change, each time
// carries its own abbreviation (never the case in Kampala).
function printTimedSummary(j){
 const stamps=['setupStartAt','eventStartAt','finishAt'].map(k=>j[k]?DviScheduling.timestamp(j[k]):null).filter(t=>t!==null);
 if(new Set(stamps.map(t=>DviScheduling.zoneOffset(DviScheduling.TIME_ZONE,t))).size<2)return timedSummary(j);
 const at=k=>j[k]?j[k].replace('T',' ')+(DviScheduling.timestamp(j[k])!==null?' '+zoneLabels(DviScheduling.timestamp(j[k])).abbr:''):'time missing';
 return 'Setup: '+at('setupStartAt')+' · Event: '+at('eventStartAt')+' · Finish: '+at('finishAt');
}
function timedSummary(j){
 return 'Setup: '+(j.setupStartAt?j.setupStartAt.replace('T',' '):'time missing')+' · Event: '+(j.eventStartAt?j.eventStartAt.replace('T',' '):'time missing')+' · Finish: '+(j.finishAt?j.finishAt.replace('T',' '):'time missing');
}
function scheduleMessages(j){
 const messages=DviScheduling.warnings(j);
 for(const conflict of DviScheduling.conflicts(j,state.jobs,state.technicians))
  messages.push('Crew overlap with '+(conflict.job.no||conflict.job.event)+': '+conflict.crew.join(', ')+'.');
 return messages;
}
function editorScheduleJob(){
 const job={id:editingJobId,status:$('f_status').value,siteManagerId:$('f_site_manager').value,crew:[...document.querySelectorAll('#crewRows .cr-tech')].map(el=>({techId:el.value})).filter(c=>c.techId)};
 for(const key of ['setupStartAt','eventStartAt','finishAt'])job[key]=$('f_'+key).value;
 Object.assign(job,{setupFrom:$('f_setup_from').value,setupTo:$('f_setup_to').value,eventFrom:$('f_from').value,eventTo:$('f_to').value});
 return job;
}
function renderEditorScheduleWarnings(){
 const messages=scheduleMessages(editorScheduleJob());
 $('editorScheduleWarnings').innerHTML=checksHTML(messages,'No timed crew overlaps found in this browser. Travel time is not included.');
 // Stock hints follow every change in the editor too: dates, status, quantities, items and hires.
 refreshStockHints();
}
function renderScheduleWarnings(){
 const jobs=state.jobs.filter(j=>j.status!=='Cancelled'),lines=[],pairs=new Set(),idx=overlapIndex();
 let overlaps=0;
 for(const j of jobs){
  for(const c of jobOverlaps(j,idx)){
   const key=[j.id,c.job.id].sort().join('|');if(pairs.has(key))continue;pairs.add(key);overlaps++;
   lines.push(`<button class="chk" data-kind="overlap" onclick="openView('${j.id}')" title="${esc(c.crew.join(', '))} booked on both during overlapping ${esc(zoneLabels().city)} times">${statusSymbol('critical','Overlap')}<p><b>${esc(j.no)} ↔ ${esc(c.job.no)}</b> ${esc(c.crew.join(', '))}</p></button>`);
  }
 }
 for(const j of jobs){
  const warnings=DviScheduling.warnings(j);
  if(warnings.length){const times=warnings.some(w=>/^Missing/.test(w));lines.push(`<button class="chk" data-kind="${times?'times':'check'}" onclick="openJobModal('${j.id}')" title="${esc(warnings.join(' '))}">${statusSymbol(times?'caution':'serious',times?'Times missing':'Check')}<p><b>${esc(j.no||'')}</b> ${esc(j.event)} <span class="muted">· ${times?'times missing':'check dates'}</span></p></button>`);}
 }
 const issues=lines.length;
 $('scheduleWarnings').innerHTML=`<div class="chk-summary">${statusSymbol(overlaps?'critical':issues?'caution':'normal',overlaps?'Critical':issues?'Caution':'Normal')}<span>${overlaps} overlap${overlaps===1?'':'s'} · ${issues-overlaps} timing gap${issues-overlaps===1?'':'s'}</span><span class="muted">${jobs.length} checked</span></div>${lines.join('')}<p class="prop-hint pad">${esc(zoneLabels().short)}. This browser only; cancelled jobs excluded; adjacent bookings do not overlap; travel time and shifts are not modelled.</p>`;
}

/* ================= INIT ================= */
function renderAll(){renderScheduleWarnings();renderDashboard();renderJobs();renderSchedule();if(typeof renderStock==='function')renderStock();renderSettings();updateBell();if($('jobModal')&&$('jobModal').classList.contains('open'))refreshStockHints();}
function init(){
 loadCloudConfig();
 load();
 $('jobModal').addEventListener('input',renderEditorScheduleWarnings);
 $('jobModal').addEventListener('change',renderEditorScheduleWarnings);
 $('jobModal').addEventListener('click',()=>setTimeout(renderEditorScheduleWarnings,0));
 $('topTitle').textContent=TITLES.dashboard;
 const now=new Date();
 $('topDate').textContent=WEEKDAYS[now.getDay()]+', '+fmtDateObj(now);
 $('jStatus').innerHTML='<option value="">All statuses</option>'+STATUSES.map(s=>`<option>${s}</option>`).join('');
  const n=todayISO().split('-').map(Number);calY=n[0];calM=n[1]-1;
  renderAll();
  configureCloudLiveSync();
  if(cloudLiveEnabled())setTimeout(()=>cloudPull({auto:true}),900);
 const notifs=notifList();
 if(notifs.length)setTimeout(()=>toast(notifs.length+' item'+(notifs.length===1?'':'s')+' need attention today'),700);
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(typeof toggleNavigation==='function')toggleNavigation(false);document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'));$('notifPanel').classList.remove('open');}
 });
	 document.addEventListener('click',e=>{if(!e.target.closest('#bellWrap'))$('notifPanel').classList.remove('open');});
	 window.addEventListener('focus',cloudFocusSync);
	 document.addEventListener('visibilitychange',()=>{if(!document.hidden)cloudFocusSync();});
	 $('qmFields').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();saveQuick();}});
	}
init();
