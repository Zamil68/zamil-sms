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

const USER_MAP = {
  'zml_ahsan': { clientId: '169269', clientName: 'ZML_Ahsan', panelNum: 1 },
  'zml_anns': { clientId: '169270', clientName: 'ZML_Anns', panelNum: 1 },
  'test': { clientId: '102', clientName: 'Test User', panelNum: 1 },
  'muzammil62': { clientId: '0', clientName: 'Agent', panelNum: 1 }
};

function getUserFromSession(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

function ok(res, data = {}) { res.status(200).json({ ok: true, ...data, ...corsHeaders }); }
function error(res, statusCode, message) { res.status(statusCode).json({ ok: false, error: message, ...corsHeaders }); }

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': AGENT_COOKIE,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'http://51.210.208.26/ints/agent/MySMSNumbers'
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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  const url = req.url.replace(/^\/api/, '');
  
  try {
    if (url === '/login' && req.method === 'POST') {
      const rawUsername = (req.body.username || '').trim().toLowerCase();
      const password = (req.body.password || '').trim();
      
      if (!rawUsername || !password) return error(res, 400, 'Username and password required');
      
      const user = USER_MAP[rawUsername];
      if (user) {
        const token = jwt.sign({ username: rawUsername, clientId: user.clientId, clientName: user.clientName, panelNum: user.panelNum }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: user.clientId, clientName: user.clientName, redirect: '/dashboard/dashboard.html' });
      }
      return error(res, 401, 'Invalid username or password');
    }

    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // 🔥 DEBUG: RANGES
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      if (!data || !data.aaData) {
        console.log("🔍 DEBUG RANGES: No data or no aaData returned from LaMix.");
        return ok(res, { ranges: [] });
      }
      
      const allNumbers = parseNumbersData(data);
      console.log(`🔍 DEBUG RANGES: Total numbers scraped = ${allNumbers.length}`);
      if (allNumbers.length > 0) {
        console.log(`🔍 DEBUG RANGES: First 3 client names from LaMix:`, allNumbers.slice(0, 3).map(n => `"${n.client}"`));
      }
      
      const target1 = (user.clientName || '').toLowerCase().trim();
      const target2 = (user.username || '').toLowerCase().trim();
      console.log(`🔍 DEBUG RANGES: Looking for client matching: "${target1}" OR "${target2}"`);
      
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        return c === target1 || c === target2 || c.includes(target1) || c.includes(target2);
      });
      
      console.log(`🔍 DEBUG RANGES: Matched ${userNumbers.length} numbers for this user.`);
      
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

      return ok(res, { ranges: Array.from(rangesMap.values()).map(r => ({ ...r, minsAgo: Math.floor(Math.random() * 60) })) });
    }

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
      
      const userNumbers = allNumbers.filter(n => {
        const c = (n.client || '').toLowerCase().trim();
        const isOwner = c === target1 || c === target2 || c.includes(target1) || c.includes(target2);
        const isRange = (n.range || '').toLowerCase().trim() === reqTitle;
        return isOwner && isRange;
      });
      
      return ok(res, { numbers: userNumbers });
    }

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
          return c === target1 || c === target2 || c.includes(target1) || c.includes(target2);
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

    // 🔥 DEBUG: SEARCH RANGES
    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const query = (req.body.query || '').toLowerCase().trim();
      console.log(`🔍 DEBUG SEARCH: User searched for query: "${query}"`);
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      if (!data || !data.aaData) {
        console.log("🔍 DEBUG SEARCH: No data or no aaData returned from LaMix.");
        return ok(res, { ranges: [] });
      }
      
      const allNumbers = parseNumbersData(data);
      console.log(`🔍 DEBUG SEARCH: Total numbers scraped = ${allNumbers.length}`);
      if (allNumbers.length > 0) {
        console.log(`🔍 DEBUG SEARCH: First 3 countries from LaMix:`, allNumbers.slice(0, 3).map(n => `"${n.country}"`));
      }
      
      const rangesMap = new Map();
      allNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) {
          rangesMap.set(key, { id: `alloc_${rangesMap.size}`, title: n.range, country: n.country, total: 0, available: 0 });
        }
        const r = rangesMap.get(key);
        r.total++;
        
        const c = (n.client || '').trim().toLowerCase();
        if (c === '' || c === 'unallocated' || c === 'null' || c === 'none' || c === 'free' || c === '0') {
          r.available++;
        }
      });
      
      const filtered = Array.from(rangesMap.values()).filter(r => {
        const searchText = `${r.country} ${r.title}`.toLowerCase();
        return searchText.includes(query);
      });
      
      console.log(`🔍 DEBUG SEARCH: Found ${filtered.length} ranges matching "${query}"`);
      
      return ok(res, { ranges: filtered });
    }

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
        available = numbers.filter(n => {
          const c = (n.client || '').trim().toLowerCase();
          return c === '' || c === 'unallocated' || c === 'null' || c === 'none' || c === 'free' || c === '0';
        }).length;
      }
      
      return ok(res, { available, total });
    }

    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const { rangeId, quantity, payout } = req.body;
      const cleanRangeId = rangeId.replace('alloc_', '').trim();
      
      try {
        await axios.post(`${AGENT_BASE_URL}SMSBulkAllocations`, {
          range: cleanRangeId,
          qty: quantity, 
          payout: payout || 0.01, 
          client: user.clientName 
        }, {
          headers: { 
            'Cookie': AGENT_COOKIE, 
            'Content-Type': 'application/x-www-form-urlencoded', 
            'Referer': 'http://51.210.208.26/ints/agent/SMSBulkAllocations' 
          }
        });
        
        const verifyData = await scrapeAgentData('res/data_smsnumbers.php', {
          frange: cleanRangeId, fclient: '', totnum: 100000, sEcho: 1, iColumns: 8,
          iDisplayStart: 0, iDisplayLength: 100000, sSearch: '', bRegex: false, iSortingCols: 1
        });
        
        let newAvailable = 0;
        let newTotal = 0;
        if (verifyData && verifyData.aaData) {
          const numbers = parseNumbersData(verifyData);
          newTotal = numbers.length;
          newAvailable = numbers.filter(n => {
            const c = (n.client || '').trim().toLowerCase();
            return c === '' || c === 'unallocated' || c === 'null' || c === 'none' || c === 'free' || c === '0';
          }).length;
        }
        
        return ok(res, { 
          allocated: parseInt(quantity), 
          message: `Successfully allocated to ${user.clientName}`,
          used: newTotal - newAvailable,
          limit: 100,
          remaining: newAvailable
        });
        
      } catch (err) {
        console.error('Allocation Error:', err.message);
        return error(res, 400, 'Allocation failed on LaMix panel. Check range and limits.');
      }
    }

    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const dorData = await getSmartDOR();
      const cliCounts = {};
      dorData.recent.forEach(sms => { const cli = sms.cli || 'Unknown'; cliCounts[cli] = (cliCounts[cli] || 0) + 1; });
      const top10 = Object.entries(cliCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cli, count]) => ({ username: cli, count }));
      return ok(res, { users: top10 });
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};

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
  } catch (e) { /* Silently fail */ }
}, 24 * 60 * 60 * 1000);
