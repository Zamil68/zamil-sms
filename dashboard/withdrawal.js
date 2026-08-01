/* ═══ withdrawal.js — Zamil SMS ═══ */
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
    loadRole(); loadBalance(); loadHistory(); loadRecent(); loadSavedMethods();
  });
}
function loadRole(){
  post('/api/auth/role',{},function(r){
    _role=(r&&r.ok)?r.role:'none';
    var s=document.getElementById('wdAdminSection');
    if(s) s.style.display=(_role==='super'||_role==='admin')?'block':'none';
    if(_role==='super'||_role==='admin'){ loadAdminRequests(); loadAdminSettings(); }
  });
}
window.openWdPage=function(){ inject(); var p=document.getElementById('wdPage'); if(p)p.style.display='block'; window.scrollTo(0,0); loadBalance(); };
window.closeWdPage=function(){ var p=document.getElementById('wdPage'); if(p)p.style.display='none'; };

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
    if(banner){ if(!d.enabled){ banner.style.display='block'; banner.textContent='🚫 '+(d.disabledMessage||'Withdrawals temporarily disabled.'); } else banner.style.display='none'; }
    var fl=document.getElementById('wdFeeLabel'); if(fl) fl.textContent=(d.cryptoFee||0).toFixed(2);
    checkForm();
  });
}
function loadHistory(){
  post('/api/withdraw/history',{},function(d){
    var el=document.getElementById('wdHistory'); if(!el) return;
    var cnt=document.getElementById('wdHistCount');
    if(!d||!d.ok||!d.withdrawals||!d.withdrawals.length){ el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">No withdrawals yet</div>'; if(cnt)cnt.textContent='0'; return; }
    if(cnt)cnt.textContent=d.withdrawals.length;
    el.innerHTML=d.withdrawals.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleDateString('en-PK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      var ml=w.method==='crypto'?'Crypto ('+esc(w.crypto_chain||'USDT')+')':esc(w.method);
      var h='<div class="wd-hist-card '+esc(w.status)+'"><div class="wd-hist-top"><span class="wd-hist-amt">$'+(w.amount_usd||0).toFixed(4)+'</span><span class="wd-hist-status '+esc(w.status)+'">'+esc(w.status)+'</span></div>';
      h+='<div class="wd-hist-meta">'+ml+' · Rs '+(w.amount_pkr||0).toLocaleString()+' · '+dt+'</div>';
      if(w.admin_message) h+='<div class="wd-hist-msg '+esc(w.status)+'">'+(w.status==='approved'?'✅ ':'❌ ')+esc(w.admin_message)+'</div>';
      return h+'</div>';
    }).join('');
  });
}
function loadRecent(){
  post('/api/withdraw/recent',{},function(d){
    var el=document.getElementById('wdRecentList'); if(!el) return;
    if(!d||!d.ok||!d.recent||!d.recent.length){ el.innerHTML='<div style="text-align:center;padding:14px;color:var(--muted);font-size:.76rem">No recent withdrawals</div>'; return; }
    el.innerHTML=d.recent.map(function(w,i){
      var ini=String(w.username||'?').slice(0,2).toUpperCase();
      var hue=(i*47+160)%360;
      return '<div class="wd-recent-item"><div class="wd-recent-av" style="--hue:'+hue+'">'+esc(ini)+'</div><div class="wd-recent-name">'+esc(w.username)+'</div><div class="wd-recent-amt">$'+(w.amount_usd||0).toFixed(2)+'</div></div>';
    }).join('');
  });
}
function loadSavedMethods(){
  post('/api/withdraw/methods',{},function(d){
    if(!d||!d.ok||!d.methods||!d.methods.length) return;
    var m=d.methods[0];
    if(m.method&&m.method!=='crypto'){
      var sel=document.getElementById('wdMethod'); if(sel)sel.value=m.method; wdMethodChange();
      if(m.bank_name){var bn=document.getElementById('wdBankName');if(bn)bn.value=m.bank_name;}
      if(m.account_number){var an=document.getElementById('wdAccNum');if(an)an.value=m.account_number;var an2=document.getElementById('wdAccNum2');if(an2)an2.value=m.account_number;}
      if(m.account_holder){var ah=document.getElementById('wdAccHolder');if(ah)ah.value=m.account_holder;}
    } else if(m.method==='crypto'){
      var sel2=document.getElementById('wdMethod'); if(sel2)sel2.value='crypto'; wdMethodChange();
      if(m.crypto_platform){var cp=document.getElementById('wdCryptoPlatform');if(cp)cp.value=m.crypto_platform;}
      if(m.crypto_uid){var cu=document.getElementById('wdCryptoUid');if(cu)cu.value=m.crypto_uid;}
      if(m.crypto_address){var ca=document.getElementById('wdCryptoAddr');if(ca)ca.value=m.crypto_address;var ca2=document.getElementById('wdCryptoAddr2');if(ca2)ca2.value=m.crypto_address;}
      if(m.crypto_chain){var cc=document.getElementById('wdCryptoChain');if(cc)cc.value=m.crypto_chain;}
    }
  });
}
window.wdMethodChange=function(){
  var m=document.getElementById('wdMethod').value;
  var bank=document.getElementById('wdBankSection'), crypto=document.getElementById('wdCryptoSection'), bnf=document.getElementById('wdBankNameField'), fc=document.getElementById('wdFeeChip');
  if(m==='crypto'){if(bank)bank.classList.add('hide');if(crypto)crypto.classList.add('show');if(fc)fc.style.display='inline-flex';}
  else{if(bank)bank.classList.remove('hide');if(crypto)crypto.classList.remove('show');if(fc)fc.style.display='none';}
  if(m==='bank'||m==='other'){if(bnf)bnf.style.display='block';}else{if(bnf)bnf.style.display='none';}
  checkForm();
};
window.wdCalcPkr=function(){
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var rate=(_balance&&_balance.pkrRate)||285;
  var el=document.getElementById('wdAmountPkr'); if(el)el.textContent='Rs '+Math.round(amt*rate).toLocaleString();
  checkForm();
};
function checkForm(){
  var btn=document.getElementById('wdSubmitBtn'); if(!btn)return;
  if(!_balance||!_balance.canWithdraw){btn.disabled=true;return;}
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var method=document.getElementById('wdMethod').value;
  btn.disabled=!(amt>=(_balance.minWithdraw||2)&&amt<=_balance.available&&method!=='');
}
window.wdSubmit=function(){
  var method=document.getElementById('wdMethod').value;
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var body={method:method,amountUsd:amt,saveMethod:document.getElementById('wdSaveMethod').checked,note:document.getElementById('wdNote').value};
  if(method==='crypto'){
    var a1=document.getElementById('wdCryptoAddr').value.trim(),a2=document.getElementById('wdCryptoAddr2').value.trim();
    if(a1!==a2){alert('⚠ Addresses do not match!');return;}
    body.cryptoPlatform=document.getElementById('wdCryptoPlatform').value;
    body.cryptoUid=document.getElementById('wdCryptoUid').value.trim();
    body.cryptoAddress=a1;
    body.cryptoChain=document.getElementById('wdCryptoChain').value.trim();
    if(!body.cryptoPlatform||!body.cryptoUid||!a1||!body.cryptoChain){alert('Fill all crypto fields.');return;}
  } else {
    var n1=document.getElementById('wdAccNum').value.trim(),n2=document.getElementById('wdAccNum2').value.trim();
    if(n1!==n2){alert('⚠ Account numbers do not match!');return;}
    body.bankName=document.getElementById('wdBankName').value.trim();
    body.accountNumber=n1;
    body.accountHolder=document.getElementById('wdAccHolder').value.trim();
    if(!n1||!body.accountHolder){alert('Fill account number and holder name.');return;}
    if((method==='bank'||method==='other')&&!body.bankName){alert('Enter bank/wallet name.');return;}
  }
  var btn=document.getElementById('wdSubmitBtn'); btn.disabled=true; btn.textContent='Submitting…';
  post('/api/withdraw/submit',body,function(d){
    btn.disabled=false; btn.textContent='Request Withdrawal';
    if(d&&d.ok){
      wdShowSuccess('Withdrawal Submitted!','Your request for $'+amt.toFixed(2)+' is pending. Expected: 3 hours on business days.');
      document.getElementById('wdAmount').value=''; document.getElementById('wdNote').value='';
      loadBalance(); setTimeout(loadHistory,1500);
    } else alert('❌ '+((d&&d.error)||'Failed'));
  });
};
function wdShowSuccess(t,b){
  var ti=document.getElementById('wdSuccessTitle');if(ti)ti.textContent=t;
  var bo=document.getElementById('wdSuccessBody');if(bo)bo.textContent=b;
  var ov=document.getElementById('wdSuccessOverlay');if(ov)ov.classList.add('show');
}
window.wdCloseSuccess=function(){var ov=document.getElementById('wdSuccessOverlay');if(ov)ov.classList.remove('show');};

/* ═══ ADMIN ═══ */
function loadAdminSettings(){
  post('/api/withdraw/balance',{},function(d){
    if(!d||!d.ok)return;
    var r=document.getElementById('wdSetRate');if(r)r.value=d.pkrRate||285;
    var m=document.getElementById('wdSetMin');if(m)m.value=d.minWithdraw||2;
    var f=document.getElementById('wdSetFee');if(f)f.value=d.cryptoFee||1;
    var dis=document.getElementById('wdSetDisabled');if(dis)dis.checked=!d.enabled;
    var dm=document.getElementById('wdSetDisMsg');if(dm)dm.value=d.disabledMessage||'';
  });
}
window.wdSaveSettings=function(){
  var msg=document.getElementById('wdSetMsg');
  post('/api/admin/withdraw/settings',{
    pkrRate:parseFloat(document.getElementById('wdSetRate').value)||285,
    minWithdraw:parseFloat(document.getElementById('wdSetMin').value)||2,
    cryptoFee:parseFloat(document.getElementById('wdSetFee').value)||1,
    enabled:!document.getElementById('wdSetDisabled').checked,
    disabledMessage:document.getElementById('wdSetDisMsg').value.trim()
  },function(d){
    if(msg){msg.style.display='block';msg.style.color=(d&&d.ok)?'var(--wg)':'var(--wred)';msg.textContent=(d&&d.ok)?'✅ Saved':((d&&d.error)||'Failed');}
    if(d&&d.ok) loadBalance();
  });
};
function loadAdminRequests(){
  post('/api/admin/withdraw/requests',{status:'pending'},function(d){
    var el=document.getElementById('wdAdminRequests');if(!el)return;
    if(!d||!d.ok||!d.requests||!d.requests.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">✅ No pending requests</div>';return;}
    window._wdReqs=d.requests;
    el.innerHTML=d.requests.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleString('en-PK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      var isC=w.method==='crypto';
      var det=isC
        ?'<div class="wd-admin-detail"><b>Platform:</b> '+esc(w.crypto_platform)+'<br><b>UID:</b> '+esc(w.crypto_uid)+'<br><b>Address:</b> <code style="word-break:break-all;font-size:.68rem">'+esc(w.crypto_address)+'</code><br><b>Chain:</b> '+esc(w.crypto_chain)+'<br><b>Fee:</b> $'+(w.crypto_fee_usd||0).toFixed(2)+'</div>'
        :'<div class="wd-admin-detail"><b>Method:</b> '+esc(w.method)+(w.bank_name?'<br><b>Bank:</b> '+esc(w.bank_name):'')+'<br><b>Account:</b> '+esc(w.account_number)+'<br><b>Holder:</b> '+esc(w.account_holder)+'</div>';
      return '<div class="wd-admin-card"><div class="wd-admin-top"><div class="wd-admin-user">'+esc(w.username)+'</div><div class="wd-admin-amt">$'+(w.amount_usd||0).toFixed(4)+' <span style="color:var(--muted);font-size:.68rem">≈Rs '+(w.amount_pkr||0).toLocaleString()+'</span></div><div class="wd-admin-time">'+dt+'</div></div>'
        +det+(w.note?'<div style="font-size:.7rem;color:var(--muted);font-style:italic;margin-bottom:6px">📝 '+esc(w.note)+'</div>':'')
        +'<div class="wd-admin-actions"><button class="wd-admin-btn approve" onclick="wdAction('+w.id+',\'approve\',this)">✅ Approve</button><button class="wd-admin-btn reject" onclick="wdAction('+w.id+',\'reject\',this)">❌ Reject</button><button class="wd-admin-btn copy" onclick="wdCopy('+w.id+')">📋 Copy</button></div>'
        +'<div class="wd-admin-msg-row" id="wdMsg_'+w.id+'" style="display:none"><input class="wd-admin-msg-input" id="wdMsgInp_'+w.id+'" placeholder="Message to user…"></div></div>';
    }).join('');
  });
}
window.wdAction=function(id,action,btn){
  var mr=document.getElementById('wdMsg_'+id),mi=document.getElementById('wdMsgInp_'+id);
  if(mr&&mr.style.display==='none'){mr.style.display='block';if(mi)mi.focus();return;}
  var message=(mi&&mi.value)||'';
  if(action==='reject'&&!message)message='Withdrawal rejected.';
  btn.disabled=true;btn.textContent='…';
  post(action==='approve'?'/api/admin/withdraw/approve':'/api/admin/withdraw/reject',{id:id,message:message},function(d){
    if(d&&d.ok){btn.textContent=action==='approve'?'✅ Done':'❌ Done';btn.style.opacity='.5';setTimeout(loadAdminRequests,1000);}
    else{alert('Failed: '+((d&&d.error)||'?'));btn.disabled=false;btn.textContent=action==='approve'?'✅ Approve':'❌ Reject';}
  });
};
window.wdCopy=function(id){
  var r=(window._wdReqs||[]).find(function(x){return x.id===id;});if(!r)return;
  var t='User: '+r.username+'\nAmount: $'+r.amount_usd+' (Rs '+r.amount_pkr+')\n';
  if(r.method==='crypto')t+='Platform: '+r.crypto_platform+'\nUID: '+r.crypto_uid+'\nAddress: '+r.crypto_address+'\nChain: '+r.crypto_chain;
  else t+='Method: '+r.method+(r.bank_name?'\nBank: '+r.bank_name:'')+'\nAccount: '+r.account_number+'\nHolder: '+r.account_holder;
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){alert('📋 Copied!');});
};
setInterval(function(){var p=document.getElementById('wdPage');if(p&&p.style.display!=='none'&&!document.hidden)loadBalance();},30000);
})();
