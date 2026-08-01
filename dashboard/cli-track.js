/* ═══ cli-track.js — usage tracking + restriction UI + access gate wrappers ═══ */
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
function countUp(el,to){ to=+to||0; var t0=performance.now(),dur=720; (function f(t){ var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3); el.textContent=Math.round(to*e).toLocaleString(); if(p<1)requestAnimationFrame(f); })(t0); requestAnimationFrame(function f(t){ var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3); el.textContent=Math.round(to*e).toLocaleString(); if(p<1)requestAnimationFrame(f); }); }

// inject keyframes for the standalone blocked overlay
(function(){ if(document.getElementById('_cliBlockStyle'))return; var s=document.createElement('style'); s.id='_cliBlockStyle'; s.textContent='@keyframes _cliPop{from{opacity:0;transform:scale(.9) translateY(10px)}to{opacity:1;transform:none}}'; document.head.appendChild(s); })();

/* ── access gate + standalone blocked screen (used by the wrappers below) ── */
function _gate(openAction, cb){ post('/api/cli/gate', { openAction: openAction }, cb); }
function _isBlocked(g, feature){ return !!(g && g.ok !== false && g[feature] === false); }   // network error → optimistic allow
function _hideCliPages(){ ['cliPage','cliSearchPage'].forEach(function(id){ var p=document.getElementById(id); if(p) p.style.display='none'; }); }
function _showBlockedFull(feature){
  _hideCliPages();
  var ov=document.getElementById('cliBlockedFull');
  if(!ov){ ov=document.createElement('div'); ov.id='cliBlockedFull'; document.body.appendChild(ov); }
  var label = feature==='search' ? 'CLI Search' : 'CLI Insights';
  ov.style.cssText='position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(720px 320px at 50% -10%,rgba(248,113,113,.10),transparent 70%),var(--bg,#0b0d12)';
  ov.innerHTML =
    '<div style="max-width:380px;width:100%;text-align:center;background:var(--card,#14161d);border:1px solid var(--border,#262a35);border-radius:24px;padding:36px 26px;box-shadow:0 40px 100px -28px rgba(0,0,0,.75);animation:_cliPop .45s cubic-bezier(.2,1.2,.3,1) both;position:relative;overflow:hidden">'
    + '<div style="position:absolute;inset:-40% -10% auto auto;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(248,113,113,.18),transparent 65%);filter:blur(6px)"></div>'
    + '<button onclick="document.getElementById(\'cliBlockedFull\').style.display=\'none\'" style="position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:10px;border:1px solid var(--border,#262a35);background:var(--surface,#1b1e27);color:var(--text,#e8ecf4);cursor:pointer;font-size:1.1rem;line-height:1">←</button>'
    + '<div style="position:relative;width:66px;height:66px;margin:6px auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(248,113,113,.20),rgba(248,113,113,.06));border:1px solid rgba(248,113,113,.32)">'
    + '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>'
    + '<div style="position:relative;font-family:\'Space Grotesk\',sans-serif;font-size:1.18rem;font-weight:700;margin-bottom:8px;color:var(--text,#e8ecf4)">Access Restricted</div>'
    + '<div style="position:relative;font-size:.84rem;color:var(--muted,#9aa3b2);line-height:1.6;margin-bottom:4px"><b style="color:var(--text,#e8ecf4)">'+label+'</b> has been disabled for your account.</div>'
    + '<div style="position:relative;font-size:.72rem;color:var(--muted,#9aa3b2)">This was set by an administrator. Need access? Reach out on WhatsApp.</div>'
    + '</div>';
  ov.style.display='flex';
}
function _hideBlockedFull(){ var ov=document.getElementById('cliBlockedFull'); if(ov) ov.style.display='none'; }

/* ── wrap the existing open-functions so the gate runs first (no edits to cli.js / cli-search.js) ── */
var _origOpenCli    = window.openCliPage;
var _origOpenSearch = window.openCliSearchPage;
window.openCliPage = function(){
  _gate('open_insights', function(g){
    if(_isBlocked(g,'insights')){ _showBlockedFull('insights'); return; }
    _hideBlockedFull();
    if(_origOpenCli) _origOpenCli();
  });
};
window.openCliSearchPage = function(){
  _gate('open_search', function(g){
    if(_isBlocked(g,'search')){ _showBlockedFull('search'); return; }
    _hideBlockedFull();
    if(_origOpenSearch) _origOpenSearch();
  });
};

/* ═══════════════════════════════════════════════════════════
   TRACK PAGE (super admin)
   ═══════════════════════════════════════════════════════════ */
var _inj=false, _range='day', _filter='all', _firstLoad=true, _loadedAt=0;
var _perUser=[], _totals={}, _topQ=[], _window={}, _restrictList=[], _restrictMap={};

function injectTrack(){
  if(_inj) return; _inj=true;
  fetch('/dashboard/cli-track.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    wireTrack();
    // scroll reveal for static blocks
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); },{threshold:.1});
      document.querySelectorAll('#cliTrackPage .ct-rv').forEach(function(e){ io.observe(e); });
    } else document.querySelectorAll('#cliTrackPage .ct-rv').forEach(function(e){ e.classList.add('in'); });
  });
}
window.openTrackPage=function(){ injectTrack(); var p=document.getElementById('cliTrackPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); } loadTrack(_range, _firstLoad); };
window.closeTrackPage=function(){ var p=document.getElementById('cliTrackPage'); if(p) p.style.display='none'; };
window.setTrackRange=function(r){ _range=r; syncSeg(); loadTrack(r, false); };
window.setTrackFilter=function(f){ _filter=f; syncFilters(); renderList(false); };
function syncSeg(){ document.querySelectorAll('#ctSeg button').forEach(function(b){ b.classList.toggle('on', b.dataset.r===_range); }); }
function syncFilters(){ document.querySelectorAll('#ctFilters button').forEach(function(b){ b.classList.toggle('on', b.dataset.f===_filter); }); }

function skeletonAll(){
  var list=document.getElementById('ctList'); if(!list) return;
  var h=''; for(var i=0;i<4;i++) h+='<div class="ct-sk-row"><div class="ct-sk" style="width:45%;margin-bottom:9px"></div><div class="ct-sk" style="width:80%;margin-bottom:9px"></div><div class="ct-sk" style="width:60%"></div></div>';
  list.innerHTML=h;
  var q=document.getElementById('ctTopQ'); if(q) q.innerHTML='<div class="ct-sk" style="width:70%;height:18px"></div>';
}
function loadTrack(range, animate){
  _range=range; syncSeg();
  if(_firstLoad) skeletonAll();
  var done=0, trk=null, rl=null;
  function finish(){
    if(++done<2) return;
    _perUser=trk.perUser||[]; _totals=trk.totals||{}; _topQ=trk.topQueries||[]; _window=trk.window||{};
    _restrictList=rl.list||[]; _restrictMap={}; _restrictList.forEach(function(x){ _restrictMap[x.username]=x; });
    renderStats(animate); renderList(animate); renderTopQ(); renderMeta();
    _loadedAt=Date.now(); _firstLoad=false;
  }
  post('/api/admin/cli/track', { range: range }, function(d){ trk=(d&&d.ok)?d:{perUser:[],totals:{},topQueries:[],window:{}}; finish(); });
  post('/api/admin/cli/restrict-list', {}, function(d){ rl=(d&&d.ok)?d:{list:[]}; finish(); });
}
function renderStats(animate){
  var t=_totals||{};
  var map=[['ctStatUsers',t.uniqueUsers||0],['ctStatIns',t.open_insights||0],['ctStatSrch',t.open_search||0],['ctStatQ',t.search_query||0]];
  map.forEach(function(m){ var el=document.getElementById(m[0]); if(!el)return; if(animate) countUp(el,m[1]); else el.textContent=(m[1]||0).toLocaleString(); });
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
  if(_filter==='restricted') rows=rows.filter(function(p){ return p.isRestricted; });
  rows.sort(function(a,b){ return (a.noActivity-b.noActivity) || (b.total-a.total) || a.username.localeCompare(b.username); });
  return rows;
}
function renderList(animate){
  var list=document.getElementById('ctList'); if(!list) return;
  var rows=buildRows();
  if(!rows.length){ list.innerHTML='<div class="ct-empty">'+(_filter==='restricted'?'No restricted accounts.':'No CLI activity in this window yet.')+'</div>'; return; }
  var maxT=rows.reduce(function(m,p){ return Math.max(m,p.total||0); },0)||1;
  list.innerHTML=rows.map(function(p,i){
    var barW=Math.max(6,Math.round((p.total||0)/maxT*100));
    return '<div class="ct-row">'
      + '<div class="ct-row-top">'
        + '<span class="ct-rank">'+(i+1)+'</span>'
        + '<span class="ct-av" style="--h:'+hue(p.username)+'">'+ini(p.username)+'</span>'
        + '<div class="ct-id"><div class="ct-name">'+esc(p.username)+(p.isRestricted?'<span class="ct-tag red">restricted</span>':'')+(p.noActivity?'<span class="ct-tag mut">no activity</span>':'')+'</div>'
          + '<div class="ct-seen">'+(p.lastSeen?('last seen '+ago(p.lastSeen)):'never active in window')+'</div></div>'
        + '<div class="ct-total"><span class="ct-total-num" data-count="'+(p.total||0)+'">'+(animate?'0':(p.total||0).toLocaleString())+'</span><span class="ct-total-lbl">events</span></div>'
      + '</div>'
      + '<div class="ct-bar"><i data-w="'+barW+'"></i></div>'
      + '<div class="ct-chips">'
        + '<span class="ct-chip i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Insights <b>'+p.open_insights+'</b></span>'
        + '<span class="ct-chip s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>Search page <b>'+p.open_search+'</b></span>'
        + '<span class="ct-chip q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>Searches <b>'+p.search_query+'</b></span>'
      + '</div>'
      + '<div class="ct-access"><span class="ct-access-lbl">Access</span>'
        + '<button class="ct-tog '+(p.block_insights?'off':'on')+'" data-u="'+esc(p.username)+'" data-k="insights">'+(p.block_insights?'Insights blocked':'Insights on')+'</button>'
        + '<button class="ct-tog '+(p.block_search?'off':'on')+'" data-u="'+esc(p.username)+'" data-k="search">'+(p.block_search?'Search blocked':'Search on')+'</button>'
      + '</div>'
      + (p.isRestricted ? '<div class="ct-note"><input class="ct-note-inp" data-u="'+esc(p.username)+'" placeholder="Reason (optional, shown to no one but you)" value="'+esc(p.note)+'"></div>' : '')
    + '</div>';
  }).join('');
  applyVisuals(animate);
}
function applyVisuals(animate){
  var list=document.getElementById('ctList'); if(!list) return;
  if(animate){
    list.querySelectorAll('[data-count]').forEach(function(el){ countUp(el, el.getAttribute('data-count')); });
    requestAnimationFrame(function(){ list.querySelectorAll('.ct-bar>i').forEach(function(i){ i.style.width=i.getAttribute('data-w')+'%'; }); });
  } else {
    list.querySelectorAll('[data-count]').forEach(function(el){ el.textContent=(+el.getAttribute('data-count')||0).toLocaleString(); });
    list.querySelectorAll('.ct-bar>i').forEach(function(i){ i.style.width=i.getAttribute('data-w')+'%'; });
  }
}
function renderTopQ(){
  var el=document.getElementById('ctTopQ'); if(!el) return;
  var q=_topQ||[];
  if(!q.length){ el.innerHTML='<div class="ct-empty" style="padding:8px">No searches recorded in this window.</div>'; return; }
  var max=q[0].n||1;
  el.innerHTML=q.map(function(x){ var sz=(0.74+0.5*(x.n/max)).toFixed(2); return '<span class="ct-qchip" style="font-size:'+sz+'rem"><span class="ct-qchip-q">'+esc(x.q)+'</span><span class="ct-qchip-n">'+x.n+'</span></span>'; }).join('');
}
function saveRestrict(u, bi, bs, note, cb){ post('/api/admin/cli/restrict', { username:u, blockInsights:!!bi, blockSearch:!!bs, note:note||'' }, cb); }
function toggleRestrict(u, k){
  var cur=_restrictMap[u]?Object.assign({},_restrictMap[u]):{block_insights:false,block_search:false,note:''};
  var prev=Object.assign({},cur);
  if(k==='insights') cur.block_insights=!cur.block_insights; else cur.block_search=!cur.block_search;
  _restrictMap[u]=cur; renderList(false);                 // optimistic
  saveRestrict(u, cur.block_insights, cur.block_search, cur.note, function(d){
    if(!d||!d.ok){ _restrictMap[u]=prev; renderList(false); }   // revert on failure
  });
}
function wireTrack(){
  var list=document.getElementById('ctList'); if(!list||list._w) return; list._w=true;
  list.addEventListener('click', function(e){ var b=e.target.closest('.ct-tog'); if(!b) return; toggleRestrict(b.getAttribute('data-u'), b.getAttribute('data-k')); });
  var nt=null;
  list.addEventListener('input', function(e){
    var inp=e.target.closest('.ct-note-inp'); if(!inp) return;
    var u=inp.getAttribute('data-u'); clearTimeout(nt);
    nt=setTimeout(function(){ var cur=_restrictMap[u]||{block_insights:false,block_search:false,note:''}; cur.note=inp.value; _restrictMap[u]=cur; saveRestrict(u,cur.block_insights,cur.block_search,cur.note,function(){}); },600);
  });
}

/* live "updated Xs ago" + silent auto-refresh while the page is open */
setInterval(function(){ var el=document.getElementById('ctUpdated'); if(el&&_loadedAt){ var s=Math.floor((Date.now()-_loadedAt)/1000); el.textContent='updated '+(s<5?'just now':s<60?s+'s ago':Math.floor(s/60)+'m ago'); } },1000);
setInterval(function(){ var p=document.getElementById('cliTrackPage'); if(p&&p.style.display!=='none'&&!document.hidden) loadTrack(_range,false); },45000);

/* reveal the sidebar Track button for super admin only */
function revealTrackBtn(){
  post('/api/auth/role', {}, function(r){
    if(r&&r.ok&&r.role==='super'){ var b=document.getElementById('drawerTrackBtn'); if(b) b.style.display='flex'; }
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', revealTrackBtn); else revealTrackBtn();
})();
