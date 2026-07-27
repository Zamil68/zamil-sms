/* ═══ TEAM REPORT (admin + super) — daily/weekly OTPs per team + copy ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function sess(){ return localStorage.getItem('app_session'); }
  var _trData=null;
  window.openTeamReport  = function(){ var p=document.getElementById('teamReportPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); loadTeamReport(false); } };
  window.closeTeamReport = function(){ var p=document.getElementById('teamReportPage'); if(p) p.style.display='none'; };
  window.loadTeamReport = function(force){
    var box=document.getElementById('trList'); if(box) box.innerHTML='<div style="text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Crunching team OTPs…</div>';
    fetch('/api/admin/team-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),force:!!force})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ if(box) box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">'+((d&&d.error)||'Failed')+'</div>'; return; }
        _trData=d; renderReport(d);
      }).catch(function(){ if(box) box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">Connection error</div>'; });
  };
  function renderReport(d){
    var sub=document.getElementById('trSub'); if(sub) sub.textContent=(d.date||'')+' · '+(d.cached?'cached':'fresh');
    var hot=document.getElementById('trHot');
    if(hot){ if(d.hottest){ hot.style.display='block'; hot.innerHTML='<div style="background:linear-gradient(135deg,rgba(245,158,11,.14),rgba(239,68,68,.12));border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px 14px;font-size:.82rem;font-weight:700;color:var(--text)">🔥 Hottest team today: <b>'+(escH(d.hottest.prefix)||'System Generated')+'</b> · '+d.hottest.otpToday+' OTPs</div>'; } else hot.style.display='none'; }
    var box=document.getElementById('trList'); if(!box) return;
    var teams=d.teams||[]; if(!teams.length){ box.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--muted)">No teams yet.</div>'; return; }
    var max=Math.max(1, teams.reduce(function(m,t){ return Math.max(m, t.otpToday||0); }, 0));
    var h='';
    teams.forEach(function(t){
      var pct=Math.round(((t.otpToday||0)/max)*100);
      var title=t.prefix?(escH(t.prefix)+'*'):'<span style="color:var(--muted)">'+escH(t.label||'System Generated')+'</span>';
      h+='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="flex:1;min-width:0;font-size:.86rem;font-weight:800;color:var(--text)">'+title+(t.admin&&t.admin!=='—'?' <span style="color:var(--muted);font-weight:600;font-size:.66rem">'+escH(t.admin)+'</span>':'')+'</div>'
        +'<div style="text-align:right"><div style="font-size:1.2rem;font-weight:900;color:var(--accent);line-height:1">'+(t.otpToday||0)+'</div><div style="font-size:.55rem;color:var(--muted)">today</div></div></div>'
        +'<div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px"><div style="height:5px;width:'+pct+'%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div>'
        +'<div style="display:flex;gap:14px;font-size:.66rem;color:var(--muted);font-weight:700"><span>🗓️ week: <b style="color:var(--text)">'+(t.otpWeek||0)+'</b></span><span>👥 clients: <b style="color:var(--text)">'+(t.clients||0)+'</b></span></div>'
        +'</div>';
    });
    box.innerHTML=h;
  }
window.copyTeamReport = function(){
    if(!_trData||!_trData.teams){ if(typeof showToast==='function') showToast('Load the report first','error'); return; }
    var lines=['📈 Zamil SMS — Team OTP Report ('+(_trData.date||'')+')',''];
    _trData.teams.forEach(function(t){ lines.push((t.prefix||t.label||'System Generated')+' ('+t.admin+'):  today '+(t.otpToday||0)+' · week '+(t.otpWeek||0)+' · clients '+(t.clients||0)); });
    if(_trData.hottest) lines.push('', '🔥 Hottest today: '+(_trData.hottest.prefix||_trData.hottest.label||'System Generated')+' ('+_trData.hottest.otpToday+' OTPs)');
    try{ navigator.clipboard&&navigator.clipboard.writeText(lines.join('\n')); if(typeof showToast==='function') showToast('Team report copied ✓','success'); }catch(e){}
  };
  function gate(){
    try{ var s=sess(); if(!s)return;
      fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
        .then(function(r){return r.json();}).then(function(d){ var b=document.getElementById('drawerReportBtn'); if(b) b.style.display=(d&&d.ok&&(d.role==='super'||d.role==='admin'))?'flex':'none'; }).catch(function(){});
    }catch(e){}
  }
  ready(gate);
})();
