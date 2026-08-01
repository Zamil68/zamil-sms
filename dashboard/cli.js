/* ═══ cli.js — CLI Insights (Zamil SMS) ═══ */
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

var _injected=false, _list=[], _stats={}, _role='none';
var _refetchT=null, _tickT=null;

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

function inject(){
  if(_injected) return; _injected=true;
  fetch('/dashboard/cli.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    var p=document.getElementById('cliPage'); if(p) p.style.display='block';
    window.scrollTo(0,0);
    loadRole(); loadAnalysis();
    startTimers();
  });
}
function startTimers(){
  if(_tickT) clearInterval(_tickT);
  _tickT=setInterval(function(){ // recompute "x ago" labels without refetch
    document.querySelectorAll('.cli-time').forEach(function(el){ el.textContent=ago(el.getAttribute('data-ls')); });
  },30000);
  if(_refetchT) clearInterval(_refetchT);
  _refetchT=setInterval(function(){ loadAnalysis(true); },90000); // silent auto-refresh
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
  var p=document.getElementById('cliPage');
  if(p){ p.style.display='block'; window.scrollTo(0,0); loadAnalysis(true); return; }
  inject();
};
window.closeCliPage=function(){ var p=document.getElementById('cliPage'); if(p) p.style.display='none'; };

function loadAnalysis(silent){
  var el=document.getElementById('cliList');
  if(!silent && el && !_list.length) el.innerHTML='<div class="cli-empty">Loading CLI data…</div>';
  post('/api/cli/analysis',{},function(d){
    if(!d||!d.ok){ if(el) el.innerHTML='<div class="cli-empty">Could not load CLI data.</div>'; return; }
    _list=d.list||[]; _stats=d.stats||{};
    renderStats(); cliRenderList();
    if((d.reason==='no_creds'||d.reason==='no_data') && !d.list.length){
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
  var q=(document.getElementById('cliSearch').value||'').toLowerCase().trim();
  var data=_list;
  if(q){ data=_list.filter(function(x){ var hay=(x.cli+' '+x.countries.map(function(c){return c.name;}).join(' ')).toLowerCase(); return hay.indexOf(q)>=0; }); }
  if(!data.length){ el.innerHTML='<div class="cli-empty">'+(q?'No apps match “'+esc(q)+'”':'No CLI data yet. Tap the refresh button.')+'</div>'; return; }
  el.innerHTML=data.map(function(x,i){
    var flags=x.countries.slice(0,4).map(function(c){ return '<span class="cli-flag" title="'+esc(c.name)+' · '+c.n.toLocaleString()+' SMS">'+c.flag+'</span>'; }).join('');
    var extra=x.countries.length>4?'<span class="cli-flag-more">+'+(x.countries.length-4)+'</span>':'';
    var samples=(x.samples&&x.samples.length)?x.samples.map(function(s){
      return '<div class="cli-sample"><span class="cli-sample-t">'+pktTime(s.t)+'</span>'+esc(s.text)+'</div>';
    }).join(''):'<div class="cli-sample">No message sample available.</div>';
    return '<div class="cli-row" style="animation-delay:'+(i<12?(i*0.02):0)+'s">'
      +'<div class="cli-row-top" onclick="cliToggle(this)">'
        +'<span class="cli-rank">'+(i+1)+'</span>'
        +'<div class="cli-main"><div class="cli-name">'+esc(x.cli)+'</div>'
          +'<div class="cli-meta"><span class="cli-flags">'+flags+extra+'</span><span class="cli-dot">·</span><span class="cli-time" data-ls="'+(x.lastSeen||'')+'">'+ago(x.lastSeen)+'</span></div></div>'
        +'<div class="cli-count-box"><div class="cli-count">'+x.count.toLocaleString()+'</div><div class="cli-count-lbl">SMS</div></div>'
        +'<span class="cli-chev">▾</span>'
      +'</div>'
      +'<div class="cli-expand">'+samples+'</div>'
    +'</div>';
  }).join('');
};
window.cliToggle=function(topEl){
  var row=topEl.closest('.cli-row'); if(row) row.classList.toggle('open');
};
window.cliDoRefresh=function(){
  var btn=document.getElementById('cliRefreshBtn');
  if(btn){ btn.classList.add('spinning'); btn.disabled=true; }
  post('/api/cli/refresh',{},function(d){
    if(btn){ btn.classList.remove('spinning'); btn.disabled=false; }
    if(d&&d.ok){ loadAnalysis(); }
    else { var el=document.getElementById('cliList'); if(el&&(!_list.length)) el.innerHTML='<div class="cli-empty">'+esc((d&&d.error)||'Refresh failed')+'</div>'; }
  },120000); // long timeout — full-day scrape
};

/* ── super admin creds ── */
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
