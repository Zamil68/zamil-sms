/* ═══ cli-track.js — Track page (super admin only) + restriction helpers ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb){
  var ctrl=new AbortController(), t=setTimeout(function(){ctrl.abort();},30000);
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify(Object.assign({session:sess()},body||{}))})
    .then(function(r){clearTimeout(t);return r.json().catch(function(){return{ok:false,error:'HTTP '+r.status};});})
    .then(cb).catch(function(e){clearTimeout(t);cb({ok:false,error:e.name==='AbortError'?'Timed out':'Network error'});});
}
function ago(iso){ if(!iso)return '—'; var s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(isNaN(s)||s<0)return '—'; if(s<45)return 'just now'; if(s<90)return '1m ago'; var m=Math.floor(s/60); if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }
function hue(s){ s=String(s||''); var h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))%360; return h; }
function ini(s){ s=String(s||'?').replace(/[^a-z0-9]/gi,''); return (s.slice(0,2)||'??').toUpperCase(); }

/* ── Track page state ── */
var _inj=false, _range='day', _filter='all', _firstLoad=true, _loadedAt=0;
var _perUser=[], _totals={}, _topQ=[], _window={}, _restrictMap={};

/* ── Super-admin button reveal ── */
function revealTrackBtn(){
  post('/api/auth/role',{},function(r){
    if(r&&r.ok&&r.role==='super'){
      var b=document.getElementById('drawerTrackBtn');
      if(b) b.style.display='flex';
    }
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',revealTrackBtn);
else revealTrackBtn();

/* ── Open / close ── */
window.openTrackPage=function(){
  post('/api/auth/role',{},function(r){
    if(!r||!r.ok||r.role!=='super'){ alert('CLI Track is super admin only.'); return; }
    injectTrack();
    var p=document.getElementById('cliTrackPage');
    if(p){ p.style.display='block'; window.scrollTo(0,0); }
    loadTrack(_range,_firstLoad);
  });
};
window.closeTrackPage=function(){ var p=document.getElementById('cliTrackPage'); if(p) p.style.display='none'; };
window.setTrackRange=function(r){ _range=r; syncSeg(); loadTrack(r,false); };
window.setTrackFilter=function(f){ _filter=f; syncFilters(); renderList(false); };
function syncSeg(){ document.querySelectorAll('#ctSeg button').forEach(function(b){ b.classList.toggle('on',b.dataset.r===_range); }); }
function syncFilters(){ document.querySelectorAll('#ctFilters button').forEach(function(b){ b.classList.toggle('on',b.dataset.f===_filter); }); }

/* ── Inject HTML ── */
function injectTrack(){
  if(_inj) return; _inj=true;
  fetch('/dashboard/cli-track.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    wireTrack();
  });
}

/* ── Load data ── */
function loadTrack(range, animate){
  _range=range; syncSeg();
  if(_firstLoad) skeletonAll();
  var done=0, trk=null, rl=null;
  function finish(){
    if(++done<2) return;
    _perUser=trk.perUser||[]; _totals=trk.totals||{}; _topQ=trk.topQueries||[]; _window=trk.window||{};
    _restrictMap={}; (rl.list||[]).forEach(function(x){ _restrictMap[x.username]=x; });
    renderStats(animate); renderList(animate); renderTopQ(); renderMeta();
    _loadedAt=Date.now(); _firstLoad=false;
  }
  post('/api/admin/cli/track',{range:range},function(d){ trk=(d&&d.ok)?d:{perUser:[],totals:{},topQueries:[],window:{}}; finish(); });
  post('/api/admin/cli/restrict-list',{},function(d){ rl=(d&&d.ok)?d:{list:[]}; finish(); });
}

/* ── Render ── */
function skeletonAll(){
  var list=document.getElementById('ctList'); if(!list) return;
  var h=''; for(var i=0;i<4;i++) h+='<div class="ct-sk-row"><div class="ct-sk" style="width:45%;margin-bottom:9px"></div><div class="ct-sk" style="width:80%;margin-bottom:9px"></div><div class="ct-sk" style="width:60%"></div></div>';
  list.innerHTML=h;
}
function renderStats(animate){
  var t=_totals||{};
  [['ctStatUsers',t.uniqueUsers||0],['ctStatIns',t.open_insights||0],['ctStatSrch',t.open_search||0],['ctStatQ',t.search_query||0]].forEach(function(m){
    var el=document.getElementById(m[0]); if(!el)return;
    if(animate){ var t0=performance.now(),to=m[1]; (function f(t){ var p=Math.min(1,(t-t0)/700),e=1-Math.pow(1-p,3); el.textContent=Math.round(to*e).toLocaleString(); if(p<1)requestAnimationFrame(f); })(t0); }
    else el.textContent=m[1].toLocaleString();
  });
}
function renderMeta(){
  var wl=document.getElementById('ctWinLabel'); if(wl) wl.textContent=(_window&&_window.label)||'—';
  var qc=document.getElementById('ctQCount'); if(qc) qc.textContent=(_topQ||[]).length;
}
function buildRows(){
  var map={};
  (_perUser||[]).forEach(function(p){ map[p.username]=Object.assign({},p); });
  Object.keys(_restrictMap).forEach(function(u){ if(!map[u]) map[u]={username:u,open_insights:0,open_search:0,search_query:0,total:0,lastSeen:null}; });
  var rows=Object.values(map).map(function(p){
    var r=_restrictMap[p.username]||{};
    p.block_insights=!!r.block_insights; p.block_search=!!r.block_search; p.note=r.note||'';
    p.isRestricted=p.block_insights||p.block_search; p.noActivity=(p.total||0)===0;
    return p;
  });
  if(_filter==='restricted') rows=rows.filter(function(p){return p.isRestricted;});
  rows.sort(function(a,b){ return (a.noActivity-b.noActivity)||(b.total-a.total)||a.username.localeCompare(b.username); });
  return rows;
}
function renderList(animate){
  var list=document.getElementById('ctList'); if(!list) return;
  var rows=buildRows();
  if(!rows.length){ list.innerHTML='<div class="ct-empty">'+(_filter==='restricted'?'No restricted accounts.':'No CLI activity in this window yet.')+'</div>'; return; }
  var maxT=rows.reduce(function(m,p){return Math.max(m,p.total||0);},0)||1;
  list.innerHTML=rows.map(function(p,i){
    var barW=Math.max(6,Math.round((p.total||0)/maxT*100));
    return '<div class="ct-row">'
      +'<div class="ct-row-top"><span class="ct-rank">'+(i+1)+'</span><span class="ct-av" style="--h:'+hue(p.username)+'">'+ini(p.username)+'</span>'
      +'<div class="ct-id"><div class="ct-name">'+esc(p.username)+(p.isRestricted?'<span class="ct-tag red">restricted</span>':'')+(p.noActivity?'<span class="ct-tag mut">no activity</span>':'')+'</div>'
      +'<div class="ct-seen">'+(p.lastSeen?('last seen '+ago(p.lastSeen)):'never active')+'</div></div>'
      +'<div class="ct-total"><span class="ct-total-num">'+(p.total||0).toLocaleString()+'</span><span class="ct-total-lbl">events</span></div></div>'
      +'<div class="ct-bar"><i style="width:'+(animate?'0':barW)+'%" data-w="'+barW+'"></i></div>'
      +'<div class="ct-chips"><span class="ct-chip i">Insights <b>'+p.open_insights+'</b></span><span class="ct-chip s">Search page <b>'+p.open_search+'</b></span><span class="ct-chip q">Searches <b>'+p.search_query+'</b></span></div>'
      +'<div class="ct-access"><span class="ct-access-lbl">Access</span>'
      +'<button class="ct-tog '+(p.block_insights?'off':'on')+'" data-u="'+esc(p.username)+'" data-k="insights">'+(p.block_insights?'Insights blocked':'Insights on')+'</button>'
      +'<button class="ct-tog '+(p.block_search?'off':'on')+'" data-u="'+esc(p.username)+'" data-k="search">'+(p.block_search?'Search blocked':'Search on')+'</button></div>'
      +(p.isRestricted?'<div class="ct-note"><input class="ct-note-inp" data-u="'+esc(p.username)+'" placeholder="Reason (optional)" value="'+esc(p.note)+'"></div>':'')
    +'</div>';
  }).join('');
  if(animate) requestAnimationFrame(function(){ list.querySelectorAll('.ct-bar>i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
}
function renderTopQ(){
  var el=document.getElementById('ctTopQ'); if(!el) return;
  var q=_topQ||[];
  if(!q.length){ el.innerHTML='<div class="ct-empty" style="padding:8px">No searches recorded.</div>'; return; }
  var max=q[0].n||1;
  el.innerHTML=q.map(function(x){ var sz=(0.74+0.5*(x.n/max)).toFixed(2); return '<span class="ct-qchip" style="font-size:'+sz+'rem"><span class="ct-qchip-q">'+esc(x.q)+'</span><span class="ct-qchip-n">'+x.n+'</span></span>'; }).join('');
}

/* ── Restriction toggle ── */
function toggleRestrict(u,k){
  var cur=_restrictMap[u]?Object.assign({},_restrictMap[u]):{block_insights:false,block_search:false,note:''};
  var prev=Object.assign({},cur);
  if(k==='insights') cur.block_insights=!cur.block_insights; else cur.block_search=!cur.block_search;
  _restrictMap[u]=cur; renderList(false);
  post('/api/admin/cli/restrict',{username:u,blockInsights:!!cur.block_insights,blockSearch:!!cur.block_search,note:cur.note||''},function(d){
    if(!d||!d.ok){ _restrictMap[u]=prev; renderList(false); }
  });
}
function wireTrack(){
  var list=document.getElementById('ctList'); if(!list||list._w) return; list._w=true;
  list.addEventListener('click',function(e){ var b=e.target.closest('.ct-tog'); if(!b)return; toggleRestrict(b.dataset.u,b.dataset.k); });
  var nt=null;
  list.addEventListener('input',function(e){
    var inp=e.target.closest('.ct-note-inp'); if(!inp) return;
    var u=inp.dataset.u; clearTimeout(nt);
    nt=setTimeout(function(){ var cur=_restrictMap[u]||{block_insights:false,block_search:false,note:''}; cur.note=inp.value; _restrictMap[u]=cur; post('/api/admin/cli/restrict',{username:u,blockInsights:!!cur.block_insights,blockSearch:!!cur.block_search,note:cur.note},function(){}); },600);
  });
}

/* ── Auto-refresh + updated-ago ── */
setInterval(function(){ var p=document.getElementById('cliTrackPage'); if(p&&p.style.display!=='none'&&!document.hidden) loadTrack(_range,false); },45000);
setInterval(function(){ var el=document.getElementById('ctUpdated'); if(el&&_loadedAt){ var s=Math.floor((Date.now()-_loadedAt)/1000); el.textContent='updated '+(s<5?'just now':s<60?s+'s ago':Math.floor(s/60)+'m ago'); } },1000);
})();
