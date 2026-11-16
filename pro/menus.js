/* Blender-style header menus (File, Edit, View, Help). Each item calls an existing
   app action; menus hold no data and never touch storage or the network. */
(function(){
 const SEP=['-'];
 const MENUS={
  app:[['About DVI Operations',()=>showAbout()],SEP,['Preferences…',()=>openPrefs(),'Ctrl ,','settings']],
  file:[['New Job Card',()=>openJobModal(),'N','plus'],['Describe a Job…',()=>openIntake(),'','text'],SEP,['Import Backup…',()=>document.getElementById('importFile').click(),'','upload'],['Export Backup (JSON)',()=>exportJSON(),'','download'],['Export Jobs (CSV)',()=>exportCSV(),'','list'],SEP,['Operations Brief: Day',()=>downloadOpsSummary('day'),'','print'],['Operations Brief: Week',()=>downloadOpsSummary('week'),'','print'],['Operations Brief: Month',()=>downloadOpsSummary('month'),'','print'],SEP,['Clear All Data…',()=>clearAll(),'','trash']],
  edit:[['Search…',()=>openCommand(),'/','search'],SEP,['Preferences…',()=>openPrefs(),'Ctrl ,','settings']],
  view:[['Toggle Outliner & Properties',()=>toggleWorkspaceFocus(),'','sidebar'],SEP,['Dark Theme',()=>setWorkspaceTheme('dark'),'',''],['Light Theme',()=>setWorkspaceTheme('light'),'',''],SEP,['Overview',()=>switchView('dashboard'),'',''],['Job Cards',()=>switchView('jobs'),'',''],['Schedule',()=>switchView('schedule'),'',''],['Dispatch',()=>switchView('dispatch'),'',''],['Stock',()=>switchView('stock'),'',''],['Insights',()=>switchView('insights'),'',''],['Resources',()=>switchView('settings'),'','']],
  help:[['Keyboard Shortcuts',()=>showShortcuts(),'?',''],['About DVI Operations',()=>showAbout(),'','']],
  vpview:[['Frame All',()=>viewportCommand('frame'),'Home','frame'],['Perspective / Orthographic',()=>viewportCommand('ortho'),'5','ortho'],SEP,['Front',()=>viewportCommand('view','y-'),'1',''],['Right',()=>viewportCommand('view','x'),'3',''],['Top',()=>viewportCommand('view','z'),'7',''],['Reset View',()=>viewportCommand('reset'),'',''],SEP,['7 Days',()=>viewportCommand('range',7),'',''],['14 Days',()=>viewportCommand('range',14),'',''],['21 Days',()=>viewportCommand('range',21),'',''],['42 Days',()=>viewportCommand('range',42),'',''],SEP,['Classic Charts',()=>chartsCommand('style','classic'),'',''],['Pro Charts',()=>chartsCommand('style','pro'),'','']],
  vpselect:[['Next Item',()=>viewportCommand('next'),'N',''],['Deselect',()=>viewportCommand('deselect'),'',''],SEP,['Open Selected',()=>viewportCommand('open'),'Enter','']],
  vpadd:[['Job Card',()=>openJobModal(),'N','plus'],['Job from Description…',()=>openIntake(),'','text']]
 };
 let open=null;
 const pop=document.createElement('div');pop.id='menuPopup';pop.className='menu-popup';pop.setAttribute('role','menu');pop.hidden=true;document.body.appendChild(pop);
 function render(name,btn){
  pop.innerHTML=MENUS[name].map(([label,,key,icon],i)=>label==='-'?'<div class="menu-sep" role="separator"></div>':`<button type="button" role="menuitem" class="menu-item" data-index="${i}">${icon?`<span data-icon="${icon}"></span>`:'<span class="menu-gap"></span>'}<span>${label}</span><kbd>${key||''}</kbd></button>`).join('');
  const r=btn.getBoundingClientRect();pop.style.left=Math.max(4,Math.min((document.documentElement.clientWidth||innerWidth)-pop.offsetWidth-4,r.left))+'px';pop.style.top=r.bottom+2+'px';
 }
 function show(name,btn,focus){
  if(open&&open.btn)open.btn.setAttribute('aria-expanded','false');
  open={name,btn};btn.setAttribute('aria-expanded','true');pop.hidden=false;render(name,btn);render(name,btn);
  if(focus){const first=pop.querySelector('.menu-item');if(first)first.focus();}
 }
 function hide(){if(!open)return;open.btn.setAttribute('aria-expanded','false');open=null;pop.hidden=true;}
 window.closeMenus=hide;
 document.querySelectorAll('[data-menu]').forEach(btn=>{
  btn.setAttribute('aria-haspopup','menu');btn.setAttribute('aria-expanded','false');
  btn.addEventListener('click',e=>{e.stopPropagation();if(open&&open.btn===btn)hide();else show(btn.dataset.menu,btn,e.detail===0);});
  // Like Blender: once a menu is open, hovering another header menu switches to it.
  btn.addEventListener('pointerenter',()=>{if(open&&open.btn!==btn)show(btn.dataset.menu,btn,false);});
  btn.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();show(btn.dataset.menu,btn,true);}});
 });
 pop.addEventListener('click',e=>{const item=e.target.closest('.menu-item');if(!item||!open)return;const run=MENUS[open.name][Number(item.dataset.index)][1];hide();run();});
 pop.addEventListener('keydown',e=>{
  const items=[...pop.querySelectorAll('.menu-item')],i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const b=open&&open.btn;hide();if(b)b.focus();}
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const btns=[...document.querySelectorAll('[data-menu]')].filter(b=>b.offsetParent),j=btns.indexOf(open.btn);const next=btns[(j+(e.key==='ArrowRight'?1:-1)+btns.length)%btns.length];show(next.dataset.menu,next,true);}
  else if(e.key==='Tab')hide();
 });
 document.addEventListener('pointerdown',e=>{if(open&&!pop.contains(e.target)&&!e.target.closest('[data-menu]'))hide();});
 window.addEventListener('resize',hide);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){hide();}},true);
 // Help dialogs reuse the confirm-style info dialog.
 window.showShortcuts=function(){openInfo('Keyboard shortcuts','<table class="kbd-table"><tbody>'+[['/','Search job cards, clients, venues'],['N','New job card'],['Esc','Close the top dialog or menu'],['Ctrl ,','Preferences'],['T / ← / →','Schedule: today, previous, next'],['M W D A','Schedule: month, week, day, agenda'],['Viewport: drag','Orbit (Shift+drag pans, pinch or Ctrl+wheel zooms)'],['Viewport: 1 3 7 / 5','Front, right, top view / perspective ↔ orthographic'],['Viewport: Home','Frame all'],['Chart: ← → Home End','Inspect days; Shift+← → pans'],['Enter','Open the selected day or job']].map(([k,v])=>`<tr><th><kbd>${k}</kbd></th><td>${v}</td></tr>`).join('')+'</tbody></table>');};
 window.showAbout=function(){const co=typeof state!=='undefined'&&state&&state.company?state.company.name:'';openInfo('About DVI Operations','<p><b>'+esc(companyShort())+' Operations — Pro, edition 8.2</b></p>'+(co?'<p>Company profile: '+esc(co)+'. Any company can set its own name, logo, colour and job-number prefix in Resources › Company Profile.</p>':'')+'<p>Records are saved in this browser and synced with DVI Cloud, the same as Classic. AI and calendar sync are not connected. Times use '+esc(DviScheduling.TIME_ZONE)+' ('+esc(zoneLabels().named?zoneLabels().abbr+', '+zoneLabels().off:zoneLabels().off)+'), set in Resources › Company Profile.</p><p>Visual system modelled on the Blender desktop editor, with Opera GX-style accent preferences and Astro UXDS status symbols. No Blender, Opera or Astro code or logos are included.</p>');};
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();openPrefs();}else if(e.key==='?'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('.modal.open')){e.preventDefault();showShortcuts();}});
})();
