/* ═══ earning.js — v2 (plan: owner 100% / admin 80% / member 70% + 10% team) ═══ */
(function(){
'use strict';
function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb){
  fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({session:sess()}, body||{}))})
    .then(function(r){ return r.json().catch(function(){ return {ok:false, error:'HTTP '+r.status}; }); })
    .then(cb).catch(function(e){ cb({ok:false, error:'Network: '+e.message}); });
}
var _data=null, _role='none', _notifs=[], _injected=false;
var _cur = localStorage.getItem('earn_cur') || 'USD';
var _pkr = parseFloat(localStorage.getItem('earn_pkr_rate')) || 278;
var _pollTimer=null, _lastHash='';
function hueFor(s){ s=String(s||''); var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))%360; } return h; }
function fmt(usd){ if(_cur==='PKR') return 'Rs '+Math.round(usd*_pkr).toLocaleString(); return '$'+usd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4}); }
function fmtPlain(usd){ if(_cur==='PKR') return Math.round(usd*_pkr).toLocaleString(); return usd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4}); }
function animNum(el,to,mode){
  var t0=performance.now(),dur=850;
  function fmtv(v){ return mode==='plain'?fmtPlain(v):mode?fmt(v):Math.round(v).toLocaleString(); }
  function step(t){ var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3); el.textContent=fmtv(to*e); if(p<1)requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function reveal(){
  var els=document.querySelectorAll('#earnPage .rv');
  if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in');}); return; }
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} },{threshold:.12}); });
  els.forEach(function(e){io.observe(e);});
}
function inject(){
  if(_injected) return; _injected=true;
  fetch('/dashboard/earning.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    reveal(); syncCurUI(); if(_data) render(_data);
  });
}
window.openEarnPage=function(){ inject(); var p=document.getElementById('earnPage'); if(p)p.style.display='block'; window.scrollTo(0,0); syncCurUI(); loadAll(); startAutoPoll(); };
window.closeEarnPage=function(){ var p=document.getElementById('earnPage'); if(p)p.style.display='none'; stopAutoPoll(); };
function syncCurUI(){
  document.querySelectorAll('#earnCur button').forEach(function(b){ b.classList.toggle('on', b.dataset.cur===_cur); });
  var pr=document.getElementById('earnPKRrow'); if(pr) pr.style.display=(_cur==='PKR')?'flex':'none';
  var ri=document.getElementById('earnPKRrate'); if(ri) ri.value=_pkr;
}
window.setEarnCur=function(c){ _cur=c; localStorage.setItem('earn_cur',c); syncCurUI(); if(_data) render(_data); };
window.savePKR=function(){ var ri=document.getElementById('earnPKRrate'); _pkr=parseFloat(ri.value)||0; localStorage.setItem('earn_pkr_rate',String(_pkr)); if(_data) render(_data); };
function startAutoPoll(){
  stopAutoPoll();
  _pollTimer=setInterval(function(){
    if(document.hidden) return;
    post('/api/earn/compute',{},function(d){
      if(!d||!d.ok) return;
      var hash=JSON.stringify([d.me.total,d.me.userNet,d.me.commission,(d.leaderboard||[]).length,(d.pool||{}).grossTotal,(d.team||{}).totalCommission,(d.company||{}).companyTotal]);
      if(hash!==_lastHash){ _lastHash=hash; _data=d; render(d); flashLive(); }
    });
  },5000);
}
function stopAutoPoll(){ if(_pollTimer){clearInterval(_pollTimer);_pollTimer=null;} }
function flashLive(){ var t=document.getElementById('earnLiveTag'); if(t){ t.style.opacity='1'; setTimeout(function(){t.style.opacity='.6';},800); } }
var _DETAILS={
  hero:{t:'💰 Your Final Earnings',b:'This is your FINAL payout — owner 100%, admin 80%, member 70% of each range rate, plus 10% team commission for admins. Full-rate ranges pay 100%. No deduction numbers are shown to members.'},
  ranges:{t:'📈 Range Breakdown',b:'Each range with OTP count and your final earning for it. Members see only final amounts; admins/super see deduction details.'},
  board:{t:'🏆 Leaderboard',b:'All users ranked by final earning in the window. Auto-updates every 5 seconds.'}
};
window.earnDetail=function(k){ var d=_DETAILS[k]; if(!d)return; var t=document.getElementById('earnDetailTitle'); if(t)t.textContent=d.t; var b=document.getElementById('earnDetailBody'); if(b)b.textContent=d.b; var ov=document.getElementById('earnDetail'); if(ov)ov.classList.add('show'); };
window.closeEarnDetail=function(){ var ov=document.getElementById('earnDetail'); if(ov)ov.classList.remove('show'); };
function loadAll(){
  post('/api/auth/role',{},function(r){
    _role=(r&&r.ok)?r.role:'none';
    document.body.classList.toggle('earn-is-super', _role==='super');
    var ad=document.getElementById('earnAdmin');
    if(ad) ad.style.display=(_role==='super'||_role==='admin')?'block':'none';
    if(_role==='super'||_role==='admin'){ loadSettings(); loadRangeDeductions(); }
  });
  post('/api/earn/compute',{},function(d){
    if(d&&d.ok){ _data=d; _role=d.role||_role; _lastHash=JSON.stringify([d.me.total,d.me.userNet,d.me.commission,(d.leaderboard||[]).length,(d.team||{}).totalCommission,(d.company||{}).companyTotal]); render(d); }
    else { var rg=document.getElementById('earnRanges'); if(rg) rg.innerHTML='<div class="earn-empty">⚠️ '+esc((d&&d.error)||'Could not load')+'</div>'; }
  });
  loadNotifs();
}
function render(d){
  if(!d||!d.me) return;
  var isSuper=(_role==='super'), isAdminish=(_role==='super'||_role==='admin');
  var total=(d.me.total!=null?d.me.total:d.me.userNet);
  var wl=document.getElementById('earnWinLbl'); if(wl) wl.textContent=((d.window&&d.window.label)||'—')+(d.mode==='weekly'?' (weekly)':'');
  var mn=document.getElementById('earnMeNet'); if(mn) animNum(mn,total,'plain');
  var cl=document.getElementById('earnCurLabel'); if(cl) cl.textContent=(_cur==='PKR'?'Rs':'$');
  var rchip=document.getElementById('earnRoleChip');
  if(rchip){ rchip.style.display='inline-flex';
    rchip.className='earn-role-chip'+(isSuper?' owner':isAdminish?' admin':'');
    rchip.textContent=isSuper?'👑 Owner · 100% share':isAdminish?'🛡️ Admin · 80% + 10% team':'⭐ Member · 70% share';
  }
  var sr=document.getElementById('earnShareRow');
  if(sr){
    var chips=[['Owner','100%',isSuper],['Admin','80%',!isSuper&&isAdminish],['Member','70%',!isAdminish],['Team commission','10%',!isSuper&&isAdminish]];
    sr.innerHTML=chips.map(function(c){ return '<span class="earn-share-chip'+(c[2]?' me':'')+'">'+c[0]+' <b>'+c[1]+'</b></span>'; }).join('');
  }
  var cw=document.getElementById('earnCommWrap');
  if(cw){ var show=(d.me.commission>0)||isAdminish; cw.classList.toggle('show',!!show);
    var cn=document.getElementById('earnCommNet'); if(cn) cn.textContent=fmt(d.me.commission||0);
    var on=document.getElementById('earnOwnNet'); if(on) on.textContent=fmt(d.me.userNet||0);
  }
  if(isSuper){
    var mg=document.getElementById('earnMeGross'); if(mg) mg.textContent=fmt(d.me.gross);
    var pool=d.pool||d.company||null;
    var pn=document.getElementById('earnPoolNet'); if(pn) pn.textContent=pool?fmt(pool.userNetTotal):'—';
    var pg=document.getElementById('earnPoolGross'); if(pg) pg.textContent=pool?fmt(pool.companyTotal):'—';
    var asec=document.getElementById('earnAdminsSec'), abody=document.getElementById('earnAdmins');
    if(asec) asec.style.display=(pool&&pool.admins&&pool.admins.length)?'flex':'none';
    if(abody&&pool&&pool.admins){
      var ac=document.getElementById('earnAdminsCount'); if(ac) ac.textContent=pool.admins.length;
      abody.innerHTML=pool.admins.map(function(a,i){
        var h=hueFor(a.username);
        return '<div class="elb rv in" style="--hue:'+h+'"><div class="rk">'+(i+1)+'</div><div class="av">'+esc(String(a.username||'?').slice(0,2).toUpperCase())+'</div><div class="nm">'+esc(a.username)+'<div style="font-size:.62rem;color:var(--muted);font-weight:600">own '+fmt(a.ownNet)+' + comm '+fmt(a.commission)+' · '+a.teamOtps+' OTPs</div></div><div class="amt">'+fmt(a.total)+'</div></div>';
      }).join('');
    }
    var csec=document.getElementById('earnCompSec'), cbody=document.getElementById('earnCompRanges');
    if(csec) csec.style.display=(pool&&pool.perRange&&pool.perRange.length)?'flex':'none';
    if(cbody&&pool&&pool.perRange){
      var cc=document.getElementById('earnCompCount'); if(cc) cc.textContent=pool.perRange.length;
      cbody.innerHTML=pool.perRange.slice(0,60).map(function(r){
        var h=hueFor(r.range);
        return '<div class="rr rv in" style="--rc:hsl('+h+',70%,55%)"><div class="meta"><div class="rn">'+esc(r.range)+'</div><div class="rc">'+r.count+' OTPs · company '+fmt(r.company)+'</div></div><div class="figs"><div class="net">'+fmt(r.gross)+'</div><div class="grs">users '+fmt(r.userNet)+'</div></div></div>';
      }).join('');
    }
  }
  var team=d.team||null;
  var tsec=document.getElementById('earnTeamSec'), tbody=document.getElementById('earnTeam');
  if(tsec) tsec.style.display=(team&&team.members&&team.members.length)?'flex':'none';
  if(tbody){
    if(team&&team.members){
      var tc=document.getElementById('earnTeamCount'); if(tc) tc.textContent=team.members.length;
      var maxT=team.members[0]?team.members[0].userNet:1;
      tbody.innerHTML=team.members.slice(0,80).map(function(m){
        var h=hueFor(m.username), share=Math.max(4,(m.userNet/maxT)*100);
        return '<div class="rr rv in" style="--rc:hsl('+h+',70%,55%)"><div class="meta"><div class="rn">'+esc(m.username)+'</div><div class="rc">'+m.count+' OTPs · 70% pool · your 10% = '+fmt(m.commission)+'</div><div class="bar"><i data-w="'+share+'"></i></div></div><div class="figs"><div class="net">'+fmt(m.userNet)+'</div></div></div>';
      }).join('');
      requestAnimationFrame(function(){ tbody.querySelectorAll('.rr .bar > i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
    } else tbody.innerHTML='';
  }
  var goal=Math.max(1,d.goal||50);
  var progVal=(isSuper&&(d.pool)&&d.pool.grossTotal!=null)?d.pool.grossTotal:total;
  var pct=Math.min(100,(progVal/goal)*100);
  var arc=document.getElementById('earnRingArc'); if(arc) arc.style.strokeDashoffset=(251.3*(1-pct/100)).toFixed(1);
  var gp=document.getElementById('earnGoalPct'); if(gp) gp.textContent=Math.round(pct)+'%';
  var pb=document.getElementById('earnProgressBar'); if(pb) pb.style.width=pct.toFixed(1)+'%';
  var ga=document.getElementById('earnGoalAmt'); if(ga) ga.textContent=fmt(goal);
  var sl=document.getElementById('earnSlogan');
  if(sl){ var ns=_sloganFor(total,goal); if(sl.textContent!==ns){ sl.style.animation='none'; void sl.offsetWidth; sl.style.animation=''; sl.textContent=ns; } }
  var ranges=d.me.perRange||[];
  var rc=document.getElementById('earnRangeCount'); if(rc) rc.textContent=ranges.length;
  var rg=document.getElementById('earnRanges');
  if(rg){
    if(!ranges.length){ rg.innerHTML='<div class="earn-empty">📭 No OTPs matched yet</div>'; }
    else{
      var maxN=ranges[0].userNet||1;
      rg.innerHTML=ranges.slice(0,60).map(function(r){
        var h=hueFor(r.range), share=Math.max(4,(r.userNet/maxN)*100);
        var sub=r.count+' OTP'+(r.count>1?'s':'')+(r.isFull?' · full rate':'')+(isAdminish&&r.dedPct!=null?' · '+r.dedPct+'% ded':'');
        return '<div class="rr rv in" style="--rc:hsl('+h+',70%,55%)"><div class="meta"><div class="rn">'+esc(r.range)+'</div><div class="rc">'+sub+'</div><div class="bar"><i data-w="'+share+'"></i></div></div><div class="figs"><div class="net">'+fmt(r.userNet)+'</div>'+(isSuper?'<div class="grs">gross '+fmt(r.gross)+'</div>':'')+'</div></div>';
      }).join('');
      requestAnimationFrame(function(){ rg.querySelectorAll('.rr .bar > i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
    }
  }
  var lb=d.leaderboard||[];
  var bc=document.getElementById('earnBoardCount'); if(bc) bc.textContent=lb.length;
  var bd=document.getElementById('earnBoard');
  if(bd){
    if(!lb.length){ bd.innerHTML='<div class="earn-empty">📭 No earnings yet</div>'; }
    else{
      bd.innerHTML=lb.slice(0,30).map(function(u,i){
        var h=hueFor(u.username), cls=i===0?'top1':i===1?'top2':i===2?'top3':'';
        var medal=i===0?'👑':i===1?'🥈':i===2?'🥉':('#'+(i+1));
        return '<div class="elb '+cls+' rv in" style="--hue:'+h+'"><div class="rk">'+medal+'</div><div class="av">'+esc(String(u.username||'?').slice(0,2).toUpperCase())+'</div><div class="nm">'+esc(u.username)+'</div><div class="amt">'+fmt(u.userNet)+'</div></div>';
      }).join('');
    }
  }
}
function loadNotifs(){
  post('/api/earn/notifs',{},function(d){
    _notifs=(d&&d.ok&&d.notifs)||[];
    var btn=document.getElementById('earnNotifBtn');
    var last=parseInt(localStorage.getItem('earn_last_notif')||'0');
    var latest=_notifs.length?_notifs[0].id:0;
    if(btn){ btn.style.display='flex'; btn.classList.toggle('has', latest>last && _notifs.length>0); }
    if(latest>last && _notifs.length) showNotif(_notifs[0]);
  });
}
function showNotif(n){ if(!n)return; var b=document.getElementById('earnNotifBody'); if(b)b.textContent=n.body; var ov=document.getElementById('earnNotif'); if(ov)ov.classList.add('show'); localStorage.setItem('earn_last_notif',String(n.id)); var btn=document.getElementById('earnNotifBtn'); if(btn)btn.classList.remove('has'); }
window.openEarnNotif=function(){ if(_notifs.length) showNotif(_notifs[0]); };
window.closeEarnNotif=function(){ var ov=document.getElementById('earnNotif'); if(ov)ov.classList.remove('show'); };
function loadSettings(){
  post('/api/earn/settings',{},function(d){ if(!d||!d.ok)return; var s=d.settings||{};
    var m=document.getElementById('eaMode'); if(m)m.value=s.mode||'overall';
    var f=document.getElementById('eaFrom'); if(f)f.value=s.from_date||'';
    var t=document.getElementById('eaTo'); if(t)t.value=s.to_date||'';
    var g=document.getElementById('eaGoal'); if(g)g.value=s.goal_usd||50; });
}
window.saveEarnSettings=function(){
  var msg=document.getElementById('eaMsg');
  post('/api/earn/set-settings',{mode:document.getElementById('eaMode').value,from_date:document.getElementById('eaFrom').value,to_date:document.getElementById('eaTo').value,goal_usd:document.getElementById('eaGoal').value},function(d){
    if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Saved':((d&&d.error)||'Failed'); }
    if(d&&d.ok) loadAll(); });
};
window.pushEarnNotif=function(){
  var ta=document.getElementById('eaNotifBody'); var body=(ta&&ta.value||'').trim(); if(!body)return;
  post('/api/earn/push-notif',{body:body},function(d){
    var msg=document.getElementById('eaMsg');
    if(msg){ msg.style.display='block'; msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Sent':((d&&d.error)||'Failed'); }
    if(d&&d.ok) ta.value=''; });
};
var _rdData=[];
function loadRangeDeductions(){ post('/api/admin/range-deductions',{},function(d){ if(!d||!d.ok||!d.ranges)return; _rdData=d.ranges; renderRDTable(); }); }
function renderRDTable(){
  var tb=document.getElementById('rdBody'); if(!tb)return;
  if(!_rdData.length){ tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted)">No ranges found</td></tr>'; return; }
  tb.innerHTML=_rdData.map(function(r,i){
    return '<tr data-idx="'+i+'"><td><input type="checkbox" class="rd-cb rd-row-cb" data-idx="'+i+'"></td>'
      +'<td class="rd-raw" title="'+esc(r.raw)+'">'+esc(r.raw)+'</td>'
      +'<td class="rd-rate">'+r.rate.toFixed(4)+'</td>'
      +'<td><input type="number" class="rd-inp" value="'+r.deductionPercent+'" min="0" max="100" data-idx="'+i+'" '+(r.isFullRate?'disabled':'')+'></td>'
      +'<td><input type="checkbox" class="rd-cb rd-full-cb" data-idx="'+i+'" '+(r.isFullRate?'checked':'')+' onchange="rdFullToggle(this)"></td></tr>';
  }).join('');
}
window.rdFullToggle=function(cb){ var row=cb.closest('tr'); var inp=row.querySelector('.rd-inp'); if(inp) inp.disabled=cb.checked; };
window.rdToggleAll=function(m){ document.querySelectorAll('.rd-row-cb').forEach(function(cb){ cb.checked=m.checked; }); };
window.rdSelectAll=function(){ document.querySelectorAll('.rd-row-cb').forEach(function(cb){ cb.checked=true; }); var ca=document.getElementById('rdCheckAll'); if(ca)ca.checked=true; };
window.rdDeselectAll=function(){ document.querySelectorAll('.rd-row-cb').forEach(function(cb){ cb.checked=false; }); var ca=document.getElementById('rdCheckAll'); if(ca)ca.checked=false; };
window.rdSetBulk=function(pct){
  document.querySelectorAll('.rd-row-cb:checked').forEach(function(cb){
    var row=cb.closest('tr'), inp=row.querySelector('.rd-inp'), fullCb=row.querySelector('.rd-full-cb');
    if(pct===0){ if(fullCb)fullCb.checked=true; if(inp)inp.disabled=true; }
    else{ if(fullCb)fullCb.checked=false; if(inp){inp.disabled=false;inp.value=pct;} } });
};
window.rdSave=function(){
  var items=[];
  document.querySelectorAll('.rd-row-cb:checked').forEach(function(cb){
    var idx=parseInt(cb.dataset.idx), r=_rdData[idx]; if(!r)return;
    var row=cb.closest('tr'), inp=row.querySelector('.rd-inp'), fullCb=row.querySelector('.rd-full-cb');
    items.push({norm:r.norm,rangeRaw:r.raw,deductionPercent:inp?parseFloat(inp.value)||30:30,isFullRate:fullCb?fullCb.checked:false}); });
  if(!items.length){ alert('Select at least one range'); return; }
  var msg=document.getElementById('rdMsg');
  if(msg){ msg.style.display='block'; msg.style.color='var(--muted)'; msg.textContent='Saving '+items.length+' ranges…'; }
  post('/api/admin/save-range-deductions',{items:items},function(d){
    if(msg){ msg.style.color=(d&&d.ok)?'var(--eg)':'var(--red)'; msg.textContent=(d&&d.ok)?'✅ Saved '+items.length+' ranges':((d&&d.error)||'Failed'); }
    if(d&&d.ok) loadAll(); });
};
function _sloganFor(net,goal){
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
ready(function(){});
})();
