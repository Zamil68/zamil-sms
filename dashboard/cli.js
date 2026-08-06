/* ═══ cli.js — CLI Insights (Zamil SMS) v2 — compact UI + smart cache ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb, timeout){
  var ctrl=new AbortController();
  var t=setTimeout(function(){ctrl.abort();}, timeout||25000);
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify(Object.assign({session:sess()},body||{}))})
    .then(function(r){clearTimeout(t);return r.json().catch(function(){return{ok:false,error:'HTTP '+r.status};});})
    .then(cb).catch(function(e){clearTimeout(t);cb({ok:false,error:e.name==='AbortError'?'Timed out — try again':'Network error'});});
}
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ago(iso){
  if(!iso) return '—';
  var d=new Date(iso), s=Math.floor((Date.now()-d.getTime())/1000);
  if(isNaN(s)||s<0) return '—';
  if(s<45) return 'just now';
  if(s<90) return '1m ago';
  var m=Math.floor(s/60); if(m<60) return m+'m ago';
  var h=Math.floor(m/60); if(h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}
function pktTime(iso){
  if(!iso) return '';
  var d=new Date(iso), h=(d.getUTCHours()+5)%24, m=d.getUTCMinutes();
  var ap=h>=12?'PM':'AM', h12=h%12||12;
  return h12+':'+(m<10?'0':'')+m+' '+ap;
}
function dmy(t){
  if(!t) return '';
  var d=new Date(t);
  if(isNaN(d.getTime())) return '';
  return d.getUTCDate()+' '+MONTHS[d.getUTCMonth()];
}
function loaderHtml(msg){
  return '<div class="zload-wrap"><div class="loader"></div><div class="zload-msg">'+(msg||'Crunching CLI traffic…')+'</div></div>';
}

var _injected=false, _list=[], _stats={}, _role='none';
var _refetchT=null, _tickT=null, _cacheTs=0;
var CACHE_TTL=15*60*1000; /* 15 min — server-friendly for 500 users */

function inject(){
  if(_injected) return; _injected=true;
  fetch('/dashboard/cli.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    var p=document.getElementById('cliPage'); if(p) p.style.display='block';
    window.scrollTo(0,0);
    loadRole(); loadAnalysis(false); startTimers();
  });
}
function startTimers(){
  if(_tickT) clearInterval(_tickT);
  _tickT=setInterval(function(){
    document.querySelectorAll('.cli-time').forEach(function(el){ el.textContent=ago(el.getAttribute('data-ls')); });
  },30000); /* client-only label tick — zero server load */
  if(_refetchT) clearInterval(_refetchT);
  _refetchT=setInterval(function(){
    var p=document.getElementById('cliPage');
    if(p&&p.style.display!=='none'&&!document.hidden) loadAnalysis(true);
  },CACHE_TTL);
}
function loadRole(){
  post('/api/auth/role',{},function(r){
    _role=(r&&r.ok)?r.role:'none';
    var ad=document.getElementById('cliAdminCreds');
    if(ad) ad.style.display=(_role==='super')?'block':'none';
    if(_role==='super') loadCreds();
  });
}
window.openCliPage=function(){
  post('/api/cli/gate',{openAction:'open_insights'},function(g){
    if(g&&g.ok&&g.insights===false){
      var p=document.getElementById('cliPage');
      if(p){
        p.style.display='block';
        var ov=document.getElementById('cliBlockedOv');
        if(!ov){ ov=document.createElement('div'); ov.id='cliBlockedOv'; p.appendChild(ov); }
        ov.style.cssText='position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--bg,#0b0d12) 88%,transparent);backdrop-filter:blur(6px)';
        ov.innerHTML='<div style="max-width:360px;width:100%;text-align:center;background:var(--card,#14161d);border:1px solid var(--border,#262a35);border-radius:24px;padding:36px 26px;box-shadow:0 40px 100px -28px rgba(0,0,0,.75)"><div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(248,113,113,.2),rgba(248,113,113,.06));border:1px solid rgba(248,113,113,.3)"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div><div style="font-family:\'Space Grotesk\',sans-serif;font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--text,#e8ecf4)">Access Restricted</div><div style="font-size:.82rem;color:var(--muted,#9aa3b2);line-height:1.6">CLI Insights has been disabled for your account.</div><div style="font-size:.72rem;color:var(--muted,#9aa3b2);margin-top:4px">Contact your admin on WhatsApp.</div><button onclick="closeCliPage()" style="margin-top:18px;border:0;border-radius:12px;padding:11px 22px;font:inherit;font-weight:700;cursor:pointer;color:#06080f;background:linear-gradient(135deg,#60a5fa,#3b82f6)">Go Back</button></div>';
        ov.style.display='flex';
      }
      return;
    }
    var ov2=document.getElementById('cliBlockedOv'); if(ov2) ov2.style.display='none';
    var p2=document.getElementById('cliPage');
    if(p2){
      p2.style.display='block'; window.scrollTo(0,0);
      if(_list.length&&(Date.now()-_cacheTs)<CACHE_TTL){ renderStats(); cliRenderList(); } /* fresh cache → no fetch */
      else loadAnalysis(false);
      return;
    }
    inject();
  });
};
window.closeCliPage=function(){
  var p=document.getElementById('cliPage'); if(p) p.style.display='none';
  if(_refetchT){ clearInterval(_refetchT); _refetchT=null; } /* sleep when closed */
};

function loadAnalysis(silent){
  var el=document.getElementById('cliList');
  if(!silent&&el&&!_list.length) el.innerHTML=loaderHtml();
  post('/api/cli/analysis',{},function(d){
    if(!d||!d.ok){ if(el&&!_list.length) el.innerHTML='<div class="cli-empty">Could not load CLI data.</div>'; return; }
    _list=d.list||[]; _stats=d.stats||{}; _cacheTs=Date.now();
    renderStats(); cliRenderList();
    if((d.reason==='no_creds'||d.reason==='no_data')&&!d.list.length){
      if(el) el.innerHTML='<div class="cli-empty">'+(_role==='super'?'No data yet — set the analysis panel login below, then tap Refresh.':'Analysis data will appear once the admin configures the analysis panel.')+'</div>';
    }
  },60000);
}
function renderStats(){
  var s=_stats||{};
  var e1=document.getElementById('cliStatSms'); if(e1) e1.textContent=(s.totalSms||0).toLocaleString();
  var e2=document.getElementById('cliStatApps'); if(e2) e2.textContent=(s.totalCli||0).toLocaleString();
  var tf=document.getElementById('cliStatTopFlag'); if(tf) tf.textContent=s.topCountry?s.topCountry.flag:'—';
  var tn=document.getElementById('cliStatTopName'); if(tn) tn.textContent=s.topCountry?s.topCountry.name:'Top country';
  var tc=document.getElementById('cliTopCountries');
  if(tc){
    tc.innerHTML=(s.topCountries||[]).map(function(c){
      return '<span class="cli-chip">'+c.flag+' '+esc(c.name)+' <span class="n">'+c.n.toLocaleString()+'</span></span>';
    }).join('');
  }
}
window.cliRenderList=function(){
  var el=document.getElementById('cliList'); if(!el) return;
  var q=((document.getElementById('cliSearch').value)||'').toLowerCase().trim();
  var data=_list;
  if(q){ data=_list.filter(function(x){ var hay=(x.cli+' '+x.countries.map(function(c){return c.name;}).join(' ')).toLowerCase(); return hay.indexOf(q)>=0; }); }
  if(!data.length){ el.innerHTML='<div class="cli-empty">'+(q?'No apps match “'+esc(q)+'”':'No CLI data yet. Tap the refresh button.')+'</div>'; return; }
  el.innerHTML=data.map(function(x,i){
    var flags=x.countries.slice(0,4).map(function(c){ return '<span class="cli-flag" title="'+esc(c.name)+' · '+c.n.toLocaleString()+' SMS">'+c.flag+'</span>'; }).join('');
    var extra=x.countries.length>4?'<span class="cli-flag-more">+'+(x.countries.length-4)+'</span>':'';
    var ctry=(x.countries&&x.countries.length)?('<div class="cli-ctrylist">'+x.countries.map(function(c){
      var range=c.range||(Array.isArray(c.ranges)?c.ranges.join(', '):c.ranges)||c.rangeName||'';
      var when=dmy(c.last||c.lastSeen||x.lastSeen);
      return '<div class="cli-ctry"><span class="cli-ctry-flag">'+c.flag+'</span>'
        +'<span class="cli-ctry-name">'+esc(c.name)+'</span>'
        +(range?'<span class="cli-ctry-range">'+esc(range)+'</span>':'')
        +(when?'<span class="cli-ctry-date">'+when+'</span>':'')
        +'<span class="cli-ctry-n">'+(c.n||0).toLocaleString()+'</span></div>';
    }).join('')+'</div>'):'';
    var s0=(x.samples&&x.samples[0])
      ? '<div class="cli-sample"><span class="cli-sample-t">'+pktTime(x.samples[0].t)+'</span>'+esc(x.samples[0].text)+'</div>'
      : '<div class="cli-sample">No message sample available.</div>';
    return '<div class="cli-row" style="animation-delay:'+(i<12?(i*0.02):0)+'s">'
      +'<div class="cli-row-top" onclick="cliToggle(this)">'
        +'<span class="cli-rank">'+(i+1)+'</span>'
        +'<div class="cli-main"><div class="cli-name">'+esc(x.cli)+'</div>'
          +'<div class="cli-meta"><span class="cli-flags">'+flags+extra+'</span><span class="cli-dot">·</span><span class="cli-time" data-ls="'+(x.lastSeen||'')+'">'+ago(x.lastSeen)+'</span></div></div>'
        +'<div class="cli-count-box"><div class="cli-count">'+x.count.toLocaleString()+'</div><div class="cli-count-lbl">SMS</div></div>'
        +'<span class="cli-chev">▾</span>'
      +'</div>'
      +'<div class="cli-expand">'+ctry+s0+'</div>'
    +'</div>';
  }).join('');
};
window.cliToggle=function(topEl){
  var row=topEl.closest('.cli-row'); if(row) row.classList.toggle('open');
};
window.cliDoRefresh=function(){
  var btn=document.getElementById('cliRefreshBtn');
  if(btn){ btn.classList.add('spinning'); btn.disabled=true; }
  _cacheTs=0; /* hard refresh bypasses cache */
  post('/api/cli/refresh',{},function(d){
    if(btn){ btn.classList.remove('spinning'); btn.disabled=false; }
    if(d&&d.ok){ loadAnalysis(); }
    else { var el=document.getElementById('cliList'); if(el&&(!_list.length)) el.innerHTML='<div class="cli-empty">'+esc((d&&d.error)||'Refresh failed')+'</div>'; }
  },120000);
};

function loadCreds(){
  post('/api/admin/cli-creds-get',{},function(d){
    if(!d||!d.ok) return;
    var u=document.getElementById('cliCredUser'); if(u&&d.username) u.value=d.username;
    var p=document.getElementById('cliCredPass'); if(p) p.placeholder=d.hasPassword?'••••••••  (saved — leave blank to keep)':'enter password';
  });
}
window.cliSaveCreds=function(){
  var msg=document.getElementById('cliCredMsg');
  var user=document.getElementById('cliCredUser').value.trim();
  var pass=document.getElementById('cliCredPass').value;
  if(!user){ if(msg){msg.style.display='block';msg.style.color='var(--wred,#f87171)';msg.textContent='Username required.';} return; }
  post('/api/admin/cli-creds',{username:user,password:pass},function(d){
    if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--cg,#34d399)':'var(--wred,#f87171)'; msg.textContent=(d&&d.ok)?(d.message||'Saved'):(d&&d.error||'Failed'); }
    if(d&&d.ok){ document.getElementById('cliCredPass').value=''; setTimeout(function(){ cliDoRefresh(); },600); }
  });
};
})();
