/* DVI production viewport: a Blender-style 3D view of recorded work. Each
   non-cancelled job is an object laid along X by its recorded setup and event
   time (company-zone wall clock; date-only phases fill whole days), packed into lanes
   along Y, with height = distinct people assigned. Read-only: it never writes
   records, storage or the network, and draws nothing that is not recorded. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DviViewport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const date=s=>new Date(s+'T12:00:00Z');
function add(s,n){const d=date(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function span(a,b){return Math.round((date(b)-date(a))/864e5);}
// Days from `start` to a civil date or a wall-clock "YYYY-MM-DDTHH:MM" stamp.
function pos(start,stamp){const m=stamp.length>10?(Number(stamp.slice(11,13))*60+Number(stamp.slice(14,16)))/1440:0;return span(start,stamp.slice(0,10))+m;}
// Recorded phases of a job. Exact times are used only when both ends are recorded and ordered.
function phases(j){
 if(!j||j.status==='Cancelled')return [];
 const out=[],sf=j.setupFrom||j.setupDate||j.setupTo,st=j.setupTo||j.setupFrom||j.setupDate,ef=j.eventFrom||j.eventTo,et=j.eventTo||j.eventFrom;
 if(j.setupStartAt&&j.eventStartAt&&j.eventStartAt>j.setupStartAt)out.push({kind:'setup',from:j.setupStartAt,to:j.eventStartAt,timed:true});
 else if(sf)out.push({kind:'setup',from:sf,to:add(st,1),timed:false});
 if(j.eventStartAt&&j.finishAt&&j.finishAt>j.eventStartAt)out.push({kind:'event',from:j.eventStartAt,to:j.finishAt,timed:true});
 else if(ef)out.push({kind:'event',from:ef,to:add(et,1),timed:false});
 return out;
}
// Scene for a window of `days` civil days from `start`; lanes never overlap in time.
function scene(jobs,start,days,peopleOf){
 const objects=[];
 for(const job of jobs||[]){
  const segs=phases(job).map(p=>({kind:p.kind,timed:p.timed,x0:Math.max(0,pos(start,p.from)),x1:Math.min(days,pos(start,p.to))})).filter(s=>s.x1>s.x0);
  if(!segs.length)continue;
  objects.push({job,segs,x0:Math.min(...segs.map(s=>s.x0)),x1:Math.max(...segs.map(s=>s.x1)),people:peopleOf?peopleOf(job).length:0,lane:0});
 }
 objects.sort((a,b)=>a.x0-b.x0||b.x1-a.x1||String(a.job.no||'').localeCompare(String(b.job.no||'')));
 const ends=[];
 for(const o of objects){let lane=ends.findIndex(e=>e<=o.x0+1e-9);if(lane<0)lane=ends.length;ends[lane]=o.x1;o.lane=lane;}
 return {start,days,objects,lanes:Math.max(1,ends.length)};
}
// Orbit camera around `target`: yaw about Z, pitch = elevation above the floor (Blender Z-up).
function basis(cam){const y=cam.yaw*Math.PI/180,p=cam.pitch*Math.PI/180;return {cy:Math.cos(y),sy:Math.sin(y),cp:Math.cos(p),sp:Math.sin(p)};}
function project(pt,cam,w,h,b){
 b=b||basis(cam);
 const x=pt[0]-cam.target[0],y=pt[1]-cam.target[1],z=pt[2]-cam.target[2];
 const x1=x*b.cy-y*b.sy,y1=x*b.sy+y*b.cy;
 const sx=x1,sy=y1*b.sp+z*b.cp,depth=y1*b.cp-z*b.sp+cam.distance;
 const s=cam.ortho?cam.zoom:cam.zoom*cam.distance/Math.max(.05,depth);
 return {x:w/2+sx*s,y:h/2-sy*s,depth};
}
function box(x0,x1,y0,y1,z0,z1){return [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];}
const FACES=[{i:[4,5,6,7],n:[0,0,1],name:'top'},{i:[0,1,5,4],n:[0,-1,0],name:'front'},{i:[1,2,6,5],n:[1,0,0],name:'right'},{i:[2,3,7,6],n:[0,1,0],name:'back'},{i:[3,0,4,7],n:[-1,0,0],name:'left'},{i:[3,2,1,0],n:[0,0,-1],name:'bottom'}];
const LANE=1,DEPTH=.62,UNIT=.34,MIN_H=.18;
// Solid geometry for an object: one box per recorded phase segment.
function solids(o){const y0=o.lane*LANE+(LANE-DEPTH)/2,h=MIN_H+UNIT*Math.min(o.people,12);return o.segs.map(s=>({kind:s.kind,timed:s.timed,pts:box(s.x0,s.x1,y0,y0+DEPTH,0,h),height:h}));}
// Camera-facing faces of every object, far to near (painter's order).
// World-space direction from the target toward the eye.
function eyeDirection(cam){const b=basis(cam);return [-b.cp*b.sy,-b.cp*b.cy,b.sp];}
function faces(sc,cam,w,h){
 const b=basis(cam),dir=eyeDirection(cam),out=[];
 const eye=cam.target.map((t,i)=>t+dir[i]*cam.distance);
 for(const o of sc.objects)for(const s of solids(o)){
  const p=s.pts.map(q=>project(q,cam,w,h,b));
  for(const f of FACES){
   // Back-face culling: orthographic uses the view direction, perspective the eye position.
   const c=f.i.reduce((a,k)=>[a[0]+s.pts[k][0]/4,a[1]+s.pts[k][1]/4,a[2]+s.pts[k][2]/4],[0,0,0]);
   const v=cam.ortho?dir:[eye[0]-c[0],eye[1]-c[1],eye[2]-c[2]];
   if(f.n[0]*v[0]+f.n[1]*v[1]+f.n[2]*v[2]<=1e-6)continue;
   const poly=f.i.map(k=>p[k]);
   out.push({object:o,kind:s.kind,timed:s.timed,face:f.name,normal:f.n,poly,depth:poly.reduce((a,q)=>a+q.depth,0)/4});
  }
 }
 return out.sort((a,b)=>b.depth-a.depth);
}
function inside(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],d=poly[j];if((a.y>pt.y)!==(d.y>pt.y)&&pt.x<(d.x-a.x)*(pt.y-a.y)/(d.y-a.y)+a.x)c=!c;}return c;}
// Nearest object under a screen point (null on empty space).
function hit(sc,cam,w,h,x,y){const f=faces(sc,cam,w,h);for(let i=f.length-1;i>=0;i--)if(inside({x,y},f[i].poly))return f[i].object;return null;}
// Camera that frames the whole scene from a Blender-like three-quarter view.
function frame(sc,w,h,keep){
 const cx=sc.days/2,cy=sc.lanes*LANE/2,size=Math.max(sc.days,sc.lanes*LANE*1.6);
 const cam=Object.assign({yaw:-28,pitch:34,ortho:false},keep||{},{target:[cx,cy,.4],distance:size*1.35});
 cam.zoom=Math.min(w,h*1.6)/(size*1.15);
 return cam;
}
// Blender view-axis presets (numpad 1/3/7 and the gizmo balls): [yaw, pitch].
const VIEWS={'y-':[0,0],'y':[180,0],'x':[-90,0],'x-':[90,0],'z':[0,90],'z-':[0,-89]};
const VIEW_NAMES={'y-':'Front','y':'Back','x':'Right','x-':'Left','z':'Top','z-':'Bottom'};
// Blender's Auto Perspective: a numpad view switches to orthographic and names the view;
// orbiting away clears the name and returns to perspective only if the snap switched it.
// view = {cam, name, auto}; functions return a new view and never mutate their input.
function snapView(view,axis){const v=VIEWS[axis];if(!v)return view;return {cam:Object.assign({},view.cam,{yaw:v[0],pitch:v[1],ortho:true}),name:VIEW_NAMES[axis],auto:!!view.auto||!view.cam.ortho};}
function orbitView(view){if(!view.name&&!view.auto)return view;return {cam:Object.assign({},view.cam,view.auto?{ortho:false}:{}),name:null,auto:false};}
function viewLabel(view){return (view.name||'User')+' '+(view.cam&&view.cam.ortho?'Orthographic':'Perspective');}
return {add,span,pos,phases,scene,project,faces,hit,frame,solids,inside,eyeDirection,snapView,orbitView,viewLabel,VIEWS,VIEW_NAMES,LANE,DEPTH};
});

if(typeof document!=='undefined'){
 const V=DviViewport;
 // mode: 'charts' (3D bar and donut charts, charts3d.js) or 'blocks' (jobs as 3D blocks on a time axis).
 const ui={mode:'charts',days:21,start:null,shading:'solid',show:{setup:true,event:true},selected:null,cam:null,dragging:null,hover:null};
 const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
 const peopleOf=j=>[...DviScheduling.crewKeys(j,state.technicians).keys()];
 let sc=null,canvas=null,ctx=null,raf=0,overlapSet=new Set();
 function view(){return {jobs:state.jobs.filter(j=>j.status!=='Cancelled'),start:ui.start||V.add(todayISO(),-3)};}
 // Jobs with a genuine timed crew overlap, computed once per rebuild (not per frame).
 function overlapIds(){return overlapSet;}
 function build(){const v=view();ui.start=v.start;const idx=DviScheduling.conflictIndex(state.jobs,state.technicians);overlapSet=new Set(v.jobs.filter(j=>(idx.get(j)||[]).length).map(j=>j.id));sc=V.scene(v.jobs,v.start,ui.days,peopleOf);sc.objects=sc.objects.filter(o=>o.segs.some(s=>ui.show[s.kind]));sc.objects.forEach(o=>{o.segs=o.segs.filter(s=>ui.show[s.kind]);});}
 function size(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(200,r.width),h=Math.max(160,r.height);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h};}
 function shade(hex,amount){const m=/^#?([0-9a-f]{6})/i.exec(hex);if(!m)return hex;const n=parseInt(m[1],16);let r=n>>16,g=n>>8&255,b=n&255;const t=amount<0?0:255,p=Math.abs(amount);r=Math.round((t-r)*p+r);g=Math.round((t-g)*p+g);b=Math.round((t-b)*p+b);return `rgb(${r},${g},${b})`;}
 const STATUS={Draft:'--st-draft',Scheduled:'--st-scheduled',Setup:'--st-setup','In Progress':'--st-progress',Completed:'--st-completed'};
 function draw(){
  raf=0;if(!canvas)return;
  // Hidden (another workspace is shown): wait for a real size so the camera frames correctly.
  const shown=canvas.getBoundingClientRect();if(!shown.width||!shown.height)return;
  const {w,h}=size();if(!ui.cam)ui.cam=V.frame(sc,w,h);
  const cam=ui.cam,dark=document.documentElement.dataset.theme!=='light';
  ctx.clearRect(0,0,w,h);
  // Blender viewport background: subtle vertical gradient.
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,css('--vp-bg-hi'));g.addColorStop(1,css('--vp-bg-lo'));ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const P=q=>V.project(q,cam,w,h);
  // Floor grid: one line per day and per lane, every 7th day brighter.
  const L=sc.lanes*V.LANE;
  ctx.lineWidth=1;
  for(let d=0;d<=sc.days;d++){const a=P([d,-.5,0]),b=P([d,L+.5,0]);ctx.strokeStyle=d%7===0?css('--vp-grid-hi'):css('--vp-grid');ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  for(let l=0;l<=sc.lanes;l++){const a=P([0,l*V.LANE-.0,0]),b=P([sc.days,l*V.LANE,0]);ctx.strokeStyle=css('--vp-grid');ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  // Axes: X (red) along the time base line, Y (green) through "now".
  const today=V.pos(sc.start,todayISO()),now=new Date().toLocaleString('sv-SE',{timeZone:DviScheduling.TIME_ZONE}).slice(11,16),nowX=today+(Number(now.slice(0,2))*60+Number(now.slice(3)))/1440;
  const ax=[[P([-.5,-.5,0]),P([sc.days+.5,-.5,0]),css('--axis-x')]];
  if(nowX>=0&&nowX<=sc.days)ax.push([P([nowX,-.6,0]),P([nowX,L+.6,0]),css('--axis-y')]);
  ctx.lineWidth=1.5;for(const [a,b,c] of ax){ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  // Day labels along the front edge.
  ctx.font=`${css('--fs-xs')} ${css('--font')}`;ctx.textAlign='center';ctx.fillStyle=css('--vp-text-dim');
  const step=Math.max(1,Math.ceil(26/Math.max(1,Math.abs(P([1,-.5,0]).x-P([0,-.5,0]).x))));
  for(let d=0;d<sc.days;d+=step){const p=P([d+.5,-.9,0]);const iso=V.add(sc.start,d);ctx.fillStyle=iso===todayISO()?css('--axis-y'):css('--vp-text-dim');ctx.fillText(String(Number(iso.slice(8))),p.x,p.y);}
  // Objects.
  const conflicts=overlapIds();
  const light={top:.18,front:-.06,left:-.16,right:-.22,back:-.28,bottom:-.4};
  for(const f of V.faces(sc,cam,w,h)){
   let base=ui.shading==='status'?css(STATUS[f.object.job.status]||'--st-draft'):css(f.kind==='setup'?'--setup':'--event');
   if(ui.shading==='solid')base=css(f.kind==='setup'?'--vp-solid-setup':'--vp-solid-event');
   ctx.beginPath();f.poly.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();
   if(ui.shading!=='wire'){ctx.fillStyle=shade(base,light[f.face]*(dark?1:.8));ctx.fill();}
   const sel=ui.selected===f.object.job.id,hov=ui.hover===f.object.job.id;
   ctx.lineWidth=sel?2:1;
   ctx.strokeStyle=sel?css('--vp-active'):conflicts.has(f.object.job.id)?css('--status-critical'):ui.shading==='wire'?base:hov?css('--vp-hover'):css('--vp-edge');
   ctx.stroke();
   if(!f.timed&&f.face==='top'&&ui.shading!=='wire'){ctx.save();ctx.clip();ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=1;const xs=f.poly.map(q=>q.x),ys=f.poly.map(q=>q.y);for(let k=Math.min(...xs)-60;k<Math.max(...xs);k+=7){ctx.beginPath();ctx.moveTo(k,Math.max(...ys));ctx.lineTo(k+60,Math.min(...ys));ctx.stroke();}ctx.restore();}
  }
  // Crew overlap is never colour alone: an Astro "critical" triangle floats above the object.
  for(const o of sc.objects){if(!conflicts.has(o.job.id))continue;const top=V.solids(o)[0];const c=P([(o.x0+o.x1)/2,o.lane*V.LANE+V.LANE/2,top.height+.1]);const s=6,y=c.y-(o.job.id===ui.selected||o.job.id===ui.hover?20:8);ctx.beginPath();ctx.moveTo(c.x-s,y-s*1.4);ctx.lineTo(c.x+s,y-s*1.4);ctx.lineTo(c.x,y);ctx.closePath();ctx.fillStyle=css('--status-critical');ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#000';ctx.stroke();}
  // Object names above selected/hovered objects.
  for(const o of sc.objects){if(o.job.id!==ui.selected&&o.job.id!==ui.hover)continue;const top=V.solids(o)[0];const c=P([(o.x0+o.x1)/2,o.lane*V.LANE+V.LANE/2,top.height+.25]);ctx.font=`600 ${css('--fs-sm')} ${css('--font')}`;ctx.fillStyle=css('--vp-text');ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=3;ctx.fillText(o.job.event,c.x,c.y);ctx.shadowBlur=0;}
  overlay();gizmo();
 }
 function overlay(){
  const el=document.getElementById('vpStats');if(!el)return;
  const jobs=sc.objects.map(o=>o.job),people=new Set();jobs.forEach(j=>peopleOf(j).forEach(k=>people.add(k)));
  const setups=sc.objects.filter(o=>o.segs.some(s=>s.kind==='setup')).length,events=sc.objects.filter(o=>o.segs.some(s=>s.kind==='event')).length;
  const untimed=sc.objects.filter(o=>o.segs.some(s=>!s.timed)).length,sel=ui.selected&&state.jobs.find(j=>j.id===ui.selected);
  const end=V.add(sc.start,sc.days-1),f=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  el.innerHTML=`<b>${esc(V.viewLabel({cam:ui.cam,name:ui.viewName}))}</b><span>(${esc(f(sc.start))} – ${esc(f(end))}) ${esc(typeof zoneLabels==='function'?zoneLabels().city:'Kampala')}</span><span>Job cards&nbsp;&nbsp;${sel?'1/':''}${jobs.length}</span><span>Setups&nbsp;&nbsp;${setups}&nbsp;&nbsp;·&nbsp;&nbsp;Events&nbsp;&nbsp;${events}</span><span>People assigned&nbsp;&nbsp;${people.size}</span>${untimed?`<span>Date-only&nbsp;&nbsp;${untimed}</span>`:''}${sel?`<span class="vp-sel">${esc(sel.no)} · ${esc(sel.event)}</span>`:''}`;
 }
 // Navigation gizmo (top right): drag to orbit, click an axis to view along it.
 function gizmo(){
  const g=document.getElementById('vpGizmo');if(!g)return;const cam=ui.cam,b={cy:Math.cos(cam.yaw*Math.PI/180),sy:Math.sin(cam.yaw*Math.PI/180),cp:Math.cos(cam.pitch*Math.PI/180),sp:Math.sin(cam.pitch*Math.PI/180)};
  const R=28,axes=[['x',[1,0,0]],['y',[0,1,0]],['z',[0,0,1]]];
  const pts=axes.flatMap(([n,v])=>[1,-1].map(sgn=>{const x=v[0]*sgn,y=v[1]*sgn,z=v[2]*sgn,x1=x*b.cy-y*b.sy,y1=x*b.sy+y*b.cy;return {n,sgn,x:40+(x1)*R,y:40-(y1*b.sp+z*b.cp)*R,d:y1*b.cp-z*b.sp};})).sort((a,c)=>c.d-a.d);
  g.innerHTML=`<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="gz-bg" cx="40" cy="40" r="38"/>${pts.filter(p=>p.sgn>0).map(p=>`<line x1="40" y1="40" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="gz-line gz-${p.n}"/>`).join('')}${pts.map(p=>`<g class="gz-ball gz-${p.n}${p.sgn<0?' neg':''}" data-axis="${p.n}${p.sgn<0?'-':''}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.sgn>0?8:6.5}"/>${p.sgn>0?`<text x="${p.x.toFixed(1)}" y="${(p.y+3.4).toFixed(1)}">${p.n.toUpperCase()}</text>`:''}</g>`).join('')}</svg>`;
 }
 function applyView(v){ui.cam=v.cam;ui.viewName=v.name;ui.autoOrtho=v.auto;}
 function snap(axis){if(!V.VIEWS[axis])return;applyView(V.snapView({cam:ui.cam,name:ui.viewName,auto:ui.autoOrtho},axis));request();}
 function orbited(){applyView(V.orbitView({cam:ui.cam,name:ui.viewName,auto:ui.autoOrtho}));}
 function request(){if(!raf)raf=requestAnimationFrame(draw);}
 function select(id){ui.selected=id;if(id&&typeof inspectWorkbenchJob==='function')inspectWorkbenchJob(id);request();const info=document.getElementById('vpInfo');if(info){const j=id&&state.jobs.find(x=>x.id===id);info.textContent=j?`${j.no} · ${j.event} — ${j.status}${overlapSet.has(j.id)?', crew overlap':''}. Double-click or press Enter to open the job card.`:'';}}
 window.renderProductionViewport=function(){canvas=document.getElementById('vpCanvas');if(!canvas||!state)return;ctx=canvas.getContext('2d');build();if(ui.selected&&!state.jobs.some(j=>j.id===ui.selected&&j.status!=='Cancelled'))ui.selected=null;const t=document.getElementById('vpRange');if(t)t.value=String(ui.days);
  const areaEl=canvas.closest('.viewport-area');if(areaEl)areaEl.dataset.mode=ui.mode;document.querySelectorAll('[data-vp-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vpMode===ui.mode)));const label=document.getElementById('vpListLabel');if(label)label.textContent='Jobs in this view (text)';
  document.querySelectorAll('[data-vp-shading]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vpShading===ui.shading)));document.querySelectorAll('[data-vp-show]').forEach(b=>b.setAttribute('aria-pressed',String(ui.show[b.dataset.vpShow])));
  const list=document.getElementById('vpList');if(list)list.innerHTML=sc.objects.length?sc.objects.map(o=>`<li><button type="button" onclick="viewportSelect('${o.job.id}')">${esc(o.job.no)} · ${esc(o.job.event)} — ${o.segs.map(s=>s.kind+(s.timed?'':' (date only)')).join(' + ')}, ${o.people} ${o.people===1?'person':'people'}, ${esc(o.job.status)}${overlapSet.has(o.job.id)?', crew overlap':''}</button></li>`).join(''):'<li>No recorded setups or events in this window.</li>';
  const empty=document.getElementById('vpEmpty');if(empty)empty.hidden=!!sc.objects.length;
  if(ui.mode==='charts'&&typeof renderCharts3D==='function')renderCharts3D();
  request();};
 // The charts share this window (first day, length, phase filter) and its header controls.
 window.viewportWindow=()=>({start:ui.start||V.add(todayISO(),-3),days:ui.days,show:Object.assign({},ui.show)});
 window.viewportSelect=id=>select(id);
 window.viewportCommand=function(cmd,arg){
  if(!canvas||!sc)return;
  if(cmd==='mode'){ui.mode=arg==='blocks'?'blocks':'charts';if(ui.mode==='blocks')ui.cam=null;renderProductionViewport();return;}
  if(ui.mode==='charts'&&typeof chartsCommand==='function'&&['frame','reset','ortho','view','zoom','next','deselect','open'].includes(cmd)){chartsCommand(cmd,arg);return;}
  if(cmd==='next'){const ids=sc.objects.map(o=>o.job.id);if(ids.length)select(ids[(ids.indexOf(ui.selected)+1)%ids.length]);return;}
  const box=canvas.getBoundingClientRect(),r={width:box.width||800,height:box.height||500};
  // A command can arrive before the first frame (e.g. from a menu while the view is hidden).
  if(!ui.cam)ui.cam=V.frame(sc,r.width||800,r.height||500);
  if(cmd==='frame'){ui.cam=V.frame(sc,r.width,r.height,{yaw:ui.cam.yaw,pitch:ui.cam.pitch,ortho:ui.cam.ortho});}
  else if(cmd==='reset'){ui.cam=V.frame(sc,r.width,r.height);ui.viewName=null;ui.autoOrtho=false;}
  else if(cmd==='ortho'){ui.cam.ortho=!ui.cam.ortho;ui.autoOrtho=false;}
  else if(cmd==='view')snap(arg);
  else if(cmd==='zoom'){ui.cam.zoom*=arg;}
  else if(cmd==='shading'){ui.shading=arg;renderProductionViewport();return;}
  else if(cmd==='show'){ui.show[arg]=!ui.show[arg];if(!ui.show.setup&&!ui.show.event)ui.show[arg==='setup'?'event':'setup']=true;renderProductionViewport();return;}
  else if(cmd==='range'){ui.days=Number(arg)||21;ui.cam=null;renderProductionViewport();return;}
  else if(cmd==='shift'){ui.start=V.add(ui.start||V.add(todayISO(),-3),Number(arg)||0);renderProductionViewport();return;}
  else if(cmd==='today'){ui.start=null;ui.cam=null;renderProductionViewport();return;}
  else if(cmd==='deselect'){select(null);return;}
  else if(cmd==='open'){if(ui.selected)openView(ui.selected);return;}
  request();
 };
 function wire(){
  canvas=document.getElementById('vpCanvas');if(!canvas)return;ctx=canvas.getContext('2d');
  const pointers=new Map();
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});ui.dragging={x:e.clientX,y:e.clientY,moved:false,pan:e.shiftKey||e.button===1,yaw:ui.cam.yaw,pitch:ui.cam.pitch,target:ui.cam.target.slice(),zoom:ui.cam.zoom,pinch:pointers.size===2?dist():0};});
  const dist=()=>{const p=[...pointers.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
  canvas.addEventListener('pointermove',e=>{
   const r=canvas.getBoundingClientRect();
   if(!ui.dragging){const o=V.hit(sc,ui.cam,r.width,r.height,e.clientX-r.left,e.clientY-r.top);const id=o?o.job.id:null;if(id!==ui.hover){ui.hover=id;canvas.style.cursor=id?'pointer':'grab';request();}return;}
   if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   const d=ui.dragging,dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>3)d.moved=true;
   if(pointers.size===2&&d.pinch){ui.cam.zoom=Math.max(2,d.zoom*dist()/d.pinch);request();return;}
   if(d.pan){
    // Move the target against the camera's right and up vectors so the scene follows the pointer.
    const y=ui.cam.yaw*Math.PI/180,p=ui.cam.pitch*Math.PI/180,cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),s=1/ui.cam.zoom;
    ui.cam.target=[d.target[0]-dx*s*cy+dy*s*sp*sy,d.target[1]+dx*s*sy+dy*s*sp*cy,d.target[2]+dy*s*cp];
   }
   else{orbited();ui.cam.yaw=d.yaw+dx*.35;ui.cam.pitch=Math.max(-10,Math.min(90,d.pitch+dy*.3));}
   canvas.style.cursor='grabbing';request();
  });
  const end=e=>{pointers.delete(e.pointerId);const d=ui.dragging;ui.dragging=null;canvas.style.cursor='grab';if(d&&!d.moved&&e.type==='pointerup'){const r=canvas.getBoundingClientRect(),o=V.hit(sc,ui.cam,r.width,r.height,e.clientX-r.left,e.clientY-r.top);select(o?o.job.id:null);}};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',()=>{if(ui.hover){ui.hover=null;request();}});
  canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect(),o=V.hit(sc,ui.cam,r.width,r.height,e.clientX-r.left,e.clientY-r.top);if(o)openView(o.job.id);});
  canvas.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey&&!document.getElementById('vpCanvas').matches(':focus'))return;e.preventDefault();ui.cam.zoom=Math.max(2,ui.cam.zoom*(e.deltaY<0?1.12:1/1.12));request();},{passive:false});
  canvas.addEventListener('keydown',e=>{
   const k=e.key,step=e.shiftKey?15:5;let used=true;
   if(k.startsWith('Arrow'))orbited();if(k==='ArrowLeft')ui.cam.yaw-=step;else if(k==='ArrowRight')ui.cam.yaw+=step;else if(k==='ArrowUp')ui.cam.pitch=Math.min(90,ui.cam.pitch+step);else if(k==='ArrowDown')ui.cam.pitch=Math.max(-10,ui.cam.pitch-step);
   else if(k==='+'||k==='=')ui.cam.zoom*=1.12;else if(k==='-')ui.cam.zoom/=1.12;else if(k==='Home'||k==='.')viewportCommand('frame');else if(k==='5'){ui.cam.ortho=!ui.cam.ortho;ui.autoOrtho=false;}
   else if(k==='1')snap(e.ctrlKey?'y':'y-');else if(k==='3')snap(e.ctrlKey?'x-':'x');else if(k==='7')snap(e.ctrlKey?'z-':'z');
   else if(k==='Tab'||k==='Escape')used=false;
   else if(k==='Enter'&&ui.selected)openView(ui.selected);
   else if(k==='n'||k==='N'){const ids=sc.objects.map(o=>o.job.id);if(ids.length)select(ids[(ids.indexOf(ui.selected)+1)%ids.length]);}
   else used=false;
   if(used){e.preventDefault();e.stopPropagation();request();}
  });
  const gz=document.getElementById('vpGizmo');
  if(gz){let gd=null;gz.addEventListener('pointerdown',e=>{gz.setPointerCapture(e.pointerId);gd={x:e.clientX,y:e.clientY,yaw:ui.cam.yaw,pitch:ui.cam.pitch,moved:false,axis:e.target.closest('[data-axis]')};});
   gz.addEventListener('pointermove',e=>{if(!gd)return;const dx=e.clientX-gd.x,dy=e.clientY-gd.y;if(Math.hypot(dx,dy)>2)gd.moved=true;if(gd.moved){orbited();ui.cam.yaw=gd.yaw+dx*.6;ui.cam.pitch=Math.max(-10,Math.min(90,gd.pitch+dy*.5));request();}});
   gz.addEventListener('pointerup',()=>{if(gd&&!gd.moved&&gd.axis)snap(gd.axis.dataset.axis);gd=null;});}
  new ResizeObserver(()=>request()).observe(canvas);
  new MutationObserver(()=>request()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-accent','style']});
 }
 wire();
 const beforeViewportRender=renderAll;renderAll=function(){beforeViewportRender();renderProductionViewport();};
 const beforeViewportInspect=inspectWorkbenchJob;inspectWorkbenchJob=function(id){beforeViewportInspect(id);if(ui.selected!==id){ui.selected=id;request();}};
 const beforeViewportSwitch=switchView;switchView=function(v){beforeViewportSwitch(v);if(v==='dashboard')request();};
 renderProductionViewport();
}
