/* ═══ LIMIT INCREASE (admin + super) — free a try by deleting 1 alloc_events row ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }
  var _limitUser='';
  window.openLimitPage  = function(){ var p=document.getElementById('limitPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); } };
  window.closeLimitPage = function(){ var p=document.getElementById('limitPage'); if(p) p.style.display='none'; };
  function msg(t,good){ var m=document.getElementById('limitMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }

  window.loadLimitStatus = function(){
    var u=(document.getElementById('limitUserInput').value||'').trim();
    if(!u){ msg('Enter a username', false); return; }
    _limitUser=u;
    var box=document.getElementById('limitResults'); if(box) box.innerHTML='<div style="text-align:center;color:var(--muted);padding:16px">Loading…</div>';
    fetch('/api/admin/limit-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session'),username:u})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ if(box) box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">'+((d&&d.error)||'Failed')+'</div>'; return; }
        renderLimit(d);
      }).catch(function(){ if(box) box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">Connection error</div>'; });
  };

  function freeBtn(rowId){ return '<button class="lim-freebtn" onclick="freeTry('+JSON.stringify(rowId)+')">+1 try</button>'; }
  function renderLimit(d){
    var box=document.getElementById('limitResults'); if(!box) return;
    var ranges=d.ranges||[], countries=d.countries||[];
    if(!ranges.length && !countries.length){ box.innerHTML='<div class="lim-empty">✅ <b>'+escH(d.username)+'</b> has no range or country at its limit right now — nothing to free.</div>'; return; }
    var h='';
    if(ranges.length){
      h+='<div class="lim-sectitle">Ranges at limit · '+ranges.length+'</div>';
      ranges.forEach(function(r){ h+='<div class="lim-row"><div class="lim-row-main"><div class="lim-row-title">'+escH(r.rangeTitle)+'</div><div class="lim-row-sub">'+escH(r.country)+' · <span class="lim-used">'+r.used+'/'+r.limit+'</span> used</div></div>'+freeBtn(r.ids[r.ids.length-1])+'</div>'; });
    }
    if(countries.length){
      h+='<div class="lim-sectitle" style="margin-top:14px">Countries at limit · '+countries.length+'</div>';
      countries.forEach(function(c){ h+='<div class="lim-row"><div class="lim-row-main"><div class="lim-row-title">'+escH(c.country)+'</div><div class="lim-row-sub"><span class="lim-used">'+c.used+'/'+c.limit+'</span> used today</div></div>'+freeBtn(c.ids[c.ids.length-1])+'</div>'; });
    }
    box.innerHTML=h;
  }

  window.freeTry = function(rowId){
    zconfirm('Free <b>1 try</b> for '+escH(_limitUser)+'?<br><span style="font-size:.74rem;color:var(--muted);font-weight:600">Removes 1 attempt row → they get one more allocation.</span>', function(){
      fetch('/api/admin/free-try',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session'),username:_limitUser,rowId:rowId})})
        .then(function(r){return r.json();}).then(function(d){
          if(d&&d.ok){ msg('✅ Freed 1 try for '+_limitUser, true); if(typeof showToast==='function') showToast('✅ Freed 1 try for '+_limitUser,'success'); loadLimitStatus(); }
          else msg((d&&d.error)||'Failed', false);
        }).catch(function(){ msg('Connection error', false); });
    }, {icon:'🆓', yesText:'Free try'});
  };

  function gate(){
    try{ var s=localStorage.getItem('app_session'); if(!s)return;
      fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
        .then(function(r){return r.json();}).then(function(d){ var b=document.getElementById('drawerLimitBtn'); if(b) b.style.display=(d&&d.ok&&(d.role==='super'||d.role==='admin'))?'flex':'none'; }).catch(function(){});
    }catch(e){}
  }
  ready(gate);
})();
