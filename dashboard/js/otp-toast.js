/* ═══════════════════════════════════════════════════════════
   🟢 ADD-ON 1 — Real-time floating OTP (toast + ✕ + sound + dedupe)
   Rides the EXISTING 3s poll → NO extra requests.
   Baseline-dedupe: a toast only fires for a message that arrives
   AFTER this page's baseline, so a stale "top" message never
   re-floats (fixes "float shows even when nothing new").
   ═══════════════════════════════════════════════════════════ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function codeOf(m){ var x=String(m||'').match(/\b(\d{4,8})\b/); return x?x[1]:''; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function keyOf(r){ return ((r&&(r.datetime||r.time))||'')+'|'+((r&&r.number)||''); }

  // baseline dedupe set (shared with the cache layer add-on)
  window._floatSeen = window._floatSeen || new Set();
  window.seedFloatSeen = function(recent){ try{ (recent||[]).forEach(function(r){ window._floatSeen.add(keyOf(r)); }); }catch(e){} };

  var actx=null;
  function ensureCtx(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(actx&&actx.state==='suspended'){ actx.resume().catch(function(){}); } return actx; }
  function chime(){ var c=ensureCtx(); if(!c) return; try{ var now=c.currentTime;
    [[660,0],[880,0.10],[1320,0.20]].forEach(function(p){ var o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination); o.type='sine'; o.frequency.value=p[0]; var t=now+p[1]; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.30,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.34); o.start(t); o.stop(t+0.36); });
  }catch(e){} }
  ['click','keydown','touchstart'].forEach(function(ev){ document.addEventListener(ev, ensureCtx, {once:true, passive:true}); });

  var host=null, hideT=null;
  function toastHost(){ if(host) return host; host=document.createElement('div'); host.id='otpFloat'; document.body.appendChild(host); return host; }
  window.hideOtpFloat = function(){ if(host) host.classList.remove('show'); clearTimeout(hideT); };
  function showFloat(text, recent){
    var r=(recent&&recent[0])||null;
    var k=keyOf(r);
    if(!r || window._floatSeen.has(k)) return;          // ← baseline dedupe: not new → no float
    window._floatSeen.add(k);
    var code=codeOf(r.message), cli=(r.cli||'OTP'), num=(r.number||''), t=(r.time||''), more=(recent&&recent.length>1)?(' +'+(recent.length-1)+' more'):'';
    if(!code && !num) return;                            // nothing meaningful → no float
    var h=toastHost();
    h.innerHTML='<div class="otp-float-card" title="Tap to copy '+(code||num)+'">'
      +'<button class="otp-float-close" onclick="event.stopPropagation();hideOtpFloat()" aria-label="Dismiss">✕</button>'
      +'<div class="otp-float-top"><div class="otp-float-cli">📨 <b>'+esc(cli)+more+'</b></div><div class="otp-float-time">'+esc(t)+'</div></div>'
      +(code?'<div class="otp-float-code">'+esc(code)+'</div>':'')
      +(num?'<div class="otp-float-num">📱 '+esc(num)+'</div>':'')
      +(r.message?'<div class="otp-float-msg">'+esc(r.message)+'</div>':'')
      +'<div class="otp-float-hint">tap card to copy code</div></div>';
    var card=h.querySelector('.otp-float-card'); if(card) card.onclick=function(){ var v=code||num; if(v&&navigator.clipboard) navigator.clipboard.writeText(v).catch(function(){}); };
    h.classList.add('show'); clearTimeout(hideT); hideT=setTimeout(window.hideOtpFloat, 4000);   // ← 4s
    if(!document.hidden) chime();
  }
  function enhanceCodes(){ try{ document.querySelectorAll('#smsRecentList .rsms-body').forEach(function(el){
    if(el.getAttribute('data-otpdone')) return; el.setAttribute('data-otpdone','1');
    el.innerHTML = el.innerHTML.replace(/\b(\d{4,8})\b/, '<span class="otp-code">$1</span>');
  }); }catch(e){} }

  ready(function(){
    if(typeof showSmsAlert==='function'){ var _o=showSmsAlert; window.showSmsAlert=function(t,r){ try{ showFloat(t,r); }catch(e){ try{_o(t,r);}catch(_){} } }; }
    if(typeof renderSmsRecent==='function'){ var _r=renderSmsRecent; window.renderSmsRecent=function(it){ try{_r(it);}catch(e){} enhanceCodes(); }; }
  });
})();

/* ═══════════════════════════════════════════════════════════
   🟢 ADD-ON 2 — Remember the active tab across a browser refresh.
   ═══════════════════════════════════════════════════════════ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  var KEY='zamil_view', NKEY='zamil_num';
  function setView(v){ try{ sessionStorage.setItem(KEY,v); }catch(e){} }
  function setNum(id,t,c){ try{ sessionStorage.setItem(NKEY, JSON.stringify({id:id,title:t,count:c})); setView('numbers'); }catch(e){} }
  ready(function(){
    try{
      if(typeof bnSwitch==='function'){ var _bn=bnSwitch; window.bnSwitch=function(p){ try{ var m=(p==='home')?'ranges':p; setView(m); }catch(e){} return _bn.apply(this,arguments); }; }
      if(typeof loadNumbers==='function'){ var _ln=loadNumbers; window.loadNumbers=function(id,t,c){ try{ setNum(id,t,c); }catch(e){} return _ln.apply(this,arguments); }; }
      if(typeof showRanges==='function'){ var _sr=showRanges; window.showRanges=function(){ try{ setView('ranges'); }catch(e){} return _sr.apply(this,arguments); }; }
    }catch(e){}
    try{
      if(!localStorage.getItem('app_session')) return;
      var v=sessionStorage.getItem(KEY), n=sessionStorage.getItem(NKEY);
      if(v==='numbers' && n){ var o=JSON.parse(n); if(o&&o.id){ try{ if(typeof ACTIVE_RANGE!=='undefined'){ ACTIVE_RANGE.id=o.id; ACTIVE_RANGE.title=o.title||''; ACTIVE_RANGE.count=o.count||0; } }catch(e){} if(typeof loadNumbers==='function') loadNumbers(o.id,o.title||'',o.count||0); return; } }
      if(v && v!=='ranges' && v!=='numbers' && typeof bnSwitch==='function') bnSwitch(v);
    }catch(e){}
  });
})();
