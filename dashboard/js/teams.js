/* ═══ TEAMS: prefixes + My Team list + CREATE + EDIT + DELETE ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }
  function sess(){ return localStorage.getItem('app_session'); }
  var _editId='';

  /* ── My Team page ── */
  window.openTeamPage  = function(){ var p=document.getElementById('teamPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); ensureCreateCard(); ensurePinCard(); loadMyClients(false); } };
  window.closeTeamPage = function(){ var p=document.getElementById('teamPage'); if(p) p.style.display='none'; };
  window.loadMyClients = function(force){
    var box=document.getElementById('teamList'); if(!box) return;
    box.innerHTML='<div style="text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Loading team…</div>';
    fetch('/api/admin/my-clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),force:!!force})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">'+((d&&d.error)||'Failed')+'</div>'; return; }
        var sub=document.getElementById('teamSub'); if(sub) sub.textContent=(d.total||0)+' clients · '+(d.cached?'from cache':'fresh')+' · '+(d.teams||[]).length+' teams';
        renderTeams(d.teams||[]);
      }).catch(function(){ box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">Connection error</div>'; });
  };
  function renderTeams(teams){
    var box=document.getElementById('teamList'); if(!box) return;
    if(!teams.length){ box.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--muted)">No team prefixes yet. A super admin must assign one first.</div>'; return; }
    var h='';
    teams.forEach(function(t,ti){
      var head = t.prefix ? (escH(t.prefix)+'*  '+(t.label?'<span style="color:var(--muted);font-weight:600">'+escH(t.label)+'</span> · ':'')+'<span style="color:var(--muted);font-weight:600">'+escH(t.admin)+'</span>') : '<span style="color:var(--muted)">'+escH(t.label||'System Generated')+'</span>';
      h+='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden">';
      h+='<div onclick="toggleTeam('+ti+')" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer"><div style="flex:1;min-width:0;font-size:.86rem;font-weight:800;color:var(--text)">'+head+'</div><span style="font-size:.72rem;font-weight:800;color:var(--accent)">'+t.count+'</span><span id="tchev'+ti+'" style="color:var(--muted);transition:transform .2s">▾</span></div>';
      h+='<div id="tbody'+ti+'" style="display:none;border-top:1px solid var(--border);padding:4px 12px 8px">';
      if(!t.clients.length){ h+='<div style="padding:10px 2px;color:var(--muted);font-size:.76rem">No clients in this team yet.</div>'; }
      else t.clients.forEach(function(c){
        var pinned=!!c.pinned; var inSys=!t.prefix;
        h+='<div style="display:flex;align-items:center;gap:7px;padding:8px 2px;border-bottom:1px solid var(--border)">'
          +'<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:.82rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(c.username)+'</span>'+(pinned?'<span style="font-size:.55rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.25);border-radius:20px;padding:1px 7px;white-space:nowrap">📌 pinned</span>':'')+'</div>'
          +'<div style="font-size:.62rem;color:var(--muted)">ID '+escH(c.id)+(c.name?(' · '+escH(c.name)):'')+'</div></div>'
          +(pinned?'<button onclick="unpinClient(\''+escH(c.username)+'\')" title="Unpin from this team" style="flex-shrink:0;font-size:.64rem;font-weight:800;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px;cursor:pointer">📌✕</button>':'')
          +(inSys?'<button onclick="prefillPin(\''+escH(c.username)+'\')" title="Pin to a team" style="flex-shrink:0;font-size:.64rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:8px;padding:6px 8px;cursor:pointer">📌</button>':'')
          +'<button onclick="editClient(\''+escH(c.id)+'\',\''+escH(c.username)+'\')" title="Edit" style="flex-shrink:0;font-size:.72rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:8px;padding:6px 9px;cursor:pointer">✏️</button>'
          +'<button onclick="delClient(\''+escH(c.id)+'\',\''+escH(c.username)+'\')" title="Delete" style="flex-shrink:0;font-size:.72rem;font-weight:800;color:#f87171;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);border-radius:8px;padding:6px 9px;cursor:pointer">🗑</button>'
          +'</div>';
      });
      h+='</div></div>';
    });
    box.innerHTML=h;
  }
  window.toggleTeam=function(ti){ var b=document.getElementById('tbody'+ti), ch=document.getElementById('tchev'+ti); if(!b)return; var open=b.style.display==='block'; b.style.display=open?'none':'block'; if(ch)ch.style.transform=open?'':'rotate(180deg)'; };

  /* ── EDIT client (pre-reads current details so nothing gets wiped) ── */
  window.editClient = function(id, username){
    _editId=id;
    var m=document.getElementById('editClientModal'); if(!m) return;
    m.classList.add('shr-open');
    var msg=document.getElementById('ecMsg'); if(msg){ msg.style.display='none'; msg.textContent=''; }
    ['ecPass','ecName','ecContact','ecEmail','ecCountry'].forEach(function(i){ var e=document.getElementById(i); if(e) e.value=''; });
    document.getElementById('ecUser').value=username+'  (loading…)';
    var btn=document.getElementById('ecBtn'); if(btn){ btn.disabled=true; btn.textContent='Loading…'; }
    fetch('/api/admin/client-details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),clientId:id})})
      .then(function(r){return r.json();}).then(function(d){
        if(btn){ btn.disabled=false; btn.textContent='Save Changes'; }
        if(!d||!d.ok){ if(msg){ msg.style.display='block'; msg.style.color='var(--red)'; msg.textContent=(d&&d.error)||'Could not load details'; } return; }
        document.getElementById('ecUser').value=d.username;
        document.getElementById('ecName').value=d.name||'';
        document.getElementById('ecContact').value=d.contact||'';
        document.getElementById('ecEmail').value=d.email||'';
        document.getElementById('ecCountry').value=d.country||'Pakistan';
        var ac=document.getElementById('ecActive'); if(ac) ac.checked=(d.active!==false);
      }).catch(function(){ if(btn){ btn.disabled=false; btn.textContent='Save Changes'; } if(msg){ msg.style.display='block'; msg.style.color='var(--red)'; msg.textContent='Connection error'; } });
  };
  window.closeEditClient = function(){ var m=document.getElementById('editClientModal'); if(m) m.classList.remove('shr-open'); };
  window.submitEditClient = function(){
    var msg=document.getElementById('ecMsg');
    function show(t,good){ if(msg){ msg.style.display='block'; msg.textContent=t; msg.style.color=good?'var(--green)':'var(--red)'; } }
    var btn=document.getElementById('ecBtn'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
    fetch('/api/admin/edit-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      session:sess(), clientId:_editId,
      username:document.getElementById('ecUser').value.replace(/\s*\(loading…\)$/,'').trim(),
      password:document.getElementById('ecPass').value,
      name:document.getElementById('ecName').value, contact:document.getElementById('ecContact').value,
      email:document.getElementById('ecEmail').value, country:document.getElementById('ecCountry').value||'Pakistan',
      active:document.getElementById('ecActive').checked
    })})
      .then(function(r){return r.json();}).then(function(d){
        if(btn){ btn.disabled=false; btn.textContent='Save Changes'; }
        if(d&&d.ok){ show('✅ '+d.message, true); if(typeof showToast==='function') showToast('✅ '+d.message,'success'); setTimeout(closeEditClient, 900); loadMyClients(true); }
        else show((d&&d.error)||'Update failed', false);
      }).catch(function(){ if(btn){ btn.disabled=false; btn.textContent='Save Changes'; } show('Connection error', false); });
  };

  /* ── CREATE card ── */
  function ensureCreateCard(){
    if(document.getElementById('teamCreateCard')) { loadPrefixOptions(); return; }
    var list=document.getElementById('teamList'); if(!list) return;
    var html='<div id="teamCreateCard" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">'
      +'<div style="font-size:.8rem;font-weight:800;margin-bottom:10px">➕ Create a new ID</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
      +'<select id="tcPrefix" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><option value="">Loading prefixes…</option></select>'
      +'<input id="tcSuffix" type="text" placeholder="Suffix e.g. Ahsan" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
      +'<input id="tcPass" type="text" placeholder="Password (blank = same as ID)" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none">'
      +'<input id="tcName" type="text" placeholder="Display name (optional)" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"></div>'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:8px;line-height:1.4">Full ID = prefix + suffix · 6–15 chars · country auto = Pakistan · password defaults to the full ID.</div>'
      +'<button id="tcBtn" onclick="createClient()" style="font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer">➕ Create ID</button>'
      +'<div id="tcMsg" style="font-size:.72rem;font-weight:700;margin-top:8px;display:none"></div></div>';
    list.insertAdjacentHTML('beforebegin', html);
    loadPrefixOptions();
  }
  function loadPrefixOptions(){
    var sel=document.getElementById('tcPrefix'); if(!sel) return;
    fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})})
      .then(function(r){return r.json();}).then(function(d){
        var list=(d&&d.prefixes)||[];
        if(!list.length){ sel.innerHTML='<option value="">No prefixes — ask super admin</option>'; return; }
        sel.innerHTML=list.map(function(p){ return '<option value="'+escH(p.prefix)+'">'+escH(p.prefix)+' ('+escH(p.admin_username)+')</option>'; }).join('');
        if(list.length===1) sel.value=list[0].prefix;
      }).catch(function(){ sel.innerHTML='<option value="">Failed to load</option>'; });
  }
  window.createClient = function(){
    var pfEl=document.getElementById('tcPrefix'); var prefix=pfEl?pfEl.value:'';
    var suffix=(document.getElementById('tcSuffix').value||'').trim();
    var pass=(document.getElementById('tcPass').value||'').trim();
    var name=(document.getElementById('tcName').value||'').trim();
    var msgEl=document.getElementById('tcMsg');
    function m(t,good){ if(msgEl){ msgEl.style.display='block'; msgEl.textContent=t; msgEl.style.color=good?'var(--green)':'var(--red)'; } }
    if(!prefix){ m('Select a team prefix', false); return; }
    if(!suffix){ m('Enter a suffix (e.g. Ahsan)', false); return; }
    var btn=document.getElementById('tcBtn'); if(btn){ btn.disabled=true; btn.textContent='Creating…'; }
    fetch('/api/admin/create-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:prefix,suffix:suffix,password:pass,name:name})})
      .then(function(r){return r.json();}).then(function(d){
        if(btn){ btn.disabled=false; btn.textContent='➕ Create ID'; }
        if(d&&d.ok){ m('✅ Created '+d.username+(d.clientId?' (ID '+d.clientId+')':''), true); document.getElementById('tcSuffix').value=''; document.getElementById('tcPass').value=''; document.getElementById('tcName').value=''; if(typeof showToast==='function') showToast('✅ Created '+d.username,'success'); loadMyClients(true); }
        else m((d&&d.error)||'Failed', false);
      }).catch(function(){ if(btn){ btn.disabled=false; btn.textContent='➕ Create ID'; } m('Connection error', false); });
  };
  window.delClient = function(id, username){
    zconfirm('Delete <b>'+escH(username)+'</b>?<br><span style="font-size:.74rem;color:var(--muted);font-weight:600">This removes the client from the LaMix panel. This cannot be undone.</span>', function(){
      fetch('/api/admin/delete-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),clientId:id,username:username})})
        .then(function(r){return r.json();}).then(function(d){
          if(d&&d.ok){ if(typeof showToast==='function') showToast('🗑 Deleted '+username,'success'); loadMyClients(true); }
          else if(typeof showToast==='function') showToast((d&&d.error)||'Delete failed','error');
        }).catch(function(){ if(typeof showToast==='function') showToast('Connection error','error'); });
    }, {icon:'🗑', yesText:'Delete'});
  };

  /* ── Prefix manager (super) ── */
  function pfMsg(t,good){ var m=document.getElementById('pfMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }
  var _pfList=[], _editingPrefix=null;
  window.loadPrefixes = function(){
    var box=document.getElementById('pfList'); if(!box) return;
    fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ box.innerHTML=''; return; }
        _pfList = d.prefixes||[];
        if(!_pfList.length){ box.innerHTML='<div style="color:var(--muted);font-size:.74rem">No prefixes assigned yet.</div>'; return; }
        box.innerHTML = _pfList.map(function(p,i){
          var editing = (_editingPrefix === p.prefix);
          var labelLine;
          if(editing){
            labelLine = '<div style="display:flex;gap:6px;align-items:center;margin-top:5px">'
              +'<input id="pfEditInput" type="text" value="'+escH(p.label||'')+'" placeholder="Display name e.g. Zml / Alm" onkeydown="pfEditKey(event,'+i+')" style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 9px;color:var(--text);font:inherit;font-size:.76rem;outline:none">'
              +'<button onclick="savePrefixLabel('+i+')" style="font-size:.66rem;font-weight:800;color:#fff;background:var(--accent);border:0;border-radius:7px;padding:6px 9px;cursor:pointer">Save</button>'
              +'<button onclick="cancelPrefixLabel()" style="font-size:.66rem;font-weight:800;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:6px 9px;cursor:pointer">✕</button>'
              +'</div>';
          } else {
            var ln = p.label ? '<span style="color:var(--text);font-weight:700">'+escH(p.label)+'</span>' : '<span style="color:var(--muted);font-style:italic">no display name</span>';
            labelLine = '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:.72rem">'+ln+'<button onclick="editPrefixLabel('+i+')" title="Set / change the team display name" style="font-size:.64rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:7px;padding:3px 8px;cursor:pointer">✏️ Name</button></div>';
          }
          return '<div style="display:flex;align-items:flex-start;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 12px;margin-bottom:6px">'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:.82rem;font-weight:800;color:var(--text)">'+escH(p.prefix)+'* <span style="color:var(--muted);font-weight:600;font-size:.66rem">'+escH(p.admin_username)+'</span></div>'
            +labelLine
            +'</div>'
            +'<button onclick="delPrefix(\''+escH(p.prefix)+'\')" style="flex-shrink:0;font-size:.68rem;font-weight:800;color:#f87171;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);border-radius:8px;padding:6px 10px;cursor:pointer">Remove</button>'
            +'</div>';
        }).join('');
        if(_editingPrefix){ var ei=document.getElementById('pfEditInput'); if(ei) ei.focus(); }
      }).catch(function(){ if(box) box.innerHTML=''; });
  };
  window.editPrefixLabel   = function(i){ _editingPrefix = (_pfList[i]&&_pfList[i].prefix)||null; loadPrefixes(); };
  window.cancelPrefixLabel = function(){ _editingPrefix=null; loadPrefixes(); };
  window.pfEditKey = function(e,i){ if(e.key==='Enter'){ e.preventDefault(); savePrefixLabel(i); } else if(e.key==='Escape'){ cancelPrefixLabel(); } };
  window.savePrefixLabel = function(i){
    var p=_pfList[i]; if(!p) return;
    var inp=document.getElementById('pfEditInput'); var lbl=inp?(inp.value||'').trim():'';
    fetch('/api/admin/set-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:p.prefix,admin:p.admin_username,label:lbl})})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ _editingPrefix=null; pfMsg('Name saved for '+p.prefix, true); loadPrefixes(); } else pfMsg((d&&d.error)||'Failed', false); })
      .catch(function(){ pfMsg('Connection error', false); });
  };
  window.setPrefix = function(){
    var pf=(document.getElementById('pfPrefix').value||'').trim(), ad=(document.getElementById('pfAdmin').value||'').trim();
    var lbEl=document.getElementById('pfLabel'); var lb=lbEl?(lbEl.value||'').trim():'';
    if(!pf||!ad){ pfMsg('Enter prefix and admin username', false); return; }
    fetch('/api/admin/set-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:pf,admin:ad,label:lb})})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ pfMsg('Assigned '+pf+' → '+ad+(lb?' ('+lb+')':''), true); document.getElementById('pfPrefix').value=''; document.getElementById('pfAdmin').value=''; if(lbEl) lbEl.value=''; loadPrefixes(); } else pfMsg((d&&d.error)||'Failed', false); })
      .catch(function(){ pfMsg('Connection error', false); });
  };
  window.delPrefix = function(pf){
    zconfirm('Remove prefix <b>'+escH(pf)+'</b>?<br><span style="font-size:.74rem;color:var(--muted);font-weight:600">Existing clients keep their names; they just become System Generated.</span>', function(){
      fetch('/api/admin/del-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:pf})})
        .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ pfMsg('Removed '+pf, true); loadPrefixes(); } else pfMsg((d&&d.error)||'Failed', false); })
        .catch(function(){ pfMsg('Connection error', false); });
    }, {icon:'🏷️', yesText:'Remove'});
  };

  function gate(){
    try{ var s=sess(); if(!s)return;
      fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
        .then(function(r){return r.json();}).then(function(d){ var b=document.getElementById('drawerTeamBtn'); if(b) b.style.display=(d&&d.ok&&(d.role==='super'||d.role==='admin'))?'flex':'none'; }).catch(function(){});
    }catch(e){}
  }
  ready(function(){
    gate();
    if(typeof window.openAdminPage==='function'){ var _oa=window.openAdminPage; window.openAdminPage=function(){ var r=_oa.apply(this,arguments); try{ loadPrefixes(); }catch(e){} return r; }; }
  });
})();
