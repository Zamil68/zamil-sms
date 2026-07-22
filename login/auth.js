"use strict";

var SESSION  = localStorage.getItem("app_session")  || "";
var USERNAME = localStorage.getItem("app_username") || "";

function checkAuth(redirectTo) {
  // Admin-panel users (agent / sub-admin) must never land on /dashboard.
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

// ── Agent / Sub-Admin admin-panel session ─────────────────────
// When /api/login recognizes agent or sub-admin credentials, it
// returns an `adminToken` + `role` (+ `tag` for sub-admins). We
// store these under the same keys the /agent panel (agent.html)
// reads, so that page auto-logs in instead of showing its own
// (now removed) login screen.
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

  if (!user || !pass) {
    _showLoginErr("Please enter username and password");
    return;
  }
  if (user.length > 64 || pass.length > 128) {
    _showLoginErr("Username or password is too long");
    return;
  }

  var login = _loginEndpoint();
_setLoginBusy(true);
showLoad("Authenticating…");

// ✅ FIX: Force the login request to go to your Node.js backend on port 3000
var loginUrl = login.url.startsWith('http') ? login.url : 'http://localhost:3000' + login.url;

try {
  var _loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
    credentials: "include", // Changed to "include" for cross-port cookies
    cache: "no-store",
  });
    var r = null;
    try { r = await _loginRes.json(); } catch(e) { r = null; }
    hideLoad();

    if (r && (r.ok || r.success)) {
      USERNAME = r.username || user;
      // Check role from the response — use multiple signals for robustness
      var respRole = r.role || "";
      var isAdminRole = !!(r.adminToken && (respRole === "agent" || respRole === "subadmin"))
                        || !!(r.isAgent && r.adminToken)
                        || !!(respRole === "agent" || respRole === "subadmin");

      // Agent / Sub-Admin login:
      //   → save admin-panel token so /agent auto-logs in
      //   → do NOT write app_session (that's a client-only key)
      //     otherwise dashboard.html's checkAuth() would pass and
      //     start loading ranges before the redirect fires.
      // Client login:
      //   → write app_session as normal, clear any stale admin session.
      if (isAdminRole) {
        _saveAdminSession(r);
        // Store credentials for re-auth on the agent side too
        try {
          localStorage.setItem("app_u", btoa(unescape(encodeURIComponent(user))));
          localStorage.setItem("app_p", btoa(unescape(encodeURIComponent(pass))));
        } catch (e) {}
        // Clear any leftover client session so dashboard stays clean
        try {
          localStorage.removeItem("app_session");
          localStorage.removeItem("app_client_id");
          localStorage.removeItem("app_client_name");
          localStorage.removeItem("app_panel_num");
        } catch (e) {}
      } else {
        // Extra safety: if server somehow returned an agent/subadmin role
        // in a non-standard way, never let it write app_session
        if (respRole === "agent" || respRole === "subadmin" || r.isAgent) {
          // Treat as admin role even if adminToken was missing
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
          isAdminRole = true; // fix dest below
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

      // Clear any stale number/range cache on every login
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var key = localStorage.key(i);
          if (key && (key.indexOf("cache_nums_") === 0 || key === "cache_ranges")) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}

      showToast("Signed in");
      // Force role-correct landing page. Never trust r.redirect for admins —
      // an upstream change returning "/dashboard" would otherwise drop an
      // agent onto the client panel.
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
var loginUrl = login.url.startsWith('http') ? login.url : 'http://localhost:3000' + login.url;

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
    // Also catch fallback agent path where adminToken might be missing but role/isAgent is set
    if (!isAdminReauth && (r.role === "agent" || r.role === "subadmin" || r.isAgent)) {
      isAdminReauth = true;
      if (!r.adminToken && r.token) r.adminToken = r.token;
    }
    if (isAdminReauth) {
      // Stored creds are admin creds — should not be on the client dashboard.
      // Clear everything and go to login (not silently to /agent) so the
      // admin can log in fresh. This prevents: client logs out, admin logs in
      // on same browser, reload of /dashboard bouncing silently to /agent.
      try {
        localStorage.removeItem("app_session");
        localStorage.removeItem("app_client_id");
        localStorage.removeItem("app_client_name");
        localStorage.removeItem("app_panel_num");
        // Clear stored creds too — they belong to an admin, not a client
        localStorage.removeItem("app_u");
        localStorage.removeItem("app_p");
        // Clear admin tokens too — don't leave a stale admin session from tryReauth
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
