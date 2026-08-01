/* ═══ cli-search.js — CLI Search (Zamil SMS) — SWR + flat time-sorted feed ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb, timeout){
  var ctrl=new AbortController();
  var t=setTimeout(function(){ctrl.abort();}, timeout||60000);
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify(Object.assign({session:sess()},body||{}))})
    .then(function(r){clearTimeout(t);return r.json().catch(function(){return{ok:false,error:'HTTP '+r.status};});})
    .then(cb).catch(function(e){clearTimeout(t);cb({ok:false,error:e.name==='AbortError'?'Timed out — try again':'Network error'});});
}
function ago(iso){
  if(!iso) return '—';
  var s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(isNaN(s)||s<0) return '—';
  if(s<45) return 'just now'; if(s<90) return '1m ago';
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

var _injected=false, _mode='auto', _deb=null, _lastQ='';

function inject(){
  if(_injected) return; _injected=true;
  fetch('/dashboard/cli-search.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    var inp=document.getElementById('csInput');
    if(inp){
      inp.addEventListener('input', function(){
        document.getElementById('csClear').classList.toggle('show', !!inp.value);
        clearTimeout(_deb); _deb=setTimeout(function(){ csRun(inp.value); }, 350);
      });
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ clearTimeout(_deb); csRun(inp.value,{manual:true}); } });
    }
    startTicks();
  });
}
function startTicks(){
  // 30s: recompute the "x ago" labels in place (no re-fetch, no wipe)
  setInterval(function(){
    document.querySelectorAll('.cs-feed-time[data-t]').forEach(function(el){ el.textContent=ago(el.getAttribute('data-t')); });
  },30000);
  // 60s: silent background refresh (stale-while-revalidate — never blanks)
  setInterval(function(){
    var inp=document.getElementById('csInput'); var q=inp?inp.value.trim():'';
    var pg=document.getElementById('cliSearchPage');
    if(q && pg && pg.style.display!=='none' && !document.hidden) csRun(q,{bg:true});
  },60000);
}
window.openCliSearchPage=function(){
  var p=document.getElementById('cliSearchPage');
  if(p){ p.style.display='block'; window.scrollTo(0,0); var i=document.getElementById('csInput'); if(i) i.focus(); return; }
  inject();
};
window.closeCliSearchPage=function(){ var p=document.getElementById('cliSearchPage'); if(p) p.style.display='none'; };

window.csSetMode=function(m){
  _mode=m;
  document.querySelectorAll('.cs-mode').forEach(function(b){ b.classList.toggle('on', b.dataset.mode===m); });
  var inp=document.getElementById('csInput');
  if(inp && inp.value.trim()){ clearTimeout(_deb); csRun(inp.value,{manual:true}); }
};
window.csClearInput=function(){
  var inp=document.getElementById('csInput'); if(inp) inp.value='';
  document.getElementById('csClear').classList.remove('show');
  resetView(); if(inp) inp.focus();
};
window.csQuick=function(q){
  var inp=document.getElementById('csInput'); if(inp){ inp.value=q; document.getElementById('csClear').classList.add('show'); }
  clearTimeout(_deb); csRun(q,{manual:true});
};
window.csRefresh=function(){ var inp=document.getElementById('csInput'); csRun(inp?inp.value:'',{manual:true}); };

function showTopBar(){ var b=document.getElementById('csTopBar'); if(b) b.classList.add('on'); var r=document.getElementById('csRefreshBtn'); if(r) r.classList.add('spinning'); }
function hideTopBar(){ var b=document.getElementById('csTopBar'); if(b) b.classList.remove('on'); var r=document.getElementById('csRefreshBtn'); if(r) r.classList.remove('spinning'); }
function skeleton(){
  var h='<div class="cs-feed">';
  for(var i=0;i<6;i++) h+='<div class="cs-sk-item"><div class="cs-sk w30"></div><div class="cs-sk w55"></div><div class="cs-sk w40"></div><div class="cs-sk w90"></div></div>';
  return h+'</div>';
}
function resetView(){
  _lastQ='';
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  if(stats) stats.textContent='';
  if(box){ delete box.dataset.filled;
    box.innerHTML='<div class="cs-empty" id="csEmpty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg><div>Type to search the live feed</div></div>';
  }
}

/* ── the run: stale-while-revalidate ──
   - first ever (empty) search  → beautiful skeleton
   - typing / manual refresh    → keep old feed + thin top bar (non-destructive)
   - background auto refresh    → fully silent, swap in place when ready        */
function csRun(q, opts){
  q=(q||'').trim(); _lastQ=q;
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  if(!q){ resetView(); return; }
  opts=opts||{};
  var firstLoad = !box.dataset.filled;
  if(firstLoad){ box.innerHTML=skeleton(); if(stats) stats.textContent='Searching the live feed…'; }
  else if(!opts.bg){ showTopBar(); }
  post('/api/cli/search',{q:q,mode:_mode},function(d){
    hideTopBar();
    if(!d||!d.ok){ if(firstLoad){ box.innerHTML='<div class="cs-empty">Could not search right now — tap ↻ to retry.</div>'; if(stats) stats.textContent=''; } return; }
    render(d);
  },60000);
}

function feedHtml(rows){
  return '<div class="cs-feed">'+rows.map(function(r,i){
    return '<div class="cs-feed-item'+(i===0?' first':'')+'">'
      +'<div class="cs-feed-top"><span class="cs-feed-cli">'+esc(r.cli||'Unknown')+'</span>'
      +(i===0?'<span class="cs-feed-new">most recent</span>':'')
      +'<span class="cs-feed-time" data-t="'+esc(r.t)+'" title="'+esc(pktTime(r.t))+' PKT">'+esc(ago(r.t))+'</span></div>'
      +'<div class="cs-feed-range">'+(r.flag||'')+' '+esc(r.range||'')+'</div>'
      +(r.number?'<div class="cs-feed-num">'+esc(r.number)+'</div>':'')
      +'<div class="cs-feed-msg">'+esc(r.message||'')+'</div>'
      +'</div>';
  }).join('')+'</div>';
}

function render(d){
  var box=document.getElementById('csResults'), stats=document.getElementById('csStats');
  box.dataset.filled='1';
  var rows=d.rows||[];
  if(d.mode==='number'){
    if(stats) stats.innerHTML='Number <b>'+esc(d.number||'')+'</b> · <b>'+rows.length+'</b> OTP'+(rows.length===1?'':'s')+' today';
    if(!rows.length){ box.innerHTML='<div class="cs-empty">No OTP found for <b>'+esc(d.number||'')+'</b> today.</div>'; return; }
    var sum=d.summary||[], h='';
    if(sum.length){ h+='<div class="cs-sum"><span class="cs-sum-lbl">Received from</span>'+sum.map(function(s){return '<span class="cs-sum-chip">'+esc(s.cli)+' <b>'+s.n+'</b></span>';}).join('')+'</div>'; }
    box.innerHTML=h+feedHtml(rows);
    return;
  }
  // text mode (app / country / keyword) — flat feed, newest first, NO client id, NO raw timestamp
  if(stats) stats.innerHTML='<b>'+rows.length+'</b> message'+(rows.length===1?'':'s')+' · newest first';
  if(!rows.length){ box.innerHTML='<div class="cs-empty">Nothing matches <b>“'+esc(_lastQ)+'”</b> in today’s feed.</div>'; return; }
  box.innerHTML=feedHtml(rows);
}
})();
