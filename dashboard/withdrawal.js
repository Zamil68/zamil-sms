/* ═══ withdrawal.js — Withdrawal module (Zamil SMS) — FIXED ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb){
  fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({session:sess()}, body||{}))})
    .then(function(r){ return r.json().catch(function(){ return {ok:false, error:'HTTP '+r.status}; }); })
    .then(cb)
    .catch(function(e){ cb({ok:false, error:'Network: '+e.message}); });
}

var _injected=false, _balance=null, _role='none';

function inject(){
  if(_injected) return; _injected=true;
  fetch('/dashboard/withdrawal.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div'); d.innerHTML=h;
    while(d.firstElementChild) document.body.appendChild(d.firstElementChild);
    loadRole();
    loadBalance();
    loadHistory();
    loadRecent();
    loadSavedMethods();
  });
}

function loadRole(){
  post('/api/auth/role',{},function(r){
    _role=(r&&r.ok)?r.role:'none';
    var adminSection=document.getElementById('wdAdminSection');
    if(adminSection) adminSection.style.display=(_role==='super'||_role==='admin')?'block':'none';
    if(_role==='super'||_role==='admin') loadAdminRequests();
  });
}

window.openWdPage=function(){
  inject();
  var p=document.getElementById('wdPage'); if(p) p.style.display='block';
  window.scrollTo(0,0);
  loadBalance();
};
window.closeWdPage=function(){ var p=document.getElementById('wdPage'); if(p) p.style.display='none'; };

function loadBalance(){
  post('/api/withdraw/balance',{},function(d){
    if(!d||!d.ok) return;
    _balance=d;
    var el=document.getElementById('wdBalance'); if(el) el.textContent='$'+d.available.toFixed(4);
    var pk=document.getElementById('wdBalancePkr'); if(pk) pk.textContent='≈ Rs '+d.availablePkr.toLocaleString();
    var te=document.getElementById('wdTotalEarned'); if(te) te.textContent='$'+d.totalEarnings.toFixed(2);
    var tw=document.getElementById('wdTotalWithdrawn'); if(tw) tw.textContent='$'+d.totalWithdrawn.toFixed(2);
    var min=d.minWithdraw||2;
    var ml=document.getElementById('wdMinLabel'); if(ml) ml.textContent=min;
    var pct=Math.min(100,(d.available/min)*100);
    var pb=document.getElementById('wdProgressBar'); if(pb) pb.style.width=pct.toFixed(1)+'%';
    var pp=document.getElementById('wdProgressPct'); if(pp) pp.textContent=Math.round(pct)+'%';
    var btn=document.getElementById('wdSubmitBtn'); if(btn) btn.disabled=!d.canWithdraw;
    var banner=document.getElementById('wdDisabledBanner');
    if(banner){ if(!d.enabled){ banner.style.display='block'; banner.textContent='🚫 '+(d.disabledMessage||'Withdrawals are temporarily disabled.'); } else banner.style.display='none'; }
    var fl=document.getElementById('wdFeeLabel'); if(fl) fl.textContent=(d.cryptoFee||0).toFixed(2);
    checkForm();
  });
}

function loadHistory(){
  post('/api/withdraw/history',{},function(d){
    var el=document.getElementById('wdHistory'); if(!el) return;
    if(!d||!d.ok||!d.withdrawals||!d.withdrawals.length){ el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">No withdrawals yet</div>'; return; }
    el.innerHTML=d.withdrawals.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
      var methodLabel=w.method==='crypto'?'Crypto ('+esc(w.crypto_chain||'USDT')+')':esc(w.method);
      var h='<div class="wd-hist-card '+esc(w.status)+'">';
      h+='<div class="wd-hist-top"><span class="wd-hist-amt">$'+(w.amount_usd||0).toFixed(4)+'</span><span class="wd-hist-status '+esc(w.status)+'">'+esc(w.status)+'</span></div>';
      h+='<div class="wd-hist-meta">'+methodLabel+' · Rs '+(w.amount_pkr||0).toLocaleString()+' · '+dt+'</div>';
      if(w.admin_message){ h+='<div class="wd-hist-msg '+esc(w.status)+'">'+(w.status==='approved'?'✅ ':'❌ ')+esc(w.admin_message)+'</div>'; }
      h+='</div>';
      return h;
    }).join('');
  });
}

function loadRecent(){
  post('/api/withdraw/recent',{},function(d){
    var el=document.getElementById('wdRecentList'); if(!el) return;
    if(!d||!d.ok||!d.recent||!d.recent.length){ el.innerHTML='<div style="text-align:center;padding:14px;color:var(--muted);font-size:.76rem">No recent withdrawals</div>'; return; }
    el.innerHTML=d.recent.map(function(w){
      var initials=String(w.username||'?').slice(0,2).toUpperCase();
      return '<div class="wd-recent-item"><div class="wd-recent-av">'+esc(initials)+'</div><div class="wd-recent-name">'+esc(w.username)+'</div><div class="wd-recent-amt">$'+(w.amount_usd||0).toFixed(2)+'</div></div>';
    }).join('');
  });
}

function loadSavedMethods(){
  post('/api/withdraw/methods',{},function(d){
    if(!d||!d.ok||!d.methods||!d.methods.length) return;
    var m=d.methods[0];
    if(m.method && m.method!=='crypto'){
      var sel=document.getElementById('wdMethod'); if(sel) sel.value=m.method;
      wdMethodChange();
      if(m.bank_name){ var bn=document.getElementById('wdBankName'); if(bn) bn.value=m.bank_name; }
      if(m.account_number){ var an=document.getElementById('wdAccNum'); if(an) an.value=m.account_number; var an2=document.getElementById('wdAccNum2'); if(an2) an2.value=m.account_number; }
      if(m.account_holder){ var ah=document.getElementById('wdAccHolder'); if(ah) ah.value=m.account_holder; }
    } else if(m.method==='crypto'){
      var sel2=document.getElementById('wdMethod'); if(sel2) sel2.value='crypto';
      wdMethodChange();
      if(m.crypto_platform){ var cp=document.getElementById('wdCryptoPlatform'); if(cp) cp.value=m.crypto_platform; }
      if(m.crypto_uid){ var cu=document.getElementById('wdCryptoUid'); if(cu) cu.value=m.crypto_uid; }
      if(m.crypto_address){ var ca=document.getElementById('wdCryptoAddr'); if(ca) ca.value=m.crypto_address; var ca2=document.getElementById('wdCryptoAddr2'); if(ca2) ca2.value=m.crypto_address; }
      if(m.crypto_chain){ var cc=document.getElementById('wdCryptoChain'); if(cc) cc.value=m.crypto_chain; }
    }
  });
}

window.wdMethodChange=function(){
  var m=document.getElementById('wdMethod').value;
  var bank=document.getElementById('wdBankSection');
  var crypto=document.getElementById('wdCryptoSection');
  var bankNameField=document.getElementById('wdBankNameField');
  if(m==='crypto'){ if(bank)bank.classList.add('hide'); if(crypto)crypto.classList.add('show'); }
  else { if(bank)bank.classList.remove('hide'); if(crypto)crypto.classList.remove('show'); }
  if(m==='bank'||m==='other'){ if(bankNameField)bankNameField.style.display='block'; }
  else { if(bankNameField)bankNameField.style.display='none'; }
  checkForm();
};

window.wdCalcPkr=function(){
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var rate=(_balance&&_balance.pkrRate)||285;
  var el=document.getElementById('wdAmountPkr'); if(el) el.textContent='Rs '+Math.round(amt*rate).toLocaleString();
  checkForm();
};

function checkForm(){
  var btn=document.getElementById('wdSubmitBtn'); if(!btn) return;
  if(!_balance||!_balance.canWithdraw){ btn.disabled=true; return; }
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var method=document.getElementById('wdMethod').value;
  var valid=amt>=(_balance.minWithdraw||2) && amt<=_balance.available && method!=='';
  btn.disabled=!valid;
}

window.wdSubmit=function(){
  var method=document.getElementById('wdMethod').value;
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var body={ method:method, amountUsd:amt, saveMethod:document.getElementById('wdSaveMethod').checked, note:document.getElementById('wdNote').value };

  if(method==='crypto'){
    var addr=document.getElementById('wdCryptoAddr').value.trim();
    var addr2=document.getElementById('wdCryptoAddr2').value.trim();
    if(addr!==addr2){ alert('⚠️ Crypto addresses do not match!'); return; }
    body.cryptoPlatform=document.getElementById('wdCryptoPlatform').value;
    body.cryptoUid=document.getElementById('wdCryptoUid').value.trim();
    body.cryptoAddress=addr;
    body.cryptoChain=document.getElementById('wdCryptoChain').value.trim();
    if(!body.cryptoPlatform||!body.cryptoUid||!addr||!body.cryptoChain){ alert('Please fill all crypto fields.'); return; }
  } else {
    var acc=document.getElementById('wdAccNum').value.trim();
    var acc2=document.getElementById('wdAccNum2').value.trim();
    if(acc!==acc2){ alert('⚠️ Account numbers do not match!'); return; }
    body.bankName=document.getElementById('wdBankName').value.trim();
    body.accountNumber=acc;
    body.accountHolder=document.getElementById('wdAccHolder').value.trim();
    if(!acc||!body.accountHolder){ alert('Please fill account number and holder name.'); return; }
    if((method==='bank'||method==='other')&&!body.bankName){ alert('Please enter bank/wallet name.'); return; }
  }

  var btn=document.getElementById('wdSubmitBtn');
  btn.disabled=true; btn.textContent='Submitting…';

  post('/api/withdraw/submit',body,function(d){
    btn.disabled=false; btn.textContent='💸 Request Withdrawal';
    if(d&&d.ok){
      wdShowSuccess('Withdrawal Submitted! ✅','Your request for $'+amt.toFixed(2)+' is pending. Expected: 3 hours on business days.');
      document.getElementById('wdAmount').value='';
      document.getElementById('wdNote').value='';
      loadBalance();
      setTimeout(loadHistory,1500);
    } else {
      alert('❌ '+((d&&d.error)||'Submission failed'));
    }
  });
};

function wdShowSuccess(title,body){
  var t=document.getElementById('wdSuccessTitle'); if(t)t.textContent=title;
  var b=document.getElementById('wdSuccessBody'); if(b)b.textContent=body;
  var ov=document.getElementById('wdSuccessOverlay'); if(ov)ov.classList.add('show');
}
window.wdCloseSuccess=function(){ var ov=document.getElementById('wdSuccessOverlay'); if(ov)ov.classList.remove('show'); };

/* ═══ ADMIN: Withdrawal Requests Management ═══ */
function loadAdminRequests(){
  post('/api/admin/withdraw/requests',{status:'pending'},function(d){
    var el=document.getElementById('wdAdminRequests'); if(!el) return;
    if(!d||!d.ok||!d.requests||!d.requests.length){
      el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">✅ No pending requests</div>';
      return;
    }
    el.innerHTML=d.requests.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleString('en-PK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      var isCrypto=w.method==='crypto';
      var detailHtml='';
      if(isCrypto){
        detailHtml='<div class="wd-admin-detail">'
          +'<div><b>Platform:</b> '+esc(w.crypto_platform)+'</div>'
          +'<div><b>UID:</b> '+esc(w.crypto_uid)+'</div>'
          +'<div><b>Address:</b> <code style="font-size:.7rem;word-break:break-all">'+esc(w.crypto_address)+'</code></div>'
          +'<div><b>Chain:</b> '+esc(w.crypto_chain)+'</div>'
          +'<div><b>Fee:</b> $'+(w.crypto_fee_usd||0).toFixed(2)+'</div>'
          +'</div>';
      } else {
        detailHtml='<div class="wd-admin-detail">'
          +'<div><b>Method:</b> '+esc(w.method)+'</div>'
          +(w.bank_name?'<div><b>Bank:</b> '+esc(w.bank_name)+'</div>':'')
          +'<div><b>Account:</b> '+esc(w.account_number)+'</div>'
          +'<div><b>Holder:</b> '+esc(w.account_holder)+'</div>'
          +'</div>';
      }
      return '<div class="wd-admin-card">'
        +'<div class="wd-admin-top">'
        +'<div class="wd-admin-user">'+esc(w.username)+'</div>'
        +'<div class="wd-admin-amt">$'+(w.amount_usd||0).toFixed(4)+' <span style="color:var(--muted);font-size:.7rem">≈ Rs '+(w.amount_pkr||0).toLocaleString()+'</span></div>'
        +'<div class="wd-admin-time">'+dt+'</div>'
        +'</div>'
        +detailHtml
        +(w.note?'<div style="font-size:.72rem;color:var(--muted);margin-top:6px;font-style:italic">📝 '+esc(w.note)+'</div>':'')
        +'<div class="wd-admin-actions">'
        +'<button class="wd-admin-btn approve" onclick="wdAdminAction('+w.id+',\'approve\',this)">✅ Approve</button>'
        +'<button class="wd-admin-btn reject" onclick="wdAdminAction('+w.id+',\'reject\',this)">❌ Reject</button>'
        +'<button class="wd-admin-btn copy" onclick="wdAdminCopy('+w.id+')">📋 Copy</button>'
        +'</div>'
        +'<div class="wd-admin-msg-row" id="wdAdminMsg_'+w.id+'" style="display:none">'
        +'<input type="text" class="wd-admin-msg-input" id="wdAdminMsgInput_'+w.id+'" placeholder="Message to user (optional)…">'
        +'</div>'
        +'</div>';
    }).join('');
    // Store requests for copy
    window._wdAdminReqs=d.requests;
  });
}

window.wdAdminAction=function(id, action, btn){
  var msgInput=document.getElementById('wdAdminMsgInput_'+id);
  var msgRow=document.getElementById('wdAdminMsg_'+id);
  // Show message input on first click
  if(msgRow && msgRow.style.display==='none'){
    msgRow.style.display='block';
    if(msgInput) msgInput.focus();
    return;
  }
  var message=(msgInput&&msgInput.value)||'';
  if(action==='reject'&&!message){ message='Withdrawal rejected.'; }

  btn.disabled=true; btn.textContent='…';
  var url=action==='approve'?'/api/admin/withdraw/approve':'/api/admin/withdraw/reject';
  post(url,{id:id, message:message},function(d){
    if(d&&d.ok){
      btn.textContent=action==='approve'?'✅ Done':'❌ Done';
      btn.style.opacity='.5';
      setTimeout(loadAdminRequests,1000);
    } else {
      alert('Failed: '+((d&&d.error)||'?'));
      btn.disabled=false; btn.textContent=action==='approve'?'✅ Approve':'❌ Reject';
    }
  });
};

window.wdAdminCopy=function(id){
  var req=(window._wdAdminReqs||[]).find(function(r){return r.id===id;});
  if(!req) return;
  var text='User: '+req.username+'\nAmount: $'+req.amount_usd+' (Rs '+req.amount_pkr+')\n';
  if(req.method==='crypto'){
    text+='Platform: '+req.crypto_platform+'\nUID: '+req.crypto_uid+'\nAddress: '+req.crypto_address+'\nChain: '+req.crypto_chain;
  } else {
    text+='Method: '+req.method+'\n'+(req.bank_name?'Bank: '+req.bank_name+'\n':'')+'Account: '+req.account_number+'\nHolder: '+req.account_holder;
  }
  if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ alert('📋 Copied!'); });
};

// Auto-refresh balance every 30s while page is open
setInterval(function(){
  var p=document.getElementById('wdPage');
  if(p&&p.style.display!=='none'&&!document.hidden) loadBalance();
},30000);
})();
