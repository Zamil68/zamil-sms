// Check auth on load for protected pages
if(window.location.pathname.includes('dashboard') || window.location.pathname.includes('sms')) {
    checkAuth('/login/index.html');
}

// ═══════════════════════════════════════════════════════════
//  PER-PROVIDER FEATURE GATES
//  Flip any value below to `false` to re-enable that feature
//  for Purple users. No other code changes needed.
// ═══════════════════════════════════════════════════════════
var PROVIDER_FEATURE_LOCKS = {};
function isFeatureLocked(feature){
  var locks = PROVIDER_FEATURE_LOCKS[ACTIVE_PROVIDER];
  return !!(locks && locks[feature]);
}


// ═══════════════════════════════════════════════════════════
//  HYDER SMS — Main Script
// ═══════════════════════════════════════════════════════════

var ALL_NUMS = [], DISP_NUMS = [], STRIP_N = 0, CC_LEN = 0;
var ACTIVE_RANGE = { id: "", title: "", count: 0 };
var NEW_NUMS = new Set();
var NUM_SMS_CACHE = {};
var NUM_SMS_WATCHING = new Set();
var NUM_SMS_PREV = {};
var _smsInterval = null, _rangeInterval = null, _numSmsInterval = null, _numSmsBgInterval = null;
var LB_RANGE = "today";
var LB_CACHE = {};
// ── SMS-per-number daily limit shown as "used/LIMIT" next to each number ──
// Change ONLY this one number to change the limit shown everywhere (e.g. 15 -> 20).
var SMS_DAILY_LIMIT = 15;
var _SMS_RECENT_KEY = "";

// ── CROSS-TAB SMS POLL LEADER ──────────────────────────────
// Only ONE browser tab per logged-in user should actually hit
// /api/smscount every 3s. Other tabs for the same user just read
// the result the leader tab broadcasts (via localStorage "storage"
// event, which fires across tabs/windows on the same origin).
// This keeps backend load flat regardless of how many tabs a
// single user has open.
var _TAB_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2));
var _LEADER_KEY = "hydra_sms_poll_leader";
var _LEADER_HEARTBEAT_MS = 4000;   // leader re-claims every 4s
var _LEADER_STALE_MS     = 9000;   // a leader heartbeat older than this is considered dead
var _isPollLeader = false;
var _leaderHeartbeatT = null;

function _readLeader(){
  try{ return JSON.parse(localStorage.getItem(_LEADER_KEY) || "null"); }catch(e){ return null; }
}
function _claimLeadership(){
  try{
    localStorage.setItem(_LEADER_KEY, JSON.stringify({ id:_TAB_ID, ts:Date.now() }));
  }catch(e){}
  _isPollLeader = true;
}
function _maybeBecomeLeader(){
  var cur = _readLeader();
  if(!cur || (Date.now()-cur.ts) > _LEADER_STALE_MS || cur.id===_TAB_ID){
    _claimLeadership();
  } else {
    _isPollLeader = false;
  }
  return _isPollLeader;
}
function _startLeaderHeartbeat(){
  if(_leaderHeartbeatT) return;
  _leaderHeartbeatT = setInterval(function(){
    if(_isPollLeader) _claimLeadership(); // refresh timestamp so other tabs don't steal it
    else _maybeBecomeLeader();            // check if old leader died (tab closed)
  }, _LEADER_HEARTBEAT_MS);
}
// Broadcast a poll result to other tabs of the same user via localStorage.
// (We don't use BroadcastChannel for max compatibility; localStorage "storage"
// events already fire in all other same-origin tabs automatically.)
function _broadcastSmsResult(d){
  try{ localStorage.setItem("hydra_sms_last_result", JSON.stringify({ ts:Date.now(), data:d })); }catch(e){}
}
// Followers listen for the leader's broadcast and apply it locally —
// this is what makes non-leader tabs update without polling themselves.
window.addEventListener("storage", function(ev){
  if(ev.key==="hydra_sms_last_result" && !_isPollLeader && ev.newValue){
    try{
      var payload = JSON.parse(ev.newValue);
      if(payload && payload.data) _applySmsResult(payload.data);
    }catch(e){}
  }
  // If the leader's heartbeat key disappears/changes ownership, re-evaluate.
  if(ev.key===_LEADER_KEY) _maybeBecomeLeader();
});

// ── THEME ──
var THEME = localStorage.getItem("app_theme") || "light";
document.documentElement.setAttribute("data-theme", THEME);
(function(){ document.getElementById("themeBtn").textContent = THEME==="dark"?"🌙":"☀️"; })();
function toggleTheme(){
  THEME = THEME==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme", THEME);
  localStorage.setItem("app_theme", THEME);
  document.getElementById("themeBtn").textContent = THEME==="dark"?"🌙":"☀️";
}
// ─ SERVER WAKE UP COUNTDOWN ──
var _wakeUpTimer = null;
function showWakeUpOverlay() {
  // Prevent multiple overlays
  if (document.getElementById("wakeUpOverlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "wakeUpOverlay";
  overlay.className = "wake-up-overlay";
  
  overlay.innerHTML = `
    <div class="wake-up-icon">⚡</div>
    <div class="wake-up-title">ZAMIL SMS is waking up...</div>
    <div class="wake-up-sub">Our server was sleeping to save energy. It's booting up just for you. Please wait a moment!</div>
    <div class="wake-up-timer-box">
      <div class="wake-up-timer-num" id="wakeUpTimerNum">45</div>
      <div class="wake-up-timer-label">Seconds remaining</div>
    </div>
    <div class="wake-up-spinner"></div>
  `;
  
  document.body.appendChild(overlay);
  
  // Force reflow to trigger CSS transition
  void overlay.offsetWidth;
  overlay.classList.add("show");

  // Start Countdown
  var timeLeft = 45;
  var timerEl = document.getElementById("wakeUpTimerNum");
  
  _wakeUpTimer = setInterval(function() {
    timeLeft--;
    if (timerEl) timerEl.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(_wakeUpTimer);
      hideWakeUpOverlay();
      // Reload data since server is definitely awake now
      if (SESSION) {
        loadRanges(true);
        silentSmsRefresh(true);
      }
    }
  }, 1000);
}

function hideWakeUpOverlay() {
  var overlay = document.getElementById("wakeUpOverlay");
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 400);
  }
  clearInterval(_wakeUpTimer);
}

// ── UTILITIES ──


// ─ RANGES ──
// Smart parser: handles "Ecuador (K) 59397979xxxx", "USA LX 1234xxx",
// "(K) Ecuador 593...", "Brazil MX d 55...",
// "213 - Algeria LX 04May" (dial-code prefix style) etc.
function splitRangeName(title){
  var raw = String(title||"").trim();
  if(!raw) return {country:"", detail:""};
  // Mixed dial-code style: "972 + 970 - Palestine LX 04May" or "970 & 972 - ..."
  // Strip the leading "code1 + code2 -" combo so the rest parses normally
  // as country/detail below — without this, "972" alone was being read
  // as the country instead of "Palestine".
  var mixMatch = raw.match(/^(\d{1,4})\s*[+&]\s*(\d{1,4})\s*-\s*(.+)$/);
  if(mixMatch){
    raw = mixMatch[3].trim();
  }
  // Sniper-style: "Armenia-W-UC-05" → country before first hyphen, rest is detail
  if(raw.indexOf(" ")<0 && raw.indexOf("-")>0){
    var idx = raw.indexOf("-");
    return { country: raw.slice(0, idx).trim(), detail: raw.slice(idx).trim() };
  }
  // Dial-code prefix style: "213 - Algeria LX 04May" or "- Bangladesh LX ..."
  // Strip leading dialcode + dash separator before parsing country
  var stripped = raw.replace(/^\d+\s*-\s*/, "").replace(/^-\s*/, "").trim();
  // Lamix-style: tokenise on whitespace
  var words = stripped.split(/\s+/);
  var countryWords = [];
  var detailStart  = words.length;
  for(var i=0;i<words.length;i++){
    var w = words[i];
    // Stop at: digit-leading token, range marker (LX/MX/RX/d), or paren tag like (K)
    if(/^\d/.test(w) || /^(LX|MX|RX|d)\b/i.test(w) || /^\(.+\)$/.test(w)){
      detailStart = i;
      break;
    }
    countryWords.push(w);
  }
  var country = countryWords.join(" ").trim() || words[0];
  var detail  = words.slice(detailStart).join(" ").trim();
  return {country: country, detail: detail};
}
var ALL_RANGES=[];
function filterRanges(list, q){
  q=(q||"").toLowerCase().trim();
  if(!q) return list;
  return list.filter(function(r){
    var t=(r.title||"").toLowerCase();
    var sp=splitRangeName(r.title||"");
    return t.indexOf(q)>=0 || (sp.country||"").toLowerCase().indexOf(q)>=0;
  });
}
// ── Group-by-country view state ──
// RANGES_GROUPED: on/off toggle (persisted). RG_OPEN_COUNTRY: which
// country's folder is currently drilled into (null = showing folders).
var RANGES_GROUPED = localStorage.getItem("ranges_grouped") === "1", RG_OPEN_COUNTRY = null, _rgOrder = [];
document.addEventListener("DOMContentLoaded", function () {
  var cb = document.getElementById("rangesGroupToggle");
  if (cb) { cb.checked = RANGES_GROUPED; _rgSyncSwitchVisual(RANGES_GROUPED); }
});
function _rgSyncSwitchVisual(on) {
  var sl = document.getElementById("rangesGroupSlider"), kn = document.getElementById("rangesGroupKnob");
  if (sl) sl.style.background = on ? "var(--accent)" : "var(--border)";
  if (kn) kn.style.transform = on ? "translateX(17px)" : "translateX(0)";
}
function toggleRangesGrouping(checked) {
  RANGES_GROUPED = checked;
  try { localStorage.setItem("ranges_grouped", checked ? "1" : "0"); } catch (e) {}
  RG_OPEN_COUNTRY = null;
  _rgSyncSwitchVisual(checked);
  renderRanges(ALL_RANGES);
}
// Builds the exact same .range-card markup used by the normal flat list
// (including the ⏱ minsAgo badge) — shared by the flat list and the
// "inside a country folder" view so a range behaves identically in both.
function _rangeCardHtml(rng) {
  var sp = splitRangeName(rng.title), flag = getFlag(sp.country);
  var timeHtml = "";
  if (rng.minsAgo !== null && rng.minsAgo !== undefined) {
    var ma = rng.minsAgo, tl, tc;
    if (ma < 1) { tl = "just now"; tc = "#22d3ee"; }
    else if (ma < 30) { tl = ma + "m ago"; tc = "#22d3ee"; }
    else if (ma < 180) { tl = ma + "m ago"; tc = "#a3e635"; }
    else { tl = Math.floor(ma / 60) + "h ago"; tc = "var(--muted)"; }
    timeHtml = "<span style=\"font-size:.58rem;color:" + tc + ";font-weight:600;margin-left:4px\">⏱ " + tl + "</span>";
  }
  var html = "";
  html += "<div class=\"range-card\" data-rid=\"" + escHtml(rng.id) + "\" data-rtitle=\"" + escHtml(rng.title) + "\" data-rcount=\"" + rng.count + "\">";
  html += "<div class=\"range-card-top\" onclick=\"rangeCardTap(event,this)\" oncontextmenu=\"event.preventDefault();rangeShowDel(this);return false;\" ontouchstart=\"rangeTouchStart(event,this)\" ontouchend=\"rangeTouchEnd(event,this)\" ontouchmove=\"rangeTouchEnd(event,this)\">";
  html += "<span class=\"range-flag\">" + flag + "</span>";
  html += "<div class=\"range-info\"><div class=\"range-name\">" + escHtml(sp.country) + timeHtml + "</div>";
  html += (sp.detail ? "<div class=\"range-detail\">" + escHtml(sp.detail) + "</div>" : "");
  html += "</div>";
  html += "<div class=\"range-count-wrap\">";
  html += "<span class=\"range-count-num\">" + rng.count.toLocaleString() + "</span>";
  html += "<span class=\"range-count-lbl\">nums</span>";
  html += "</div>";
  html += "<button class=\"range-del-btn\" title=\"Unassign all numbers in this range\" onclick=\"event.stopPropagation();var c=this.closest('.range-card');unassignRange(c.dataset.rid,c.dataset.rtitle,parseInt(c.dataset.rcount,10));\">🗑</button>";
  html += "<div class=\"range-arrow\">›</div>";
  html += "</div></div>";
  return html;
}
// Folder view: one card per country, showing its flag + how many ranges
// live inside + their combined number count. Tapping a folder drills in.
function renderRangesGroupedView(list, container) {
  if (RG_OPEN_COUNTRY) {
    var sub = list.filter(function (r) { return (splitRangeName(r.title || "").country || "Other") === RG_OPEN_COUNTRY; });
    if (!sub.length) { RG_OPEN_COUNTRY = null; return renderRangesGroupedView(list, container); }
    var flag = getFlag(RG_OPEN_COUNTRY);
    var html = "<button type=\"button\" class=\"panel-back\" style=\"margin-bottom:10px\" onclick=\"rgBackToFolders()\">← Back to folders</button>";
    html += "<div style=\"font-size:.95rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px\">"
          + "<span style=\"font-size:1.35rem\">" + flag + "</span>" + escHtml(RG_OPEN_COUNTRY)
          + " <span class=\"badge\">" + sub.length + "</span></div>";
    for (var i = 0; i < sub.length; i++) html += _rangeCardHtml(sub[i]);
    container.innerHTML = html;
    return;
  }
  var groups = {}, order = [];
  for (var k = 0; k < list.length; k++) {
    var r = list[k], info = splitRangeName(r.title || ""), country = info.country || "Other";
    if (!groups[country]) { groups[country] = { ranges: [], count: 0 }; order.push(country); }
    groups[country].ranges.push(r);
    groups[country].count += r.count || 0;
  }
  order.sort(function (a, b) { return a.localeCompare(b); });
  _rgOrder = order;
  var html = "";
  for (var g = 0; g < order.length; g++) {
    var country = order[g], grp = groups[country], flag = getFlag(country), cnt = grp.ranges.length;
    html += "<div class=\"range-card\" style=\"cursor:pointer\" onclick=\"rgOpenCountry(" + g + ")\">";
    html += "<div class=\"range-card-top\">";
    html += "<span class=\"range-flag\">" + flag + "</span>";
    html += "<div class=\"range-info\"><div class=\"range-name\">" + escHtml(country) + "</div>";
    html += "<div class=\"range-detail\">" + cnt + " range" + (cnt > 1 ? "s" : "") + "</div></div>";
    html += "<div class=\"range-count-wrap\"><span class=\"range-count-num\">" + grp.count.toLocaleString() + "</span><span class=\"range-count-lbl\">nums</span></div>";
    html += "<div class=\"range-arrow\">›</div>";
    html += "</div></div>";
  }
  container.innerHTML = html || "<div class=\"empty\"><div class=\"empty-icon\">📭</div>No ranges found</div>";
}
function rgOpenCountry(idx) { RG_OPEN_COUNTRY = _rgOrder[idx]; renderRanges(ALL_RANGES); }
function rgBackToFolders() { RG_OPEN_COUNTRY = null; renderRanges(ALL_RANGES); }

// 🔥 UPDATED: Group ranges by country and show only user-specific ranges
// 🔥 FIXED: dispatches to the flag-aware / grouped-folder renderer,
// and keeps ALL_RANGES populated so search actually has data to filter.
function renderRanges(ranges) {
  ALL_RANGES = ranges || [];
  const container = document.getElementById('rangesList');
  if (!container) return;

  if (!ranges || !ranges.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No ranges found. Allocate numbers from the Add button.</div>';
    var cnt = document.getElementById('rangesCount'); if (cnt) cnt.textContent = 0;
    return;
  }

  if (RANGES_GROUPED) {
    renderRangesGroupedView(ranges, container);
  } else {
    var html = '';
    for (var i = 0; i < ranges.length; i++) html += _rangeCardHtml(ranges[i]);
    container.innerHTML = html;
  }
  var countEl = document.getElementById('rangesCount');
  if (countEl) countEl.textContent = ranges.length;
}
function onRangesSearch(){
  var q = ((document.getElementById("rangesSearch")||{}).value||"").trim().toLowerCase();
  
  // If empty query, show all ranges
  if (!q) {
    renderRanges(ALL_RANGES);
    return;
  }
  
  // Filter ranges by country OR title
  var filtered = ALL_RANGES.filter(function(r) {
    var title = (r.title || "").toLowerCase();
    var country = (r.country || "").toLowerCase();
    return title.indexOf(q) >= 0 || country.indexOf(q) >= 0;
  });
  
  renderRanges(filtered);
}
var _numSearchT=0;
function doNumberSearchDebounced(q){
  clearTimeout(_numSearchT);
  _numSearchT=setTimeout(function(){ doNumberSearch(q); },300);
}
function doNumberSearch(q){
  if(!SESSION) return;
  var panel=document.getElementById("numMatchesPanel");
  var list =document.getElementById("numMatchesList");
  var cnt  =document.getElementById("numMatchesCount");
  var spin =document.getElementById("numMatchesSpin");
  if(!panel) return;
  panel.style.display="block";
  if(spin) spin.style.display="inline";
  apiCall("/api/numbers/search",{session:SESSION,query:q},function(d){
    if(spin) spin.style.display="none";
    if(!d||!d.ok){ list.innerHTML="<div style=\"font-size:.72rem;color:var(--muted)\">Search failed.</div>"; cnt.textContent=""; return; }
    var rs=d.results||[];
    cnt.textContent="("+rs.length+(d.total>rs.length?" of "+d.total:"")+")";
    if(!rs.length){ list.innerHTML="<div style=\"font-size:.72rem;color:var(--muted)\">No numbers found.</div>"; return; }
    var h="";
    for(var i=0;i<rs.length;i++){
      var n=rs[i].number, r=rs[i].range||"";
      h+="<div onclick=\"copyNumber('"+escHtml(n)+"')\" "+
         "style=\"display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 9px;margin:3px 0;border-radius:7px;background:var(--bg);cursor:pointer;border:1px solid var(--border)\">"+
         "<div style=\"font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-weight:700;font-size:.82rem\">"+escHtml(n)+"</div>"+
         "<div style=\"font-size:.66rem;color:var(--muted);max-width:55%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">"+escHtml(r)+"</div>"+
         "</div>";
    }
    list.innerHTML=h;
  });
}
function unassignRange(rangeId,rangeTitle,count){
  if(!SESSION) return;
  var ok = window.confirm("Unassign ALL "+(count||"")+" numbers in:\n\n"+rangeTitle+"\n\nThis cannot be undone.");
  if(!ok) return;
  function doUnassign(clientId,panelNum){
    showLoad("Unassigning numbers…");
    apiCall("/api/range/unassign",{session:SESSION,clientId:String(clientId),rangeId:String(rangeId),panelNum:panelNum||1},function(d){
      hideLoad();
      if(!d||!d.ok){ showToast("Unassign failed: "+((d&&d.error)||"?"),"error"); return; }
      showToast("✓ Unassigned "+(d.removed||0)+" numbers","success");
      try{ localStorage.removeItem(CACHE_KEY_RANGES); }catch(e){}
      loadRanges(true);
    });
  }
  var clientId = localStorage.getItem("app_client_id");
  var panelNum = parseInt(localStorage.getItem("app_panel_num")||"1",10) || 1;
  if(clientId){ doUnassign(clientId,panelNum); return; }
  // Fallback: verify first to discover the agent's numeric clientId
  showLoad("Locating your ID…");
  apiCall("/api/alloc/verify-client",{clientId:USERNAME},function(d){
    hideLoad();
    if(!d||!d.ok||!d.id){ showToast("Could not find your ID — open Add page once, then retry","error"); return; }
    try{
      localStorage.setItem("app_client_id",String(d.id));
      if(d.name) localStorage.setItem("app_client_name",String(d.name));
      if(d.panelNum) localStorage.setItem("app_panel_num",String(d.panelNum));
    }catch(e){}
    doUnassign(d.id,d.panelNum||1);
  });
}
function copyNumber(n){
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(n).then(function(){ showToast("✓ Copied "+n,false); },
        function(){ fallbackCopy(n); });
    } else { fallbackCopy(n); }
  } catch(e){ fallbackCopy(n); }
}
function fallbackCopy(n){
  var ta=document.createElement("textarea"); ta.value=n;
  ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); showToast("✓ Copied "+n,false); }
  catch(e){ showToast("Copy failed","error"); }
  document.body.removeChild(ta);
}

// 🔥 UPDATED: Load ranges with proper user filtering
function loadRanges(forceRefresh){
  var listEl=document.getElementById("rangesList");
  var cached=cacheGet(CACHE_KEY_RANGES);
  // Always render cached instantly if available — no spinner blocking
  if(cached){
    renderRanges(cached.data);
    if(!forceRefresh && !cached.stale) return; // fresh cache; skip network
  } else {
    listEl.innerHTML="<div class=\"empty\"><div class=\"spinner\"></div><br/>Loading ranges…</div>";
    showLoad("Fetching ranges…");
  }
  apiCall("/api/ranges",{session:SESSION,forceRefresh:!!forceRefresh},function(d){
    hideLoad();
    if(!d || !d.ok){
      if(!cached){
        // No cache to fall back on — don't leave the spinner hanging
        // forever, show a real error state with a retry button.
        listEl.innerHTML="<div class=\"empty\"><div class=\"empty-icon\">⚠️</div>"+
          escHtml((d&&d.error)||"Could not load ranges")+
          "<br/><button type=\"button\" class=\"btn\" style=\"margin-top:12px\" onclick=\"loadRanges(true)\">↺ Retry</button></div>";
      }
      showToast("Error: "+((d&&d.error)||"?"),"error");
      return; // keep showing cache silently if we have one
    }
    cacheSet(CACHE_KEY_RANGES,d.ranges||[]);
    renderRanges(d.ranges||[]);
    if(forceRefresh) showToast("✓ "+(d.ranges||[]).length+" ranges loaded","success");
  });
}

function showRanges(){
    document.getElementById("rangesPanel").style.display="block";
    document.getElementById("numbersPanel").style.display="none";
    document.getElementById("smsMiniBar").style.display="none";
    _PIL_FILTER="all";
    var pb=document.getElementById("pilFilterBar"); if(pb) pb.style.display="none";
    stopRangeAutoRefresh(); stopNumSmsBg();
    
    // ✅ FIX: Reset bottom nav to "Ranges" when going back
    document.querySelectorAll(".bn-item").forEach(function(btn){
        btn.classList.remove("active");
        if(btn.getAttribute("data-page") === "ranges") btn.classList.add("active");
    });
}

// ── NUMBERS ──

// 🔥 UPDATED: Load numbers for specific range (match by both ID and title)
function loadNumbers(rangeId,rangeTitle,count){
  ACTIVE_RANGE={id:rangeId,title:rangeTitle,count:count||500};
  var ckey=numCacheKey(rangeId);
  var cached=numCacheGet(rangeId);
  function showPanel(nums,fromCache){
    ALL_NUMS=nums;
    STRIP_N=1;
    CC_LEN=detectCCLen(nums);
    DISP_NUMS=ALL_NUMS.map(stripCC);
    NEW_NUMS=newTagLoad(ACTIVE_RANGE.id);
    document.getElementById("rangesPanel").style.display="none";
    document.getElementById("numbersPanel").style.display="block";
    history.pushState({page:"numbers"},"");
    document.getElementById("panelTitle").textContent=rangeTitle;
    document.getElementById("btnRestoreCC").style.display="inline-flex";
    document.getElementById("btnRemoveCC").style.display="none";
    document.getElementById("stripHint").textContent="Country code removed (per-number)";
    document.getElementById("smsMiniBar").style.display="flex";
    var mainNumEl = document.getElementById("smsBigNum") || document.getElementById("smsCountNum");
var mainNum = mainNumEl ? mainNumEl.textContent : "0";
    document.getElementById("smsMiniNum").textContent=mainNum;
    var srch=document.getElementById("numSearch"); if(srch) srch.value="";
    _PIL_FILTER="all";
    _pilRenderBar(_pilDetect(nums));
    renderNums();
    NUM_SMS_CACHE={};
    if(fromCache){
      var ageMin=Math.round((Date.now()-cached.ts)/60000);
      var ageLbl=ageMin<60?(ageMin+"m ago"):(Math.floor(ageMin/60)+"h "+(ageMin%60)+"m ago");
      showMini("💾 cached • "+ageLbl,"info");
      // Cache held for full 3h TTL — no background refresh.
      // Use ↻ Refresh to force, or sign out / in to clear.
    }
    else showToast("✓ "+nums.length+" numbers loaded","success");
  }
  if(cached && !cached.stale){ showPanel(cached.data,true); return; }
  // Cache missing or older than 3h → fetch fresh automatically.
  if(cached && cached.stale){ showMini("Cache expired • refreshing…","info"); }
  showLoad("Fetching numbers…");
  apiCall("/api/numbers",{session:SESSION,rangeId:rangeId,rangeTitle:rangeTitle,limit:count||500},function(d){
    hideLoad();
    if(!d || !d.ok){ showToast("Error: "+((d&&d.error)||"Service unavailable"),"error"); return; }
    var nums=(d.numbers||[]).map(function(n){ return (typeof n==="string"?n:n.numberFull||n.number||n.msisdn||Object.values(n)[0]||"").toString().trim(); });
    cacheSet(ckey,nums);
    showPanel(nums,false);
  });
}

function refreshNumbers(){
  if(!ACTIVE_RANGE.id) return;
  var oldNums=ALL_NUMS.slice();
  var btn=document.getElementById("btnRefreshNums");
  btn.disabled=true; btn.textContent="↻…";
  showLoad("Refreshing…");
  apiCall("/api/numbers",{session:SESSION,rangeId:ACTIVE_RANGE.id,rangeTitle:ACTIVE_RANGE.title,limit:500},function(d){
    hideLoad(); btn.disabled=false; btn.textContent="↻ Refresh";
    if(!d || !d.ok){ showToast("Error: "+((d&&d.error)||"Service unavailable"),"error"); return; }
    var nums=(d.numbers||[]).map(function(n){ return (typeof n==="string"?n:n.numberFull||n.number||n.msisdn||Object.values(n)[0]||"").toString().trim(); });
    var hasNew=false; var oldSet={};
    for(var j=0;j<oldNums.length;j++) oldSet[oldNums[j].trim()]=1;
    for(var i=0;i<nums.length;i++){ if(!oldSet[nums[i]]){ hasNew=true; NEW_NUMS.add(nums[i]); } }
    if(hasNew){ newTagSave(ACTIVE_RANGE.id,NEW_NUMS); }
    if(hasNew){ try{ var a=new Audio("data:audio/wav;base64,UklGRl9vT1RXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA"); a.volume=0.3; a.play().catch(function(){}); }catch(e){} }
    cacheSet(numCacheKey(ACTIVE_RANGE.id),nums);
    CC_LEN=detectCCLen(nums); ALL_NUMS=nums;
    applyStrip(STRIP_N);
    showToast("↻ "+nums.length+" refreshed","success");
  });
}
// Toggle: 0 = full numbers, 1 = strip CC per-number
function applyStripCC(){ applyStrip(1); }
function applyStrip(n){
  STRIP_N=n;
  if(n===0){
    DISP_NUMS=ALL_NUMS.slice();
    document.getElementById("btnRestoreCC").style.display="none";
    document.getElementById("btnRemoveCC").style.display="inline-flex";
    document.getElementById("stripHint").textContent="Full number";
  } else {
    DISP_NUMS=ALL_NUMS.map(stripCC);
    document.getElementById("btnRestoreCC").style.display="inline-flex";
    document.getElementById("btnRemoveCC").style.display="none";
    document.getElementById("stripHint").textContent="Country code removed (per-number)";
  }
  renderNums();
}
function onNumSearch(){ renderNums(); }
// ── Palestine / Israel split-range filter ───────────────────────
var _PIL_FILTER = "all";
function _pilDetect(nums) {
  var h970 = false, h972 = false;
  for (var i = 0; i < nums.length && !(h970 && h972); i++) {
    var n = String(nums[i] || "").replace(/^\+|^00/, "");
    if (n.indexOf("970") === 0) h970 = true;
    else if (n.indexOf("972") === 0) h972 = true;
  }
  return h970 && h972;
}
function _pilSetFilter(f) {
  _PIL_FILTER = (_PIL_FILTER === f) ? "all" : f;
  ["_pilBtn_970", "_pilBtn_972"].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.className = "pil-btn" + (id === "_pilBtn_" + _PIL_FILTER ? " pil-active" : "") + (id === "_pilBtn_970" ? " pil-btn-pal" : " pil-btn-isr");
  });
  renderNums();
}
function _pilRenderBar(show) {
  var bar = document.getElementById("pilFilterBar");
  if (!bar) return;
  if (!show) { bar.style.display = "none"; _PIL_FILTER = "all"; return; }
  bar.style.display = "flex";
  bar.innerHTML = '<button id="_pilBtn_970" onclick="_pilSetFilter(\'970\')" class="pil-btn pil-btn-pal">🇵🇸 Palestine</button>'
                 + '<button id="_pilBtn_972" onclick="_pilSetFilter(\'972\')" class="pil-btn pil-btn-isr">🇮🇱 Israel</button>';
  ["_pilBtn_970", "_pilBtn_972"].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.className = "pil-btn" + (id === "_pilBtn_" + _PIL_FILTER ? " pil-active" : "") + (id === "_pilBtn_970" ? " pil-btn-pal" : " pil-btn-isr");
  });
}
// ── end filter ───────────────────────────────────────────────────
function renderNums(){
  var list=document.getElementById("numList");
  var srch=(document.getElementById("numSearch")||{}).value||"";
  srch=srch.toLowerCase().trim();
  var pilActive = _PIL_FILTER !== "all";
  var idx=[];
  for(var k=0;k<DISP_NUMS.length;k++){
    if (pilActive) {
      var rawN = String(ALL_NUMS[k] || "").replace(/^\+|^00/, "");
      if (_PIL_FILTER === "970" && rawN.indexOf("970") !== 0) continue;
      if (_PIL_FILTER === "972" && rawN.indexOf("972") !== 0) continue;
    }
    if(!srch || DISP_NUMS[k].toLowerCase().indexOf(srch)>=0 || ALL_NUMS[k].toLowerCase().indexOf(srch)>=0) idx.push(k);
  }
  var total=idx.length;
  var numCountEl = document.getElementById("numCount");
if(numCountEl) numCountEl.textContent = total;
  document.getElementById("totalNums").textContent=total+" numbers";
  if(!total){ list.innerHTML="<div class=\"empty\"><div class=\"empty-icon\">📭</div>No numbers</div>"; return; }
  var html="";
  for(var p=0;p<total;p++){
    var i=idx[p];
    var num=DISP_NUMS[i]; var origNum=ALL_NUMS[i];
    var isNew=NEW_NUMS.has(origNum);
    var cachedSms=NUM_SMS_CACHE[origNum];
    var smsBadge=(cachedSms!==undefined?String(cachedSms):"X")+"/"+SMS_DAILY_LIMIT;
    var badgeCls="num-sms-badge"+(cachedSms!==undefined&&cachedSms>0?" has-sms":"");
    html+="<div class=\"num-item\" id=\"ni_"+escHtml(origNum)+"\" onclick=\"copySingle(this,'"+escHtml(num)+"','"+escHtml(origNum)+"')\">";
    html+="<span class=\"num-index\">"+(i+1)+"</span>";
    html+="<span class=\"num-val\">"+escHtml(num)+"</span>";
    if(isNew){ html+="<span class=\"num-new-tag\">NEW</span>"; }
    html+="<span class=\""+badgeCls+"\" id=\"sms_"+escHtml(origNum)+"\" onclick=\"event.stopPropagation();requestNotifPermission();openNumSmsModal('"+escHtml(origNum)+"')\" title=\"SMS today — tap for details\">"+smsBadge+"</span>";
    html+="</div>";
  }
  list.innerHTML=html;
}
function copySingle(elem,num,origNum){
  navigator.clipboard.writeText(num).then(function(){
    document.querySelectorAll(".num-item").forEach(function(x){ x.classList.remove("last-copied"); });
    elem.classList.add("last-copied");
    showMini("✓ Copied","success");
    if(origNum&&NEW_NUMS.has(origNum)){
      NEW_NUMS.delete(origNum); newTagRemove(ACTIVE_RANGE.id,origNum);
      var tag=elem.querySelector(".num-new-tag");
      if(tag){ tag.classList.add("num-new-tag-gone"); setTimeout(function(){ if(tag.parentNode) tag.parentNode.removeChild(tag); },300); }
    }
    // On-demand only: fetch this number's SMS count now that the user
    // has actually interacted with it (tapped/copied), instead of
    // pre-fetching every visible number in the background.
    if(origNum) fetchSingleNumSmsCount(origNum);
  });
}
function copyAll(){
  if(!DISP_NUMS.length) return;
  navigator.clipboard.writeText(DISP_NUMS.join("\n")).then(function(){
    var btn=document.getElementById("btnCopyAll");
    btn.textContent="✓ Copied!"; btn.classList.add("copied");
    showToast("✓ Copied "+DISP_NUMS.length+" numbers","success");
    setTimeout(function(){ btn.textContent="⎘ Copy All"; btn.classList.remove("copied"); },2000);
  });
}

// ─ SMS COUNT & REFRESH ──
var _SMS_LAST_CALL=0;
var _SMS_PREV_COUNT=null;
var _SMS_SEEN=null;
function _initSeenSet(){
  if(_SMS_SEEN) return;
  _SMS_SEEN=new Set();
  try {
    var raw=sessionStorage.getItem("sms_seen_keys");
    if(raw){ JSON.parse(raw).forEach(function(k){ _SMS_SEEN.add(k); }); }
  } catch(e){}
}
function _saveSeen(){
  try {
    var arr=Array.from(_SMS_SEEN).slice(-200);
    sessionStorage.setItem("sms_seen_keys",JSON.stringify(arr));
  } catch(e){}
}
function requestNotifPermission(){
  if(!("Notification" in window)) return;
  if(Notification.permission==="default"){
    try { Notification.requestPermission(function(p){ updateNotifBanner(); }); } catch(e){
      try { Notification.requestPermission().then(function(){ updateNotifBanner(); }); } catch(_){}
    }
  }
}
function updateNotifBanner(){
  var b=document.getElementById("notifBanner"); if(!b) return;
  if(!("Notification" in window)){ b.style.display="none"; return; }
  if(localStorage.getItem("notif_banner_dismissed")==="1"){ b.style.display="none"; return; }
  if(Notification.permission==="granted" || Notification.permission==="denied"){
    b.style.display="none";
    if(Notification.permission==="denied"){
      // Show a softer permanent hint when blocked
      b.style.display="flex";
      var t=b.querySelector(".notif-banner-text");
      if(t) t.innerHTML="<b>Notifications blocked.</b> Click the lock icon in your browser address bar → Site settings → allow Notifications, then refresh.";
      var btn=b.querySelector(".notif-banner-btn"); if(btn) btn.style.display="none";
    }
    return;
  }
  b.style.display="flex";
}
function enableNotifications(){
  if(!("Notification" in window)){ showToast("This browser doesn't support notifications","error"); return; }
  if(Notification.permission==="granted"){ updateNotifBanner(); return; }
  try{
    var p=Notification.requestPermission(function(){ updateNotifBanner(); });
    if(p && p.then){ p.then(function(res){
      updateNotifBanner();
      if(res==="granted"){
        try{ new Notification("Notifications enabled",{body:"You'll get instant SMS alerts.",icon:"/branding/favicon.ico"}); }catch(e){}
      }
    }); }
  }catch(e){ updateNotifBanner(); }
}
function dismissNotifBanner(){
  try{ localStorage.setItem("notif_banner_dismissed","1"); }catch(e){}
  var b=document.getElementById("notifBanner"); if(b) b.style.display="none";
}
// Auto-prompt on first user interaction (Chrome requires user gesture)
(function(){
  function once(){
    document.removeEventListener("click",once,true);
    document.removeEventListener("touchstart",once,true);
    requestNotifPermission();
    setTimeout(updateNotifBanner,300);
  }
  document.addEventListener("click",once,true);
  document.addEventListener("touchstart",once,true);
  // Also reflect current state on load
  if(document.readyState!=="loading") setTimeout(updateNotifBanner,200);
  else document.addEventListener("DOMContentLoaded",function(){ setTimeout(updateNotifBanner,200); });
})();
/* fireBrowserNotif defined below as window.fireBrowserNotif */
function _playSmsBeep(){
  try {
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    var ctx=new Ctx();
    var o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type="sine"; o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime+0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.45);
    o.start(); o.stop(ctx.currentTime+0.5);
    setTimeout(function(){ try{ctx.close();}catch(e){} }, 700);
  } catch(e){}
}
function showSmsAlert(text, recent){
  var t=document.getElementById("smsAlertToast");
  if(!t){
    t=document.createElement("div");
    t.id="smsAlertToast";
    t.className="sms-alert-toast";
    document.body.appendChild(t);
  }
  var sub="";
  var preview="";
  if(recent && recent.length){
    var r=recent[0];
    sub="<div class=\"sat-from\">From <b>"+escHtml(r.cli||"Unknown")+"</b> → "+escHtml(r.number||"")+"</div>";
    if(r.message){ preview="<div class=\"sat-preview\">"+escHtml(String(r.message).slice(0,90))+"</div>"; }
  }
  t.innerHTML=
    "<div class=\"sat-icon\">📩</div>"+
    "<div class=\"sat-body\">"+
      "<div class=\"sat-title\">"+escHtml(text)+"</div>"+
      sub+preview+
    "</div>"+
    "<button class=\"sat-close\" onclick=\"this.parentNode.classList.remove('show')\">×</button>";
  t.classList.remove("show"); void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(t._hideT);
  t._hideT=setTimeout(function(){ t.classList.remove("show"); }, 6000);
  if(navigator.vibrate){ try{ navigator.vibrate([120,50,120]); }catch(e){} }
  _playSmsBeep();
}
// Applies an /api/smscount result to the DOM. Called by:
//  - the leader tab, right after its own fetch
//  - follower tabs, when they receive the leader's broadcast
// NOTE: each tab keeps its own _SMS_PREV_COUNT/_SMS_SEEN so "new SMS"
// alerts/notifications still fire correctly in every open tab, even
// though only the leader tab actually made the network request.
function _applySmsResult(d){
  if(!d||!d.ok) return;
  sessionExtend();
  var count=d.count!==undefined?d.count:0;
  var cs=count.toLocaleString();
  ["smsCountNum","smsMiniNum","smsBigNum","bnSmsCount"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.textContent=cs;
  });
  var ts=new Date(); var t=ts.getHours().toString().padStart(2,"0")+":"+ts.getMinutes().toString().padStart(2,"0")+":"+ts.getSeconds().toString().padStart(2,"0");
  var bigSub=document.getElementById("smsBigSub"); if(bigSub) bigSub.innerHTML="<span class=\"live-dot\"></span>Updated "+t;

  // Sort recent newest-first (defensive — server returns desc but ensure)
  var recent=(d.recent||[]).slice().sort(function(a,b){
    return String(b.datetime||b.time||"").localeCompare(String(a.datetime||a.time||""));
  });
  // Force re-render whenever count changes so new messages always appear
  if(_SMS_PREV_COUNT !== null && count !== _SMS_PREV_COUNT){ _SMS_RECENT_KEY = ""; }
  if(recent.length){ renderSmsRecent(recent); renderSmsReport(recent); }

  // ── New SMS detection ──
  _initSeenSet();
  var freshItems=[];
  for(var i=0;i<recent.length;i++){
    var r=recent[i];
    var key=(r.time||"")+"|"+(r.number||"")+"|"+(r.cli||"")+"|"+(String(r.message||"").slice(0,40));
    if(!_SMS_SEEN.has(key)){
      _SMS_SEEN.add(key);
      if(_SMS_PREV_COUNT!==null) freshItems.push(r); // skip first poll
    }
  }
  _saveSeen();
  var delta=(_SMS_PREV_COUNT!==null)?(count-_SMS_PREV_COUNT):0;
  if(_SMS_PREV_COUNT!==null && (delta>0 || freshItems.length>0)){
    var n=Math.max(delta, freshItems.length);
    var msg="📩 "+n+" new SMS";
    showSmsAlert(msg, freshItems);
    // Fire one phone-style notification per new message (cap 5 to avoid spam)
    var notifList=freshItems.slice(0,5);
    if(notifList.length===0 && delta>0){
      fireBrowserNotif(n+" new SMS", "Total today: "+cs, "hyder-sms-bulk");
    } else {
      notifList.forEach(function(it){
        var sender=it.cli||"Unknown";
        var title=sender+" → "+(it.number||"");
        var body=(it.message||"(no content)");
        fireBrowserNotif(title, body, "hyder-sms-"+(it.number||"")+"-"+(it.time||""));
      });
    }
  }
  _SMS_PREV_COUNT=count;

  var mini=document.getElementById("smsMiniBar");
  if(mini){ mini.classList.add("spinning"); setTimeout(function(){ mini.classList.remove("spinning"); },400); }
}
function silentSmsRefresh(showSpinner){
  if(!SESSION) return;
  // Cross-tab dedupe: if another tab for this same user is already the
  // poll leader and is alive (recent heartbeat), skip the network call —
  // we'll receive its result via the "storage" broadcast instead.
  // showSpinner=true (manual/explicit refresh) always goes through so a
  // user-initiated refresh never silently does nothing.
  if(!showSpinner && !_maybeBecomeLeader()) return;

  var now=Date.now();
  if(now-_SMS_LAST_CALL<1000&&!showSpinner) return;
  _SMS_LAST_CALL=now;
  if(showSpinner){ var card=document.getElementById("smsCounterCard"); if(card) card.classList.add("spinning"); }
  apiCall("/api/smscount",{session:SESSION},function(d){
    var card=document.getElementById("smsCounterCard"); if(card) card.classList.remove("spinning");
    _applySmsResult(d);
    _broadcastSmsResult(d);
  });
}
// Legacy compat
function refreshSmsCount(){ silentSmsRefresh(true); }
function startSmsAutoRefresh(){
  if(_smsInterval) return;
  _maybeBecomeLeader();
  _startLeaderHeartbeat();
  _smsInterval=setInterval(function(){ if(SESSION) silentSmsRefresh(false); },3000);
  // Weekly + monthly counts (slow refresh — every 90s)
  loadSmsRangeCounts();
  if(!window._smsRangeInterval){
    window._smsRangeInterval=setInterval(function(){ if(!document.hidden) loadSmsRangeCounts(); }, 90000);
  }
}
function loadSmsRangeCounts(){
  if(!SESSION) return;
  apiCall("/api/smscount-range",{session:SESSION,range:"week"},function(d){
    if(d&&d.ok){ var el=document.getElementById("smsWeekNum"); if(el) el.textContent=(d.count||0).toLocaleString(); }
  });
  apiCall("/api/smscount-range",{session:SESSION,range:"month"},function(d){
    if(d&&d.ok){ var el=document.getElementById("smsMonthNum"); if(el) el.textContent=(d.count||0).toLocaleString(); }
  });
  loadTopClis();
}
var _TOP_CLIS_RANGE = "today";
function setTopClisRange(r){ _TOP_CLIS_RANGE = r; loadTopClis(); 
  document.querySelectorAll(".topcli-range-btn").forEach(function(b){ b.classList.toggle("selected", b.dataset.range===r); });
}
function loadTopClis(){
  if(!SESSION) return;
  var list = document.getElementById("topClisList");
  if(!list) return;
  apiCall("/api/topclis",{session:SESSION,range:_TOP_CLIS_RANGE,limit:5},function(d){
    if(!d || !d.ok){ list.innerHTML="<div style=\"padding:14px;text-align:center;color:var(--muted);font-size:.78rem\">Could not load top senders.</div>"; return; }
    var arr = d.top || [];
    if(!arr.length){ list.innerHTML="<div style=\"padding:14px;text-align:center;color:var(--muted);font-size:.78rem\">📭 No SMS yet</div>"; return; }
    var max = arr[0].count || 1;
    var h = "";
    for(var i=0;i<arr.length;i++){
      var it=arr[i]; var pct=Math.max(6, Math.round((it.count/max)*100));
      h += "<div class=\"topcli-row\">"+
             "<span class=\"topcli-rank\">"+(i+1)+"</span>"+
             "<div class=\"topcli-meta\">"+
               "<div class=\"topcli-name\" title=\""+escHtml(it.cli)+"\">"+escHtml(it.cli||"Unknown")+"</div>"+
               "<div class=\"topcli-bar\"><span style=\"width:"+pct+"%\"></span></div>"+
             "</div>"+
             "<span class=\"topcli-count\">"+it.count.toLocaleString()+"</span>"+
           "</div>";
    }
    list.innerHTML = h;
  });
}
function stopSmsAutoRefresh(){ if(_smsInterval){clearInterval(_smsInterval);_smsInterval=null;} }
window.addEventListener("beforeunload", function(){
  // If this tab currently owns SMS-poll leadership, clear it so another
  // open tab (if any) claims leadership on its very next 3s tick instead
  // of waiting out the full stale-leader timeout.
  if(_isPollLeader){
    try{ localStorage.removeItem(_LEADER_KEY); }catch(e){}
  }
});
function startRangeCounterRefresh(){
  stopRangeAutoRefresh();
  _rangeInterval=setInterval(function(){
    if(!SESSION) return;
    if(document.getElementById("numbersPanel").style.display==="block") silentSmsRefresh(false);
    else stopRangeAutoRefresh();
  },6000);
}
function stopRangeAutoRefresh(){ if(_rangeInterval){clearInterval(_rangeInterval);_rangeInterval=null;} }

// ── SMS PAGE RENDER ──
var _RSMS_EXPANDED=false;

// ── Time offset helper ──
// Server time is UTC. Pakistan = UTC+5, India = UTC+5:30
// The raw time from API is "HH:MM" (server local, which is 5h behind PKT).
// We add 5h to get Pakistan time, then format with AM/PM and flag.
function _rsmsAdjustTime(rawTime){
  if(!rawTime||rawTime.length<5) return {display:rawTime||"--:--",flag:"🇵🇰"};
  var parts=rawTime.split(":");
  var hh=parseInt(parts[0],10)||0;
  var mm=parseInt(parts[1],10)||0;
  // Add 5h for PKT (server is 5h behind)
  var pkH=(hh+5)%24;
  var pkM=mm;
  // India = PKT + 30min
  var inMin=pkH*60+pkM+30;
  var inH=Math.floor(inMin/60)%24;
  var inM=inMin%60;
  function fmt12(h,m){
    var ampm=h>=12?"PM":"AM";
    var h12=h%12||12;
    return h12+":"+(m<10?"0":"")+m+" "+ampm;
  }
  return {
    pk: fmt12(pkH,pkM),
    in: fmt12(inH,inM)
  };
}

// ── Avatar color cycle ──
var _RSMS_AV_COLORS=[
  {bg:"rgba(124,92,255,.18)",color:"#c4b5ff",bgL:"#eeebff",colorL:"#4a38b0"},
  {bg:"rgba(0,212,245,.15)",color:"#7ae8f7",bgL:"#dff7fb",colorL:"#0077a0"},
  {bg:"rgba(255,140,40,.16)",color:"#ffb87a",bgL:"#fff0e0",colorL:"#a04a00"},
  {bg:"rgba(0,230,118,.14)",color:"#6ff5b0",bgL:"#dffff0",colorL:"#0a6e40"}
];
var _rsmsAvIdx=0;
function _rsmsNextColor(){ var c=_RSMS_AV_COLORS[_rsmsAvIdx%_RSMS_AV_COLORS.length]; _rsmsAvIdx++; return c; }

// Convert server time (HH:MM, treated as UTC) into the viewer's local time.
// Pakistan users naturally see +5h, India users +5:30h, etc.
function _rsmsLocalTime(rawTime){
  if(!rawTime||rawTime.length<4){
    var n=new Date();
    var hN=n.getHours(),mN=n.getMinutes();
    var aN=hN>=12?"PM":"AM";
    return (hN%12||12)+":"+(mN<10?"0":"")+mN+" "+aN;
  }
  var parts=rawTime.split(":");
  var hh=parseInt(parts[0],10)||0;
  var mm=parseInt(parts[1],10)||0;
  // raw is UTC HH:MM; user local offset in minutes (east of UTC = positive)
  var offMin=-new Date().getTimezoneOffset();
  var total=hh*60+mm+offMin;
  total=((total%1440)+1440)%1440;
  var h=Math.floor(total/60),m=total%60;
  var ampm=h>=12?"PM":"AM";
  return (h%12||12)+":"+(m<10?"0":"")+m+" "+ampm;
}
function _rsmsItemHtml(r,isFirst,isNew){
  var cli=r.cli||"Unknown";
  var timeStr=_rsmsLocalTime(r.time);
  var firstCls=isFirst?" rsms-first":"";
  var newCls=isNew?" rsms-new-flash":"";
  var h="<div class=\"recent-item open rsms"+firstCls+newCls+"\">";
  h+="<div class=\"rsms-inner\">";
  // Row 1: Service name chip + time
  h+="<div class=\"rsms-head-row\">";
  h+="<div class=\"rsms-cli-wrap\">";
  h+="<div class=\"rsms-cli-icon\" aria-hidden=\"true\">&#128274;</div>";
  h+="<span class=\"rsms-name\">"+escHtml(cli)+"</span>";
  h+="</div>";
  h+="<span class=\"rsms-dev-time\">&#128336; "+escHtml(timeStr)+"</span>";
  h+="</div>";
  // Range row (location)
  if(r.range){
    h+="<div class=\"rsms-range\">&#128205; "+escHtml(r.range)+"</div>";
  }
  // Message bubble
  h+="<div class=\"rsms-msg-box\">";
  h+="<div class=\"rsms-shield\" aria-hidden=\"true\">&#128274;</div>";
  h+="<div class=\"rsms-body\">"+escHtml(r.message||"")+"</div>";
  h+="</div>";
  // Phone number — visible
  if(r.number){ h+="<div class=\"rsms-num-line\">"+escHtml(r.number)+"</div>"; }
  h+="</div>";
  h+="</div>";
  return h;
}
function toggleRsmsMore(){
  _RSMS_EXPANDED=!_RSMS_EXPANDED;
  _SMS_RECENT_KEY=""; // force re-render
  var items=window._RSMS_LAST||[];
  if(items.length) renderSmsRecent(items);
}
function renderSmsRecent(items){
  var el=document.getElementById("smsRecentList"); if(!el) return;
  if(!items||!items.length){
    if(_SMS_RECENT_KEY!=="empty"){
      el.innerHTML="<div style=\"padding:24px;text-align:center;color:var(--muted)\">📭 No messages yet</div>";
      _SMS_RECENT_KEY="empty";
    }
    return;
  }
  items=items.slice().sort(function(a,b){ return String(b.datetime||b.time||"").localeCompare(String(a.datetime||a.time||"")); });
  window._RSMS_LAST=items;
  var SHOW=_RSMS_EXPANDED?Math.min(items.length,50):Math.min(items.length,8);
  var nextKey=String(_RSMS_EXPANDED)+"::"+items.slice(0,SHOW).map(function(r){
    return [r.time||"",r.number||"",r.cli||"",r.range||"",String(r.message||"").slice(0,80)].join("|");
  }).join("||");
  if(nextKey===_SMS_RECENT_KEY) return;
  _SMS_RECENT_KEY=nextKey;
  _rsmsAvIdx=0;
  // Track the newest key to flash the top item if it changed
  var prevTopKey = _SMS_RECENT_KEY ? _SMS_RECENT_KEY.split("::")[1] : "";
  var curTopKey  = items[0] ? [items[0].time||"",items[0].number||"",items[0].cli||""].join("|") : "";
  var topIsNew   = !!prevTopKey && prevTopKey.split("||")[0] !== curTopKey;
  var h="";
  for(var i=0;i<SHOW;i++){ h+=_rsmsItemHtml(items[i],i===0, i===0 && topIsNew); }
  if(items.length>8){
    var rem=Math.min(items.length,20)-8;
    if(_RSMS_EXPANDED){
      h+="<button type=\"button\" class=\"rsms-more-btn\" onclick=\"toggleRsmsMore()\">▲ Show less</button>";
    } else if(rem>0){
      h+="<button type=\"button\" class=\"rsms-more-btn\" onclick=\"toggleRsmsMore()\">▼ Show "+rem+" more</button>";
    }
  }
  el.innerHTML=h;
}
window.toggleRsmsMore=toggleRsmsMore;
function expandMsg(el){ /* no-op: messages are open by default now */ }

function renderSmsReport(items){
  var el=document.getElementById("smsReportList"); if(!el) return;
  if(!items||!items.length){
    el.innerHTML="<div style=\"padding:24px;text-align:center;color:var(--muted)\">📭 No messages yet</div>";
    return;
  }
  // Sort newest first using full HH:MM:SS for accuracy
  var sorted=items.slice().sort(function(a,b){ return String(b.datetime||b.time||"").localeCompare(String(a.datetime||a.time||"")); });
  var h="";
  for(var i=0;i<sorted.length;i++){
    var r=sorted[i];
    var timeDisp=_rsmsLocalTime(r.time);
    h+="<div class=\"sms-report-item\" onclick=\"this.querySelector(\'.sms-report-msg\').style.display=this.querySelector(\'.sms-report-msg\').style.display===\'none\'?\'block\':\'none\'\">";
    h+="<div class=\"sms-report-row\">";
    h+="<span class=\"sms-report-num\">"+escHtml(r.number||r.cli||"")+"</span>";
    h+="<span class=\"sms-report-time\">"+escHtml(timeDisp)+"</span>";
    h+="</div>";
    if(r.range) h+="<span class=\"sms-report-range\">"+escHtml(r.range)+"</span>";
    h+="<div class=\"sms-report-msg\" style=\"display:none\">"+escHtml(r.message||"")+"</div>";
    h+="</div>";
  }
  el.innerHTML=h;
}
window.renderSmsReport=renderSmsReport;

// Patch loadNumbers for range auto-refresh
var _origLoadNumbers=window.loadNumbers;
// Already defined above, patch inline:
(function(){
  var _orig=loadNumbers;
  window._loadNumbersOrig=_orig;
})();

// ── PER-NUMBER SMS ──
// Fetches the SMS count for ONE number, on demand — called when the
// user taps/copies that specific number. No more bulk pre-loading or
// background polling of every number's count; that was hitting the
// upstream provider for numbers nobody was even looking at.
function fetchSingleNumSmsCount(n){
  if(!SESSION||!n) return;
  if(NUM_SMS_CACHE[n]!==undefined) return; // already have it, don't re-fetch
  var el=document.getElementById("sms_"+n);
  if(el){ el.classList.add("loading"); }
  apiCall("/api/number-smscount",{session:SESSION,number:n},function(d){
    if(d&&d.ok){
      NUM_SMS_CACHE[n]=d.count;
      var el2=document.getElementById("sms_"+n);
      if(el2){ el2.textContent=d.count+"/"+SMS_DAILY_LIMIT; el2.className="num-sms-badge"+(d.count>0?" has-sms":""); }
    } else if(el){
      el.classList.remove("loading");
    }
  });
}
// Deprecated: bulk background polling removed (per-request — only fetch
// on tap/copy now). Kept as no-ops so any stray call sites don't error.
function fetchNumSmsCounts(nums){ /* no-op: replaced by fetchSingleNumSmsCount */ }
function startNumSmsBg(){ /* no-op: background per-number polling removed */ }
function stopNumSmsBg(){ if(_numSmsBgInterval){clearInterval(_numSmsBgInterval);_numSmsBgInterval=null;} }
function openNumSmsModal(number){
  var modal=document.getElementById("numSmsModal");
  var title=document.getElementById("numSmsTitle");
  var body=document.getElementById("numSmsBody");
  if(!modal) return;
  title.textContent="📲 "+number;
  body.innerHTML="<div class=\"spinner\" style=\"margin:20px auto;display:block;width:22px;height:22px\"></div>";
  modal.style.display="flex";
  document.body.style.overflow="hidden";
  apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){
    if(!d||!d.ok){ body.innerHTML="<div style=\"color:var(--red);padding:16px\">Failed: "+(d&&d.error?d.error:"error")+"</div>"; return; }
    renderNumSmsModal(d);
    NUM_SMS_WATCHING.add(number); NUM_SMS_PREV[number]=d.count;
    startNumSmsWatch();
  });
}
function closeNumSmsModal(){ var m=document.getElementById("numSmsModal"); if(m)m.style.display="none"; document.body.style.overflow=""; }
function renderNumSmsModal(d){
  var body=document.getElementById("numSmsBody"); if(!body) return;
  var watching=NUM_SMS_WATCHING.has(d.number);
  var h="<div style=\"padding:16px 20px\">";
  h+="<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:16px\">";
  h+="<div style=\"background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:12px;padding:10px 16px;font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:1.4rem;font-weight:700;color:#000\">"+d.count.toLocaleString()+"</div>";
  h+="<div><div style=\"font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600\">SMS Today</div><div style=\"font-size:.75rem;color:var(--muted);margin-top:2px\">"+escHtml(d.number)+"</div></div>";
  h+="<div style=\"margin-left:auto\"><button onclick=\"toggleNumWatch('"+escHtml(d.number)+"')\" style=\"padding:7px 13px;border-radius:18px;border:1.5px solid "+(watching?"var(--accent)":"var(--border)")+";background:"+(watching?"rgba(0,212,245,.14)":"var(--surface)")+";color:"+(watching?"var(--accent)":"var(--muted)")+";font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit\">"+(watching?"🔔 Watching":"🔕 Watch")+"</button></div>";
  h+="</div>";
  if(d.recent&&d.recent.length){
    h+="<div style=\"font-size:.72rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px\">Recent Messages</div>";
    for(var i=0;i<d.recent.length;i++){
      var r=d.recent[i];
      h+="<div style=\"background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px 13px;margin-bottom:7px\">";
      h+="<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:4px\">";
      h+="<span style=\"font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:.68rem;color:var(--accent)\">"+escHtml(r.time)+"</span>";
      h+="<span style=\"font-size:.68rem;color:var(--accent2);background:rgba(124,92,255,.12);border:1px solid rgba(124,92,255,.22);padding:1px 7px;border-radius:6px;font-weight:600\">"+escHtml(r.cli||"—")+"</span>";
      h+="</div>";
      h+="<div style=\"font-size:.8rem;line-height:1.4\">"+escHtml(r.message||"—")+"</div>";
      if(r.range)h+="<div style=\"font-size:.65rem;color:var(--accent);margin-top:4px\">"+escHtml(r.range)+"</div>";
      h+="</div>";
    }
  } else { h+="<div style=\"text-align:center;padding:20px;color:var(--muted);font-size:.82rem\">No messages today</div>"; }
  h+="</div>";
  body.innerHTML=h;
}
function toggleNumWatch(number){
  if(NUM_SMS_WATCHING.has(number)){ NUM_SMS_WATCHING.delete(number); delete NUM_SMS_PREV[number]; showToast("🔕 Stopped watching "+number,"info"); }
  else { NUM_SMS_WATCHING.add(number); showToast("🔔 Watching "+number,"success"); startNumSmsWatch(); }
  var t=document.getElementById("numSmsTitle");
  if(t&&t.textContent==="📲 "+number){ apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){ if(d&&d.ok) renderNumSmsModal(d); }); }
}
function startNumSmsWatch(){
  if(_numSmsInterval) return;
  _numSmsInterval=setInterval(function(){
    if(!SESSION||NUM_SMS_WATCHING.size===0){stopNumSmsWatch();return;}
    NUM_SMS_WATCHING.forEach(function(number){
      apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){
        if(!d||!d.ok) return;
        var prev=NUM_SMS_PREV[number];
        if(prev!==undefined&&d.count>prev){
          var diff=d.count-prev;
          showToast(" "+number+": +"+diff+" new SMS!","success");
          if(window.Notification&&Notification.permission==="granted"){
            new Notification("New SMS on "+number,{body:"+"+diff+" message"+(diff>1?"s":"")+(d.recent&&d.recent[0]?" — "+d.recent[0].message.substring(0,60):""),icon:""});
          }
        }
        NUM_SMS_PREV[number]=d.count;
        var t=document.getElementById("numSmsTitle");
        if(t&&t.textContent===" "+number) renderNumSmsModal(d);
      });
    });
  },30000);
}
function stopNumSmsWatch(){ if(_numSmsInterval){clearInterval(_numSmsInterval);_numSmsInterval=null;} }
// (requestNotifPermission defined above)

// ── LEADERBOARD ──
function renderLeaderboard(users){
  var lbList=document.getElementById("lbList");
  var lbComing=document.getElementById("lbComing");
  if(!users||!users.length){
    var msg="Hold on a moment — fetching the latest rankings…";
    if(lbComing){
      lbComing.style.display="block";
      var ttl=lbComing.querySelector(".lb-coming-title"); if(ttl) ttl.textContent="Hold on a moment…";
      var s=lbComing.querySelector(".lb-coming-sub"); if(s) s.textContent=msg;
    }
    if(lbList) lbList.style.display="none";
    return;
  }
  if(lbComing) lbComing.style.display="none";
  if(lbList) lbList.style.display="block";
  var top3=users.slice(0,3);
  var rest=users.slice(3);
  var badges=["ELITE CHAMPION","FAST SENDER","ON FIRE","SHARP ROUTER","STRATEGIST","DOMINATOR","SPEED KING","VOLUME KING","RISING STAR","RAPID FIRE"];
  var badgeIcons=["👑","","🔥","🎯","","💀","🚀","","🌟","⚡"];
  var badgeCls=["b-elite","b-fast","b-fire","b-sharp","b-strat","b-dom","b-speed","b-strat","b-fire","b-fast"];
  var streakLabels=[14,7,5,3,2,3,5,4,3,2];
  var podiumOrder=[1,0,2];
  var podiumHtml='<div class="lb-podium-wrap"><div class="lb-podium">';
  for(var pi=0; pi<podiumOrder.length; pi++){
    var idx=podiumOrder[pi]; var u=top3[idx]; if(!u) continue;
    var rank=idx+1;
    var name=u.username||u.client||u.name||"—";
    var init=name.substring(0,2).toUpperCase();
    var score=(u.count||u.sms||u.score||0).toLocaleString();
    var posCls=rank===1?"p1":(rank===2?"p2":"p3");
    var crown=rank===1?'<div class="lb-crown">👑</div>':'';
    var bcls=badgeCls[idx]||"b-fast";
    var bIcon=badgeIcons[idx]||"⚡";
    var badge=badges[idx]||"TOP SENDER";
    podiumHtml+='<div class="lb-podium-col '+posCls+'">';
    if(rank===1) podiumHtml+='<div class="lb-frame">';
    podiumHtml+='<div class="lb-hex">'+rank+'</div>';
    podiumHtml+='<div class="lb-podium-top">'+crown+
      '<div class="lb-av-shell">'+
        '<div class="lb-podium-avatar"><span class="lp-init">'+escHtml(init)+'</span></div>'+
        '<div class="lb-verified">✓</div>'+
      '</div>'+
      '<div class="lb-podium-name" title="'+escHtml(name)+'">'+escHtml(name)+'</div>'+
      '<div class="lb-badge '+bcls+'">'+bIcon+' '+badge+'</div>'+
      '<div class="lb-podium-score">'+score+'</div>'+
      '<div class="lb-podium-score-lbl">SMS</div>'+
      '</div>';
    podiumHtml+='<div class="lb-podium-block"></div>';
    if(rank===1) podiumHtml+='</div>';
    podiumHtml+='</div>';
  }
  podiumHtml+='</div></div>';
  var restHtml="";
  if(rest.length){
    restHtml='<div class="lb-table">'+
      '<div class="lb-thead">'+
        '<div class="lb-th lb-th-rank">RANK</div>'+
        '<div class="lb-th lb-th-user">USER</div>'+
        '<div class="lb-th lb-th-vol">SMS VOLUME</div>'+
        '<div class="lb-th lb-th-streak">STREAK</div>'+
        '<div class="lb-th lb-th-live"></div>'+
      '</div>';
    for(var i=0;i<rest.length;i++){
      var ru=rest[i]; var rname=ru.username||ru.client||ru.name||"—";
      var rinit=rname.substring(0,2).toUpperCase();
      var rscore=(ru.count||ru.sms||ru.score||0);
      var rscoreStr=rscore.toLocaleString();
      var rIdx=3+i;
      var rbadge=badges[rIdx]||"SENDER";
      var rbcls=badgeCls[rIdx]||"b-fast";
      var rbIcon=badgeIcons[rIdx]||"⚡";
      var streak=streakLabels[rIdx]||1;
      var rankNum=i+4;
      restHtml+='<div class="lb-row">'+
        '<div class="lb-rank">'+rankNum+'</div>'+
        '<div class="lb-user-cell">'+
          '<div class="lb-avatar '+rbcls+'-ring">'+escHtml(rinit)+'</div>'+
          '<div class="lb-user-text">'+
            '<div class="lb-name" title="'+escHtml(rname)+'">'+escHtml(rname)+'</div>'+
            '<div class="lb-badge lb-badge-sm '+rbcls+'">'+rbIcon+' '+rbadge+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="lb-vol"><span class="lb-vol-num">'+rscoreStr+'</span><span class="lb-vol-lbl">SMS</span></div>'+
        '<div class="lb-streak-cell">🔥 <span>'+streak+'</span></div>'+
        '<div class="lb-live-cell"><span class="lb-live-dot-sm"></span>LIVE</div>'+
      '</div>';
    }
    restHtml+='</div>';
  }
  if(lbList) lbList.innerHTML=podiumHtml+restHtml;
}
function loadLeaderboard(range){
  if(!SESSION) return;
  if(range) LB_RANGE=range;
  var lbComing=document.getElementById("lbComing");
  var lbList0=document.getElementById("lbList");
  var lbSpin0=document.getElementById("lbSpin");
  if(isFeatureLocked("leaderboard")){
    if(lbSpin0) lbSpin0.style.display="none";
    if(lbList0) lbList0.style.display="none";
    if(lbComing){
      lbComing.style.display="block";
      lbComing.innerHTML =
        '<div class="lb-coming-icon"></div>'+
        '<div class="lb-coming-title">Not available yet</div>'+
        '<div class="lb-coming-sub">Leaderboard is not available yet for Purple users.</div>';
    }
    return;
  }
  var lbSpin=document.getElementById("lbSpin");
  document.querySelectorAll(".lb-range-btn").forEach(function(b){ b.classList.toggle("selected",b.dataset.range===LB_RANGE); });
  var cached=LB_CACHE[LB_RANGE];
  if(cached && cached.users && Date.now()-cached.ts<60000){
    renderLeaderboard(cached.users);
    return;
  }
  if(cached && cached.users){ renderLeaderboard(cached.users); }
  if(lbSpin) lbSpin.style.display="inline-block";
  var lbPanel = parseInt(localStorage.getItem("app_panel_num")||"1",10) || 1;
  apiCall("/api/leaderboard",{session:SESSION,range:LB_RANGE,panelNum:lbPanel},function(d){
    if(lbSpin) lbSpin.style.display="none";
    if(!d||!d.ok||!d.users||!d.users.length){ renderLeaderboard([]); return; }
    LB_CACHE[LB_RANGE]={ts:Date.now(),users:d.users||[]};
    renderLeaderboard(d.users||[]);
  });
}
function loadDOR(){
    if(!SESSION) return;
    var loading = document.getElementById("dorLoading");
    var list = document.getElementById("dorList");
    if(loading) loading.style.display = "block";
    if(list) list.style.display = "none";
    
    apiCall("/api/dor", {session: SESSION}, function(d){
        if(loading) loading.style.display = "none";
        if(!d || !d.ok || !list) return;
        
        list.style.display = "block";
        if(!d.recent || !d.recent.length){
            list.innerHTML = "<div style='padding:24px;text-align:center;color:var(--muted)'>📭 No global messages found today.</div>";
            return;
        }
        
        var h = "<div style='display:flex;flex-direction:column;gap:8px;'>";
        // Show max 50 to prevent UI lag on large datasets
        var showList = d.recent.slice(0, 50);
        for(var i=0; i<showList.length; i++){
            var r = showList[i];
            h += "<div class='recent-item' style='margin-bottom:0;'>";
            h += "<div class='rsms-inner'>";
            h += "<div class='rsms-head-row'>";
            h += "<div class='rsms-cli-wrap'><div class='rsms-cli-icon'>🔒</div><span class='rsms-name'>"+escHtml(r.cli||"Unknown")+"</span></div>";
            h += "<span class='rsms-dev-time'>🕒 "+escHtml(r.time)+"</span>";
            h += "</div>";
            h += "<div class='rsms-msg-box'><div class='rsms-shield'>📩</div><div class='rsms-body'>"+escHtml(r.message||"")+"</div></div>";
            h += "<div class='rsms-num-line'>📱 "+escHtml(r.number)+"</div>";
            h += "</div></div>";
        }
        if(d.recent.length > 50){
            h += "<div style='text-align:center;padding:12px;color:var(--muted);font-size:.75rem;'>Showing latest 50 of "+d.recent.length+" total</div>";
        }
        h += "</div>";
        list.innerHTML = h;
    });
}

// ─ ALLOC MODAL ──
var ASTATE={clientId:null,clientName:null,panelNum:1,selectedRangeId:null,selectedRangeTitle:null,payterm:null,payout:null,ranges:[],availCache:{}};
var PAYTERM_OPTS={"1":"Daily","2":"Weekly","3":"Weekly7","4":"BiWeekly","5":"BiWeekly30","6":"Monthly15","7":"Monthly30","8":"Monthly45","9":"Monthly60"};
var PAYOUT_PRESETS=[0,0.01,0.025,0.05,0.1];
var ADD_PAGE_INITED=false;

// 🔥 UPDATED: Reset allocation state properly
function initAddPage(force){
  // Reset only if not yet verified or forced
  if(!force && ASTATE.clientId) return;
  
  // 🔥 DYNAMIC: Get real client info from localStorage (set during login)
  ASTATE.clientId = localStorage.getItem("app_client_id") || "0";
  ASTATE.clientName = localStorage.getItem("app_client_name") || USERNAME;
  ASTATE.panelNum = parseInt(localStorage.getItem("app_panel_num") || "1");
  ASTATE.selectedRangeId = null;
  ASTATE.selectedRangeTitle = null;
  ASTATE.payterm = "2";
  ASTATE.payout = "0.01";
  ASTATE.ranges = [];
  ASTATE.availCache = {};
  
  var sc = document.getElementById("aSearchCard"); if(sc) sc.style.display="none";
  var ac = document.getElementById("aAllocCard"); if(ac) ac.style.display="none";
  var rl = document.getElementById("aRangeList"); if(rl) rl.innerHTML="<div class=\"empty\" style=\"font-size:.78rem;color:var(--muted);padding:14px 8px;text-align:center\">Type a country or keyword above to find available ranges.</div>";
  var ar = document.getElementById("aAllocResult"); if(ar){ ar.style.display="none"; ar.innerHTML=""; }
  var lb = document.getElementById("aLimitBar"); if(lb) lb.innerHTML="";
  var ci = document.getElementById("aCountryInput"); if(ci) ci.value="";
  
  autoVerifyClient();
  ADD_PAGE_INITED = true;
}

function autoVerifyClient(){
  var info=document.getElementById("aClientInfo");
  if(!info) return;
  // Use cached panel info from login — no extra API call needed.
  var cId  = localStorage.getItem("app_client_id");
  var cNm  = localStorage.getItem("app_client_name") || USERNAME;
  var pNum = parseInt(localStorage.getItem("app_panel_num")||"1") || 1;
  if(cId){
    ASTATE.clientId=cId; ASTATE.clientName=cNm; ASTATE.panelNum=pNum;
    info.innerHTML="<div class=\"alloc-verified-dot\"></div><span style=\"font-weight:600;color:var(--green)\">✓ "+escHtml(cNm)+"</span><span style=\"margin-left:8px;font-size:.75rem;color:var(--muted)\">ID: "+escHtml(cId)+" • Panel "+pNum+"</span>";
    document.getElementById("aSearchCard").style.display="";
    var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
    return;
  }
  // Fallback for older sessions (no cached client) — verify once and cache.
  info.innerHTML="<div class=\"spinner\" style=\"width:14px;height:14px\"></div><span>Verifying \""+escHtml(USERNAME)+"\"…</span>";
  apiCall("/api/alloc/verify-client",{clientId:USERNAME},function(d){
    if(d.ok){
      ASTATE.clientId=d.id; ASTATE.clientName=d.name; ASTATE.panelNum=d.panelNum||1;
      try{
        localStorage.setItem("app_client_id",String(d.id));
        localStorage.setItem("app_client_name",String(d.name));
        localStorage.setItem("app_panel_num",String(d.panelNum||1));
      }catch(e){}
      info.innerHTML="<div class=\"alloc-verified-dot\"></div><span style=\"font-weight:600;color:var(--green)\">✓ "+escHtml(d.name)+"</span><span style=\"margin-left:8px;font-size:.75rem;color:var(--muted)\">ID: "+escHtml(d.id)+"</span>";
      document.getElementById("aSearchCard").style.display="";
      var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
    } else {
      info.innerHTML="<span style=\"color:var(--red)\">❌ "+(d.error?"Error: "+escHtml(d.error):"Your ID was not found in the agent panel. Contact admin.")+"</span> <button class=\"btn btn-sm btn-ghost\" style=\"margin-left:8px\" onclick=\"initAddPage(true)\">Retry</button>";
    }
  });
}

// 🔥 UPDATED: Search ranges with proper filtering
function allocSearch(){
  var q = document.getElementById("aCountryInput").value.trim();
  if (!q) { showToast("Type a country or range name", "error"); return; }
  var btn = document.getElementById("aSearchBtn"); var list = document.getElementById("aRangeList");
  btn.disabled = true; btn.textContent = "…";
  list.innerHTML = "<div class=\"empty\"><div class=\"spinner\"></div></div>";
  ASTATE.availCache = {};
  apiCall("/api/alloc/search-ranges", { query: q, session: SESSION }, function(d){
    btn.disabled = false; btn.textContent = "🔍 Search";
    var ranges = (d && d.ranges) || [];
    ASTATE.ranges = ranges;
    // 🔥 Use the available counts the server ALREADY computed (no extra requests, no wrong overwrite)
    ranges.forEach(function(r){ ASTATE.availCache[r.id] = { available: r.available || 0, total: r.total || 0 }; });
    if (!ranges.length) { list.innerHTML = "<div class=\"empty\" style=\"color:var(--red)\">No available ranges for \"" + escHtml(q) + "\"</div>"; return; }
    renderAllocRanges();
  });
}
document.addEventListener("keydown",function(e){ if(e.key==="Enter"&&document.activeElement===document.getElementById("aCountryInput")) allocSearch(); });

function renderAllocRanges(){
  var html = ""; var stillChecking = false;
  for (var j = 0; j < ASTATE.ranges.length; j++){ if (ASTATE.availCache[ASTATE.ranges[j].id] === null){ stillChecking = true; break; } }
  for (var i = 0; i < ASTATE.ranges.length; i++){
    var r = ASTATE.ranges[i]; var avail = ASTATE.availCache[r.id]; var badge = "";
    if (avail === null) badge = "<span class=\"avail-wait\"><span class=\"spinner\" style=\"width:10px;height:10px;border-width:1.5px\"></span></span>";
    else if (avail !== undefined) {
      if (avail.available > 0) badge = "<span class=\"avail-ok\">✓ " + avail.available + " available</span>";
      else badge = "<span class=\"avail-no\">✕ Not available</span>";
    }
    var isNone = avail !== undefined && avail !== null && avail.available === 0;
    var disabled = stillChecking || isNone;
    var onclick = disabled ? "" : "onclick=\"selectAllocRange(this)\"";
    var extraStyle = disabled ? "cursor:not-allowed;opacity:.45;" : "";
    html += "<div class=\"alloc-range-item\" data-id=\"" + escHtml(r.id) + "\" data-title=\"" + escHtml(r.title) + "\" " + onclick + " style=\"" + extraStyle + "\">";
    html += "<div><div class=\"alloc-range-name\">" + escHtml(r.title) + "</div><div class=\"alloc-range-id\">" + escHtml(r.country || "") + "</div></div>";
    html += "<div>" + badge + "</div></div>";
  }
  document.getElementById("aRangeList").innerHTML = html;
}

function allocBulkCheck(){
  ASTATE.ranges.forEach(function(r){ ASTATE.availCache[r.id]=null; });
  renderAllocRanges();
  var i=0; var CONCURRENCY=5; var active=0;
  function next(){
    while(active<CONCURRENCY && i<ASTATE.ranges.length){
      var r=ASTATE.ranges[i++]; active++;
      apiCall("/api/alloc/check-availability",{rangeId:r.id,session:SESSION,panelNum:ASTATE.panelNum},(function(rng){
        return function(d){
          ASTATE.availCache[rng.id]=d||{available:0,total:0};
          renderAllocRanges();
          active--; next();
        };
      })(r));
    }
  }
  next();
}

function selectAllocRange(el){
  var id=el.dataset.id; var title=el.dataset.title;
  ASTATE.selectedRangeId=id; ASTATE.selectedRangeTitle=title;
  document.querySelectorAll(".alloc-range-item").forEach(function(x){x.classList.remove("ar-selected");});
  el.classList.add("ar-selected");
  document.getElementById("aSelRangeInfo").textContent="📡 "+title+" (ID: "+id+")";
  document.getElementById("aAllocResult").style.display="none";
  ASTATE.payterm="2"; ASTATE.payout="0.01";
  document.getElementById("aLimitBar").innerHTML="📅 Daily limit: <strong>2 allocations</strong> per range per day";
  document.getElementById("aAllocCard").style.display="";
  document.getElementById("aAllocCard").scrollIntoView({behavior:"smooth",block:"nearest"});
}

function aBackToSearch(){
  document.getElementById("aAllocCard").style.display="none";
  document.querySelectorAll(".alloc-range-item").forEach(function(x){x.classList.remove("ar-selected");});
  ASTATE.selectedRangeId=null; ASTATE.selectedRangeTitle=null;
  var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
}

// 🔥 UPDATED: Allocate and refresh ranges automatically
function doAllocate(){
  if(!ASTATE.selectedRangeId){showToast("Range select karein","error");return;}
  ASTATE.payterm = ASTATE.payterm || "2"; 
  ASTATE.payout = ASTATE.payout || "0.01";
  var qty = parseInt(document.getElementById("aQtyInput").value) || 3;
  if(qty<1 || qty>25){showToast("Qty 1–25 hona chahiye","error");return;}
  
  var btn = document.getElementById("aAllocBtn"); 
  var sp = document.getElementById("aAllocSpinner"); 
  var res = document.getElementById("aAllocResult");
  
  btn.disabled = true; 
  sp.style.display = "inline-block"; 
  res.style.display = "none";
  
  // 🔥 Send dynamic client info to backend
  apiCall("/api/alloc/allocate", {
    session: SESSION,
    rangeId: ASTATE.selectedRangeId,
    quantity: qty,
    payout: ASTATE.payout,
    clientId: ASTATE.clientId,       // Dynamic from login
    clientName: ASTATE.clientName    // Dynamic from login
  }, function(d){
    btn.disabled = false; 
    sp.style.display = "none"; 
    res.style.display = "block";
    
    if(!d){ 
      res.className = "alloc-result err"; 
      res.innerHTML = "❌ No response — please retry"; 
      return; 
    }
    if(d.limitReached){ 
      res.className = "alloc-result err"; 
      res.innerHTML = "⚠️ Daily limit reached! "+d.used+"/"+d.limit+" used today."; 
      showToast("⚠️ Daily limit reached","error"); 
      return; 
    }
    if(d.ok){
      var ptLabel = PAYTERM_OPTS[ASTATE.payterm] || ASTATE.payterm;
      res.className = "alloc-result ok";
      res.innerHTML = "✅ Allocated!<br/>Client: <b>"+escHtml(ASTATE.clientName)+"</b><br/>Range: <b>"+escHtml(ASTATE.selectedRangeTitle)+"</b><br/>Qty: <b>"+qty+"</b> • Payterm: <b>"+escHtml(ptLabel)+"</b><br/><span style=\"font-size:.75rem;opacity:.8\">Daily: "+d.used+"/"+d.limit+" used — "+d.remaining+" remaining</span>";
      showToast("✓ Allocated!","success");
      document.getElementById("aLimitBar").innerHTML = "📅 Daily: <strong>"+d.used+"/"+d.limit+"</strong> — <strong>"+d.remaining+"</strong> remaining";
      
      // Auto-refresh ranges so newly assigned numbers show up immediately
      try{ localStorage.removeItem(CACHE_KEY_RANGES); }catch(e){}
      try{ loadRanges(true); }catch(e){}
    } else {
      res.className = "alloc-result err"; 
      res.innerHTML = "❌ Failed: "+(d.error || "Service issue — retry");
      showToast("❌ Allocation failed","error");
    }
  });
}

// ── DROPDOWN & PROFILE ──
function toggleDropdown(){
  var dd=document.getElementById("profileDropdown");
  if(dd) dd.classList.toggle("open");
}
document.addEventListener("click",function(e){
  var dd=document.getElementById("profileDropdown");
  var btn=document.querySelector(".profile-btn");
  if(dd && btn && !dd.contains(e.target) && !btn.contains(e.target)){
    dd.classList.remove("open");
  }
});

// ── BOTTOM NAV SWITCH ── (SPA style - no page reload)
var _LAST_MAIN_SUB = "ranges"; // remember "ranges" or "numbers" before leaving main
var _NUMBERS_SCROLL = 0;       // remember scroll inside numbers list when leaving

// 🔥 UPDATED: Bottom nav switch with proper state management
function bnSwitch(page){
  // Remember sub-state + scroll before leaving main screen
  var ms = document.getElementById("mainScreen");
  if(ms && ms.style.display!=="none"){
    var np = document.getElementById("numbersPanel");
    var onNumbers = (np && np.style.display==="block");
    _LAST_MAIN_SUB = onNumbers ? "numbers" : "ranges";
    if(onNumbers){
      _NUMBERS_SCROLL = window.pageYOffset || document.documentElement.scrollTop || 0;
    }
  }
  
  var pages=["mainScreen","addNumPage","top10Page","inboxPage","dorPage","purpleNumPage"];
  pages.forEach(function(p){ var el=document.getElementById(p); if(el) el.style.display="none"; });
  
  var rangesPanel=document.getElementById("rangesPanel");
  var numbersPanel=document.getElementById("numbersPanel");
  
  document.querySelectorAll(".bn-item").forEach(function(btn){
    btn.classList.remove("active");
    if(btn.getAttribute("data-page") === page) btn.classList.add("active");
  });

  if(page==="ranges" || page==="home"){
    document.getElementById("mainScreen").style.display="block";
    var restoreNumbers = (_LAST_MAIN_SUB==="numbers" && ACTIVE_RANGE && ACTIVE_RANGE.id);
    if(rangesPanel)  rangesPanel.style.display  = restoreNumbers ? "none" : "block";
    if(numbersPanel) numbersPanel.style.display = restoreNumbers ? "block" : "none";
    if(restoreNumbers){
      document.getElementById("smsMiniBar").style.display="flex";
      var y = _NUMBERS_SCROLL || 0;
      setTimeout(function(){ window.scrollTo(0, y); }, 0);
      setTimeout(function(){ window.scrollTo(0, y); }, 60);
    } else {
      _NUMBERS_SCROLL = 0;
    }
  } 
  else if(page==="inbox" || page==="sms"){
    var inboxPage = document.getElementById("inboxPage");
    if(inboxPage) { inboxPage.style.display="block"; silentSmsRefresh(true); }
    setTimeout(function(){ window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0; }, 0);
    setTimeout(function(){ window.scrollTo(0,0); }, 60);
  } 
  else if(page==="add"){
    document.getElementById("addNumPage").style.display="block";
    initAddPage(false);
  } 
  else if(page==="dor"){
    document.getElementById("dorPage").style.display="block";
    loadDOR(); // ✅ Load Global DOR Data
  } 
  else if(page==="top10"){
    document.getElementById("top10Page").style.display="block";
    loadLeaderboard();
  } 
  else if(page==="purple-numbers"){
    var ep = document.getElementById("purpleNumPage");
    if(ep) ep.style.display="block";
    purpleLoadClients();
    purpleLoadNumbers();
  }
}

// ── NUM SMS MODAL (referenced in HTML) ──
var numSmsModal=document.getElementById("numSmsModal");

// ── INIT ON DASHBOARD ──
(function dashboardInit(){
  var isDashboard = window.location.pathname.includes("dashboard");
  var isSms = window.location.pathname.includes("sms");
  
  if(!isDashboard && !isSms) return;

  // ── Client-only guard: if admin role is set, dashboard.html inline guard
  // should have already redirected. Belt-and-suspenders: bail here too.
  try {
    var _adminRole = localStorage.getItem("hydra_role");
    if (_adminRole === "agent" || _adminRole === "subadmin") {
      location.replace(_adminRole === "subadmin" ? "/subadmin" : "/agent");
      return;
    }
  } catch(e) {}
  
  // Set username in profile
  var profileName=document.getElementById("profileName");
  var profileAvatar=document.getElementById("profileAvatar");
  var dropUser=document.getElementById("dropUser");
  
  if(profileName && USERNAME) profileName.textContent=USERNAME;
  if(profileAvatar && USERNAME) profileAvatar.textContent=USERNAME.substring(0,2).toUpperCase();
  if(dropUser && USERNAME) dropUser.innerHTML="👤 "+escHtml(USERNAME);
  
  // Set provider chip
  var provChip=document.getElementById("dropProviderChip");
  if(provChip && ACTIVE_PROVIDER){
    var provName=(providers && providers[ACTIVE_PROVIDER]) ? providers[ACTIVE_PROVIDER].name : ACTIVE_PROVIDER;
    provChip.textContent=provName;
  }
  
  // Load initial data — wait for SESSION to be confirmed (handles page reload
  // where session may need a silent reauth before data loads).
  // If SESSION is already present, kick off immediately; otherwise tryReauth
  // first so the dashboard doesn't show blank content on reload.
  function _startLoad() {
    if(profileName && USERNAME) profileName.textContent=USERNAME;
    if(profileAvatar && USERNAME) profileAvatar.textContent=USERNAME.substring(0,2).toUpperCase();
    if(dropUser && USERNAME) dropUser.innerHTML="👤 "+escHtml(USERNAME);
    if(isDashboard) loadRanges();
    silentSmsRefresh(true);
    startSmsAutoRefresh();
  }

  if (SESSION) {
    setTimeout(_startLoad, 100);
  } else {
    // No SESSION in memory — try silent reauth with stored client creds.
    // tryReauth() will redirect to /agent if stored creds are admin creds.
    if (typeof tryReauth === "function") {
      tryReauth().then(function(ok) {
        if (ok) { setTimeout(_startLoad, 100); }
        else    { location.replace("/"); }
      }).catch(function() { location.replace("/"); });
    } else {
      location.replace("/");
    }
    return;
  }
  // Request browser notification permission on first user interaction
  var _askedNotif=false;
  function _askNotifOnce(){
    if(_askedNotif) return; _askedNotif=true;
    requestNotifPermission();
    document.removeEventListener("click",_askNotifOnce);
    document.removeEventListener("keydown",_askNotifOnce);
  }
  document.addEventListener("click",_askNotifOnce,{once:true});
  document.addEventListener("keydown",_askNotifOnce,{once:true});
})();


/* ── Long-press range delete ── */
window._rangeLP=null;
window._rangeLPMoved=false;
window._rangeLPSuppressClickUntil=0;
function rangeTouchStart(e,el){
  try{ window._rangeLP&&clearTimeout(window._rangeLP); }catch(_){}
  window._rangeLPMoved=false;
  window._rangeLP=setTimeout(function(){
    if(!window._rangeLPMoved){
      rangeShowDel(el,true);
      window._rangeLPSuppressClickUntil=Date.now()+900;
      try{ if(e){ e.preventDefault(); e.stopPropagation(); } }catch(_){}
      try{ if(navigator.vibrate) navigator.vibrate(30); }catch(_){}
    }
  },550);
}
function rangeTouchEnd(e,el){
  if(e && e.type==="touchmove") window._rangeLPMoved=true;
  try{ window._rangeLP&&clearTimeout(window._rangeLP); }catch(_){}
}
function rangeCardTap(e,el){
  var card=el.closest(".range-card");
  if(Date.now()<window._rangeLPSuppressClickUntil){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    return false;
  }
  // Once delete is visible, keep it visible until user taps delete or outside card.
  if(card && card.classList.contains("show-del")){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    return false;
  }
  var c=el.closest(".range-card");
  loadNumbers(c.dataset.rid,c.dataset.rtitle,parseInt(c.dataset.rcount,10));
}
function rangeShowDel(el,forceShow){
  var card=el.closest(".range-card");
  document.querySelectorAll(".range-card.show-del").forEach(function(x){ if(x!==card) x.classList.remove("show-del"); });
  if(card){
    if(forceShow) card.classList.add("show-del");
    else card.classList.toggle("show-del");
  }
}
document.addEventListener("click",function(e){
  if(!e.target.closest(".range-card")){
    document.querySelectorAll(".range-card.show-del").forEach(function(x){ x.classList.remove("show-del"); });
  }
});

/* ── Service-worker backed notifications (mobile-friendly) ── */
(function(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").then(function(reg){
    window._swReg=reg;
  }).catch(function(){});
})();
window.fireBrowserNotif=function(title, body, tagKey){
  try{
    if(!("Notification" in window)) return;
    if(Notification.permission!=="granted"){
      if(Notification.permission==="default"){
        Notification.requestPermission().then(function(p){
          if(p==="granted") window.fireBrowserNotif(title, body, tagKey);
        }).catch(function(){});
      }
      return;
    }
    var opts={
      body: body || "",
      icon: "/branding/favicon.ico",
      badge: "/branding/favicon.ico",
      tag: tagKey || ("hyder-sms-"+Date.now()),
      renotify: true,
      requireInteraction: false,
      silent: false
    };
    // Try SW notification first (works on mobile), fallback to direct
    if(window._swReg){
      window._swReg.showNotification(title, opts).catch(function(){
        try{ new Notification(title, opts); }catch(_){}
      });
    } else {
      new Notification(title, opts);
    }
  }catch(_){}
};




// ═══════════════════════════════════════════════════════════
//  SHARE NUMBERS FEATURE  (2-step: range → numbers)
// ═══════════════════════════════════════════════════════════

var _shrRanges     = [];    // [{label, count}]
var _shrNums       = [];    // [{id, phone, label}] for selected range
var _shrVerified   = null;  // {id, name, panelNum} after verify
var _shrActiveRange = null; // range label currently in step 2
var _shrNumCache   = {};    // rangeLabel → [{id, phone, label}] - loaded on demand

// ── Open / close ─────────────────────────────────────────────
function openShareModal() {
  // Save the original body HTML on first ever open (before any success screen can overwrite it)
  _shrSaveBodyHTML();

  // Restore body if success screen replaced it
  _shrRestoreBody();

  // Close dropdown (already closed by the time onclick fires, but be safe)
  var dd = document.getElementById("profileDropdown");
  if (dd) dd.classList.remove("open");

  // Full reset every time
  _shrReset();

  document.getElementById("shareModal").classList.add("shr-open");
  document.getElementById("shrTitle").textContent = " Share Numbers";

  if(isFeatureLocked("shareNumbers")){
    _shrShowError("Not available yet for Purple users.");
    return;
  }

  _shrShow("loading");
  document.getElementById("shrLoadingMsg").textContent = "Loading your ranges…";

  var clientId = localStorage.getItem("app_client_id") || "";
  var panelNum = parseInt(localStorage.getItem("app_panel_num") || "1");

  if (!clientId) {
    _shrShowError("Could not identify your account. Please re-login.");
    return;
  }

  apiCall("/api/share/get-ranges", { clientId: clientId, panelNum: panelNum }, function(d) {
    if (!d || !d.ok) { _shrShowError((d && d.error) || "Failed to load ranges."); return; }
    _shrRanges = d.ranges || [];
    if (!_shrRanges.length) { _shrShowError("You have no allocated numbers to share."); return; }
    _shrRenderRanges();
    _shrShow("step1");
  });
}

function closeShareModal() {
  document.getElementById("shareModal").classList.remove("shr-open");
  _shrRestoreBody();
}

// ── Change Password modal ────────────────────────────────────
function openChangePasswordModal() {
  var dd = document.getElementById("profileDropdown");
  if (dd) dd.classList.remove("open");

  if (ACTIVE_PROVIDER !== "lamix") {
    showToast("Password change is only available for LaMix accounts", "error");
    return;
  }

  document.getElementById("cpwOld").value = "";
  document.getElementById("cpwNew").value = "";
  document.getElementById("cpwConfirm").value = "";
  var msg = document.getElementById("cpwMsg");
  msg.style.display = "none";
  document.getElementById("cpwModal").classList.add("shr-open");
}

function closeChangePasswordModal() {
  document.getElementById("cpwModal").classList.remove("shr-open");
}

function _cpwShowMsg(text, isError) {
  var msg = document.getElementById("cpwMsg");
  msg.textContent = text;
  msg.style.display = "block";
  msg.style.background = isError ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.12)";
  msg.style.color = isError ? "#ef4444" : "#22c55e";
}

function submitChangePassword() {
  var opassword = document.getElementById("cpwOld").value;
  var npassword = document.getElementById("cpwNew").value;
  var confirm   = document.getElementById("cpwConfirm").value;

  if (!opassword || !npassword || !confirm) {
    _cpwShowMsg("Please fill in all fields", true);
    return;
  }
  if (npassword.length < 6) {
    _cpwShowMsg("New password must be at least 6 characters", true);
    return;
  }
  if (npassword !== confirm) {
    _cpwShowMsg("New password and confirmation do not match", true);
    return;
  }

  var btn = document.getElementById("cpwSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Updating…";

  apiCall("/api/changepassword", { opassword: opassword, npassword: npassword }, function(d) {
    btn.disabled = false;
    btn.textContent = "Update Password";
    if (d && d.ok) {
      _cpwShowMsg("✓ Password changed successfully", false);
      document.getElementById("cpwOld").value = "";
      document.getElementById("cpwNew").value = "";
      document.getElementById("cpwConfirm").value = "";
      setTimeout(closeChangePasswordModal, 1800);
    } else {
      _cpwShowMsg((d && d.error) || "Password change failed. Try again.", true);
    }
  });
}
// ── end Change Password modal ────────────────────────────────

// ── Full state reset ─────────────────────────────────────────
function _shrReset() {
  _shrRanges = [];
  _shrNums = [];
  _shrVerified = null;
  _shrActiveRange = null;
  var ti = document.getElementById("shareTargetInput");
  if (ti) ti.value = "";
  var vr = document.getElementById("shareVerifyResult");
  if (vr) vr.innerHTML = "";
  var sc = document.getElementById("shareSelCount");
  if (sc) sc.textContent = "0 selected";
  var btn = document.getElementById("shareConfirmBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Share"; }
  document.getElementById("shareFooter").style.display = "none";
  // Clear search boxes
  var rs = document.getElementById("shrRangeSearch");
  if (rs) rs.value = "";
  // Hide cross-range results
  var nsr = document.getElementById("shrNumSearchResults");
  if (nsr) nsr.style.display = "none";
  // Clear num cache so next open fetches fresh data
  _shrNumCache = {};
}

// Restore box HTML if success message replaced it
// ── Restore shr-body HTML if success screen replaced it ──────
var _SHR_BODY_HTML = null; // set once on first open

function _shrRestoreBody() {
  var body = document.querySelector("#shareModal .shr-body");
  if (!body) return;
  // If our key elements are missing, the success screen replaced the body
  if (!document.getElementById("shareLoadingState")) {
    if (_SHR_BODY_HTML) body.innerHTML = _SHR_BODY_HTML;
  }
}

function _shrSaveBodyHTML() {
  if (_SHR_BODY_HTML) return; // already saved
  var body = document.querySelector("#shareModal .shr-body");
  if (body) _SHR_BODY_HTML = body.innerHTML;
}

// ── Show/hide states ─────────────────────────────────────────
function _shrShow(state) {
  document.getElementById("shareLoadingState").style.display = state === "loading" ? "block" : "none";
  document.getElementById("shrStep1").style.display          = state === "step1"   ? "block" : "none";
  document.getElementById("shrStep2").style.display          = state === "step2"   ? "flex"  : "none";
  document.getElementById("shareErrorState").style.display   = state === "error"   ? "block" : "none";
}

function _shrShowError(msg) {
  document.getElementById("shareErrorMsg").textContent = msg;
  _shrShow("error");
}

// ── STEP 1: Render range list ────────────────────────────────
function _shrRenderRanges() {
  var list = document.getElementById("shrRangeList");
  list.innerHTML = "";
  _shrRanges.forEach(function(r) {
    var item = document.createElement("div");
    item.className = "shr-range-item";
    item.setAttribute("data-range-label", r.label.toLowerCase());
    item.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--border,#2a2a3a);border-radius:11px;background:var(--bg,#0f0f17);cursor:pointer;margin-bottom:6px;transition:all .15s;";
    item.onmouseover = function(){ this.style.borderColor = "var(--accent,#6c63ff)"; };
    item.onmouseout  = function(){ this.style.borderColor = "var(--border,#2a2a3a)"; };
    item.innerHTML =
      '<div style="font-size:.85rem;font-weight:700;color:var(--text,#e8e8f0)">' + escHtml(r.label) + '</div>' +
      '<div style="font-size:.75rem;color:var(--muted,#888);background:var(--card,#16161f);border:1px solid var(--border,#2a2a3a);border-radius:20px;padding:2px 10px;white-space:nowrap">' + r.count + ' numbers</div>';
    item.onclick = function() { _shrSelectRange(r.label); };
    list.appendChild(item);
  });
}

// ── Range search / number search from step 1 ────────────────
var _shrNumSearchDebounce = null;
function _shrOnRangeSearch(val) {
  var q = val.trim().toLowerCase();
  var nsr = document.getElementById("shrNumSearchResults");

  // If query looks like a phone number (digits only, ≥ 4 chars) → cross-range number search
  var isNumQuery = /^\d{4,}/.test(q.replace(/[\s\-\+]/g, ""));
  if (isNumQuery) {
    // Hide range list items that don't have numbers matching this
    document.querySelectorAll(".shr-range-item").forEach(function(el) {
      el.style.display = "";  // show all ranges
    });
    // Debounce the cross-range search (needs API calls or local data)
    clearTimeout(_shrNumSearchDebounce);
    _shrNumSearchDebounce = setTimeout(function() {
      _shrCrossRangeNumSearch(q.replace(/[\s\-]/g, ""));
    }, 320);
    return;
  }

  // Hide cross-range results when not a number query
  if (nsr) nsr.style.display = "none";

  // Filter range items by label
  document.querySelectorAll(".shr-range-item").forEach(function(el) {
    var label = el.getAttribute("data-range-label") || "";
    el.style.display = (!q || label.includes(q)) ? "" : "none";
  });
}

// Cross-range number search: search through all ranges' numbers
// Uses _shrRanges data to load numbers per range if not cached

function _shrCrossRangeNumSearch(query) {
  var nsr = document.getElementById("shrNumSearchResults");
  var nsl = document.getElementById("shrNumSearchList");
  if (!nsr || !nsl) return;

  // Show loading in results area
  nsr.style.display = "block";
  nsl.innerHTML = '<div style="padding:12px 14px;font-size:.82rem;color:var(--muted)">Searching…</div>';

  var clientId = localStorage.getItem("app_client_id") || "";
  var panelNum = parseInt(localStorage.getItem("app_panel_num") || "1");

  // Load all ranges' numbers (use cache where available)
  var pending = 0;
  var allResults = [];  // [{phone, label, id, rangeLabel}]

  function _renderResults() {
    var matches = allResults.filter(function(n) {
      return n.phone.replace(/[\s\-]/g, "").includes(query);
    });
    if (!matches.length) {
      nsl.innerHTML = '<div style="padding:12px 14px;font-size:.82rem;color:var(--muted)">No numbers found matching "' + escHtml(query) + '"</div>';
      return;
    }
    nsl.innerHTML = "";
    matches.forEach(function(n) {
      var lbl = document.createElement("label");
      lbl.className = "share-num-item";
      lbl.style.cursor = "pointer";
      lbl.innerHTML =
        '<div style="min-width:0;flex:1">' +
          '<div class="share-num-phone">' + escHtml(n.phone) + '</div>' +
          '<div class="share-num-label">' + escHtml(n.rangeLabel) + '</div>' +
        '</div>' +
        '<button type="button" class="share-sel-btn" style="font-size:.75rem;padding:4px 10px" ' +
          'onclick="_shrSelectRangeAndHighlight(\'' + escHtml(n.rangeLabel) + '\',\'' + escHtml(n.phone) + '\')">Select</button>';
      nsl.appendChild(lbl);
    });
  }

  _shrRanges.forEach(function(r) {
    if (_shrNumCache[r.label]) {
      _shrNumCache[r.label].forEach(function(n) {
        allResults.push({ phone: n.phone, id: n.id, label: n.label, rangeLabel: r.label });
      });
      return;
    }
    pending++;
    apiCall("/api/share/get-numbers", { clientId: clientId, rangeLabel: r.label, panelNum: panelNum }, function(d) {
      if (d && d.ok && d.numbers) {
        _shrNumCache[r.label] = d.numbers;
        d.numbers.forEach(function(n) {
          allResults.push({ phone: n.phone, id: n.id, label: n.label, rangeLabel: r.label });
        });
      }
      pending--;
      if (pending === 0) _renderResults();
    });
  });
  if (pending === 0) _renderResults();
}

// Select a range and pre-highlight a specific phone number
function _shrSelectRangeAndHighlight(rangeLabel, phone) {
  _shrSelectRange(rangeLabel, function() {
    // After step 2 renders, auto-check the matching number
    document.querySelectorAll(".share-num-item").forEach(function(lbl) {
      var phoneEl = lbl.querySelector(".share-num-phone");
      if (phoneEl && phoneEl.textContent.trim() === phone) {
        var cb = lbl.querySelector(".share-cb");
        if (cb) { cb.checked = true; }
        lbl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    _shrUpdateCount();
  });
}

function _shrSelectRange(label, onDone) {
  _shrActiveRange = label;
  _shrNums = [];
  document.getElementById("shrTitle").textContent = "🔗 " + label;
  _shrShow("loading");
  document.getElementById("shrLoadingMsg").textContent = "Loading numbers…";

  var clientId = localStorage.getItem("app_client_id") || "";
  var panelNum = parseInt(localStorage.getItem("app_panel_num") || "1");

  // Use cache if available
  if (_shrNumCache[label]) {
    _shrNums = _shrNumCache[label];
    _buildStep2(onDone);
    return;
  }

  apiCall("/api/share/get-numbers", { clientId: clientId, rangeLabel: label, panelNum: panelNum }, function(d) {
    if (!d || !d.ok) { _shrShowError((d && d.error) || "Failed to load numbers."); return; }
    _shrNums = d.numbers || [];
    _shrNumCache[label] = _shrNums;
    if (!_shrNums.length) { _shrShowError("No numbers found in this range."); return; }
    _buildStep2(onDone);
  });
}

function _buildStep2(onDone) {
  // Clear previous list + verify state
  document.getElementById("shareNumList").innerHTML = "";
  var numSearch = document.getElementById("shrNumSearch");
  if (numSearch) numSearch.value = "";
  document.getElementById("shareTargetInput").value = "";
  document.getElementById("shareVerifyResult").innerHTML = "";
  _shrVerified = null;

  _shrRenderNums(_shrNums);
  _shrShow("step2");
  document.getElementById("shareFooter").style.display = "flex";
  _shrUpdateCount();
  if (typeof onDone === "function") onDone();
}

// ── Back to step 1 ───────────────────────────────────────────
function shrGoBack() {
  document.getElementById("shareFooter").style.display = "none";
  document.getElementById("shrTitle").textContent = "🔗 Share Numbers";
  // Clear cross-range results and range search
  var nsr = document.getElementById("shrNumSearchResults");
  if (nsr) nsr.style.display = "none";
  var rs = document.getElementById("shrRangeSearch");
  if (rs) rs.value = "";
  // Show all range items again
  document.querySelectorAll(".shr-range-item").forEach(function(el) { el.style.display = ""; });
  _shrShow("step1");
}

// ── STEP 2: Render number checkboxes ────────────────────────
function _shrRenderNums(nums) {
  var list = document.getElementById("shareNumList");
  list.innerHTML = "";
  var data = nums || _shrNums;
  data.forEach(function(n) {
    var lbl = document.createElement("label");
    lbl.className = "share-num-item";
    lbl.innerHTML =
      '<input type="checkbox" class="share-cb" value="' + escHtml(n.id) + '" onchange="_shrUpdateCount()">' +
      '<div style="min-width:0">' +
        '<div class="share-num-phone">' + escHtml(n.phone) + '</div>' +
        '<div class="share-num-label">' + escHtml(n.label) + '</div>' +
      '</div>';
    list.appendChild(lbl);
  });
}

// ── Count + button state ─────────────────────────────────────
function _shrUpdateCount() {
  var boxes = document.querySelectorAll(".share-cb");
  var checked = 0;
  boxes.forEach(function(b) { if (b.checked) checked++; });
  document.getElementById("shareSelCount").textContent = checked + " selected";
  var btn = document.getElementById("shareConfirmBtn");
  var ready = checked > 0 && _shrVerified;
  btn.disabled = !ready;
  btn.textContent = ready
    ? "Share (" + checked + " number" + (checked !== 1 ? "s" : "") + ")"
    : "Share";
}

// ── Quick-select ─────────────────────────────────────────────
function shareSelectAll() {
  document.querySelectorAll(".share-cb").forEach(function(b) { b.checked = true; });
  _shrUpdateCount();
}
function shareSelectHalf() {
  var boxes = document.querySelectorAll(".share-cb");
  var half  = Math.ceil(boxes.length / 2);
  boxes.forEach(function(b, i) { b.checked = i < half; });
  _shrUpdateCount();
}
function shareSelectNone() {
  document.querySelectorAll(".share-cb").forEach(function(b) { b.checked = false; });
  _shrUpdateCount();
}

// ── Verify target ────────────────────────────────────────────
function shareResetVerify() {
  _shrVerified = null;
  document.getElementById("shareVerifyResult").innerHTML = "";
  _shrUpdateCount();
}

function shareVerifyTarget() {
  var val = (document.getElementById("shareTargetInput").value || "").trim();
  if (!val) {
    document.getElementById("shareVerifyResult").innerHTML =
      '<span style="color:#e05">Please enter a client ID or username.</span>';
    return;
  }
  document.getElementById("shareVerifyResult").innerHTML =
    '<span style="color:var(--muted)">Checking…</span>';
  _shrVerified = null;
  _shrUpdateCount();

  var myClientId = localStorage.getItem("app_client_id") || "";
  var myUsername = (typeof USERNAME !== "undefined" ? USERNAME : "") || "";

  apiCall("/api/share/verify-target", { targetClientId: val }, function(d) {
    var div = document.getElementById("shareVerifyResult");
    if (d && d.ok) {
      if (String(d.id) === String(myClientId) || d.name.toLowerCase() === myUsername.toLowerCase()) {
        div.innerHTML = '<span style="color:#e05">⚠️ Cannot share numbers to yourself.</span>';
        _shrVerified = null;
      } else {
        div.innerHTML = '<span style="color:#22c55e">✅ Found: <b>' + escHtml(d.name) + '</b> (ID: ' + escHtml(String(d.id)) + ')</span>';
        _shrVerified = d;
      }
    } else {
      div.innerHTML = '<span style="color:#e05">❌ ' + escHtml((d && d.error) || "Client not found.") + '</span>';
      _shrVerified = null;
    }
    _shrUpdateCount();
  });
}

// ── Confirm & transfer ───────────────────────────────────────
function shareConfirm() {
  var ids = [];
  document.querySelectorAll(".share-cb:checked").forEach(function(b) { ids.push(b.value); });
  if (!ids.length)   { alert("Please select at least one number."); return; }
  if (!_shrVerified) { alert("Please verify the target client first."); return; }

  var btn = document.getElementById("shareConfirmBtn");
  btn.disabled    = true;
  btn.textContent = "Sharing…";

  var sourceClientId = localStorage.getItem("app_client_id") || "";
  var rangeName = _shrActiveRange || "Selected Range";

  apiCall("/api/share/allocate", {
    numberIds:      ids,
    sourceClientId: sourceClientId,
    targetClientId: _shrVerified.id,
    targetPanelNum: _shrVerified.panelNum || 1,
  }, function(d) {
    if (d && d.ok) {
      var count = d.transferred;
      var clientName = _shrVerified.name;
      var clientId   = _shrVerified.id;
      // Show detailed success inside shr-body only, keep header+close visible
      var body = document.querySelector("#shareModal .shr-body");
      if (body) {
        body.innerHTML =
          '<div style="padding:36px 24px;text-align:center">' +
            '<div style="font-size:2.8rem;margin-bottom:12px">✅</div>' +
            '<div style="font-weight:800;font-size:1.05rem;margin-bottom:14px">Numbers Shared Successfully!</div>' +
            '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px 18px;text-align:left;font-size:.84rem;display:flex;flex-direction:column;gap:10px">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="color:var(--muted);font-weight:600">Client</span>' +
                '<span style="font-weight:700">' + escHtml(clientName) + ' <span style="color:var(--muted);font-weight:400">(ID: ' + escHtml(String(clientId)) + ')</span></span>' +
              '</div>' +
              '<div style="border-top:1px solid var(--border)"></div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="color:var(--muted);font-weight:600">Range</span>' +
                '<span style="font-weight:700">' + escHtml(rangeName) + '</span>' +
              '</div>' +
              '<div style="border-top:1px solid var(--border)"></div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="color:var(--muted);font-weight:600">Numbers Transferred</span>' +
                '<span style="font-weight:800;color:var(--accent,#6c63ff);font-size:1rem">' + count + ' number' + (count !== 1 ? 's' : '') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
      }
      document.getElementById("shareFooter").style.display = "none";
      // Auto-close after 3s; on close the modal resets fully for next open
      setTimeout(closeShareModal, 3000);
    } else {
      btn.disabled    = false;
      _shrUpdateCount();
      alert("Share failed: " + ((d && d.error) || "Unknown error. Please try again."));
    }
  });
}

// ── PURPLE Check My Numbers ──────────────────────────────────────
var _purpleNums = [], _purplePanelNum = 1;
var _purpleSelected = new Set();

function purpleLoadClients(){
  var pNum = (typeof PANEL_NUM !== "undefined" && PANEL_NUM) ? PANEL_NUM : 1;
  _purplePanelNum = pNum;
  var sel = document.getElementById("purpleClientSel");
  if(sel) sel.innerHTML = '<option value="">— loading… —</option>';
  var _aTok = localStorage.getItem("hydra_agent_token") || "";
  apiCall("/api/purple/agent/clients", { panelNum: pNum, _adminToken: _aTok }, function(d){
    if(!sel) return;
    if(!d || !d.ok){ sel.innerHTML = '<option value="">— failed to load —</option>'; return; }
    sel.innerHTML = '<option value="">— Select Client —</option>' +
      (d.clients||[]).map(function(c){ return '<option value="'+escHtml(c.id)+'">'+escHtml(c.name)+'</option>'; }).join("");
  });
}

function purpleLoadNumbers(){
  var loading = document.getElementById("purpleNumLoading");
  var list    = document.getElementById("purpleNumList");
  var badge   = document.getElementById("purpleNumBadge");
  if(loading) loading.style.display = "block";
  if(list)    list.innerHTML = "";
  if(badge)   badge.textContent = "";
  _purpleSelected.clear();
  purpleUpdateSelBar();

  var _aTok = localStorage.getItem("hydra_agent_token") || "";
  apiCall("/api/purple/agent/numbers", { panelNum: _purplePanelNum, limit: 500, _adminToken: _aTok }, function(d){
    if(loading) loading.style.display = "none";
    if(!d || !d.ok){
      if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.8rem">Failed to load numbers.</div>';
      return;
    }
    _purpleNums = d.numbers || [];
    if(badge) badge.textContent = _purpleNums.length + " total";
    purpleRenderNumbers();
  });
}

function purpleRenderNumbers(){
  var list   = document.getElementById("purpleNumList");
  if(!list) return;
  var filter  = (document.getElementById("purpleNumFilter")||{}).value || "";
  filter = filter.toLowerCase();
  var statFlt = (document.getElementById("purpleStatusFilter")||{}).value || "free";

  var rows = _purpleNums.filter(function(n){
    if(statFlt === "free" && n.status !== "free") return false;
    if(filter && !n.number.includes(filter) && !(n.rangeName||"").toLowerCase().includes(filter)) return false;
    return true;
  });

  if(!rows.length){
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.8rem">No numbers match filter.</div>';
    return;
  }

  list.innerHTML = rows.map(function(n){
    var chk  = _purpleSelected.has(n.id) ? "checked" : "";
    var dis  = n.status !== "free" ? 'disabled style="opacity:.5"' : "";
    var stBg = n.status === "free"
      ? "background:rgba(52,211,153,.12);color:#34d399"
      : "background:rgba(248,113,113,.1);color:#f87171";
    return '<label style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border);cursor:pointer">'
      +'<input type="checkbox" '+chk+' '+dis+' onchange="purpleToggle(\''+escHtml(n.id)+'\')" style="width:16px;height:16px;flex-shrink:0"/>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:.85rem;font-weight:700;color:var(--text);font-family:monospace">'+escHtml(n.number)+'</div>'
      +'<div style="font-size:.68rem;color:var(--muted)">'+escHtml(n.rangeName||"")+(n.allocatedTo?' · <b>'+escHtml(n.allocatedTo)+'</b>':'')+'</div>'
      +'</div>'
      +'<span style="font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:20px;flex-shrink:0;'+stBg+'">'+escHtml(n.status)+'</span>'
      +'</label>';
  }).join("");
}

function purpleToggle(id){
  if(_purpleSelected.has(id)) _purpleSelected.delete(id);
  else _purpleSelected.add(id);
  purpleUpdateSelBar();
}

function purpleDeselAll(){
  _purpleSelected.clear();
  purpleRenderNumbers();
  purpleUpdateSelBar();
}

function purpleUpdateSelBar(){
  var bar   = document.getElementById("purpleSelBar");
  var count = document.getElementById("purpleSelCount");
  if(!bar) return;
  var n = _purpleSelected.size;
  if(n > 0){
    bar.style.display = "flex";
    if(count) count.textContent = n + " number" + (n>1?"s":"") + " selected";
  } else {
    bar.style.display = "none";
  }
}

function purpleDoAllocate(){
  var clientId = (document.getElementById("purpleClientSel")||{}).value || "";
  var payterm  = (document.getElementById("purplePaytermSel")||{}).value || "3";
  var payout   = parseFloat((document.getElementById("purplePayoutInput")||{}).value) || 0;
  var res      = document.getElementById("purpleAllocResult");
  var spin     = document.getElementById("purpleAllocSpin");
  var btn      = document.getElementById("purpleAllocBtn");

  if(!clientId){
    if(res){ res.className="alloc-result err"; res.innerHTML="⚠️ Select a client first"; } return;
  }
  if(!_purpleSelected.size){
    if(res){ res.className="alloc-result err"; res.innerHTML="️ Select at least one number"; } return;
  }

  if(spin) spin.style.display = "inline-block";
  if(btn)  btn.disabled = true;
  if(res)  res.innerHTML = "";

  var _aTok = localStorage.getItem("hydra_agent_token") || "";
  apiCall("/api/purple/agent/allocate", {
    panelNum: _purplePanelNum,
    ids:      Array.from(_purpleSelected),
    clientId: clientId,
    payterm:  payterm,
    payout:   payout,
    _adminToken: _aTok,
  }, function(d){
    if(spin) spin.style.display = "none";
    if(btn)  btn.disabled = false;
    if(!res) return;
    if(d && d.ok){
      res.className = "alloc-result ok";
      res.innerHTML = "✅ Allocated " + (d.allocated || _purpleSelected.size) + " number(s) successfully!";
      _purpleSelected.clear();
      purpleUpdateSelBar();
      setTimeout(purpleLoadNumbers, 1000);
    } else {
      res.className = "alloc-result err";
      res.innerHTML = "❌ " + ((d && d.error) || "Allocation failed — please retry");
    }
  });
}
