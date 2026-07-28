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
let AGENT_COOKIE = 'PHPSESSID=bd51a90a169f206256b1d9187d81613e'; // starting point; auto-refreshed
let _cookieTs = 0;        // when we last got a fresh cookie
let _lastLoginTry = 0;    // throttle login attempts
const AGENT_USER = 'muzammil62';
const AGENT_PASS = 'Zamil6262#$&#$&@';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

async function ensureAgentSession(force) {
  const fresh = (Date.now() - _cookieTs) < 20 * 60 * 1000;          // treat cookie as fresh for 20 min
  if (!force && fresh && AGENT_COOKIE) return AGENT_COOKIE;
  if (!force && (Date.now() - _lastLoginTry) < 60 * 1000) return AGENT_COOKIE; // throttle retries
  _lastLoginTry = Date.now();
  const urls = [
    `${AGENT_BASE_URL}signin`,
    'http://51.210.208.26/ints/signin',
    `${AGENT_BASE_URL}login`,
    'http://51.210.208.26/ints/agent/'
  ];
  for (const u of urls) {
    try {
      const res = await axios.post(u, new URLSearchParams({ username: AGENT_USER, password: AGENT_PASS }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'Referer': 'http://51.210.208.26/ints/agent/', 'Origin': 'http://51.210.208.26' },
        maxRedirects: 0, validateStatus: () => true, timeout: 10000
      });
      const sc = res.headers['set-cookie'];
      console.log('[agent-login]', u, 'status=' + res.status, sc ? 'set-cookie:YES' : 'set-cookie:no');
      if (sc) {
        const joined = Array.isArray(sc) ? sc.join('; ') : String(sc);
        const m = joined.match(/PHPSESSID=([^;]+)/);
        if (m) { AGENT_COOKIE = 'PHPSESSID=' + m[1]; _cookieTs = Date.now(); console.log('[agent-login] cookie refreshed OK'); return AGENT_COOKIE; }
      }
    } catch (e) { console.log('[agent-login] error', u, e.message); }
  }
  console.log('[agent-login] no endpoint returned a fresh cookie — keeping current');
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
  const pkt = new Date(Date.now() + 5*3600000);          // now in PKT
  const hh  = pkt.getUTCHours();
  const base = new Date(pkt.getTime() - (hh < 5 ? 1 : 0) * 86400000);   // active business day (rolls 05:00)
  const label = base.toISOString().slice(0,10);
  const next  = new Date(base.getTime() + 86400000).toISOString().slice(0,10);
  return { from: label + ' 05:00:00', to: next + ' 05:00:00', label };
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
function lbName(x){ const c=String(x||'').trim(); if(!c||c==='null'||c==='none'||c==='-'||c==='--'||c==='n/a') return 'System Generated'; return c; }

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
let _statsCache = { ts: 0, data: null };
const _rangesCache = new Map();   // username -> { ts, ranges }  (20s server cache)
const _asCache = new Map();   // per-query search cache (8s)
const STATS_TTL = 60000; // 60s

const COUNTRY_ISO = { 'pakistan':'PK','sri lanka':'LK','malaysia':'MY','myanmar':'MM','afghanistan':'AF','tajikistan':'TJ','tanzania':'TZ','kyrgyzstan':'KG','uzbekistan':'UZ','sudan':'SD','angola':'AO','algeria':'DZ','zimbabwe':'ZW','bolivia':'BO','india':'IN','bangladesh':'BD','nepal':'NP','indonesia':'ID','philippines':'PH','vietnam':'VN','thailand':'TH','cambodia':'KH','egypt':'EG','nigeria':'NG','kenya':'KE','uganda':'UG','ghana':'GH','south africa':'ZA','brazil':'BR','mexico':'MX','united states':'US','usa':'US','united kingdom':'GB','germany':'DE','france':'FR','spain':'ES','italy':'IT','russia':'RU','turkey':'TR','iran':'IR','iraq':'IQ','saudi arabia':'SA','united arab emirates':'AE','qatar':'QA','kuwait':'KW','jordan':'JO','lebanon':'LB','morocco':'MA','tunisia':'TN','libya':'LY','ethiopia':'ET','somalia':'SO','rwanda':'RW','zambia':'ZM','mozambique':'MZ','botswana':'BW','namibia':'NA','senegal':'SN','mali':'ML','niger':'NE','benin':'BJ','togo':'TG','burkina faso':'BF','guinea':'GN','ivory coast':'CI','cameroon':'CM','congo':'CG','gabon':'GA','madagascar':'MG','malawi':'MW','kazakhstan':'KZ','azerbaijan':'AZ','armenia':'AM','georgia':'GE','ukraine':'UA','poland':'PL','romania':'RO','greece':'GR','netherlands':'NL','belgium':'BE','switzerland':'CH','sweden':'SE','norway':'NO','denmark':'DK','finland':'FI','ireland':'IE','canada':'CA','australia':'AU','new zealand':'NZ','japan':'JP','south korea':'KR','china':'CN','singapore':'SG','argentina':'AR','chile':'CL','colombia':'CO','peru':'PE','venezuela':'VE','ecuador':'EC','paraguay':'PY','uruguay':'UY','panama':'PA','costa rica':'CR','guatemala':'GT','honduras':'HN','cuba':'CU','dominican republic':'DO','haiti':'HT','jamaica':'JM','portugal':'PT','austria':'AT','belarus':'BY','hungary':'HU','czechia':'CZ','slovakia':'SK','bulgaria':'BG','serbia':'RS','croatia':'HR','yemen':'YE','oman':'OM','bahrain':'BH','syria':'SY','mongolia':'MN','laos':'LA','bhutan':'BT','maldives':'MV','fiji':'FJ' };
function isoToFlag(iso){ return String(iso||'').toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0))); }
function countryFlag(name){
  const s = ' ' + String(name||'').toLowerCase();
  let best='', bestLen=0;
  for (const k in COUNTRY_ISO){ const re = new RegExp(' ' + k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?![a-z])'); if (re.test(s) && k.length>bestLen){ best=k; bestLen=k.length; } }
  return best ? isoToFlag(COUNTRY_ISO[best]) : '🏳️';
}

// ═══════════════════════════════════════════════════════════
// 👥 TEAMS — prefixes (super assigns) + cached, scoped client list
// A client's team is derived from its username prefix, so creation
// auto-assigns the team later with no extra mapping table.
// ═══════════════════════════════════════════════════════════
let _clientsCache = { ts: 0, data: null };
async function getCachedClients(force) {
  if (!force && _clientsCache.data && (Date.now() - _clientsCache.ts) < 60000) return _clientsCache.data;
  const data = await scrapeAgentData('res/data_clients.php', { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' });
  let list = [];
  if (data && data.aaData) {
    list = data.aaData.map(c => {
      const rowHtml = (c || []).join(' ');
      const idMatch   = String(c[0] || '').match(/value=["']?(\d+)["']?/);
      const eidMatch  = rowHtml.match(/action=remove&(?:amp;)?eid=([^\s"'&<>]+)/);
      const editMatch = rowHtml.match(/id=["']edit["'][^>]*?info=["']([^"']+)["']/) || rowHtml.match(/info=["']([^"']+)["'][^>]*?id=["']edit["']/);
      return {
        id: idMatch ? idMatch[1] : String(c[1] || '0'),
        username: String(c[1] || '').replace(/<[^>]*>/g, '').trim(),
        name: String(c[2] || '').replace(/<[^>]*>/g, '').trim(),
        removeEid: eidMatch ? decodeURIComponent(eidMatch[1]) : '',
        editInfo: editMatch ? editMatch[1] : '',
        panelNum: 1
      };
    }).filter(c => c.username);
  }
  _clientsCache = { ts: Date.now(), data: list };
  return list;
}
async function supaGetPrefixes() {
  if (!supaEnabled()) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/team_prefixes?select=prefix,admin_username,label&order=prefix.asc`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    const rows = await r.json(); return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}
function prefixesFor(role, username, all) {
  if (role === 'super') return all;
  const u = String(username).toLowerCase();
  return all.filter(p => String(p.admin_username).toLowerCase() === u);
}
function teamOf(username, all) {
  const un = String(username || '');
  const sorted = all.slice().sort((a, b) => (b.prefix || '').length - (a.prefix || '').length); // longest prefix wins
  for (const p of sorted) { if (p.prefix && un.indexOf(p.prefix) === 0) return p.prefix; }
  return '';
}

function weekKey(dateStr){
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  return new Date(d.getTime() + diff * 86400000).toISOString().slice(0, 10);
}

// ═══ TEAM HELPERS (must be top-level, above module.exports) ═══
let _pinsCache = { ts: 0, map: null };
async function getPinsMap() {
  if (_pinsCache.map && (Date.now() - _pinsCache.ts) < 30000) return _pinsCache.map;
  const map = {};
  if (supaEnabled()) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/client_team_pins?select=username,prefix`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      const rows = await r.json();
      if (Array.isArray(rows)) rows.forEach(x => { map[String(x.username).toLowerCase()] = x.prefix; });
    } catch (e) {}
  }
  _pinsCache = { ts: Date.now(), map };
  return map;
}
function invalidatePins() { _pinsCache = { ts: 0, map: null }; }
function prefixTeam(username, allPrefixes) {
  const un = String(username || '').toLowerCase();
  const sorted = allPrefixes.slice().sort((a, b) => (b.prefix || '').length - (a.prefix || '').length);
  for (const p of sorted) { const pf = String(p.prefix || '').toLowerCase(); if (pf && un.indexOf(pf) === 0) return p.prefix; }
  return '';
}
function resolveTeam(username, allPrefixes, pinsMap) {
  const un = String(username || '').toLowerCase();
  const pin = pinsMap ? pinsMap[un] : null;
  if (pin) { const m = allPrefixes.find(p => String(p.prefix || '').toLowerCase() === String(pin).toLowerCase()); if (m) return m.prefix; }
  return prefixTeam(username, allPrefixes);
}
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  return new Date(d.getTime() + diff * 86400000).toISOString().slice(0, 10);
}

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
      const force = !!req.body.forceRefresh;
      const ck = 'u:' + String(user.username).toLowerCase();
      const hit = _rangesCache.get(ck);
      if (!force && hit && hit.ranges.length && (Date.now() - hit.ts) < 20000) return ok(res, { ranges: hit.ranges, cached: true });

      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange:'', fclient:'', totnum:100000, sEcho:1, iColumns:8, iDisplayStart:0, iDisplayLength:100000, sSearch:'', bRegex:false, iSortingCols:1 });
      let ranges = [];
      if (data && data.aaData) {
        const allNumbers = parseNumbersData(data);
        const t1 = (user.clientName||'').toLowerCase().trim(), t2 = (user.username||'').toLowerCase().trim();
        const userNumbers = allNumbers.filter(n => { const c=(n.client||'').toLowerCase().trim(); return c && (c===t1||c===t2||c.includes(t1)||c.includes(t2)); });
        const m = new Map();
        userNumbers.forEach(n => {
          const key = `${n.country} -- ${n.range}`;
          if (!m.has(key)) m.set(key, { id: 'r_' + norm(n.country + '|' + n.range), title: n.range, country: n.country, count: 0 }); // ← STABLE id
          m.get(key).count++;
        });
        ranges = Array.from(m.values()).map(r => ({ ...r, minsAgo: Math.floor(Math.random()*60) }));
      }
      if (ranges.length) _rangesCache.set(ck, { ts: Date.now(), ranges });
      else if (hit && hit.ranges.length) return ok(res, { ranges: hit.ranges, cached: true, _note: 'live scrape empty — using cache' });
      return ok(res, { ranges });
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
      const range = (req.body.range || 'today');
      const bd = businessDayPKT(); const today = bd.label;
      const dayBack = (n) => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
      let from, to;
      if (range === 'week')       { from = dayBack(6)  + ' 00:00:00'; to = today + ' 23:59:59'; }
      else if (range === 'month') { from = dayBack(29) + ' 00:00:00'; to = today + ' 23:59:59'; }
      else                        { from = bd.from;                  to = bd.to; }
      const rows = await getCachedCDR(from, to, range === 'today' ? CDR_TTL : CDR_TTL_WIDE);
      const mine = rows.filter(r => isMine(r.client, user));
      const byNumber = {}, byRange = {};
      mine.forEach(r => { const n = (r.number||'').replace(/[^0-9]/g,''); if (n) byNumber[n] = (byNumber[n]||0)+1; if (r.range) byRange[r.range] = (byRange[r.range]||0)+1; });
      return ok(res, { count: mine.length, byNumber, byRange });
    }

        if (url === '/dor' && req.method === 'POST') {
      const bd = businessDayPKT();
      const rows = await getCachedCDR(bd.from, bd.to);
      rows.sort((a, b) => b.datetime.localeCompare(a.datetime));
      return ok(res, { date: bd.label, total: rows.length, recent: rows.slice(0, 200).map(r => ({ time: r.time, datetime: r.datetime, number: r.number, cli: r.cli, client: r.client, message: r.message, range: r.range })) });
    }

    // 6. SEARCH RANGES (real ids + available counts)
      if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const rawQ = String(req.body.query || '');
      const query = rawQ.toLowerCase().replace(/[\s ​-‍﻿]+/g, ' ').trim();   // strip normal + non-breaking + zero-width spaces
      const qns = query.replace(/\s+/g, '');                                  // whitespace-free form for tolerant matching
      const ch = _asCache.get(query);
      if (ch && (Date.now() - ch.ts) < 8000) return ok(res, { ranges: ch.ranges, _debug: Object.assign({}, ch._debug, { cached: true }) });

      const now = Date.now();
      let mapped = null, _src = 'live';
      // 30s cache of the FULL mapped list → every search is instant AND a flaky scrape can't blank the results
      if (_allocFullCache.mapped && (now - _allocFullCache.ts) < 30000) { mapped = _allocFullCache.mapped; _src = 'mapcache'; }
      else {
        let data = await scrapeAgentData('res/data_smsnumbers.php', { frange:'', fclient:'', totnum:100000, sEcho:1, iColumns:8, iDisplayStart:0, iDisplayLength:100000, sSearch:'', bRegex:false, iSortingCols:1 });
        if (!data || !data.aaData) { await ensureAgentSession(true); data = await scrapeAgentData('res/data_smsnumbers.php', { frange:'', fclient:'', totnum:100000, sEcho:1, iColumns:8, iDisplayStart:0, iDisplayLength:100000, sSearch:'', bRegex:false, iSortingCols:1 }); }
        if (data && data.aaData) {
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
          rangesMap.forEach(r => {
            const cands = [norm(`${r.country} - ${r.title}`), norm(r.title), norm(`${r.country}${r.title}`), norm(`${r.title} - ${r.country}`)];
            let id = null;
            for (const c of cands) { if (c && rangeOpts.has(c)) { id = rangeOpts.get(c); break; } }
            if (!id) { const nt = norm(r.title); for (const k of optKeys) { if (k && nt && (k.includes(nt) || nt.includes(k))) { id = rangeOpts.get(k); break; } } }
            if (!id) { const nc = norm(r.country); const nt = norm(r.title); if (nc.length >= 4) for (const k of optKeys) { if (k && k.includes(nc) && nt && k.includes(nt.slice(0, 6))) { id = rangeOpts.get(k); break; } } }
            if (id) r.id = id;
          });
          let i = 0; rangesMap.forEach(r => { if (!r.id) r.id = 'alloc_' + (i++); });
          mapped = Array.from(rangesMap.values());
          _allocFullCache = { ts: now, mapped };
        } else if (_allocFullCache.mapped) { mapped = _allocFullCache.mapped; _src = 'mapcache-fallback'; }   // flaky scrape → use last good list
      }
      if (!mapped) { if (ch) return ok(res, { ranges: ch.ranges, _debug: Object.assign({}, ch._debug, { cached: true }) }); return ok(res, { ranges: [], _debug: 'No data from LaMix' }); }

      // tolerant filter: compare whitespace-stripped strings so "Tanzania", "Tanzania ", "Tanzania "(nbsp) and "Tanz" ALL match
      const filtered = mapped.filter(r => {
        if (!query) return true;
        const hay = (r.country + ' ' + r.title).toLowerCase();
        const hayNs = hay.replace(/\s+/g, '');
        if (hay.includes(query) || hayNs.includes(qns)) return true;
        const toks = query.split(/\s+/).filter(Boolean);
        if (toks.length > 1 && toks.every(t => hay.includes(t))) return true;   // "sri lanka" etc.
        return false;
      });
      const withAvail = filtered.filter(r => r.available > 0);
      const result = withAvail.length ? withAvail : filtered;   // always show the country (free first; else the "not available" rows so the user sees it exists)
      const _debug = { query, qns, src: _src, totalMapped: mapped.length, rangesFound: filtered.length, withAvailable: withAvail.length, returned: result.length };
      if (result.length) _asCache.set(query, { ts: now, ranges: result, _debug });
      return ok(res, { ranges: result, _debug });
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
      const role = await getRole(user.username);
      const r = await countDailyAllocByCountry(user.username, user.clientName);
      const countryUsed = r.byCountry[country] || 0;
      const rangeUsed = (r.byRange && r.byRange[rangeId]) || 0;
      if (isAdminish(role)) {
        // 🔓 admin / super → no limit; keep the button enabled
        return ok(res, { country, rangeUsed, rangeLimit: 999, countryUsed, countryLimit: 999, remaining: 999, exempt: true, byCountry: r.byCountry, _src: r._src||'none' });
      }
      const remaining = supaEnabled() ? Math.max(0, Math.min(RANGE_CAP - rangeUsed, COUNTRY_CAP - countryUsed)) : COUNTRY_CAP;
      return ok(res, { country, rangeUsed, rangeLimit:RANGE_CAP, countryUsed, countryLimit:COUNTRY_CAP, remaining, byCountry:r.byCountry, _src:r._src||'none' });
    }

if (url === '/stats' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      if (_statsCache.data && (Date.now() - _statsCache.ts) < STATS_TTL) return ok(res, _statsCache.data);

      const bd = businessDayPKT();
      const today = bd.label;
      const dayBack = (n) => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);

      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange:'', fclient:'', totnum:100000, sEcho:1, iColumns:8, iDisplayStart:0, iDisplayLength:100000, sSearch:'', bRegex:false, iSortingCols:1 });
      let totalNumbers = 0, allocated = 0, available = 0; const rangesSet = new Set(); const countryMap = {};
      if (data && data.aaData) {
        const rows = parseNumbersData(data);
        totalNumbers = rows.length;
        rows.forEach(n => {
          if (n.range) rangesSet.add(n.range);
          const ctry = _countryOfRange(n.range).replace(/^\d+\s*-\s*/, '').trim() || 'Other';
          const key = ctry.toLowerCase();
          if (!countryMap[key]) countryMap[key] = { country: ctry, flag: countryFlag(ctry), ranges: {} };
          const rn = n.range || 'Unknown';
          if (!countryMap[key].ranges[rn]) countryMap[key].ranges[rn] = { range: rn, available: 0, total: 0 };
          countryMap[key].ranges[rn].total++;
          if (isAvailableClient(n.client)) { available++; countryMap[key].ranges[rn].available++; } else allocated++;
        });
      }
      const countries = Object.values(countryMap).map(c => ({ country: c.country, flag: c.flag, ranges: Object.values(c.ranges).sort((a,b)=> b.available - a.available) })).sort((a,b)=> a.country.localeCompare(b.country));

      const [todayRows, weekRows, monthRows] = await Promise.all([
        getCachedCDR(bd.from, bd.to),
        getCachedCDR(dayBack(6)  + ' 05:00:00', today + ' 23:59:59'),
        getCachedCDR(dayBack(29) + ' 05:00:00', today + ' 23:59:59')
      ]);
      const otpToday = todayRows.length, otpWeek = weekRows.length, otpMonth = monthRows.length;
      const rangeCounts = {}; todayRows.forEach(r => { if (r.range) rangeCounts[r.range] = (rangeCounts[r.range]||0)+1; });
      let mostActiveRange = '—', mostActiveCount = 0;
      Object.entries(rangeCounts).forEach(([rg,c]) => { if (c > mostActiveCount){ mostActiveCount = c; mostActiveRange = rg; } });

      const result = { totalCountries: countries.length, totalRanges: rangesSet.size, totalNumbers, allocated, available, otpToday, otpWeek, otpMonth, mostActiveRange, mostActiveCount, countries };
      _statsCache = { ts: Date.now(), data: result };
      return ok(res, result);
    }

  if (url === '/admin/admins' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?select=username,role,added_by,created_at&order=created_at.asc`, { headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } });
        const rows = await r.json();
        return ok(res, { admins: Array.isArray(rows) ? rows : [] });
      } catch(e){ return error(res, 500, 'Failed to load admins'); }
    }
    if (url === '/admin/promote' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const target = String(req.body.username||'').trim().toLowerCase();
      if (!target) return error(res, 400, 'Username required');
      if (target === SUPER_ADMIN) return error(res, 400, 'Cannot modify the super admin');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, { method:'POST', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ username: target, role:'admin', added_by: user.username }) });
        _roleCache.delete(target);
        return ok(res, { message: target + ' is now an admin' });
      } catch(e){ return error(res, 500, 'Failed to promote'); }
    }
    if (url === '/admin/demote' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const target = String(req.body.username||'').trim().toLowerCase();
      if (!target) return error(res, 400, 'Username required');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/user_roles?username=eq.${encodeURIComponent(target)}`, { method:'DELETE', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } });
        _roleCache.delete(target);
        return ok(res, { message: target + ' removed' });
      } catch(e){ return error(res, 500, 'Failed to remove'); }
    }

// 👥 list prefixes (super = all; admin = own)
    if (url === '/admin/team-prefixes' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const all = await supaGetPrefixes();
      return ok(res, { prefixes: prefixesFor(role, user.username, all) });
    }
    // 👥 super: assign a prefix to an admin
    if (url === '/admin/set-prefix' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const prefix = String(req.body.prefix || '').trim();
      const adminU = String(req.body.admin || '').trim().toLowerCase();
      if (!prefix || !adminU) return error(res, 400, 'prefix and admin username required');
      if (!/^[A-Za-z0-9_]+$/.test(prefix)) return error(res, 400, 'prefix: letters/numbers/underscore only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/team_prefixes`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ prefix, admin_username: adminU, label: req.body.label || '' }) });
        return ok(res, { message: prefix + ' assigned to ' + adminU });
      } catch (e) { return error(res, 500, 'Failed to set prefix'); }
    }
    // 👥 super: remove a prefix
    if (url === '/admin/del-prefix' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const prefix = String(req.body.prefix || '').trim();
      if (!prefix) return error(res, 400, 'prefix required');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/team_prefixes?prefix=eq.${encodeURIComponent(prefix)}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        return ok(res, { message: prefix + ' removed' });
      } catch (e) { return error(res, 500, 'Failed to remove prefix'); }
    }
    // 👥 cached client list, scoped to the caller's team(s); super = all grouped
    if (url === '/admin/my-clients' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const force = !!req.body.force;
      const allClients = await getCachedClients(force);
      const allPrefixes = await supaGetPrefixes();
      const pinsMap = await getPinsMap();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      const mySet = new Set(myPrefixes.map(p => p.prefix));
      const scoped = (role === 'super') ? allClients : allClients.filter(c => mySet.has(resolveTeam(c.username, allPrefixes, pinsMap)));
      const groups = {};
      myPrefixes.forEach(p => { groups[p.prefix] = { prefix: p.prefix, admin: p.admin_username, label: p.label || '', clients: [] }; });
      if (role === 'super') groups[''] = { prefix: '', admin: '—', label: 'System Generated', clients: [] };
      scoped.forEach(c => {
        const team = resolveTeam(c.username, allPrefixes, pinsMap);
        const key = (role === 'super') ? (team || '') : team;
        if (groups[key]) {
          const pinned = (key !== '' && prefixTeam(c.username, allPrefixes) !== key);
          groups[key].clients.push(Object.assign({}, c, { pinned }));
        }
      });
      const teams = Object.values(groups).map(g => ({ prefix: g.prefix, admin: g.admin, label: g.label, count: g.clients.length, clients: g.clients }));
      return ok(res, { teams, total: scoped.length, cached: !force });
    }

// 👥 CREATE a client on LaMix (admin: own prefix only; super: any prefix)
    if (url === '/admin/create-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');

      const suffix = String(req.body.suffix || '').trim();
      let prefix = String(req.body.prefix || '').trim();
      const password = String(req.body.password || '').trim();
      const name = String(req.body.name || '').trim();

      const allPrefixes = await supaGetPrefixes();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      if (!prefix) {
        if (myPrefixes.length === 1) prefix = myPrefixes[0].prefix;
        else return error(res, 400, 'Select a team prefix first.');
      }
      if (role !== 'super' && !myPrefixes.some(p => p.prefix === prefix)) {
        return error(res, 403, 'You can only create IDs under your own team prefix.');
      }

      const username = prefix + suffix;
      if (!/^[A-Za-z0-9_]{6,15}$/.test(username)) {
        const minS = Math.max(1, 6 - prefix.length), maxS = 15 - prefix.length;
        return error(res, 400, 'Username must be 6–15 chars (letters/numbers/_). With prefix "' + prefix + '", the suffix must be ' + minS + '–' + maxS + ' characters.');
      }
      const finalPass = password || username;
      if (finalPass.length < 6) return error(res, 400, 'Password must be at least 6 characters.');

      const before = await getCachedClients(true);
      if (before.some(c => c.username.toLowerCase() === username.toLowerCase())) {
        return error(res, 400, 'Username "' + username + '" already exists.');
      }

      await ensureAgentSession();
      const fields = { action: 'add', username, password: finalPass, email: '', skype: '', contact: '', name: name || username, cname: '', address: '', country: 'Pakistan' };
      const boundary = '----ZamilClientBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
      let body = '';
      for (const [k, v] of Object.entries(fields)) body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
      body += '--' + boundary + '--\r\n';
      const postCreate = () => axios.post(AGENT_BASE_URL + 'Clients', body, {
        headers: Object.assign({}, browserHeaders('http://51.210.208.26/ints/agent/Clients'), { 'Content-Type': 'multipart/form-data; boundary=' + boundary }),
        transformRequest: [(d) => d], maxRedirects: 5, validateStatus: () => true, timeout: 25000
      });
      let serverStatus = null, serverBody = '';
      try {
        let postRes = await postCreate();
        if (looksLikeLogin(postRes.data)) { await ensureAgentSession(true); postRes = await postCreate(); }
        serverStatus = postRes.status;
        serverBody = (postRes.data == null ? '' : String(typeof postRes.data === 'string' ? postRes.data : JSON.stringify(postRes.data)));
      } catch (e) { return error(res, 500, 'LaMix request failed: ' + (e.code || e.message)); }

      const after = await getCachedClients(true);
      const created = after.find(c => c.username.toLowerCase() === username.toLowerCase());
      const saidOk = /client added/i.test(serverBody);
      if (created || saidOk) {
        return ok(res, { message: 'Created ' + username, username, clientId: created ? created.id : null, _server: 'HTTP ' + serverStatus + (saidOk ? ' · "Client Added"' : '') });
      }
      const snippet = serverBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
      return error(res, 400, 'LaMix did not confirm creation (HTTP ' + serverStatus + '). ' + (snippet || 'Check the username/password rules.'));
    }

    // 👥 DELETE a client from LaMix (admin: own team only; super: any)
    if (url === '/admin/delete-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const clientId = String(req.body.clientId || '').trim();
      const targetUsername = String(req.body.username || '').trim();
      const before = await getCachedClients(true);
      let target = clientId ? before.find(c => String(c.id) === clientId) : null;
      if (!target && targetUsername) target = before.find(c => c.username.toLowerCase() === targetUsername.toLowerCase());
      if (!target) return error(res, 404, 'Client not found.');
      if (role !== 'super') {
        const myPrefixes = prefixesFor(role, user.username, await supaGetPrefixes());
        if (!myPrefixes.some(p => p.prefix && target.username.indexOf(p.prefix) === 0)) return error(res, 403, 'You can only delete clients in your own team.');
      }
      // eid = scraped server token if present, else base64(username) (the panel's encoding)
      let eid = target.removeEid || '';
      if (!eid) { try { eid = Buffer.from(target.username, 'utf8').toString('base64'); } catch (e) { eid = ''; } }
      if (!eid) return error(res, 400, 'Could not build delete token for this client.');
      await ensureAgentSession();
      const doReq = () => axios.get(AGENT_BASE_URL + 'Clients', { params: { action: 'remove', eid }, headers: browserHeaders('http://51.210.208.26/ints/agent/Clients'), maxRedirects: 5, validateStatus: () => true, timeout: 20000 });
      let serverStatus = null;
      try {
        let r = await doReq();
        if (looksLikeLogin(r.data)) { await ensureAgentSession(true); r = await doReq(); }
        serverStatus = r.status;
      } catch (e) { return error(res, 500, 'Delete request failed: ' + (e.code || e.message)); }
      const after = await getCachedClients(true);
      const gone = !after.some(c => String(c.id) === String(target.id));
      if (gone) return ok(res, { message: 'Deleted ' + target.username, username: target.username });
      return error(res, 400, 'LaMix did not confirm deletion (HTTP ' + serverStatus + '). The client may still exist.');
    }

    if (url === '/admin/pin-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      const username = String(req.body.username || '').trim();
      const prefix = String(req.body.prefix || '').trim();
      if (!username || !prefix) return error(res, 400, 'username and prefix required');
      const allPrefixes = await supaGetPrefixes();
      if (!allPrefixes.some(p => p.prefix === prefix)) return error(res, 400, 'Unknown team prefix.');
      if (role !== 'super') {
        const myPrefixes = prefixesFor(role, user.username, allPrefixes);
        if (!myPrefixes.some(p => p.prefix === prefix)) return error(res, 403, 'You can only pin users into your own team.');
      }
      const clients = await getCachedClients(false);
      if (!clients.some(c => c.username.toLowerCase() === username.toLowerCase())) return error(res, 404, 'User not found in the panel.');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/client_team_pins`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ username: username.toLowerCase(), prefix, pinned_by: user.username }) });
        invalidatePins();
        return ok(res, { message: username + ' pinned to ' + prefix });
      } catch (e) { return error(res, 500, 'Failed to pin'); }
    }
    if (url === '/admin/unpin-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      const username = String(req.body.username || '').trim().toLowerCase();
      if (!username) return error(res, 400, 'username required');
      const pinsMap = await getPinsMap();
      const pin = pinsMap[username];
      if (!pin) return error(res, 400, 'That user is not pinned.');
      if (role !== 'super') {
        const allPrefixes = await supaGetPrefixes();
        const myPrefixes = prefixesFor(role, user.username, allPrefixes);
        if (!myPrefixes.some(p => String(p.prefix).toLowerCase() === String(pin).toLowerCase())) return error(res, 403, 'You can only unpin users from your own team.');
      }
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/client_team_pins?username=eq.${encodeURIComponent(username)}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        invalidatePins();
        return ok(res, { message: username + ' unpinned' });
      } catch (e) { return error(res, 500, 'Failed to unpin'); }
    }

    if (url === '/admin/client-details' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const clientId = String(req.body.clientId || '').trim();
      const before = await getCachedClients(false);
      const target = before.find(c => String(c.id) === clientId);
      if (!target) return error(res, 404, 'Client not found.');
      if (role !== 'super') {
        const myPrefixes = prefixesFor(role, user.username, await supaGetPrefixes());
        if (!myPrefixes.some(p => p.prefix && target.username.indexOf(p.prefix) === 0)) return error(res, 403, 'You can only edit clients in your own team.');
      }
      await ensureAgentSession();
      const param = target.editInfo || target.id;
      const fetchForm = () => axios.post(AGENT_BASE_URL + 'res/editclient.php', 'id=' + encodeURIComponent(param), { headers: Object.assign({}, browserHeaders('http://51.210.208.26/ints/agent/Clients'), { 'Content-Type': 'application/x-www-form-urlencoded' }), transformRequest: [(d) => d], maxRedirects: 5, validateStatus: () => true, timeout: 15000 });
      let html = '';
      try { let r = await fetchForm(); if (looksLikeLogin(r.data)) { await ensureAgentSession(true); r = await fetchForm(); } html = String(typeof r.data === 'string' ? r.data : JSON.stringify(r.data || '')); } catch (e) { return error(res, 500, 'Could not load client details: ' + (e.code || e.message)); }
      const $ = cheerio.load(html);
      const val = (n) => { const v = $('input[name="' + n + '"]').val(); return v == null ? '' : String(v); };
      const ta  = (n) => { const v = $('textarea[name="' + n + '"]').val(); return v == null ? '' : String(v); };
      const username = val('username') || target.username;
      if (!username) return error(res, 400, 'Could not read current details for this client.');
      return ok(res, { clientId: target.id, username, email: val('email'), skype: val('skype'), contact: val('contact'), name: val('name'), cname: val('cname'), address: ta('address'), country: $('select[name="country"]').val() || 'Pakistan', active: $('input[name="active"]').is(':checked') });
    }

    if (url === '/admin/edit-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const clientId = String(req.body.clientId || '').trim();
      const username = String(req.body.username || '').trim();
      if (!clientId || !username) return error(res, 400, 'clientId and username required.');
      const before = await getCachedClients(true);
      const target = before.find(c => String(c.id) === clientId);
      if (!target) return error(res, 404, 'Client not found.');
      if (role !== 'super') {
        const myPrefixes = prefixesFor(role, user.username, await supaGetPrefixes());
        if (!myPrefixes.some(p => p.prefix && target.username.indexOf(p.prefix) === 0)) return error(res, 403, 'You can only edit clients in your own team.');
      }
      const fields = { action: 'update', id: clientId, username, password: String(req.body.password || ''), email: String(req.body.email || ''), skype: String(req.body.skype || ''), contact: String(req.body.contact || ''), name: String(req.body.name || ''), cname: String(req.body.cname || ''), address: String(req.body.address || ''), country: String(req.body.country || 'Pakistan') };
      if (req.body.active) fields.active = '1';   // mimic the panel: unchecked => field omitted (keeps current state)
      await ensureAgentSession();
      const boundary = '----ZamilEditBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
      let body = '';
      for (const [k, v] of Object.entries(fields)) body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
      body += '--' + boundary + '--\r\n';
      const doPost = () => axios.post(AGENT_BASE_URL + 'Clients', body, { headers: Object.assign({}, browserHeaders('http://51.210.208.26/ints/agent/Clients'), { 'Content-Type': 'multipart/form-data; boundary=' + boundary }), transformRequest: [(d) => d], maxRedirects: 5, validateStatus: () => true, timeout: 25000 });
      let serverStatus = null, serverBody = '';
      try {
        let r = await doPost();
        if (looksLikeLogin(r.data)) { await ensureAgentSession(true); r = await doPost(); }
        serverStatus = r.status; serverBody = String(typeof r.data === 'string' ? r.data : JSON.stringify(r.data || ''));
      } catch (e) { return error(res, 500, 'Edit request failed: ' + (e.code || e.message)); }
      const saidOk = /client updated|updated successfully|well done/i.test(serverBody);
      if ((serverStatus >= 200 && serverStatus < 400) || saidOk) { _clientsCache = { ts: 0, data: null }; return ok(res, { message: 'Updated ' + username, _server: 'HTTP ' + serverStatus }); }
      const snippet = serverBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
      return error(res, 400, 'LaMix did not confirm update (HTTP ' + serverStatus + '). ' + (snippet || ''));
    }

    if (url === '/admin/team-report' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const force = !!req.body.force;
      const bd = businessDayPKT(); const today = bd.label;
      const dayBack = (n) => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
      const todayRows = await getCachedCDR(bd.from, bd.to, force ? 0 : CDR_TTL_WIDE);
      const weekRows  = await getCachedCDR(dayBack(6) + ' 00:00:00', today + ' 23:59:59', force ? 0 : CDR_TTL_WIDE);
      const allPrefixes = await supaGetPrefixes();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);   // ← ADD THIS LINE
      const pinsMap = await getPinsMap();
      const teamOfClient = (cli) => resolveTeam(cli, allPrefixes, pinsMap);;
      const tally = (rows) => { const m = {}; rows.forEach(r => { const k = teamOfClient(r.client) || '__none__'; m[k] = (m[k] || 0) + 1; }); return m; };
      const tToday = tally(todayRows), tWeek = tally(weekRows);
      const clients = await getCachedClients(false);
      const cCount = {}; clients.forEach(c => { const k = teamOfClient(c.username) || '__none__'; cCount[k] = (cCount[k] || 0) + 1; });
      const build = (p) => ({ prefix: p.prefix, admin: p.admin_username, label: p.label || '', otpToday: tToday[p.prefix] || 0, otpWeek: tWeek[p.prefix] || 0, clients: cCount[p.prefix] || 0 });
      let teams = myPrefixes.map(build);
      if (role === 'super') teams.push({ prefix: '', admin: '—', label: 'System Generated', otpToday: tToday['__none__'] || 0, otpWeek: tWeek['__none__'] || 0, clients: cCount['__none__'] || 0 });
      teams.sort((a, b) => b.otpToday - a.otpToday);
      const hottest = (teams[0] && teams[0].otpToday > 0) ? teams[0] : null;
      return ok(res, { teams, hottest, date: today, cached: !force });
    }

    // 🎯 read the active bonus target (admin + super)
    if (url === '/admin/target-get' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
      if (!supaEnabled()) return ok(res, { config: null });
      try {
        const cr = await fetch(`${SUPABASE_URL}/rest/v1/team_targets?order=updated_at.desc&limit=1&select=*`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        const crows = await cr.json();
        return ok(res, { config: (Array.isArray(crows) && crows[0]) || null });
      } catch (e) { return ok(res, { config: null }); }
    }

    // 🎯 super sets/adjusts the bonus target
    if (url === '/admin/target-set' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      const period = (req.body.period === 'weekly') ? 'weekly' : 'daily';
      const target_otps = Math.max(1, parseInt(req.body.target_otps) || 1000);
      const reward_usd = Math.max(0, parseFloat(req.body.reward_usd) || 0);
      const top_n = Math.max(1, parseInt(req.body.top_n) || 5);
      const note = String(req.body.note || '');
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/team_targets`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ period, target_otps, reward_usd, top_n, note, updated_by: user.username }) });
        return ok(res, { message: 'Target saved' });
      } catch (e) { return error(res, 500, 'Failed to save target'); }
    }

    // 🎯 bonus status: target + qualifiers + caller's team progress/congrats
    if (url === '/admin/team-bonus' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      if (!supaEnabled()) return ok(res, { role, config: null, leaders: [], myTeams: [] });
      let config = null;
      try {
        const cr = await fetch(`${SUPABASE_URL}/rest/v1/team_targets?order=updated_at.desc&limit=1&select=*`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        const crows = await cr.json(); if (Array.isArray(crows) && crows[0]) config = crows[0];
      } catch (e) {}
      if (!config) return ok(res, { role, config: null, leaders: [], myTeams: [] });
      const period = config.period || 'daily';
      const bd = businessDayPKT(); const today = bd.label;
      const dayBack = (n) => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
      const rows = (period === 'weekly') ? await getCachedCDR(dayBack(6) + ' 00:00:00', today + ' 23:59:59', CDR_TTL_WIDE) : await getCachedCDR(bd.from, bd.to, CDR_TTL_WIDE);
      const allPrefixes = await supaGetPrefixes();
      const pinsMap = await getPinsMap();
      const teamOfClient = (cli) => resolveTeam(cli, allPrefixes, pinsMap);
      const otps = {}; rows.forEach(r => { const t = teamOfClient(r.client); if (t) otps[t] = (otps[t] || 0) + 1; });
      const target = Number(config.target_otps) || 0, topN = Number(config.top_n) || 5, reward = Number(config.reward_usd) || 0;
      const windowKey = (period === 'weekly') ? weekKey(today) : today;
      let leaders = allPrefixes.map(p => ({ prefix: p.prefix, admin: p.admin_username, label: p.label || '', otps: otps[p.prefix] || 0 })).filter(t => t.otps > 0).sort((a, b) => b.otps - a.otps);
      leaders.forEach((t, i) => { t.rank = i + 1; t.qualified = (target > 0 && t.otps >= target); });
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      const myTeams = [];
      for (const mp of myPrefixes) {
        const o = otps[mp.prefix] || 0;
        const qualified = (target > 0 && o >= target);
        const rankObj = leaders.find(t => t.prefix === mp.prefix);
        let congrats = false, alreadyAwarded = false;
        if (qualified && role !== 'super') {
          try {
            const ar = await fetch(`${SUPABASE_URL}/rest/v1/bonus_awards?prefix=${encodeURIComponent('eq.' + mp.prefix)}&period=${encodeURIComponent('eq.' + period)}&window_key=${encodeURIComponent('eq.' + windowKey)}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
            const arows = await ar.json();
            if (Array.isArray(arows) && arows.length) alreadyAwarded = true;
            else { await fetch(`${SUPABASE_URL}/rest/v1/bonus_awards`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ prefix: mp.prefix, period, window_key: windowKey, target_otps: target, reward_usd: reward }) }); congrats = true; }
          } catch (e) {}
        }
        myTeams.push({ prefix: mp.prefix, admin: mp.admin_username, label: mp.label || '', otps: o, qualified, rank: rankObj ? rankObj.rank : null, congrats, alreadyAwarded, reward });
      }
      return ok(res, { role, config: { period, target_otps: target, reward_usd: reward, top_n: topN, note: config.note || '' }, windowKey, leaders: leaders.slice(0, Math.max(topN, 10)), myTeams });
    }
    
    
    // 🆓 ADMIN: show a user's at-limit ranges/countries (only those that hit a cap)
    if (url === '/admin/limit-status' && req.method === 'POST') {
      const caller = getUserFromSession(req.body.session);
      if (!caller) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(caller.username))) return error(res, 403, 'Admins only');
      const target = String(req.body.username || '').trim();
      if (!target) return error(res, 400, 'Username required');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        const start = encodeURIComponent('gte.' + _todayStartUTC());
        const r = await fetch(`${SUPABASE_URL}/rest/v1/alloc_events?username=${encodeURIComponent('eq.' + target)}&created_at=${start}&select=id,country,range_id,range_title,created_at&order=created_at.asc`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        const rows = await r.json();
        if (!Array.isArray(rows)) return ok(res, { username: target, ranges: [], countries: [] });
        const byRange = {}, byCountry = {};
        rows.forEach(x => {
          const rk = x.range_id || x.range_title || 'Unknown';
          if (!byRange[rk]) byRange[rk] = { rangeId: x.range_id || '', rangeTitle: x.range_title || rk, country: x.country || '', count: 0, ids: [] };
          byRange[rk].count++; byRange[rk].ids.push(x.id);
          const ck = x.country || 'Unknown';
          if (!byCountry[ck]) byCountry[ck] = { country: ck, count: 0, ids: [] };
          byCountry[ck].count++; byCountry[ck].ids.push(x.id);
        });
        const ranges = Object.values(byRange).filter(o => o.count >= RANGE_CAP).map(o => ({ rangeId: o.rangeId, rangeTitle: o.rangeTitle, country: o.country, used: o.count, limit: RANGE_CAP, ids: o.ids }));
        const countries = Object.values(byCountry).filter(o => o.count >= COUNTRY_CAP).map(o => ({ country: o.country, used: o.count, limit: COUNTRY_CAP, ids: o.ids }));
        return ok(res, { username: target, ranges, countries });
      } catch (e) { return error(res, 500, 'Failed to load status'); }
    }

    // 🆓 ADMIN: free one try = delete ONE alloc_events row (count drops by 1 → +1 attempt)
    if (url === '/admin/free-try' && req.method === 'POST') {
      const caller = getUserFromSession(req.body.session);
      if (!caller) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(caller.username))) return error(res, 403, 'Admins only');
      const target = String(req.body.username || '').trim();
      const rowId = req.body.rowId;
      if (!target || rowId == null) return error(res, 400, 'username and rowId required');
      if (!supaEnabled()) return error(res, 400, 'Supabase not configured');
      try {
        const dayStart = _todayStartUTC();
        // guard: max +3 frees per target per day
        const g = await fetch(`${SUPABASE_URL}/rest/v1/alloc_frees?target=eq.${encodeURIComponent(target)}&created_at=${encodeURIComponent('gte.' + dayStart)}&select=id`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        const granted = await g.json();
        if (Array.isArray(granted) && granted.length >= 3) return error(res, 400, 'Max +3 tries per user per day reached.');
        // delete exactly one alloc_events row (the actual "free a try")
        const del = await fetch(`${SUPABASE_URL}/rest/v1/alloc_events?id=eq.${encodeURIComponent(String(rowId))}&username=eq.${encodeURIComponent(target)}`,
          { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=representation' } });
        const deleted = await del.json();
        if (!Array.isArray(deleted) || !deleted.length) return error(res, 404, 'Row not found (already freed?).');
        // record the grant for the +3/day guard
        await fetch(`${SUPABASE_URL}/rest/v1/alloc_frees`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ target, granted_by: caller.username }) });
        return ok(res, { message: 'Freed 1 try for ' + target, deletedId: rowId });
      } catch (e) { return error(res, 500, 'Failed to free try'); }
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
        from = start + ' 05:00:00'; to = end + ' 05:00:00';
      }
      const rows = await getCachedCDR(from, to, range === 'today' ? CDR_TTL : CDR_TTL_WIDE);
      const counts = {};
      rows.forEach(r => { const c = lbName(r.client); counts[c] = (counts[c]||0) + 1; });
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      const users = sorted.slice(0, 50).map(([username,count]) => ({ username, count }));
      const meKeys = [user.clientName, user.username].map(s=>String(s||'').toLowerCase().trim()).filter(Boolean);
      let me = null;
      for (let i=0;i<sorted.length;i++){ const k=sorted[i][0].toLowerCase(); if (meKeys.some(m=> k===m || k.includes(m) || m.includes(k))){ me = { rank:i+1, username:sorted[i][0], count:sorted[i][1] }; break; } }
      return ok(res, { users, range, me, total: sorted.length });
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
