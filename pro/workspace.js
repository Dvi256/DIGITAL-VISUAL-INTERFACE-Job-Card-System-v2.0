/* DVI editor workspace. Original UI implementation; no Blender code is used.
   Reads the existing local data model. It never writes or replaces storage. */
let workbenchSelection=null;
function inspectWorkbenchJob(id){workbenchSelection=id;renderWorkbench();}
function workbenchProperty(label,value){return '<div class="wb-property"><span>'+esc(label)+'</span><b>'+esc(value||'Not set')+'</b></div>';}
function renderWorkbench(){
 const host=$('workspaceInspector');if(!host||!state)return;
 const jobs=[...state.jobs].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
 const selected=jobs.find(j=>j.id===workbenchSelection);if(!selected)workbenchSelection=null;
 $('wbJobCount').textContent=jobs.length;
 $('wbOutliner').innerHTML=jobs.length?jobs.slice(0,30).map(j=>`<button class="wb-object${j.id===workbenchSelection?' selected':''}" onclick="inspectWorkbenchJob('${j.id}')" aria-pressed="${j.id===workbenchSelection}" title="${esc(j.no+' · '+j.event)}"><span class="wb-object-dot" style="color:${(SMETA[j.status]||SMETA.Draft)[0]}" title="${esc(j.status||'Draft')}"></span><span>${esc(j.event)}<span class="sr-only">, ${esc(j.status||'Draft')}</span></span><small>${esc(j.no.split('-').at(-1))}</small></button>`).join('')+(jobs.length>30?'<button class="wb-object" onclick="showJobs()">View all '+jobs.length+' job cards →</button>':''):'<div class="wb-outliner-empty">No job cards in this collection.</div><button class="wb-object wb-create" onclick="openJobModal()">+ Create job card</button>';
 // With no job selected the properties fold away and the Outliner takes the room (views.css).
 {const insp=$('workspaceInspector');if(insp&&insp.dataset)insp.dataset.props=selected?'job':'idle';}
 $('wbPropertiesTitle').textContent=selected?'Job properties':'Workspace properties';
 $('wbProperties').innerHTML=selected?`<div class="wb-selected"><span>${esc(selected.no)}</span><b>${esc(selected.event)}</b>${statusPill(selected.status)}</div><details open><summary>Production</summary><div class="wb-property-group">${workbenchProperty('Client',nameOf('clients',selected.clientId))}${workbenchProperty('Venue',nameOf('venues',selected.venueId))}${workbenchProperty('Priority',selected.priority||'Normal')}${workbenchProperty('Site manager',jobSiteManager(selected))}${workbenchProperty('Crew',selected.crew.length+' assigned')}</div></details><details open><summary>Timing · ${esc(typeof zoneLabels==='function'?zoneLabels().abbr:'EAT')}</summary><div class="wb-property-group">${workbenchProperty('Setup',selected.setupStartAt?selected.setupStartAt.replace('T',' '):setupStart(selected))}${workbenchProperty('Event',selected.eventStartAt?selected.eventStartAt.replace('T',' '):selected.eventFrom)}${workbenchProperty('Finish',selected.finishAt?selected.finishAt.replace('T',' '):selected.eventTo)}</div></details><div class="wb-property-actions"><button onclick="openJobModal('${selected.id}')">Edit brief</button><button onclick="openView('${selected.id}')">Full job card</button></div>`:`<details><summary>Workspace</summary><div class="wb-property-group">${workbenchProperty('Company',typeof companyShort==='function'?companyShort():'—')}${workbenchProperty('Time zone',typeof zoneLabels==='function'?zoneLabels().city+' · '+zoneLabels().off:'Kampala · UTC+03')}${workbenchProperty('Storage','Browser + DVI Cloud')}${workbenchProperty('Access','DVI team')}</div></details><details><summary>Production</summary><div class="wb-property-group">${workbenchProperty('Job cards',String(jobs.length))}${workbenchProperty('Active',String(activeJobs().length))}${workbenchProperty('Events today',String(activeJobs().filter(j=>jobLiveOn(j,todayISO())).length))}${workbenchProperty('Setups today',String(activeJobs().filter(j=>setupCovers(j,todayISO())).length))}</div></details><details><summary>Resources</summary><div class="wb-property-group">${workbenchProperty('Clients',String(state.clients.length))}${workbenchProperty('Venues',String(state.venues.length))}${workbenchProperty('Crew',String(state.technicians.length))}${workbenchProperty('Equipment',String(state.equipment.length))}</div></details><p class="wb-property-note">Select a job in the collection to inspect its properties.</p><div class="wb-property-actions"><button onclick="switchView('settings')">Manage resources</button></div>`;
 $('wbFooterCount').textContent=jobs.length+' job card'+(jobs.length===1?'':'s');
}
const beforeWorkbenchRenderAll=renderAll;
renderAll=function(){beforeWorkbenchRenderAll();renderWorkbench();};
const beforeWorkbenchView=openView;
openView=function(id){workbenchSelection=id;renderWorkbench();beforeWorkbenchView(id);};
const beforeWorkbenchSwitch=switchView;
switchView=function(v){beforeWorkbenchSwitch(v);renderWorkbench();};
// A real resizable editor separator, also operable by keyboard.
const workbenchDivider=$('workspaceDivider');
function setInspectorWidth(width){const value=Math.max(225,Math.min(420,width));document.documentElement.style.setProperty('--inspector-width',value+'px');workbenchDivider.setAttribute('aria-valuenow',String(Math.round(value)));}
workbenchDivider.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setInspectorWidth($('workspaceInspector').getBoundingClientRect().width+(e.key==='ArrowLeft'?10:-10));}});
workbenchDivider.addEventListener('pointerdown',e=>{if(e.button!==0)return;workbenchDivider.setPointerCapture(e.pointerId);workbenchDivider.classList.add('dragging');});
workbenchDivider.addEventListener('pointermove',e=>{if(workbenchDivider.hasPointerCapture(e.pointerId))setInspectorWidth((document.documentElement&&document.documentElement.clientWidth||innerWidth)-e.clientX);});
workbenchDivider.addEventListener('pointerup',e=>{if(workbenchDivider.hasPointerCapture(e.pointerId))workbenchDivider.releasePointerCapture(e.pointerId);workbenchDivider.classList.remove('dragging');});
for(const button of document.querySelectorAll('#sidebar button')){const label=button.classList.contains('workspace-search')?'Search workspace':[...button.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();if(label){button.title=label;button.setAttribute('aria-label',label);}}
renderWorkbench();
workbenchDivider.addEventListener('pointercancel',()=>workbenchDivider.classList.remove('dragging'));
workbenchDivider.addEventListener('lostpointercapture',()=>workbenchDivider.classList.remove('dragging'));
