/* ═══ PHASE 4 — LIGHT MOTIVATIONAL NUDGE: every 15 min, 4s, all users ═══ */
(function(){
  var NUDGE_FIRST_MS = 120000;   // first one ~2 min after load (so you can verify), then…
  var NUDGE_EVERY_MS = 900000;   // …every 15 minutes
  var MSGS = [
    'Great work — keep it up! 🔥',
    'You are on a roll! 🚀',
    'Mashallah, excellent progress! 🌟',
    'Barakallahu feek — keep going! 💪',
    'Small steps, big results ✨',
    'Your effort is paying off! 🎯',
    'Stay focused, stay winning 🏆',
    'Well done — the team counts on you! 🙌'
  ];
  var idx = 0;
  function showNudge(){
    try{
      if(document.hidden) return;
      var ae=document.activeElement;
      if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable)) return;  // don't interrupt typing
      if(typeof SESSION==='undefined' || !SESSION) return;
      var el=document.getElementById('motivNudge');
      if(!el){ el=document.createElement('div'); el.id='motivNudge'; document.body.appendChild(el); }
      el.textContent = MSGS[idx % MSGS.length]; idx++;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(el._t); el._t=setTimeout(function(){ el.classList.remove('show'); }, 4000);   // 4 seconds
    }catch(e){}
  }
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){ setTimeout(showNudge, NUDGE_FIRST_MS); setInterval(showNudge, NUDGE_EVERY_MS); });
})();
