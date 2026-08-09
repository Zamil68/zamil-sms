/* ═══ panel-bridge.js v2 — routes ALL dashboard calls to the active panel ═══ */
(function(){
'use strict';
function cur(){ try{ var p=localStorage.getItem('app_panel'); return (p==='zyron'||p==='evs')?p:'lamix'; }catch(e){ return 'lamix'; } }
var MAP = {
  '/api/ranges':'/api/p/ranges',
  '/api/numbers':'/api/p/numbers',
  '/api/smscount-range':'/api/p/smscount-range',
  '/api/number-smscount':'/api/p/smscount',
  '/api/smscount':'/api/p/smscount',
  '/api/dor':'/api/p/dor',
  '/api/leaderboard':'/api/p/leaderboard',
  '/api/earn/compute':'/api/p/earn/compute',
  '/api/stats':'/api/p/stats',
  '/api/admin/my-clients':'/api/p/my-clients',
  '/api/admin/team-report':'/api/p/team-report',
  '/api/admin/limit-status':'/api/p/limit-status',
  '/api/alloc/search-ranges':'/api/p/ranges-search',
  '/api/alloc/check-availability':'/api/p/check-availability',
  '/api/alloc/daily-used':'/api/p/daily-used',
  '/api/alloc/allocate':'/api/p/request-range',
  '/api/clients/list':'/api/p/clients'
};
function rewrite(url){ for (var k in MAP){ if (url.indexOf(k)!==-1) return url.replace(k, MAP[k]); } return url; }
function fixBody(nu,b){
  if(!b||typeof b!=='object') b={};
  b.panel=cur();
  if(nu.indexOf('/p/request-range')!==-1&&b.rangeId!=null&&b.rid==null){ b.rid=b.rangeId; b.qty=b.quantity||b.qty||5; b.payterm=b.payterm||'2'; }
  return b;
}
function adapt(url,d){
  try{
    if(!d||typeof d!=='object') return d;
    /* ▼▼▼ ADD THIS — any panel route returning noId → open the WhatsApp/link popup ▼▼▼ */
    if(d.noId){ setTimeout(function(){ if(window.openNoIdPopup) window.openNoIdPopup(d.panel||cur(),{}); },50); }
    /* ▲▲▲ end of added line ▲▲▲ */
    if(url.indexOf('/p/ranges-search')!==-1&&Array.isArray(d.ranges)){
      d.ranges=d.ranges.map(function(r){ var left=(r.remaining==null?0:r.remaining); return { id:String(r.rid), title:r.range, country:r.country, available:left, total:left, _z:r }; });
    }
    if(url.indexOf('/p/request-range')!==-1&&d.allocated){ d.allocatedReal=d.count||0; d.reason='ALLOCATED_OK'; if(!d.message) d.message=(d.count||0)+' numbers allocated on '+(d.panel||'panel'); }
  }catch(e){}
  return d;
}
/* fetch wrapper: rewrite mapped URLs + inject panel into EVERY /api body */
var _fetch=window.fetch;
window.fetch=function(input,init){
  try{
    if(cur()!=='lamix'){
      var url=(typeof input==='string')?input:((input&&input.url)||'');
      if(url.indexOf('/api/')!==-1){
        var nu=rewrite(url), bodyObj=null;
        if(init&&typeof init.body==='string'){ try{ bodyObj=JSON.parse(init.body); }catch(e){} }
        if(nu!==url){ if(typeof input==='string') input=nu; bodyObj=fixBody(nu,bodyObj||{}); }
        else if(bodyObj){ bodyObj.panel=cur(); }
        if(bodyObj) init=Object.assign({},init||{},{body:JSON.stringify(bodyObj)});
        if(init&&!init.method) init.method='POST';
        if(init&&!init.headers) init.headers={'Content-Type':'application/json'};
      }
    }
  }catch(e){}
  return _fetch.call(window,input,init);
};
/* apiCall wrapper (same behaviour) */
function install(){
  if(typeof window.apiCall==='function'&&!window.apiCall._pb){
    var _ac=window.apiCall;
    window.apiCall=function(url,body,cb){
      var p=cur(), nu=(p!=='lamix')?rewrite(url):url;
      var nb=(p!=='lamix')?fixBody(nu,Object.assign({},body||{})):(body||{});
      return _ac.call(this,nu,nb,function(d){ cb(adapt(nu,d)); });
    };
    window.apiCall._pb=1;
  }
}
if(document.readyState==='complete'||document.readyState==='interactive') setTimeout(install,0);
else document.addEventListener('DOMContentLoaded',install);
setTimeout(install,1200); setTimeout(install,3000);
window.PANEL_BRIDGE={cur:cur,rewrite:rewrite};
})();
