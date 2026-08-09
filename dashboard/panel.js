/* ═══ panel.js v5 — Zamil SMS multi-panel engine (LaMix / Zyron / EVS) — FULL ═══ */
(function(){
'use strict';
var REG = {
  lamix: { label:'LaMix', short:'LM', grad:'linear-gradient(135deg,var(--accent),var(--accent2))' },
  zyron: { label:'Zyron', short:'ZY', grad:'linear-gradient(135deg,#38bdf8,#6366f1)' },
  evs:   { label:'EVS',   short:'EV', grad:'linear-gradient(135deg,#fb923c,#ef4444)' }
};
window.EVS_READY = window.EVS_READY || false;
var WA_LINK = 'https://wa.me/qr/4M2BZRDAFE6DJ1';
var PAYTERMS = [['1','Daily'],['2','Weekly'],['3','Weekly7'],['4','BiWeekly'],['5','BiWeekly30'],['6','Monthly15'],['7','Monthly30'],['8','Monthly45'],['9','Monthly60']];

function cur(){ var p = localStorage.getItem('app_panel'); return REG[p] ? p : 'lamix'; }
function label(){ return REG[cur()].label; }
function isLamix(){ return cur() === 'lamix'; }
function features(){ return isLamix() ? { cli:true, withdrawal:true } : { cli:false, withdrawal:false }; }
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isFree(client){ var c=String(client||'').trim().toLowerCase(); if(!c||c==='unallocated'||c==='null'||c==='none'||c==='free'||c==='0'||c==='-'||c==='--'||c==='n/a'||c==='available'||c==='unassigned'||c===' ')return true; return c.length<=1; }
function post(url, body, cb){
  var ctrl = new AbortController(); var t = setTimeout(function(){ ctrl.abort(); }, 25000);
  fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, signal:ctrl.signal, body: JSON.stringify(Object.assign({ session: sess() }, body||{})) })
    .then(function(r){ clearTimeout(t); return r.json().catch(function(){ return { ok:false, error:'HTTP '+r.status }; }); })
    .then(function(d){ cb(d); })
    .catch(function(e){ clearTimeout(t); cb({ ok:false, error: e.name==='AbortError' ? 'Timed out — try again' : 'Network error' }); });
}
function store(k,v){ try{ localStorage.setItem('pc_'+cur()+'_'+k, JSON.stringify(v)); }catch(e){} }
function read(k){ try{ var s = localStorage.getItem('pc_'+cur()+'_'+k); return s ? JSON.parse(s) : null; }catch(e){ return null; } }
function wipe(p){ var pre='pc_'+p+'_'; Object.keys(localStorage).forEach(function(k){ if(k.indexOf(pre)===0) localStorage.removeItem(k); }); }

function showLoader(msg){ var ov=document.getElementById('loadingOverlay'), lt=document.getElementById('loadingText'); if(lt)lt.textContent=msg||'Loading…'; if(ov)ov.classList.add('show'); }
function hideLoader(){ var ov=document.getElementById('loadingOverlay'); if(ov)ov.classList.remove('show'); }

/* ═══ FULL CACHE KILL ═══ */
function killAllCaches(){
  try{ if(window.ZCache) window.ZCache.clearAll(); }catch(e){}
  try{ sessionStorage.clear(); }catch(e){}
  wipe('lamix'); wipe('zyron'); wipe('evs');
}

/* ═══ 🔑 PANEL-SCOPED ZCache — LaMix cache can NEVER paint on Zyron (and vice versa) ═══ */
function scopeZCacheToPanel(){
  try{
    if(window.ZCache && !window.ZCache._pzScoped){
      var _orig = window.ZCache._key;
      window.ZCache._key = function(name){ return _orig.call(window.ZCache, cur() + '__' + name); };
      window.ZCache._pzScoped = true;
    }
  }catch(e){}
}

/* ═══ 🔁 FORCE FRESH FETCH after a switch-reload (kills the "must click Refresh" bug) ═══ */
function scheduleForceRefresh(){
  try{
    var f = parseInt(localStorage.getItem('pz_force')||'0',10);
    if(!f || (Date.now()-f) > 20000) return;
    localStorage.removeItem('pz_force');
    [400,1800,4000].forEach(function(t){
      setTimeout(function(){
        try{
          if(typeof window.loadRanges==='function') window.loadRanges(true);
          if(typeof window.silentSmsRefresh==='function') window.silentSmsRefresh(true);
        }catch(e){}
      },t);
    });
  }catch(e){}
}

/* ═══ UNIFIED DATA API ═══ */
var api = {
  numbers:   function(cb){ isLamix() ? post('/api/numbers',{},cb)        : post('/api/p/numbers',{panel:cur()},cb); },
  ranges:    function(cb){ isLamix() ? post('/api/ranges',{},cb)         : post('/api/p/ranges',{panel:cur()},cb); },
  smscount:  function(n,cb){ isLamix() ? post('/api/smscount',{},cb)     : post('/api/p/smscount',{panel:cur(),number:n||''},cb); },
  numberSmscount: function(n,cb){ isLamix() ? post('/api/number-smscount',{number:n},cb) : post('/api/p/smscount',{panel:cur(),number:n},cb); },
  leaderboard:function(r,cb){ isLamix() ? post('/api/leaderboard',{range:r},cb) : post('/api/p/leaderboard',{panel:cur(),range:r},cb); },
  earn:      function(cb){ isLamix() ? post('/api/earn/compute',{},cb)   : post('/api/p/earn/compute',{panel:cur()},cb); },
  addSearch: function(q,cb){ isLamix() ? post('/api/alloc/search-ranges',{query:q},cb) : post('/api/p/ranges-search',{panel:cur(),query:q},cb); },
  addExec:   function(o,cb){ isLamix() ? post('/api/alloc/allocate',o,cb) : post('/api/p/request-range',Object.assign({panel:cur()},o),cb); },
  allocateNumbers: function(o,cb){ post('/api/p/allocate-numbers',Object.assign({panel:cur()},o),cb); },
  clients:   function(cb){ isLamix() ? post('/api/clients/list',{},cb)   : post('/api/p/clients',{panel:cur()},cb); },
  checkId:   function(p,cb){ post('/api/p/check-id',{panel:p},cb); },
  linkSet:   function(p,name,cb){ post('/api/p/link-set',{panel:p,panelClient:name},cb); },
  linkDel:   function(p,cb){ post('/api/p/link-del',{panel:p},cb); }
};

/* ═══ TOAST ═══ */
var _tT=null;
function toast(msg,color){
  var t=document.getElementById('pzToast');
  if(!t){ t=document.createElement('div'); t.id='pzToast'; t.innerHTML='<span class="dot"></span><span id="pzToastMsg"></span>'; document.body.appendChild(t); }
  t.querySelector('.dot').className='dot '+(color||'green');
  document.getElementById('pzToastMsg').textContent=msg;
  t.classList.add('show'); if(_tT)clearTimeout(_tT); _tT=setTimeout(function(){t.classList.remove('show');},3200);
}

/* ═══ NO-ID POPUP ═══ */
function buildNoIdOv(){
  var ov=document.getElementById('noIdOv');
  if(ov) return ov;
  ov=document.createElement('div'); ov.id='noIdOv'; ov.className='pz-ov';
  ov.innerHTML='<div class="pz-card">'
    +'<button class="pz-x" onclick="closeNoIdPopup()">✕</button>'
    +'<div class="pz-t" id="noIdTitle">No ID on panel</div>'
    +'<div id="noIdMsg" style="font-size:.76rem;color:var(--muted);line-height:1.5;margin:6px 0 4px"></div>'
    +'<a class="pz-wa" href="'+WA_LINK+'" target="_blank" rel="noopener">💬 WhatsApp admin to create ID</a>'
    +'<div class="pz-link-box">'
      +'<div class="pz-sub">Have a different ID on this panel? Link it (must match exactly):</div>'
      +'<input class="pz-inp" id="linkInput" placeholder="Your exact ID on this panel" autocomplete="off">'
      +'<button class="pz-btn" id="linkBtn">Link ID</button>'
      +'<button class="pz-btn ghost" id="unlinkBtn" style="display:none">Unlink</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){ if(e.target===ov) closeNoIdPopup(); });
  return ov;
}
function openNoId(p,d){
  var ov=buildNoIdOv(); ov._panel=p;
  document.getElementById('noIdTitle').textContent='No ID on '+REG[p].label;
  document.getElementById('noIdMsg').textContent='Your Zamil ID was not found in the '+REG[p].label+' panel. Contact the admin to create one, or link an existing ID below (must match exactly).';
  document.getElementById('linkInput').value='';
  var ub=document.getElementById('unlinkBtn'); if(ub) ub.style.display=(d&&d.linked)?'inline-block':'none';
  ov.classList.add('show');
}
window.closeNoIdPopup=function(){ var ov=document.getElementById('noIdOv'); if(ov)ov.classList.remove('show'); };
window.openNoIdPopup=openNoId;

function doLink(){
  var ov=document.getElementById('noIdOv'); if(!ov)return;
  var p=ov._panel||'zyron';
  var val=(document.getElementById('linkInput').value||'').trim();
  if(!val){ toast('Enter your exact ID on this panel','red'); return; }
  var btn=document.getElementById('linkBtn'); btn.disabled=true; btn.textContent='Linking…';
  api.linkSet(p,val,function(d){
    btn.disabled=false; btn.textContent='Link ID';
    if(d&&d.ok){
      toast('Linked to '+d.client,'green'); closeNoIdPopup();
      killAllCaches();
      localStorage.setItem('app_panel',p);
      localStorage.setItem('zc_panel',p);
      localStorage.setItem('pz_force',String(Date.now()));
      showLoader('Fetching '+REG[p].label+' data…');
      setTimeout(function(){ location.reload(); },300);
    } else toast((d&&d.error)||'Link failed','red');
  });
}
function doUnlink(){
  var ov=document.getElementById('noIdOv'); if(!ov)return;
  var p=ov._panel||'zyron';
  api.linkDel(p,function(d){ if(d&&d.ok){ toast('Unlinked','green'); var ub=document.getElementById('unlinkBtn'); if(ub)ub.style.display='none'; } });
}

/* ═══ SWITCH FLOW ═══ */
function switchTo(p){
  if(p===cur()) return;
  if(p==='evs'&&!window.EVS_READY){ toast('EVS panel coming soon','gold'); return; }
  if(p==='lamix'){
    killAllCaches();
    localStorage.setItem('app_panel',p);
    localStorage.setItem('zc_panel',p);
    localStorage.setItem('pz_force',String(Date.now()));
    showLoader('Fetching LaMix data…');
    location.reload();
    return;
  }
  showLoader('Checking your ID on '+REG[p].label+'…');
  api.checkId(p,function(d){
    hideLoader();
    if(!d||!d.ok){ toast((d&&d.error)||'Could not verify ID','red'); return; }
    if(d.exists){
      killAllCaches();
      localStorage.setItem('app_panel',p);
      localStorage.setItem('zc_panel',p);
      localStorage.setItem('pz_force',String(Date.now()));
      paintPill();
      showLoader('Fetching '+REG[p].label+' data…');
      location.reload();
    } else {
      openNoId(p,d);
    }
  });
}

/* ═══ HEADER PILL ═══ */
function paintPill(){
  var pill=document.getElementById('panelPill'); if(!pill)return;
  pill.textContent=REG[cur()].short;
  pill.style.setProperty('--pg',REG[cur()].grad);
  pill.title='Current panel: '+REG[cur()].label+' — tap to switch';
}
function mountPill(){
  var pill=document.getElementById('panelPill'); if(!pill||pill._m)return; pill._m=true;
  pill.addEventListener('click',function(){ if(typeof openDrawer==='function') openDrawer(); });
  paintPill();
}

/* ═══ DRAWER SWITCHER ═══ */
function mountSwitcher(){
  var host=document.getElementById('panelSwitch'); if(!host||host._m)return; host._m=true;
  host.innerHTML=Object.keys(REG).map(function(k){
    return '<button data-p="'+k+'" class="'+(k===cur()?'on':'')+'" style="--pg:'+REG[k].grad+'">'+REG[k].label+'</button>';
  }).join('');
  host.addEventListener('click',function(e){
    var b=e.target.closest('button[data-p]'); if(!b)return;
    switchTo(b.getAttribute('data-p'));
  });
}

/* ═══ FEATURE GATES ═══ */
function applyGates(){
  var f=features();
  var els=document.querySelectorAll('[data-pf]');
  for(var i=0;i<els.length;i++){ var on=!!f[els[i].getAttribute('data-pf')]; els[i].style.display=on?'':'none'; }
  document.body.setAttribute('data-panel', cur());
}

/* ═══ ADD MODAL — LaMix: old flow · Zyron/EVS: search→request ═══ */
var _selRange=null;
function openAdd(){
  if(isLamix()){ if(window.openAddLamix)window.openAddLamix(); return; }
  var ov=document.getElementById('pzAddOv');
  if(!ov){
    ov=document.createElement('div'); ov.id='pzAddOv'; ov.className='pz-ov';
    ov.innerHTML='<div class="pz-card"><button class="pz-x">✕</button>'
      +'<div class="pz-t">Add Ranges — '+esc(label())+'</div>'
      +'<input class="pz-inp" id="pzQ" placeholder="Type range / country… e.g. Afghanistan" autocomplete="off">'
      +'<div class="pz-list" id="pzList"></div>'
      +'<div id="pzForm" style="display:none"><div class="pz-frow"><div><label>Quantity</label><select id="pzQty"></select></div><div><label>Payterm</label><select id="pzPt">'+PAYTERMS.map(function(p){return '<option value="'+p[0]+'">'+p[1]+'</option>';}).join('')+'</select></div></div>'
      +'<button class="pz-btn" id="pzGo">Request Numbers</button></div>'
      +'<div class="pz-res" id="pzRes" style="display:none"></div></div>';
    document.body.appendChild(ov); bindAdd(ov);
  }
  ov.classList.add('show');
  var q=ov.querySelector('#pzQ'); q.value=''; ov.querySelector('#pzList').innerHTML=''; ov.querySelector('#pzForm').style.display='none'; ov.querySelector('#pzRes').style.display='none';
  setTimeout(function(){q.focus();},80);
}
function bindAdd(ov){
  ov.querySelector('.pz-x').onclick=function(){ov.classList.remove('show');};
  ov.addEventListener('click',function(e){ if(e.target===ov)ov.classList.remove('show'); });
  var tm=null;
  ov.querySelector('#pzQ').addEventListener('input',function(){
    clearTimeout(tm); var v=this.value.trim();
    if(v.length<2){ov.querySelector('#pzList').innerHTML='';return;}
    tm=setTimeout(function(){
      api.addSearch(v,function(d){
        var L=ov.querySelector('#pzList');
        if(!d||!d.ok||!d.ranges||!d.ranges.length){ L.innerHTML='<div class="pz-res err">No matching ranges on '+esc(label())+'.</div>'; return; }
        L.innerHTML=d.ranges.slice(0,20).map(function(r){
          var left=(r.remaining==null?999:r.remaining);
          return '<div class="pz-row"><div class="nm">'+esc(r.country)+' — '+esc(r.range)+'</div><div class="rt">$'+(r.p11||0)+'</div><div class="rm">'+left+'/day left</div><button data-rid="'+esc(r.rid)+'" data-range="'+esc(r.range)+'" data-country="'+esc(r.country)+'" data-left="'+left+'" '+(left<=0?'disabled':'')+'>Request</button></div>';
        }).join('');
      });
    },350);
  });
  ov.querySelector('#pzList').addEventListener('click',function(e){
    var b=e.target.closest('button[data-rid]'); if(!b||b.disabled)return;
    _selRange={rid:b.getAttribute('data-rid'),range:b.getAttribute('data-range'),country:b.getAttribute('data-country')};
    var left=parseInt(b.getAttribute('data-left'))||10;
    var qs=[5,10,15,20,25,30,40,50,60,80,100].filter(function(n){return n<=left;});
    if(!qs.length)qs=[Math.max(1,left)];
    ov.querySelector('#pzQty').innerHTML=qs.map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
    ov.querySelector('#pzForm').style.display='block';
    ov.querySelector('#pzRes').style.display='none';
  });
  ov.querySelector('#pzGo').onclick=function(){
    if(!_selRange)return;
    var btn=this; btn.disabled=true; btn.textContent='Requesting…';
    api.addExec({ rid:_selRange.rid, rangeTitle:_selRange.range, country:_selRange.country, qty:parseInt(ov.querySelector('#pzQty').value)||5, payterm:ov.querySelector('#pzPt').value }, function(d){
      btn.disabled=false; btn.textContent='Request Numbers';
      var R=ov.querySelector('#pzRes'); R.style.display='block';
      if(d&&d.limitReached){ R.className='pz-res err'; R.textContent='🚫 '+d.message; return; }
      if(d&&d.allocated){ R.className='pz-res ok'; R.textContent='✅ '+(d.count||0)+' numbers allocated on '+label()+'. '+(d.message||'')+(d.numbers&&d.numbers.length?(' — first: '+d.numbers.slice(0,6).join(', ')+(d.numbers.length>6?'…':'')):''); toast((d.count||0)+' numbers requested','green'); }
      else { R.className='pz-res err'; R.textContent='⚠️ '+((d&&d.message)||'Panel did not allocate — limit or no stock.'); }
    });
  };
}

/* ═══ CHECKBOX → ALLOCATE BAR (Zyron/EVS numbers page) ═══ */
function mountAllocBar(){
  if(isLamix()||document.getElementById('pzAllocBar'))return;
  var bar=document.createElement('div'); bar.id='pzAllocBar';
  bar.innerHTML='<span id="pzSelN">0 selected</span><button id="pzAllocBtn">✅ Allocate</button>';
  document.body.appendChild(bar);
  document.addEventListener('change',function(e){
    if(!e.target.classList||!e.target.classList.contains('pnum-cb'))return;
    var n=document.querySelectorAll('.pnum-cb:checked').length;
    document.getElementById('pzSelN').textContent=n+' selected';
    bar.classList.toggle('on',n>0);
  });
  bar.querySelector('#pzAllocBtn').onclick=openAlloc;
}
function openAlloc(){
  var ids=[],ranges={};
  var cbs=document.querySelectorAll('.pnum-cb:checked');
  for(var i=0;i<cbs.length;i++){ ids.push(cbs[i].value); var r=cbs[i].getAttribute('data-range')||''; if(r)ranges[r]=1; }
  if(!ids.length)return;
  var rangeTitles=Object.keys(ranges);
  api.clients(function(d){
    var clients=(d&&d.clients)?d.clients:[];
    var ov=document.getElementById('pzAllocOv');
    if(!ov){ ov=document.createElement('div'); ov.id='pzAllocOv'; ov.className='pz-ov'; document.body.appendChild(ov); }
    ov.innerHTML='<div class="pz-card"><button class="pz-x" onclick="this.closest(\'.pz-ov\').classList.remove(\'show\')">✕</button>'
      +'<div class="pz-t">Allocate '+ids.length+' numbers — '+esc(label())+'</div>'
      +'<div class="pz-frow"><div><label>Client</label><select id="pzCl">'+clients.map(function(c){return '<option value="'+esc(c.username)+'">'+esc(c.username)+'</option>';}).join('')+'</select></div>'
      +'<div><label>Payterm</label><select id="pzPt2">'+PAYTERMS.map(function(p){return '<option value="'+p[0]+'">'+p[1]+'</option>';}).join('')+'</select></div></div>'
      +'<div class="pz-frow"><div><label>Payout (USD)</label><input class="pz-inp" id="pzPay" type="number" step="0.0001" value="0.01"></div></div>'
      +'<button class="pz-btn" id="pzGo2">Allocate to Client</button><div class="pz-res" id="pzRes2" style="display:none"></div></div>';
    ov.classList.add('show');
    ov.querySelector('#pzGo2').onclick=function(){
      var btn=this; btn.disabled=true; btn.textContent='Allocating…';
      api.allocateNumbers({ ids:ids, client:ov.querySelector('#pzCl').value, payterm:ov.querySelector('#pzPt2').value, payout:parseFloat(ov.querySelector('#pzPay').value)||0.01, rangeTitle:rangeTitles.join(' | ') },function(res){
        btn.disabled=false; btn.textContent='Allocate to Client';
        var R=ov.querySelector('#pzRes2'); R.style.display='block';
        if(res&&res.limitReached){ R.className='pz-res err'; R.textContent='🚫 '+res.message; return; }
        if(res&&res.allocatedReal>0){ R.className='pz-res ok'; R.textContent='✅ '+res.allocatedReal+' numbers allocated to '+ov.querySelector('#pzCl').value; toast('Allocated '+res.allocatedReal+' numbers','green');
          setTimeout(function(){ ov.classList.remove('show'); var b2=document.getElementById('pzAllocBar'); if(b2)b2.classList.remove('on'); var c2=document.querySelectorAll('.pnum-cb:checked'); for(var j=0;j<c2.length;j++)c2[j].checked=false; if(window.reloadNumbers)window.reloadNumbers(); },1200);
        } else { R.className='pz-res err'; R.textContent='⚠️ '+((res&&res._server)||'Allocation failed — check details.'); }
      });
    };
  });
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded',function(){
  scopeZCacheToPanel();                       // 🔑 caches become panel-specific
  try{
    var owner=localStorage.getItem('zc_panel');
    if(owner!==cur()){ if(window.ZCache)window.ZCache.clearAll(); localStorage.setItem('zc_panel',cur()); }
  }catch(e){}
  mountPill(); mountSwitcher(); applyGates();
  var lb=document.getElementById('linkBtn'); if(lb) lb.onclick=doLink;
  var ub=document.getElementById('unlinkBtn'); if(ub) ub.onclick=doUnlink;
  scheduleForceRefresh();                     // 🔁 auto-refresh right after a switch
});
window.PANEL={ cur:cur, label:label, isLamix:isLamix, features:features, api:api, store:store, read:read, wipe:wipe, isFree:isFree, openAdd:openAdd, mountAllocBar:mountAllocBar, toast:toast, applyGates:applyGates, esc:esc, switchTo:switchTo, paintPill:paintPill };
})();
