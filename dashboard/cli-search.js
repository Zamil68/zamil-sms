/* ═══ cli-search.js — CLI Search with built-in gate + card UI ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb, timeout){
  var ctrl=new AbortController(), t=setTimeout(function(){ctrl.abort();}, timeout||60000);
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify(Object.assign({session:sess()},body||{}))})
    .then(function(r){clearTimeout(t);return r.json().catch(function(){return{ok:false,error:'HTTP '+r.status};});})
    .then(cb).catch(function(e){clearTimeout(t);cb({ok:false,error:e.name==='AbortError'?'Timed out':'Network error'});});
}
function ago(iso){ if(!iso)return '—'; var s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(isNaN(s)||s<0)return '—'; if(s<45)return 'just now'; if(s<90)return '1m ago'; var m=Math.floor(s/60); if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }
function pktTime(iso){ if(!iso)return ''; var d=new Date(iso),h=(d.getUTCHours()+5)%24,m=d.getUTCMinutes(); return (h%12||12)+':'+(m<10?'0':'')+m+' '+(h>=12?'PM':'AM'); }

var _injected=false, _mode='auto', _deb=null, _lastQ='', _gateChecked=false;

/* ── Gate check (built-in, no external wrapper) ── */
function checkGate(cb){
  post('/api/cli/gate',{openAction:'open_search'},function(g){
    if(g&&g.ok&&g.search===false){ showBlocked(); cb(false); return; }
    hideBlocked(); cb(true);
  });
}
function showBlocked(){
  var p=document.getElementById('cliSearchPage');
  if(!p) return;
  var ov=document.getElementById('csBlocked');
  if(!ov){ ov=document.createElement('div'); ov.id='csBlocked'; p.appendChild(ov); }
  ov.style.cssText='position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--bg,#0b0d12) 88%,transparent);backdrop-filter:blur(6px)';
  ov.innerHTML='<div style="max-width:360px;width:100%;text-align:center;background:var(--card,#14161d);border:1px solid var(--border,#262a35);border-radius:24px;padding:36px 26px;box-shadow:0 40px 100px -28px rgba(0,0,0,.75)">'
    +'<div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(248,113,113,.2),rgba(248,113,113,.06));border:1px solid rgba(248,113,113,.3)">'
    +'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>'
    +'<div style="font-family:\'Space Grotesk\',sans-serif;font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--text,#e8ecf4)">Access Restricted</div>'
    +'<div style="font-size:.82rem;color:var(--muted,#9aa3b2);line-height:1.6;margin-bottom:4px"><b style="color:var(--text,#e8ecf4)">CLI Search</b> has been disabled for your account.</div>'
    +'<div style="font-size:.72rem;color:var(--muted,#9aa3b2)">Contact your admin on WhatsApp for access.</div>'
    +'<button onclick="closeCliSearchPage()" style="margin-top:18px;border:0;border-radius:12px;padding:11px 22px;font:inherit;font-weight:700;cursor:pointer;color:#06080f;background:linear-gradient(135deg,#60a5fa,#3b82f6)">Go Back</button>'
    +'</div>';
  ov.style.display='flex';
}
function hideBlocked(){ var ov=document.getElementById('csBlocked'); if(ov) ov.style.display='none'; }

/* ── Open / close (gate is INSIDE — no double-click race) ── */
window.openCliSearchPage=function(){
  checkGate(function(allowed){
    if(!allowed) return;
    if(!_injected){ inject(); return; }
    var p=document.getElementById('cliSearchPage');
    if(p){ p.style.display='block'; window.scrollTo(0,0); var i=document.getElementById('csInput'); if(i) i.focus(); }
  });
};
window.closeCliSearchPage=function(){ var p=document.getElementById('cliSearchPage'); if(p) p.style.display='none'; };

/* ── Inject ── */
function inject(){
  _injected=true;
  fetch('/dashboard/cli-search.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    var p=document.getElementById('cliSearchPage'); if(p) p.style.display='block';
    window.scrollTo(0,0);
    var inp=document.getElementById('csInput');
    if(inp){
      inp.addEventListener('input',function(){
        document.getElementById('csClear').classList.toggle('show',!!inp.value);
        clearTimeout(_deb); _deb=setTimeout(function(){ csRun(inp.value); },350);
      });
      inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ clearTimeout(_deb); csRun(inp.value); } });
      inp.focus();
    }
    startTicks();
  });
}
function startTicks(){
  setInterval(function(){ document.querySelectorAll('.cs-fi-time[data-t]').forEach(function(el){ el.textContent=ago(el.dataset.t); }); },30000);
  setInterval(function(){ var inp=document.getElementById('csInput'); var q=inp?inp.value.trim():''; var pg=document.getElementById('cliSearchPage'); if(q&&pg&&pg.style.display!=='none'&&!document.hidden) csRun(q,true); },60000);
}

/* ── Search logic ── */
window.csSetMode=function(m){ _mode=m; document.querySelectorAll('.cs-mode').forEach(function(b){ b.classList.toggle('on',b.dataset.mode===m); }); var inp=document.getElementById('csInput'); if(inp&&inp.value.trim()){ clearTimeout(_deb); csRun(inp.value); } };
window.csClearInput=function(){ var inp=document.getElementById('csInput'); if(inp) inp.value=''; document.getElementById('csClear').classList.remove('show'); resetView(); if(inp) inp.focus(); };
window.csQuick=function(q){ var inp=document.getElementById('csInput'); if(inp){ inp.value=q; document.getElementById('csClear').classList.add('show'); } clearTimeout(_deb); csRun(q); };
window.csRefresh=function(){ var inp=document.getElementById('csInput'); csRun(inp?inp.value:''); };

function resetView(){
  _lastQ='';
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  if(stats) stats.textContent='';
  if(box){ delete box.dataset.filled; box.innerHTML=defaultEmpty(); }
}
function defaultEmpty(){
  return '<div class="cs-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:42px;height:42px;color:var(--border,#262a35);margin-bottom:12px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>'
    +'<div style="font-weight:700;margin-bottom:6px;color:var(--text,#e8ecf4)">Search the live analysis feed</div>'
    +'<div class="cs-tips"><b>Phone number</b> → every OTP it received today<br><b>App name</b> (GitLab, Talabat…) → its messages, newest first<br><b>Country</b> (Oman, Sri Lanka…) → all messages there<br><b>Keyword</b> (verification, expire…) → matching bodies</div>'
    +'<div class="cs-chips"><button class="cs-chip" onclick="csQuick(\'GitLab\')">GitLab</button><button class="cs-chip" onclick="csQuick(\'Sri Lanka\')">🇱🇰 Sri Lanka</button><button class="cs-chip" onclick="csQuick(\'Talabat\')">Talabat</button><button class="cs-chip" onclick="csQuick(\'verification\')">"verification"</button><button class="cs-chip" onclick="csQuick(\'NETELLER\')">NETELLER</button></div></div>';
}
function skeleton(){
  var h='<div class="cs-feed">'; for(var i=0;i<5;i++) h+='<div class="cs-sk-card"><div class="cs-sk" style="width:35%;margin-bottom:10px"></div><div class="cs-sk" style="width:70%;margin-bottom:8px"></div><div class="cs-sk" style="width:50%;margin-bottom:8px"></div><div class="cs-sk" style="width:90%"></div></div>'; return h+'</div>';
}

function csRun(q, silent){
  q=(q||'').trim(); _lastQ=q;
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  if(!q){ resetView(); return; }
  var firstLoad=!box.dataset.filled;
  if(firstLoad){ box.innerHTML=skeleton(); if(stats) stats.textContent='Searching…'; }
  else if(!silent){ var tb=document.getElementById('csTopBar'); if(tb) tb.classList.add('on'); var rb=document.getElementById('csRefreshBtn'); if(rb) rb.classList.add('spinning'); }
  post('/api/cli/search',{q:q,mode:_mode},function(d){
    var tb=document.getElementById('csTopBar'); if(tb) tb.classList.remove('on');
    var rb=document.getElementById('csRefreshBtn'); if(rb) rb.classList.remove('spinning');
    if(!d||!d.ok){ if(firstLoad){ box.innerHTML='<div class="cs-empty"><div style="font-weight:700;color:var(--text,#e8ecf4)">Could not search right now</div><div style="font-size:.76rem;margin-top:6px">'+esc((d&&d.error)||'')+'</div></div>'; if(stats) stats.textContent=''; } return; }
    render(d);
  },60000);
}

/* ── Render results as CARDS ── */
function render(d){
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  box.dataset.filled='1';
  var rows=d.rows||[];
  if(d.mode==='number'){
    if(stats) stats.innerHTML='Number <b>'+esc(d.number||'')+'</b> · <b>'+rows.length+'</b> OTP'+(rows.length===1?'':'s')+' today';
    if(!rows.length){ box.innerHTML='<div class="cs-empty"><div style="font-weight:700;color:var(--text,#e8ecf4)">No OTP found for <b>'+esc(d.number||'')+'</b> today</div></div>'; return; }
    var sum=d.summary||[];
    var h='';
    if(sum.length){ h+='<div class="cs-sum"><span class="cs-sum-lbl">Received from</span>'+sum.map(function(s){return '<span class="cs-sum-chip">'+esc(s.cli)+' <b>'+s.n+'</b></span>';}).join('')+'</div>'; }
    h+=feedCards(rows);
    box.innerHTML=h; return;
  }
  if(stats) stats.innerHTML='<b>'+rows.length+'</b> message'+(rows.length===1?'':'s')+' · newest first';
  if(!rows.length){ box.innerHTML='<div class="cs-empty"><div style="font-weight:700;color:var(--text,#e8ecf4)">Nothing matches "'+esc(_lastQ)+'"</div><div style="font-size:.76rem;margin-top:6px;color:var(--muted,#9aa3b2)">Try a different app name, country, or keyword</div></div>'; return; }
  box.innerHTML=feedCards(rows);
}

function feedCards(rows){
  return '<div class="cs-feed">'+rows.map(function(r,i){
    return '<div class="cs-card'+(i===0?' first':'')+'" style="animation-delay:'+(i<10?i*0.04:0)+'s">'
      /* header row: app chip + time */
      +'<div class="cs-card-head">'
        +'<span class="cs-app-chip">'+esc(r.cli||'Unknown')+'</span>'
        +(i===0?'<span class="cs-new-tag">most recent</span>':'')
        +'<span class="cs-fi-time" data-t="'+esc(r.t)+'" title="'+esc(pktTime(r.t))+' PKT">'+esc(ago(r.t))+'</span>'
      +'</div>'
      /* meta row: flag + range + number */
      +'<div class="cs-card-meta">'
        +(r.flag?'<span class="cs-flag">'+r.flag+'</span>':'')
        +'<span class="cs-range">'+esc(r.range||'')+'</span>'
        +(r.number?'<span class="cs-num">'+esc(r.number)+'</span>':'')
      +'</div>'
      /* message bubble */
      +'<div class="cs-msg-bubble">'+esc(r.message||'')+'</div>'
    +'</div>';
  }).join('')+'</div>';
}
})();
