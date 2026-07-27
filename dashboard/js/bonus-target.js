/* ═══ PHASE 4 — BONUS TARGET (super sets / admin sees) + qualifiers banner ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function sess(){ return localStorage.getItem('app_session'); }
  var INP='flex:1;min-width:88px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none';

  function ensureBonusCard(){
    if(document.getElementById('bonusTargetCard')) return;
    var inner=document.querySelector('#adminPage > div'); if(!inner) return;
    inner.insertAdjacentHTML('beforeend','<div id="bonusTargetCard" style="margin-top:18px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px"><div style="font-size:.8rem;font-weight:800;margin-bottom:4px">🎯 Bonus Target</div><div id="btBody" style="font-size:.74rem;color:var(--muted)">Loading…</div></div>');
  }
  function renderTargetCard(){
    ensureBonusCard();
    var body=document.getElementById('btBody'); if(!body) return;
    body.innerHTML='Loading…';
    var roleP=fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();});
    var cfgP=fetch('/api/admin/target-get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();});
    Promise.all([roleP,cfgP]).then(function(rs){
      var role=(rs[0]&&rs[0].ok)?rs[0].role:'none';
      var cfg=(rs[1]&&rs[1].ok)?rs[1].config:null;
      if(role==='super'){
        var p=cfg||{};
        body.innerHTML='<div style="font-size:.62rem;color:var(--muted);margin-bottom:10px">Reward the top teams that hit the OTP target.</div>'
          +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
          +'<select id="btPeriod" style="'+INP+'"><option value="daily"'+(p.period!=='weekly'?' selected':'')+'>Daily</option><option value="weekly"'+(p.period==='weekly'?' selected':'')+'>Weekly</option></select>'
          +'<input id="btTarget" type="number" min="1" placeholder="Target OTPs" value="'+(p.target_otps||'')+'" style="'+INP+'">'
          +'<input id="btReward" type="number" step="0.01" min="0" placeholder="Reward $" value="'+(p.reward_usd!=null?p.reward_usd:'')+'" style="'+INP+'">'
          +'<input id="btTopN" type="number" min="1" placeholder="Top N" value="'+(p.top_n||'')+'" style="'+INP+'"></div>'
          +'<input id="btNote" type="text" placeholder="Note (optional)" value="'+escH(p.note||'')+'" style="'+INP+';width:100%;margin-bottom:8px">'
          +'<button onclick="saveTarget()" style="font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer">Save Target</button>'
          +'<div id="btMsg" style="font-size:.72rem;font-weight:700;margin-top:8px;display:none"></div>';
      } else {
        if(!cfg){ body.innerHTML='<div style="color:var(--muted)">No bonus target set yet.</div>'; return; }
        body.innerHTML='<div style="font-size:.82rem;font-weight:700;color:var(--text)">🎯 '+escH(String(cfg.target_otps))+' OTPs → <span style="color:var(--accent)">$'+Number(cfg.reward_usd).toFixed(2)+'</span> <span style="color:var(--muted);font-weight:600">(top '+escH(String(cfg.top_n))+' · '+escH(cfg.period)+')</span></div>'+(cfg.note?'<div style="font-size:.7rem;color:var(--muted);margin-top:4px">'+escH(cfg.note)+'</div>':'');
      }
    }).catch(function(){ body.innerHTML='<div style="color:var(--red)">Failed to load.</div>'; });
  }
  window.saveTarget=function(){
    var msg=document.getElementById('btMsg');
    function show(t,good){ if(msg){ msg.style.display='block'; msg.textContent=t; msg.style.color=good?'var(--green)':'var(--red)'; } }
    fetch('/api/admin/target-set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ session:sess(), period:document.getElementById('btPeriod').value, target_otps:document.getElementById('btTarget').value, reward_usd:document.getElementById('btReward').value, top_n:document.getElementById('btTopN').value, note:document.getElementById('btNote').value })})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ show('✅ Target saved', true); if(typeof showToast==='function') showToast('🎯 Bonus target saved','success'); } else show((d&&d.error)||'Failed', false); })
      .catch(function(){ show('Connection error', false); });
  };

  window.loadTeamBonus=function(){
    var list=document.getElementById('trList'); if(!list) return;
    var slot=document.getElementById('trBonusSlot');
    if(!slot){ slot=document.createElement('div'); slot.id='trBonusSlot'; slot.style.marginBottom='12px'; list.parentNode.insertBefore(slot, list); }
    slot.innerHTML='';
    fetch('/api/admin/team-bonus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok||!d.config){ slot.innerHTML=''; return; }
        var c=d.config, isSuper=(d.role==='super');
        var h='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px">';
        h+='<div style="font-size:.78rem;font-weight:800;color:var(--text);margin-bottom:8px">🎯 Target: '+escH(String(c.target_otps))+' OTPs → <span style="color:var(--accent)">$'+Number(c.reward_usd).toFixed(2)+'</span> <span style="color:var(--muted);font-weight:600">(top '+escH(String(c.top_n))+' · '+escH(c.period)+')</span></div>';
        if(!isSuper){
          (d.myTeams||[]).forEach(function(t){
            if(t.congrats){ h+='<div style="background:linear-gradient(135deg,rgba(52,211,153,.16),rgba(34,211,238,.12));border:1px solid rgba(52,211,153,.35);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-size:.8rem;font-weight:700;color:var(--text)">🎉 Congratulations! <b>'+escH(t.prefix||'Your team')+'</b> hit the target — Bonus: <span style="color:var(--accent)">$'+Number(t.reward).toFixed(2)+'</span>!</div>'; }
            else if(t.qualified){ h+='<div style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-size:.78rem;font-weight:700;color:var(--text)">✅ <b>'+escH(t.prefix||'Your team')+'</b> is on the bonus board — $'+Number(t.reward).toFixed(2)+' earned.</div>'; }
            else { var pct=Math.min(100, Math.round((t.otps/(c.target_otps||1))*100)); h+='<div style="margin-bottom:6px"><div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:4px">💪 '+escH(t.prefix||'Your team')+': '+t.otps+' / '+c.target_otps+' OTPs to the $'+Number(c.reward_usd).toFixed(2)+' bonus</div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:5px;width:'+pct+'%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div></div>'; }
          });
        }
        var leaders=(d.leaders||[]).filter(function(t){return t.qualified;}).slice(0, c.top_n||5);
        if(leaders.length){
          h+='<div style="font-size:.62rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:8px 0 6px">Bonus qualifiers</div>';
          leaders.forEach(function(t){ h+='<div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid var(--border);font-size:.76rem"><span style="font-weight:800;color:var(--accent);width:24px">#'+t.rank+'</span><span style="flex:1;font-weight:700;color:var(--text)">'+escH(t.prefix)+(t.label?' <span style="color:var(--muted);font-weight:600">'+escH(t.label)+'</span>':'')+'</span><span style="font-weight:800;color:var(--text)">'+t.otps+'</span></div>'; });
        } else if(isSuper){ h+='<div style="font-size:.72rem;color:var(--muted)">No team has hit the target yet.</div>'; }
        h+='</div>';
        slot.innerHTML=h;
      }).catch(function(){ slot.innerHTML=''; });
  };

   /* ── PIN existing users into a team ── */
  window.ensurePinCard = function(){
    if(document.getElementById('teamPinCard')) { loadPinOptions(); return; }
    var list=document.getElementById('teamList'); if(!list) return;
    var html='<div id="teamPinCard" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">'
      +'<div style="font-size:.8rem;font-weight:700;margin-bottom:4px">📌 Pin an existing user to a team</div>'
      +'<div style="font-size:.66rem;color:var(--muted);margin-bottom:10px;line-height:1.5">For users whose name does NOT start with a team prefix (e.g. <b>Muzammil_Aziz</b>) — pin them so their numbers & OTPs count there.</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<select id="pinPrefix" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><option value="">Loading teams…</option></select>'
      +'<input id="pinUser" type="text" placeholder="Exact username e.g. Muzammil_Aziz" style="flex:1.4;min-width:150px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none">'
      +'<button onclick="pinClient()" style="font-size:.78rem;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer;white-space:nowrap">📌 Pin</button></div>'
      +'<div id="pinMsg" style="font-size:.72rem;font-weight:600;margin-top:8px;display:none"></div></div>';
    list.insertAdjacentHTML('beforebegin', html);
    loadPinOptions();
  }
  window.loadPinOptions = function(){
    var sel=document.getElementById('pinPrefix'); if(!sel) return;
    fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})})
      .then(function(r){return r.json();}).then(function(d){
        var list=(d&&d.prefixes)||[];
        if(!list.length){ sel.innerHTML='<option value="">No teams — assign a prefix first</option>'; return; }
        sel.innerHTML=list.map(function(p){ return '<option value="'+escH(p.prefix)+'">'+escH(p.prefix)+(p.label?' ('+escH(p.label)+')':'')+' · '+escH(p.admin_username)+'</option>'; }).join('');
      }).catch(function(){ sel.innerHTML='<option value="">Failed to load</option>'; });
  }
  window.pinClient=function(){
    var sel=document.getElementById('pinPrefix'); var inp=document.getElementById('pinUser'); var msg=document.getElementById('pinMsg');
    function m(t,good){ if(msg){ msg.style.display='block'; msg.textContent=t; msg.style.color=good?'var(--green)':'var(--red)'; } }
    var prefix=sel?sel.value:''; var username=inp?inp.value.trim():'';
    if(!prefix){ m('Select a team', false); return; }
    if(!username){ m('Enter the exact username', false); return; }
    fetch('/api/admin/pin-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:username,prefix:prefix})})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ m('✅ '+username+' pinned to '+prefix, true); if(inp) inp.value=''; if(typeof showToast==='function') showToast('📌 Pinned '+username,'success'); loadMyClients(true); } else m((d&&d.error)||'Failed', false); })
      .catch(function(){ m('Connection error', false); });
  };
  window.unpinClient=function(username){
    zconfirm('Unpin <b>'+escH(username)+'</b> from this team?<br><span style="font-size:.74rem;color:var(--muted)">They move back to System Generated (or their natural prefix team).</span>', function(){
      fetch('/api/admin/unpin-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:username})})
        .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ if(typeof showToast==='function') showToast('Unpinned '+username,'success'); loadMyClients(true); } else if(typeof showToast==='function') showToast((d&&d.error)||'Unpin failed','error'); })
        .catch(function(){ if(typeof showToast==='function') showToast('Connection error','error'); });
    }, {icon:'📌', yesText:'Unpin'});
  };
  window.prefillPin=function(u){ var i=document.getElementById('pinUser'); if(i){ i.value=u; i.focus(); var c=document.getElementById('teamPinCard'); if(c) c.scrollIntoView({behavior:'smooth',block:'center'}); } };
  ready(function(){
    if(typeof window.openAdminPage==='function' && !window.openAdminPage._bw){ var _oa=window.openAdminPage; window.openAdminPage=function(){ var r=_oa.apply(this,arguments); try{ renderTargetCard(); }catch(e){} return r; }; window.openAdminPage._bw=1; }
    if(typeof window.openTeamReport==='function' && !window.openTeamReport._bw){ var _otr=window.openTeamReport; window.openTeamReport=function(){ var r=_otr.apply(this,arguments); try{ loadTeamBonus(); }catch(e){} return r; }; window.openTeamReport._bw=1; }
  });
})();
