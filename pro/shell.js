/* Application shell behaviour. Presentation state only: it never reads or writes
   job records, storage or the network. Loaded last, after every view module. */
(function(){
 const wide=()=>window.matchMedia?window.matchMedia('(min-width: 1100px)').matches:window.innerWidth>=1100;
 const focusBtn=document.getElementById('focusWorkspace');
 function syncPanelButton(){
  const visible=wide()?!document.body.classList.contains('workspace-focused'):document.body.classList.contains('inspector-open');
  focusBtn.setAttribute('aria-pressed',String(visible));
  const label=visible?'Hide outliner and properties':'Show outliner and properties';
  focusBtn.setAttribute('aria-label',label);focusBtn.title=label;
 }
 window.toggleInspector=function(open){
  const on=open===undefined?!document.body.classList.contains('inspector-open'):!!open;
  document.body.classList.toggle('inspector-open',on);syncPanelButton();
 };
 // Desktop: collapse the Blender-style properties area. Narrow screens: slide it over.
 window.toggleWorkspaceFocus=function(){
  if(!wide()){toggleInspector();return;}
  document.body.classList.toggle('workspace-focused');syncPanelButton();
  window.dispatchEvent(new Event('resize'));
 };
 window.addEventListener('resize',()=>{if(wide())document.body.classList.remove('inspector-open');syncPanelButton();});
 // Selecting a job in the outliner on a narrow screen opens its full card instead.
 const beforeShellSwitch=switchView;switchView=function(v){beforeShellSwitch(v);if(!wide())toggleInspector(false);};

 // Editor: section tracking and an honest unsaved-changes indicator.
 const scroller=document.querySelector('#jobModal .editor-scroll'),links=[...document.querySelectorAll('#jobModal .editor-steps a')];
 links.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const target=document.querySelector(a.getAttribute('href'));if(target)target.scrollIntoView({block:'start',behavior:'smooth'});}));
 function spy(){let current=links[0];for(const a of links){const s=document.querySelector(a.getAttribute('href'));if(s&&s.offsetTop-scroller.offsetTop<=scroller.scrollTop+40)current=a;}links.forEach(a=>a.classList.toggle('active',a===current));}
 if(scroller)scroller.addEventListener('scroll',spy,{passive:true});
 const dirty=document.getElementById('editorDirty'),modal=document.getElementById('jobModal');
 const markDirty=()=>{if(dirty)dirty.hidden=editorSnapshot()===editorBaseline;};
 modal.addEventListener('input',markDirty);modal.addEventListener('change',markDirty);modal.addEventListener('click',()=>setTimeout(markDirty,0));
 new MutationObserver(()=>{if(modal.classList.contains('open')){if(scroller)scroller.scrollTop=0;spy();}}).observe(modal,{attributes:true,attributeFilter:['class']});

 // Global shortcuts (ignored while typing or when a dialog is open).
 document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||document.querySelector('.modal.open'))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(e.key==='n'||e.key==='N'){e.preventDefault();openJobModal();}
 });
 // Blender panels collapse from their header; the 3D sidebar switches pages with vertical tabs.
 document.addEventListener('click',e=>{
  const head=e.target.closest('button.bl-panel-head');
  if(head&&!e.target.closest('.btn,input,select,a')){const p=head.closest('.bl-panel');if(p){const open=p.classList.toggle('open');head.setAttribute('aria-expanded',String(open));}return;}
  const tab=e.target.closest('[data-npanel-tab]');
  if(tab){const name=tab.dataset.npanelTab,bar=tab.closest('.npanel');bar.querySelectorAll('[data-npanel-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)));bar.querySelectorAll('[data-npanel]').forEach(p=>{p.hidden=p.dataset.npanel!==name;});}
 });

 // Preferences window (Blender layout, Opera GX-style accent swatches). Appearance only.
 let prefsSection='interface';
 window.openPrefs=function(section){if(section)prefsSection=section;renderPrefs();document.getElementById('prefsModal').classList.add('open');};
 window.closePrefs=function(){document.getElementById('prefsModal').classList.remove('open');};
 window.prefsGo=function(section){prefsSection=section;renderPrefs();};
 function renderPrefs(){
  const P=window.dviPrefs,theme=document.documentElement.dataset.theme==='light'?'light':'dark',acc=P.accent;
  document.querySelectorAll('#prefsNav [data-section]').forEach(b=>{b.classList.toggle('active',b.dataset.section===prefsSection);b.setAttribute('aria-current',String(b.dataset.section===prefsSection));});
  const row=(label,control,hint)=>`<div class="prop-row"><span class="prop-label">${label}</span><div class="prop-value">${control}${hint?`<small class="prop-hint">${hint}</small>`:''}</div></div>`;
  const body={
   interface:`<section class="bl-panel open"><header class="bl-panel-head"><span class="bl-tri"></span>Display</header><div class="bl-panel-body">
    ${row('Resolution Scale',`<div class="segmented">${P.scales.map(s=>`<button type="button" data-pref-scale="${s}" data-focus="scale-${s}" aria-pressed="${s===P.scale}" onclick="setUiScale(${s});renderPrefsSoon()">${s.toFixed(2).replace(/0$/,'')}</button>`).join('')}</div>`,'Scales text and controls, like Blender’s Resolution Scale.')}
    ${row('Theme',`<div class="segmented"><button type="button" data-focus="theme-dark" aria-pressed="${theme==='dark'}" onclick="setWorkspaceTheme('dark');renderPrefsSoon()">Dark</button><button type="button" data-focus="theme-light" aria-pressed="${theme==='light'}" onclick="setWorkspaceTheme('light');renderPrefsSoon()">Light</button></div>`)}
    ${row('Surface',`<div class="segmented"><button type="button" data-focus="surface-blender" aria-pressed="${P.surface==='blender'}" onclick="setSurface('blender');renderPrefsSoon()">Neutral</button><button type="button" data-focus="surface-gx" aria-pressed="${P.surface==='gx'}" onclick="setSurface('gx');renderPrefsSoon()">GX Tint</button></div>`,theme==='light'?'The tint applies to the dark theme.':'Neutral greys like Blender, or Opera GX-style violet-tinted greys.')}
    ${row('Overview charts',`<div class="segmented" role="group" aria-label="Overview chart style">${['classic','pro'].map(s=>`<button type="button" data-chart-style-set="${s}" data-focus="chartstyle-${s}" aria-pressed="${(P.chartStyle||'classic')===s}" onclick="setChartStyle('${s}');renderPrefsSoon()">${s==='pro'?'Pro':'Classic'}</button>`).join('')}</div>`,'Classic is light and simple; Pro adds headline figures compared with the previous period, week subtotals and load by client.')}
    ${row('Outliner & Properties',`<label class="check"><input type="checkbox" data-focus="outliner" ${document.body.classList.contains('workspace-focused')?'':'checked'} onchange="toggleWorkspaceFocus()"> Show on wide screens</label>`)}
   </div></section>`,
   accent:`<section class="bl-panel open"><header class="bl-panel-head"><span class="bl-tri"></span>Accent colour</header><div class="bl-panel-body">
    <div class="swatches" role="group" aria-label="Accent colour presets">${[{id:'company',name:'Company',hex:P.companyHex}].concat(P.presets).map(p=>`<button type="button" class="swatch" data-pref-accent="${p.id}" data-focus="accent-${p.id}" aria-pressed="${acc.id===p.id}" style="--sw:${p.hex}" onclick="setAccent('${p.id}');renderPrefsSoon()"><i></i><span>${p.name}</span></button>`).join('')}</div>
    ${row('Custom hue',`<input type="range" min="0" max="359" step="1" value="${acc.id==='custom'?hueOf(acc.hex):0}" aria-label="Custom accent hue" data-focus="hue" oninput="setAccent('custom:'+dviPrefs.hueHex(this.value))" class="hue-slider">`,'Drag for any hue, as in Opera GX’s colour picker.')}
    <div class="accent-preview" aria-hidden="true"><button class="btn primary" tabindex="-1">Primary action</button><span class="seg-demo"><span class="on">Selected</span><span>Option</span></span><span class="slider-demo"><i style="width:62%"></i><b>62%</b></span><span class="sel-demo">Selected row</span></div>
   </div></section>`,
   company:(()=>{const c=(typeof state!=='undefined'&&state&&state.company)||{},kind=typeof companyLogoKind==='function'?companyLogoKind():'none';return `<section class="bl-panel open"><header class="bl-panel-head"><span class="bl-tri"></span>Company Profile</header><div class="bl-panel-body">
    ${row('Company',`<b>${esc(c.name||'—')}</b>`)}
    ${row('Short name',`<b>${esc(typeof companyShort==='function'?companyShort():'')}</b>`)}
    ${row('Next job no.',`<b class="mono">${esc(typeof nextNoPreview==='function'?nextNoPreview():'')}</b>`)}
    ${row('Time zone',`<b>${esc(typeof zoneLabels==='function'?zoneLabels().long:'')}</b>`)}
    ${row('Brand colour',`<span class="swatch-inline" style="--sw:${esc(P.companyHex)}"></span><b class="mono">${esc(P.companyHex)}</b>`)}
    ${row('Logo',`<b>${kind==='upload'?'Uploaded':kind==='bundled'?'Bundled':'Initials'}</b>`)}
    ${row('','<button type="button" class="btn sm" onclick="closePrefs();switchView(\'settings\');setTimeout(()=>document.getElementById(\'companySection\').scrollIntoView({block:\'start\'}),0)">Edit in Resources…</button>','The profile is stored with the records, so it travels with backups and applies to every device that imports them.')}
   </div></section>`;})(),
   // G is only present on the Google-connected page; its strings are already escaped.
   data:(()=>{const G=typeof DviGsync!=='undefined'&&DviGsync.summary?DviGsync.summary():null;return `<section class="bl-panel open"><header class="bl-panel-head"><span class="bl-tri"></span>Storage</header><div class="bl-panel-body">
    ${row('Job cards','<b>'+(G?G.where:'This browser and DVI Cloud')+'</b>',G?G.note:'Synced with DVI Cloud, the same as Classic.')}
    ${row('Appearance','<b>This browser only</b>','Theme, accent, scale and chart style are stored separately from job data.')}
    ${row('Backup','<button type="button" class="btn sm" onclick="exportJSON()">Export backup (JSON)</button>')}
    ${row('Google account',G?G.tag:'<span class="status-tag" data-status="off"><i></i>Not connected</span>',G?G.hint:'This is the local version. See docs/GOOGLE_ACCOUNT.md.')}
   </div></section>`;})()
  }[prefsSection];
  // Re-rendering replaces the controls; put keyboard focus back on the one that was used.
  const host=document.getElementById('prefsBody'),active=document.activeElement,key=active&&host.contains(active)&&active.dataset?active.dataset.focus:'';
  host.innerHTML=body||'';
  if(key){const again=host.querySelector('[data-focus="'+key+'"]');if(again)again.focus();}
 }
 window.renderPrefsSoon=()=>setTimeout(renderPrefs,0);
 window.hueOf=function(hex){const n=parseInt(hex.slice(1),16),r=(n>>16)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return Math.round((h*60+360)%360);};
 window.openInfo=function(title,html){document.getElementById('infoTitle').textContent=title;document.getElementById('infoBody').innerHTML=html;document.getElementById('infoModal').classList.add('open');};

 // Compact (icon-only) tabs keep their names as tooltips.
 document.querySelectorAll('.workspace-tab').forEach(b=>{b.title=b.textContent.trim();});

 // Deep links: #jobs, #schedule/week, #dashboard/blocks, #job/<id>, #edit/<id>, #describe, #prefs/<section>. The hash
 // mirrors the current workspace without adding history entries.
 const views=['dashboard','jobs','schedule','dispatch','stock','insights','settings'];
 let applying=false;
 function applyHash(){
  const [head,arg]=decodeURIComponent(location.hash.slice(1)).split('/');
  applying=true;
  try{
   if(views.includes(head)){switchView(head);if(head==='schedule'&&arg&&typeof setCalendarMode==='function')setCalendarMode(arg);if(head==='dashboard'&&(arg==='blocks'||arg==='charts')&&typeof viewportCommand==='function')viewportCommand('mode',arg);}
   else if((head==='job'||head==='edit')&&arg&&state.jobs.some(j=>j.id===arg)){head==='job'?openView(arg):openJobModal(arg);}
   else if(head==='describe')openIntake();
   else if(head==='prefs')openPrefs(['interface','accent','company','data'].includes(arg)?arg:'interface');
  }finally{applying=false;}
 }
 const beforeHashSwitch=switchView;switchView=function(v){beforeHashSwitch(v);if(!applying&&history.replaceState)history.replaceState(null,'',v==='dashboard'?location.pathname+location.search:'#'+v);};
 window.addEventListener('hashchange',applyHash);
 syncPanelButton();
 renderAll();
 if(location.hash)applyHash();
})();
