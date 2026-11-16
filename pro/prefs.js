/* Appearance preferences: accent colour (brand palette presets, the company's brand
   colour or a custom hue), surface tint and Blender-style resolution scale. Loaded in
   <head> before styles for the first paint. Reads and writes only its own keys; the
   company colour is handed over by app.js and cached here, never read from job data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')api.boot(window);})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ACCENT_KEY='dvi_dev_df1a251_20261102_accent',SCALE_KEY='dvi_dev_df1a251_20261102_uiscale',SURFACE_KEY='dvi_dev_df1a251_20261102_surface',COMPANY_KEY='dvi_dev_df1a251_20261102_companycolor';
// Overview chart style: 'classic' (light, the original look) or 'pro' (the boardroom look).
const CHART_STYLE_KEY='dvi_dev_df1a251_20261102_chartstyle',CHART_STYLES=['classic','pro'],DEFAULT_CHART_STYLE='classic';
const COMPANY_FALLBACK='#d4af37';
// The six signature colours of the owner's brand palette (15 Nov 2026), Cranberry first and
// the default (it is also the DVI-J seal's colour). Earlier GX presets that are no longer
// listed fall back to the default; 'gold' keeps its id with the palette's gold.
const PRESETS=[
 {id:'cranberry',name:'Cranberry',hex:'#d41367'},
 {id:'azure',name:'Azure',hex:'#0067c8'},
 {id:'royal-blue',name:'Royal Blue',hex:'#17458f'},
 {id:'gold',name:'Gold',hex:'#f7a81b'},
 {id:'sky-blue',name:'Sky Blue',hex:'#00a2e0'},
 {id:'cardinal',name:'Cardinal',hex:'#e02927'}
];
const SCALES=[0.9,1,1.1,1.25,1.5];
// Surfaces: Blender's neutral greys, or Opera GX's violet-tinted greys (low chroma).
const SURFACES=['blender','gx'];
const DEFAULT_ACCENT='cranberry',DEFAULT_SCALE=1,DEFAULT_SURFACE='blender';
const hexOk=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
function rgb(hex){const n=parseInt(hex.slice(1),16);return [n>>16,n>>8&255,n&255];}
function toHex(r,g,b){return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function mix(hex,target,t){const a=rgb(hex),b=rgb(target);return toHex(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t);}
function lum(hex){return rgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function hueHex(h){h=((Number(h)%360)+360)%360;const s=.82,l=.56,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return toHex((r+m)*255,(g+m)*255,(b+m)*255);}
// Accent value: a preset id, "company" (follows the company brand colour) or
// "custom:#rrggbb". Anything else is rejected.
function resolve(value,companyHex){
 if(typeof value!=='string')return null;
 if(value==='company')return {id:'company',name:'Company',hex:hexOk(companyHex)?companyHex.toLowerCase():COMPANY_FALLBACK};
 const p=PRESETS.find(x=>x.id===value);if(p)return {id:p.id,name:p.name,hex:p.hex};
 const m=/^custom:(#[0-9a-f]{6})$/i.exec(value);if(m)return {id:'custom',name:'Custom',hex:m[1].toLowerCase()};
 return null;
}
// Surfaces accent text actually sits on: the lightest dark panels (Blender #3d3d3d, GX
// #3a3642) and the darkest light region (#b3b3b3). Slider text: #e6e6e6 dark, #1a1a1a light.
const DARK_PANELS=['#3d3d3d','#3a3642'],LIGHT_PANELS=['#b3b3b3','#cccccc'];
const worst=(c,list)=>Math.min(...list.map(x=>contrast(c,x)));
// Derived tokens: readable accent text and focus rings on each theme's panels, a slider
// fill its label reads on, and legible ink on accent fills.
function tokens(hex){
 let dark=hex,light=hex,fillDark=hex,fillLight=hex;
 for(let i=0;i<24&&worst(dark,DARK_PANELS)<4.5;i++)dark=mix(dark,'#ffffff',.1);
 for(let i=0;i<24&&worst(light,LIGHT_PANELS)<4.5;i++)light=mix(light,'#000000',.1);
 for(let i=0;i<24&&contrast(fillDark,'#e6e6e6')<4.5;i++)fillDark=mix(fillDark,'#000000',.1);
 for(let i=0;i<24&&contrast(fillLight,'#1a1a1a')<4.5;i++)fillLight=mix(fillLight,'#ffffff',.1);
 const [r,g,b]=rgb(hex);
 return {'--accent':hex,'--accent-hi':mix(hex,'#ffffff',.18),'--accent-ink':contrast(hex,'#ffffff')>=contrast(hex,'#111111')?'#ffffff':'#111111','--accent-soft':`rgba(${r},${g},${b},.16)`,'--accent-line':`rgba(${r},${g},${b},.5)`,'--accent-glow':`rgba(${r},${g},${b},.45)`,'--accent-text-dark':dark,'--accent-text-light':light,'--accent-fill-dark':fillDark,'--accent-fill-light':fillLight};
}
function boot(win){
 const doc=win.document;let accent=resolve(DEFAULT_ACCENT),scale=DEFAULT_SCALE,surface=DEFAULT_SURFACE;
 const read=k=>{try{return win.localStorage.getItem(k);}catch(_){return null;}};
 const write=(k,v)=>{try{win.localStorage.setItem(k,v);return true;}catch(_){return false;}};
 const cached=read(COMPANY_KEY);let companyHex=hexOk(cached)?cached.toLowerCase():COMPANY_FALLBACK;
 accent=resolve(read(ACCENT_KEY),companyHex)||accent;
 const s=read(SCALE_KEY);if(s!==null&&SCALES.includes(Number(s)))scale=Number(s);
 const f=read(SURFACE_KEY);if(SURFACES.includes(f))surface=f;
 let chartStyle=DEFAULT_CHART_STYLE;const cs=read(CHART_STYLE_KEY);if(CHART_STYLES.includes(cs))chartStyle=cs;
 function apply(){
  const root=doc.documentElement;root.setAttribute('data-accent',accent.id);root.setAttribute('data-surface',surface);root.setAttribute('data-chart-style',chartStyle);
  doc.querySelectorAll&&doc.querySelectorAll('[data-chart-style-set]').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-chart-style-set')===chartStyle)));
  for(const [k,v] of Object.entries(tokens(accent.hex)))root.style.setProperty(k,v);
  root.style.setProperty('--ui-scale',String(scale));
  doc.querySelectorAll&&doc.querySelectorAll('[data-pref-accent]').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-pref-accent')===accent.id)));
  doc.querySelectorAll&&doc.querySelectorAll('[data-pref-scale]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.getAttribute('data-pref-scale'))===scale)));
 }
 win.dviPrefs={presets:PRESETS,scales:SCALES,surfaces:SURFACES,chartStyles:CHART_STYLES,get accent(){return Object.assign({},accent);},get scale(){return scale;},get surface(){return surface;},get chartStyle(){return chartStyle;},get companyHex(){return companyHex;},hueHex};
 // Saves the Overview chart style. The charts call this through chartsCommand('style', ...);
 // calling it directly also redraws them when they are on the page.
 win.setChartStyle=function(value){if(!CHART_STYLES.includes(value))return false;const was=chartStyle;chartStyle=value;apply();if(!write(CHART_STYLE_KEY,value))win.dviPrefs.saveFailed=true;if(was!==value&&typeof win.chartsStyle==='function'&&win.chartsStyle()!==value&&typeof win.chartsCommand==='function')win.chartsCommand('style',value);return true;};
 win.setAccent=function(value){const r=resolve(value,companyHex);if(!r)return false;accent=r;apply();if(!write(ACCENT_KEY,r.id==='custom'?'custom:'+r.hex:r.id))win.dviPrefs.saveFailed=true;return true;};
 // Called by app.js whenever the company profile is rendered or saved.
 win.setCompanyAccent=function(hex){if(!hexOk(hex))return false;hex=hex.toLowerCase();if(hex===companyHex)return true;companyHex=hex;write(COMPANY_KEY,hex);if(accent.id==='company'){accent=resolve('company',companyHex);apply();}return true;};
 win.setUiScale=function(value){if(value===null||value===''||typeof value==='boolean')return false;const v=Number(value);if(!SCALES.includes(v))return false;scale=v;apply();if(!write(SCALE_KEY,String(v)))win.dviPrefs.saveFailed=true;return true;};
 win.setSurface=function(value){if(!SURFACES.includes(value))return false;surface=value;apply();if(!write(SURFACE_KEY,value))win.dviPrefs.saveFailed=true;return true;};
 apply();
 if(doc.addEventListener)doc.addEventListener('DOMContentLoaded',apply,{once:true});
}
return {ACCENT_KEY,SCALE_KEY,SURFACE_KEY,COMPANY_KEY,CHART_STYLE_KEY,CHART_STYLES,PRESETS,SCALES,SURFACES,resolve,tokens,contrast,hueHex,boot};
});
