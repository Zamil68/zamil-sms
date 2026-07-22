// api.js — provider selector + fetch wrapper
"use strict";

var BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000' 
    : ''; 

var CLI_BODY_KEY = "LaMixSMS-CliBody-v1";

async function _sha256(bytes) {
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function _cliKeyStream(len) {
  var enc = new TextEncoder();
  var out = new Uint8Array(len);
  var block = await _sha256(enc.encode(CLI_BODY_KEY));
  var off = 0;
  while (off < len) {
    block = await _sha256(block);
    var take = Math.min(block.length, len - off);
    out.set(block.subarray(0, take), off);
    off += take;
  }
  return out;
}

function _bytesToBase64(bytes) {
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function encodeCliBody(obj) {
  var bytes = new TextEncoder().encode(JSON.stringify(obj));
  var ks = await _cliKeyStream(bytes.length);
  var out = new Uint8Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks[i];
  return { d: _bytesToBase64(out) };
}

async function apiCallCliSearch(endpoint, payload, callback) {
  var encoded = await encodeCliBody(payload);
  return apiCall(endpoint, encoded, callback);
}

var ACTIVE_PROVIDER = localStorage.getItem("app_provider") || "lamix";

function selectProvider(btn){
  if (!btn || btn.classList.contains("coming") || btn.disabled) return;
  var prov = btn.getAttribute("data-provider");
  if (!prov) return;
  document.querySelectorAll(".provider-btn").forEach(function(b){
    b.classList.remove("selected");
    b.setAttribute("aria-checked", "false");
  });
  btn.classList.add("selected");
  btn.setAttribute("aria-checked", "true");
  ACTIVE_PROVIDER = prov;
  try { localStorage.setItem("app_provider", prov); } catch(e) {}
}

function _providerUrl(endpoint) {
  var prov = ACTIVE_PROVIDER || "lamix";
  var cfg = (typeof providers !== "undefined" && providers[prov]) ? providers[prov] : null;
  var base = (cfg && cfg.endpoint) ? cfg.endpoint : "/api";
  if (!endpoint.startsWith("/api/") && !endpoint.startsWith("/api")) return endpoint;
  if (endpoint.startsWith("/api/admin/") || endpoint === "/api/admin") return endpoint;
  var rest = endpoint.slice(4);
  if (base !== "/api" && rest.startsWith("/" + prov + "/")) return base + rest.slice(prov.length + 1);
  return base + rest;
}

async function _safeJson(r) {
  var ct = r.headers.get("content-type") || "";
  if (ct.indexOf("html") > -1) return null;
  try { return await r.json(); } catch(e) { return null; }
}

var _REAUTH_INFLIGHT = null;
var _REAUTH_DONE_TS = 0;
var _REAUTH_MEMORY_MS = 5000;

async function _pingSessionAlive() {
  try {
    var currentSession = localStorage.getItem("app_session") || "";
    if (!currentSession) return false;
    var controller = new AbortController();
    var tid = setTimeout(function(){ controller.abort(); }, 5000);
    var r = await fetch(_providerUrl("/api/ping"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ session: currentSession }),
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!r.ok) return false;
    var d = await _safeJson(r);
    return !!(d && d.ok);
  } catch(e) { return false; }
}

function _silentReauth() {
  if (Date.now() - _REAUTH_DONE_TS < _REAUTH_MEMORY_MS) return Promise.resolve(true);
  if (_REAUTH_INFLIGHT) return _REAUTH_INFLIGHT;
  _REAUTH_INFLIGHT = (async function(){
    try {
      var alive = await _pingSessionAlive();
      if (alive) { _REAUTH_DONE_TS = Date.now(); return true; }
      if (typeof tryReauth === "function") {
        var ok = await tryReauth();
        if (ok) _REAUTH_DONE_TS = Date.now();
        return ok;
      }
      return false;
    } catch(e) { return false; }
    finally { setTimeout(function(){ _REAUTH_INFLIGHT = null; }, 0); }
  })();
  return _REAUTH_INFLIGHT;
}

var _PING_INFLIGHT = null;
function _pingSession() {
  if (_PING_INFLIGHT) return _PING_INFLIGHT;
  _PING_INFLIGHT = (async function(){
    try {
      var currentSession = localStorage.getItem("app_session") || "";
      var r = await _doFetch("/api/ping", "POST",
        { "Content-Type": "application/json", "Accept": "application/json" },
        JSON.stringify({ session: currentSession }));
      var d = await _safeJson(r);
      return !!(d && d.ok);
    } catch(e) { return false; }
    finally { setTimeout(function(){ _PING_INFLIGHT = null; }, 0); }
  })();
  return _PING_INFLIGHT;
}

async function _doFetch(url, method, headers, body) {
  var controller = new AbortController();
  var tid = setTimeout(function(){ controller.abort(); }, 20000);
  try {
    var finalUrl = url.startsWith('http') ? url : BACKEND_URL + url;
    var r = await fetch(finalUrl, {
      method: method,
      headers: headers,
      body: body,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(tid);
    return r;
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

function _isSessionExpired(r, data) {
  if (!r) return false;
  if (r.status === 401 || r.status === 403) return true;
  if (data && data.sessionExpired) return true;
  var ct = (r.headers && r.headers.get) ? (r.headers.get("content-type") || "") : "";
  if (ct.indexOf("html") > -1 && r.url && r.url.indexOf("/login") > -1) return true;
  return false;
}

// 🔥 BULLETPROOF apiCall: Reads session directly from localStorage every time
async function apiCall(endpoint, payload, callback, encoder){
  var url = _providerUrl(endpoint);
  var method = payload ? "POST" : "GET";
  var attempt = 0;
  
  while (true) {
    attempt++;

    // 🔥 FORCE SESSION INTO PAYLOAD DIRECTLY FROM LOCALSTORAGE
    var currentSession = localStorage.getItem("app_session") || "";
    
    if (method === "POST") {
      if (!payload) {
        payload = { session: currentSession };
      } else if (typeof payload === "object") {
        payload.session = currentSession;
      }
    }
    
    var body = null;
    if (payload) {
      body = encoder ? JSON.stringify(await encoder(payload)) : JSON.stringify(payload);
    }

    var headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (currentSession) {
      headers["Authorization"] = "Bearer " + currentSession;
    }

    var r = null, data = null;
    try {
      r = await _doFetch(url, method, headers, body);
    } catch(e) {
      var errMsg = "Network error";
      if (e && e.name === "AbortError") errMsg = "Request timed out";
      else if (e && e.message && e.message.indexOf("Failed to fetch") > -1) errMsg = "Cannot reach server";
      
      var netErr = { ok:false, error: errMsg };
      if (callback && typeof callback === "function") callback(netErr);
      return netErr;
    }

    if (r.status === 429) {
      var err429 = { ok:false, error:"Server busy — please wait a moment", retry:true };
      if (callback) callback(err429);
      return err429;
    }

    data = await _safeJson(r);

    if (_isSessionExpired(r, data)) {
      if (Date.now() - _REAUTH_DONE_TS < _REAUTH_MEMORY_MS) { continue; }
      var pinged = await _pingSession();
      if (pinged) { continue; }
      
      var reok = await _silentReauth();
      if (reok) { continue; }
      
      if (typeof showToast === "function") showToast("Session expired. Please log in again.", false);
      
      // Break the loop and force logout instead of infinite retry
      localStorage.removeItem("app_session");
      localStorage.removeItem("app_username");
      location.replace("/login");
      return { ok: false, error: "Session expired" };
    }

    if (data === null) {
      var ct = (r.headers && r.headers.get) ? (r.headers.get("content-type") || "") : "";
      if (ct.indexOf("html") > -1) {
        data = { ok:false, error:"Server returned unexpected response (HTTP " + r.status + ")" };
      } else {
        data = { ok:false, error:"Unexpected response from server (HTTP " + r.status + ")" };
      }
    }

    if (callback && typeof callback === "function") callback(data);
    return data;
  }
}
