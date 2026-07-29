/* ═══ earning.js — Earnings module (Zamil SMS) ═══ */
(function(){
  /* ── helpers ── */
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function sess(){ return localStorage.getItem('app_session'); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function post(url, body, cb){
    fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({session:sess()}, body||{}))})
      .then(function(r){ return r.json().catch(function(){ return {ok:false, error:'Unexpected response (HTTP '+r.status+')'}; }); })
      .then(cb)
      .catch(function(){ cb({ok:false, error:'Connection error — check your network'}); });
  }

  /* ── state ── */
  var _data=null, _role='none', _notifs=[], _injected=false;
  var _cur = localStorage.getItem('earn_cur') || 'USD';
  var _pkr = parseFloat(localStorage.getItem('earn_pkr_rate')) || 278;

  /* ── formatting ── */
  function hueFor(s){ s=String(s||''); var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))%360; } return h; }
  function fmt(usd){
    if(_cur==='PKR') return 'Rs '+Math.round(usd*_pkr).toLocaleString();
    return '$'+usd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function fmtPlain(usd){
    if(_cur==='PKR') return Math.round(usd*_pkr).toLocaleString();
    return usd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function animNum(el, to, mode){
    var t0=performance.now(), dur=850;
    function fmtv(v){ return mode==='plain'?fmtPlain(v):mode?fmt(v):Math.round(v).toLocaleString(); }
    function step(t){
      var p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
      el.textContent=fmtv(to*e);
      if(p<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── scroll reveal ── */
  function reveal(){
    var els=document.querySelectorAll('#earnPage .rv');
    if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in');}); return; }
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.12});
    els.forEach(function(e){io.observe(e);});
  }

  /* ── inject markup (race-safe: re-renders if data arrived first) ── */
  function inject(){
    if(_injected) return; _injected=true;
    fetch('/dashboard/earning.html').then(function(r){return r.text();}).then(function(h){
      var d=document.createElement('div'); d.innerHTML=h;
      while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
      reveal();
      syncCurUI();
      if(_data) render(_data);   // data arrived before HTML → paint now
    });
  }

  /* ── open / close ── */
  window.openEarnPage=function(){ inject(); var p=document.getElementById('earnPage'); if(p) p.style.display='block'; window.scrollTo(0,0); syncCurUI(); loadAll(); };
  window.closeEarnPage=function(){ var p=document.getElementById('earnPage'); if(p) p.style.display='none'; };

  /* ── currency toggle ── */
  function syncCurUI(){
    document.querySelectorAll('#earnCur button').forEach(function(b){ b.classList.toggle('on', b.dataset.cur===_cur); });
    var pr=document.getElementById('earnPKRrow'); if(pr) pr.style.display=(_cur==='PKR')?'flex':'none';
    var ri=document.getElementById('earnPKRrate'); if(ri) ri.value=_pkr;
  }
  window.setEarnCur=function(c){ _cur=c; localStorage.setItem('earn_cur',c); syncCurUI(); if(_data) render(_data); };
  window.savePKR=function(){ var ri=document.getElementById('earnPKRrate'); _pkr=parseFloat(ri.value)||0; localStorage.setItem('earn_pkr_rate',String(_pkr)); if(_data) render(_data); };

  /* ── load everything ── */
  function loadAll(){
    post('/api/auth/role',{},function(r){
      _role=(r&&r.ok)?r.role:'none';
      document.body.classList.toggle('earn-is-super', _role==='super');
      var ad=document.getElementById('earnAdmin'); if(ad) ad.style.display=(_role==='super')?'block':'none';
      if(_role==='super') loadSettings();
    });
    post('/api/earn/compute',{},function(d){
      if(d&&d.ok){ _data=d; render(d); }
      else { var rg=document.getElementById('earnRanges'); if(rg) rg.innerHTML='<div class="earn-empty">⚠️ '+esc((d&&d.error)||'Could not load earnings')+'</div>'; }
    });
    loadNotifs();
  }

  /* ── render ── */
  function render(d){
    if(!d||!d.me) return;
    var isSuper=(_role==='super');
    var winLabel=(d.window&&d.window.label)||'—';
    var wl=document.getElementById('earnWinLbl'); if(wl) wl.textContent=winLabel+(d.mode==='weekly'?' (weekly)':'');

    /* hero: user's own earning (always visible) */
    var mn=document.getElementById('earnMeNet'); if(mn) animNum(mn, d.me.userNet, 'plain');
    var cl=document.getElementById('earnCurLabel'); if(cl) cl.textContent=(_cur==='PKR'?'Rs':'$');

    /* gross + pool: super-only */
    if(isSuper){
      var mg=document.getElementById('earnMeGross'); if(mg) mg.textContent=fmt(d.me.gross);
      var pool=d.pool||null;
      var pn=document.getElementById('earnPoolNet'); if(pn) pn.textContent=pool?fmt(pool.userNetTotal):'—';
      var pg=document.getElementById('earnPoolGross'); if(pg) pg.textContent=pool?fmt(pool.grossTotal):'—';
    }

    /* goal ring + progress bar */
    var goal=Math.max(1, d.goal||50);
    var pool=d.pool||null;
    var progVal=(isSuper && pool && pool.grossTotal!=null)?pool.grossTotal:d.me.userNet;
    var pct=Math.min(100,(progVal/goal)*100);
    var arc=document.getElementById('earnRingArc'); if(arc) arc.style.strokeDashoffset=(251.3*(1-pct/100)).toFixed(1);
    var gp=document.getElementById('earnGoalPct'); if(gp) gp.textContent=Math.round(pct)+'%';
    var pb=document.getElementById('earnProgressBar'); if(pb) pb.style.width=pct.toFixed(1)+'%';
    var ga=document.getElementById('earnGoalAmt'); if(ga) ga.textContent=fmt(goal);

    /* slogan */
    var sl=document.getElementById('earnSlogan');
    if(sl){ var ns=_sloganFor(d.me.userNet,goal); if(sl.textContent!==ns){ sl.style.animation='none'; void sl.offsetWidth; sl.style.animation=''; sl.textContent=ns; } }

    /* per-range breakdown (gross line super-only) */
    var ranges=d.me.perRange||[];
    var rc=document.getElementById('earnRangeCount'); if(rc) rc.textContent=ranges.length;
    var rg=document.getElementById('earnRanges');
    if(rg){
      if(!ranges.length){ rg.innerHTML='<div class="earn-empty">📭 No OTPs matched yet</div>'; }
      else {
        var maxN=ranges[0].userNet||1;
        rg.innerHTML=ranges.slice(0,60).map(function(r){
          var h=hueFor(r.range), share=Math.max(4,(r.userNet/maxN)*100);
          return '<div class="rr rv in" style="--rc:hsl('+h+',70%,55%)">'
            +'<div class="meta"><div class="rn">'+esc(r.range)+'</div>'
            +'<div class="rc">'+r.count+' OTP'+(r.count>1?'s':'')+' · '+fmt(r.userRate)+'/OTP</div>'
            +'<div class="bar"><i data-w="'+share+'"></i></div></div>'
            +'<div class="figs"><div class="net">'+fmt(r.userNet)+'</div>'
            +(isSuper?'<div class="grs">gross '+fmt(r.gross)+'</div>':'')
            +'</div></div>';
        }).join('');
        requestAnimationFrame(function(){ rg.querySelectorAll('.rr .bar > i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
      }
    }

    /* leaderboard — public, ranked by each user's own earning */
    var lb=d.leaderboard||[];
    var bc=document.getElementById('earnBoardCount'); if(bc) bc.textContent=lb.length;
    var bd=document.getElementById('earnBoard');
    if(bd){
      if(!lb.length){ bd.innerHTML='<div class="earn-empty">📭 No earnings yet</div>'; }
      else {
        bd.innerHTML=lb.slice(0,30).map(function(u,i){
          var h=hueFor(u.username), cls=i===0?'top1':i===1?'top2':i===2?'top3':'';
          var medal=i===0?'👑':i===1?'🥈':i===2?'🥉':('#'+(i+1));
          return '<div class="elb '+cls+' rv in" style="--hue:'+h+'">'
            +'<div class="rk">'+medal+'</div>'
            +'<div class="av">'+esc(String(u.username||'?').slice(0,2).toUpperCase())+'</div>'
            +'<div class="nm">'+esc(u.username)+'</div>'
            +'<div class="amt">'+fmt(u.userNet)+'</div></div>';
        }).join('');
      }
    }

    /* rate count (super panel) */
    var rrc=document.getElementById('earnRateCount'); if(rrc) rrc.textContent=(d.ratesLoaded||0)+' ranges loaded';
  }

  /* ── notifications ── */
  function loadNotifs(){
    post('/api/earn/notifs',{},function(d){
      _notifs=(d&&d.ok&&d.notifs)||[];
      var btn=document.getElementById('earnNotifBtn');
      var last=parseInt(localStorage.getItem('earn_last_notif')||'0');
      var latest=_notifs.length?_notifs[0].id:0;
      if(btn) btn.classList.toggle('has', latest>last && _notifs.length>0);
      if(latest>last && _notifs.length) showNotif(_notifs[0]);
    });
  }
  function showNotif(n){
    if(!n) return;
    var b=document.getElementById('earnNotifBody'); if(b) b.textContent=n.body;
    var ov=document.getElementById('earnNotif'); if(ov) ov.classList.add('show');
    localStorage.setItem('earn_last_notif', String(n.id));
    var btn=document.getElementById('earnNotifBtn'); if(btn) btn.classList.remove('has');
  }
  window.openEarnNotif=function(){ if(_notifs.length) showNotif(_notifs[0]); };
  window.closeEarnNotif=function(){ var ov=document.getElementById('earnNotif'); if(ov) ov.classList.remove('show'); };

  /* ── super: settings ── */
  function loadSettings(){
    post('/api/earn/settings',{},function(d){
      if(!d||!d.ok) return;
      var s=d.settings||{};
      var m=document.getElementById('eaMode'); if(m) m.value=s.mode||'overall';
      var f=document.getElementById('eaFrom'); if(f) f.value=s.from_date||'';
      var t=document.getElementById('eaTo'); if(t) t.value=s.to_date||'';
      var g=document.getElementById('eaGoal'); if(g) g.value=s.goal_usd||50;
    });
  }
  window.saveEarnSettings=function(){
    var msg=document.getElementById('eaMsg');
    post('/api/earn/set-settings',{
      mode:document.getElementById('eaMode').value,
      from_date:document.getElementById('eaFrom').value,
      to_date:document.getElementById('eaTo').value,
      goal_usd:document.getElementById('eaGoal').value
    },function(d){
      if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Window saved — recomputing…':((d&&d.error)||'Failed'); }
      if(d&&d.ok) loadAll();
    });
  };
  window.pushEarnNotif=function(){
    var ta=document.getElementById('eaNotifBody');
    var body=(ta&&ta.value||'').trim();
    if(!body) return;
    post('/api/earn/push-notif',{body:body},function(d){
      var msg=document.getElementById('eaMsg');
      if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Sent to all users':((d&&d.error)||'Failed'); }
      if(d&&d.ok) ta.value='';
    });
  };

  /* ── super: rate import ── */
  window.importEarnRates=function(){
    var ta=document.getElementById('eaRatesTA');
    var txt=(ta&&ta.value)||'';
    if(!txt.trim()){ earnMsg('Paste Range + Rate rows, or upload a CSV file.', false); return; }
    doImport(parseRateRows(txt));
  };
  function earnMsg(t,good){
    var m=document.getElementById('earnImportMsg'); if(!m) return;
    m.style.display='block'; m.style.color=good?'var(--eg)':'var(--red)'; m.textContent=t;
  }
  function parseRateRows(text){
    var rows=[], skipped=0, lines=String(text).split(/\r?\n/);
    for(var i=0;i<lines.length;i++){
      var line=lines[i]; if(!line) continue;
      var trimmed=line.trim(); if(!trimmed) continue;
      if(/^[-|:\s]+$/.test(trimmed)) continue;
      var pipeWrapped=trimmed.charAt(0)==='|'||trimmed.charAt(trimmed.length-1)==='|';
      if(pipeWrapped) trimmed=trimmed.replace(/^\|/,'').replace(/\|$/,'');
      var parts;
      if(line.indexOf('\t')>=0) parts=line.split('\t');
      else if(pipeWrapped) parts=trimmed.split('|');
      else parts=trimmed.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      parts=parts.map(function(p){ return p.replace(/^"|"$/g,'').trim(); }).filter(function(p){ return p.length>0; });
      var rangeIdx=-1;
      for(var a=0;a<parts.length;a++){ if(/[A-Za-z]/.test(parts[a])){ rangeIdx=a; break; } }
      if(rangeIdx<0){ skipped++; continue; }
      var range=parts[rangeIdx];
      if(/^(range|currency|rate|super|user)/i.test(range)){ skipped++; continue; }
      var rate=NaN;
      for(var b=rangeIdx+1;b<parts.length;b++){ var n=parseFloat(String(parts[b]).replace(/[^\d.]/g,'')); if(isFinite(n)){ rate=n; break; } }
      if(!isFinite(rate)||rate<=0){
        for(var c=0;c<parts.length;c++){ if(c===rangeIdx) continue; var n2=parseFloat(String(parts[c]).replace(/[^\d.]/g,'')); if(isFinite(n2)&&n2>0){ rate=n2; break; } }
      }
      if(!isFinite(rate)||rate<=0){ skipped++; continue; }
      rows.push({range:range, rate:rate});
    }
    return {rows:rows, skipped:skipped};
  }
  function doImport(parsed){
    if(!parsed.rows.length){ earnMsg('No valid rows found. Need two columns: Range + Rate. Headers, blanks & zero-rate rows are skipped automatically.', false); return; }
    post('/api/earn/import-rates',{rows:parsed.rows}, function(d){
      if(d&&d.ok){
        var extra=[];
        if(parsed.skipped) extra.push(parsed.skipped+' skipped in file');
        if(d.saved<parsed.rows.length) extra.push((parsed.rows.length-d.saved)+' duplicates merged');
        earnMsg('✅ Saved '+d.saved+' rates'+(extra.length?(' · '+extra.join(' · ')):'')+'. A CSV upload guarantees every row (e.g. all 972).', true);
        loadAll();
      } else earnMsg((d&&d.error)||'Import failed', false);
    });
  }
  function wireRatesFile(){
    var f=document.getElementById('earnRatesFile'), drop=document.getElementById('earnDrop');
    if(f&&!f._w){
      f._w=true;
      f.addEventListener('change', function(){
        var file=f.files&&f.files[0]; if(!file) return;
        var rd=new FileReader();
        rd.onload=function(e){ doImport(parseRateRows(String(e.target.result||''))); };
        rd.onerror=function(){ earnMsg('Could not read that file.', false); };
        rd.readAsText(file); f.value='';
      });
    }
    if(drop&&!drop._w){
      drop._w=true;
      drop.addEventListener('click', function(e){ if(e.target===f) return; if(f) f.click(); });
      ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('drag'); }); });
      ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('drag'); }); });
      drop.addEventListener('drop', function(e){
        var file=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!file) return;
        var rd=new FileReader();
        rd.onload=function(ev){ doImport(parseRateRows(String(ev.target.result||''))); };
        rd.readAsText(file);
      });
    }
  }
  function tryWire(){ if(document.getElementById('earnRatesFile')) wireRatesFile(); else setTimeout(tryWire,250); }

  /* ── motivational slogans ── */
  function _sloganFor(net, goal){
    var lists={
      zero:["Your first dollar is one OTP away 💪","Every champion started at zero — move on 😉","The money's out there waiting — go get it 🌅"],
      start:["Momentum's building — keep going 🔥","Small wins stack into big paydays 🧱","You're on the board now — climb 😉"],
      mid:["Halfway heroes get paid too 🚀","The grind is glowing — don't stop ✨","You can smell the target from here 👃"],
      near:["So close you can taste it 🍯","Finish strong — the bonus is waving 👋","One more push to payday 🏁"],
      done:["Target smashed — you're a machine 🏆","Goal crushed, legend unlocked 👑","You didn't just hit it, you owned it 💎"]
    };
    var g=goal>0?goal:50, pct=net/g;
    var key=net<=0?'zero':pct<0.25?'start':pct<0.75?'mid':pct<1?'near':'done';
    var arr=lists[key];
    return arr[Math.floor(Date.now()/86400000)%arr.length];
  }

  /* ── init ── */
  ready(function(){ tryWire(); });
})();
