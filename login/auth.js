"use strict";

// 🔥 LIVE DEPLOYMENT URL SWITCHER
const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000' 
    : 'https://YOUR-LIVE-BACKEND-URL.onrender.com';

var SESSION  = localStorage.getItem("app_session")  || "";
var USERNAME = localStorage.getItem("app_username") || "";

function checkAuth(redirectTo) {
  try {
    var adminTok = localStorage.getItem("hydra_agent_token");
    if (adminTok) {
      var role = localStorage.getItem("hydra_role");
      location.replace(role === "subadmin" ? "/subadmin" : "/agent");
      return false;
    }
  } catch (e) {}
  if (SESSION) return true;
  if (redirectTo) location.replace(redirectTo);
  return false;
}

function _setLoginBusy(busy) {
  var btn  = document.getElementById("btnLogin");
  var spin = document.getElementById("loginSpinner");
  var txt  = document.getElementById("loginBtnText");
  if (btn)  btn.disabled = busy;
  if (spin) spin.style.display = busy ? "inline-block" : "none";
  if (txt)  txt.textContent = busy ? "Signing in…" : "Sign In";
}

function _showLoginErr(msg) {
  var el = document.getElementById("loginErr");
  if (!el) return;
  el.innerHTML = msg || "";
  el.classList.toggle("show", !!msg);
}

function _saveAdminSession(r) {
  try {
    localStorage.setItem("hydra_agent_token", r.adminToken);
    localStorage.setItem("hydra_role", r.role || "agent");
    localStorage.setItem("hydra_tag", r.tag || "");
    localStorage.setItem("hydra_user", r.username || "");
  } catch (e) {}
}

function _clearAdminSession() {
  try {
    localStorage.removeItem("hydra_agent_token");
    localStorage.removeItem("hydra_role");
    localStorage.removeItem("hydra_tag");
    localStorage.removeItem("hydra_user");
  } catch (e) {}
}

function _loginEndpoint() {
  var provider = ("undefined" != typeof ACTIVE_PROVIDER ? ACTIVE_PROVIDER : null)
  || localStorage.getItem("app_provider") || "lamix";
  var cfg = ("undefined" != typeof providers && providers[provider]) ? providers[provider] : null;
  return {
    provider: provider,
    url: cfg && cfg.endpoint ? cfg.endpoint + "/login" : "/api/login",
  };
}

async function doLogin() {
  var user = (document.getElementById("inpUser").value || "").trim();
  var pass = document.getElementById("inpPass").value || "";
  _showLoginErr("");
  if (!user || !pass) { _showLoginErr("Please enter username and password"); return; }
  if (user.length > 64 || pass.length > 128) { _showLoginErr("Username or password is too long"); return; }

  var login = _loginEndpoint();
  _setLoginBusy(true);
  showLoad("Authenticating…");
  
  try {
    // 🔥 UPDATED: Route to live backend
    var loginUrl = login.url.startsWith('http') ? login.url : BACKEND_URL + login.url;

    var _loginRes = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
      credentials: "include",
      cache: "no-store",
    });
    var r = null;
    try { r = await _loginRes.json(); } catch(e) { r = null; }
    hideLoad();
    if (r && (r.ok || r.success)) {
      USERNAME = r.username || user;
      var respRole = r.role || "";
      var isAdminRole = !!(r.adminToken && (respRole === "agent" || respRole === "subadmin"))
      || !!(r.isAgent && r.adminToken)
      || !!(respRole === "agent" || respRole === "subadmin");

      if (isAdminRole) {
        _saveAdminSession(r);
        try {
          localStorage.setItem("app_u", btoa(unescape(encodeURIComponent(user))));
          localStorage.setItem("app_p", btoa(unescape(encodeURIComponent(pass))));
        } catch (e) {}
        try {
          localStorage.removeItem("app_session");
          localStorage.removeItem("app_client_id");
          localStorage.removeItem("app_client_name");
          localStorage.removeItem("app_panel_num");
        } catch (e) {}
      } else {
        if (respRole === "agent" || respRole === "subadmin" || r.isAgent) {
          if (r.token || r.session) {
            try {
              localStorage.setItem("hydra_agent_token", r.token || r.session);
              localStorage.setItem("hydra_role", respRole || "agent");
              localStorage.setItem("hydra_tag", r.tag || "");
              localStorage.setItem("hydra_user", r.username || user);
            } catch (e) {}
          }
          try {
            localStorage.removeItem("app_session");
            localStorage.removeItem("app_client_id");
            localStorage.removeItem("app_client_name");
            localStorage.removeItem("app_panel_num");
          } catch (e) {}
          isAdminRole = true;
        } else {
          SESSION = r.session || r.token || "";
          localStorage.setItem("app_session", SESSION);
          localStorage.setItem("app_username", USERNAME);
          localStorage.setItem("app_provider", login.provider);
          try {
            localStorage.setItem("app_u", btoa(unescape(encodeURIComponent(user))));
            localStorage.setItem("app_p", btoa(unescape(encodeURIComponent(pass))));
          } catch (e) {}
          try {
            if (r.clientId)   localStorage.setItem("app_client_id", String(r.clientId));
            if (r.clientName) localStorage.setItem("app_client_name", String(r.clientName));
            if (r.panelNum)   localStorage.setItem("app_panel_num", String(r.panelNum));
          } catch (e) {}
          _clearAdminSession();
        }
      }
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var key = localStorage.key(i);
          if (key && (key.indexOf("cache_nums_") === 0 || key === "cache_ranges")) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}
      showToast("Signed in");
      var dest;
      if (isAdminRole) {
        dest = r.role === "subadmin" ? "/subadmin" : "/agent";
      } else {
        dest = r.redirect || "/dashboard";
      }
      location.replace(dest);
      return;
    }
    var err = r && r.error ? String(r.error) : "Login failed — check credentials";
    if (err.length > 160) err = err.slice(0, 160) + "…";
    if (err.toLowerCase().indexOf("contact") !== -1) {
      err += ' <a href="https://wa.me/923000926681" target="_blank" style="color:inherit;text-decoration:underline;font-weight:600;">Contact on WhatsApp</a>';
    }
    _showLoginErr(err);
  } catch (e) {
    hideLoad();
    _showLoginErr("Connection error. Please try again.");
  } finally {
    _setLoginBusy(false);
  }
}

function doLogout() {
  SESSION  = "";
  USERNAME = "";
  try {
    localStorage.removeItem("app_session");
    localStorage.removeItem("app_username");
    localStorage.removeItem("app_client_id");
    localStorage.removeItem("app_client_name");
    localStorage.removeItem("app_panel_num");
    localStorage.removeItem("app_u");
    localStorage.removeItem("app_p");
  } catch (e) {}
  _clearAdminSession();
  location.replace("/login");
}

async function tryReauth() {
  try {
    var user = "", pass = "";
    try {
      user = decodeURIComponent(escape(atob(localStorage.getItem("app_u") || "")));
      pass = decodeURIComponent(escape(atob(localStorage.getItem("app_p") || "")));
    } catch (e) { return false; }
    if (!user || !pass) return false;
    
    var login = _loginEndpoint();
    
    // 🔥 UPDATED: Route to live backend
    var loginUrl = login.url.startsWith('http') ? login.url : BACKEND_URL + login.url;

    var res = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    var r = await res.json();
    if (!r || (!r.ok && !r.success)) return false;
    SESSION  = r.session || r.token || "";
    USERNAME = r.username || user;
    var isAdminReauth = r.adminToken && (r.role === "agent" || r.role === "subadmin");
    if (!isAdminReauth && (r.role === "agent" || r.role === "subadmin" || r.isAgent)) {
      isAdminReauth = true;
      if (!r.adminToken && r.token) r.adminToken = r.token;
    }
    if (isAdminReauth) {
      try {
        localStorage.removeItem("app_session");
        localStorage.removeItem("app_client_id");
        localStorage.removeItem("app_client_name");
        localStorage.removeItem("app_panel_num");
        localStorage.removeItem("app_u");
        localStorage.removeItem("app_p");
        localStorage.removeItem("hydra_agent_token");
        localStorage.removeItem("hydra_role");
        localStorage.removeItem("hydra_tag");
        localStorage.removeItem("hydra_user");
      } catch (e) {}
      location.replace("/");
      return false;
    } else {
      try {
        localStorage.setItem("app_session", SESSION);
        localStorage.setItem("app_username", USERNAME);
        if (r.clientId)   localStorage.setItem("app_client_id", String(r.clientId));
        if (r.clientName) localStorage.setItem("app_client_name", String(r.clientName));
        if (r.panelNum)   localStorage.setItem("app_panel_num", String(r.panelNum));
      } catch (e) {}
    }
    return !!SESSION;
  } catch (e) {
    return false;
  }
}