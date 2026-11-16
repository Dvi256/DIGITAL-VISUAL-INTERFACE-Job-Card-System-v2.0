/* Overview 3D charts: a lit bar "skyline" of daily activity and 3D donuts for status mix
   and timing completeness. Saved records only: no storage, network, randomness or
   invented values. The model and geometry are pure (tested in Node); the canvas UI runs
   in the browser and shares the viewport's window (start date, days, phase filter). */
(function(root,factory){
 const A=typeof module==='object'&&module.exports?require('./analytics.js'):root.DviAnalytics;
 const api=factory(A);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DviCharts3D=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
const STATUS_TOKENS={Draft:'--st-draft',Scheduled:'--st-scheduled',Setup:'--st-setup','In Progress':'--st-progress',Completed:'--st-completed',Cancelled:'--st-cancelled'};

// One row per civil day: setup and event job-days (cancelled jobs excluded) and the
// distinct people on jobs active that day. show = {setup,event} hides a phase entirely.
function series(jobs,start,days,keysOf,show){
 const end=A.add(start,days-1),list=A.inRange(jobs,start,end),out=[],withSetup=!show||show.setup!==false,withEvent=!show||show.event!==false;
 for(const iso of A.days(start,end)){
  let setup=0,event=0;const people=new Set(),ids=[];
  for(const j of list){
   const s=withSetup&&A.setupOn(j,iso),e=withEvent&&A.eventOn(j,iso);if(s)setup++;if(e)event++;
   if(s||e){ids.push(j.id);if(keysOf)for(const k of keysOf(j))people.add(k);}
  }
  out.push({iso,setup,event,people:people.size,jobs:ids});
 }
 return out;
}
// Whole-number percentages that add up to exactly 100 (largest remainder).
function percentages(counts){
 const total=counts.reduce((a,b)=>a+b,0);if(!total)return counts.map(()=>0);
 const raw=counts.map(c=>c*100/total),out=raw.map(Math.floor);let left=100-out.reduce((a,b)=>a+b,0);
 raw.map((r,i)=>[r-out[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).forEach(([,i])=>{if(left>0&&counts[i]>0){out[i]++;left--;}});
 return out;
}
// Status mix of job cards touching the window (cancelled included, as in Insights).
function statusSlices(jobs,start,end){
 const mix=A.statusMix(jobs,start,end),pct=percentages(mix.map(m=>m.count));
 return mix.map((m,i)=>({key:m.status,label:m.status,count:m.count,pct:pct[i],token:STATUS_TOKENS[m.status]})).filter(s=>s.count>0);
}
// Timing completeness of active job cards in the window (Astro status colours).
function timingSlices(jobs,start,end){
 const s=A.summary(jobs,start,end),rows=[['timed','All three times',s.timed,'--status-normal','normal'],['partial','Some times',s.partial,'--status-caution','caution'],['dateOnly','Date only',s.dateOnly,'--status-off','off']];
 const pct=percentages(rows.map(r=>r[2]));
 return rows.map((r,i)=>({key:r[0],label:r[1],count:r[2],pct:pct[i],token:r[3],symbol:r[4]})).filter(x=>x.count>0);
}
// Smallest "nice" axis top at or above v (1, 2, 5 x 10^n; small counts stay exact).
function niceMax(v){if(!(v>0))return 1;if(v<=5)return Math.ceil(v);const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p;}
function ticks(top){const step=top<=5?1:top<=10?2:top/5,out=[];for(let v=0;v<=top+1e-9;v+=step)out.push(Math.round(v*1e6)/1e6);return out;}
// Columns in world units: day i spans x i..i+1, depth y 0..1, stacked segments along z.
function barColumns(rows,metric,show,scale){
 const on=k=>!show||show[k]!==false;
 return rows.map((r,i)=>{
  const segs=[];let z=0;const push=(kind,v)=>{if(v>0){segs.push({kind,value:v,z0:z,z1:z+v*scale});z+=v*scale;}};
  if(metric==='people')push('people',r.people);else{if(on('setup'))push('setup',r.setup);if(on('event'))push('event',r.event);}
  const total=metric==='people'?r.people:(on('setup')?r.setup:0)+(on('event')?r.event:0);
  return {i,iso:r.iso,x0:i+.2,x1:i+.8,y0:.2,y1:.8,segs,total,top:z,row:r};
 });
}
// Calendar skyline: the same columns laid out as a week grid (Monday first). Weekdays run
// along X, weeks along Y with the first week farthest away, like a calendar on a table.
function gridColumns(rows,metric,show,scale){
 const cols=barColumns(rows,metric,show,scale);if(!rows.length)return {cols,weeks:0};
 const lead=(new Date(rows[0].iso+'T12:00:00Z').getUTCDay()+6)%7,weeks=Math.ceil((lead+rows.length)/7);
 cols.forEach((c,k)=>{const at=lead+k,col=at%7,week=Math.floor(at/7),y=weeks-1-week;Object.assign(c,{col,week,x0:col+.18,x1:col+.82,y0:y+.18,y1:y+.82});});
 return {cols,weeks,lead};
}
// Orbit camera: yaw/pitch in degrees around (cx,cy,cz); perspective unless ortho.
function project(pt,cam,w,h){
 const yr=cam.yaw*Math.PI/180,pr=cam.pitch*Math.PI/180;
 const x=pt[0]-cam.cx,y=pt[1]-cam.cy,z=pt[2]-cam.cz;
 const x1=x*Math.cos(yr)-y*Math.sin(yr),y1=x*Math.sin(yr)+y*Math.cos(yr);
 const up=z*Math.cos(pr)+y1*Math.sin(pr),depth=y1*Math.cos(pr)-z*Math.sin(pr);
 const s=cam.ortho?cam.zoom:cam.zoom*cam.dist/Math.max(.2,cam.dist+depth);
 return {x:w/2+(cam.panX||0)+x1*s,y:h/2+(cam.panY||0)-up*s,depth};
}
function eyeDirection(cam){const yr=cam.yaw*Math.PI/180,pr=cam.pitch*Math.PI/180;return [-Math.cos(pr)*Math.sin(yr),-Math.cos(pr)*Math.cos(yr),Math.sin(pr)];}
// Fit the whole chart (floor, tallest possible bar, labels) into w x h, then apply the
// person's zoom and pan on top. view = {yaw,pitch,zoomMul,panX,panY,ortho};
// bounds = {x0,x1,y0,y1,z1} in world units (labels included).
function fitCamera(view,bounds,w,h,margin){
 const m=Object.assign({top:24,right:24,bottom:24,left:24},margin||{}),B=bounds;
 const span=Math.max(B.x1-B.x0,B.y1-B.y0);
 const cam={yaw:view.yaw,pitch:view.pitch,ortho:!!view.ortho,dist:span*1.6+9,cx:(B.x0+B.x1)/2,cy:(B.y0+B.y1)/2,cz:B.z1*.4,zoom:1,panX:0,panY:0};
 const pts=[];for(const x of [B.x0,B.x1])for(const y of [B.y0,B.y1])for(const z of [0,B.z1])pts.push([x,y,z]);
 const box=c=>{let a=Infinity,b=Infinity,d=-Infinity,e=-Infinity;for(const p of pts){const q=project(p,c,w,h);a=Math.min(a,q.x);b=Math.min(b,q.y);d=Math.max(d,q.x);e=Math.max(e,q.y);}return {x0:a,y0:b,x1:d,y1:e};};
 const b0=box(cam),aw=Math.max(40,w-m.left-m.right),ah=Math.max(40,h-m.top-m.bottom);
 cam.zoom=Math.min(aw/Math.max(1e-6,b0.x1-b0.x0),ah/Math.max(1e-6,b0.y1-b0.y0))*(view.zoomMul||1);
 const b1=box(cam);
 cam.panX=m.left+aw/2-(b1.x0+b1.x1)/2+(view.panX||0);cam.panY=m.top+ah/2-(b1.y0+b1.y1)/2+(view.panY||0);
 return cam;
}
// Visible faces of an axis-aligned box (bottom never shown: bars stand on the floor).
function boxFaces(x0,x1,y0,y1,z0,z1,cam){
 const eyeDir=eyeDirection(cam),eye=[cam.cx+eyeDir[0]*cam.dist,cam.cy+eyeDir[1]*cam.dist,cam.cz+eyeDir[2]*cam.dist];
 const F=[
  ['top',[0,0,1],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]],
  ['front',[0,-1,0],[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]]],
  ['back',[0,1,0],[[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]]],
  ['left',[-1,0,0],[[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]]],
  ['right',[1,0,0],[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]]]
 ];
 return F.filter(([,n,pts])=>{
  if(cam.ortho)return n[0]*eyeDir[0]+n[1]*eyeDir[1]+n[2]*eyeDir[2]>1e-9;
  const c=pts.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4,s[2]+p[2]/4],[0,0,0]);
  return n[0]*(eye[0]-c[0])+n[1]*(eye[1]-c[1])+n[2]*(eye[2]-c[2])>1e-9;
 }).map(([face,normal,pts])=>({face,normal,pts}));
}
// Donut slices from counts: angles in radians starting at `rotation` (default 12 o'clock),
// sweeps proportional to counts and scaled by `progress` (0..1) for the opening sweep.
function pieAngles(slices,rotation,progress){
 const total=slices.reduce((a,s)=>a+s.count,0),p=progress==null?1:progress;let a=rotation==null?-Math.PI/2:rotation;
 return slices.map(s=>{const sweep=total?s.count/total*Math.PI*2*p:0,r=Object.assign({},s,{a0:a,a1:a+sweep,mid:a+sweep/2});a+=sweep;return r;});
}
function inArc(t,a0,a1){while(t<a0)t+=Math.PI*2;while(t>=a0+Math.PI*2)t-=Math.PI*2;return t<=a1;}
// Hit test a tilted donut (k = vertical squash, T = thickness): top face first, then the
// front outer wall. Exploded slices are offset along their middle angle.
function sliceAt(arcs,g,x,y){
 for(const a of arcs){
  const ox=a.ox||0,oy=a.oy||0,dx=x-(g.cx+ox),dy=(y-(g.cy+oy))/g.k,d=Math.hypot(dx,dy);
  if(d>=g.r&&d<=g.R&&inArc(Math.atan2(dy,dx),a.a0,a.a1))return a;
 }
 for(const a of arcs){
  const ox=a.ox||0,oy=a.oy||0,cx=(x-(g.cx+ox))/g.R;if(cx<-1||cx>1)continue;
  const t=Math.acos(cx),rim=g.cy+oy+Math.sin(t)*g.R*g.k;
  if(y>=rim&&y<=rim+g.T&&inArc(t,a.a0,a.a1))return a;
 }
 return null;
}
function pointInPolygon(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-9)+a.x))inside=!inside;}return inside;}

// ---------------------------------------------------------------------------------------
// Pro style: pure helpers. Same saved records, nothing invented; all testable without a DOM.
// ---------------------------------------------------------------------------------------
// Headline totals for the window, from the same day rows as the skyline (so the phase filter
// already applies): job-days, person-days, days with any activity, the peak day for both
// metrics, and the distinct job cards and people behind those rows.
function windowTotals(rows,jobs,keysOf){
 const ids=new Set(),people=new Set(),peak={jobdays:{value:0,iso:''},people:{value:0,iso:''}};
 let setup=0,event=0,personDays=0,activeDays=0;
 for(const r of rows||[]){
  setup+=r.setup;event+=r.event;personDays+=r.people;if(r.setup+r.event>0)activeDays++;
  for(const id of r.jobs)ids.add(id);
  if(r.setup+r.event>peak.jobdays.value)peak.jobdays={value:r.setup+r.event,iso:r.iso};
  if(r.people>peak.people.value)peak.people={value:r.people,iso:r.iso};
 }
 if(keysOf)for(const j of jobs||[])if(ids.has(j.id))for(const k of keysOf(j))people.add(k);
 return {setup,event,jobDays:setup+event,personDays,activeDays,days:(rows||[]).length,cards:ids.size,people:people.size,peak};
}
// Load by client inside the window: setup and event job-days (cancelled jobs excluded, phase
// filter applied exactly as in series()), job cards and distinct people. clientOf(job) returns
// {key,name} or null; jobs with no client on record share one row with key ''. Rows are sorted
// by the chosen metric ('people' or job-days), then job-days, cards, named before unnamed, name.
function clientLoad(jobs,start,days,clientOf,keysOf,show,metric){
 const end=A.add(start,days-1),dates=A.days(start,end),withSetup=!show||show.setup!==false,withEvent=!show||show.event!==false,m=new Map();
 for(const j of A.inRange(jobs,start,end)){
  let setup=0,event=0;for(const iso of dates){if(withSetup&&A.setupOn(j,iso))setup++;if(withEvent&&A.eventOn(j,iso))event++;}
  if(!setup&&!event)continue;
  const c=clientOf?clientOf(j):null,key=c&&c.key!=null&&c.key!==''?String(c.key):'';
  if(!m.has(key))m.set(key,{key,name:key?String(c.name==null||c.name===''?key:c.name):'',setup:0,event:0,jobs:[],crew:new Set()});
  const row=m.get(key);row.setup+=setup;row.event+=event;row.jobs.push(j.id);if(keysOf)for(const k of keysOf(j))row.crew.add(k);
 }
 const value=r=>metric==='people'?r.people:r.total;
 return [...m.values()].map(r=>({key:r.key,name:r.name,setup:r.setup,event:r.event,total:r.setup+r.event,cards:r.jobs.length,people:r.crew.size,jobs:r.jobs,crew:[...r.crew]}))
  .sort((a,b)=>value(b)-value(a)||b.total-a.total||b.cards-a.cards||(a.key==='')-(b.key==='')||a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
}
// Keep the first rows; when there are more than `limit`, the last slot becomes one "other" row
// that sums the rest (people counted once), so nothing recorded drops out of the picture.
function foldRows(rows,limit){
 limit=Math.max(1,Math.floor(limit)||1);if(rows.length<=limit)return rows.slice();
 const head=rows.slice(0,limit-1),rest=rows.slice(limit-1),crew=new Set(),sum=k=>rest.reduce((a,r)=>a+r[k],0);
 for(const r of rest)for(const k of r.crew||[])crew.add(k);
 return head.concat([{key:'~other',other:true,count:rest.length,name:'',setup:sum('setup'),event:sum('event'),total:sum('total'),cards:sum('cards'),people:crew.size,jobs:rest.flatMap(r=>r.jobs||[]),crew:[...crew]}]);
}
// WCAG relative luminance and contrast ratio of [r,g,b] colours (0..255).
function luminance(c){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
// Calm a colour: pull it toward the grey of the same lightness (amount 0..1). The hue stays.
function mute(c,amount){const y=.2126*c[0]+.7152*c[1]+.0722*c[2];return c.map(v=>Math.round(v+(y-v)*amount));}
// Step a colour away from `ground` until it stands off by at least `min`:1, so a material never
// sinks into the surface behind it. On dark grounds it is first brightened (channels scaled, so
// hue and saturation stay) and only then tinted toward white; on light grounds it is shaded.
function liftContrast(c,ground,min){
 const up=luminance(ground)<.4;let out=c.slice();
 for(let i=0;i<48&&contrast(out,ground)<min;i++){
  const top=Math.max(out[0],out[1],out[2]);
  if(up&&top>0&&top<255){const f=Math.min(1.06,255/top);out=out.map(v=>Math.min(255,Math.round(v*f)));}
  else out=out.map(v=>Math.round(v+((up?255:0)-v)*.08));
 }
 return out;
}
// Floor shadow of an upright box lit from one side: the footprint swept by (dx,dy), returned
// as its convex outline [[x,y],...] in drawing order.
function shadowHull(x0,x1,y0,y1,dx,dy){
 const pts=[];for(const o of [[0,0],[dx,dy]])for(const x of [x0,x1])for(const y of [y0,y1])pts.push([x+o[0],y+o[1]]);
 pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
 for(const p of pts){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
 for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
// Parts of the sweep a0..a1 whose direction lies between lo and hi (0 <= lo < hi <= 2π),
// e.g. the half of a donut wall that faces the viewer. Returns [[start,end],...].
function arcWindows(a0,a1,lo,hi){
 const out=[],TAU=Math.PI*2;if(!(a1>a0))return out;
 for(let n=Math.floor((a0-hi)/TAU);n*TAU+lo<a1;n++){const s=Math.max(a0,n*TAU+lo),e=Math.min(a1,n*TAU+hi);if(e-s>1e-9)out.push([s,e]);}
 return out;
}
// The window of the same length that ends the day before `start` (the comparison period).
function previousWindow(start,days){return {start:A.add(start,-days),end:A.add(start,-1),days};}
// Value of one series() row under a metric ('jobdays' | 'people') and the Setup/Event filter.
function dayValue(row,metric,show){if(!row)return 0;if(metric==='people')return row.people||0;return (!show||show.setup!==false?row.setup:0)+(!show||show.event!==false?row.event:0);}
// Signed change between two counts, with a text that never relies on colour.
function delta(cur,prev){const diff=cur-prev;return {diff,dir:diff>0?'up':diff<0?'down':'same',text:diff>0?'+'+diff:diff<0?'−'+(-diff):'0'};}
// Figures per calendar-week row of the skyline grid (Monday first), next to the same days of
// the previous window. rows and prevRows are series() results of equal length; the window
// lengths offered (7, 14, 21, 42) are whole weeks, so the paired days share their weekdays.
// Job-days add up over the week (agg 'sum'); people do not (the same person works several
// days), so the People metric gives the week's busiest day instead (agg 'peak'), matching the
// skyline's axis. from/to/days give the part of the week inside the window (partial: days < 7).
function weekTotals(rows,prevRows,metric,show){
 if(!rows||!rows.length)return [];
 const lead=(new Date(rows[0].iso+'T12:00:00Z').getUTCDay()+6)%7,out=[],agg=metric==='people'?'peak':'sum';
 rows.forEach((r,k)=>{
  const week=Math.floor((lead+k)/7);
  if(!out[week])out[week]={week,monday:A.add(r.iso,-((lead+k)%7)),from:r.iso,to:r.iso,days:0,partial:false,agg,total:0,prev:0,delta:0};
  const w=out[week],v=dayValue(r,metric,show),pv=dayValue(prevRows&&prevRows[k],metric,show);w.to=r.iso;w.days++;w.partial=w.days<7;
  if(agg==='peak'){w.total=Math.max(w.total,v);w.prev=Math.max(w.prev,pv);}else{w.total+=v;w.prev+=pv;}
  w.delta=w.total-w.prev;
 });
 return out;
}
// Axis top for the Pro skyline and client bars: the smallest of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8
// (x 10^n) at or above v, so the longest bar nearly reaches the top (7 -> 8, not 10).
function niceTop(v){
 if(!(v>0))return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;
 for(const s of [1,1.5,2,2.5,3,4,5,6,8,10])if(n<=s+1e-9){const t=Math.round(s*p*1e6)/1e6;return t>=v?t:Math.ceil(v);}
 return Math.ceil(v);
}
// Tick values 0..top in at most 5 even steps of 1, 2, 2.5 or 5 (x 10^n) that land on top.
function niceTicks(top){
 if(!(top>0))return [0];const p=Math.pow(10,Math.floor(Math.log10(top)));
 for(const e of [p/10,p,p*10])for(const s of [1,2,2.5,5]){const st=s*e,n=top/st;if(st>=1&&Math.abs(n-Math.round(n))<1e-9&&n<=5&&n>=1){const out=[];for(let i=0;i<=Math.round(n);i++)out.push(Math.round(i*st*1e6)/1e6);return out;}}
 return [0,top];
}
// Pro skyline axis top: never below 3 (one job-day must not become a tower), and with a phase
// hidden it keeps the unfiltered scale, so switching Setup or Event off does not stretch the rest.
function skyTop(rows,metric,show){
 let m=3;for(const r of rows||[])m=Math.max(m,dayValue(r,metric,show),dayValue(r,metric,null));
 return niceTop(m);
}
// Fit a chart and the pixel boxes of its labels into w x h. Like fitCamera, but each extra is a
// world anchor p plus the box its label takes around it in pixels (x0..x1, y0..y1, which do not
// grow with the zoom), so label room is only reserved where a label really sits. Screen positions
// are linear in the zoom, so the largest zoom that fits is found by bisection.
function fitLabelled(view,bounds,w,h,margin,extras){
 const m=Object.assign({top:0,right:0,bottom:0,left:0},margin||{}),B=bounds;
 const cam=fitCamera(Object.assign({},view,{zoomMul:1,panX:0,panY:0}),B,w,h,{top:0,right:0,bottom:0,left:0});cam.zoom=1;cam.panX=0;cam.panY=0;
 const items=[];for(const x of [B.x0,B.x1])for(const y of [B.y0,B.y1])for(const z of [B.z0||0,B.z1])items.push({p:[x,y,z],x0:0,x1:0,y0:0,y1:0});
 for(const e of extras||[])if(e&&e.p)items.push(e);
 const base=items.map(e=>{const q=project(e.p,cam,w,h);return [q.x-w/2-cam.panX,q.y-h/2-cam.panY,e];});
 const ext=z=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [bx,by,e] of base){a=Math.min(a,z*bx+(e.x0||0));c=Math.max(c,z*bx+(e.x1||0));b=Math.min(b,z*by+(e.y0||0));d=Math.max(d,z*by+(e.y1||0));}return {x0:a,x1:c,y0:b,y1:d};};
 const aw=Math.max(40,w-m.left-m.right),ah=Math.max(40,h-m.top-m.bottom),ok=z=>{const r=ext(z);return r.x1-r.x0<=aw+1e-6&&r.y1-r.y0<=ah+1e-6;};
 if(!ok(0))return fitCamera(view,B,w,h,m);
 let lo=0,hi=1;for(let i=0;i<60&&ok(hi);i++){lo=hi;hi*=2;}
 for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(ok(mid))lo=mid;else hi=mid;}
 const z=Math.max(1e-6,lo)*(view.zoomMul||1),r=ext(z);
 cam.zoom=z;cam.panX=m.left+aw/2-w/2-(r.x0+r.x1)/2+(view.panX||0);cam.panY=m.top+ah/2-h/2-(r.y0+r.y1)/2+(view.panY||0);
 return cam;
}
// First box (top-left x, y; size tw x th) among cands that lies inside area and clear of every
// rect in avoid; when none is clear, the first that fits inside (clamped into the area).
function placeBox(cands,tw,th,area,avoid){
 const inside=c=>c.x>=area.x-1e-6&&c.y>=area.y-1e-6&&c.x+tw<=area.x+area.w+1e-6&&c.y+th<=area.y+area.h+1e-6;
 const hit=c=>(avoid||[]).some(r=>r&&c.x<r.x+r.w&&r.x<c.x+tw&&c.y<r.y+r.h&&r.y<c.y+th);
 for(const c of cands)if(inside(c)&&!hit(c))return {x:c.x,y:c.y,clear:true};
 const c=cands.find(inside)||cands[0]||{x:area.x,y:area.y};
 return {x:Math.max(area.x,Math.min(area.x+area.w-tw,c.x)),y:Math.max(area.y,Math.min(area.y+area.h-th,c.y)),clear:false};
}
// Size of the total printed in a donut's hole: it must sit in the clear part of the hole (the
// inner ellipse minus the far inner wall), so it is sized from that space and left out (0) when
// it would be smaller than minPx; the card title carries the total as well.
function holeFont(R,r,k,T,chars,u,minPx){
 u=u||1;const clearH=2*r*k-T,half=clearH/2,inner=r*k;if(!(clearH>0))return 0;
 const yo=Math.min(inner,T/2),clearW=2*r*Math.sqrt(Math.max(0,1-(yo*yo)/(inner*inner)));
 const s=Math.floor(Math.min(R*.3,24*u,clearH*.82/.72,clearW*.8/(.62*Math.max(1,chars))));
 return s>=(minPx==null?11*u:minPx)&&half>0?s:0;
}
// Headline figures (at most six, so a phone shows all of them as a 3 x 2 grid), each with the
// same figure for the previous window. T and PT are windowTotals() of this and the previous
// window. Job-days metric: Job-days, Setup, Event, Peak day, People, Job cards (Active days
// takes a hidden phase's place). People metric: People, Person-days, Peak day, Active days,
// Job-days, Job cards. chip names the colour key the figure carries.
function headlineCells(T,PT,metric,show){
 const on=k=>!show||show[k]!==false,cell=(key,label,value,prev,extra)=>Object.assign({key,label,value,prev},extra||{});
 const pk=metric==='people'?'people':'jobdays',peak=cell('peak','Peak day',T.peak[pk].value,PT.peak[pk].value,{iso:T.peak[pk].iso,prevIso:PT.peak[pk].iso});
 const active=cell('activeDays','Active days',T.activeDays,PT.activeDays,{of:T.days});
 // Job cards here are the active ones (with a setup or event day in the window, cancelled never
 // count), which is why the label says so: the Status mix card also counts cancelled cards.
 const cards=cell('cards','Active job cards',T.cards,PT.cards,{short:'Active cards'});
 if(metric==='people')return [cell('people','People',T.people,PT.people,{chip:'people'}),cell('personDays','Person-days',T.personDays,PT.personDays),peak,active,cell('jobDays','Job-days',T.jobDays,PT.jobDays),cards];
 const list=[cell('jobDays','Job-days',T.jobDays,PT.jobDays)];
 if(on('setup'))list.push(cell('setup','Setup',T.setup,PT.setup,{chip:'setup'}));
 if(on('event'))list.push(cell('event','Event',T.event,PT.event,{chip:'event'}));
 list.push(peak,active,cell('people','People',T.people,PT.people),cards);
 if(list.length>6)list.splice(list.indexOf(active),1);
 return list;
}
// Value tags on a dense skyline: up to `limit` active columns every figure is shown; beyond
// that only the peak (first on a tie), today's, the selected and the hovered column keep a
// tag (every figure stays in the tooltip and the text list). cols = [{i,total,iso}].
function tagColumns(cols,keep,limit){
 keep=keep||{};const active=cols.filter(c=>c.total>0);
 if(active.length<=(limit==null?14:limit))return active.map(c=>c.i);
 let peak=null;for(const c of active)if(!peak||c.total>peak.total)peak=c;
 return active.filter(c=>c===peak||c.i===keep.sel||c.i===keep.hov||(keep.today&&c.iso===keep.today)).map(c=>c.i);
}
// Thin a run of labels evenly: the smallest step k such that labels 0, k, 2k, ... never touch.
// boxes = [{x,y,w,h}] in order along the axis.
function labelStep(boxes,gap){
 gap=gap==null?3:gap;const hit=(a,b)=>a.x<b.x+b.w+gap&&b.x<a.x+a.w+gap&&a.y<b.y+b.h+gap&&b.y<a.y+a.h+gap;
 for(let k=1;k<boxes.length;k++){let ok=true;for(let i=0;i+k<boxes.length&&ok;i+=k)if(hit(boxes[i],boxes[i+k]))ok=false;if(ok)return k;}
 return Math.max(1,boxes.length);
}
// Width-to-height ratio of a chart's projected bounding box at a view (zoom-independent).
function boxAspect(view,bounds){
 const cam=fitCamera(view,bounds,1000,1000,{top:0,right:0,bottom:0,left:0});let a=Infinity,b=Infinity,d=-Infinity,e=-Infinity;
 for(const x of [bounds.x0,bounds.x1])for(const y of [bounds.y0,bounds.y1])for(const z of [0,bounds.z1]){const q=project([x,y,z],cam,1000,1000);a=Math.min(a,q.x);b=Math.min(b,q.y);d=Math.max(d,q.x);e=Math.max(e,q.y);}
 return (d-a)/Math.max(1e-6,e-b);
}
const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
// Donut ring size shared by the two donut cards: the legend beside the ring, or under it when
// that gives a clearly larger ring. cells = [{w,h}], rows = legend rows per card, u = UI scale.
function donutPlan(cells,rows,u){
 u=u||1;const cap=110*u;
 // A narrow card gives its legend a little less room (the share column then gives way) so the ring is not tiny.
 const fit=(c,n,side)=>{const iw=c.w-24*u,ih=c.h-38*u,LW=clampN(iw*.55,110*u,150*u);n=Math.max(1,n||1);return side?(n*18*u<=ih?Math.min((iw-LW-22*u)/2,(ih-6*u)/1.12):0):Math.min(iw*.36,(ih-n*19*u-14*u)/1.12);};
 const best=side=>Math.min(...cells.map((c,i)=>fit(c,rows[i],side))),a=best(true),b=best(false),side=a>=b*.9;
 return {side,R:clampN(side?a:b,18*u,cap)};
}
// Pro stage composition for a w x h canvas: a headline band, the skyline as the hero and the
// cards (status mix, timing, load by client). n = {status,timing,clients} legend/client rows,
// aspect = the skyline's projected width/height, mx/my = the pixels its labels need around it,
// u = UI scale. Modes, by width:
//  - 'under' (700px and up, when the skyline leaves room below it): the client card sits under
//    the skyline and the two donut cards share the right-hand column, so nothing floats in
//    empty space; 'side' when the stage is too short for that: all three cards on the right,
//    each sized to what it can use;
//  - 'row' (500-699px, e.g. 1100-1280px windows): the two donut cards form a row beneath the
//    skyline, and a compact client card stands beside it (the skyline is limited by its height
//    at this size, so the width it gives up was empty margin);
//  - 'stack' (phones): everything stacked; views.css gives the Pro stage 880px there.
// The headline is one row from 500px, a 3 x 2 grid below. Rectangles never overlap.
function proLayout(w,h,n){
 n=Object.assign({status:4,timing:3,clients:4,aspect:1.6,mx:140,my:58,u:1},n||{});
 const u=n.u||1,R=Math.round,small=w<640,pad=R((small?6:10)*u),gap=R((small?6:8)*u),headH=R((w<500?128:small?66:76)*u);
 const head={x:0,y:0,w,h:headH},top=headH,bodyH=Math.max(0,h-headH),rows=k=>Math.max(1,Math.min(6,k||0));
 const natural=sw=>Math.max(0,sw-n.mx)/Math.max(.2,n.aspect)+n.my;
 const clientLeast=R((54+Math.min(2,rows(n.clients))*22)*u),clientUnder=R((54+Math.min(4,rows(n.clients))*22)*u),clientNeed=R((54+rows(n.clients)*24)*u),clientMost=R((54+rows(n.clients)*40)*u);
 const donutNeed=(cw,k)=>{const ring=clampN((cw-196*u)/2,30*u,64*u);return R(38*u+Math.max(ring*1.12+12*u,Math.max(1,k||1)*20*u+8*u));};
 // The tallest a donut card can usefully be: its ring at full size for the card's width.
 const donutMost=(cw,k)=>{k=Math.max(1,k||1);const rb=Math.min(110*u,(cw-196*u)/2),rs=Math.min(110*u,(cw-24*u)*.38);return R(rb>=rs*.9?38*u+Math.max(rb*1.12+12*u,k*24*u+8*u):38*u+rs*1.12+14*u+k*21*u+8*u);};
 const column=(x,y,cw,H,needs,least,most,weight)=>{
  const k=needs.length,avail=H-gap*(k-1),sum=needs.reduce((a,b)=>a+b,0);let hs;
  if(avail<sum)hs=needs.map((v,i)=>Math.max(least[i],v+(avail-sum)*v/sum));
  else{
   hs=needs.slice();let extra=avail-sum;
   for(let it=0;it<5&&extra>.5;it++){const open=hs.map((v,i)=>v<most[i]-.5?i:-1).filter(i=>i>=0);if(!open.length)break;const ws=open.reduce((a,i)=>a+weight[i],0);let used=0;for(const i of open){const add=Math.min(most[i]-hs[i],extra*weight[i]/ws);hs[i]+=add;used+=add;}extra-=used;}
   if(extra>.5)hs=hs.map(v=>v+extra/k);
  }
  const out=[];let cy=y;hs.forEach(v=>{const ch=Math.floor(v);out.push({x,y:cy,w:cw,h:ch});cy+=ch+gap;});return out;
 };
 if(w>=700){
  const cw=R(clampN(w*.31,260*u,400*u)),x=w-cw-pad,lw=x-gap,spare=bodyH-natural(lw)-gap-pad;
  if(spare>=clientUnder){
   const ch=R(Math.min(clientMost,spare)),bh=bodyH-ch-gap-pad,half=R((bodyH-pad-gap)/2);
   return {mode:'under',side:true,head,bars:{x:0,y:top,w:lw,h:bh},clients:{x:pad,y:top+bh+gap,w:lw-pad,h:ch},status:{x,y:top,w:cw,h:half},timing:{x,y:top+half+gap,w:cw,h:bodyH-pad-gap-half}};
  }
  // Three cards share the column here, so it is a little wider (the skyline has height to spare).
  const sw=R(clampN(w*.36,280*u,440*u)),sx=w-sw-pad;
  const c=column(sx,top,sw,bodyH-pad,[donutNeed(sw,n.status),donutNeed(sw,n.timing),clientNeed],[R(96*u),R(96*u),clientLeast],[donutMost(sw,n.status),donutMost(sw,n.timing),clientMost],[1,1,1.5]);
  return {mode:'side',side:true,head,bars:{x:0,y:top,w:sx-gap,h:bodyH},status:c[0],timing:c[1],clients:c[2]};
 }
 if(w>=500){
  // The skyline is limited by its height here, so a compact client list beside it costs it little.
  // The donut row takes what its rings and legends need; every other pixel goes to the skyline.
  const kw=R(clampN(w*.3,170*u,230*u)),kx=w-kw-pad,lw=kx-gap,dw=R((w-pad*2-gap)/2);
  const rowH=R(clampN(Math.max(donutNeed(dw,n.status),donutNeed(dw,n.timing)),110*u,Math.max(110*u,bodyH*.42))),bh=Math.max(0,bodyH-rowH-gap-pad),y=top+bh+gap;
  return {mode:'row',side:false,head,bars:{x:0,y:top,w:lw,h:bh},clients:{x:kx,y:top,w:kw,h:bh},status:{x:pad,y,w:dw,h:rowH},timing:{x:pad+dw+gap,y,w:w-pad*2-gap-dw,h:rowH}};
 }
 // Phones: the client rows keep their second line (job cards and people); the skyline is limited
 // by the phone's width, not its height, so this costs it nothing.
 const cw=w-pad*2,needs=[donutNeed(cw,n.status),donutNeed(cw,n.timing),Math.max(clientNeed,R((54+rows(n.clients)*36)*u))],least=[R(96*u),R(96*u),clientLeast],sum=needs.reduce((a,b)=>a+b,0);
 const room=bodyH-gap*3-pad,want=clampN(natural(w),200*u,w*.95),bh=R(clampN(room-sum,Math.min(200*u,room*.3),want));
 const c=column(pad,top+bh+gap,cw,bodyH-bh-gap-pad,needs,least,[donutMost(cw,n.status),donutMost(cw,n.timing),clientMost],[1,1,1.5]);
 return {mode:'stack',side:false,head,bars:{x:0,y:top,w,h:bh},status:c[0],timing:c[1],clients:c[2]};
}
// The view the Pro skyline is drawn from: the person's own view, except that from the default
// angle a dense window (five or more week rows) or a narrow skyline (phones, 1100px windows) is
// looked at from higher up, so fewer columns hide the ones behind them and the week rows stand
// far enough apart on screen for their labels; and a top view (pitch 75 and up) is orthographic,
// so every column stays over its own cell instead of leaning into the row behind it.
function proView(view,weeks,def,narrow){
 const v=Object.assign({},view);def=def||{yaw:-22,pitch:36};
 if(v.yaw===def.yaw&&v.pitch===def.pitch){if(weeks>=5)v.pitch=50;else if(narrow)v.pitch=48;}
 if(v.pitch>=75)v.ortho=true;
 return v;
}
// The two chart styles; anything else (missing, misspelt, tampered) means Classic.
const CHART_STYLES=['classic','pro'];
function chartStyleOf(v){return v==='pro'?'pro':'classic';}
return {STATUS_TOKENS,CHART_STYLES,chartStyleOf,series,percentages,statusSlices,timingSlices,niceMax,ticks,barColumns,gridColumns,project,eyeDirection,fitCamera,boxFaces,pieAngles,inArc,sliceAt,pointInPolygon,
 windowTotals,clientLoad,foldRows,luminance,contrast,mute,liftContrast,shadowHull,arcWindows,proLayout,
 previousWindow,dayValue,delta,weekTotals,headlineCells,tagColumns,labelStep,boxAspect,donutPlan,
 niceTop,niceTicks,skyTop,fitLabelled,placeBox,holeFont,proView};
});

// The browser part runs inside its own function, so none of its helpers (draw, init, build ...)
// become globals that could overwrite, or be overwritten by, another script's functions.
if(typeof document!=='undefined')(function(){
 const C=DviCharts3D,AN=DviAnalytics;
 const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=t=>1-Math.pow(1-clamp(t,0,1),3);
 const reduceMotion=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const DEFAULT_VIEW={yaw:-22,pitch:36};
 // style: 'classic' (the original look, drawn by draw/drawBars/drawDonut exactly as before) or
 // 'pro' (boardroom composition and materials, drawn by drawPro and the pro* functions below).
 const S={style:'classic',metric:'jobdays',view:{yaw:DEFAULT_VIEW.yaw,pitch:DEFAULT_VIEW.pitch,zoomMul:1,panX:0,panY:0,ortho:false},rot:[-Math.PI/2,-Math.PI/2],hover:null,focus:null,drag:null,anim:0,sig:'',data:null,hits:null,raf:0,pal:null,shown:null};
 // The saved choice is kept by prefs.js (loaded in <head>), which has already put it on the
 // root element, so the very first frame is drawn in the chosen style.
 S.style=C.chartStyleOf(document.documentElement.getAttribute('data-chart-style')||(window.dviPrefs&&window.dviPrefs.chartStyle));
 let canvas=null,ctx=null,tip=null;
 const area=()=>document.querySelector('.viewport-area');
 const active=()=>{const a=area();return !!a&&a.dataset.mode!=='blocks';};
 const fmtDay=(iso,o)=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',Object.assign({timeZone:'UTC'},o||{weekday:'short',day:'numeric',month:'short'}));
 function rgb(c){c=String(c||'').trim();let m=/^#([0-9a-f]{6})$/i.exec(c);if(m){const n=parseInt(m[1],16);return [n>>16,n>>8&255,n&255];}m=/^#([0-9a-f]{3})$/i.exec(c);if(m)return m[1].split('').map(h=>parseInt(h+h,16));m=/rgba?\(([^)]+)\)/.exec(c);if(m)return m[1].split(',').slice(0,3).map(v=>parseFloat(v));return [128,128,128];}
 // amount > 0 mixes toward white, < 0 toward black.
 function tone(c,amount,alpha){const [r,g,b]=rgb(c),t=amount<0?0:255,p=Math.abs(amount),f=v=>Math.round(v+(t-v)*p);return alpha==null?`rgb(${f(r)},${f(g)},${f(b)})`:`rgba(${f(r)},${f(g)},${f(b)},${alpha})`;}
 function windowNow(){if(typeof viewportWindow==='function')return viewportWindow();return {start:AN.add(todayISO(),-3),days:21,show:{setup:true,event:true}};}
 function keysOf(j){return [...DviScheduling.crewKeys(j,state.technicians).keys()];}

 function build(){
  const w=windowNow(),end=AN.add(w.start,w.days-1);
  const rows=C.series(state.jobs,w.start,w.days,keysOf,w.show),status=C.statusSlices(state.jobs,w.start,end),timing=C.timingSlices(state.jobs,w.start,end);
  S.data={w,end,rows,status,timing};
  // Pro only: headline totals and load by client, from the same records and window.
  const pro=S.style==='pro';
  if(pro){
   const D=S.data,pw=C.previousWindow(w.start,w.days);
   D.totals=C.windowTotals(rows,state.jobs,keysOf);D.clients=C.clientLoad(state.jobs,w.start,w.days,clientOf,keysOf,w.show,S.metric);S.shown=null;
   // The comparison period: the same number of days just before this window, same filter.
   D.prevWindow=pw;D.prevRows=C.series(state.jobs,pw.start,w.days,keysOf,w.show);D.prevTotals=C.windowTotals(D.prevRows,state.jobs,keysOf);
   D.head=C.headlineCells(D.totals,D.prevTotals,S.metric,w.show);D.weeks=C.weekTotals(rows,D.prevRows,S.metric,w.show);
  }
  const sig=JSON.stringify([w.start,w.days,w.show,S.metric,rows.map(r=>[r.setup,r.event,r.people]),status.map(s=>[s.key,s.count]),timing.map(s=>[s.key,s.count])].concat(pro?['pro',S.data.clients.map(c=>[c.key,c.setup,c.event,c.people])]:[]));
  if(sig!==S.sig){S.sig=sig;S.anim=reduceMotion()||S.keepStill?0:performance.now();}
  const valid=t=>{if(!t)return null;if(t.group===0){const i=rows.findIndex(r=>r.iso===t.iso);return i<0?null:{group:0,index:i,iso:t.iso};}if(t.group===3)return pro&&(t.key==='~other'||S.data.clients.some(c=>c.key===t.key))?t:null;return (t.group===1?status:timing).some(s=>s.key===t.key)?t:null;};
  S.focus=valid(S.focus);S.hover=valid(S.hover);
 }
 const barRef=i=>({group:0,index:i,iso:S.data.rows[i].iso});
 function layout(w,h){
  const wide=w>=640;
  if(wide){const bw=Math.round(w*.62);return {bars:{x:0,y:0,w:bw,h},donuts:[{x:bw,y:0,w:w-bw,h:Math.round(h/2)},{x:bw,y:Math.round(h/2),w:w-bw,h:h-Math.round(h/2)}]};}
  const bh=Math.round(h*.56);return {bars:{x:0,y:0,w,h:bh},donuts:[{x:0,y:bh,w:Math.round(w/2),h:h-bh},{x:Math.round(w/2),y:bh,w:w-Math.round(w/2),h:h-bh}]};
 }
 function size(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(200,r.width),h=Math.max(200,r.height);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h};}
 function request(){if(!S.raf)S.raf=requestAnimationFrame(draw);}

 function poly(pts){ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();}
 function draw(){
  S.raf=0;if(!canvas||!active()||!S.data)return;
  const shown=canvas.getBoundingClientRect();if(!shown.width||!shown.height)return;
  const {w,h}=size(),L=layout(w,h),now=performance.now();
  ctx.clearRect(0,0,w,h);
  if(S.style==='pro'){drawPro(w,h,now);return;}
  // Stage: the viewport colour with a soft pool of light behind the bars.
  ctx.fillStyle=css('--viewport');ctx.fillRect(0,0,w,h);
  if(document.documentElement.dataset.theme!=='light'){const glow=ctx.createRadialGradient(L.bars.x+L.bars.w*.5,L.bars.y+L.bars.h*.55,10,L.bars.x+L.bars.w*.5,L.bars.y+L.bars.h*.55,Math.max(L.bars.w,L.bars.h)*.7);
  glow.addColorStop(0,'rgba(255,255,255,.035)');glow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);}
  S.hits={bars:[],donuts:[]};
  let animating=false;
  animating=drawBars(L.bars,now)||animating;
  [['Status mix',S.data.status,'job cards'],['Timing completeness',S.data.timing,'active jobs']].forEach(([title,slices,unit],d)=>{animating=drawDonut(L.donuts[d],slices,title,unit,d,now)||animating;});
  // Divider between the bar stage and the donut column.
  ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=1;ctx.beginPath();if(L.donuts[0].x>0){ctx.moveTo(L.donuts[0].x+.5,10);ctx.lineTo(L.donuts[0].x+.5,h-10);}else{ctx.moveTo(10,L.donuts[0].y+.5);ctx.lineTo(w-10,L.donuts[0].y+.5);}ctx.stroke();
  placeTip();
  if(animating)request();
 }

 function drawBars(R,now){
  const {rows,w:win}=S.data,show=win.show||{};
  const totals=rows.map(r=>S.metric==='people'?r.people:(show.setup!==false?r.setup:0)+(show.event!==false?r.event:0));
  const top=C.niceMax(Math.max(1,...totals)),weeks=Math.max(1,C.gridColumns(rows,S.metric,show,1).weeks),height=clamp(1.9+weeks*.45,2.4,4.6),scale=height/top;
  const grid=C.gridColumns(rows,S.metric,show,scale);
  const cam=C.fitCamera(S.view,{x0:-1.2,x1:7.6,y0:-.75,y1:weeks,z1:height},R.w,R.h,{top:84,right:24,bottom:18,left:14});
  const P=p=>{const q=C.project(p,cam,R.w,R.h);return {x:q.x+R.x,y:q.y+R.y,depth:q.depth};};
  const dark=document.documentElement.dataset.theme!=='light',text=css('--vp-text'),dim=css('--vp-text-dim'),font=css('--font'),fs=parseFloat(css('--fs'))||11,accent=css('--accent');
  const today=todayISO();let animating=false;
  const cols=grid.cols.map(c=>{
   const p=S.anim?ease((now-S.anim-c.i*26)/650):1;if(p<1)animating=true;
   return Object.assign({},c,{segs:c.segs.map(s=>Object.assign({},s,{z0:s.z0*p,z1:s.z1*p})),top:c.top*p,p});
  });
  ctx.save();
  ctx.beginPath();ctx.rect(R.x,R.y,R.w,R.h);ctx.clip();
  // Floor: the week grid, each day of the window as a tile; today in the accent.
  poly([P([0,0,0]),P([7,0,0]),P([7,weeks,0]),P([0,weeks,0])]);ctx.fillStyle=dark?'rgba(0,0,0,.18)':'rgba(0,0,0,.08)';ctx.fill();
  for(const c of cols){
   const t=[P([c.x0-.1,c.y0-.1,0]),P([c.x1+.1,c.y0-.1,0]),P([c.x1+.1,c.y1+.1,0]),P([c.x0-.1,c.y1+.1,0])];poly(t);
   if(c.iso===today){ctx.fillStyle=tone(accent,0,.22);ctx.fill();ctx.lineWidth=1.25;ctx.strokeStyle=accent;ctx.stroke();}
   else{ctx.fillStyle=dark?'rgba(255,255,255,.04)':'rgba(255,255,255,.18)';ctx.fill();}
  }
  // Back wall with the value grid (only when it is behind the bars).
  if(C.eyeDirection(cam)[1]<0){
   poly([P([0,weeks,0]),P([7,weeks,0]),P([7,weeks,height]),P([0,weeks,height])]);ctx.fillStyle=dark?'rgba(255,255,255,.025)':'rgba(255,255,255,.08)';ctx.fill();
   ctx.font=`${fs}px ${font}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineWidth=1;
   for(const v of C.ticks(top)){const z=v*scale,a=P([0,weeks,z]),b=P([7,weeks,z]);ctx.strokeStyle=v?(dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.1)'):(dark?'rgba(255,255,255,.16)':'rgba(0,0,0,.2)');ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle=dim;ctx.fillText(String(v),b.x+6,b.y);}
  }
  // Weekday names along the front edge, week-of dates down the left side.
  const lead=grid.lead||0,firstMonday=rows.length?DviAnalytics.add(rows[0].iso,-lead):today,colPx=Math.abs(P([1,0,0]).x-P([0,0,0]).x);
  ctx.textBaseline='middle';ctx.font=`${fs}px ${font}`;ctx.fillStyle=dim;ctx.textAlign='center';
  for(let col=0;col<7;col++){const a=P([col+.5,-.42,0]),d=DviAnalytics.add(firstMonday,col);ctx.fillText(fmtDay(d,colPx>=34?{weekday:'short'}:{weekday:'narrow'}),a.x,a.y);}

  // Soft contact shadows.
  for(const c of cols){if(!c.top)continue;const g=.06;poly([P([c.x0+g,c.y0+g,0]),P([c.x1+g*3,c.y0+g,0]),P([c.x1+g*3,c.y1+g*3,0]),P([c.x0+g,c.y1+g*3,0])]);ctx.fillStyle=dark?'rgba(0,0,0,.3)':'rgba(0,0,0,.16)';ctx.fill();}
  // Columns far to near; segments bottom to top; lit from the upper left.
  const colour={setup:css('--setup'),event:css('--event'),people:css('--crew')};
  const order=cols.map(c=>({c,d:P([(c.x0+c.x1)/2,(c.y0+c.y1)/2,0]).depth})).sort((a,b)=>b.d-a.d).map(o=>o.c);
  const sel=S.focus&&S.focus.group===0?S.focus.index:-1,hov=S.hover&&S.hover.group===0?S.hover.index:-1;
  S.hits.bars=[];
  for(const c of order){
   const hits=[];
   if(c.i===sel||c.i===hov){poly([P([c.x0-.12,c.y0-.12,0]),P([c.x1+.12,c.y0-.12,0]),P([c.x1+.12,c.y1+.12,0]),P([c.x0-.12,c.y1+.12,0])]);ctx.lineWidth=c.i===sel?2:1.25;ctx.strokeStyle=accent;ctx.stroke();}
   c.segs.forEach((s,k)=>{
    const last=k===c.segs.length-1,base=colour[s.kind]||css('--event'),lift=(c.i===hov||c.i===sel)?.1:0;
    for(const f of C.boxFaces(c.x0,c.x1,c.y0,c.y1,s.z0,s.z1,cam)){
     if(f.face==='top'&&!last)continue;
     const q=f.pts.map(P);poly(q);hits.push(q);
     if(f.face==='top')ctx.fillStyle=tone(base,.26+lift);
     else if(f.face==='front'||f.face==='back'){const g=ctx.createLinearGradient(0,Math.min(...q.map(p=>p.y)),0,Math.max(...q.map(p=>p.y)));g.addColorStop(0,tone(base,.06+lift));g.addColorStop(1,tone(base,-.22+lift));ctx.fillStyle=g;}
     else ctx.fillStyle=tone(base,(f.face==='left'?-.16:-.3)+lift);
     ctx.fill();ctx.lineWidth=.75;ctx.strokeStyle='rgba(0,0,0,.35)';ctx.stroke();
     if(f.face==='top'){ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.moveTo(q[0].x,q[0].y);ctx.lineTo(q[1].x,q[1].y);ctx.stroke();}
    }
   });
   hits.push([P([c.x0-.1,c.y0-.1,0]),P([c.x1+.1,c.y0-.1,0]),P([c.x1+.1,c.y1+.1,0]),P([c.x0-.1,c.y1+.1,0])]);
   S.hits.bars.push({i:c.i,polys:hits,top:P([(c.x0+c.x1)/2,(c.y0+c.y1)/2,c.top])});
  }
  // Values above the bars.
  ctx.textAlign='center';ctx.font=`600 ${fs}px ${font}`;ctx.fillStyle=text;ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=3;
  for(const c of order)if(c.total&&c.p>.98&&colPx>=16){const t=P([(c.x0+c.x1)/2,(c.y0+c.y1)/2,c.top]);ctx.fillText(String(c.total),t.x,t.y-10);}
  ctx.shadowBlur=0;
  // Week-of dates down the left side and today's date, drawn last so bars never hide them.
  ctx.font=`${fs}px ${font}`;ctx.textAlign='right';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle=css('--viewport');
  for(let wk=0;wk<weeks;wk++){const a=P([-.3,weeks-1-wk+.5,0]),s=fmtDay(DviAnalytics.add(firstMonday,wk*7),{day:'numeric',month:'short'});ctx.strokeText(s,a.x,a.y);ctx.fillStyle=dim;ctx.fillText(s,a.x,a.y);}
  const now0=cols.find(c=>c.iso===today);
  if(now0){const t0=P([(now0.x0+now0.x1)/2,(now0.y0+now0.y1)/2,now0.top]),a={x:t0.x,y:t0.y-(now0.total&&now0.p>.98?28:12)},n='Today';ctx.font=`600 ${fs-1}px ${font}`;const tw=ctx.measureText(n).width+10;ctx.fillStyle=accent;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(a.x-tw/2,a.y-7,tw,14,3);else ctx.rect(a.x-tw/2,a.y-7,tw,14);ctx.fill();ctx.fillStyle=css('--accent-ink');ctx.textAlign='center';ctx.fillText(n,a.x,a.y+.5);}
  ctx.restore();
  S.hits.barsRect=R;S.cam=cam;
  return animating;
 }

 function drawDonut(cell,slices,title,unit,d,now){
  const dark=document.documentElement.dataset.theme!=='light',text=css('--vp-text'),dim=css('--vp-text-dim'),font=css('--font'),fs=parseFloat(css('--fs'))||11,bg=css('--viewport'),edge=dark?bg:'rgba(255,255,255,.85)';
  const total=slices.reduce((a,s)=>a+s.count,0),k=.5,legendRight=cell.w>=330,legendW=legendRight?clamp(cell.w*.44,140,210):0;
  const R=legendRight?Math.max(30,Math.min((cell.w-legendW-48)/2,(cell.h-64)/(2*k+.2)*.95,118)):Math.max(30,Math.min(cell.w*.36,(cell.h-64)*.3,92));
  const T=Math.max(8,R*.2),r=R*.56;
  const cx=legendRight?cell.x+20+R:cell.x+cell.w/2,cy=legendRight?cell.y+40+(cell.h-40)/2-T/2:cell.y+50+R*k;
  ctx.save();
  ctx.font=`600 ${fs}px ${font}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=text;ctx.fillText(title,cell.x+14,cell.y+18);
  const sub=total?`${total} ${unit}`:`No ${unit}`,titleW=ctx.measureText(title).width;ctx.font=`${fs}px ${font}`;ctx.fillStyle=dim;
  if(cell.x+14+titleW+16+ctx.measureText(sub).width<=cell.x+cell.w-8)ctx.fillText(sub,cell.x+14+titleW+16,cell.y+18);else ctx.fillText(sub,cell.x+14,cell.y+34);
  const g={cx,cy,R,r,k,T};
  const p=S.anim?ease((now-S.anim-120)/900):1;
  const focusKey=S.focus&&S.focus.group===d+1?S.focus.key:null,hoverKey=S.hover&&S.hover.group===d+1?S.hover.key:null,exploded=focusKey||hoverKey;
  const arcs=C.pieAngles(slices,S.rot[d],p).map(a=>{const e=a.key===exploded?R*.09:0;return Object.assign(a,{ox:Math.cos(a.mid)*e,oy:Math.sin(a.mid)*e*k,colour:css(a.token)||'#888'});});
  // Floor shadow.
  const sh=ctx.createRadialGradient(cx,cy+T+R*k*.15,R*.2,cx,cy+T+R*k*.15,R*1.15);sh.addColorStop(0,dark?'rgba(0,0,0,.42)':'rgba(0,0,0,.22)');sh.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(cx,cy+T+R*k*.15,R*1.15,R*k*1.15,0,0,Math.PI*2);ctx.fill();
  if(!total){
   ctx.strokeStyle=dark?'rgba(255,255,255,.18)':'rgba(0,0,0,.25)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
   for(const rad of [R,r]){ctx.beginPath();ctx.ellipse(cx,cy,rad,rad*k,0,0,Math.PI*2);ctx.stroke();}
   ctx.setLineDash([]);ctx.restore();S.hits.donuts[d]={g,arcs:[],legend:[]};return false;
  }
  const STEP=Math.PI/90,pt=(a,rad,ox,oy,dz)=>({x:cx+ox+Math.cos(a)*rad,y:cy+oy+Math.sin(a)*rad*k+(dz||0)});
  const LIGHT=Math.PI*.7;
  // 1. Inner walls on the far side (seen through the hole).
  for(const a of arcs){for(let t=a.a0;t<a.a1;t+=STEP){const t1=Math.min(a.a1,t+STEP),m=(t+t1)/2;if(Math.sin(m)>=0)continue;const q=[pt(t,r,a.ox,a.oy),pt(t1,r,a.ox,a.oy),pt(t1,r,a.ox,a.oy,T),pt(t,r,a.ox,a.oy,T)];poly(q);ctx.fillStyle=tone(a.colour,-.42+.12*Math.cos(m-LIGHT));ctx.fill();}}
  // 2. Slices back to front (the exploded one last): end caps, front outer wall, top.
  const order=arcs.slice().sort((x,y)=>(x.key===exploded)-(y.key===exploded)||Math.sin(x.mid)-Math.sin(y.mid));
  for(const a of order){
   for(const [ang,vis] of [[a.a0,Math.cos(a.a0)<0],[a.a1,Math.cos(a.a1)>0]]){if(!vis||a.a1-a.a0<1e-4)continue;poly([pt(ang,r,a.ox,a.oy),pt(ang,R,a.ox,a.oy),pt(ang,R,a.ox,a.oy,T),pt(ang,r,a.ox,a.oy,T)]);ctx.fillStyle=tone(a.colour,-.34);ctx.fill();}
   for(let t=a.a0;t<a.a1;t+=STEP){const t1=Math.min(a.a1,t+STEP),m=(t+t1)/2;if(Math.sin(m)<=0)continue;const q=[pt(t,R,a.ox,a.oy),pt(t1,R,a.ox,a.oy),pt(t1,R,a.ox,a.oy,T),pt(t,R,a.ox,a.oy,T)];poly(q);ctx.fillStyle=tone(a.colour,-.28+.2*Math.cos(m-LIGHT));ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.6;ctx.stroke();}
   ctx.beginPath();ctx.ellipse(cx+a.ox,cy+a.oy,R,R*k,0,a.a0,a.a1);ctx.ellipse(cx+a.ox,cy+a.oy,r,r*k,0,a.a1,a.a0,true);ctx.closePath();
   const tg=ctx.createLinearGradient(cx-R,cy-R*k,cx+R,cy+R*k);tg.addColorStop(0,tone(a.colour,.24));tg.addColorStop(1,tone(a.colour,.02));ctx.fillStyle=tg;ctx.fill();
   ctx.lineWidth=dark?1.5:1;ctx.strokeStyle=edge;ctx.stroke();
   if(a.key===exploded){ctx.lineWidth=1.5;ctx.strokeStyle=css('--accent');ctx.stroke();}
  }
  // Centre: total.
  ctx.textAlign='center';ctx.fillStyle=text;ctx.font=`600 ${Math.round(fs*1.35)}px ${font}`;ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=3;ctx.fillText(String(total),cx,cy+1);ctx.shadowBlur=0;
  // Legend with counts and whole-number percentages.
  const rowH=Math.max(18,fs*1.75),legend=[];
  let lx,ly;if(legendRight){lx=cx+R+26;ly=cy-(arcs.length*rowH)/2+rowH/2;}else{lx=cell.x+14;ly=cy+R*k+T+18;}
  const lw=legendRight?cell.x+cell.w-12-lx:Math.min(cell.w-28,260);
  ctx.font=`${fs}px ${font}`;const pctW=ctx.measureText('100%').width;ctx.font=`600 ${fs}px ${font}`;const countW=Math.max(...arcs.map(a=>ctx.measureText(String(a.count)).width));
  const countRight=lx+lw-pctW-8,labelMax=Math.max(20,countRight-countW-10-(lx+16));
  // Long labels are shortened with an ellipsis instead of running into the numbers.
  const fit=s=>{ctx.font=`${fs}px ${font}`;if(ctx.measureText(s).width<=labelMax)return s;let t=s;while(t.length>1&&ctx.measureText(t+'…').width>labelMax)t=t.slice(0,-1);return t+'…';};
  ctx.textBaseline='middle';
  arcs.forEach((a,i)=>{
   const y=ly+i*rowH;if(y>cell.y+cell.h-6)return;
   const on=a.key===exploded;
   if(on){ctx.fillStyle=dark?'rgba(255,255,255,.07)':'rgba(0,0,0,.08)';ctx.fillRect(lx-6,y-rowH/2+1,lw+6,rowH-2);}
   ctx.fillStyle=a.colour;
   if(a.symbol==='normal'){ctx.beginPath();ctx.arc(lx+5,y,4.5,0,Math.PI*2);ctx.fill();}
   else if(a.symbol==='off'){ctx.beginPath();ctx.arc(lx+5,y,2.5,0,Math.PI*2);ctx.fill();}
   else ctx.fillRect(lx+1,y-4,8,8);
   if(!dark){ctx.lineWidth=1;ctx.strokeStyle=text;if(a.symbol==='normal'||a.symbol==='off'){ctx.beginPath();ctx.arc(lx+5,y,a.symbol==='off'?3:5,0,Math.PI*2);ctx.stroke();}else ctx.strokeRect(lx+.5,y-4.5,9,9);}
   ctx.textAlign='left';ctx.fillStyle=on||!dark?text:(css('--text-2')||text);const shown=fit(a.label);ctx.font=`${fs}px ${font}`;ctx.fillText(shown,lx+16,y);
   ctx.textAlign='right';ctx.fillStyle=text;ctx.font=`600 ${fs}px ${font}`;ctx.fillText(String(a.count),countRight,y);
   ctx.fillStyle=dim;ctx.font=`${fs}px ${font}`;ctx.fillText(a.pct+'%',lx+lw,y);
   legend.push({key:a.key,x:lx-6,y:y-rowH/2,w:lw+6,h:rowH});
  });
  ctx.restore();
  S.hits.donuts[d]={g,arcs,legend,cell};
  return p<1;
 }

 // =====================================================================================
 // PRO STYLE ("boardroom"). A headline band of large numerals compared with the previous
 // period, the skyline on a polished plinth (satin-metal columns, soft cast shadows, floor
 // reflections, a fine value grid on two walls, week subtotals beside the week-of dates),
 // machined donut rings with shape-marked legends, and a "Load by client" card. It reads the
 // same S.data and fills the same S.hits as Classic, so tooltips, clicks, keys and the text
 // alternative keep working. Every figure drawn is also listed in #vpList.
 // =====================================================================================
 const DONUT_K=.46,PAD=.16,TH=.2,STRETCH=1.3,TAU=Math.PI*2;
 const rgbStr=c=>`rgb(${c[0]},${c[1]},${c[2]})`,rgbaStr=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
 const shade=(c,amount)=>{const t=amount<0?0:255,p=Math.min(1,Math.abs(amount));return c.map(v=>Math.round(v+(t-v)*p));};
 function clientOf(j){const c=(state.clients||[]).find(x=>x.id===j.clientId);return c?{key:c.id,name:c.name}:null;}
 const clientLabel=r=>r.other?`Other · ${r.count} clients`:r.key?r.name:'No client on record';
 const shownClients=()=>S.shown||C.foldRows((S.data&&S.data.clients)||[],4);
 // How many client rows fit is only known once the card is drawn, so the text alternative gets
 // the folded "Other" row's figures then (every figure drawn is also in #vpList).
 const otherNote=()=>'<span data-other-note></span>';
 function syncOtherNote(rows){
  const el=document.querySelector('#vpList [data-other-note]');if(!el)return;const o=(rows||[]).find(r=>r.other),pl=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const t=o?` (shown on the chart as Other · ${o.count} clients: ${pl(o.total,'job-day')} (${o.setup} setup, ${o.event} event), ${pl(o.cards,'job card')}, ${o.people} ${o.people===1?'person':'people'})`:'';
  if(el.textContent!==t)el.textContent=t;
 }
 const MD={day:'numeric',month:'short'};
 // Satin-metal tones for one colour, worked out once per theme: [resting, lifted (hover/focus)].
 // Each side face gets five stops across its width (a soft specular streak toward the light).
 function material(c){
  const make=b=>{const side={};
   for(const [face,t,k,u] of [['front',.03,.17,.22],['left',-.08,.1,.8],['right',-.25,.07,.16],['back',-.3,.05,.5]])side[face]={u,flat:shade(b,t),stops:[t-.06,t,t+k,t+.01,t-.1].map(v=>rgbStr(shade(b,v)))};
   return {side,top0:rgbStr(shade(b,.38)),top1:rgbStr(shade(b,.16)),bar0:rgbStr(shade(b,.16)),bar1:rgbStr(shade(b,-.2)),cap:rgbStr(shade(b,-.34)),lid:rgbStr(shade(b,.4))};};
  return [make(c),make(shade(c,.12))];
 }
 // Theme palette, read once and reused until the theme, accent, scale or data changes. Data
 // colours are the app's own tokens: status slices, timing (Astro, fixed) and the Setup / Event /
 // People keys are exact, so they match the outliner, the header toggles and the dope sheet. Only
 // the column metal in the dark theme is calmed a little. Cards are smoked glass in the dark
 // theme and light frosted panels in the light theme (like the light theme's own panels), so
 // the deeper light-theme status colours keep their depth instead of washing out.
 function proPalette(){
  if(S.pal)return S.pal;
  const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue(n).trim(),dark=document.documentElement.dataset.theme!=='light';
  const u=clamp(parseFloat(v('--ui-scale'))||1,.8,1.6),exact=t=>rgb(v(t));
  const bg=rgb(v('--viewport')),floor=shade(bg,dark?-.46:-.42),glass=dark?shade(bg,-.2):[214,214,214];
  const status={};for(const k in C.STATUS_TOKENS)status[C.STATUS_TOKENS[k]]=exact(C.STATUS_TOKENS[k]);
  for(const t of ['--status-normal','--status-caution','--status-off'])status[t]=exact(t);
  const setup=exact('--setup'),event=exact('--event'),people=exact('--crew'),metal=c=>dark?C.mute(c,.16):c;
  // Ring surfaces: the status colours as they are; the Astro timing colours (signal lime and
  // yellow, made for small status lamps) are calmed on the large ring faces and their share bars,
  // same hue, so a big lime half-ring does not shout. Legend marks keep the exact Astro tokens.
  const ring=Object.assign({},status);for(const t of ['--status-normal','--status-caution'])ring[t]=shade(C.mute(status[t],.5),dark?-.2:-.18);
  S.pal={dark,u,fs:Math.round(11*u),cap:Math.max(10,Math.round(10*u)),bg,glass,floor,ring,text:v('--vp-text'),dim:v('--vp-text-dim'),
   cardText:dark?v('--vp-text'):'#1a1a1a',cardDim:dark?v('--vp-text-dim'):'#404040',hair:dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.13)',track:dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.13)',
   hilite:dark?'rgba(255,255,255,.08)':'rgba(255,255,255,.55)',edge:dark?'':(v('--status-edge')||'rgba(0,0,0,.55)'),
   font:v('--font'),accent:v('--accent'),accentInk:v('--accent-ink'),setup,event,people,status,
   mat:{setup:material(metal(setup)),event:material(metal(event)),people:material(metal(people))}};
  return S.pal;
 }
 const seg=(a,b)=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
 function roundBox(x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);}
 const tracked=on=>{if('letterSpacing' in ctx)ctx.letterSpacing=on?'0.6px':'0px';};
 function capsWidth(s,P,size){ctx.font=`600 ${size||P.cap}px ${P.font}`;tracked(true);const w=ctx.measureText(String(s).toUpperCase()).width;tracked(false);return w;}
 function capsText(s,x,y,P,align,size){ctx.font=`600 ${size||P.cap}px ${P.font}`;tracked(true);ctx.textAlign=align||'left';const t=String(s).toUpperCase();ctx.fillText(t,x,y);const w=ctx.measureText(t).width;tracked(false);return w;}
 // Change against the previous period: a neutral shape (triangle up, triangle down, equals),
 // never colour alone. (x, y) = left edge and vertical centre; s = size.
 function changeMark(x,y,dir,s,col){
  ctx.fillStyle=col;ctx.strokeStyle=col;ctx.beginPath();
  if(dir==='up'){ctx.moveTo(x,y+s*.42);ctx.lineTo(x+s,y+s*.42);ctx.lineTo(x+s/2,y-s*.48);ctx.closePath();ctx.fill();}
  else if(dir==='down'){ctx.moveTo(x,y-s*.42);ctx.lineTo(x+s,y-s*.42);ctx.lineTo(x+s/2,y+s*.48);ctx.closePath();ctx.fill();}
  else{ctx.lineWidth=1.4;ctx.moveTo(x,y-s*.2);ctx.lineTo(x+s,y-s*.2);ctx.moveTo(x,y+s*.2);ctx.lineTo(x+s,y+s*.2);ctx.stroke();}
 }
 // Shape marks for legends, so no slice is told apart by colour alone: job statuses each get
 // their own shape; timing keeps the Astro symbols used across the app (normal = circle,
 // caution = square, off = small circle).
 const SHAPES={Draft:'ring',Scheduled:'square',Setup:'triangle','In Progress':'diamond',Completed:'circle',Cancelled:'cross',normal:'circle',caution:'square',off:'dot'};
 function shapeMark(kind,x,y,s,col,edge){
  const h=s/2;ctx.beginPath();
  if(kind==='ring'){ctx.arc(x,y,h-1,0,TAU);ctx.lineWidth=2.2;ctx.strokeStyle=col;ctx.stroke();return;}
  if(kind==='cross'){ctx.lineCap='round';ctx.moveTo(x-h*.72,y-h*.72);ctx.lineTo(x+h*.72,y+h*.72);ctx.moveTo(x+h*.72,y-h*.72);ctx.lineTo(x-h*.72,y+h*.72);ctx.lineWidth=2.4;ctx.strokeStyle=col;ctx.stroke();ctx.lineCap='butt';return;}
  if(kind==='circle')ctx.arc(x,y,h,0,TAU);
  else if(kind==='dot')ctx.arc(x,y,h*.62,0,TAU);
  else if(kind==='triangle'){ctx.moveTo(x,y-h);ctx.lineTo(x+h*1.05,y+h*.8);ctx.lineTo(x-h*1.05,y+h*.8);ctx.closePath();}
  else if(kind==='diamond'){ctx.moveTo(x,y-h*1.1);ctx.lineTo(x+h*1.1,y);ctx.lineTo(x,y+h*1.1);ctx.lineTo(x-h*1.1,y);ctx.closePath();}
  else ctx.rect(x-h*.85,y-h*.85,h*1.7,h*1.7);
  ctx.fillStyle=col;ctx.fill();if(edge){ctx.lineWidth=1;ctx.strokeStyle=edge;ctx.stroke();}
 }
 // Card: smoked glass (dark theme) or a light frosted panel (light theme), a hairline rim and a
 // soft sheen along the top edge.
 function proCard(r,P){
  const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h);
  if(P.dark){g.addColorStop(0,'rgba(0,0,0,.26)');g.addColorStop(1,'rgba(0,0,0,.15)');}else{g.addColorStop(0,'rgba(222,222,222,.96)');g.addColorStop(1,'rgba(206,206,206,.96)');}
  roundBox(r.x+.5,r.y+.5,r.w-1,r.h-1,4);ctx.fillStyle=g;ctx.fill();
  if(P.dark){const gl=ctx.createLinearGradient(r.x,r.y,r.x+r.w*.45,r.y+Math.min(r.h,r.w*.5));gl.addColorStop(0,'rgba(255,255,255,.05)');gl.addColorStop(.5,'rgba(255,255,255,.012)');gl.addColorStop(.5,'rgba(255,255,255,0)');gl.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gl;ctx.fill();}
  ctx.lineWidth=1;ctx.strokeStyle=P.dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.28)';ctx.stroke();
  const s=ctx.createLinearGradient(r.x,0,r.x+r.w,0);s.addColorStop(0,'rgba(255,255,255,0)');s.addColorStop(.3,P.dark?'rgba(255,255,255,.28)':'rgba(255,255,255,.9)');s.addColorStop(1,'rgba(255,255,255,0)');
  ctx.strokeStyle=s;ctx.beginPath();ctx.moveTo(r.x+5,r.y+1.5);ctx.lineTo(r.x+r.w-5,r.y+1.5);ctx.stroke();
 }
 // Card title with a right-aligned summary; subs = the summary from longest to shortest form.
 function cardTitle(cell,title,subs,P){
  const u=P.u,y=cell.y+Math.round(16*u),x0=cell.x+Math.round(12*u),x1=cell.x+cell.w-Math.round(12*u);
  ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=`600 ${P.fs}px ${P.font}`;ctx.fillStyle=P.cardText;ctx.fillText(title,x0,y);const tw=ctx.measureText(title).width;
  ctx.textAlign='right';ctx.font=`${P.fs}px ${P.font}`;ctx.fillStyle=P.cardDim;
  for(const s of [].concat(subs))if(x0+tw+14*u+ctx.measureText(s).width<=x1){ctx.fillText(s,x1,y);break;}
  ctx.strokeStyle=P.hair;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,cell.y+Math.round(28*u)+.5);ctx.lineTo(x1,cell.y+Math.round(28*u)+.5);ctx.stroke();
 }

 // Skyline geometry that does not depend on the camera: axis top, weeks, column height (Classic's
 // rule, made 1.3x taller so the hero fills its region without pencil-thin towers), the world
 // bounds, the projected aspect at the default view and the pixel room its labels need.
 function skyGeometry(P,stageW){
  const {rows,w:win}=S.data,show=win.show||{},u=P.u;
  const top=C.skyTop(rows,S.metric,show),weeks=Math.max(1,C.gridColumns(rows,S.metric,show,1).weeks),height=clamp(1.9+weeks*.45,2.4,4.6)*STRETCH;
  const bounds={x0:-PAD,x1:7+PAD,y0:-1.0,y1:weeks+PAD,z1:height},view=C.proView(S.view,weeks,DEFAULT_VIEW,stageW<640);
  // Small stages keep the week figure but leave its change to the text list, so the skyline keeps its size.
  const roomy=stageW>=640,weekMode=roomy?2:1,caption=true,weekW=Math.max(0,...(S.data.weeks||[]).map(k=>weekLabel(k,P,weekMode).w));
  ctx.font=`${P.fs}px ${P.font}`;const figW=Math.max(capsWidth(S.metric==='people'?'People':'Job-days',P),ctx.measureText(String(top)).width+8);
  const aspect=C.boxAspect(view,bounds);
  return {top,weeks,height,bounds,view,weekW,weekMode,caption,figW,aspect,mx:Math.round(weekW+figW+40*u),my:Math.round(60*u)};
 }
 // Week label on the open side of the plinth: the first day of the week inside the window (a
 // part week also says how many of its days are in the window, e.g. "7 Nov (2d)"), then the
 // week's figure and its change against the same days of the previous period. mode 2 = all,
 // 1 = date and figure, 0 = date only; a change is never shown without its figure. size = font px.
 function weekLabel(k,P,mode,size){
  const u=P.u,fs=size||P.fs,small=Math.max(10,fs-1),font=P.font,date=fmtDay(k.from,MD),part=k.partial?`(${k.days}d)`:'',d=C.delta(k.total,k.prev),num=String(k.total),diff=d.diff?String(Math.abs(d.diff)):'';
  ctx.font=`${fs}px ${font}`;const dw=ctx.measureText(date).width;ctx.font=`${small}px ${font}`;const pw=part?ctx.measureText(part).width+3*u:0,fw=diff?ctx.measureText(diff).width:0;ctx.font=`600 ${fs}px ${font}`;const nw=ctx.measureText(num).width;
  const ms=Math.round(6*u),w=dw+pw+(mode>=1?8*u+nw:0)+(mode>=2?5*u+ms+(diff?2+fw:0):0);
  return {w,h:fs+2,draw(x,y){
   ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.dim;ctx.fillText(date,x,y);
   if(part){ctx.font=`${small}px ${font}`;ctx.fillText(part,x+dw+3*u,y);}
   if(mode<1)return;
   let at=x+dw+pw+8*u;ctx.font=`600 ${fs}px ${font}`;ctx.fillStyle=P.text;ctx.fillText(num,at,y);if(mode<2)return;
   at+=nw+5*u;changeMark(at,y,d.dir,ms,P.dim);at+=ms+2;if(diff){ctx.font=`${small}px ${font}`;ctx.fillStyle=P.dim;ctx.fillText(diff,at,y);}
  }};
 }
 // The column heading over the week labels names what the figures are.
 function weekHeading(mode){if(mode<1)return '';const what=S.metric==='people'?'peak people':'job-days';return mode>=2?`Week · ${what} · vs prev.`:`Week · ${what}`;}

 function drawPro(w,h,now){
  if(!S.data.totals||!S.data.clients||!S.data.head)build();   // the style changed while the charts were hidden
  const P=proPalette(),D=S.data,geo=skyGeometry(P,w);
  const L=C.proLayout(w,h,{status:D.status.length,timing:D.timing.length,clients:D.clients.length,aspect:geo.aspect,mx:geo.mx,my:geo.my,u:P.u});
  // Studio backdrop: the viewport colour, a faint key light on the skyline, darker corners.
  ctx.fillStyle=rgbStr(P.bg);ctx.fillRect(0,0,w,h);
  const bx=L.bars.x+L.bars.w/2,by=L.bars.y+L.bars.h*.5,vg=ctx.createRadialGradient(bx,by,10,bx,by,Math.max(w,h)*.8);
  if(P.dark){vg.addColorStop(0,'rgba(255,255,255,.05)');vg.addColorStop(.4,'rgba(255,255,255,0)');}else vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(.4,'rgba(0,0,0,0)');vg.addColorStop(1,P.dark?'rgba(0,0,0,.36)':'rgba(0,0,0,.22)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);
  S.hits={bars:[],donuts:[],clients:{rows:[],cell:L.clients}};S.layout=L;
  let animating=false;
  proHead(L.head,P);
  animating=proBars(L.bars,P,now,geo)||animating;
  const plan=C.donutPlan([L.status,L.timing],[D.status.length,D.timing.length],P.u);
  animating=proDonut(L.status,D.status,'Status mix','job cards',0,now,P,plan)||animating;
  animating=proDonut(L.timing,D.timing,'Timing completeness','active jobs',1,now,P,plan)||animating;
  animating=proClients(L.clients,P,now)||animating;
  placeTip();
  if(animating)request();
 }

 // Headline band: title, the measure and window, the comparison period stated once, then up to
 // six figures (large light numerals) each with its change against the previous period
 // (shape + number) and the previous value. One row from 640px; a 3 x 2 grid below, so a
 // phone never drops a figure. Setup / Event / People figures carry the colour key.
 function proHead(R,P){
  const D=S.data,cells=D.head,win=D.w,show=win.show||{},people=S.metric==='people',u=P.u,fs=P.fs,font=P.font,grid=R.w<500,compact=R.w<640,rd=Math.round;
  const x0=R.x+rd((grid?10:16)*u),x1=R.x+R.w-rd((grid?10:16)*u),ty=R.y+rd(22*u);
  ctx.save();ctx.textBaseline='alphabetic';ctx.textAlign='left';
  ctx.fillStyle=P.accent;ctx.fillRect(x0,ty-rd(11*u),2,rd(13*u));ctx.font=`600 ${fs+2}px ${font}`;ctx.fillStyle=P.text;ctx.fillText('Production load',x0+9,ty);const tw=ctx.measureText('Production load').width+9;
  const pw=D.prevWindow,range=`${fmtDay(win.start,MD)} – ${fmtDay(D.end,{day:'numeric',month:'short',year:'numeric'})}`,rangeShort=`${fmtDay(win.start,MD)} – ${fmtDay(D.end,MD)}`,prev=`${fmtDay(pw.start,MD)} – ${fmtDay(pw.end,MD)}`;
  const city=typeof zoneLabels==='function'?zoneLabels().city:'',basis=show.setup===false?' · event phases only':show.event===false?' · setup phases only':'';
  const measure=(people?'People assigned per day':'Job-days per day')+basis,fits=(s,room)=>ctx.measureText(s).width<=room;
  ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.dim;
  if(!grid){
   let right=[range,city].filter(Boolean).join('  ·  ');if(!fits(right,(x1-x0)*.4))right=range;if(!fits(right,(x1-x0)*.4))right=rangeShort;
   ctx.textAlign='right';ctx.fillText(right,x1,ty);ctx.textAlign='left';
   const room=x1-ctx.measureText(right).width-24-(x0+tw+12);
   for(const s of [`${measure}  ·  change vs ${prev}`,`${measure} · vs ${prev}`,`vs ${prev}`])if(fits(s,room)){ctx.fillText(s,x0+tw+12,ty);break;}
  }else{
   const room=x1-(x0+tw+12);for(const s of [range,rangeShort])if(fits(s,room)){ctx.textAlign='right';ctx.fillText(s,x1,ty);ctx.textAlign='left';break;}
   const y2=ty+rd(17*u);for(const s of [`${measure} · change vs ${prev}${city?' · '+city:''}`,`${measure} · change vs ${prev}`,`${measure} · vs ${prev}`,`vs ${prev}`])if(fits(s,x1-x0)){ctx.fillText(s,x0,y2);break;}
  }
  const cols=grid?3:Math.max(1,cells.length),cw=Math.min((x1-x0)/cols,grid?1e9:200*u),num=rd((grid||compact?20:23)*u),ms=rd(7*u);
  const yTop=grid?R.y+rd(70*u):R.y+R.h-rd((compact?20:23)*u),step=rd(44*u),labDy=rd(15*u);
  // Each cell: the figure, then its change against the previous period and the previous value.
  // Whether the previous value ("vs N") fits is decided once for the whole band, so every cell
  // reads the same way; when both periods are zero no change is marked at all.
  const part=cells.map((c,i)=>{
   const col=i%cols,x=x0+col*cw,right=x+cw-rd(16*u),vs=c.key==='peak'&&!c.value?'–':String(c.value);
   ctx.font=`300 ${num}px ${font}`;let at=x+ctx.measureText(vs).width;const of=c.of!=null?` / ${c.of}`:'';
   if(of){ctx.font=`${fs}px ${font}`;at+=1+ctx.measureText(of).width;}
   const d=C.delta(c.value,c.prev),diff=d.diff?String(Math.abs(d.diff)):'',was=`vs ${c.prev}`,none=!c.value&&!c.prev;
   ctx.font=`600 ${fs}px ${font}`;const dw=diff?ctx.measureText(diff).width+3:0;ctx.font=`${fs}px ${font}`;const ww=ctx.measureText(was).width;
   const g=rd(7*u);return {c,col,row:Math.floor(i/cols),x,right,vs,of,at,d,diff,was,dw,none,short:g+ms+3+dw,full:g+ms+3+dw+rd(5*u)+ww,g};
  });
  const showMark=part.every(p=>p.none||p.at+p.short<=p.right),showWas=showMark&&part.every(p=>p.none||p.at+p.full<=p.right);
  for(const p of part){
   const {c,col,row,x,right}=p,yNum=yTop+row*step,yLab=yNum+labDy;
   if(col){ctx.strokeStyle=P.dark?'rgba(255,255,255,.12)':'rgba(0,0,0,.14)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(rd(x-10*u)+.5,yNum-rd(18*u));ctx.lineTo(rd(x-10*u)+.5,yLab+3);ctx.stroke();}
   ctx.textAlign='left';ctx.font=`300 ${num}px ${font}`;ctx.fillStyle=P.text;ctx.fillText(p.vs,x,yNum);
   if(p.of){ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.dim;ctx.font=`300 ${num}px ${font}`;const vw=ctx.measureText(p.vs).width;ctx.font=`${fs}px ${font}`;ctx.fillText(p.of,x+vw+1,yNum);}
   if(showMark&&!p.none){
    let px=p.at+p.g;changeMark(px,yNum-num*.3,p.d.dir,ms,P.text);px+=ms+3;
    if(p.diff){ctx.font=`600 ${fs}px ${font}`;ctx.fillStyle=P.text;ctx.fillText(p.diff,px,yNum);px+=p.dw;}
    if(showWas){ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.dim;ctx.fillText(p.was,px+rd(5*u)-(p.diff?3:0),yNum);}
   }
   let lx=x;if(c.chip){const k=rd(7*u);ctx.fillStyle=rgbStr(P[c.chip]);ctx.fillRect(x,yLab-k,k,k);lx=x+k+rd(4*u);}
   ctx.fillStyle=P.dim;const label=c.short&&lx+capsWidth(c.label,P)>right?c.short:c.label,lw=capsText(label,lx,yLab,P,'left');
   // The peak day's date: the short form on narrow cells; left out when even that would reach the divider.
   if(c.key==='peak'&&c.value&&c.iso){ctx.font=`${Math.max(10,fs-1)}px ${font}`;for(const s of grid||compact?[fmtDay(c.iso,MD)]:[fmtDay(c.iso),fmtDay(c.iso,MD)])if(lx+lw+6+ctx.measureText(s).width<=right){ctx.fillText(s,lx+lw+6,yLab);break;}}
  }
  const rule=ctx.createLinearGradient(x0,0,x1,0);rule.addColorStop(0,'rgba(255,255,255,.16)');rule.addColorStop(.7,'rgba(255,255,255,.07)');rule.addColorStop(1,'rgba(255,255,255,0)');
  ctx.strokeStyle=rule;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,R.y+R.h-.5);ctx.lineTo(x1,R.y+R.h-.5);ctx.stroke();
  ctx.restore();
 }

 // Calendar skyline, Pro materials. Geometry and hit polygons are the Classic ones; the camera is
 // fitted to the plinth itself plus the exact pixel room its labels need, so the skyline fills
 // its region instead of floating in it.
 function proBars(R,P,now,geo){
  const {rows,w:win}=S.data,show=win.show||{},fs=P.fs,font=P.font,dark=P.dark,u=P.u;
  const {top,weeks,height,bounds}=geo,scale=height/top,view=C.proView(S.view,weeks,DEFAULT_VIEW,R.w<560);
  const grid=C.gridColumns(rows,S.metric,show,scale);
  // The far walls stand on the sides away from the eye. Value figures sit at the near end of
  // the side wall and week labels along the open side, where no column can cover them. In a top
  // view the walls would collapse into skewed strips, so they (and the scale) are left out.
  const eye=C.eyeDirection(view),wy=eye[1]<0?weeks:0,wx=eye[0]>=0?0:7,ox=wx===0?7:0,oy=wy===weeks?0:weeks,walls=view.pitch<70;
  const base={top:Math.round(46*u),right:8,bottom:Math.round(10*u),left:8},pre=C.fitCamera(view,bounds,R.w,R.h,base),pp=p=>C.project(p,pre,R.w,R.h);
  const wdir=pp([ox,weeks/2,0]).x>=pp([wx,weeks/2,0]).x?1:-1,dir=pp([wx,oy,height]).x<=pp([ox,wy,height]).x?-1:1;
  // The camera is fitted to the plinth plus the exact boxes its labels take (weekday names, week
  // labels and their heading, scale figures and caption), so the skyline is as large as it can be.
  const lineH=fs+2,gapPx=Math.round(8*u),edgeX=ox===7?7+PAD:-PAD,small=Math.max(10,fs-1),extras=[];
  const wdW=Math.max(...[0,1,2,3,4,5,6].map(i=>capsWidth(fmtDay(AN.add('2026-11-02',i),{weekday:'short'}),P)));
  for(let col=0;col<7;col++)extras.push({p:[col+.5,-.66,0],x0:-wdW/2,x1:wdW/2,y0:-lineH/2,y1:lineH/2});
  const weekRows=S.data.weeks||[],box=(wd,x0)=>wdir>0?{x0,x1:x0+wd}:{x0:-x0-wd,x1:-x0};
  ctx.font=`${small}px ${font}`;const headW=ctx.measureText(weekHeading(geo.weekMode)).width;
  weekRows.forEach((k,wk)=>extras.push(Object.assign({p:[edgeX,weeks-1-wk+.5,0],y0:-lineH/2,y1:lineH/2},box(geo.weekW,gapPx))));
  if(weekRows.length&&geo.weekMode>=1)extras.push(Object.assign({p:[edgeX,weeks-.5,0],y0:-lineH/2-lineH-3,y1:-lineH/2},box(headW,gapPx)));
  if(walls){
   const fx=dir>0?{x0:8,x1:8+geo.figW}:{x0:-8-geo.figW,x1:-8};
   for(const v of [0,top])extras.push(Object.assign({p:[wx,oy,v*scale],y0:-lineH/2-3,y1:lineH/2},fx));
   extras.push(Object.assign({p:[wx,oy,height],y0:-Math.round(15*u)-lineH/2,y1:-Math.round(15*u)+lineH/2},fx));
  }
  const cam=C.fitLabelled(view,bounds,R.w,R.h,base,extras);
  const Pj=p=>{const q=C.project(p,cam,R.w,R.h);return {x:q.x+R.x,y:q.y+R.y,depth:q.depth};},P0=(x,y)=>Pj([x,y,0]);
  const today=todayISO(),accent=P.accent,labelRects=[];let animating=false;
  const cols=grid.cols.map(c=>{
   const p=S.anim?ease((now-S.anim-c.i*26)/650):1;if(p<1)animating=true;
   return Object.assign({},c,{segs:c.segs.map(s=>Object.assign({},s,{z0:s.z0*p,z1:s.z1*p})),top:c.top*p,p});
  });
  const order=cols.map(c=>({c,d:Pj([(c.x0+c.x1)/2,(c.y0+c.y1)/2,0]).depth})).sort((a,b)=>b.d-a.d).map(o=>o.c);
  ctx.save();
  ctx.beginPath();ctx.rect(R.x,R.y,R.w,R.h);ctx.clip();ctx.lineJoin='round';
  // The plinth rests on the stage: a soft ground shadow under it.
  const baseQ=[[-PAD,-PAD],[7+PAD,-PAD],[7+PAD,weeks+PAD],[-PAD,weeks+PAD]].map(p=>Pj([p[0],p[1],-TH])),bxs=baseQ.map(p=>p.x),bys=baseQ.map(p=>p.y);
  const grx=Math.max(1,(Math.max(...bxs)-Math.min(...bxs))*.6),gry=Math.max(1,(Math.max(...bys)-Math.min(...bys))*.62);
  ctx.save();ctx.translate((Math.min(...bxs)+Math.max(...bxs))/2,(Math.min(...bys)+Math.max(...bys))/2+12);ctx.scale(1,gry/grx);
  const gs=ctx.createRadialGradient(0,0,grx*.4,0,0,grx);gs.addColorStop(0,dark?'rgba(0,0,0,.5)':'rgba(0,0,0,.32)');gs.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gs;ctx.beginPath();ctx.arc(0,0,grx,0,TAU);ctx.fill();ctx.restore();
  // Plinth: brushed-metal fascia (banded gradient along its length) with a bright top bevel.
  const F=P.floor;let floorQ=null;
  for(const f of C.boxFaces(-PAD,7+PAD,-PAD,weeks+PAD,-TH,0,cam)){
   const q=f.pts.map(Pj);if(f.face==='top'){floorQ=q;continue;}
   poly(q);const t=f.face==='front'||f.face==='left'?.12:-.06,g=ctx.createLinearGradient(q[0].x,q[0].y,q[1].x,q[1].y);
   for(const [o,v] of [[0,t],[.2,t+.13],[.42,t+.03],[.63,t+.11],[.85,t],[1,t+.07]])g.addColorStop(o,rgbStr(shade(F,v)));
   ctx.fillStyle=g;ctx.fill();
   const o=ctx.createLinearGradient(q[3].x,q[3].y,q[0].x,q[0].y);o.addColorStop(0,'rgba(255,255,255,.12)');o.addColorStop(.3,'rgba(0,0,0,0)');o.addColorStop(1,'rgba(0,0,0,.42)');ctx.fillStyle=o;ctx.fill();
   ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.32)';seg(q[2],q[3]);
  }
  // Far walls with the value grid (drawn behind everything that stands on the floor).
  const tk=C.niceTicks(top);
  const corner=Pj([wx,wy,height]),post=Pj([wx,oy,height]);
  if(walls){
   const wall=pts=>{const q=pts.map(Pj),ys=q.map(p=>p.y),g=ctx.createLinearGradient(0,Math.min(...ys),0,Math.max(...ys));
    if(dark){g.addColorStop(0,'rgba(255,255,255,.065)');g.addColorStop(1,'rgba(255,255,255,.015)');}else{g.addColorStop(0,'rgba(0,0,0,.03)');g.addColorStop(1,'rgba(0,0,0,.13)');}
    poly(q);ctx.fillStyle=g;ctx.fill();};
   wall([[0,wy,0],[7,wy,0],[7,wy,height],[0,wy,height]]);wall([[wx,0,0],[wx,weeks,0],[wx,weeks,height],[wx,0,height]]);
   ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.04)';
   for(let x=1;x<7;x++)seg(Pj([x,wy,0]),Pj([x,wy,height]));for(let y=1;y<weeks;y++)seg(Pj([wx,y,0]),Pj([wx,y,height]));
   for(const v of tk){const z=v*scale,a=Pj([wx,wy,z]),b=Pj([ox,wy,z]),s=Pj([wx,oy,z]);
    ctx.strokeStyle=v?'rgba(255,255,255,.11)':'rgba(255,255,255,.26)';seg(a,b);seg(a,s);
    if(v){ctx.strokeStyle='rgba(255,255,255,.3)';seg(s,{x:s.x+4*dir,y:s.y});}}
   ctx.strokeStyle='rgba(255,255,255,.14)';seg(Pj([wx,wy,0]),corner);seg(corner,Pj([ox,wy,height]));seg(corner,post);seg(post,Pj([wx,oy,0]));
  }
  // The value scale is only printed while its steps are at least a line of text apart.
  const stepPx=tk.length>1?Math.abs(Pj([wx,oy,tk[1]*scale]).y-Pj([wx,oy,0]).y):0,showScale=walls&&stepPx>=fs+3;
  ctx.textBaseline='middle';
  if(showScale&&geo.caption){
   const cap=S.metric==='people'?'People':'Job-days',capW=capsWidth(cap,P),cx=dir<0?Math.max(R.x+6+capW,post.x-8):Math.min(R.x+R.w-6-capW,post.x+8),cy=post.y-Math.round(15*u);
   ctx.fillStyle=P.dim;capsText(cap,cx,cy,P,dir<0?'right':'left');labelRects.push({x:dir<0?cx-capW:cx,y:cy-lineH/2,w:capW,h:lineH});
  }
  // Floor: polished dark surface, light pool, hairline day grid, a tile per day of the window
  // (today's tinted in the accent; no outline, which would peek out between columns as a stray stroke).
  if(floorQ){
   const far=Pj([3.5,weeks+PAD,0]),near=Pj([3.5,-PAD,0]),fg=ctx.createLinearGradient(far.x,far.y,near.x,near.y);
   fg.addColorStop(0,rgbStr(shade(F,.14)));fg.addColorStop(.55,rgbStr(F));fg.addColorStop(1,rgbStr(shade(F,-.14)));poly(floorQ);ctx.fillStyle=fg;ctx.fill();
   ctx.save();poly(floorQ);ctx.clip();
   const mid=Pj([3.2,weeks*.55,0]),pr=Math.hypot(near.x-far.x,near.y-far.y)*.8+70,pool=ctx.createRadialGradient(mid.x,mid.y,4,mid.x,mid.y,pr);
   pool.addColorStop(0,'rgba(255,255,255,.1)');pool.addColorStop(1,'rgba(255,255,255,0)');poly(floorQ);ctx.fillStyle=pool;ctx.fill();
   ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.05)';
   for(let x=0;x<=7;x++)seg(Pj([x,0,0]),Pj([x,weeks,0]));for(let y=0;y<=weeks;y++)seg(Pj([0,y,0]),Pj([7,y,0]));
   for(const c of cols){
    const y=weeks-1-c.week;poly([[c.col+.07,y+.07],[c.col+.93,y+.07],[c.col+.93,y+.93],[c.col+.07,y+.93]].map(p=>Pj([p[0],p[1],0])));
    if(c.iso===today){ctx.fillStyle=tone(accent,0,.3);ctx.fill();}
    else{ctx.fillStyle=c.col>=5?'rgba(255,255,255,.035)':'rgba(255,255,255,.085)';ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.09)';ctx.stroke();}
   }
   // Cast shadows, light from the upper front-left: each column throws a shadow to the back-right
   // with a soft edge (three widening layers, a penumbra), plus a tight contact shadow.
   for(const c of cols){
    if(!(c.top>0))continue;
    const len=Math.min(c.top*.5,1.3),dx=len*.62,dy=len*.78,mx=(c.x0+c.x1)/2,my=(c.y0+c.y1)/2,a=Pj([mx,my,0]),b=Pj([mx+dx*1.15,my+dy*1.15,0]);
    for(const [grow,alpha] of [[.16,.13],[.08,.17],[0,.26]]){
     const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y);g.addColorStop(0,`rgba(0,0,0,${alpha})`);g.addColorStop(1,'rgba(0,0,0,0)');
     poly(C.shadowHull(c.x0-grow,c.x1+grow,c.y0-grow*.4,c.y1+grow,dx+grow,dy+grow).map(p=>Pj([p[0],p[1],0])));ctx.fillStyle=g;ctx.fill();
    }
    poly([[c.x0-.05,c.y0-.05],[c.x1+.05,c.y0-.05],[c.x1+.05,c.y1+.05],[c.x0-.05,c.y1+.05]].map(p=>Pj([p[0],p[1],0])));ctx.fillStyle='rgba(0,0,0,.28)';ctx.fill();
   }
   // Reflections: a faint, short mirror of each column's foot, fading out quickly (kept subtle so
   // it reads as a polished floor, not as ghost columns across the cell lines).
   const FADE=.7;
   for(const c of order)for(const s of c.segs){
    if(s.z0>=FADE||s.z1<=s.z0)continue;
    const zb=Math.min(s.z1,FADE),a0=.13*(1-s.z0/FADE),a1=.13*(1-zb/FADE),M=P.mat[s.kind][0];
    for(const f of C.boxFaces(c.x0,c.x1,c.y0,c.y1,-zb,-s.z0,cam)){
     if(f.face==='top')continue;
     const q=f.pts.map(Pj),g=ctx.createLinearGradient(q[3].x,q[3].y,q[0].x,q[0].y),col=M.side[f.face].flat;
     g.addColorStop(0,rgbaStr(col,a0));g.addColorStop(1,rgbaStr(col,a1));poly(q);ctx.fillStyle=g;ctx.fill();
    }
   }
   ctx.restore();
  }
  // Value figures at the near end of the side wall (the zero sits just outside the plinth corner).
  if(showScale){
   const edgeXs=P0(wx===0?-PAD:7+PAD,oy===0?-PAD:weeks+PAD).x;
   ctx.font=`${fs}px ${font}`;ctx.textBaseline='middle';ctx.textAlign=dir>0?'left':'right';ctx.fillStyle=P.dim;
   for(const v of tk){const s=Pj([wx,oy,v*scale]),x=(v?s.x:dir<0?Math.min(s.x,edgeXs):Math.max(s.x,edgeXs))+8*dir,y=v?s.y:s.y-3,tw=ctx.measureText(String(v)).width;ctx.fillText(String(v),x,y);labelRects.push({x:dir>0?x:x-tw,y:y-lineH/2,w:tw,h:lineH});}
  }
  // Weekday names along the front of the plinth.
  const lead=grid.lead||0,firstMonday=rows.length?AN.add(rows[0].iso,-lead):today,colPx=Math.abs(Pj([1,0,0]).x-Pj([0,0,0]).x);
  ctx.textBaseline='middle';ctx.fillStyle=P.dim;
  let dx0=Infinity,dx1=-Infinity,dy0=Infinity,dy1=-Infinity;
  for(let col=0;col<7;col++){
   const a=Pj([col+.5,-.66,0]),dd=AN.add(firstMonday,col);let tw;
   if(colPx>=34*u)tw=capsText(fmtDay(dd,{weekday:'short'}),a.x,a.y,P,'center');else{ctx.font=`${fs}px ${font}`;ctx.textAlign='center';const s=fmtDay(dd,{weekday:'narrow'});ctx.fillText(s,a.x,a.y);tw=ctx.measureText(s).width;}
   dx0=Math.min(dx0,a.x-tw/2);dx1=Math.max(dx1,a.x+tw/2);dy0=Math.min(dy0,a.y-lineH/2);dy1=Math.max(dy1,a.y+lineH/2);
  }
  labelRects.push({x:dx0,y:dy0,w:dx1-dx0,h:dy1-dy0});
  // Columns that stand in front of today's column, or of the selected or hovered day, and hide
  // its top (or its empty cell) are drawn see-through, so the marked day is never hidden and the
  // Today flag never seems to point at the column in front of it.
  const sel=S.focus&&S.focus.group===0?S.focus.index:-1,hov=S.hover&&S.hover.group===0?S.hover.index:-1,EDGE={front:[0,1],right:[1,2],back:[2,3],left:[3,0]};
  const centre=c=>P0((c.x0+c.x1)/2,(c.y0+c.y1)/2),targets=[],ghost=new Set(),hidden=new Set();
  for(const c of cols)if(c.iso===today||c.i===sel||c.i===hov)targets.push({c,pt:c.top>0?Pj([(c.x0+c.x1)/2,(c.y0+c.y1)/2,c.top]):centre(c),d:centre(c).depth});
  for(const T of targets)for(const c of cols){
   if(c===T.c||!(c.top>0)||centre(c).depth>=T.d)continue;
   if(C.boxFaces(c.x0,c.x1,c.y0,c.y1,0,c.top,cam).some(f=>C.pointInPolygon(T.pt.x,T.pt.y,f.pts.map(Pj)))){ghost.add(c.i);hidden.add(T.c.i);}
  }
  // Columns far to near. Each visible side face: a sheen across its width, then a vertical pass
  // (bright top edge, occlusion toward the floor); the top face catches the light; bevel glints.
  S.hits.bars=[];
  const depths=order.map(c=>centre(c).depth),dMin=Math.min(...depths),dSpan=Math.max(1e-6,Math.max(...depths)-dMin);
  order.forEach((c,oi)=>{
   // Aerial perspective: columns farther from the eye sit a little deeper in the shade.
   const hits=[],on=c.i===hov||c.i===sel,haze=on?0:.14*(depths[oi]-dMin)/dSpan,hazeFill=haze>.015?`rgba(0,0,0,${haze.toFixed(3)})`:null;
   let bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity;
   if(on){poly([P0(c.x0-.12,c.y0-.12),P0(c.x1+.12,c.y0-.12),P0(c.x1+.12,c.y1+.12),P0(c.x0-.12,c.y1+.12)]);ctx.lineWidth=c.i===sel?2:1.25;ctx.strokeStyle=accent;ctx.stroke();}
   ctx.save();if(ghost.has(c.i))ctx.globalAlpha=.3;
   c.segs.forEach((s,k)=>{
    const last=k===c.segs.length-1,M=P.mat[s.kind][on?1:0],faces=C.boxFaces(c.x0,c.x1,c.y0,c.y1,s.z0,s.z1,cam),seen=faces.map(f=>f.face);
    for(const f of faces){
     if(f.face==='top'&&!last)continue;
     const q=f.pts.map(Pj);poly(q);hits.push(q);for(const p of q){bx0=Math.min(bx0,p.x);bx1=Math.max(bx1,p.x);by0=Math.min(by0,p.y);by1=Math.max(by1,p.y);}
     if(f.face==='top'){
      const g=ctx.createLinearGradient(q[0].x,q[0].y,q[2].x,q[2].y);g.addColorStop(0,M.top0);g.addColorStop(1,M.top1);ctx.fillStyle=g;ctx.fill();
      if(hazeFill){ctx.fillStyle=hazeFill;ctx.fill();}
      ctx.lineWidth=1;
      for(const name in EDGE){const e=EDGE[name];ctx.strokeStyle=seen.includes(name)?'rgba(255,255,255,.55)':'rgba(255,255,255,.14)';seg(q[e[0]],q[e[1]]);}
      if(c.i===sel){poly(q);ctx.lineWidth=1.5;ctx.strokeStyle=accent;ctx.stroke();}
     }else{
      const m=M.side[f.face],uu=m.u,g=ctx.createLinearGradient(q[0].x,q[0].y,q[1].x,q[1].y);
      g.addColorStop(0,m.stops[0]);g.addColorStop(Math.max(0,uu-.12),m.stops[1]);g.addColorStop(uu,m.stops[2]);g.addColorStop(Math.min(1,uu+.16),m.stops[3]);g.addColorStop(1,m.stops[4]);
      ctx.fillStyle=g;ctx.fill();
      const o=ctx.createLinearGradient(q[3].x,q[3].y,q[0].x,q[0].y);o.addColorStop(0,'rgba(255,255,255,.16)');o.addColorStop(.1,'rgba(255,255,255,0)');o.addColorStop(.6,'rgba(0,0,0,0)');o.addColorStop(1,k?'rgba(0,0,0,.16)':'rgba(0,0,0,.3)');
      ctx.fillStyle=o;ctx.fill();
      if(hazeFill){ctx.fillStyle=hazeFill;ctx.fill();}
      if(k){ctx.lineWidth=1;ctx.strokeStyle='rgba(0,0,0,.42)';seg(q[0],q[1]);}
     }
    }
    // The upright edge between two lit faces catches a thin glint.
    const ex=seen.includes('right')?c.x1:seen.includes('left')?c.x0:null,ey=seen.includes('front')?c.y0:seen.includes('back')?c.y1:null;
    if(ex!=null&&ey!=null&&s.z1>s.z0){ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.26)';seg(Pj([ex,ey,s.z0]),Pj([ex,ey,s.z1]));}
   });
   ctx.restore();
   const foot=[P0(c.x0-.1,c.y0-.1),P0(c.x1+.1,c.y0-.1),P0(c.x1+.1,c.y1+.1),P0(c.x0-.1,c.y1+.1)];hits.push(foot);
   for(const p of foot){bx0=Math.min(bx0,p.x);bx1=Math.max(bx1,p.x);by0=Math.min(by0,p.y);by1=Math.max(by1,p.y);}
   S.hits.bars.push({i:c.i,polys:hits,top:Pj([(c.x0+c.x1)/2,(c.y0+c.y1)/2,c.top]),box:{x:bx0,y:by0,w:bx1-bx0,h:by1-by0}});
  });
  // The selected day's cell, when columns in front hid it (or it is empty), is outlined again in
  // front of everything, with a marker on its centre, so keyboard focus is always visible.
  if(sel>=0&&cols[sel]&&(hidden.has(sel)||!(cols[sel].top>0))){
   const c=cols[sel],m=centre(c);poly([P0(c.x0-.12,c.y0-.12),P0(c.x1+.12,c.y0-.12),P0(c.x1+.12,c.y1+.12),P0(c.x0-.12,c.y1+.12)]);ctx.lineWidth=2;ctx.strokeStyle=accent;ctx.stroke();
   ctx.beginPath();ctx.arc(m.x,m.y,3.5*u,0,TAU);ctx.fillStyle=accent;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=dark?'rgba(0,0,0,.6)':'#fff';ctx.stroke();
  }
  // Value tags above the columns (white figures on a dark plate). On a dense window only the
  // peak, today's, the selected and the hovered column keep a tag; the rest are in the tooltip
  // and the text list. Tags never overlap: a tag that would cover one already placed is left out.
  ctx.textAlign='center';ctx.textBaseline='middle';
  // Column spacing on screen along either axis (orbited views turn the week rows sideways).
  const cellPx=Math.max(colPx,Math.abs(Pj([0,1,0]).x-Pj([0,0,0]).x)),tiny=cellPx<26*u,th=Math.round((tiny?12:14)*u),placed=[],rank=c=>c.i===sel?0:c.i===hov?1:c.iso===today?2:3;
  const allowed=new Set(C.tagColumns(cols.filter(c=>c.p>.98),{sel,hov,today},14));
  ctx.font=`600 ${tiny?Math.max(10,fs-1):fs}px ${font}`;
  const tags=order.filter(c=>c.total&&c.p>.98&&cellPx>=16&&allowed.has(c.i)).map((c,k)=>{const t=Pj([(c.x0+c.x1)/2,(c.y0+c.y1)/2,c.top]),s=String(c.total),tw=Math.max(th+2,ctx.measureText(s).width+(tiny?7:9)*u);return {c,s,k,x:Math.round(t.x-tw/2)+.5,y:Math.round(t.y-th-5)+.5,w:tw};});
  tags.slice().sort((a,b)=>rank(a.c)-rank(b.c)||b.c.total-a.c.total||b.k-a.k).forEach(g=>{if(!placed.some(o=>g.x<o.x+o.w+1&&o.x<g.x+g.w+1&&g.y<o.y+th+1&&o.y<g.y+th+1))placed.push(g);});
  // Today's flag on a hairline pin. It is lifted clear of any nearer column and of every value
  // tag (no figure is ever dropped for it), and moved sideways when the top of the stage is reached.
  const now0=cols.find(c=>c.iso===today);let flag=null;
  if(now0){
   const t0=now0.top>0?Pj([(now0.x0+now0.x1)/2,(now0.y0+now0.y1)/2,now0.top]):centre(now0),val=placed.some(g=>g.c===now0);
   const tw=capsWidth('Today',P)+12*u,ph=Math.round(15*u);let ay=t0.y-(val?th+12*u+ph/2:12*u+ph/2),fx=t0.x;
   const d0=centre(now0).depth;
   for(const c of cols){if(c===now0||!(c.top>0)||ghost.has(c.i))continue;const cc=centre(c);if(cc.depth>=d0)continue;
    const tp=[[c.x0,c.y0],[c.x1,c.y0],[c.x1,c.y1],[c.x0,c.y1]].map(p=>Pj([p[0],p[1],c.top])),xa=Math.min(...tp.map(p=>p.x)),xb=Math.max(...tp.map(p=>p.x)),ya=Math.min(...tp.map(p=>p.y));
    if(xb>fx-tw/2&&xa<fx+tw/2&&ya<ay+ph/2+3)ay=ya-ph/2-6*u;}
   const clash=()=>placed.find(g=>g.c!==now0&&g.x<fx+tw/2+2&&g.x+g.w>fx-tw/2-2&&g.y<ay+ph/2+2&&g.y+th>ay-ph/2-2);
   for(let i=0,g;i<8&&(g=clash());i++)ay=g.y-ph/2-4;
   const minY=R.y+ph/2+2;
   if(ay<minY){ay=minY;for(let i=0,g;i<8&&(g=clash());i++)fx=fx>=g.x+g.w/2?g.x+g.w+tw/2+4:g.x-tw/2-4;}
   flag={t0,val,tw,ph,ay,fx};
  }
  for(const g of placed){
   roundBox(g.x,g.y,g.w,th,3);ctx.fillStyle='rgba(12,12,12,.76)';ctx.fill();ctx.lineWidth=1;ctx.strokeStyle=g.c.i===sel||g.c.i===hov?accent:'rgba(255,255,255,.2)';ctx.stroke();
   ctx.fillStyle='#ffffff';ctx.fillText(g.s,g.x+g.w/2,g.y+th/2+.5);
   labelRects.push({x:g.x,y:g.y,w:g.w,h:th});   // tooltips keep clear of value tags too
  }
  // Nothing recorded in the window: say so once, on the stage (the HTML overlay is hidden in Pro).
  if(!rows.some(r=>r.setup||r.event)){const m=Pj([3.5,weeks/2,height*.45]);ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.dim;ctx.textAlign='center';ctx.fillText('No recorded setups or events in this window',clamp(m.x,R.x+130*u,R.x+R.w-130*u),m.y);}
  // Week labels down the open side, each anchored at the end of its own row, drawn last so columns
  // never hide them, under a heading that names the figures. When rows crowd, the change goes
  // first, then smaller type, then the figure; only then do labels thin out evenly.
  let mode=geo.weekMode,size=fs,boxes=[],labels=[];
  search:for(;mode>=0;mode--)for(const sz of fs>small?[fs,small]:[fs]){
   size=sz;labels=weekRows.map((k,wk)=>{const L=weekLabel(k,P,mode,sz),a=P0(edgeX,weeks-1-wk+.5),x=wdir>0?a.x+gapPx:a.x-gapPx-L.w;return {L,a,x};});
   boxes=labels.map(l=>({x:l.x,y:l.a.y-(sz+2)/2,w:l.L.w,h:sz+2}));
   if(C.labelStep(boxes,sz<fs?1:3)===1)break search;
  }
  if(mode<0)mode=0;
  const every=C.labelStep(boxes,size<fs?1:3);let lx0=Infinity,lx1=-Infinity,ly0=Infinity,ly1=-Infinity,topL=null;
  for(let wk=0;wk<labels.length;wk+=every){const l=labels[wk],x=clamp(l.x,R.x+2,R.x+R.w-2-l.L.w);l.L.draw(x,l.a.y);lx0=Math.min(lx0,x);lx1=Math.max(lx1,x+l.L.w);if(l.a.y-(size+2)/2<ly0)topL={x,w:l.L.w};ly0=Math.min(ly0,l.a.y-(size+2)/2);ly1=Math.max(ly1,l.a.y+(size+2)/2);}
  // The heading sits over the top label, lined up with it.
  const head=weekHeading(mode);
  if(head&&topL){
   ctx.font=`${small}px ${font}`;ctx.fillStyle=P.dim;ctx.textBaseline='middle';const hw=ctx.measureText(head).width,hx=clamp(wdir>0?topL.x:topL.x+topL.w-hw,R.x+2,R.x+R.w-2-hw),hy=ly0-lineH/2-3;
   ctx.textAlign='left';ctx.fillText(head,hx,hy);lx0=Math.min(lx0,hx);lx1=Math.max(lx1,hx+hw);ly0=Math.min(ly0,hy-lineH/2);
  }
  if(isFinite(lx0))labelRects.push({x:lx0,y:ly0,w:lx1-lx0,h:ly1-ly0});
  S.weekMode={mode,every,size};
  if(flag){
   const {t0,val,tw,ph,ay,fx}=flag,end={x:t0.x,y:t0.y-(val?th+6:2)};
   ctx.strokeStyle=accent;ctx.lineWidth=1;seg({x:fx,y:ay+ph/2},end);
   ctx.beginPath();ctx.arc(end.x,end.y,2.5*u,0,TAU);ctx.fillStyle=accent;ctx.fill();
   roundBox(fx-tw/2,ay-ph/2,tw,ph,ph/2);ctx.fillStyle=accent;ctx.fill();ctx.fillStyle=P.accentInk;ctx.textBaseline='middle';capsText('Today',fx+.4,ay+.5,P,'center');
   labelRects.push({x:fx-tw/2,y:ay-ph/2,w:tw,h:ph});
  }
  ctx.restore();
  S.hits.barsRect=R;S.hits.labels=labelRects;S.cam=cam;
  return animating;
 }

 // Donut as a machined ring: trimmed segments with visible cut faces, a cylindrical sheen on the
 // walls, a specular band across the top and rim glints. The ring grows with its card: the
 // legend sits beside it, or under it when that gives a clearly larger ring (donutPlan), and
 // the ring and legend are centred in the card. Hit geometry g = {cx,cy,R,r,k,T} and the arcs
 // are the same shape Classic records.
 function proDonut(cell,slices,title,unit,d,now,P,plan){
  const u=P.u,fs=P.fs,font=P.font,k=DONUT_K,PI=Math.PI,total=slices.reduce((a,s)=>a+s.count,0),n=Math.max(1,slices.length),rd=Math.round;
  proCard(cell,P);
  // The status mix counts every card touching the window, cancelled ones included; saying how
  // many were cancelled reconciles it with the headline's job cards.
  // With Setup or Event hidden, the donuts still count every phase (as Classic does), and say so.
  const cancelled=d===0?((slices.find(s=>s.key==='Cancelled')||{}).count||0):0,show=S.data.w.show||{},all=show.setup===false||show.event===false?' · all phases':'';
  cardTitle(cell,title,total?(cancelled?[`${total} ${unit}, incl. ${cancelled} cancelled${all}`,`${total} incl. ${cancelled} cancelled${all}`,`${total} ${unit}${all}`,`${total}${all}`,String(total)]:[`${total} ${unit}${all}`,`${total}${all}`,String(total)]):[''],P);
  const inner={x:cell.x+rd(12*u),y:cell.y+rd(30*u),w:cell.w-rd(24*u),h:cell.h-rd(38*u)},R=plan.R,T=Math.max(6,R*.18),r=R*.6;
  let cx,cy,lx,lw,ly,rowH;
  if(plan.side){
   lw=Math.min(inner.w-2*R-rd(22*u),rd(250*u));const gw=2*R+rd(22*u)+lw,gx=inner.x+Math.max(0,(inner.w-gw)/2);
   cx=gx+R;cy=inner.y+inner.h/2-T/2+1;lx=gx+2*R+rd(22*u);rowH=clamp(inner.h/n,18*u,24*u);ly=cy+T/2-n*rowH/2+rowH/2;
  }else{
   rowH=clamp((inner.h-R*1.12-14*u)/n,18*u,22*u);const gh=R*1.12+14*u+n*rowH,t=inner.y+Math.max(0,(inner.h-gh)/2);
   cx=cell.x+cell.w/2;cy=t+R*k+2;lw=Math.min(inner.w,rd(280*u));lx=cell.x+(cell.w-lw)/2;ly=cy+R*k+T+14*u+rowH/2-4*u;
  }
  const g={cx,cy,R,r,k,T};
  ctx.save();
  const p=S.anim?ease((now-S.anim-120)/900):1;
  const focusKey=S.focus&&S.focus.group===d+1?S.focus.key:null,hoverKey=S.hover&&S.hover.group===d+1?S.hover.key:null,exploded=focusKey||hoverKey;
  // Nothing to chart: one plain line in the card, no placeholder ring.
  if(!total){
   ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.cardDim;ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillText(d===0?'No job cards in this window':'No active job cards in this window',inner.x+inner.w/2,inner.y+inner.h/2);
   ctx.restore();S.hits.donuts[d]={g,arcs:[],legend:[],cell};return false;
  }
  // Ring faces use the ring colours (status exact; Astro timing calmed); the legend marks the exact tokens.
  const arcs=C.pieAngles(slices,S.rot[d],p).map(a=>{const e=a.key===exploded?R*.09:0;return Object.assign(a,{ox:Math.cos(a.mid)*e,oy:Math.sin(a.mid)*e*k,c:P.ring[a.token]||[136,136,136],mark:P.status[a.token]||[136,136,136]});});
  // Contact shadow on the card.
  ctx.save();ctx.translate(cx+R*.05,cy+T+R*k*.14);ctx.scale(1,k);const sh=ctx.createRadialGradient(0,0,R*.3,0,0,R*1.24);sh.addColorStop(0,P.dark?'rgba(0,0,0,.55)':'rgba(0,0,0,.3)');sh.addColorStop(.72,P.dark?'rgba(0,0,0,.24)':'rgba(0,0,0,.12)');sh.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sh;ctx.beginPath();ctx.arc(0,0,R*1.24,0,TAU);ctx.fill();ctx.restore();
  const trim=a=>{const gp=arcs.length>1?Math.min(.022,(a.a1-a.a0)*.2):0;return [a.a0+gp,a.a1-gp];};
  const band=(X,Y,rad,t0,t1)=>{ctx.beginPath();ctx.ellipse(X,Y,rad,rad*k,0,t0,t1);ctx.ellipse(X,Y+T,rad,rad*k,0,t1,t0,true);ctx.closePath();};
  const pt=(a,rad,X,Y,dz)=>({x:X+Math.cos(a)*rad,y:Y+Math.sin(a)*rad*k+(dz||0)});
  // Shared light: across the outer wall (convex), the inner wall (concave) and the top face.
  const gOut=ctx.createLinearGradient(cx-R,0,cx+R,0);for(const [o,c] of [[0,'rgba(0,0,0,.2)'],[.2,'rgba(255,255,255,.3)'],[.42,'rgba(255,255,255,.03)'],[.75,'rgba(0,0,0,.26)'],[1,'rgba(0,0,0,.5)']])gOut.addColorStop(o,c);
  const gIn=ctx.createLinearGradient(cx-r,0,cx+r,0);for(const [o,c] of [[0,'rgba(0,0,0,.4)'],[.55,'rgba(0,0,0,.1)'],[.8,'rgba(255,255,255,.12)'],[1,'rgba(0,0,0,.12)']])gIn.addColorStop(o,c);
  const gTop=ctx.createLinearGradient(cx-R*.8,cy-R*k,cx+R*.8,cy+R*k);for(const [o,c] of [[0,'rgba(255,255,255,.1)'],[.3,'rgba(255,255,255,.22)'],[.52,'rgba(255,255,255,0)'],[1,'rgba(0,0,0,.12)']])gTop.addColorStop(o,c);
  // 1. Inner walls on the far side, seen through the hole.
  for(const a of arcs){const [t0,t1]=trim(a);for(const [u0,u1] of C.arcWindows(t0,t1,PI,TAU)){band(cx+a.ox,cy+a.oy,r,u0,u1);ctx.fillStyle=rgbStr(shade(a.c,-.46));ctx.fill();ctx.fillStyle=gIn;ctx.fill();}}
  // 2. Slices back to front (the exploded one last): cut faces, front outer wall, top, glints.
  const order=arcs.slice().sort((x,y)=>(x.key===exploded)-(y.key===exploded)||Math.sin(x.mid)-Math.sin(y.mid));
  for(const a of order){
   const [t0,t1]=trim(a),X=cx+a.ox,Y=cy+a.oy;if(t1-t0<1e-4)continue;
   for(const [ang,vis] of [[t0,Math.cos(t0)<0],[t1,Math.cos(t1)>0]]){if(!vis)continue;poly([pt(ang,r,X,Y),pt(ang,R,X,Y),pt(ang,R,X,Y,T),pt(ang,r,X,Y,T)]);ctx.fillStyle=rgbStr(shade(a.c,-.4));ctx.fill();}
   for(const [u0,u1] of C.arcWindows(t0,t1,0,PI)){band(X,Y,R,u0,u1);ctx.fillStyle=rgbStr(shade(a.c,-.16));ctx.fill();ctx.fillStyle=gOut;ctx.fill();}
   ctx.beginPath();ctx.ellipse(X,Y,R,R*k,0,t0,t1);ctx.ellipse(X,Y,r,r*k,0,t1,t0,true);ctx.closePath();
   const tg=ctx.createLinearGradient(cx-R,cy-R*k,cx+R,cy+R*k);tg.addColorStop(0,rgbStr(shade(a.c,.14)));tg.addColorStop(1,rgbStr(shade(a.c,-.06)));ctx.fillStyle=tg;ctx.fill();ctx.fillStyle=gTop;ctx.fill();
   if(P.edge){ctx.lineWidth=.8;ctx.strokeStyle='rgba(0,0,0,.35)';ctx.stroke();}
   if(a.key===exploded){ctx.lineWidth=1.5;ctx.strokeStyle=P.accent;ctx.stroke();}
   ctx.lineWidth=1;
   ctx.strokeStyle='rgba(255,255,255,.6)';for(const [u0,u1] of C.arcWindows(t0,t1,0,PI)){ctx.beginPath();ctx.ellipse(X,Y+.5,R-.5,(R-.5)*k,0,u0,u1);ctx.stroke();}
   ctx.strokeStyle='rgba(255,255,255,.4)';for(const [u0,u1] of C.arcWindows(t0,t1,PI,TAU)){ctx.beginPath();ctx.ellipse(X,Y+.5,r+.5,(r+.5)*k,0,u0,u1);ctx.stroke();}
  }
  // Centre: the total, sized to the clear part of the hole (between the far inner wall and the
  // near rim), or left out when the hole is too small for it (the card title carries the total).
  const cf=C.holeFont(R,r,k,T,String(total).length,u);
  if(cf){
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${cf}px ${font}`;ctx.lineJoin='round';
   if(P.dark){ctx.lineWidth=2.5;ctx.strokeStyle='rgba(0,0,0,.45)';ctx.strokeText(String(total),cx,cy+T/2);}
   ctx.fillStyle=P.cardText;ctx.fillText(String(total),cx,cy+T/2);
  }
  // Legend: shape mark, label, count, share, and a micro-bar of the share under each row.
  const legend=[];
  ctx.font=`${fs}px ${font}`;const pctW=ctx.measureText('100%').width;ctx.font=`600 ${fs}px ${font}`;const countW=Math.max(...arcs.map(a=>ctx.measureText(String(a.count)).width));
  // When the labels would not fit beside it, the percentage column is dropped (the micro-bar
  // and the tooltip still give the share).
  ctx.font=`${fs}px ${font}`;const labelW=Math.max(...arcs.map(a=>ctx.measureText(a.label).width)),gutter=rd(17*u);
  const showPct=lw-gutter-labelW-6-countW-8-pctW>=0,countRight=showPct?lx+lw-pctW-8:lx+lw,labelMax=Math.max(20,countRight-countW-6-(lx+gutter));
  const fit=s=>{ctx.font=`${fs}px ${font}`;if(ctx.measureText(s).width<=labelMax)return s;let t=s;while(t.length>1&&ctx.measureText(t+'…').width>labelMax)t=t.slice(0,-1);return t+'…';};
  arcs.forEach((a,i)=>{
   const y=ly+i*rowH,ty=y-2.5*u,by=y+rowH/2-5*u;if(y+rowH/2>cell.y+cell.h-2)return;
   const on=a.key===exploded,col=rgbStr(a.c);
   if(on){ctx.fillStyle=P.hilite;roundBox(lx-6,y-rowH/2+1,lw+12,rowH-2,3);ctx.fill();}
   shapeMark(SHAPES[a.symbol||a.key]||'square',lx+5*u,ty,Math.round(9*u),rgbStr(a.mark),P.edge);
   ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=on||!P.dark?P.cardText:P.cardDim;ctx.font=`${fs}px ${font}`;ctx.fillText(fit(a.label),lx+gutter,ty);
   ctx.textAlign='right';ctx.fillStyle=P.cardText;ctx.font=`600 ${fs}px ${font}`;ctx.fillText(String(a.count),countRight,ty);
   if(showPct){ctx.fillStyle=P.cardDim;ctx.font=`${fs}px ${font}`;ctx.fillText(a.pct+'%',lx+lw,ty);}
   const bw=lw-gutter;ctx.fillStyle=P.track;ctx.fillRect(lx+gutter,by,bw,2);ctx.fillStyle=col;ctx.fillRect(lx+gutter,by,Math.max(2,bw*a.count/total*p),2);
   legend.push({key:a.key,x:lx-6,y:y-rowH/2,w:lw+12,h:rowH});
  });
  ctx.restore();
  S.hits.donuts[d]={g,arcs,legend,cell};
  return p<1;
 }

 // Load by client: extruded horizontal bars (setup then event job-days, or people) on a fine value
 // grid whose top sits just above the longest bar, each figure right at the end of its bar. The
 // extrusion is shallow and kept inside the bar's length, so the right edge of the front face is
 // the true value. Rows that do not fit fold into one honest "Other" row, set apart by a divider,
 // a lighter bar and a quieter label so it never reads as the leading client. A narrow card
 // (beside the skyline on 1100-1280px windows) lists the clients compactly: name and figure on
 // one line, a slim bar under them.
 function proClients(cell,P,now){
  const u=P.u,fs=P.fs,font=P.font,people=S.metric==='people',all=S.data.clients,unit=people?'people':'job-days',rd=Math.round,s=all.length===1?'':'s';
  if(!cell){S.shown=[];S.hits.clients={rows:[],cell:null};return false;}
  proCard(cell,P);cardTitle(cell,'Load by client',all.length?[`${unit} · ${all.length} client${s}`,`${all.length} client${s}`,String(all.length)]:[''],P);
  const compact=cell.w<240*u,bodyY=cell.y+rd(34*u),bodyH=cell.h-rd(34*u)-rd((compact?8:22)*u);
  const rows=C.foldRows(all,clamp(Math.floor(bodyH/((compact?30:21)*u)),1,6)),n=rows.length;
  S.shown=rows;syncOtherNote(rows);
  if(!n){ctx.save();ctx.font=`${fs}px ${font}`;ctx.fillStyle=P.cardDim;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('No job cards in this window',cell.x+cell.w/2,bodyY+bodyH/2);ctx.restore();S.hits.clients={rows:[],cell};return false;}
  const val=r=>people?r.people:r.total,max=C.niceTop(Math.max(1,...rows.map(val))),p=S.anim?ease((now-S.anim-200)/800):1;
  const focusKey=S.focus&&S.focus.group===3?S.focus.key:null,hoverKey=S.hover&&S.hover.group===3?S.hover.key:null;
  const meta=r=>`${r.cards} job card${r.cards===1?'':'s'} · ${people?`${r.total} job-day${r.total===1?'':'s'}`:`${r.people} ${r.people===1?'person':'people'}`}`;
  const parts=r=>people?[['people',r.people]]:[['setup',r.setup],['event',r.event]].filter(q=>q[1]>0);
  const divider=(y)=>{ctx.strokeStyle=P.hair;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cell.x+rd(12*u),Math.round(y)+.5);ctx.lineTo(cell.x+cell.w-rd(12*u),Math.round(y)+.5);ctx.stroke();};
  ctx.save();ctx.textBaseline='middle';ctx.font=`${fs}px ${font}`;
  const hits=[];
  if(compact){
   const rowH=clamp(bodyH/n,26*u,40*u),y0=bodyY+Math.max(0,(bodyH-n*rowH)/2),x0=cell.x+rd(12*u),x1=cell.x+cell.w-rd(12*u),bw=x1-x0;
   rows.forEach((r,i)=>{
    const y=y0+i*rowH,on=r.key===hoverKey||r.key===focusKey,ty=y+rowH/2-4*u,by=Math.round(ty+8*u);
    if(r.other&&i)divider(y);
    if(on){ctx.fillStyle=P.hilite;roundBox(cell.x+6,y+1,cell.w-12,rowH-2,3);ctx.fill();if(r.key===focusKey){ctx.fillStyle=P.accent;ctx.fillRect(cell.x+6,y+3,2,rowH-6);}}
    ctx.textAlign='right';ctx.font=`600 ${fs}px ${font}`;ctx.fillStyle=r.other?P.cardDim:P.cardText;const v=String(val(r));ctx.fillText(v,x1,ty);const vw=ctx.measureText(v).width;
    ctx.textAlign='left';ctx.font=`${fs}px ${font}`;ctx.fillStyle=r.other?P.cardDim:P.cardText;const room=bw-vw-8*u;let name=clientLabel(r);
    if(ctx.measureText(name).width>room){while(name.length>1&&ctx.measureText(name+'…').width>room)name=name.slice(0,-1);name+='…';}
    ctx.fillText(name,x0,ty);
    ctx.fillStyle=P.track;ctx.fillRect(x0,by,bw,3);
    let x=x0;ctx.globalAlpha=r.other?.55:1;for(const [kind,q] of parts(r)){const len=bw*q/max*p;ctx.fillStyle=rgbStr(P[kind]);ctx.fillRect(x,by,len,3);x+=len;}ctx.globalAlpha=1;
    hits.push({key:r.key,x:cell.x+6,y,w:cell.w-12,h:rowH});
   });
   ctx.restore();S.hits.clients={rows:hits,cell};return p<1;
  }
  // Roomy rows carry a second line (job cards and people, or job-days in the People metric).
  const rowH=clamp(bodyH/n,20*u,42*u),two=rowH>=34*u,y0=bodyY+Math.max(0,(bodyH-n*rowH)/2);
  const nameW=clamp(Math.max(...rows.map(r=>Math.max(ctx.measureText(clientLabel(r)).width,two?ctx.measureText(meta(r)).width*.92:0)))+2,56*u,cell.w*(cell.w<290*u?.46:.4)),BH=rd(11*u);
  ctx.font=`600 ${fs}px ${font}`;const vW=Math.max(rd(20*u),ctx.measureText(String(max)).width+rd(10*u));ctx.font=`${fs}px ${font}`;
  const bx=cell.x+rd(12*u)+nameW+rd(12*u),bw=Math.max(20,cell.x+cell.w-rd(12*u)-vW-bx);
  const fit=t=>{if(ctx.measureText(t).width<=nameW)return t;let q=t;while(q.length>1&&ctx.measureText(q+'…').width>nameW)q=q.slice(0,-1);return q+'…';};
  // Value grid behind the bars, tick figures underneath.
  const yb=y0+n*rowH;ctx.lineWidth=1;ctx.textAlign='center';
  const tks=C.niceTicks(max),skip=bw/Math.max(1,tks.length-1)<20*u?2:1;
  tks.forEach((v,i)=>{const x=Math.round(bx+bw*v/max)+.5;ctx.strokeStyle=v?P.hair:(P.dark?'rgba(255,255,255,.26)':'rgba(0,0,0,.3)');ctx.beginPath();ctx.moveTo(x,y0+2);ctx.lineTo(x,yb+3);ctx.stroke();if(i%skip===0){ctx.fillStyle=P.cardDim;ctx.font=`${Math.max(10,fs-1)}px ${font}`;ctx.fillText(String(v),x,yb+rd(11*u));}});
  rows.forEach((r,i)=>{
   const y=y0+i*rowH+rowH/2,on=r.key===hoverKey||r.key===focusKey,f0=y-BH/2+2,f1=f0+BH,quiet=r.other;
   if(r.other&&i)divider(y-rowH/2);
   if(on){ctx.fillStyle=P.hilite;roundBox(cell.x+6,y-rowH/2+1,cell.w-12,rowH-2,3);ctx.fill();if(r.key===focusKey){ctx.fillStyle=P.accent;ctx.fillRect(cell.x+6,y-rowH/2+3,2,rowH-6);}}
   ctx.textAlign='left';ctx.font=`${fs}px ${font}`;ctx.fillStyle=quiet?P.cardDim:two||on||!P.dark?P.cardText:P.cardDim;ctx.fillText(fit(clientLabel(r)),cell.x+rd(12*u),two?y-7*u:y);
   if(two){ctx.font=`${Math.max(10,fs-1)}px ${font}`;ctx.fillStyle=P.cardDim;ctx.fillText(fit(meta(r)),cell.x+rd(12*u),y+7*u);ctx.font=`${fs}px ${font}`;}
   const ps=parts(r);let x=bx;
   const full=bw*val(r)/max*p,DX=Math.min(rd(4*u),full*.25),DY=-DX*.8;
   ctx.globalAlpha=quiet?.55:1;
   if(full>0){const sg=ctx.createLinearGradient(0,f1,0,f1+5);sg.addColorStop(0,P.dark?'rgba(0,0,0,.4)':'rgba(0,0,0,.22)');sg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sg;ctx.fillRect(bx+2,f1,full,5);}
   ps.forEach(([kind,v],j)=>{
    // The last segment gives up the extrusion depth at its end, so lid and cap finish exactly on the value.
    const len=bw*v/max*p,M=P.mat[kind][on?1:0],last=j===ps.length-1,x1=x+len-(last?Math.min(DX,len*.6):0);if(len<=0)return;
    const fg=ctx.createLinearGradient(0,f0,0,f1);fg.addColorStop(0,M.bar0);fg.addColorStop(1,M.bar1);ctx.fillStyle=fg;ctx.fillRect(x,f0,Math.max(1,x1-x),BH);
    poly([{x,y:f0},{x:x1,y:f0},{x:x1+DX,y:f0+DY},{x:x+DX,y:f0+DY}]);ctx.fillStyle=M.lid;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,f0+.5);ctx.lineTo(x1,f0+.5);ctx.stroke();
    if(last){poly([{x:x1,y:f0},{x:x1+DX,y:f0+DY},{x:x1+DX,y:f1+DY},{x:x1,y:f1}]);ctx.fillStyle=M.cap;ctx.fill();}
    else{ctx.strokeStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.moveTo(x1+.5,f0);ctx.lineTo(x1+.5,f1);ctx.moveTo(x1+.5,f0);ctx.lineTo(x1+DX+.5,f0+DY);ctx.stroke();}
    x=x1;
   });
   ctx.globalAlpha=1;
   // The figure sits right after the end of its bar.
   ctx.textAlign='left';ctx.font=`600 ${fs}px ${font}`;ctx.fillStyle=quiet?P.cardDim:P.cardText;ctx.fillText(String(val(r)),bx+full+Math.max(DX,0)+rd(6*u),y);
   hits.push({key:r.key,x:cell.x+6,y:y-rowH/2,w:cell.w-12,h:rowH});
  });
  ctx.restore();
  S.hits.clients={rows:hits,cell};
  return p<1;
 }

 // ---- interaction ----
 function hitTest(x,y){
  if(!S.hits)return null;
  for(let d=0;d<S.hits.donuts.length;d++){const H=S.hits.donuts[d];if(!H||!H.arcs.length)continue;let a=C.sliceAt(H.arcs,H.g,x,y);
   if(!a){const out=H.arcs.find(s=>s.ox||s.oy);if(out&&C.sliceAt([Object.assign({},out,{ox:0,oy:0})],H.g,x,y))a=out;}
   if(a)return {group:d+1,key:a.key};for(const l of H.legend)if(x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h)return {group:d+1,key:l.key};}
  if(S.style==='pro'&&S.hits.clients)for(const r of S.hits.clients.rows)if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return {group:3,key:r.key};
  const reg=regionOf(x,y);if(!reg||reg.kind!=='bars')return null;
  for(let k=S.hits.bars.length-1;k>=0;k--){const b=S.hits.bars[k];if(b.polys.some(q=>C.pointInPolygon(x,y,q)))return barRef(b.i);}
  return null;
 }
 function regionOf(x,y){if(!S.hits)return null;const R=S.hits.barsRect;if(R&&x>=R.x&&x<=R.x+R.w&&y>=R.y&&y<=R.y+R.h)return {kind:'bars'};for(let d=0;d<S.hits.donuts.length;d++){const H=S.hits.donuts[d];if(H&&H.cell&&x>=H.cell.x&&x<=H.cell.x+H.cell.w&&y>=H.cell.y&&y<=H.cell.y+H.cell.h)return {kind:'donut',d};}return null;}
 function sliceOf(t){if(!t||!S.data)return null;const list=t.group===1?S.data.status:t.group===2?S.data.timing:null;return list?list.find(s=>s.key===t.key)||null:null;}
 function describe(t){
  if(!t||!S.data)return null;
  if(t.group===0){const r=S.data.rows[t.index];if(!r)return null;const day=fmtDay(r.iso,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
   const lines=S.metric==='people'?[`People assigned ${r.people}`]:[`Setups ${r.setup} · Events ${r.event}`,`People assigned ${r.people}`];
   return {title:day+(r.iso===todayISO()?' · today':''),lines:lines.concat([r.jobs.length?`${r.jobs.length} job card${r.jobs.length===1?'':'s'} · double-click or Enter for the running order`:'No recorded setups or events']),speak:`${day}: ${lines.join(', ')}.`};}
  if(t.group===3){const r=shownClients().find(c=>c.key===t.key);if(!r)return null;const name=clientLabel(r),plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
   const lines=[`Setups ${r.setup} · Events ${r.event} · ${plural(r.total,'job-day')}`,`${plural(r.cards,'job card')} · ${r.people} ${r.people===1?'person':'people'} assigned`];
   // The figures are this window's; the action opens the Job Cards list, which is not limited to the window.
   return {title:name,lines:lines.concat([r.other||!r.key?'Double-click or Enter to open the full Job Cards list':'Double-click or Enter to list all of this client’s job cards (every date)']),speak:`Client ${name}: ${lines.join(', ')}.`};}
  const s=sliceOf(t);if(!s)return null;
  const unit=t.group===1?'job card':'active job';
  return {title:s.label,lines:[`${s.count} ${unit}${s.count===1?'':'s'} · ${s.pct}%`,t.group===1?`Double-click or Enter to list all ${s.label} job cards`:'Double-click or Enter to open Job Cards'],speak:`${t.group===1?'Status':'Timing'} ${s.label}: ${s.count}, ${s.pct} percent.`};
 }
 function placeTip(){
  if(!tip)return;const pro=S.style==='pro';
  // Pro: a keyboard focus item has a tooltip only while the keyboard is in use (not after a click or a drag).
  const t=S.hover||(document.activeElement===canvas&&(!pro||S.kbd)?S.focus:null),info=describe(t);
  if(!info||!active()){tip.hidden=true;return;}
  tip.innerHTML=`<b>${esc(info.title)}</b>${info.lines.map(l=>`<span>${esc(l)}</span>`).join('')}`;tip.hidden=false;
  const host=canvas.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;let x,y;
  if(pro){const at=proTipSpot(t,tw,th,host);if(!at){tip.hidden=true;return;}x=at.x;y=at.y;}
  else{
  // Prefer right/below the anchor; flip to the other side rather than covering the item.
  const near=(ax,ay)=>{x=ax+14;y=ay+14;if(x+tw>host.width-4)x=ax-tw-14;if(y+th>host.height-4)y=ay-th-14;};
  if(S.hover&&S.pointer)near(S.pointer.x,S.pointer.y);
  else if(t.group===0){const b=S.hits&&S.hits.bars.find(b=>b.i===t.index);if(!b){tip.hidden=true;return;}near(b.top.x,b.top.y-34);}
  else{const H=S.hits&&S.hits.donuts[t.group-1];if(!H){tip.hidden=true;return;}x=H.g.cx-tw/2;y=H.g.cy-H.g.R*H.g.k-th-10;if(y<H.cell.y+24)y=H.g.cy+H.g.R*H.g.k+H.g.T+10;}
  }
  tip.style.left=Math.round(clamp(x,4,host.width-tw-4))+'px';tip.style.top=Math.round(clamp(y,4,host.height-th-4))+'px';
 }
 // Pro tooltip position, the same for pointer and keyboard. A day's tooltip stays inside the
 // skyline region, beside its column, clear of the column itself and of the skyline's labels
 // (weekday names, week labels, scale, Today flag). A slice, legend row or client row gets its
 // tooltip outside the card that owns it (to the left, else above, else to the right or below),
 // clear of the headline band and the skyline's labels where possible.
 function proTipSpot(t,tw,th,host){
  const H=S.hits;if(!H||!t)return null;
  const labels=(H.labels||[]).slice(),ptr=S.hover&&S.pointer?S.pointer:null,head=S.layout&&S.layout.head;
  const shifts=(c,vertical)=>{const out=[c];for(const r of labels){if(vertical)out.push({x:c.x,y:r.y-th-4},{x:c.x,y:r.y+r.h+4});else out.push({x:r.x-tw-4,y:c.y},{x:r.x+r.w+4,y:c.y});}return out.slice(0,1).concat(out.slice(1).sort((p,q)=>Math.hypot(p.x-c.x,p.y-c.y)-Math.hypot(q.x-c.x,q.y-c.y)));};
  if(t.group===0){
   const b=H.bars.find(b=>b.i===t.index),B=H.barsRect;if(!b||!B)return null;
   const bx=b.box||{x:b.top.x-4,y:b.top.y,w:8,h:8},ay=ptr?ptr.y:b.top.y+8,ax=ptr?ptr.x:b.top.x;
   const cands=[].concat(shifts({x:bx.x+bx.w+10,y:ay-th/2},true),shifts({x:bx.x-tw-10,y:ay-th/2},true),[{x:ax-tw/2,y:bx.y-th-10},{x:ax-tw/2,y:bx.y+bx.h+10}]);
   return C.placeBox(cands,tw,th,{x:B.x+4,y:B.y+4,w:B.w-8,h:B.h-8},labels.concat([bx]));
  }
  const card=t.group===3?H.clients&&H.clients.cell:H.donuts[t.group-1]&&H.donuts[t.group-1].cell;if(!card)return null;
  let ax,ay;
  if(ptr){ax=ptr.x;ay=ptr.y;}
  else if(t.group===3){const row=H.clients.rows.find(r=>r.key===t.key);if(!row)return null;ax=row.x+row.w/2;ay=row.y+row.h/2;}
  else{const D=H.donuts[t.group-1],a=D.arcs.find(a=>a.key===t.key);if(!a)return null;ax=D.g.cx+Math.cos(a.mid)*D.g.R*.8;ay=D.g.cy+Math.sin(a.mid)*D.g.R*D.g.k*.8;}
  const cands=[].concat(shifts({x:card.x-tw-8,y:ay-th/2},true),shifts({x:ax-tw/2,y:card.y-th-6},true),[{x:card.x+card.w+8,y:ay-th/2},{x:ax-tw/2,y:card.y+card.h+6}]);
  return C.placeBox(cands,tw,th,{x:4,y:4,w:host.width-8,h:host.height-8},labels.concat([card],head?[head]:[]));
 }
 function announce(t){const info=describe(t),el=document.getElementById('vpInfo');if(el&&info)el.textContent=info.speak;}
 function activate(t){
  if(!t)return;
  if(t.group===0){const r=S.data.rows[t.index];if(r&&r.jobs.length&&typeof openDay==='function')openDay(r.iso);}
  else if(t.group===1){if(typeof showJobs==='function')showJobs(t.key);}
  else if(t.group===3){
   // Pro, a client row: Job Cards filtered to that client (the folded and no-client rows open the full list).
   if(typeof showJobs!=='function')return;showJobs('');
   const pick=document.getElementById('jClient');if(pick&&t.key&&t.key!=='~other'&&[...pick.options].some(o=>o.value===t.key)){pick.value=t.key;if(typeof renderJobs==='function')renderJobs();}
  }
  else if(typeof showJobs==='function')showJobs('');
 }
 function move(dir){
  const groups=[S.data.rows.length?{n:S.data.rows.length}:null,S.data.status.length?{list:S.data.status}:null,S.data.timing.length?{list:S.data.timing}:null];
  // Pro adds a fourth group (client rows); Classic keeps its three.
  if(S.style==='pro'){const list=shownClients();groups.push(list.length?{list}:null);}
  const G=groups.length;
  if(!S.data.rows.length)return;
  let f=S.focus&&groups[S.focus.group]?S.focus:barRef(Math.max(0,S.data.rows.findIndex(r=>r.iso===todayISO())));
  if(dir==='down'||dir==='up'){let g=f.group;for(let i=0;i<G;i++){g=(g+(dir==='down'?1:G-1))%G;if(groups[g])break;}f=g===0?barRef(clamp(f.index||0,0,S.data.rows.length-1)):{group:g,key:groups[g].list[0].key};}
  else{const step=dir==='right'?1:-1;if(f.group===0)f=barRef((f.index+step+S.data.rows.length)%S.data.rows.length);else{const list=groups[f.group].list,i=list.findIndex(s=>s.key===f.key);f={group:f.group,key:list[(i+step+list.length)%list.length].key};}}
  S.focus=f;S.hover=null;announce(f);request();
 }
 function pos(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}

 // Style switch state on the page: the area carries data-chart-style (views.css gives the Pro
 // stage more room on phones), any button[data-chart-style] toggle shows which is pressed, and
 // the canvas label names the extra chart.
 // Every Pro layout (desktop, 1100-1280px windows, tablets and phones) draws the client card, so
 // this label and the switch announcement may name it.
 const PRO_LABEL=' Pro style: headline figures with the previous period, week figures, and load by client as bars; Up and Down also reach the client rows.';
 function syncStyle(){
  const a=area();if(a)a.dataset.chartStyle=S.style;
  document.documentElement.setAttribute('data-chart-style',S.style);
  document.querySelectorAll('[data-chart-style-set]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chartStyleSet===S.style)));
  const c=canvas||document.getElementById('vpCharts');if(c&&c.getAttribute('aria-label')){const base=c.getAttribute('aria-label').replace(PRO_LABEL,'');c.setAttribute('aria-label',base+(S.style==='pro'?PRO_LABEL:''));}
 }
 window.chartsStyle=()=>S.style;
 window.chartsCommand=function(cmd,arg){
  if(cmd==='style'){
   // The choice is saved by prefs.js (window.setChartStyle); the charts never store anything.
   const next=C.chartStyleOf(arg),changed=next!==S.style;S.style=next;S.pal=null;S.hover=null;
   if(typeof window.setChartStyle==='function'&&!(window.dviPrefs&&window.dviPrefs.chartStyle===next))window.setChartStyle(next);
   syncStyle();
   // Switching style is not a data change: keep the picture still instead of replaying the intro.
   S.keepStill=true;renderCharts3D();S.keepStill=false;
   if(changed){const el=document.getElementById('vpInfo');if(el)el.textContent=next==='pro'?'Chart style: Pro. Headline figures, load by client and previous-period comparison are shown.':'Chart style: Classic.';}
   return;
  }
  if(cmd==='metric'){S.metric=arg==='people'?'people':'jobdays';if(canvas)canvas.setAttribute('aria-label',canvas.getAttribute('aria-label').replace(/job-days per day|people assigned per day/,S.metric==='people'?'people assigned per day':'job-days per day'));document.querySelectorAll('[data-chart-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chartMetric===S.metric)));renderCharts3D();return;}
  if(cmd==='frame'||cmd==='reset'){S.view=Object.assign(S.view,{yaw:DEFAULT_VIEW.yaw,pitch:DEFAULT_VIEW.pitch,zoomMul:1,panX:0,panY:0});S.rot=[-Math.PI/2,-Math.PI/2];}
  else if(cmd==='zoom')S.view.zoomMul=clamp(S.view.zoomMul*(Number(arg)||1),.5,3);
  else if(cmd==='ortho')S.view.ortho=!S.view.ortho;
  else if(cmd==='view'){const v={'y-':[0,16],'y':[180,16],'x':[-70,18],'x-':[70,18],'z':[0,80],'z-':[0,80]}[arg];if(v){S.view.yaw=v[0];S.view.pitch=v[1];}}
  else if(cmd==='next')move('right');
  else if(cmd==='deselect'){S.focus=null;}
  else if(cmd==='open')activate(S.focus);
  request();
 };
 window.renderCharts3D=function(){
  canvas=document.getElementById('vpCharts');tip=document.getElementById('vpTip');if(!canvas||!state)return;ctx=canvas.getContext('2d');
  if(!active()){if(tip)tip.hidden=true;return;}
  S.pal=null;syncStyle();
  build();
  const {rows,status,timing,w}=S.data,setups=rows.reduce((a,r)=>a+r.setup,0),events=rows.reduce((a,r)=>a+r.event,0);
  const peak=rows.reduce((b,r)=>{const v=S.metric==='people'?r.people:r.setup+r.event;return v>b.v?{v,iso:r.iso}:b;},{v:0,iso:''}),show=w.show||{};
  const stats=document.getElementById('vpStats');
  if(stats)stats.innerHTML=`<b>3D Charts · ${S.metric==='people'?'People assigned per day':'Job-days per day'}</b><span>(${esc(fmtDay(w.start,{day:'numeric',month:'short'}))} – ${esc(fmtDay(S.data.end,{day:'numeric',month:'short'}))}) ${esc(zoneLabels().city)}</span><span>${[show.setup!==false?`Setups&nbsp;&nbsp;${setups}`:'',show.event!==false?`Events&nbsp;&nbsp;${events}`:''].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</span><span>${peak.v?`Peak&nbsp;&nbsp;${peak.v} on ${esc(fmtDay(peak.iso))}`:'No recorded activity in this window'}</span>`;
  const empty=document.getElementById('vpEmpty');if(empty)empty.hidden=!!(setups||events||status.length);
  // Text alternative: the same numbers as the charts.
  const label=document.getElementById('vpListLabel');if(label)label.textContent='Chart data (text)';
  const list=document.getElementById('vpList');
  if(list){const days=rows.filter(r=>r.setup||r.event);
   list.innerHTML=(days.length?days.map(r=>`<li><button type="button" onclick="openDay('${r.iso}')">${esc(fmtDay(r.iso))} — ${r.setup} setup${r.setup===1?'':'s'}, ${r.event} event${r.event===1?'':'s'}, ${r.people} ${r.people===1?'person':'people'}</button></li>`).join(''):'<li>No recorded setups or events in this window.</li>')+
    `<li>Status mix: ${status.length?status.map(s=>`${esc(s.label)} ${s.count} (${s.pct}%)`).join(', '):'no job cards'}.</li><li>Timing completeness: ${timing.length?timing.map(s=>`${esc(s.label)} ${s.count} (${s.pct}%)`).join(', '):'no active job cards'}.</li>`;}
  // Pro: the headline band is drawn on the canvas (so the overlay text is cleared) and every
  // extra figure it shows is also listed in the text alternative.
  if(S.style==='pro'){
   if(stats)stats.innerHTML='';if(empty)empty.hidden=true;
   const D=S.data,T=D.totals,plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`,pk=T.peak[S.metric==='people'?'people':'jobdays'],MD={day:'numeric',month:'short'},Y={day:'numeric',month:'short',year:'numeric'};
   const pw=D.prevWindow,basis=show.setup===false?', event phases only':show.event===false?', setup phases only':'',wk=S.metric==='people'?'person-days':'job-days';
   const fig=c=>`${esc(c.label)} ${c.key==='peak'&&!c.value?'none':c.value}${c.of!=null?` of ${c.of} days`:''}${c.key==='peak'&&c.value&&c.iso?` on ${esc(fmtDay(c.iso))}`:''} (previous ${c.prev}${c.key==='peak'&&c.prev&&c.prevIso?` on ${esc(fmtDay(c.prevIso))}`:''}, change ${C.delta(c.value,c.prev).text})`;
   if(list)list.insertAdjacentHTML('beforeend',`<li>Headline figures for ${esc(fmtDay(w.start,MD))} – ${esc(fmtDay(D.end,Y))}${basis}, compared with the previous ${plural(w.days,'day')} (${esc(fmtDay(pw.start,MD))} – ${esc(fmtDay(pw.end,Y))}): ${D.head.map(fig).join('; ')}.</li>`+
    `<li>${S.metric==='people'?'Week peaks (most people assigned on one day of the week':'Week subtotals (job-days'}, with the same days of the previous period): ${D.weeks.map(k=>`week from ${esc(fmtDay(k.from,MD))}${k.partial?` (${plural(k.days,'day')} in this window)`:''} ${k.total} (previous ${k.prev}, change ${C.delta(k.total,k.prev).text})`).join('; ')}.</li>`+
    `<li>Window totals: ${plural(T.jobDays,'job-day')} (${T.setup} setup, ${T.event} event) on ${T.activeDays} of ${plural(T.days,'day')}; ${T.people} ${T.people===1?'person':'people'} assigned, ${plural(T.personDays,'person-day')}; ${plural(T.cards,'job card')}; ${pk.value?`peak ${pk.value} ${S.metric==='people'?'people':'job-days'} on ${esc(fmtDay(pk.iso))}`:'no peak day'}.</li>`+
    `<li>Load by client: ${S.data.clients.length?S.data.clients.map(c=>`${esc(clientLabel(c))} — ${plural(c.setup,'setup day')}, ${plural(c.event,'event day')}, ${plural(c.cards,'job card')}, ${c.people} ${c.people===1?'person':'people'}`).join('; '):'no recorded setups or events'}${otherNote()}.</li>`);
  }
  request();
 };
 function init(){
  canvas=document.getElementById('vpCharts');tip=document.getElementById('vpTip');if(!canvas)return;
  canvas.addEventListener('pointerdown',e=>{const p=pos(e),reg=regionOf(p.x,p.y);S.kbd=false;S.pdown=true;S.drag={x:p.x,y:p.y,moved:false,reg,touch:e.pointerType==='touch',shift:e.shiftKey,view:Object.assign({},S.view),rot:S.rot.slice()};try{canvas.setPointerCapture(e.pointerId);}catch(_){}});
  canvas.addEventListener('pointermove',e=>{
   const p=pos(e);S.pointer=p;
   if(S.drag&&S.drag.reg){const dx=p.x-S.drag.x,dy=p.y-S.drag.y;if(Math.hypot(dx,dy)>3)S.drag.moved=true;
    if(S.drag.moved){if(S.drag.touch){if(S.drag.reg.kind==='bars')S.view.yaw=S.drag.view.yaw+dx*.3;else S.rot[S.drag.reg.d]=S.drag.rot[S.drag.reg.d]+dx*.012;request();return;}if(S.drag.reg.kind==='bars'){if(S.drag.shift){S.view.panX=S.drag.view.panX+dx;S.view.panY=S.drag.view.panY+dy;}else{S.view.yaw=S.drag.view.yaw+dx*.3;S.view.pitch=clamp(S.drag.view.pitch+dy*.25,6,80);}}else S.rot[S.drag.reg.d]=S.drag.rot[S.drag.reg.d]+dx*.012;canvas.style.cursor='grabbing';request();return;}}
   const t=hitTest(p.x,p.y);const same=JSON.stringify(t)===JSON.stringify(S.hover);S.hover=t;canvas.style.cursor=t?'pointer':'grab';if(!same)request();else placeTip();
  });
  canvas.addEventListener('pointerup',e=>{const d=S.drag;S.drag=null;S.pdown=false;canvas.style.cursor='grab';
   // Pro: the end of a drag leaves nothing pinned (the hover is found again by the next pointer move).
   if(S.style==='pro'&&d&&d.moved){S.hover=null;request();}
   if(d&&!d.moved){const p=pos(e),t=hitTest(p.x,p.y);S.focus=t;if(t)announce(t);request();}});
  canvas.addEventListener('pointerleave',()=>{S.hover=null;S.pointer=null;request();});
  canvas.addEventListener('pointercancel',()=>{S.drag=null;S.pdown=false;canvas.style.cursor='grab';});
  canvas.addEventListener('dblclick',e=>{const p=pos(e);activate(hitTest(p.x,p.y));});
  canvas.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();S.view.zoomMul=clamp(S.view.zoomMul*Math.exp(-e.deltaY*.0015),.5,3);request();},{passive:false});
  canvas.addEventListener('keydown',e=>{
   const k=e.key,map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};S.kbd=true;
   if(map[k]){e.preventDefault();move(map[k]);}
   else if(k==='Enter'||k===' '){e.preventDefault();activate(S.focus||null);}
   else if(k==='Home'){e.preventDefault();chartsCommand('reset');}
   else if(k==='n'||k==='N'){e.preventDefault();e.stopPropagation();move('right');}
   else if(k==='+'||k==='='){chartsCommand('zoom',1.15);}
   else if(k==='-'){chartsCommand('zoom',1/1.15);}
   else if(k==='5')chartsCommand('ortho');
   else if(k==='1'||k==='3'||k==='7')chartsCommand('view',{1:e.ctrlKey?'y':'y-',3:e.ctrlKey?'x-':'x',7:'z'}[k]);
  });
  // Keyboard focus starts on today. Pro: focus that comes from a pointer press does not create a
  // keyboard focus item (Tab focus marks the keyboard as in use, so its tooltip shows).
  canvas.addEventListener('focus',()=>{if(S.style==='pro'){if(S.pdown)return;S.kbd=true;}if(!S.focus&&S.data){move('right');move('left');}});
  canvas.addEventListener('blur',()=>{request();});
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>request()).observe(canvas);
  new MutationObserver(()=>{S.pal=null;request();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-accent','style','data-surface']});
  // Redraw once the bundled font has loaded, so canvas text never stays in the fallback face.
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{S.pal=null;request();});
  const beforeSwitch=switchView;switchView=function(v){beforeSwitch(v);if(v==='dashboard')request();};
  renderCharts3D();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
