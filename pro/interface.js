/* Presentation helpers: no data access, transport, or external dependencies. */
// 16 px filled glyphs in the manner of Blender's icon sheet (original drawings, not Blender assets).
const DVI_ICONS={
 search:'<circle cx="6.5" cy="6.5" r="4.1" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m9.6 9.6 4.2 4.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
 plus:'<path d="M7 2.5h2V7h4.5v2H9v4.5H7V9H2.5V7H7z"/>',
 x:'<path d="m3.6 2.2 4.4 4.4 4.4-4.4 1.4 1.4L9.4 8l4.4 4.4-1.4 1.4L8 9.4l-4.4 4.4-1.4-1.4L6.6 8 2.2 3.6z"/>',
 'chevron-left':'<path d="M10.3 2.6 4.9 8l5.4 5.4 1.3-1.3L7.5 8l4.1-4.1z"/>',
 'chevron-right':'<path d="M5.7 2.6 11.1 8l-5.4 5.4-1.3-1.3L8.5 8 4.4 3.9z"/>',
 menu:'<path d="M2 3.2h12v1.7H2zm0 4h12v1.7H2zm0 4h12v1.7H2z"/>',
 settings:'<path fill-rule="evenodd" d="M7 1h2l.4 1.8 1.3.6 1.6-1 1.4 1.4-1 1.6.6 1.3L15 7v2l-1.8.4-.6 1.3 1 1.6-1.4 1.4-1.6-1-1.3.6L9 15H7l-.4-1.8-1.3-.6-1.6 1-1.4-1.4 1-1.6-.6-1.3L1 9V7l1.8-.4.6-1.3-1-1.6 1.4-1.4 1.6 1 1.3-.6zm1 4.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z"/>',
 sidebar:'<path fill-rule="evenodd" d="M1.5 2.5h13v11h-13zm1.4 1.4v8.2h7V3.9zm8.4 0v8.2h1.8V3.9z"/>',
 alert:'<path fill-rule="evenodd" d="M8 1.4 15.2 14H.8zM7.2 5.6h1.6V10H7.2zm0 5.4h1.6v1.6H7.2z"/>',
 info:'<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM7.2 7h1.6v4.6H7.2zm0-2.7h1.6v1.6H7.2z"/>',
 check:'<path d="m2.4 8.3 1.4-1.4 2.7 2.6 5.7-5.7 1.4 1.4-7.1 7.1z"/>',
 cube:'<path d="M8 1.6 14.2 5 8 8.4 1.8 5z"/><path d="M1.8 5.9 7.4 9v6.1l-5.6-3.1z" opacity=".72"/><path d="M14.2 5.9 8.6 9v6.1l5.6-3.1z" opacity=".45"/>',
 dopesheet:'<path d="m4.2 3.5 2.8 2.8-2.8 2.8-2.8-2.8zm7.6 0 2.8 2.8-2.8 2.8L9 6.3z"/><path d="M4.2 11.6h7.6v1.6H4.2z" opacity=".55"/>',
 sheet:'<path fill-rule="evenodd" d="M1.8 2.5h12.4v11H1.8zm1.3 1.3v2.4h3.5V3.8zm4.8 0v2.4h5V3.8zM3.1 7.5V10h3.5V7.5zm4.8 0V10h5V7.5zm-4.8 3.8v.9h3.5v-.9zm4.8 0v.9h5v-.9z"/>',
 calendar:'<path fill-rule="evenodd" d="M4 1.3h1.5v1.5h5V1.3H12v1.5h2.2v11.4H1.8V2.8H4zM3.3 6.3v6.4h9.4V6.3zM4.8 7.8h2.4v2.4H4.8z"/>',
 signal:'<path d="M1.8 3.6h7.4v1.6H1.8zm0 3.6h5.4v1.6H1.8zm0 3.6h7.4v1.6H1.8z"/><path d="m10.8 4.4 4.2 3.6-4.2 3.6z"/>',
 chart:'<path d="M1.5 1.5H3v11.5h11.5v1.5h-13z"/><path d="M3.8 11.8c2.2-5.6 4.1-6.8 5.7-4.7s2.7 1.2 4.8-4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
 people:'<circle cx="5.6" cy="5" r="2.6"/><path d="M.9 13.8c0-3.1 2.1-4.8 4.7-4.8s4.7 1.7 4.7 4.8z"/><circle cx="11.2" cy="5.6" r="2.1" opacity=".7"/><path d="M11 9.2c2.3 0 4.1 1.5 4.1 4.6h-3.9c0-2-.6-3.4-1.7-4.4.5-.1 1-.2 1.5-.2z" opacity=".7"/>',
 user:'<circle cx="8" cy="5" r="3"/><path d="M2.5 14.5c0-3.6 2.4-5.4 5.5-5.4s5.5 1.8 5.5 5.4z"/>',
 archive:'<path d="M1.5 2.5h13V6h-13z"/><path fill-rule="evenodd" d="M2.5 7h11v7.2h-11zM6 8.5V10h4V8.5z"/>',
 download:'<path d="M7.2 1.5h1.6v7l2.6-2.6 1.1 1.1L8 11.5 3.5 7l1.1-1.1 2.6 2.6z"/><path d="M2 12.6h12v1.6H2z"/>',
 upload:'<path d="M8 1.5 12.5 6l-1.1 1.1-2.6-2.6v7H7.2v-7L4.6 7.1 3.5 6z"/><path d="M2 12.6h12v1.6H2z"/>',
 list:'<path d="M1.8 3h2.2v2.2H1.8zm3.6.3h8.8v1.6H5.4zM1.8 6.9h2.2v2.2H1.8zm3.6.3h8.8v1.6H5.4zM1.8 10.8h2.2V13H1.8zm3.6.3h8.8v1.6H5.4z"/>',
 columns:'<path d="M1.8 2.5h3.6v11H1.8zm4.4 0h3.6v7.4H6.2zm4.4 0h3.6v9.2h-3.6z"/>',
 folder:'<path d="M1.5 3h5l1.5 1.6h6.5v8.6h-13z"/>',
 grid:'<path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/>',
 collection:'<path fill-rule="evenodd" d="M1.8 3h12.4v10.2H1.8zm1.4 1.4v7.4h9.6V4.4z"/><path d="M5 6.6h6v1.5H5z"/>',
 scene:'<circle cx="5.6" cy="10.2" r="3.6"/><path d="m10.4 2.3 4.4 7.9H6z" opacity=".72"/>',
 outliner:'<path d="M1.8 2h2.4v2.4H1.8zm4.2.4h8.2V4H6zM4 6.4h2.4v2.4H4zm4.2.4h6V8.4h-6zM4 10.8h2.4v2.4H4zm4.2.4h6v1.6h-6z"/><path d="M2.4 4.4h1v7.6h.6v1H2.4z" opacity=".55"/>',
 text:'<path d="M2 2.4h12v2.2H9.1v9H6.9v-9H2z"/>',
 clock:'<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zm-.7 1.5h1.4v3.2L11 9.1l-.7 1.2-3-1.8z"/>',
 box:'<path d="M8 1.5 14 4.5v7L8 14.5l-6-3v-7z" opacity=".5"/><path d="M8 1.5 14 4.5 8 7.6 2 4.5z"/>',
 building:'<path fill-rule="evenodd" d="M2.5 14.2V2h7v4h4v8.2zm2-10.2v1.5H6V4zm2.5 0v1.5h1.5V4zM4.5 7v1.5H6V7zM7 7v1.5h1.5V7zm4 1v1.5h1.5V8zm-6.5 2v1.5H6V10zM7 10v1.5h1.5V10zm4 0v1.5h1.5V10z"/>',
 pin:'<path fill-rule="evenodd" d="M8 1.4a4.6 4.6 0 0 1 4.6 4.6C12.6 9.3 8 14.6 8 14.6S3.4 9.3 3.4 6A4.6 4.6 0 0 1 8 1.4zm0 2.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"/>',
 badge:'<path fill-rule="evenodd" d="M3 1.5h10v13H3zm5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 11v1.3h5V11z"/>',
 tag:'<path fill-rule="evenodd" d="M1.5 2h6l7 7-5.5 5.5-7-7.4zm3 1.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>',
 trash:'<path d="M5.5 1.5h5V3H14v1.6H2V3h3.5z"/><path d="M3.3 5.6h9.4l-.8 8.9H4.1z"/>',
 edit:'<path d="M11 1.8 14.2 5 6 13.2l-3.9.7.7-3.9z"/>',
 copy:'<path d="M5 1.5h8.5V11H5z" opacity=".5"/><path d="M2.5 4.5H11v10H2.5z"/>',
 print:'<path d="M4 1.5h8V5H4z" opacity=".7"/><path fill-rule="evenodd" d="M1.5 5.6h13v6H12v2.9H4v-2.9H1.5zM5.3 9.5v3.4h5.4V9.5z"/>',
 truck:'<path d="M1 3.4h8.6v7.6H1z"/><path d="M10.1 5.9h2.8L15 8.6V11h-4.9z" opacity=".72"/><circle cx="4" cy="12.4" r="1.7"/><circle cx="12" cy="12.4" r="1.7"/>',
 'cloud-off':'<path d="M4.5 12.5a3 3 0 0 1-.4-6 4.2 4.2 0 0 1 8-.6 3.3 3.3 0 0 1 .2 6.6z" opacity=".5"/><path d="m2 2.9 1-1 11 11.2-1 1z"/>',
 contrast:'<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM8 3v10a5 5 0 0 0 0-10z"/>',
 cursor:'<path d="M3 1.4 13.2 9.3l-4.5.4 2.6 4.5-1.6.9-2.6-4.5-3.1 3.3z"/>',
 frame:'<path d="M1.5 1.5H6V3H3v3H1.5zm8.5 0h4.5V6H13V3h-3zM1.5 10H3v3h3v1.5H1.5zM13 10h1.5v4.5H10V13h3z"/><path d="M5.4 5.4h5.2v5.2H5.4z" opacity=".55"/>',
 'zoom-in':'<circle cx="6.5" cy="6.5" r="4.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m9.6 9.6 4.2 4.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M5.9 4.2h1.2v1.7h1.7v1.2H7.1v1.7H5.9V7.1H4.2V5.9h1.7z"/>',
 'zoom-out':'<circle cx="6.5" cy="6.5" r="4.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m9.6 9.6 4.2 4.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4.2 5.9h4.6v1.2H4.2z"/>',
 ortho:'<path d="M2 4h12v1.3H2zm0 3.4h12v1.3H2zm0 3.3h12V12H2z" opacity=".45"/><path d="M4 2h1.3v12H4zm3.4 0h1.3v12H7.4zm3.3 0H12v12h-1.3z"/>',
 'shade-wire':'<circle cx="8" cy="8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.3"/><ellipse cx="8" cy="8" rx="2.5" ry="5.7" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.3 8h11.4" stroke="currentColor" stroke-width="1"/>',
 'shade-solid':'<circle cx="8" cy="8" r="6"/>',
 'shade-material':'<circle cx="8" cy="8" r="6" opacity=".45"/><path d="M8 2a6 6 0 0 1 6 6H8zM2 8h6v6a6 6 0 0 1-6-6z"/>',
 'shade-render':'<circle cx="8" cy="8" r="6" opacity=".4"/><circle cx="6.4" cy="6.4" r="3"/>',
 layers:'<path d="m8 1.8 6.5 3.4L8 8.6 1.5 5.2z"/><path d="m3 7.6 5 2.6 5-2.6 1.5.8L8 11.8 1.5 8.4z" opacity=".7"/><path d="m3 10.6 5 2.6 5-2.6 1.5.8L8 14.8l-6.5-3.4z" opacity=".45"/>',
 shield:'<path d="M8 1.4 14 3.8v4.1c0 3.4-2.6 5.7-6 6.8-3.4-1.1-6-3.4-6-6.8V3.8z"/>',
 bell:'<path d="M8 1.5a4.2 4.2 0 0 1 4.2 4.2v3.4l1.6 2.4H2.2l1.6-2.4V5.7A4.2 4.2 0 0 1 8 1.5zM6.3 12.6h3.4a1.7 1.7 0 0 1-3.4 0z"/>'
};
function polishIcons(){document.querySelectorAll('[data-icon]:not([data-rendered])').forEach(el=>{const p=DVI_ICONS[el.dataset.icon];if(p){el.innerHTML='<svg class="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">'+p+'</svg>';el.dataset.rendered='true';}});}
function toggleNavigation(open){const on=open===undefined?!document.body.classList.contains('nav-open'):open;document.body.classList.toggle('nav-open',on);document.getElementById('mobileMenu').setAttribute('aria-expanded',String(on));if(on){const first=document.querySelector('#sidebar .navbtn');if(first)setTimeout(()=>first.focus({preventScroll:true}),60);}}
// Give every existing form control a programmatic name without changing its handlers.
function labelControls(){document.querySelectorAll('.eq-spec,.eq-sel,.cr-role,.cr-tech,.row-x').forEach(el=>el.setAttribute('aria-label',el.classList.contains('eq-spec')?'Equipment quantity or size':el.classList.contains('eq-sel')?'Equipment item':el.classList.contains('cr-role')?'Crew role':el.classList.contains('cr-tech')?'Crew member':'Remove row'));document.querySelectorAll('.np-item').forEach(el=>{el.setAttribute('role','button');el.tabIndex=0;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});document.querySelectorAll('label:not([for])').forEach(label=>{const control=label.parentElement.querySelector('input,select,textarea');if(control&&control.id&&!label.contains(control))label.htmlFor=control.id;});document.querySelectorAll('button[title]').forEach(el=>{if(!el.hasAttribute('aria-label')&&!el.textContent.trim())el.setAttribute('aria-label',el.title);});document.querySelectorAll('.x').forEach(el=>{if(!el.hasAttribute('aria-label'))el.setAttribute('aria-label','Close dialog');});}
polishIcons();labelControls();
new MutationObserver(()=>{polishIcons();labelControls();}).observe(document.body,{childList:true,subtree:true});
// Keep keyboard users inside the topmost open dialog, returning focus on dismissal.
const modalFocus=new WeakMap();
document.querySelectorAll('.modal').forEach(modal=>{if(!modal.hasAttribute('role'))modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');new MutationObserver(()=>{if(modal.classList.contains('open')){if(!modalFocus.has(modal)||!modalFocus.get(modal))modalFocus.set(modal,document.activeElement);requestAnimationFrame(()=>{if(modal.contains(document.activeElement))return;const target=modal.querySelector('input:not([readonly]):not([type="hidden"]),select,textarea,button.primary,button');if(target)target.focus({preventScroll:true});});}else{const previous=modalFocus.get(modal);modalFocus.delete(modal);if(previous&&previous.isConnected&&previous.focus)previous.focus({preventScroll:true});}}).observe(modal,{attributes:true,attributeFilter:['class']});});
// The topmost dialog is the one drawn on top (highest z-index), not the last one in the page
// source: a confirmation opened over another dialog must keep Tab to itself.
document.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const modal=[...document.querySelectorAll('.modal.open')].sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0)).at(-1);if(!modal)return;const controls=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],summary')].filter(el=>el.getClientRects().length);if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(!modal.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
