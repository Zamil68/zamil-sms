/* ═══ notifs.js — global bell (all users) + realtime + auto-read + super compose ═══ */
(function(){
'use strict';
function sess(){ return localStorage.getItem('app_session'); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function post(url,body,cb){ fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},body||{}))}).then(function(r){return r.json().catch(function(){return{ok:false};});}).then(cb).catch(function(){cb({ok:false});}); }
function ago(iso){ if(!iso)return''; var s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(isNaN(s)||s<0)return''; if(s<60)return'just now'; var m=Math.floor(s/60); if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }
var ICONS={
 info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
 success:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
 warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
 money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><path d="M12 6v2M12 16v2"/></svg>'
};
// in-app toast (replaces browser alert)
function toast(msg,kind){
  var t=document.getElementById('ztoast');
  if(!t){ t=document.createElement('div'); t.id='ztoast'; document.body.appendChild(t); }
  t.className='ztoast';
  t.innerHTML='<span class="zdot '+(kind||'ok')+'"></span><span>'+esc(msg)+'</span>';
  requestAnimationFrame(function(){ t.classList.add('show'); });
  clearTimeout(t._h); t._h=setTimeout(function(){ t.classList.remove('show'); },2600);
}
var _items=[], _open=false;

function injectBell(){
  if(document.getElementById('bellBtn')) return;               // avoid duplicates
  var hr=document.querySelector('.header-right .profile-wrap')||document.querySelector('.header-right');
  if(!hr) return;
  var b=document.createElement('button');
  b.id='bellBtn'; b.className='bell-btn'; b.setAttribute('aria-label','Notifications');
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="bell-badge" id="bellBadge" style="display:none">0</span>';
  b.addEventListener('click', openPanel);
  hr.parentNode.insertBefore(b, hr);                            // bell shows for EVERY user
}
function injectPanel(){
  if(document.getElementById('notifOverlay')) return;
  var ov=document.createElement('div'); ov.id='notifOverlay'; ov.className='notif-overlay';
  ov.innerHTML='<div class="notif-panel">'
   +'<div class="notif-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><div class="notif-title">Notifications</div>'
   +'<button class="notif-x" id="notifX" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>'
   +'<div class="notif-list" id="notifList"><div class="notif-empty">Loading…</div></div>'
   +'<div class="notif-compose" id="notifCompose" style="display:none">'
   +'<div class="nc-row"><select id="ncTarget"><option value="*">All users</option><option value="user">Specific user</option></select><span id="ncUserWrap" style="display:none;flex:1"><input type="text" id="ncUser" placeholder="username"></span><select id="ncType" style="max-width:110px"><option value="info">Info</option><option value="success">Success</option><option value="warn">Warning</option><option value="money">Money</option></select></div>'
   +'<div class="nc-row"><input type="text" id="ncTitle" placeholder="Title (optional)"></div>'
   +'<div class="nc-row"><textarea id="ncBody" placeholder="Write your announcement…"></textarea></div>'
   +'<div class="nc-row"><button class="nc-send" id="ncSend">Send notification</button></div>'
   +'</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) closePanel(); });
  document.getElementById('notifX').addEventListener('click', closePanel);
  document.getElementById('ncTarget').addEventListener('change', function(){ document.getElementById('ncUserWrap').style.display=this.value==='user'?'flex':'none'; });
  document.getElementById('ncSend').addEventListener('click', sendMsg);
}
function badge(n){ var b=document.getElementById('bellBadge'); if(!b)return; if(n>0){ b.style.display='flex'; b.textContent=n>9?'9+':String(n);} else b.style.display='none'; }
function loadList(markRead){
  post('/api/notifs/list',{},function(d){
    _items=(d&&d.notifs)||[];
    badge((d&&d.unread)||0);
    renderList();
    if(markRead && d && d.unread>0){                       // auto-read on open
      var ids=_items.filter(function(n){return !n.read;}).map(function(n){return n.id;});
      post('/api/notifs/mark-read',{ids:ids},function(){ _items.forEach(function(n){n.read=true;}); badge(0); renderList(); });
    }
  });
}
function renderList(){
  var el=document.getElementById('notifList'); if(!el)return;
  if(!_items.length){ el.innerHTML='<div class="notif-empty">No notifications yet</div>'; return; }
  el.innerHTML=_items.map(function(n){
    return '<div class="notif-item t-'+(n.type||'info')+(n.read?'':' unread')+'">'
      +'<div class="ni-ic">'+(ICONS[n.type]||ICONS.info)+'</div>'
      +'<div class="ni-body">'+(n.title?'<div class="ni-title">'+esc(n.title)+'</div>':'')
      +'<div class="ni-text">'+esc(n.body)+'</div>'
      +'<div class="ni-time">'+ago(n.at)+'</div></div></div>';
  }).join('');
}
function openPanel(){
  injectPanel();
  document.getElementById('notifOverlay').classList.add('show');
  _open=true;
  loadList(true);                                          // auto-read when opened
  post('/api/auth/role',{},function(r){ var c=document.getElementById('notifCompose'); if(c) c.style.display=((r&&r.role)==='super')?'block':'none'; });
}
function closePanel(){ var ov=document.getElementById('notifOverlay'); if(ov) ov.classList.remove('show'); _open=false; }
function sendMsg(){
  var btn=document.getElementById('ncSend');
  var target=document.getElementById('ncTarget').value;
  if(target==='user'){ target=(document.getElementById('ncUser').value||'').trim(); if(!target){ toast('Enter a username','err'); return; } }
  var body=(document.getElementById('ncBody').value||'').trim();
  if(!body){ toast('Write a message first','err'); return; }
  btn.disabled=true; btn.textContent='Sending…';          // feedback while sending
  post('/api/notifs/send',{target:target,type:document.getElementById('ncType').value,title:document.getElementById('ncTitle').value.trim(),body:body},function(d){
    btn.disabled=false; btn.textContent='Send notification';
    if(d&&d.ok){ toast('Notification sent','ok'); document.getElementById('ncBody').value=''; document.getElementById('ncTitle').value=''; loadList(false); }
    else toast((d&&d.error)||'Failed to send','err');
  });
}
function start(){
  injectBell();
  loadList(false);
  setInterval(function(){ if(document.hidden) return; loadList(_open); }, 15000);  // realtime-ish receive
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
