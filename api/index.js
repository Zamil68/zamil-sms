const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'zamil-sms-super-secret-key-2024';
const LAMIX_API_KEY = process.env.LAMIX_API_KEY || '';
const LAMIX_API_URL = 'http://51.77.216.195/crapi/lamix/viewstats';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

const AGENT_BASE_URL = 'http://51.210.208.26/ints/agent/';

// ═══════════════════════════════════════════════════════════
// 🔥 SELF-HEALING AGENT SESSION (no more expired-cookie breakage)
// ═══════════════════════════════════════════════════════════
let AGENT_COOKIE = 'PHPSESSID=0950059eaead99816b1e27139bf2d227'; // starting point; auto-refreshed
let _cookieTs = 0;        // when we last got a fresh cookie
let _lastLoginTry = 0;    // throttle login attempts
const AGENT_USER = 'muzammil62';
const AGENT_PASS = 'Zamil6262#$&#$&@';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

async function ensureAgentSession(force) {
  const fresh = (Date.now() - _cookieTs) < 8 * 60 * 1000;
  if (!force && fresh && AGENT_COOKIE) return AGENT_COOKIE;
  if (!force && (Date.now() - _lastLoginTry) < 60 * 1000) return AGENT_COOKIE; // throttle
  _lastLoginTry = Date.now();
  const urls = [`${AGENT_BASE_URL}signin`, 'http://51.210.208.26/ints/signin'];
  for (const u of urls) {
    try {
      const res = await axios.post(u, new URLSearchParams({ username: AGENT_USER, password: AGENT_PASS }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'Referer': 'http://51.210.208.26/ints/agent/' },
        maxRedirects: 0, validateStatus: () => true, timeout: 10000
      });
      const sc = res.headers['set-cookie'];
      if (sc) {
        const joined = Array.isArray(sc) ? sc.join('; ') : String(sc);
        const m = joined.match(/PHPSESSID=([^;]+)/);
        if (m) { AGENT_COOKIE = 'PHPSESSID=' + m[1]; _cookieTs = Date.now(); return AGENT_COOKIE; }
      }
    } catch (e) { /* try next url */ }
  }
  return AGENT_COOKIE;
}

function browserHeaders(referer) {
  return {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
    'Connection': 'keep-alive',
    'Cookie': AGENT_COOKIE,
    'Host': '51.210.208.26',
    'Referer': referer || 'http://51.210.208.26/ints/agent/MySMSNumbers',
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest'
  };
}

function looksLikeLogin(data) {
  if (data && typeof data === 'object' && data.aaData) return false;
  if (typeof data === 'string') {
    const s = data.toLowerCase();
    if (s.indexOf('signin') >= 0 || s.indexOf('login') >= 0 || (s.indexOf('password') >= 0 && s.indexOf('<form') >= 0)) return true;
  }
  return false;
}

function getUserFromSession(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}
function ok(res, data = {}) { res.status(200).json({ ok: true, ...data, ...corsHeaders }); }
function error(res, statusCode, message) { res.status(statusCode).json({ ok: false, error: message, ...corsHeaders }); }

function isAvailableClient(clientVal) {
  const c = (clientVal || '').trim().toLowerCase();
  if (c === '' || c === 'unallocated' || c === 'null' || c === 'none' || c === 'free' || c === '0' ||
      c === '-' || c === '--' || c === 'n/a' || c === 'available' || c === 'not assigned' ||
      c === 'unassigned' || c === '&nbsp;' || c === '—' || c === '–') return true;
  if (c.length <= 1) return true;
  return false;
}

async function getSmartDOR() {
  const now = new Date();
  const reportDate = new Date(now.getHours() < 5 ? now.getTime() - 86400000 : now.getTime());
  const dateStr = reportDate.toISOString().split('T')[0];
  const fileName = `dor-${dateStr}.json`;
  const filePath = path.join('/tmp', fileName);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (Date.now() - stats.mtimeMs < 3000) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(LAMIX_API_URL, { params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 500 } });
    let allSms = [];
    if (Array.isArray(response.data.records)) allSms = response.data.records;
    else if (Array.isArray(response.data)) allSms = response.data;
    else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;
    const parsedData = {
      date: dateStr, total: allSms.length,
      recent: allSms.slice(0, 100).map(s => ({ time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text, range: 'Global' }))
    };
    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
    return parsedData;
  } catch (err) {
    console.error('LaMix DOR Fetch Error:', err.message);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { date: dateStr, total: 0, recent: [] };
  }
}

// 🔥 Auto-renew the agent session every 10 minutes
setInterval(() => { ensureAgentSession(true).catch(() => {}); }, 10 * 60 * 1000);

async function scrapeAgentData(endpoint, params = {}) {
  await ensureAgentSession();
  const doReq = async () => (await axios.get(`${AGENT_BASE_URL}${endpoint}`, { params, headers: browserHeaders(), timeout: 15000, maxRedirects: 5, validateStatus: () => true })).data;
  try {
    let data = await doReq();
    if (looksLikeLogin(data)) { await ensureAgentSession(true); data = await doReq(); }
    return data;
  } catch (err) { console.error('Agent Panel Scrape Error:', err.message); return null; }
}

function parseNumbersData(data) {
  if (data && typeof data === 'object' && data.aaData) {
    return data.aaData.map(row => ({
      range: (row[1] || '').replace(/<[^>]*>/g, '').trim(),
      country: (row[2] || '').replace(/<[^>]*>/g, '').trim(),
      number: (row[3] || '').replace(/<[^>]*>/g, '').trim(),
      client: (row[5] || '').replace(/<[^>]*>/g, '').trim(),
      payout: (row[6] || '$0.01').replace(/<[^>]*>/g, '').trim()
    }));
  }
  return [];
}

const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const PAYTERM_VOCAB = ['daily','weekly','weekly7','biweekly','biweekly30','monthly15','monthly30','monthly45','monthly60'];

async function getAllocForm() {
  await ensureAgentSession();
  const fetchHtml = async () => (await axios.get(`${AGENT_BASE_URL}SMSBulkAllocations`, { headers: browserHeaders('http://51.210.208.26/ints/agent/SMSBulkAllocations'), timeout: 15000, maxRedirects: 5, validateStatus: () => true })).data;
  try {
    let html = await fetchHtml();
    if (!html || looksLikeLogin(html)) { await ensureAgentSession(true); html = await fetchHtml(); }
    if (!html) return null;
    const $ = cheerio.load(html);
    const labelFor = (el) => {
      const $el = $(el); let lab = '';
      let p = $el.parent();
      for (let d = 0; d < 4 && p && p.length; d++) { lab = p.find('label').first().text(); if (lab && lab.trim()) break; p = p.parent(); }
      if (!lab.trim()) lab = $el.prevAll('label').first().text();
      if (!lab.trim()) { const id = $el.attr('id'); if (id) lab = $('label[for="' + id + '"]').text(); }
      return lab.replace(/\s+/g, ' ').trim();
    };
    let form = $('form').filter((i, el) => $(el).find('select,input[type=text],input[type=hidden]').length >= 2).first();
    if (!form.length) form = $('form').first();
    if (!form.length) return null;
    const action = form.attr('action') || '';
    const controls = [];
    form.find('select').each((i, el) => {
      const name = $(el).attr('name'); if (!name) return;
      const opts = []; $(el).find('option').each((j, o) => opts.push({ value: $(o).attr('value') != null ? $(o).attr('value') : $(o).text().trim(), text: $(o).text().trim(), selected: $(o).attr('selected') != null }));
      const def = ($(el).find('option[selected]').attr('value')) || (opts[0] && opts[0].value) || '';
      controls.push({ name, type: 'select', label: labelFor(el), isSelect: true, multiple: $(el).attr('multiple') != null, opts, def });
    });
    form.find('input').each((i, el) => {
      const name = $(el).attr('name'); const t = ($(el).attr('type') || 'text').toLowerCase();
      if (!name || t === 'submit' || t === 'button') return;
      controls.push({ name, type: t, label: labelFor(el), isSelect: false, value: $(el).attr('value') != null ? $(el).attr('value') : '' });
    });
    return { action, controls };
  } catch (e) { console.error('getAllocForm error:', e.message); return null; }
}

function extractRangeItems(d) {
  if (!d) return { items: [], more: false };
  if (Array.isArray(d)) return { items: d, more: false };
  if (typeof d === 'object') {
    const arr = d.results || d.ranges || d.data || d.items || d.rows || d.list;
    if (Array.isArray(arr)) return { items: arr, more: !!(d.more || (d.pagination && d.pagination.more)) };
  }
  if (typeof d === 'string') {
    const s = d.trim();
    if (s[0] === '{' || s[0] === '[') { try { return extractRangeItems(JSON.parse(s)); } catch (_) {} }
    const $ = cheerio.load(s); const items = [];
    $('option').each((i, o) => items.push({ id: $(o).attr('value'), text: $(o).text() }));
    if (items.length) return { items, more: false };
  }
  return { items: [], more: false };
}

async function getRangeOptions() {
  await ensureAgentSession();
  const map = new Map(); const sample = []; let raw = '';
  let page = 1; const max = 500;
  const fetchPage = async (p) => (await axios.get(`${AGENT_BASE_URL}res/aj_smsranges.php`, { params: { max, page: p }, headers: browserHeaders('http://51.210.208.26/ints/agent/SMSBulkAllocations'), timeout: 15000, maxRedirects: 5, validateStatus: () => true })).data;
  while (page <= 30) {
    let d;
    try { d = await fetchPage(page); if (looksLikeLogin(d)) { await ensureAgentSession(true); d = await fetchPage(page); } } catch (e) { break; }
    if (page === 1) raw = (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600);
    const ex = extractRangeItems(d);
    if (!ex.items.length) break;
    ex.items.forEach(it => {
      const id = String(it.id != null ? it.id : (it.value != null ? it.value : (it.range_id != null ? it.range_id : (it.code != null ? it.code : ''))));
      const text = String(it.text != null ? it.text : (it.label != null ? it.label : (it.name != null ? it.name : (it.range != null ? it.range : (it.title != null ? it.title : '')))));
      if (id) { const k = norm(text); if (k && !map.has(k)) map.set(k, id); }
      if (sample.length < 10) sample.push(id + '|' + text);
    });
    if (!ex.more || ex.items.length < max) break;
    page++;
  }
  map._sample = sample; map._raw = raw;
  return map;
}

function resolveUrl(action) {
  if (!action) return `${AGENT_BASE_URL}SMSBulkAllocations`;
  if (/^https?:\/\//i.test(action)) return action;
  if (action[0] === '/') return 'http://51.210.208.26' + action;
  return `${AGENT_BASE_URL}${action}`;
}
// 🔥 Per-country (3) / per-range (2) daily caps — Supabase-backed; uncapped until keys are set
const COUNTRY_CAP = 3;
const RANGE_CAP   = 2;
const DAILY_ALLOC_CAP = COUNTRY_CAP;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
function supaEnabled(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function _todayPKT(){ return new Date(Date.now()+5*3600000).toISOString().slice(0,10); }
function _todayStartUTC(){ return new Date().toISOString().slice(0,10) + 'T00:00:00Z'; }
function _countryOfRange(rangeText){
  const t = String(rangeText||'').trim();
  if (typeof splitRangeName === 'function') { try { const s = splitRangeName(t); if (s && s.country) return s.country; } catch(e){} }
  const m = t.match(/^(.*?)[\s\-]*(?:LX|MX|RX|DC|LX2|MX2)\b/i) || t.match(/^(.*?)[\s\-]+\d{3,}/);
  return (m && m[1] ? m[1] : t).trim();
}
async function supaInsertEvent(ev){
  if (!supaEnabled()) return;
  try { await fetch(`${SUPABASE_URL}/rest/v1/alloc_events`, { method:'POST', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' }, body: JSON.stringify(ev) }); }
  catch(e){ console.error('supaInsertEvent', e.message); }
}
async function countDailyAllocByCountry(username, clientName){
  if (supaEnabled()) {
    try {
      const start = encodeURIComponent('gte.' + _todayStartUTC());
      const r = await fetch(`${SUPABASE_URL}/rest/v1/alloc_events?username=${encodeURIComponent('eq.'+username)}&created_at=${start}&select=country,range_id`, { headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } });
      const rows = await r.json();
      if (Array.isArray(rows)) {
        const byCountry={}, byRange={};
        rows.forEach(x => { const c=x.country||'Unknown'; byCountry[c]=(byCountry[c]||0)+1; if(x.range_id) byRange[x.range_id]=(byRange[x.range_id]||0)+1; });
        return { byCountry, byRange, total: rows.length, _src:'supabase' };
      }
    } catch(e){ console.error('supa count error', e.message); }
  }
  return { byCountry:{}, byRange:{}, total:0, _src:'none' }; // no Supabase yet → uncapped (allocations still work)
}

// ═══════════════════════════════════════════════════════════
// 🔥 CDR SCRAPER (real OTP/SMS source) + 05:00→05:00 PKT business day + 5s cache
// ═══════════════════════════════════════════════════════════
const RESET_HOUR_PKT = 5; // kept for the weekly/monthly snapshot roll (Phase 3); NOT used to hide messages
function businessDayPKT(){
  const pkt = new Date(Date.now() + 5*3600000);          // "now" expressed in PKT
  const base = pkt.toISOString().slice(0,10);            // PKT calendar date = what the panel calls "today"
  return { from: base + ' 00:00:00', to: base + ' 23:59:59', label: base };
}

async function scrapeCDR(dateFrom, dateTo, extra){
  await ensureAgentSession();
  const mp = {};
  for (let i = 0; i < 9; i++){ mp['mDataProp_'+i] = i; mp['sSearch_'+i] = ''; mp['bRegex_'+i] = false; mp['bSearchable_'+i] = true; mp['bSortable_'+i] = (i !== 8); }
  const params = Object.assign({
    fdate1: dateFrom, fdate2: dateTo, frange:'', fclient:'', fnum:'', fcli:'',
    fgdate:'', fgmonth:'', fgrange:'', fgclient:'', fgnumber:'', fgcli:'', fg:0,
    sEcho:1, iColumns:9, sColumns:',,,,,,,,', iDisplayStart:0, iDisplayLength:100000,
    sSearch:'', bRegex:false, iSortCol_0:0, sSortDir_0:'desc', iSortingCols:1
  }, mp, extra||{});
  const doReq = async () => (await axios.get(`${AGENT_BASE_URL}res/data_smscdr.php`, { params, headers: browserHeaders('http://51.210.208.26/ints/agent/SMSCDRStats'), timeout: 20000, maxRedirects:5, validateStatus:()=>true })).data;
  try {
    let d = await doReq();
    if (looksLikeLogin(d)) { await ensureAgentSession(true); d = await doReq(); }
    if (!d || !d.aaData) return [];
    const rows = [];
    d.aaData.forEach(r => {
      if (!Array.isArray(r)) return;
      const dt = String(r[0]||'');
      if (!/^\d{4}-\d{2}-\d{2}/.test(dt)) return; // skip the totals row
      rows.push({ datetime: dt, date: dt.slice(0,10), time: dt.slice(11,19),
        range: String(r[1]||'').replace(/<[^>]*>/g,'').trim(),
        number: String(r[2]||'').replace(/<[^>]*>/g,'').trim(),
        cli: String(r[3]||'').replace(/<[^>]*>/g,'').trim(),
        client: String(r[4]||'').replace(/<[^>]*>/g,'').trim(),
        message: String(r[5]||'').replace(/<[^>]*>/g,'').trim(),
        currency: String(r[6]||'').trim(), myPayout: r[7], clientPayout: r[8] });
    });
    return rows;
  } catch(e){ console.error('scrapeCDR:', e.message); return []; }
}
const _cdrCache = new Map();   // key(from|to) -> { ts, rows }  — multi-window, no thrashing
const CDR_TTL = 5000;          // 5s  for "today" (inbox / DOR / per-number)
const CDR_TTL_WIDE = 60000;    // 60s for week/month (heavy, changes slowly)
async function getCachedCDR(from, to, ttl){
  const key = from + '|' + to;
  const hit = _cdrCache.get(key);
  if (hit && (Date.now() - hit.ts) < (ttl || CDR_TTL)) return hit.rows;
  const rows = await scrapeCDR(from, to);
  _cdrCache.set(key, { ts: Date.now(), rows });
  if (_cdrCache.size > 12) { const now = Date.now(); for (const [k, v] of _cdrCache) if (now - v.ts > 120000) _cdrCache.delete(k); }
  return rows;
}
function isMine(client, user){
  const c = (client||'').toLowerCase().trim();
  const t1 = (user.clientName||'').toLowerCase().trim(), t2 = (user.username||'').toLowerCase().trim();
  return c && (c===t1 || c===t2 || c.includes(t1) || c.includes(t2));
}

// ═══════════════════════════════════════════════════════════
// 🔐 PASSWORDS — scrypt hashing (no dependency) + Supabase user_creds
// ═══════════════════════════════════════════════════════════
function hashPassword(pw){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored){
  try {
    if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch(e){ return false; }
}
async function supaGetCreds(username){
  if (!supaEnabled()) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_creds?username=${encodeURIComponent('eq.'+username)}&select=*`, { headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } });
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch(e){ console.error('supaGetCreds:', e.message); return null; }
}
async function supaUpsertCreds(username, passHash, clientId, clientName, recoveryHash){
  if (!supaEnabled()) return false;
  try {
    const body = { username, pass_hash: passHash, client_id: clientId||null, client_name: clientName||null, updated_at: new Date().toISOString() };
    if (recoveryHash !== undefined) body.recovery_hash = recoveryHash; // omit → keep existing (merge)
    await fetch(`${SUPABASE_URL}/rest/v1/user_creds`, { method:'POST', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
    return true;
  } catch(e){ console.error('supaUpsertCreds:', e.message); return false; }
}
async function lookupLaMixClient(username){
  const cleanStrip = s => (s || '').replace(/<[^>]*>/g, '').trim();
  const want = String(username).toLowerCase();
  await ensureAgentSession();
  try {
    const fetchClients = async () => (await axios.get(`${AGENT_BASE_URL}res/data_clients.php`, {
      params: { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' },
      headers: browserHeaders('http://51.210.208.26/ints/agent/Clients'), timeout: 10000, maxRedirects: 5, validateStatus: () => true
    })).data;
    let cd = await fetchClients();
    if (looksLikeLogin(cd)) { await ensureAgentSession(true); cd = await fetchClients(); }
    if (cd && Array.isArray(cd.aaData)) {
      const found = cd.aaData.find(c => cleanStrip(c[1]).toLowerCase() === want || cleanStrip(c[2]).toLowerCase() === want);
      if (found) {
        const idMatch = (found[0] || '').match(/value=["'](\d+)["']/);
        return { clientId: idMatch ? idMatch[1] : '0', clientName: cleanStrip(found[2]) || cleanStrip(found[1]) || username };
      }
    }
  } catch (e) { console.error('lookupLaMixClient:', e.message); }
  return null;
}

// ═══════════════════════════════════════════════════════════
// 🛡️ ROLES — super (you) + admins; allocation caps waived for them
// ═══════════════════════════════════════════════════════════
const SUPER_ADMIN = (process.env.SUPER_ADMIN || 'Muzammil_Aziz').toLowerCase(); // change via env if your login name differs
const _roleCache = new Map();
async function getRole(username){
  const u = String(username||'').toLowerCase().trim();
  if (!u) return 'none';
  if (u === SUPER_ADMIN) return 'super';            // you: no DB hit, zero latency
  const c = _roleCache.get(u); if (c && (Date.now()-c.ts) < 30000) return c.role;
  let role = 'none';
  if (supaEnabled()) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?username=eq.${encodeURIComponent(u)}&select=role`,
        { headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } });
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0] && rows[0].role) role = rows[0].role;
    } catch(e){}
  }
  _roleCache.set(u, { ts: Date.now(), role });
  return role;
}
function isAdminish(role){ return role === 'super' || role === 'admin'; }

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  const url = req.url.replace(/^\/api/, '');

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. LOGIN — dynamic LaMix lookup (username OR name) + fallback + self-healing cookie
    // ═══════════════════════════════════════════════════════════
   if (url === '/login' && req.method === 'POST') {
      const rawUsername = (req.body.username || '').trim();
      const password = (req.body.password || '').trim();
      if (!rawUsername || !password) return error(res, 400, 'Username and password required');
      const want = rawUsername.toLowerCase();

      const fallback = {
        'muzammil62': { clientId: '0', clientName: 'Agent', panelNum: 1 },
        'zml_ahsan':  { clientId: '169269', clientName: 'ZML_Ahsan', panelNum: 1 },
        'zml_anns':   { clientId: '169270', clientName: 'ZML_Anns', panelNum: 1 }
      };

      // Agent/fallback accounts (always reachable; verify hash only if one exists)
      if (fallback[want]) {
        if (supaEnabled()) {
          const creds = await supaGetCreds(rawUsername);
          if (creds && creds.pass_hash && !verifyPassword(password, creds.pass_hash)) return error(res, 401, 'Incorrect password.');
        }
        const u = fallback[want];
        const token = jwt.sign({ username: rawUsername, clientId: u.clientId, clientName: u.clientName, panelNum: u.panelNum }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: u.clientId, clientName: u.clientName, redirect: '/dashboard/dashboard.html' });
      }

      if (supaEnabled()) {
        const creds = await supaGetCreds(rawUsername);
        if (creds && creds.pass_hash) {
          if (!verifyPassword(password, creds.pass_hash)) return error(res, 401, 'Incorrect password.');
          const token = jwt.sign({ username: rawUsername, clientId: creds.client_id||'0', clientName: creds.client_name||rawUsername, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
          return ok(res, { session: token, username: rawUsername, clientId: creds.client_id||'0', clientName: creds.client_name||rawUsername, redirect: '/dashboard/dashboard.html' });
        }
        // First-time: confirm the username exists in LaMix, then ask them to set a password
        const lamix = await lookupLaMixClient(rawUsername);
        if (lamix) return ok(res, { firstLogin: true, username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName });
        return res.status(401).json({ ok: false, error: 'Client not found in LaMix. Check the username.', ...corsHeaders });
      }

      // Supabase not configured → legacy LaMix-only (any password)
      const lamix = await lookupLaMixClient(rawUsername);
      if (lamix) {
        const token = jwt.sign({ username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName, redirect: '/dashboard/dashboard.html' });
      }
      return res.status(401).json({ ok: false, error: 'Client not found in LaMix. Check the username.', ...corsHeaders });
    }

    // 🔐 FIRST-LOGIN: set password + recovery code, then sign in
    if (url === '/auth/set-password' && req.method === 'POST') {
      const { username, clientId, clientName, password, recovery } = req.body;
      if (!username || !password || String(password).length < 6) return error(res, 400, 'Password must be at least 6 characters.');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');
      const recHash = (recovery && String(recovery).length >= 4) ? hashPassword(recovery) : null;
      await supaUpsertCreds(username, hashPassword(password), clientId||'0', clientName||username, recHash);
      const token = jwt.sign({ username, clientId: clientId||'0', clientName: clientName||username, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
      return ok(res, { session: token, username, clientId: clientId||'0', clientName: clientName||username, redirect: '/dashboard/dashboard.html' });
    }

    // 🔐 CHANGE PASSWORD (profile)
    if (url === '/auth/change-password' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const oldPassword = req.body.oldPassword || '';
      const newPassword = req.body.newPassword || '';
      if (!newPassword || String(newPassword).length < 6) return error(res, 400, 'New password must be at least 6 characters.');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');
      const creds = await supaGetCreds(user.username);
      if (!creds || !creds.pass_hash) return error(res, 404, 'No password set yet.');
      if (!verifyPassword(oldPassword, creds.pass_hash)) return error(res, 401, 'Current password is incorrect.');
      await supaUpsertCreds(user.username, hashPassword(newPassword), creds.client_id, creds.client_name); // recovery preserved
      return ok(res, { message: 'Password updated.' });
    }

    // 🔐 FORGOT PASSWORD (login) — recovery code reset
    if (url === '/auth/forgot-password' && req.method === 'POST') {
      const { username, recovery, newPassword } = req.body;
      if (!username || !recovery || !newPassword || String(newPassword).length < 6) return error(res, 400, 'All fields required (password ≥ 6 chars).');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');
      const creds = await supaGetCreds(username);
      if (!creds || !creds.recovery_hash) return error(res, 401, 'Reset not available — contact admin on WhatsApp.');
      if (!verifyPassword(recovery, creds.recovery_hash)) return error(res, 401, 'Incorrect recovery code.');
      await supaUpsertCreds(username, hashPassword(newPassword), creds.client_id, creds.client_name, creds.recovery_hash);
      return ok(res, { message: 'Password reset. You can now sign in.' });
    }

    if (url === '/auth/role' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      return ok(res, { role, username: user.username });
    }

    // 2. PING
    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // 3. RANGES
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
      if (!data || !data.aaData) return ok(res, { ranges: [] });
      const allNumbers = parseNumbersData(data);
      const target1 = (user.clientName || '').toLowerCase().trim();
      const target2 = (user.username || '').toLowerCase().trim();
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        if (!c) return false;
        return c === target1 || c === target2 || c.includes(target1) || c.includes(target2);
      });
      const rangesMap = new Map();
      userNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) rangesMap.set(key, { id: `range_${rangesMap.size}`, title: n.range, country: n.country, numbers: [], count: 0 });
        const range = rangesMap.get(key); range.numbers.push(n.number); range.count++;
      });
      return ok(res, {
        ranges: Array.from(rangesMap.values()).map(r => ({ ...r, minsAgo: Math.floor(Math.random() * 60) })),
        _debug: { totalScraped: allNumbers.length, matchedForUser: userNumbers.length, lookingFor: `"${target1}" or "${target2}"`, sampleClients: allNumbers.slice(0, 10).map(n => `"${n.client}"`) }
      });
    }

    // 4. NUMBERS
    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
      if (!data || !data.aaData) return ok(res, { numbers: [] });
      const allNumbers = parseNumbersData(data);
      const target1 = (user.clientName || '').toLowerCase().trim();
      const target2 = (user.username || '').toLowerCase().trim();
      const reqTitle = (req.body.rangeTitle || '').toLowerCase().trim();
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        const isOwner = c && (c === target1 || c === target2 || c.includes(target1) || c.includes(target2));
        const nRange = (n.range || '').toLowerCase().trim();
        const isRange = reqTitle ? (nRange.includes(reqTitle) || reqTitle.includes(nRange)) : true;
        return isOwner && isRange;
      });
      return ok(res, { numbers: userNumbers, _debug: { reqTitle, target1, matched: userNumbers.length, total: allNumbers.length } });
    }

    // 5. SMS COUNT
   if (url === '/number-smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const number = String(req.body.number||'').replace(/[^0-9]/g,'');
      if (!number) return ok(res, { number, count:0, recent:[] });
      const bd = businessDayPKT();
      const rows = await getCachedCDR(bd.from, bd.to);
      const mine = rows.filter(r => { const num=(r.number||'').replace(/[^0-9]/g,''); return isMine(r.client, user) && (num===number || num.endsWith(number) || number.endsWith(num)); });
      mine.sort((a,b) => b.datetime.localeCompare(a.datetime));
      return ok(res, { number, count: mine.length, recent: mine.slice(0,8).map(r => ({ time: r.time, cli: r.cli, message: r.message, number: r.number })) });
    }

    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const bd = businessDayPKT();
      const rows = await getCachedCDR(bd.from, bd.to);
      const mine = rows.filter(r => isMine(r.client, user));
      mine.sort((a,b) => b.datetime.localeCompare(a.datetime));
      return ok(res, { count: mine.length, recent: mine.slice(0,50).map(r => ({ time: r.time, datetime: r.datetime, number: r.number, cli: r.cli, message: r.message, range: r.range })) });
    }
    
    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const bd = businessDayPKT();
      const rows = await getCachedCDR(bd.from, bd.to);
      const mine = rows.filter(r => isMine(r.client, user));
      const byNumber = {}, byRange = {};
      mine.forEach(r => {
        const n = (r.number||'').replace(/[^0-9]/g,''); if (n) byNumber[n] = (byNumber[n]||0) + 1;
        if (r.range) byRange[r.range] = (byRange[r.range]||0) + 1;
      });
      return ok(res, { count: mine.length, byNumber, byRange }); // defensive: whatever the frontend reads, it finds it
    }

    if (url === '/dor' && req.method === 'POST') {
      const bd = businessDayPKT();
      const rows = await getCachedCDR(bd.from, bd.to);
      rows.sort((a,b) => b.datetime.localeCompare(a.datetime));
      return ok(res, { date: bd.label, total: rows.length, recent: rows.slice(0,200).map(r => ({ time: r.time, datetime: r.datetime, number: r.number, cli: r.cli, client: r.client, message: r.message, range: r.range })) });
    }

    // 6. SEARCH RANGES (real ids + available counts)
    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const query = (req.body.query || '').toLowerCase().trim();
      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
      if (!data || !data.aaData) return ok(res, { ranges: [], _debug: 'No data from LaMix' });

      const allNumbers = parseNumbersData(data);
      const rangesMap = new Map();
      allNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) rangesMap.set(key, { id: null, title: n.range, country: n.country, total: 0, available: 0 });
        const r = rangesMap.get(key); r.total++;
        if (isAvailableClient(n.client)) r.available++;
      });

      const rangeOpts = await getRangeOptions();
      const optKeys = Array.from(rangeOpts.keys());
      let mapped = 0; const unmatched = [];
      rangesMap.forEach(r => {
        const cands = [norm(`${r.country} - ${r.title}`), norm(r.title), norm(`${r.country}${r.title}`), norm(`${r.title} - ${r.country}`)];
        let id = null;
        for (const c of cands) { if (c && rangeOpts.has(c)) { id = rangeOpts.get(c); break; } }
        if (!id) { const nt = norm(r.title); for (const k of optKeys) { if (k && nt && (k.includes(nt) || nt.includes(k))) { id = rangeOpts.get(k); break; } } }
        if (!id) { const nc = norm(r.country); const nt = norm(r.title); if (nc.length >= 4) for (const k of optKeys) { if (k && k.includes(nc) && nt && k.includes(nt.slice(0, 6))) { id = rangeOpts.get(k); break; } } }
        if (id) { r.id = id; mapped++; } else { unmatched.push(`${r.country} - ${r.title}`); }
      });
      let i = 0; rangesMap.forEach(r => { if (!r.id) r.id = 'alloc_' + (i++); });

      const filtered = Array.from(rangesMap.values()).filter(r => `${r.country} ${r.title}`.toLowerCase().includes(query));
      const withAvail = filtered.filter(r => r.available > 0);
      const ourRangeSample = Array.from(rangesMap.values()).slice(0, 8).map(r => `${r.country} - ${r.title}`);

      return ok(res, {
        ranges: withAvail,
        _debug: {
          query, totalScraped: allNumbers.length, rangesFound: filtered.length, withAvailable: withAvail.length,
          realIdsMapped: mapped, rangeOptsCount: optKeys.length,
          rangeOptsRaw: rangeOpts._raw || '', rangeOptsSample: rangeOpts._sample || [],
          ourRangeSample, unmatchedSample: unmatched.slice(0, 8)
        }
      });
    }

    // 7. CHECK AVAILABILITY
    if (url === '/alloc/check-availability' && req.method === 'POST') {
      const { rangeId } = req.body;
      const cleanRangeId = String(rangeId || '').replace('alloc_', '').trim();
      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange: cleanRangeId, fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
      let available = 0, total = 0;
      if (data && data.aaData) { const numbers = parseNumbersData(data); total = numbers.length; available = numbers.filter(n => isAvailableClient(n.client)).length; }
      return ok(res, { available, total });
    }

    if (url === '/alloc/daily-used' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const country = _countryOfRange(req.body.rangeTitle || req.body.country || '');
      const rangeId = String(req.body.rangeId || '').trim();
      const r = await countDailyAllocByCountry(user.username, user.clientName);
      const countryUsed = r.byCountry[country] || 0;
      const rangeUsed = (r.byRange && r.byRange[rangeId]) || 0;
      const remaining = supaEnabled() ? Math.max(0, Math.min(RANGE_CAP - rangeUsed, COUNTRY_CAP - countryUsed)) : COUNTRY_CAP;
      return ok(res, { country, rangeUsed, rangeLimit:RANGE_CAP, countryUsed, countryLimit:COUNTRY_CAP, remaining, byCountry:r.byCountry, _src:r._src||'none' });
    }
  
    // 8. ALLOCATE (real post + before/after proof)
    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const rangeId = String(req.body.rangeId || '').trim();
      const quantity = parseInt(req.body.quantity) || parseInt(req.body.qty) || 1;
      const payout = parseFloat(req.body.payout) || 0.01;
      const _country = _countryOfRange(req.body.rangeTitle || '');
      const _cap = await countDailyAllocByCountry(user.username, user.clientName);
     const _countryUsed = _cap.byCountry[_country] || 0;
      const _rangeUsed = (_cap.byRange && _cap.byRange[rangeId]) || 0;
      const _role = await getRole(user.username);
      if (isAdminish(_role)) {
        // 🔓 super / admin: caps waived — you can test & add ranges freely
      } else if (supaEnabled()) {
        if (_rangeUsed >= RANGE_CAP) return ok(res, { limitReached:true, capType:'range', country:_country, used:_rangeUsed, limit:RANGE_CAP, remaining:0, message:`Max ${RANGE_CAP} per range per day reached.` });
        if (_countryUsed >= COUNTRY_CAP) return ok(res, { limitReached:true, capType:'country', country:_country, used:_countryUsed, limit:COUNTRY_CAP, remaining:0, message:`Max ${COUNTRY_CAP} per country per day reached. Other countries still available.` });
      }

      const form = await getAllocForm();
      const C = form ? form.controls : [];
      const findCtl = (re, excl) => C.find(c => re.test(c.label) && (!excl || !excl.test(c.label)));
      const rangeCtl   = findCtl(/range/i, /qty|each|payout|quantity|client/i);
      const clientCtl  = findCtl(/client/i);
      const paytermCtl = C.find(c => c.isSelect && /payterm|term/i.test(c.label)) || C.find(c => c.isSelect && c.opts && c.opts.length > 0 && c.opts.length <= 12);
      const qtyCtl     = findCtl(/qty|quantity|each/i);
      const payoutCtl  = findCtl(/payout|price|rate/i);

      const clientValue = String(user.clientId || '');

      // payterm: never empty
      let paytermValue = '';
      if (paytermCtl) {
        const reqPT = String(req.body.payterm || '');
        const byVal = v => paytermCtl.opts.find(o => String(o.value) === String(v));
        const numeric = paytermCtl.opts.filter(o => /^[1-9][0-9]*$/.test(String(o.value)));
        paytermValue = (reqPT && byVal(reqPT) && byVal(reqPT).value) || (byVal('2') && byVal('2').value) || (numeric[0] && numeric[0].value) || paytermCtl.def || (paytermCtl.opts[0] && paytermCtl.opts[0].value) || '';
      }
      if (!paytermValue) paytermValue = '2';

      const isFakeRange = /^alloc_\d+$/.test(rangeId) || !rangeId;

      // field names (fallback to common names if label match failed)
      const fRange   = rangeCtl   ? rangeCtl.name   : 'range';
      const fClient  = clientCtl  ? clientCtl.name  : 'client';
      const fPayterm = paytermCtl ? paytermCtl.name : 'payterm';
      const fQty     = qtyCtl     ? qtyCtl.name     : 'qty';
      const fPayout  = payoutCtl  ? payoutCtl.name  : 'payout';

      // build fields: hidden inputs first, then our 5 fields
      const fields = {};
      if (form) C.forEach(c => { if (c.type === 'hidden' && c.name) fields[c.name] = c.value || ''; });
      fields[fRange]   = rangeId;
      fields[fClient]  = clientValue;
      fields[fPayterm] = paytermValue;
      fields[fQty]     = String(quantity);
      fields[fPayout]  = String(payout);

      let reason = 'POSTED';
      if (!form) reason = 'FORM_NOT_FOUND';
      else if (isFakeRange) reason = 'RANGE_ID_NOT_MAPPED';

      // BEFORE count
      let beforeAny = 0;
      try { const d = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: clientValue, totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 }); if (d && d.aaData) beforeAny = parseNumbersData(d).length; } catch (e) {}

      let serverStatus = null, serverBody = '';
      // 🔥 POST as multipart/form-data — EXACTLY like the browser form (only if range id is real)
      if (form && !isFakeRange) {
        try {
          await ensureAgentSession();
          const boundary = '----ZamilFormBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
          let body = '';
          for (const [k, v] of Object.entries(fields)) {
            body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
          }
          body += `--${boundary}--\r\n`;
          const postRes = await axios.post(resolveUrl(form.action || 'SMSBulkAllocations'), body, {
            headers: Object.assign({}, browserHeaders('http://51.210.208.26/ints/agent/SMSBulkAllocations'), { 'Content-Type': 'multipart/form-data; boundary=' + boundary }),
            transformRequest: [(d) => d],
            maxRedirects: 5, validateStatus: () => true, timeout: 20000
          });
          serverStatus = postRes.status;
          serverBody = (postRes.data == null ? '' : (typeof postRes.data === 'string' ? postRes.data : JSON.stringify(postRes.data))).toString();
          reason = 'POSTED_' + postRes.status;
        } catch (e) { reason = 'POST_ERROR_' + (e.code || e.message); serverBody = String(e.message || ''); }
      }

      // AFTER count + delta = real proof
      let afterAny = 0;
      try { const d = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: clientValue, totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 }); if (d && d.aaData) afterAny = parseNumbersData(d).length; } catch (e) {}
      const allocatedReal = Math.max(0, afterAny - beforeAny);
      if (allocatedReal > 0) reason = 'ALLOCATED_OK';
      else if (reason.indexOf('POSTED_') === 0) reason = 'POSTED_NOCHANGE_' + serverStatus;
      const looksSuccessful = allocatedReal > 0 || (serverStatus != null && serverStatus >= 200 && serverStatus < 400);
      if (looksSuccessful && supaEnabled()) await supaInsertEvent({ username: user.username, country: _country, range_id: rangeId, range_title: String(req.body.rangeTitle||''), qty: quantity });

      let total = 0, available = 0;
      try { const d = await scrapeAgentData('res/data_smsnumbers.php', { frange: rangeId, fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 }); if (d && d.aaData) { const ns = parseNumbersData(d); total = ns.length; available = ns.filter(n => isAvailableClient(n.client)).length; } } catch (e) {}

      // 🔥 Diagnostic that shows in the collapsed console line (via _server) when the real body is empty
      const sentCompact = Object.entries(fields).map(([k, v]) => k + '=' + v).join('&');
      const fieldsCompact = C.map(c => c.name + ':' + c.type + ':"' + c.label + '"').join(' | ');
      const diag = 'RANGE=' + rangeId + (isFakeRange ? '(FAKE!)' : '') + ' CLIENT=' + clientValue + ' PAYTERM=' + paytermValue + ' QTY=' + quantity + ' PAYOUT=' + payout + ' || NAMES r=' + fRange + ' c=' + fClient + ' pt=' + fPayterm + ' q=' + fQty + ' p=' + fPayout + ' || SENT ' + sentCompact + ' || FORM ' + fieldsCompact;
      const serverInfo = (serverBody && serverBody.trim()) ? ('SERVER[' + serverStatus + ']: ' + serverBody.replace(/\s+/g, ' ').slice(0, 180)) : diag.slice(0, 320);

      return ok(res, {
        reason, _server: serverInfo,
        allocatedReal, beforeAny, afterAny,
        allocated: quantity, country: _country,
        used: _countryUsed + 1, limit: DAILY_ALLOC_CAP, remaining: Math.max(0, DAILY_ALLOC_CAP - (_countryUsed + 1)),
        _poolRemaining: available, _poolTotal: total,
        message: allocatedReal > 0 ? `Allocated ${allocatedReal} to ${user.clientName}` : (isFakeRange ? 'Range id not mapped to a real LaMix range' : 'Posted but no change detected'),
        _debug: { rangeId, isFakeRange, quantity, payout, paytermValue, clientId: user.clientId, clientName: user.clientName, clientValue,
          fieldMap: { range: fRange, client: fClient, payterm: fPayterm, qty: fQty, payout: fPayout },
          sent: fields, allControls: C.map(c => c.name + ' [' + c.type + '] = "' + c.label + '"') }
      });
    }
    // 9. LEADERBOARD
    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const range = (req.body.range || 'today');
      const bd = businessDayPKT(); let from = bd.from, to = bd.to;
      if (range !== 'today') {
        const days = range === 'week' ? 7 : 30;
        const pkt = new Date(Date.now() + 5*3600000);
        const end = pkt.toISOString().slice(0,10);
        const start = new Date(pkt.getTime() - (days-1)*86400000).toISOString().slice(0,10);
        from = start + ' 00:00:00'; to = end + ' 23:59:59';
      }
     const rows = await getCachedCDR(from, to, range === 'today' ? CDR_TTL : CDR_TTL_WIDE);
      const counts = {};
      rows.forEach(r => { const c = r.client || 'Unknown'; if (c) counts[c] = (counts[c]||0) + 1; });
      const users = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([username,count]) => ({ username, count }));
      return ok(res, { users, range });
    }

    // 10. CLIENTS LIST
    if (url === '/clients/list' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      try {
        await ensureAgentSession();
        const response = await axios.get(`${AGENT_BASE_URL}res/data_clients.php`, {
          params: { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' },
          headers: browserHeaders('http://51.210.208.26/ints/agent/Clients'), timeout: 10000, maxRedirects: 5, validateStatus: () => true
        });
        if (response.data && response.data.aaData) {
          const clients = response.data.aaData.map(client => {
            const idMatch = (client[0] || '').match(/value="(\d+)"/);
            return { id: idMatch ? idMatch[1] : (client[1] || '0'), username: client[1] || '', name: client[2] || '', panelNum: 1 };
          });
          return ok(res, { clients });
        }
        return ok(res, { clients: [] });
      } catch (err) { return error(res, 500, 'Failed to fetch clients'); }
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};

// Cleanup old DOR files
setInterval(() => {
  try {
    const now = new Date();
    const keepDate = new Date(now.setDate(now.getDate() - 7));
    const keepStr = keepDate.toISOString().split('T')[0];
    const tmpDir = '/tmp';
    if (fs.existsSync(tmpDir)) {
      fs.readdirSync(tmpDir).forEach(file => { if (file.startsWith('dor-') && file < `dor-${keepStr}.json`) fs.unlinkSync(path.join(tmpDir, file)); });
    }
  } catch (e) {}
}, 24 * 60 * 60 * 1000);
