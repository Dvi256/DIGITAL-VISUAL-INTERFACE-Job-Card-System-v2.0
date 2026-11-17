/* Pro | Classic on the website: two looks over the same records and the same DVI Cloud.
   Classic is the site's own page; Pro lives in the pro/ folder beside it. This file is published twice, next to
   each page. It never reads or writes the records and makes no connection. */
(function(root){
 'use strict';
 const KEY='dvi_look_v1';
 const NAMES={pro:'Pro',classic:'Classic'};
 const ID=/^[A-Za-z0-9_-]{1,64}$/;
 const inPro=()=>/\/pro\/(?:index\.html)?$/i.test(root.location.pathname);
 // A phone, judged by the screen itself: Pro lays out 1280 px wide there, so the page width says nothing.
 const smallScreen=()=>{try{return Math.min(root.screen.width,root.screen.height)<=760;}catch(_){return false;}};
 function get(){try{const v=root.localStorage.getItem(KEY);return v==='pro'||v==='classic'?v:null;}catch(_){return null;}}
 function set(look){try{root.localStorage.setItem(KEY,look);}catch(_){}}
 function jobFromHash(hash){const m=/^#(?:job|edit)\/([^/?#]+)$/.exec(String(hash||''));let id='';try{id=m?decodeURIComponent(m[1]):'';}catch(_){id='';}return ID.test(id)?id:'';}
 function target(look,jobId){
  const here=inPro(),page=look==='pro'?(here?'index.html':'pro/index.html'):(here?'../index.html':'index.html');
  return page+(jobId&&ID.test(jobId)?'#job/'+jobId:'');
 }
 // The card on screen: the one being edited, the one open in the card view, or Classic's selected card.
 function currentJob(){
  const d=root.document,open=id=>{const el=d&&d.getElementById(id);return !!(el&&el.classList.contains('open'));};
  try{if(open('jobModal')&&typeof editingJobId!=='undefined'&&editingJobId)return editingJobId;}catch(_){}
  try{
   if(open('viewModal')){
    if(typeof viewJobId!=='undefined'&&viewJobId)return viewJobId;
    const b=d.querySelector('#viewModal [onclick*="printJob(\'"]'),m=b&&/printJob\('([A-Za-z0-9_-]+)'/.exec(b.getAttribute('onclick')||'');
    if(m)return m[1];
   }
  }catch(_){}
  try{const v=d.getElementById('view-jobs');if(v&&v.classList.contains('active')&&typeof selectedJobId!=='undefined'&&selectedJobId)return selectedJobId;}catch(_){}
  return jobFromHash(root.location&&root.location.hash);
 }
 function go(look){
  if(!NAMES[look])return false;
  const editor=root.document&&root.document.getElementById('jobModal');
  if(editor&&editor.classList.contains('open')&&!root.confirm('Switch to '+NAMES[look]+' without saving this job card?'))return false;
  const id=currentJob();
  set(look);
  root.location.href=target(look,id);
  return true;
 }
 // Classic is the default. On the Classic page only: a device where Pro was chosen with the button goes on to
 // Pro. Phones too (owner, 17 November 2026): Pro shows its PC layout scaled down there. Opening pro/ directly
 // always shows Pro.
 function openRemembered(){
  if(inPro())return;
  if(get()==='pro')root.location.replace(target('pro',jobFromHash(root.location.hash)));
 }
 // On a phone Pro is its PC layout shrunk to fit, and its own Classic button is tiny. So Pro shows a large bar
 // there with the way back. Sized for the 1280 px layout; "×" hides it until the browser tab is closed.
 function phoneBar(){
  const d=root.document;
  if(!inPro()||!smallScreen()||!d||!d.body||d.getElementById('lookPhoneBar'))return false;
  try{if(root.sessionStorage.getItem('dvi_look_bar_hidden'))return false;}catch(_){}
  const make=(tag,css,text)=>{const el=d.createElement(tag);el.style.cssText=css;if(text)el.textContent=text;return el;};
  const bar=make('div','position:fixed;left:0;right:0;bottom:0;z-index:99998;display:flex;align-items:center;gap:36px;padding:34px 40px;background:#111;color:#fff;font:48px/1.25 system-ui,sans-serif;box-shadow:0 -8px 30px rgba(0,0,0,.55)');
  bar.id='lookPhoneBar';
  const note=make('span','flex:1','Pro shows the PC layout on a phone. Pinch to zoom in.');
  const back=make('button','flex:none;padding:48px 52px;border:0;border-radius:20px;background:#f7a81b;color:#111;font:700 54px/1 system-ui,sans-serif','Back to Classic');
  const hide=make('button','flex:none;width:150px;height:150px;border:0;border-radius:20px;background:#333;color:#fff;font:72px/1 system-ui,sans-serif','×');
  back.type=hide.type='button';hide.setAttribute('aria-label','Hide this bar');
  back.onclick=()=>go('classic');
  hide.onclick=()=>{try{root.sessionStorage.setItem('dvi_look_bar_hidden','1');}catch(_){}bar.remove();};
  bar.appendChild(note);bar.appendChild(back);bar.appendChild(hide);
  d.body.appendChild(bar);
  return true;
 }
 root.DviLook={KEY,NAMES,get,set,jobFromHash,target,currentJob,go,openRemembered,inPro,smallScreen,phoneBar};
 if(root.document&&inPro()){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',phoneBar);else phoneBar();
 }
})(typeof window!=='undefined'?window:globalThis);
