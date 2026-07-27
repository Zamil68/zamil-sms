/* ═══ ROLE: header pill + drawer identity + drawer tool gating (single fetch) ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function pillHtml(role,big){
    var label = role==='super'?'SUPER ADMIN':(role==='admin'?'ADMIN':''); if(!label) return '';
    var grad = role==='super'?'linear-gradient(135deg,#f59e0b,#ef4444)':'linear-gradient(135deg,var(--accent),var(--accent2))';
    return '<span class="role-pill" style="display:inline-block;font-size:'+(big?'.62rem':'.56rem')+';font-weight:900;letter-spacing:.06em;color:#fff;background:'+grad+';padding:2px 8px;border-radius:20px;white-space:nowrap">'+label+'</span>';
  }
  function apply(role){
    var pn=document.getElementById('profileName');
    if(pn){ var old=pn.parentElement.querySelector('.role-pill'); if(old) old.remove(); if(role!=='none') pn.insertAdjacentHTML('afterend', pillHtml(role,false)); }
    var du=document.getElementById('drawerUsername'); if(du && typeof USERNAME!=='undefined' && USERNAME) du.textContent=USERNAME;
    var drp=document.getElementById('drawerRolePill'); if(drp) drp.innerHTML=(role!=='none')?pillHtml(role,true):'';
    var sb=document.getElementById('drawerStatsBtn'); if(sb) sb.style.display=(role==='super'||role==='admin')?'flex':'none';
    var ab=document.getElementById('drawerAdminBtn'); if(ab) ab.style.display=(role==='super')?'flex':'none';
  }
  ready(function(){
    var tries=0;
    var t=setInterval(function(){
      tries++;
      try{
        var s=localStorage.getItem('app_session'); if(!s){ clearInterval(t); return; }
        fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
          .then(function(r){return r.json();}).then(function(d){
            if(d&&d.ok&&d.role){ apply(d.role); clearInterval(t); } else if(tries>=4){ apply('none'); clearInterval(t); }
          }).catch(function(){ if(tries>=4){ apply('none'); clearInterval(t); } });
      }catch(e){ if(tries>=4) clearInterval(t); }
    },700);
  });
})();
