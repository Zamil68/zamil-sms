const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const jwt = require('jsonwebtoken');

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

      const cleanStrip = s => (s || '').replace(/<[^>]*>/g, '').trim();
      const want = rawUsername.toLowerCase();
      const fallback = {
        'muzammil62': { clientId: '0', clientName: 'Agent', panelNum: 1 },
        'zml_ahsan':  { clientId: '169269', clientName: 'ZML_Ahsan', panelNum: 1 },
        'zml_anns':   { clientId: '169270', clientName: 'ZML_Anns', panelNum: 1 }
      };

      let clientsSeen = 0; const sampleUsernames = [];
      await ensureAgentSession();
      try {
        const fetchClients = async () => (await axios.get(`${AGENT_BASE_URL}res/data_clients.php`, {
          params: { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' },
          headers: browserHeaders('http://51.210.208.26/ints/agent/Clients'),
          timeout: 10000, maxRedirects: 5, validateStatus: () => true
        })).data;
        let cd = await fetchClients();
        if (looksLikeLogin(cd)) { await ensureAgentSession(true); cd = await fetchClients(); }
        if (cd && Array.isArray(cd.aaData)) {
          clientsSeen = cd.aaData.length;
          cd.aaData.slice(0, 8).forEach(c => sampleUsernames.push(cleanStrip(c[1])));
          // 🔥 match by username (col 1) OR name (col 2)
          const found = cd.aaData.find(c => cleanStrip(c[1]).toLowerCase() === want || cleanStrip(c[2]).toLowerCase() === want);
          if (found) {
            const idMatch = (found[0] || '').match(/value=["'](\d+)["']/);
            const clientId = idMatch ? idMatch[1] : '0';
            const clientName = cleanStrip(found[2]) || cleanStrip(found[1]) || rawUsername;
            const token = jwt.sign({ username: rawUsername, clientId, clientName, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
            return ok(res, { session: token, username: rawUsername, clientId, clientName, redirect: '/dashboard/dashboard.html' });
          }
        }
      } catch (e) { console.error('Dynamic client lookup failed:', e.message); }

      if (fallback[want]) {
        const u = fallback[want];
        const token = jwt.sign({ username: rawUsername, clientId: u.clientId, clientName: u.clientName, panelNum: u.panelNum }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: u.clientId, clientName: u.clientName, redirect: '/dashboard/dashboard.html' });
      }

      return res.status(401).json({ ok: false, error: 'Client not found in LaMix. Check the username.', _debug: { clientsSeen, sampleUsernames, cookiePrefix: AGENT_COOKIE.slice(0, 18) }, ...corsHeaders });
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
    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const data = await scrapeAgentData('res/data_smsnumbers.php', { frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
      let userNumbers = [];
      if (data && data.aaData) {
        const allNumbers = parseNumbersData(data);
        const target1 = (user.clientName || '').toLowerCase().trim();
        const target2 = (user.username || '').toLowerCase().trim();
        userNumbers = allNumbers.filter(n => { const c = (n.client || '').toLowerCase().trim(); return c && (c === target1 || c === target2 || c.includes(target1) || c.includes(target2)); }).map(n => n.number);
      }
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(LAMIX_API_URL, { params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 500 } });
      let allSms = [];
      if (Array.isArray(response.data.records)) allSms = response.data.records;
      else if (Array.isArray(response.data)) allSms = response.data;
      const userSms = allSms.filter(sms => { const num = String(sms.num || sms.number || '').replace(/[^0-9]/g, ''); return userNumbers.some(un => un.replace(/[^0-9]/g, '') === num); });
      return ok(res, { count: userSms.length, recent: userSms.map(s => ({ time: s.dt ? s.dt.split(' ')[1] : '', number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text })) });
    }

    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { count: 0 });
    }

    if (url === '/dor' && req.method === 'POST') {
      return ok(res, await getSmartDOR());
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

    // 8. ALLOCATE (real post + before/after proof)
    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const rangeId = String(req.body.rangeId || '').trim();
      const quantity = parseInt(req.body.quantity) || parseInt(req.body.qty) || 1;
      const payout = parseFloat(req.body.payout) || 0.01;

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
        allocated: quantity, used: afterAny - beforeAny, remaining: available, limit: total,
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
      const dorData = await getSmartDOR();
      const cliCounts = {};
      dorData.recent.forEach(sms => { const cli = sms.cli || 'Unknown'; cliCounts[cli] = (cliCounts[cli] || 0) + 1; });
      const top10 = Object.entries(cliCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cli, count]) => ({ username: cli, count }));
      return ok(res, { users: top10 });
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
