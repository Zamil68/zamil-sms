/* ═══ withdrawal.js — Zamil SMS — v3 (Animated Popups + Status Detection) ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url, body, cb){
  var ctrl=new AbortController();
  var timer=setTimeout(function(){ctrl.abort();},20000);
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify(Object.assign({session:sess()},body||{}))})
    .then(function(r){clearTimeout(timer);return r.json().catch(function(){return{ok:false,error:'HTTP '+r.status};});})
    .then(function(d){cb(d);})
    .catch(function(e){clearTimeout(timer);cb({ok:false,error:e.name==='AbortError'?'Timed out — try again':'Network error'});});
}

/* ═══ ANIMATED SVG ICONS (no hardcoded keyboard emoji) ═══ */
var ICONS={
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  cross:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>'
};
function icon(name,cls){ return '<span class="wd-ic'+(cls?' '+cls:'')+'">'+(ICONS[name]||'')+'</span>'; }

/* ═══ STATE ═══ */
var _injected=false,_balance=null,_role='none',_loading=false;
var _prevStatuses={}; // for status change detection

/* ═══ INJECT HTML ═══ */
function inject(){
  if(_injected)return;_injected=true;
  fetch('/dashboard/withdrawal.html').then(function(r){return r.text();}).then(function(h){
    var d=document.createElement('div');d.innerHTML=h;
    while(d.firstElementChild)document.body.appendChild(d.firstElementChild);
    var p=document.getElementById('wdPage');if(p)p.style.display='block';
    window.scrollTo(0,0);
    loadRole();loadBalance();loadHistory();loadRecent();loadSavedMethods();
  });
}

/* ═══ UNIVERSAL OVERLAY POPUP ═══ */
var _ovTimer=null;
function wdShowOverlay(opts){
  var ov=document.getElementById('wdOverlay');if(!ov)return;
  var banner=document.getElementById('wdOvBanner');
  var iconEl=document.getElementById('wdOvIcon');
  var svgEl=document.getElementById('wdOvSvg');
  var title=document.getElementById('wdOvTitle');
  var body=document.getElementById('wdOvBody');
  var detail=document.getElementById('wdOvDetail');
  var actions=document.getElementById('wdOvActions');
  var type=opts.type||'success';

  banner.className='wd-overlay-banner '+type;
  iconEl.className='wd-overlay-icon '+type;

  var svgMap={
    success:ICONS.check, approved:ICONS.check,
    error:ICONS.cross, rejected:ICONS.cross,
    info:ICONS.info
  };
  svgEl.outerHTML='<svg id="wdOvSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+(svgMap[type]||ICONS.check).replace(/<\/?svg[^>]*>/g,'')+'</svg>';
  svgEl=document.getElementById('wdOvSvg');

  title.textContent=opts.title||'Done';
  body.textContent=opts.body||'';

  if(opts.detail){detail.style.display='block';detail.innerHTML=opts.detail;}
  else{detail.style.display='none';detail.innerHTML='';}

  var html='';
  if(opts.btn2Text){
    html+='<button class="wd-overlay-btn secondary" onclick="'+(opts.btn2Action||'wdCloseOverlay()')+'">'+opts.btn2Text+'</button>';
  }
  html+='<button class="wd-overlay-btn '+(type==='error'||type==='rejected'?'danger':'primary')+'" onclick="'+(opts.btn1Action||'wdCloseOverlay()')+'">'+(opts.btn1Text||'Done')+'</button>';
  actions.innerHTML=html;

  ov.classList.add('show');
  if(opts.confetti) wdFireConfetti();
  if(_ovTimer)clearTimeout(_ovTimer);
}
window.wdCloseOverlay=function(){var ov=document.getElementById('wdOverlay');if(ov)ov.classList.remove('show');};

/* ═══ TOAST ═══ */
var _toastTimer=null;
function wdToast(msg,color){
  var t=document.getElementById('wdToast');if(!t)return;
  var dot=t.querySelector('.dot');
  var txt=document.getElementById('wdToastMsg');
  if(dot)dot.className='dot '+(color||'green');
  if(txt)txt.textContent=msg;
  t.classList.add('show');
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(function(){t.classList.remove('show');},3500);
}

/* ═══ CONFETTI ═══ */
function wdFireConfetti(){
  var c=document.getElementById('wdConfetti');if(!c)return;
  c.style.display='block';
  var ctx=c.getContext('2d');
  c.width=window.innerWidth;c.height=window.innerHeight;
  var colors=['#34d399','#fbbf24','#f472b6','#60a5fa','#a78bfa','#ffffff','#f97316'];
  var parts=[];
  for(var i=0;i<140;i++){
    parts.push({
      x:Math.random()*c.width,
      y:Math.random()*c.height-c.height,
      w:Math.random()*9+4,
      h:Math.random()*5+2,
      color:colors[Math.floor(Math.random()*colors.length)],
      vx:(Math.random()-.5)*4,
      vy:Math.random()*3.5+2,
      rot:Math.random()*360,
      vr:(Math.random()-.5)*10,
      life:1,
      shape:Math.random()>.5?'rect':'circle'
    });
  }
  var frame=0;
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    var alive=false;
    for(var i=0;i<parts.length;i++){
      var p=parts[i];
      if(p.life<=0)continue;
      alive=true;
      p.x+=p.vx;p.y+=p.vy;p.vy+=0.07;p.rot+=p.vr;
      p.vx*=0.99;
      if(frame>50)p.life-=0.014;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot*Math.PI/180);
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.color;
      if(p.shape==='circle'){
        ctx.beginPath();ctx.arc(0,0,p.w/3,0,Math.PI*2);ctx.fill();
      }else{
        ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      }
      ctx.restore();
    }
    frame++;
    if(alive&&frame<220)requestAnimationFrame(draw);
    else{ctx.clearRect(0,0,c.width,c.height);c.style.display='none';}
  }
  draw();
}

/* ═══ STATUS CHANGE DETECTION ═══ */
function wdCheckStatusChanges(withdrawals){
  if(!withdrawals||!withdrawals.length)return;
  var changed=[];
  withdrawals.forEach(function(w){
    var prev=_prevStatuses[w.id];
    if(prev&&prev!==w.status){changed.push(w);}
    _prevStatuses[w.id]=w.status;
  });
  if(!changed.length)return;
  var w=changed[0];
  if(w.status==='approved'){
    wdShowOverlay({
      type:'approved',
      title:'Payment Sent!',
      body:'Your withdrawal has been approved and processed successfully.',
      detail:'<span class="lbl">Amount</span><span class="val green">$'+parseFloat(w.amount_usd).toFixed(2)+' (Rs '+Math.round(w.amount_pkr||0).toLocaleString()+')</span><br>'
        +'<span class="lbl">Method</span><span class="val">'+esc(w.method||'—')+'</span><br>'
        +(w.admin_message?'<span class="lbl">Admin Note</span><span class="val">'+esc(w.admin_message)+'</span>':''),
      btn1Text:'Awesome!',
      btn1Action:'wdCloseOverlay();',
      confetti:true
    });
  }else if(w.status==='rejected'){
    wdShowOverlay({
      type:'rejected',
      title:'Withdrawal Rejected',
      body:'Unfortunately your request was not approved this time.',
      detail:'<span class="lbl">Amount</span><span class="val red">$'+parseFloat(w.amount_usd).toFixed(2)+'</span><br>'
        +'<span class="lbl">Reason</span><span class="val red">'+esc(w.admin_message||'No reason provided')+'</span><br>'
        +'<span class="lbl">What now?</span><span class="val">Your balance has been restored. You can submit a new request with corrected details.</span>',
      btn1Text:'Check History',
      btn1Action:'wdCloseOverlay();',
      btn2Text:'Close',
      btn2Action:'wdCloseOverlay()'
    });
  }
}

/* ═══ PAGE OPEN/CLOSE ═══ */
function loadRole(){
  post('/api/auth/role',{},function(r){
    _role=(r&&r.ok)?r.role:'none';
    var s=document.getElementById('wdAdminSection');
    if(s)s.style.display=(_role==='super'||_role==='admin')?'block':'none';
    if(_role==='super'||_role==='admin'){loadAdminRequests();loadAdminSettings();}
  });
}
window.openWdPage=function(){
  var p=document.getElementById('wdPage');
  if(p){p.style.display='block';window.scrollTo(0,0);_loading=false;loadBalance();loadHistory();loadRecent();return;}
  inject();
};
window.closeWdPage=function(){var p=document.getElementById('wdPage');if(p)p.style.display='none';};

function showLoading(el,msg){
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:24px;color:var(--muted);font-size:.8rem"><div class="wd-spinner"></div><div style="margin-top:10px;animation:wdFade 1.5s ease infinite">'+(msg||'Loading…')+'</div></div>';
}

/* ═══ BALANCE ═══ */
function loadBalance(){
  if(_loading)return;_loading=true;
  post('/api/withdraw/balance',{},function(d){
    _loading=false;
    if(!d||!d.ok)return;
    _balance=d;
    var el=document.getElementById('wdBalance');if(el)el.textContent='$'+d.available.toFixed(4);
    var pk=document.getElementById('wdBalancePkr');if(pk)pk.textContent='≈ Rs '+d.availablePkr.toLocaleString();
    var te=document.getElementById('wdTotalEarned');if(te)te.textContent='$'+d.totalEarnings.toFixed(2);
    var tw=document.getElementById('wdTotalWithdrawn');if(tw)tw.textContent='$'+d.totalWithdrawn.toFixed(2);
    var min=d.minWithdraw||2;
    var ml=document.getElementById('wdMinLabel');if(ml)ml.textContent=min;
    var pct=Math.min(100,(d.available/min)*100);
    var pb=document.getElementById('wdProgressBar');if(pb)pb.style.width=pct.toFixed(1)+'%';
    var pp=document.getElementById('wdProgressPct');if(pp)pp.textContent=Math.round(pct)+'%';
    var btn=document.getElementById('wdSubmitBtn');if(btn)btn.disabled=!d.canWithdraw;
    var banner=document.getElementById('wdDisabledBanner');
    if(banner){if(!d.enabled){banner.style.display='block';banner.textContent=(d.disabledMessage||'Withdrawals temporarily disabled.');}else banner.style.display='none';}
    var fl=document.getElementById('wdFeeLabel');if(fl)fl.textContent=(d.cryptoFee||0).toFixed(2);
    checkForm();
  });
}

/* ═══ HISTORY (with status change detection) ═══ */
function loadHistory(){
  var el=document.getElementById('wdHistory');
  showLoading(el,'Fetching history…');
  post('/api/withdraw/history',{},function(d){
    if(!el)return;
    var cnt=document.getElementById('wdHistCount');
    if(!d||!d.ok||!d.withdrawals||!d.withdrawals.length){
      el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">'+icon('history','wd-ic-muted')+' No withdrawals yet</div>';
      if(cnt)cnt.textContent='0';return;
    }
    if(cnt)cnt.textContent=d.withdrawals.length;
    // Detect status changes BEFORE rendering
    wdCheckStatusChanges(d.withdrawals);
    el.innerHTML=d.withdrawals.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleDateString('en-PK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      var ml=w.method==='crypto'?'Crypto ('+esc(w.crypto_chain||'USDT')+')':esc(w.method);
      var statusIcon=w.status==='approved'?icon('check','wd-ic-green'):w.status==='rejected'?icon('cross','wd-ic-red'):icon('clock','wd-ic-gold');
      var h='<div class="wd-hist-card '+esc(w.status)+'" onclick="wdHistTap('+w.id+')">';
      h+='<div class="wd-hist-top"><span class="wd-hist-amt">$'+(w.amount_usd||0).toFixed(4)+'</span><span class="wd-hist-status '+esc(w.status)+'">'+statusIcon+' '+esc(w.status)+'</span></div>';
      h+='<div class="wd-hist-meta">'+ml+' · Rs '+(w.amount_pkr||0).toLocaleString()+' · '+dt+'</div>';
      if(w.admin_message)h+='<div class="wd-hist-msg '+esc(w.status)+'">'+esc(w.admin_message)+'</div>';
      h+='<div class="wd-hist-tap">Tap for details</div>';
      return h+'</div>';
    }).join('');
  });
}

/* History card tap → show detail popup */
window.wdHistTap=function(id){
  post('/api/withdraw/history',{},function(d){
    if(!d||!d.ok)return;
    var w=(d.withdrawals||[]).find(function(x){return x.id===id;});
    if(!w)return;
    var type=w.status==='approved'?'approved':w.status==='rejected'?'rejected':'info';
    var title=w.status==='approved'?'Payment Completed':w.status==='rejected'?'Request Rejected':'Request Pending';
    var body=w.status==='approved'?'Your payment has been processed successfully.':w.status==='rejected'?'This request was rejected. Your balance has been restored.':'Your request is being processed. Expected within 3 hours on business days.';
    var det='<span class="lbl">Amount</span><span class="val '+(w.status==='rejected'?'red':'green')+'">$'+parseFloat(w.amount_usd).toFixed(4)+' (Rs '+Math.round(w.amount_pkr||0).toLocaleString()+')</span><br>'
      +'<span class="lbl">Method</span><span class="val">'+esc(w.method||'—')+'</span><br>'
      +'<span class="lbl">Date</span><span class="val">'+(w.created_at?new Date(w.created_at).toLocaleString('en-PK'):'—')+'</span><br>'
      +(w.admin_message?'<span class="lbl">'+(w.status==='rejected'?'Rejection Reason':'Admin Note')+'</span><span class="val '+(w.status==='rejected'?'red':'green')+'">'+esc(w.admin_message)+'</span>':'');
    wdShowOverlay({type:type,title:title,body:body,detail:det,btn1Text:'Close',btn1Action:'wdCloseOverlay()'});
  });
};

/* ═══ RECENT ═══ */
function loadRecent(){
  var el=document.getElementById('wdRecentList');
  showLoading(el,'Loading…');
  post('/api/withdraw/recent',{},function(d){
    if(!el)return;
    if(!d||!d.ok||!d.recent||!d.recent.length){el.innerHTML='<div style="text-align:center;padding:14px;color:var(--muted);font-size:.76rem">No recent payouts</div>';return;}
    el.innerHTML=d.recent.map(function(w,i){
      var ini=String(w.username||'?').slice(0,2).toUpperCase();
      var hue=(i*47+160)%360;
      return '<div class="wd-recent-item"><div class="wd-recent-av" style="--hue:'+hue+'">'+esc(ini)+'</div><div class="wd-recent-name">'+esc(w.username)+'</div><div class="wd-recent-amt">$'+(w.amount_usd||0).toFixed(2)+'</div></div>';
    }).join('');
  });
}

/* ═══ SAVED METHODS ═══ */
function loadSavedMethods(){
  post('/api/withdraw/methods',{},function(d){
    if(!d||!d.ok||!d.methods||!d.methods.length)return;
    var m=d.methods[0];
    if(m.method&&m.method!=='crypto'){
      var sel=document.getElementById('wdMethod');if(sel)sel.value=m.method;wdMethodChange();
      if(m.bank_name){var bn=document.getElementById('wdBankName');if(bn)bn.value=m.bank_name;}
      if(m.account_number){var an=document.getElementById('wdAccNum');if(an)an.value=m.account_number;var an2=document.getElementById('wdAccNum2');if(an2)an2.value=m.account_number;}
      if(m.account_holder){var ah=document.getElementById('wdAccHolder');if(ah)ah.value=m.account_holder;}
    }else if(m.method==='crypto'){
      var sel2=document.getElementById('wdMethod');if(sel2)sel2.value='crypto';wdMethodChange();
      if(m.crypto_platform){var cp=document.getElementById('wdCryptoPlatform');if(cp)cp.value=m.crypto_platform;}
      if(m.crypto_uid){var cu=document.getElementById('wdCryptoUid');if(cu)cu.value=m.crypto_uid;}
      if(m.crypto_address){var ca=document.getElementById('wdCryptoAddr');if(ca)ca.value=m.crypto_address;var ca2=document.getElementById('wdCryptoAddr2');if(ca2)ca2.value=m.crypto_address;}
      if(m.crypto_chain){var cc=document.getElementById('wdCryptoChain');if(cc)cc.value=m.crypto_chain;}
    }
  });
}

/* ═══ FORM LOGIC ═══ */
window.wdMethodChange=function(){
  var m=document.getElementById('wdMethod').value;
  var bank=document.getElementById('wdBankSection'),crypto=document.getElementById('wdCryptoSection'),bnf=document.getElementById('wdBankNameField'),fc=document.getElementById('wdFeeChip');
  if(m==='crypto'){if(bank)bank.classList.add('hide');if(crypto)crypto.classList.add('show');if(fc)fc.style.display='inline-flex';}
  else{if(bank)bank.classList.remove('hide');if(crypto)crypto.classList.remove('show');if(fc)fc.style.display='none';}
  if(m==='bank'||m==='other'){if(bnf)bnf.style.display='block';}else{if(bnf)bnf.style.display='none';}
  checkForm();
};
window.wdCalcPkr=function(){
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var rate=(_balance&&_balance.pkrRate)||285;
  var el=document.getElementById('wdAmountPkr');if(el)el.textContent='Rs '+Math.round(amt*rate).toLocaleString();
  checkForm();
};
function checkForm(){
  var btn=document.getElementById('wdSubmitBtn');if(!btn)return;
  if(!_balance||!_balance.canWithdraw){btn.disabled=true;return;}
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var method=document.getElementById('wdMethod').value;
  btn.disabled=!(amt>=(_balance.minWithdraw||2)&&amt<=_balance.available&&method!=='');
}

/* ═══ SUBMIT ═══ */
window.wdSubmit=function(){
  var method=document.getElementById('wdMethod').value;
  var amt=parseFloat(document.getElementById('wdAmount').value)||0;
  var body={method:method,amountUsd:amt,saveMethod:document.getElementById('wdSaveMethod').checked,note:document.getElementById('wdNote').value};

  if(method==='crypto'){
    var a1=document.getElementById('wdCryptoAddr').value.trim(),a2=document.getElementById('wdCryptoAddr2').value.trim();
    if(a1!==a2){
      wdShowOverlay({type:'error',title:'Address Mismatch',body:'Your USDT addresses do not match. Please re-enter them carefully.',btn1Text:'Fix It',btn1Action:'wdCloseOverlay();document.getElementById("wdCryptoAddr2").focus();'});
      return;
    }
    body.cryptoPlatform=document.getElementById('wdCryptoPlatform').value;
    body.cryptoUid=document.getElementById('wdCryptoUid').value.trim();
    body.cryptoAddress=a1;body.cryptoChain=document.getElementById('wdCryptoChain').value.trim();
    if(!body.cryptoPlatform||!body.cryptoUid||!a1||!body.cryptoChain){
      wdShowOverlay({type:'error',title:'Missing Fields',body:'Please fill all crypto fields (Platform, UID, Address, Chain).',btn1Text:'OK',btn1Action:'wdCloseOverlay()'});
      return;
    }
  }else{
    var n1=document.getElementById('wdAccNum').value.trim(),n2=document.getElementById('wdAccNum2').value.trim();
    if(n1!==n2){
      wdShowOverlay({type:'error',title:'Account Mismatch',body:'Your account numbers do not match. Please re-enter to confirm.',btn1Text:'Fix It',btn1Action:'wdCloseOverlay();document.getElementById("wdAccNum2").focus();'});
      return;
    }
    body.bankName=document.getElementById('wdBankName').value.trim();
    body.accountNumber=n1;body.accountHolder=document.getElementById('wdAccHolder').value.trim();
    if(!n1||!body.accountHolder){
      wdShowOverlay({type:'error',title:'Missing Fields',body:'Please fill account number and holder name.',btn1Text:'OK',btn1Action:'wdCloseOverlay()'});
      return;
    }
    if((method==='bank'||method==='other')&&!body.bankName){
      wdShowOverlay({type:'error',title:'Missing Bank Name',body:'Please enter your bank or wallet name.',btn1Text:'OK',btn1Action:'wdCloseOverlay()'});
      return;
    }
  }

  var btn=document.getElementById('wdSubmitBtn');btn.disabled=true;btn.textContent='Submitting…';
  post('/api/withdraw/submit',body,function(d){
    btn.disabled=false;btn.textContent='Request Withdrawal';
    if(d&&d.ok){
      var rate=(_balance&&_balance.pkrRate)||285;
      wdShowOverlay({
        type:'success',
        title:'Request Submitted!',
        body:'Your withdrawal request is now pending review by admin.',
        detail:'<span class="lbl">Amount</span><span class="val green">$'+amt.toFixed(2)+' (Rs '+Math.round(amt*rate).toLocaleString()+')</span><br>'
          +'<span class="lbl">Method</span><span class="val">'+esc(method)+'</span><br>'
          +'<span class="lbl">Status</span><span class="val gold">Pending — usually processed within 3 hours</span>',
        btn1Text:'View History',
        btn1Action:'wdCloseOverlay();document.getElementById("wdHistory").scrollIntoView({behavior:"smooth"});',
        btn2Text:'Close',
        btn2Action:'wdCloseOverlay()',
        confetti:true
      });
      document.getElementById('wdAmount').value='';document.getElementById('wdNote').value='';
      var ap=document.getElementById('wdAmountPkr');if(ap)ap.textContent='Rs 0';
      _loading=false;loadBalance();setTimeout(loadHistory,1200);
    }else{
      wdShowOverlay({type:'error',title:'Submission Failed',body:(d&&d.error)||'Something went wrong. Please try again.',btn1Text:'Retry',btn1Action:'wdCloseOverlay()'});
    }
  });
};

/* ═══ REFRESH ═══ */
window.wdRefreshBalance=function(){
  var btn=document.querySelector('.wd-refresh-btn');
  if(btn){btn.classList.add('spinning');setTimeout(function(){btn.classList.remove('spinning');},1200);}
  _loading=false;loadBalance();loadHistory();loadRecent();
  wdToast('Balance refreshed','green');
};

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
    if(msg){msg.style.display='block';msg.style.color=(d&&d.ok)?'var(--wg)':'var(--wred)';msg.textContent=(d&&d.ok)?'Settings saved successfully':((d&&d.error)||'Failed');}
    if(d&&d.ok){_loading=false;loadBalance();wdToast('Settings saved','green');}
  });
};
function loadAdminRequests(){
  var el=document.getElementById('wdAdminRequests');
  showLoading(el,'Loading requests…');
  post('/api/admin/withdraw/requests',{status:'pending'},function(d){
    if(!el)return;
    if(!d||!d.ok||!d.requests||!d.requests.length){
      el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">'+icon('shield','wd-ic-muted')+' No pending requests</div>';return;
    }
    window._wdReqs=d.requests;
    el.innerHTML=d.requests.map(function(w){
      var dt=w.created_at?new Date(w.created_at).toLocaleString('en-PK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      var isC=w.method==='crypto';
      var det=isC
        ?'<div class="wd-admin-detail"><b>Platform:</b> '+esc(w.crypto_platform)+'<br><b>UID:</b> '+esc(w.crypto_uid)+'<br><b>Address:</b> <code style="word-break:break-all;font-size:.68rem">'+esc(w.crypto_address)+'</code><br><b>Chain:</b> '+esc(w.crypto_chain)+'<br><b>Fee:</b> $'+(w.crypto_fee_usd||0).toFixed(2)+'</div>'
        :'<div class="wd-admin-detail"><b>Method:</b> '+esc(w.method)+(w.bank_name?'<br><b>Bank:</b> '+esc(w.bank_name):'')+'<br><b>Account:</b> '+esc(w.account_number)+'<br><b>Holder:</b> '+esc(w.account_holder)+'</div>';
      return '<div class="wd-admin-card" id="wdCard_'+w.id+'"><div class="wd-admin-top"><div class="wd-admin-user">'+esc(w.username)+'</div><div class="wd-admin-amt">$'+(w.amount_usd||0).toFixed(4)+' <span style="color:var(--muted);font-size:.68rem">Rs '+(w.amount_pkr||0).toLocaleString()+'</span></div><div class="wd-admin-time">'+dt+'</div></div>'
        +det+(w.note?'<div style="font-size:.7rem;color:var(--muted);font-style:italic;margin-bottom:6px">'+esc(w.note)+'</div>':'')
        +'<div class="wd-admin-msg-row"><input class="wd-admin-msg-input" id="wdMsgInp_'+w.id+'" placeholder="Message to user (optional for approve, required for reject)…"></div>'
        +'<div class="wd-admin-actions"><button class="wd-admin-btn approve" onclick="wdAction('+w.id+',\'approve\',this)">'+icon('check')+' Approve</button><button class="wd-admin-btn reject" onclick="wdAction('+w.id+',\'reject\',this)">'+icon('cross')+' Reject</button><button class="wd-admin-btn copy" onclick="wdCopy('+w.id+')">'+icon('copy')+' Copy</button></div></div>';
    }).join('');
  });
}
window.wdAction=function(id,action,btn){
  var mi=document.getElementById('wdMsgInp_'+id);
  var message=(mi&&mi.value)||'';
  if(action==='reject'&&!message){
    wdShowOverlay({type:'error',title:'Reason Required',body:'Please enter a rejection reason so the user knows why their request was declined.',btn1Text:'OK',btn1Action:'wdCloseOverlay();document.getElementById("wdMsgInp_'+id+'").focus();'});
    return;
  }
  if(action==='approve'&&!message)message='Payment processed successfully. Thank you for using Zamil SMS!';
  btn.disabled=true;btn.innerHTML='<span class="wd-btn-spin"></span>';
  var url=action==='approve'?'/api/admin/withdraw/approve':'/api/admin/withdraw/reject';
  post(url,{id:id,message:message},function(d){
    if(d&&d.ok){
      var card=document.getElementById('wdCard_'+id);
      if(card){card.style.opacity='.35';card.style.pointerEvents='none';card.style.transition='all .4s';card.style.transform='scale(.97)';}
      btn.innerHTML=icon('check')+' Done';
      btn.style.opacity='.6';
      wdToast(action==='approve'?'Withdrawal approved':'Withdrawal rejected',action==='approve'?'green':'red');
      setTimeout(loadAdminRequests,1000);
    }else{
      wdShowOverlay({type:'error',title:'Action Failed',body:(d&&d.error)||'Could not process this request. Please try again.',btn1Text:'Retry',btn1Action:'wdCloseOverlay()'});
      btn.disabled=false;btn.innerHTML=action==='approve'?icon('check')+' Approve':icon('cross')+' Reject';
    }
  });
};
window.wdCopy=function(id){
  var r=(window._wdReqs||[]).find(function(x){return x.id===id;});if(!r)return;
  var t='User: '+r.username+'\nAmount: $'+r.amount_usd+' (Rs '+r.amount_pkr+')\n';
  if(r.method==='crypto')t+='Platform: '+r.crypto_platform+'\nUID: '+r.crypto_uid+'\nAddress: '+r.crypto_address+'\nChain: '+r.crypto_chain;
  else t+='Method: '+r.method+(r.bank_name?'\nBank: '+r.bank_name:'')+'\nAccount: '+r.account_number+'\nHolder: '+r.account_holder;
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){wdToast('Details copied to clipboard','blue');});
};
})();
