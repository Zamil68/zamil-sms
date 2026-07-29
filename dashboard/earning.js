/* ═══ earning.js — Earnings module (Zamil SMS) ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function sess(){ return localStorage.getItem('app_session'); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function post(url, body, cb){ fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},body||{}))}).then(function(r){return r.json();}).then(cb).catch(function(){ cb({ok:false,error:'Connection error'}); }); }

  var _data=null, _role='none', _notifs=[], _injected=false;
  var _cur = localStorage.getItem('earn_cur') || 'USD';
  var _pkr = parseFloat(localStorage.getItem('earn_pkr_rate')) || 278;

  function hueFor(s){ s=String(s||''); var h=0; for(var i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))%360; } return h; }
  function fmt(usd){
    if(_cur==='PKR'){ var v=usd*_pkr; return 'Rs '+Math.round(v).toLocaleString(); }
    return '$'+usd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function animNum(el, to, money){
    var from=0, t0=performance.now(), dur=850;
    function step(t){ var p=Math.min(1,(t-t0)/dur); var e=1-Math.pow(1-p,3); var val=from+(to-from)*e; el.textContent = money?fmt(val):Math.round(val).toLocaleString(); if(p<1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function reveal(){ var els=document.querySelectorAll('#earnPage .rv'); if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in');}); return; }
    var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); },{threshold:.12}); els.forEach(function(e){io.observe(e);}); }

  function inject(){ if(_injected) return; _injected=true; fetch('/dashboard/earning.html').then(function(r){return r.text();}).then(function(h){ var d=document.createElement('div'); d.innerHTML=h; document.body.appendChild(d.firstElementChild); while(d.firstChild) document.body.appendChild(d.firstChild); reveal(); }); }

  window.openEarnPage=function(){ inject(); var p=document.getElementById('earnPage'); if(p) p.style.display='block'; window.scrollTo(0,0); syncCurUI(); loadAll(); };
  window.closeEarnPage=function(){ var p=document.getElementById('earnPage'); if(p) p.style.display='none'; };

  function syncCurUI(){ document.querySelectorAll('#earnCur button').forEach(function(b){ b.classList.toggle('on', b.dataset.cur===_cur); }); var pr=document.getElementById('earnPKRrow'); if(pr) pr.style.display=(_cur==='PKR')?'flex':'none'; var ri=document.getElementById('earnPKRrate'); if(ri) ri.value=_pkr; }
  window.setEarnCur=function(c){ _cur=c; localStorage.setItem('earn_cur',c); syncCurUI(); if(_data) render(_data); };
  window.savePKR=function(){ var ri=document.getElementById('earnPKRrate'); _pkr=parseFloat(ri.value)||0; localStorage.setItem('earn_pkr_rate',String(_pkr)); if(_data) render(_data); };

  function loadAll(){
    post('/api/auth/role',{},function(r){ _role=(r&&r.ok)?r.role:'none'; var ad=document.getElementById('earnAdmin'); if(ad) ad.style.display=(_role==='super')?'block':'none'; if(_role==='super') loadSettings(); });
    post('/api/earn/compute',{},function(d){ if(d&&d.ok){ _data=d; render(d); } else { var rg=document.getElementById('earnRanges'); if(rg) rg.innerHTML='<div class="earn-empty">⚠️ '+(d&&d.error||'Could not load earnings')+'</div>'; } });
    loadNotifs();
  }

  function render(d){
    var wl=document.getElementById('earnWinLbl'); if(wl) wl.textContent=d.window.label+(d.mode==='weekly'?' (weekly)':'');
    var mn=document.getElementById('earnMeNet'); if(mn) animNum(mn, d.me.userNet, true);
    var mg=document.getElementById('earnMeGross'); if(mg) mg.textContent=fmt(d.me.gross);
    var pn=document.getElementById('earnPoolNet'); if(pn) pn.textContent=fmt(d.pool.userNetTotal);
    var pg=document.getElementById('earnPoolGross'); if(pg) pg.textContent=fmt(d.pool.grossTotal);
    // goal ring tracks gross volume toward goal
    var goal=Math.max(1, d.goal||50), pct=Math.min(100, (d.pool.grossTotal/goal)*100);
    var arc=document.getElementById('earnRingArc'); if(arc) arc.style.strokeDashoffset = (226.2*(1-pct/100)).toFixed(1);
    var gp=document.getElementById('earnGoalPct'); if(gp) gp.textContent=Math.round(pct)+'%';
    // per-range
    var rc=document.getElementById('earnRangeCount'); if(rc) rc.textContent=d.me.perRange.length;
    var rg=document.getElementById('earnRanges');
    if(rg){
      if(!d.me.perRange.length){ rg.innerHTML='<div class="earn-empty">No matched OTPs yet for this window. Check that rates are imported and the window covers your traffic.</div>'; }
      else { var maxN=d.me.perRange[0].userNet||1; rg.innerHTML=d.me.perRange.slice(0,60).map(function(r){ var h=hueFor(r.range); var share=Math.max(4,(r.userNet/maxN)*100);
        return '<div class="rr rv in" style="--rc:hsl('+h+',70%,55%)"><div class="meta"><div class="rn">'+esc(r.range)+'</div><div class="rc">'+r.count+' OTP'+(r.count>1?'s':'')+' · '+fmt(r.userRate)+'/OTP</div><div class="bar"><i data-w="'+share+'"></i></div></div><div class="figs"><div class="net">'+fmt(r.userNet)+'</div><div class="grs">gross '+fmt(r.gross)+'</div></div></div>'; }).join('');
        requestAnimationFrame(function(){ rg.querySelectorAll('.rr .bar > i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); }); }
    }
    // leaderboard
    var bc=document.getElementById('earnBoardCount'); if(bc) bc.textContent=d.leaderboard.length;
    var bd=document.getElementById('earnBoard');
    if(bd){
      if(!d.leaderboard.length){ bd.innerHTML='<div class="earn-empty">No earnings recorded yet.</div>'; }
      else { bd.innerHTML=d.leaderboard.slice(0,30).map(function(u,i){ var h=hueFor(u.username); var cls=i===0?'top1':i===1?'top2':i===2?'top3':''; var medal=i===0?'👑':i===1?'🥈':i===2?'🥉':('#'+(i+1));
        return '<div class="elb '+cls+' rv in" style="--hue:'+h+'"><div class="rk">'+medal+'</div><div class="av">'+esc(String(u.username||'?').slice(0,2).toUpperCase())+'</div><div class="nm">'+esc(u.username)+'</div><div class="amt">'+fmt(u.userNet)+'</div></div>'; }).join(''); }
    }
    var rrc=document.getElementById('earnRateCount'); if(rrc) rrc.textContent=(d.ratesLoaded||0)+' ranges loaded';
  }

  /* notifications */
  function loadNotifs(){ post('/api/earn/notifs',{},function(d){ _notifs=(d&&d.ok&&d.notifs)||[]; var btn=document.getElementById('earnNotifBtn'); var last=parseInt(localStorage.getItem('earn_last_notif')||'0'); var latest=_notifs.length?_notifs[0].id:0; if(btn) btn.classList.toggle('has', latest>last && _notifs.length>0); if(latest>last && _notifs.length){ showNotif(_notifs[0]); } }); }
  function showNotif(n){ if(!n) return; var b=document.getElementById('earnNotifBody'); if(b) b.textContent=n.body; var ov=document.getElementById('earnNotif'); if(ov) ov.classList.add('show'); localStorage.setItem('earn_last_notif', String(n.id)); var btn=document.getElementById('earnNotifBtn'); if(btn) btn.classList.remove('has'); }
  window.openEarnNotif=function(){ if(_notifs.length) showNotif(_notifs[0]); };
  window.closeEarnNotif=function(){ var ov=document.getElementById('earnNotif'); if(ov) ov.classList.remove('show'); };

  /* super: settings */
  function loadSettings(){ post('/api/earn/settings',{},function(d){ if(!d||!d.ok) return; var s=d.settings||{}; var m=document.getElementById('eaMode'); if(m) m.value=s.mode||'overall'; var f=document.getElementById('eaFrom'); if(f) f.value=s.from_date||''; var t=document.getElementById('eaTo'); if(t) t.value=s.to_date||''; var g=document.getElementById('eaGoal'); if(g) g.value=s.goal_usd||50; }); }
  window.saveEarnSettings=function(){ var msg=document.getElementById('eaMsg'); post('/api/earn/set-settings',{mode:document.getElementById('eaMode').value,from_date:document.getElementById('eaFrom').value,to_date:document.getElementById('eaTo').value,goal_usd:document.getElementById('eaGoal').value},function(d){ if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Window saved — recomputing…':((d&&d.error)||'Failed'); } if(d&&d.ok) loadAll(); }); };
  window.pushEarnNotif=function(){ var ta=document.getElementById('eaNotifBody'); var body=(ta&&ta.value||'').trim(); if(!body) return; post('/api/earn/push-notif',{body:body},function(d){ var msg=document.getElementById('eaMsg'); if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?' Sent to all users':((d&&d.error)||'Failed'); } if(d&&d.ok){ ta.value=''; } }); };
  window.importEarnRates=function(){ var ta=document.getElementById('eaRatesTA'); var txt=(ta&&ta.value)||''; var rows=[]; txt.split(/\r?\n/).forEach(function(line){ var parts=line.split(/\t/); if(parts.length<2) parts=line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); if(parts.length<2) parts=line.split('|'); if(parts.length<2) return; var range=parts[0].replace(/^"|"$/g,'').trim(); var rate=parseFloat((parts[1]||'').replace(/[^\d.]/g,'')); if(range && isFinite(rate) && rate>0) rows.push({range:range,rate:rate}); });
    if(!rows.length){ var msg=document.getElementById('eaMsg'); if(msg){ msg.style.display='block'; msg.style.color='var(--red)'; msg.textContent='No valid rows found. Paste Range<TAB>Rate per line.'; } return; }
    post('/api/earn/import-rates',{rows:rows},function(d){ var msg=document.getElementById('eaMsg'); if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?('✅ Imported '+(d.saved||0)+' ranges'):'Import failed'; } if(d&&d.ok){ ta.value=''; loadAll(); } }); };

  ready(function(){ /* lazy: only inject when opened */ });
})();
