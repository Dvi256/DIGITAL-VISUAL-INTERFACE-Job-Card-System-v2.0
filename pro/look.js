/* Pro | Classic on the website: two looks over the same records and the same DVI Cloud.
   Classic is the site's own page; Pro lives in the pro/ folder beside it. This file is published twice, next to
   each page. It never reads or writes the records and makes no connection. */
(function(root){
 'use strict';
 const KEY='dvi_look_v1';
 const NAMES={pro:'Pro',classic:'Classic'};
 const ID=/^[A-Za-z0-9_-]{1,64}$/;
 const inPro=()=>/\/pro\/(?:index\.html)?$/i.test(root.location.pathname);
 const phone=()=>{try{return root.matchMedia('(max-width: 760px)').matches;}catch(_){return false;}};
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
 // Pro, except on a phone (Pro has no phone layout yet). Opening pro/ directly always shows Pro.
 function openRemembered(){
  if(inPro())return;
  if(get()==='pro'&&!phone())root.location.replace(target('pro',jobFromHash(root.location.hash)));
 }
 root.DviLook={KEY,NAMES,get,set,jobFromHash,target,currentJob,go,openRemembered,inPro,phone};
})(typeof window!=='undefined'?window:globalThis);
