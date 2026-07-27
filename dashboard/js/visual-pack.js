/* ═══ Visual-pack behaviour (additive; no app.js / backend changes) ═══ */
(function(){
  function syncHero(){
    var src = document.getElementById('smsBigNum'), dst = document.getElementById('rangesOtpToday');
    if (src && dst){ var v = (src.textContent||'').trim(); if (v !== '' && v !== dst.textContent) dst.textContent = v; }
  }
  try { var src = document.getElementById('smsBigNum');
    if (src && window.MutationObserver) new MutationObserver(syncHero).observe(src, {childList:true, characterData:true, subtree:true});
  } catch(e){}
  setInterval(syncHero, 1500);                 // DOM-only mirror — NO network, NO console spam
  try { var s = localStorage.getItem('app_session');   // one-time initial fill
    if (s) fetch('/api/smscount',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){ var dst=document.getElementById('rangesOtpToday'); if(dst) dst.textContent=(d.count!=null?d.count:0);} }).catch(function(){});
  } catch(e){}

  window.toggleFeatMenu = function(e){ if(e) e.stopPropagation(); var m=document.getElementById('featMenu'); if(m) m.style.display = (m.style.display==='block') ? 'none' : 'block'; };
  document.addEventListener('click', function(){ var m=document.getElementById('featMenu'); if(m) m.style.display='none'; });
  var fm = document.getElementById('featMenu'); if (fm) fm.addEventListener('click', function(e){ e.stopPropagation(); });
})();
