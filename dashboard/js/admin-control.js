/* ═══ ADMIN CONTROL (super-only) — promote / remove admins ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;'); }
  window.openAdminPage  = function(){ var p=document.getElementById('adminPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); loadAdmins(); } };
  window.closeAdminPage = function(){ var p=document.getElementById('adminPage'); if(p) p.style.display='none'; };
  function showMsg(t,good){ var m=document.getElementById('adminMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }

  window.loadAdmins = function(){
    var box=document.getElementById('adminList'); if(!box)return;
    box.innerHTML='<div style="text-align:center;color:var(--muted);padding:16px">Loading…</div>';
    var s=localStorage.getItem('app_session');
    fetch('/api/admin/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">'+((d&&d.error)||'Failed')+'</div>'; return; }
        var admins=d.admins||[];
        if(!admins.length){ box.innerHTML='<div style="color:var(--muted);padding:14px;text-align:center">No admins yet — promote someone above.</div>'; return; }
        box.innerHTML=admins.map(function(a){
          return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:7px">'
            +'<div style="flex:1;min-width:0"><div style="font-size:.86rem;font-weight:800;color:var(--text)">'+escH(a.username)+'</div><div style="font-size:.62rem;color:var(--muted)">'+escH(a.role)+(a.added_by?(' · by '+escH(a.added_by)):'')+'</div></div>'
            +'<button onclick="demoteAdmin(\''+escH(a.username)+'\')" style="font-size:.7rem;font-weight:800;color:#f87171;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);border-radius:8px;padding:6px 11px;cursor:pointer">Remove</button>'
            +'</div>';
        }).join('');
      }).catch(function(){ box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">Connection error</div>'; });
  };

  window.promoteAdmin = function(){
    var inp=document.getElementById('adminUserInput'); var u=(inp.value||'').trim();
    if(!u){ showMsg('Enter a username', false); return; }
    var s=localStorage.getItem('app_session');
    fetch('/api/admin/promote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s,username:u})})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ showMsg('✅ '+u+' is now an admin', true); inp.value=''; loadAdmins(); } else showMsg((d&&d.error)||'Failed', false); })
      .catch(function(){ showMsg('Connection error', false); });
  };

   window.demoteAdmin = function(u){
    zconfirm('Remove admin rights from <b>'+escH(u)+'</b>?', function(){
      var s=localStorage.getItem('app_session');
      fetch('/api/admin/demote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s,username:u})})
        .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ showMsg('Removed '+u, true); if(typeof showToast==='function') showToast('🛡️ Removed admin '+u,'success'); loadAdmins(); } else showMsg((d&&d.error)||'Failed', false); })
        .catch(function(){ showMsg('Connection error', false); });
    }, {icon:'🛡️', yesText:'Remove'});
  };

  function gateAdminMenu(){
    try{ var s=localStorage.getItem('app_session'); if(!s)return;
      fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
        .then(function(r){return r.json();}).then(function(d){ var b=document.getElementById('featAdminBtn'); if(b) b.style.display=(d&&d.ok&&d.role==='super')?'flex':'none'; }).catch(function(){});
    }catch(e){}
  }
  ready(function(){ gateAdminMenu(); });
})();
