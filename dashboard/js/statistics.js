/* ═══ STATISTICS (admin-only) — hierarchical country → range → available ═══ */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var _statsData=null;

  window.openStatsPage  = function(){ var p=document.getElementById('statsPage'); if(p){ p.style.display='block'; window.scrollTo(0,0); loadStats(); } };
  window.closeStatsPage = function(){ var p=document.getElementById('statsPage'); if(p) p.style.display='none'; };

  window.loadStats = function(){
    var box=document.getElementById('statsCards'); if(box) box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Crunching numbers…</div>';
    var s=localStorage.getItem('app_session');
    fetch('/api/stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){ if(box) box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:18px">'+((d&&d.error)||'Could not load statistics')+'</div>'; return; }
        _statsData=d; renderStats(d);
      }).catch(function(){ if(box) box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:18px">Connection error</div>'; });
  };

  function scard(icon,v,l){ return '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 13px;display:flex;align-items:center;gap:10px"><div style="font-size:1.25rem;line-height:1">'+icon+'</div><div style="min-width:0"><div style="font-size:1.35rem;font-weight:900;color:var(--accent);line-height:1;font-variant-numeric:tabular-nums">'+v+'</div><div style="font-size:.58rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:3px">'+l+'</div></div></div>'; }

  function renderStats(d){
    var c='';
    c+=scard('🌍', d.totalCountries||0, 'Countries');
    c+=scard('📡', d.totalRanges||0, 'Ranges');
    c+=scard('🔢', d.totalNumbers||0, 'Numbers');
    c+=scard('✅', d.allocated||0, 'Allocated');
    c+=scard('🆓', d.available||0, 'Available');
    c+=scard('📨', d.otpToday!=null?d.otpToday:0, 'OTPs Today');
    c+=scard('🗓️', d.otpWeek!=null?d.otpWeek:0, 'OTPs · 7 days');
    c+=scard('📆', d.otpMonth!=null?d.otpMonth:0, 'OTPs · 30 days');
    document.getElementById('statsCards').innerHTML=c;
    var ma=document.getElementById('statsMostActive'); if(ma) ma.innerHTML='🔥 Most active range today: <b>'+escH(d.mostActiveRange||'—')+'</b>'+(d.mostActiveCount?(' · '+d.mostActiveCount+' OTPs'):'');
    var up=document.getElementById('statsUpdated'); if(up) up.textContent='Updated '+new Date().toLocaleTimeString();
    renderCountries(d.countries||[], '');
  }

  function renderCountries(list, q){
    var box=document.getElementById('statsCountries'); if(!box) return;
    q=(q||'').toLowerCase(); var html='';
    list.forEach(function(co,ci){
      var ranges = co.ranges.filter(function(r){ return !q || co.country.toLowerCase().includes(q) || r.range.toLowerCase().includes(q); });
      if (q && !co.country.toLowerCase().includes(q) && ranges.length===0) return;
      var coAvail = co.ranges.reduce(function(s,r){return s+r.available;},0);
      html+='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden">';
      html+='<div onclick="toggleCountry('+ci+')" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer">';
      html+='<span style="font-size:1.55rem;line-height:1">'+co.flag+'</span>';
      html+='<div style="flex:1;min-width:0"><div style="font-size:.9rem;font-weight:800;color:var(--text)">'+escH(co.country)+'</div><div style="font-size:.66rem;color:var(--muted)">'+co.ranges.length+' ranges · <b style="color:var(--accent)">'+coAvail+'</b> available</div></div>';
      html+='<span id="chev'+ci+'" style="color:var(--muted);transition:transform .2s">▾</span></div>';
      html+='<div id="coBody'+ci+'" style="display:none;border-top:1px solid var(--border);padding:4px 12px 8px">';
      ranges.forEach(function(r){
        var pct = r.total? Math.round(r.available/r.total*100):0;
        html+='<div style="display:flex;align-items:center;gap:9px;padding:8px 2px;border-bottom:1px solid var(--border)">';
        html+='<div style="flex:1;min-width:0"><div style="font-size:.78rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(r.range)+'</div>';
        html+='<div style="height:4px;background:var(--border);border-radius:2px;margin-top:5px;overflow:hidden"><div style="height:4px;width:'+pct+'%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px"></div></div></div>';
        html+='<div style="text-align:right;flex-shrink:0"><div style="font-size:.86rem;font-weight:900;color:'+(r.available>0?'var(--accent)':'var(--muted)')+'">'+r.available+'</div><div style="font-size:.55rem;color:var(--muted)">of '+r.total+'</div></div>';
        html+='</div>';
      });
      html+='</div></div>';
    });
    box.innerHTML = html || '<div style="text-align:center;color:var(--muted);padding:24px">No matches</div>';
  }

  window.toggleCountry=function(ci){ var b=document.getElementById('coBody'+ci), ch=document.getElementById('chev'+ci); if(!b)return; var open=b.style.display==='block'; b.style.display=open?'none':'block'; if(ch)ch.style.transform=open?'':'rotate(180deg)'; };
  window.filterStats=function(){ var q=(document.getElementById('statsSearch').value||''); if(_statsData) renderCountries(_statsData.countries||[], q); };
  window.copyAvailList=function(){
    if(!_statsData||!_statsData.countries){ if(typeof showToast==='function')showToast('Load stats first','error'); return; }
    var lines=['📋 Available Ranges — Zamil SMS',''];
    _statsData.countries.forEach(function(co){
      var av=co.ranges.filter(function(r){return r.available>0;}); if(!av.length) return;
      lines.push(co.flag+' '+co.country);
      av.forEach(function(r){ lines.push('   • '+r.range+' — '+r.available+' available'); });
    });
    try{ navigator.clipboard&&navigator.clipboard.writeText(lines.join('\n')); if(typeof showToast==='function')showToast('Available list copied ✓','success'); }catch(e){}
  };

  function gateMenu(){
    try{ var s=localStorage.getItem('app_session'); if(!s)return;
      fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})})
        .then(function(r){return r.json();}).then(function(d){ var b=document.getElementById('featStatsBtn'); if(b) b.style.display=(d&&d.ok&&(d.role==='super'||d.role==='admin'))?'flex':'none'; }).catch(function(){});
    }catch(e){}
  }
  ready(function(){ gateMenu(); });
})();
