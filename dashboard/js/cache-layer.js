/* ═══ CACHE LAYER (corrected) — installs AFTER app.js so wrappers attach ═══ */
(function(){
  function zget(k){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } }
  function zset(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function _tallyBadges(recent){   // make per-number badges LIVE from the poll (no extra requests)
    var tally={}; recent.forEach(function(r){ var n=(r.number||'').replace(/[^0-9]/g,''); if(n) tally[n]=(tally[n]||0)+1; });
    var keys=Object.keys(tally); if(!keys.length) return;
    keys.forEach(function(n){ var c=tally[n]; try{ NUM_SMS_CACHE[n]=c; }catch(e){} var el=document.getElementById('sms_'+n); if(el){ el.textContent=c+'/'+SMS_DAILY_LIMIT; el.className='num-sms-badge'+(c>0?' has-sms':''); } });
    try{ _otpSave(); }catch(e){}
  }
  function dorRows(recent){
    var h="<div style='display:flex;flex-direction:column;gap:8px;'>"; var show=(recent||[]).slice(0,50);
    for(var i=0;i<show.length;i++){ var r=show[i];
      h+="<div class='recent-item' style='margin-bottom:0;'><div class='rsms-inner'>"
        +"<div class='rsms-head-row'><div class='rsms-cli-wrap'><div class='rsms-cli-icon'>🔒</div><span class='rsms-name'>"+escH(r.cli||'Unknown')+"</span></div><span class='rsms-dev-time'>🕒 "+escH(r.time)+"</span></div>"
        +"<div class='rsms-msg-box'><div class='rsms-shield'>📩</div><div class='rsms-body'>"+escH(r.message||'')+"</div></div>"
        +"<div class='rsms-num-line'>📱 "+escH(r.number)+"</div></div></div>";
    }
    if((recent||[]).length>50) h+="<div style='text-align:center;padding:12px;color:var(--muted);font-size:.75rem;'>Showing latest 50 of "+recent.length+" total</div>";
    return h+"</div>";
  }
  function _paintAlloc(ranges){ ASTATE.ranges=ranges; ASTATE.availCache={}; ranges.forEach(function(r){ ASTATE.availCache[r.id]={available:r.available||0,total:r.total||0}; }); if(typeof renderAllocRanges==='function') renderAllocRanges(); }

  function install(){
    if(typeof renderRanges==='function' && !renderRanges._zw){ var _rr=renderRanges; renderRanges=function(list){ try{ var q=((document.getElementById('rangesSearch')||{}).value||'').trim(); if(list&&list.length&&!q) zset('zamil_cache_ranges',list); }catch(e){} return _rr.apply(this,arguments); }; renderRanges._zw=1; }
    if(typeof loadRanges==='function' && !loadRanges._zw){ var _lr=loadRanges; loadRanges=function(force){ var r=_lr.apply(this,arguments); try{ setTimeout(function(){ var el=document.getElementById('rangesList'); if(!el)return; var failed=el.querySelector('.empty button')||/⚠|Error|retry/i.test(el.textContent||''); var blank=!el.children.length; if(failed||blank){ var c=zget('zamil_cache_ranges'); if(c&&c.length&&typeof renderRanges==='function') renderRanges(c); } },2500); }catch(e){} return r; }; loadRanges._zw=1; }

    if(typeof _applySmsResult==='function' && !_applySmsResult._zw){
      var _asr=_applySmsResult; window._zeroStreak=0; var _seeded=false;
      window._applySmsResult=function(d){
        if(d&&d.ok){
          var cached=zget('zamil_cache_smscount'); var isZero=(d.count===0);
          window._zeroStreak = isZero ? (window._zeroStreak||0)+1 : 0;
          if(isZero && cached && cached.count>0 && window._zeroStreak<3){ return _asr.call(this,{ok:true,count:cached.count,recent:cached.recent||[]}); } // ← suppress glitch-zero
          zset('zamil_cache_smscount',{count:d.count,recent:(d.recent||[]).slice(0,30),ts:Date.now()});
          if((d.count||0)<=50) _tallyBadges(d.recent||[]);   // live badges (only when recent is complete → exact)
          if(!_seeded){ _seeded=true; if(d.recent&&typeof window.seedFloatSeen==='function') window.seedFloatSeen(d.recent); }
        }
        return _asr.apply(this,arguments);
      }; _applySmsResult._zw=1;
    }

    if(typeof loadDOR==='function' && !loadDOR._zw){
      window.loadDOR=function(){
        var loading=document.getElementById('dorLoading'), list=document.getElementById('dorList');
        var cached=zget('zamil_cache_dor');
        if(cached&&cached.recent&&cached.recent.length){ if(loading)loading.style.display='none'; if(list){ list.style.display='block'; list.innerHTML=dorRows(cached.recent); } }
        if(typeof apiCall!=='function') return;
        apiCall('/api/dor',{session:(typeof SESSION!=='undefined'?SESSION:'')},function(d){
          if(loading)loading.style.display='none'; if(!list) return;
          if(d&&d.ok&&d.recent&&d.recent.length){ zset('zamil_cache_dor',{recent:d.recent.slice(0,200),ts:Date.now()}); list.style.display='block'; list.innerHTML=dorRows(d.recent); }
          else if(!(cached&&cached.recent&&cached.recent.length)){ list.style.display='block'; list.innerHTML="<div style='padding:24px;text-align:center;color:var(--muted)'>📭 No global messages found today.</div>"; }
        });
      }; loadDOR._zw=1;
    }

    if(typeof renderLeaderboard==='function' && !renderLeaderboard._zw){ var _rlb=renderLeaderboard; renderLeaderboard=function(users){ try{ if(users&&users.length){ var rg=(typeof LB_RANGE!=='undefined'?LB_RANGE:'today'); zset('zamil_cache_lb_'+rg,users); } else { var rg2=(typeof LB_RANGE!=='undefined'?LB_RANGE:'today'); var c=zget('zamil_cache_lb_'+rg2); if(c&&c.length) return _rlb(c); } }catch(e){} return _rlb.apply(this,arguments); }; renderLeaderboard._zw=1; }
    if(typeof loadLeaderboard==='function' && !loadLeaderboard._zw){ var _llb=loadLeaderboard; loadLeaderboard=function(range){ try{ var rg=range||(typeof LB_RANGE!=='undefined'?LB_RANGE:'today'); var c=zget('zamil_cache_lb_'+rg); if(c&&c.length&&typeof renderLeaderboard==='function'){ var coming=document.getElementById('lbComing'),list=document.getElementById('lbList'); if(coming)coming.style.display='none'; if(list)list.style.display='block'; renderLeaderboard(c); } }catch(e){} return _llb.apply(this,arguments); }; loadLeaderboard._zw=1; }

    if(typeof loadSmsRangeCounts==='function' && !loadSmsRangeCounts._zw){
      window.loadSmsRangeCounts=function(){
        if(typeof SESSION==='undefined'||!SESSION) return;
        function apply(id,val,key){ var el=document.getElementById(id); if(!el)return; if(val>0){ zset(key,{v:val,ts:Date.now()}); el.textContent=val.toLocaleString(); } else { var c=zget(key); if(c&&c.v>0&&(Date.now()-c.ts)<300000) el.textContent=c.v.toLocaleString(); else el.textContent='0'; } }
        apiCall('/api/smscount-range',{session:SESSION,range:'week'},function(d){ apply('smsWeekNum',(d&&d.ok?d.count:0),'zamil_week'); });
        apiCall('/api/smscount-range',{session:SESSION,range:'month'},function(d){ apply('smsMonthNum',(d&&d.ok?d.count:0),'zamil_month'); });
        if(typeof loadTopClis==='function') loadTopClis();
      }; loadSmsRangeCounts._zw=1;
    }

    if(typeof allocSearch==='function' && !allocSearch._zw){
      window.allocSearch=function(){
        var q=(document.getElementById('aCountryInput').value||'').trim();
        if(!q){ if(typeof showToast==='function')showToast('Type a country or range name','error'); return; }
        var btn=document.getElementById('aSearchBtn'), list=document.getElementById('aRangeList');
        btn.disabled=true; btn.textContent='…';
        var ck='zamil_as_'+q.toLowerCase(), cached=zget(ck);
        if(cached&&cached.length) _paintAlloc(cached); else list.innerHTML='<div class="empty"><div class="spinner"></div></div>';
        ASTATE.availCache={};
        apiCall('/api/alloc/search-ranges',{query:q,session:SESSION},function(d){
          btn.disabled=false; btn.textContent='🔍 Search';
          var ranges=(d&&d.ranges)||[];
          if(ranges.length){ zset(ck,ranges); _paintAlloc(ranges); return; }
          if(cached&&cached.length){ _paintAlloc(cached); return; }   // transient empty → keep cached
          ASTATE.ranges=[]; list.innerHTML='<div class="empty" style="color:var(--red)">No available ranges for "'+escHtml(q)+'"</div>';
        });
      }; allocSearch._zw=1;
    }

    if(typeof showToast==='function' && !showToast._zw){ var _st=showToast; window.showToast=function(t,kind){ try{ if(typeof t==='string' && /new SMS!?\s*$/.test(t) && kind==='success') return; }catch(e){} return _st.apply(this,arguments); }; showToast._zw=1; } // drop the redundant green "+N new SMS!" watch toast

    try{ if(localStorage.getItem('app_session')){ var c=zget('zamil_cache_smscount'); var el=document.getElementById('smsBigNum'); if(c&&el&&(el.textContent||'').trim()==='0'){ window._applySmsResult({ok:true,count:c.count,recent:c.recent||[]}); } } }catch(e){}
  }

  if(document.readyState==='complete') install(); else window.addEventListener('load', install);
  setTimeout(function(){ if(typeof _applySmsResult!=='undefined' && !_applySmsResult._zw) install(); }, 1200);
})();
