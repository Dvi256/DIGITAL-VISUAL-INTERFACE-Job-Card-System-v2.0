/* Stock workspace: two weeks of stock per item, what is short and the hires planned. The numbers come
   from DviStock (dist/stock.js), the rules Classic uses, so both looks agree. This page writes only an
   item's number owned (and the common types, when asked); category and unit size are edited with the item. */
let stockStart=null,stockShowAll=false,stockPick=null;
const stockSpan=(a,b)=>fmtDayShort(a)+(b&&b!==a?' – '+fmtDayShort(b):'');
function renderStock(){
 const S=typeof DviStock!=='undefined'?DviStock:null,sheet=$('stockSheet');
 if(!S||!sheet||!state)return;
 const t=todayISO();if(!stockStart)stockStart=t;
 const idx=S.index(state.jobs,stockItem),days=[];
 for(let i=0;i<14;i++)days.push(S.addDays(stockStart,i));
 $('stockRange').textContent=stockSpan(days[0],days[13]);
 const order=c=>S.CATEGORIES.indexOf(c);
 const all=[...state.equipment].sort((a,b)=>(order(S.category(a))-order(S.category(b)))||((S.owned(b)!==null)-(S.owned(a)!==null))||String(a.name).localeCompare(String(b.name)));
 const untracked=all.filter(it=>S.owned(it)===null).length,items=stockShowAll?all:all.filter(it=>S.owned(it)!==null);
 const weekday=iso=>WEEKDAYS[new Date(iso+'T12:00:00Z').getUTCDay()].slice(0,3);
 let h='<thead><tr><th scope="col" class="stk-item">Item</th><th scope="col" class="stk-own">Owned</th>'+days.map(d=>`<th scope="col" class="stk-day${d===t?' today':''}">${weekday(d)}<small>${esc(fmtDayShort(d))}</small></th>`).join('')+'</tr></thead><tbody>';
 let group='';
 for(const it of items){
  const cat=S.category(it),have=S.owned(it),u=S.parseUnitSize(it.unitSize);
  if(cat!==group){h+=`<tr class="stk-cat"><th colspan="16" scope="colgroup">${esc(cat)}</th></tr>`;group=cat;}
  h+=`<tr${stockPick===it.id?' class="sel"':''}><th scope="row" class="stk-item"><button type="button" class="stk-name" aria-pressed="${stockPick===it.id}" onclick="stockSelect('${it.id}')">${esc(it.name)}</button><small>${have===null?'Not tracked':u?'Counted in '+esc(S.unitSizeText(u,cat)):'Counted in pieces'}</small></th>`+
   `<td class="stk-own"><input type="number" min="0" step="1" inputmode="numeric" value="${have===null?'':have}" placeholder="Set" aria-label="Number owned: ${esc(it.name)}" onchange="setStockOwned('${it.id}',this.value)"></td>`;
  for(const d of days){
   const today=d===t?' today':'';
   if(have===null){h+=`<td class="stk-c none${today}">·</td>`;continue;}
   const hs=S.holders(idx,it.id,d),n=hs.reduce((s,r)=>s+r.n,0),left=have-n;
   const cls=n===0?'none':left<0?'short':left===0?'full':left<=have*.25?'low':'free';
   const tip=fmtDayShort(d)+': '+(hs.length?hs.map(r=>(r.job.no?r.job.no+' ':'')+r.job.event+' ('+r.n+')').join(', ')+' · ':'')+(left<0?'short '+(-left):left+' left')+' of '+have;
   h+=`<td class="stk-c ${cls}${today}" title="${esc(tip)}">${n===0?'–':left}</td>`;
  }
  h+='</tr>';
 }
 if(!items.length)h+=`<tr><td colspan="16" class="stk-empty">${state.equipment.length?'No item has a number owned yet. Type the number you own in the Owned column'+(untracked?' (Show untracked lists every item)':'')+', or add the common types.':'The equipment catalogue is empty. Add an item, or add the common types.'}</td></tr>`;
 sheet.innerHTML=h+'</tbody>';
 const allBtn=$('stockAllBtn');if(allBtn){allBtn.textContent=stockShowAll?'Hide untracked':'Show untracked'+(untracked?' ('+untracked+')':'');allBtn.setAttribute('aria-pressed',String(stockShowAll));}
 $('stockItem').innerHTML=stockItemHTML(S,idx,t);
 const shorts=S.shortages(state.equipment,idx,t);
 $('stockShortCount').textContent=shorts.length?String(shorts.length):'';
 $('stockShort').innerHTML=shorts.length?shorts.map(x=>`<div class="stk-row">${statusSymbol('critical','Short')}<div><b>${esc(x.item.name)}</b>: short ${x.max} <span class="muted">${esc(stockSpan(x.from,x.to))}</span><div class="stk-who">${x.holders.map(r=>`<button type="button" class="link-btn" onclick="openView('${r.job.id}')">${esc(r.job.no||r.job.event)}</button> takes ${r.n}`).join(' · ')}</div></div></div>`).join('')
  :`<div class="stk-row">${statusSymbol('normal','Nothing short')}<div>Nothing short. Every confirmed job card can take its equipment from the store.</div></div>`;
 const hires=S.plannedHires(state.jobs,t);
 $('stockHires').innerHTML=hires.length?hires.map(x=>`<div class="stk-row">${statusSymbol('standby','Hire')}<div><b>Hire ${x.n}</b> ${esc(x.line.name||nameOf('equipment',x.line.itemId))} for <button type="button" class="link-btn" onclick="openView('${x.job.id}')">${esc(x.job.no||x.job.event)}</button><div class="stk-who">${x.days?esc(stockSpan(x.days[0],x.days[1])):'No dates yet'} · partner to confirm</div></div></div>`).join('')
  :'<div class="stk-row"><div class="muted">No hires planned. Use the Hire box on a job card’s equipment line when you are short.</div></div>';
}
// The Item panel: the selected item's properties and every confirmed card that holds it from today.
function stockItemHTML(S,idx,t){
 const it=stockPick?byId('equipment',stockPick):null;
 if(!it)return '<p class="prop-hint">Select an item in the sheet to see its details and who holds it.</p>';
 const cat=S.category(it),have=S.owned(it),u=S.parseUnitSize(it.unitSize);
 const row=(label,value)=>`<div class="prop-row"><span class="prop-label">${label}</span><span class="prop-value"><b>${value}</b></span></div>`;
 const booked=(idx.get(it.id)||[]).filter(r=>r.e>=t).sort((a,b)=>a.s.localeCompare(b.s));
 return `<div class="stk-item-head"><b>${esc(it.name)}</b><span class="spacer"></span><button type="button" class="btn sm" onclick="openQuickAdd('equipment','${it.id}')"><span data-icon="edit"></span>Edit</button></div>`+
  row('Category',esc(cat)+(it.category===cat?'':' <span class="muted">· from the name</span>'))+
  row('Owned',have===null?'<span class="muted">Not tracked</span>':String(have))+
  row('Counted in',u?esc(S.unitSizeText(u,cat)):'pieces')+
  `<div class="stk-sub">Booked from today${booked.length?` <span class="count">${booked.length}</span>`:''}</div>`+
  (booked.length?booked.map(r=>`<div class="stk-row"><span class="tnum">${esc(stockSpan(r.s,r.e))}</span><div><button type="button" class="link-btn" onclick="openView('${r.job.id}')">${esc(r.job.no||r.job.event)}</button> ${esc(r.job.event)} <span class="muted">takes ${r.n}</span></div></div>`).join('')
   :'<p class="prop-hint">No confirmed job card holds it from today.</p>');
}
function stockSelect(id){stockPick=stockPick===id?null:id;renderStock();}
function stockShift(n){stockStart=n?DviStock.addDays(stockStart||todayISO(),n):todayISO();renderStock();}
function stockToggleAll(){stockShowAll=!stockShowAll;renderStock();}
function setStockOwned(id,v){
 const it=byId('equipment',id);if(!it)return;
 v=String(v==null?'':v).trim();
 if(v&&!/^\d+$/.test(v)){toast('Use a whole number, e.g. 144','err');renderStock();return;}
 it.stock=v;save();renderAll();
 toast(v?it.name+': '+v+' owned ✓':'Stopped tracking '+it.name);
}
function stockAddStarterTypes(){
 const have=new Set(state.equipment.map(e=>String(e.name).toLowerCase()));
 const add=DviStock.STARTER_TYPES.filter(x=>!have.has(x[0].toLowerCase()));
 if(!add.length){toast('These types are already in your catalogue');return;}
 confirmBox('Add '+add.length+' common equipment types to your catalogue: LED panel types and sizes, stage deck sizes and light fixtures? Each starts untracked, so type the number you own here. You can rename or delete any of them in Resources.',()=>{
  add.forEach(([name,category,unitSize])=>state.equipment.push({id:uid(),name,category,unitSize,stock:''}));
  stockShowAll=true;save();renderAll();toast(add.length+' types added. Now set the numbers you own.');
 });
}
