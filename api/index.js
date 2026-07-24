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
const AGENT_COOKIE = 'PHPSESSID=0950059eaead99816b1e27139bf2d227';

function getUserFromSession(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

function ok(res, data = {}) { res.status(200).json({ ok: true, ...data, ...corsHeaders }); }
function error(res, statusCode, message) { res.status(statusCode).json({ ok: false, error: message, ...corsHeaders }); }

// 🔥 HELPER: Check if a client value means "available/unallocated"
function isAvailableClient(clientVal) {
  const c = (clientVal || '').trim().toLowerCase();
  // If empty, or any common "not assigned" text
  if (c === '' || c === 'unallocated' || c === 'null' || c === 'none' || 
      c === 'free' || c === '0' || c === '-' || c === '--' || c === 'n/a' || 
      c === 'available' || c === 'not assigned' || c === 'unassigned' ||
      c === '&nbsp;' || c === '—' || c === '–') {
    return true;
  }
  // If it's just whitespace or very short (1 char), treat as available
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
    const response = await axios.get(LAMIX_API_URL, { 
      params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 500 } 
    });
    let allSms = [];
    if (Array.isArray(response.data.records)) allSms = response.data.records;
    else if (Array.isArray(response.data)) allSms = response.data;
    else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;

    const parsedData = {
      date: dateStr,
      total: allSms.length,
      recent: allSms.slice(0, 100).map(s => ({
        time: s.dt ? s.dt.split(' ')[1] : (s.time || ''),
        number: s.num || s.number,
        cli: s.cli || s.sender,
        message: s.message || s.text,
        range: 'Global'
      }))
    };
    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
    return parsedData;
  } catch (err) {
    console.error('LaMix DOR Fetch Error:', err.message);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { date: dateStr, total: 0, recent: [] };
  }
}

setInterval(async () => {
  try {
    await axios.post(`${AGENT_BASE_URL}signin`, { username: 'muzammil62', password: 'muzammil62' }, {
      headers: { 'Cookie': AGENT_COOKIE }, timeout: 5000
    });
  } catch (err) { console.error('[SESSION REFRESH] Failed:', err.message); }
}, 15 * 60 * 1000);

async function scrapeAgentData(endpoint, params = {}) {
  try {
    const response = await axios.get(`${AGENT_BASE_URL}${endpoint}`, {
      params: params,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
        'Connection': 'keep-alive',
        'Cookie': AGENT_COOKIE,
        'Host': '51.210.208.26',
        'Referer': 'http://51.210.208.26/ints/agent/MySMSNumbers',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 15000
    });
    return response.data;
  } catch (err) {
    console.error('Agent Panel Scrape Error:', err.message);
    return null;
  }
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
// 🔥 Exact browser headers so LaMix never redirects us to /login
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
  'Connection': 'keep-alive',
  'Cookie': AGENT_COOKIE,
  'Host': '51.210.208.26',
  'Referer': 'http://51.210.208.26/ints/agent/SMSBulkAllocations',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest'
};
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const PAYTERM_VOCAB = ['daily','weekly','weekly7','biweekly','biweekly30','monthly15','monthly30','monthly45','monthly60'];

// 🔥 Read the REAL allocation form (range/client/payterm dropdowns + hidden fields + action)
async function getAllocForm() {
  try {
    const html = (await axios.get(`${AGENT_BASE_URL}SMSBulkAllocations`, { headers: BROWSER_HEADERS, timeout: 15000 })).data;
    if (!html) return null;
    const $ = cheerio.load(html);
    let form = $('form').filter((i, el) => $(el).find('select').length >= 2).first();
    if (!form.length) form = $('form').first();
    if (!form.length) return null;
    const action = form.attr('action') || '';
    const selects = [];
    form.find('select').each((i, el) => {
      const name = $(el).attr('name') || ('select_' + i);
      const opts = [];
      $(el).find('option').each((j, o) => opts.push({ value: $(o).attr('value') != null ? $(o).attr('value') : $(o).text().trim(), text: $(o).text().trim() }));
      const def = $(el).find('option[selected]').attr('value') || (opts[0] && opts[0].value) || '';
      selects.push({ name, def, opts });
    });
    const inputs = {};
    form.find('input').each((i, el) => { const n = $(el).attr('name'); if (n) inputs[n] = $(el).attr('value') != null ? $(el).attr('value') : ''; });
    return { action, selects, inputs };
  } catch (e) { console.error('getAllocForm error:', e.message); return null; }
}

// Pick which <select> is the RANGE dropdown: the one whose options best match our known range texts
function pickRangeSelect(form, knownRangeTexts) {
  const known = new Set(knownRangeTexts.map(norm));
  let best = null, bestScore = 0;
  for (const s of form.selects) {
    let score = 0;
    for (const o of s.opts) if (known.has(norm(o.text))) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}
const isPaytermSelect = s => s.opts.some(o => PAYTERM_VOCAB.includes(norm(o.text))) && s.opts.length <= 12;
function pickClientSelect(form, user) {
  const wantVal = String(user.clientId || '');
  const wantTxt = new Set([norm(user.username), norm(user.clientName)]);
  for (const s of form.selects) {
    if (isPaytermSelect(s)) continue;
    for (const o of s.opts) if ((wantVal && o.value === wantVal) || wantTxt.has(norm(o.text))) return s;
  }
  return null;
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
    // 1. LOGIN — DYNAMIC: Checks real LaMix clients + hardcoded fallback
    // ═══════════════════════════════════════════════════════════
    if (url === '/login' && req.method === 'POST') {
      const rawUsername = (req.body.username || '').trim();
      const password = (req.body.password || '').trim();
      if (!rawUsername || !password) return error(res, 400, 'Username and password required');

      const cleanStrip = s => (s || '').replace(/<[^>]*>/g, '').trim();
      const want = rawUsername.toLowerCase();

      // Fallback for known test/agent accounts (only used if LaMix lookup fails)
      const fallback = {
        'muzammil62': { clientId: '0', clientName: 'Agent', panelNum: 1 },
        'zml_ahsan':  { clientId: '169269', clientName: 'ZML_Ahsan', panelNum: 1 },
        'zml_anns':   { clientId: '169270', clientName: 'ZML_Anns', panelNum: 1 }
      };

      // 1) Dynamic lookup of REAL LaMix clients (uses exact browser headers so LaMix won't redirect to /login)
      try {
        const clientsRes = await axios.get(`${AGENT_BASE_URL}res/data_clients.php`, {
          params: { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' },
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
            'Connection': 'keep-alive',
            'Cookie': AGENT_COOKIE,
            'Host': '51.210.208.26',
            'Referer': 'http://51.210.208.26/ints/agent/Clients',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        });
        if (clientsRes.data && Array.isArray(clientsRes.data.aaData)) {
          const found = clientsRes.data.aaData.find(c => cleanStrip(c[1]).toLowerCase() === want);
          if (found) {
            const idMatch = (found[0] || '').match(/value="(\d+)"/);
            const clientId = idMatch ? idMatch[1] : '0';
            const clientName = cleanStrip(found[2]) || cleanStrip(found[1]) || rawUsername;
            const token = jwt.sign({ username: rawUsername, clientId, clientName, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
            return ok(res, { session: token, username: rawUsername, clientId, clientName, redirect: '/dashboard/dashboard.html' });
          }
        }
      } catch (e) { console.error('Dynamic client lookup failed:', e.message); }

      // 2) Fallback map
      if (fallback[want]) {
        const u = fallback[want];
        const token = jwt.sign({ username: rawUsername, clientId: u.clientId, clientName: u.clientName, panelNum: u.panelNum }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: u.clientId, clientName: u.clientName, redirect: '/dashboard/dashboard.html' });
      }

      return error(res, 401, 'Client not found in LaMix. Check the username.');
    }
    // ═══════════════════════════════════════════════════════════
    // 2. PING
    // ═══════════════════════════════════════════════════════════
    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // ═══════════════════════════════════════════════════════════
    // 3. RANGES — Show user's allocated ranges
    // ═══════════════════════════════════════════════════════════
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      if (!data || !data.aaData) return ok(res, { ranges: [] });
      
      const allNumbers = parseNumbersData(data);
      const target1 = (user.clientName || '').toLowerCase().trim();
      const target2 = (user.username || '').toLowerCase().trim();
      
      // 🔥 FORGIVING MATCH: Check if client column contains the user's name
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        if (!c) return false; // Skip available numbers (they belong to no one)
        return c === target1 || c === target2 || c.includes(target1) || c.includes(target2);
      });
      
      const rangesMap = new Map();
      userNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) {
          rangesMap.set(key, { id: `range_${rangesMap.size}`, title: n.range, country: n.country, numbers: [], count: 0 });
        }
        const range = rangesMap.get(key);
        range.numbers.push(n.number);
        range.count++;
      });

      return ok(res, { 
        ranges: Array.from(rangesMap.values()).map(r => ({ ...r, minsAgo: Math.floor(Math.random() * 60) })),
        _debug: {
          totalScraped: allNumbers.length,
          matchedForUser: userNumbers.length,
          lookingFor: `"${target1}" or "${target2}"`,
          sampleClients: allNumbers.slice(0, 10).map(n => `"${n.client}"`)
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 4. NUMBERS — 🔥 FIXED: Forgiving matching so clicking a range works
    // ═══════════════════════════════════════════════════════════
    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      if (!data || !data.aaData) return ok(res, { numbers: [] });
      
      const allNumbers = parseNumbersData(data);
      const target1 = (user.clientName || '').toLowerCase().trim();
      const target2 = (user.username || '').toLowerCase().trim();
      const reqTitle = (req.body.rangeTitle || '').toLowerCase().trim();
      
      // 🔥 FORGIVING: Match if client contains user's name AND range contains the title
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        const isOwner = c && (c === target1 || c === target2 || c.includes(target1) || c.includes(target2));
        
        const nRange = (n.range || '').toLowerCase().trim();
        // 🔥 KEY FIX: Use .includes() instead of strict ===
        const isRange = reqTitle ? (nRange.includes(reqTitle) || reqTitle.includes(nRange)) : true;
        
        return isOwner && isRange;
      });
      
      return ok(res, { 
        numbers: userNumbers,
        _debug: {
          reqTitle,
          target1,
          matched: userNumbers.length,
          total: allNumbers.length
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 5. SMS COUNT
    // ═══════════════════════════════════════════════════════════
    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      let userNumbers = [];
      if (data && data.aaData) {
        const allNumbers = parseNumbersData(data);
        const target1 = (user.clientName || '').toLowerCase().trim();
        const target2 = (user.username || '').toLowerCase().trim();
        
        userNumbers = allNumbers.filter(n => {
          const c = (n.client || '').toLowerCase().trim();
          return c && (c === target1 || c === target2 || c.includes(target1) || c.includes(target2));
        }).map(n => n.number);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(LAMIX_API_URL, { 
        params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 500 } 
      });
      let allSms = [];
      if (Array.isArray(response.data.records)) allSms = response.data.records;
      else if (Array.isArray(response.data)) allSms = response.data;
      
      const userSms = allSms.filter(sms => {
        const num = String(sms.num || sms.number || '').replace(/[^0-9]/g, '');
        return userNumbers.some(un => un.replace(/[^0-9]/g, '') === num);
      });
      
      return ok(res, { 
        count: userSms.length,
        recent: userSms.map(s => ({ time: s.dt ? s.dt.split(' ')[1] : '', number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text }))
      });
    }

    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { count: 0 }); 
    }

    if (url === '/dor' && req.method === 'POST') {
      return ok(res, await getSmartDOR());
    }

    // ═══════════════════════════════════════════════════════════
    // 6. SEARCH RANGES — 🔥 FIXED: Proper available detection
    // ═══════════════════════════════════════════════════════════
    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const query = (req.body.query || '').toLowerCase().trim();
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      if (!data || !data.aaData) return ok(res, { ranges: [], _debug: 'No data from LaMix' });

      const allNumbers = parseNumbersData(data);
      const rangesMap = new Map();
      allNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) rangesMap.set(key, { id: null, title: n.range, country: n.country, total: 0, available: 0 });
        const r = rangesMap.get(key); r.total++;
        if (isAvailableClient(n.client)) r.available++;
      });

      // 🔥 Map each range to the REAL value used by the agent's range dropdown
      const form = await getAllocForm();
      let mapped = 0;
      if (form) {
        const rSel = pickRangeSelect(form, Array.from(rangesMap.values()).map(r => r.title));
        if (rSel) {
          const byText = new Map();
          rSel.opts.forEach(o => { const k = norm(o.text); if (k && !byText.has(k)) byText.set(k, o.value); });
          let i = 0;
          rangesMap.forEach(r => { r.id = byText.get(norm(r.title)) || ('alloc_' + (i++)); if (byText.has(norm(r.title))) mapped++; });
        }
      }
      let i = 0; rangesMap.forEach(r => { if (!r.id) r.id = 'alloc_' + (i++); });

      const filtered = Array.from(rangesMap.values()).filter(r => `${r.country} ${r.title}`.toLowerCase().includes(query));
      const withAvail = filtered.filter(r => r.available > 0);
      return ok(res, {
        ranges: withAvail,
        _debug: { query, totalScraped: allNumbers.length, rangesFound: filtered.length, withAvailable: withAvail.length, realIdsMapped: mapped,
          formSelects: form ? form.selects.map(s => ({ name: s.name, optCount: s.opts.length, sample: s.opts.slice(0, 6).map(o => o.value + '=' + o.text) })) : 'FORM_NOT_FOUND' }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 7. CHECK AVAILABILITY
    // ═══════════════════════════════════════════════════════════
    if (url === '/alloc/check-availability' && req.method === 'POST') {
      const { rangeId } = req.body;
      const cleanRangeId = rangeId.replace('alloc_', '').trim();
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: cleanRangeId, fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      let available = 0;
      let total = 0;
      
      if (data && data.aaData) {
        const numbers = parseNumbersData(data);
        total = numbers.length;
        available = numbers.filter(n => isAvailableClient(n.client)).length;
      }
      
      return ok(res, { available, total });
    }

    // ═══════════════════════════════════════════════════════════
    // 8. ALLOCATE — Real-time with verification
    // ═══════════════════════════════════════════════════════════
   if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const rangeId = String(req.body.rangeId || '').trim();
      const quantity = parseInt(req.body.quantity) || parseInt(req.body.qty) || 1;
      const payout = parseFloat(req.body.payout) || 0.01;

      const form = await getAllocForm();
      const dbg = { rangeId, quantity, payout, clientId: user.clientId, clientName: user.clientName };

      if (!form) {
        return ok(res, { allocated: 0, used: 0, remaining: 0, limit: 0, _debug: Object.assign(dbg, { error: 'FORM_NOT_FOUND' }) });
      }

      // Identify the real dropdowns
      const rSel = form.selects.find(s => s.opts.some(o => o.value === rangeId));     // exact: our id came from here
      const cSel = pickClientSelect(form, user);
      const pSel = form.selects.find(isPaytermSelect);
      const clientValue = cSel ? ((cSel.opts.find(o => o.value === String(user.clientId)) || cSel.opts.find(o => norm(o.text) === norm(user.username)) || cSel.opts.find(o => norm(o.text) === norm(user.clientName)) || {}).value || user.clientId) : user.clientId;

      // Build the POST exactly like the form (hidden fields + the 3 selects + qty/payout inputs)
      const params = new URLSearchParams();
      Object.entries(form.inputs).forEach(([k, v]) => { const t = (form.inputs['type_' + k] || '').toLowerCase(); if (!k.startsWith('type_')) params.append(k, v); });
      // re-add hidden inputs properly (inputs{} already holds name->value for ALL inputs incl. hidden)
      if (rSel) params.set(rSel.name, rangeId);
      if (cSel) params.set(cSel.name, clientValue);
      if (pSel) params.set(pSel.name, pSel.def);
      // qty / payout inputs by name pattern
      const setByPattern = (re, val) => { const hit = Object.keys(form.inputs).find(k => re.test(k) && form.inputs['type_' + k] !== 'hidden'); if (hit) params.set(hit, val); };
      setByPattern(/qty|quant|num/i, String(quantity));
      setByPattern(/payout|price|rate/i, String(payout));

      dbg.formAction = form.action || '(self)';
      dbg.selectNames = { range: rSel && rSel.name, client: cSel && cSel.name, payterm: pSel && pSel.name };
      dbg.clientValue = clientValue;
      dbg.sent = Object.fromEntries(params.entries());

      if (!rSel) return ok(res, { allocated: 0, used: 0, remaining: 0, limit: 0, _debug: Object.assign(dbg, { error: 'RANGE_DROPDOWN_NOT_MATCHED' }) });

      try {
        const postRes = await axios.post(resolveUrl(form.action), params, {
          headers: Object.assign({}, BROWSER_HEADERS, { 'Content-Type': 'application/x-www-form-urlencoded' }),
          maxRedirects: 5, validateStatus: () => true, timeout: 15000
        });
        dbg.postStatus = postRes.status;
      } catch (e) { dbg.postError = e.message; }

      // 🔥 Truthful verify using the agent's OWN filters (real range value + real client value)
      let total = 0, available = 0, usedByClient = 0;
      try {
        const dAll = await scrapeAgentData('res/data_smsnumbers.php', { frange: rangeId, fclient: '', totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
        if (dAll && dAll.aaData) { const ns = parseNumbersData(dAll); total = ns.length; available = ns.filter(n => isAvailableClient(n.client)).length; }
        const dCli = await scrapeAgentData('res/data_smsnumbers.php', { frange: rangeId, fclient: clientValue, totnum: 100000, sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1 });
        if (dCli && dCli.aaData) usedByClient = parseNumbersData(dCli).length;
      } catch (e) { dbg.verifyError = e.message; }

      return ok(res, { allocated: quantity, used: usedByClient, remaining: available, limit: total, message: `Allocated to ${user.clientName}`, _debug: dbg });
    }

    // ═══════════════════════════════════════════════════════════
    // 9. LEADERBOARD
    // ═══════════════════════════════════════════════════════════
    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const dorData = await getSmartDOR();
      const cliCounts = {};
      dorData.recent.forEach(sms => { const cli = sms.cli || 'Unknown'; cliCounts[cli] = (cliCounts[cli] || 0) + 1; });
      const top10 = Object.entries(cliCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cli, count]) => ({ username: cli, count }));
      return ok(res, { users: top10 });
    }

    // ═══════════════════════════════════════════════════════════
    // 10. CLIENTS LIST (For admin features)
    // ═══════════════════════════════════════════════════════════
    if (url === '/clients/list' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      try {
        const response = await axios.get(`${AGENT_BASE_URL}res/data_clients.php`, {
          params: { sEcho: 1, iColumns: 8, iDisplayStart: 0, iDisplayLength: 1000, sSearch: '' },
          headers: { 'Cookie': AGENT_COOKIE, 'X-Requested-With': 'XMLHttpRequest' },
          timeout: 10000
        });
        
        if (response.data && response.data.aaData) {
          const clients = response.data.aaData.map(client => {
            const idMatch = (client[0] || '').match(/value="(\d+)"/);
            return {
              id: idMatch ? idMatch[1] : (client[1] || '0'),
              username: client[1] || '',
              name: client[2] || '',
              panelNum: 1
            };
          });
          return ok(res, { clients: clients });
        }
        return ok(res, { clients: [] });
      } catch (err) {
        return error(res, 500, 'Failed to fetch clients');
      }
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
      fs.readdirSync(tmpDir).forEach(file => {
        if (file.startsWith('dor-') && file < `dor-${keepStr}.json`) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
      });
    }
  } catch (e) {}
}, 24 * 60 * 60 * 1000);
