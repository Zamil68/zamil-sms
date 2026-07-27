/* ═══ RANGES INSTANT-CACHE — never show a blank/spinner when we have cached
       ranges; gentle background refresh keeps them current. Additive. ═══ */
(function(){
  function zget(k){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } }
  function paintFromCache(){
    try{
      var q=((document.getElementById('rangesSearch')||{}).value||'').trim();
      if(q) return;                                   // never clobber an active search
      var c=zget('zamil_cache_ranges');
      if(c && c.length && typeof renderRanges==='function') renderRanges(c);
    }catch(e){}
  }
  function install(){
    if(typeof loadRanges!=='function' || loadRanges._zi) return;
    var _lr=loadRanges;
    window.loadRanges=function(force){
      var r=_lr.apply(this,arguments);   // original may pop a spinner if its cache expired…
      paintFromCache();                  // …so immediately paint our durable cache over it
      return r;
    };
    loadRanges._zi=1;
    // gentle background refresh — only while the Ranges list is actually visible
    setInterval(function(){
      try{
        var rp=document.getElementById('rangesPanel'), ms=document.getElementById('mainScreen');
        if(rp && ms && ms.style.display!=='none' && rp.style.display!=='none' && !document.hidden && typeof SESSION!=='undefined' && SESSION){
          loadRanges(false);             // silent; respects cache TTL, no toast
        }
      }catch(e){}
    }, 90000);
  }
  if(document.readyState==='complete') install(); else window.addEventListener('load', install);
  setTimeout(function(){ if(typeof loadRanges!=='undefined' && !loadRanges._zi) install(); }, 1300);
})();
