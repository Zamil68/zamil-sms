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

const USERS_DB = [
  { username: "ZML_Ahsan", password: "12345", clientId: "101", assignedNumbers: ["255651498861", "96893010505"] },
  { username: "test", password: "test", clientId: "102", assignedNumbers: [] }
];

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
    if (Date.now() - stats.mtimeMs < 3000) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
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
    await axios.post(`${AGENT_BASE_URL}signin`, {
      username: 'muzammil62',
      password: 'muzammil62'
    }, {
      headers: { 'Cookie': AGENT_COOKIE },
      timeout: 5000
    });
    console.log('[SESSION REFRESH] Agent panel session refreshed');
  } catch (err) {
    console.error('[SESSION REFRESH] Failed:', err.message);
  }
}, 15 * 60 * 1000);

async function scrapeAgentData(endpoint, params = {}) {
  try {
    const response = await axios.get(`${AGENT_BASE_URL}${endpoint}`, {
      params: params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': AGENT_COOKIE,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'http://51.210.208.26/ints/agent/SMSDashboard'
      },
      timeout: 10000
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
      range: (row[0] || '').replace(/<[^>]*>/g, '').trim(),
      country: (row[1] || '').replace(/<[^>]*>/g, '').trim(),
      number: (row[2] || '').replace(/<[^>]*>/g, '').trim(),
      cli: (row[3] || '').replace(/<[^>]*>/g, '').trim(),
      payout: (row[7] || '$0.01').replace(/<[^>]*>/g, '').trim()
    }));
  }
  
  const $ = cheerio.load(data);
  const numbers = [];
  $('tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;
    numbers.push({
      range: cells.eq(0).text().trim(),
      country: cells.eq(1).text().trim(),
      number: cells.eq(2).text().trim(),
      cli: cells.eq(3).text().trim(),
      payout: cells.eq(7).text().trim() || '$0.01'
    });
  });
  return numbers;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  const url = req.url.replace(/^\/api/, '');
  
  try {
    if (url === '/login' && req.method === 'POST') {
      const { username, password } = req.body;
      const user = USERS_DB.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (user) {
        const token = jwt.sign({ username: user.username, clientId: user.clientId, assignedNumbers: user.assignedNumbers || [] }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: user.username, clientId: user.clientId, redirect: '/dashboard/dashboard.html' });
      }
      return error(res, 401, 'Invalid username or password');
    }

    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // 🔥 RANGES WITH DEBUG LOGS
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('MySMSNumbers');
      console.log('🔍 SCRAPE DEBUG: Data type =', typeof data, data ? (data.aaData ? 'JSON' : 'HTML') : 'NULL');
      
      if (!data) return ok(res, { ranges: [] });
      
      const allNumbers = parseNumbersData(data);
      console.log('🔍 SCRAPE DEBUG: Total numbers parsed =', allNumbers.length);
      if (allNumbers.length > 0) {
        console.log('🔍 SCRAPE DEBUG: First number object =', JSON.stringify(allNumbers[0]));
      }
      
      const userNumbers = allNumbers.filter(n => user.assignedNumbers.includes(n.number));
      console.log('🔍 SCRAPE DEBUG: User matched numbers =', userNumbers.length);
      
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
      
      const data = await scrapeAgentData('MySMSNumbers');
      if (!data) return ok(res, { numbers: [] });
      
      const allNumbers = parseNumbersData(data);
      const userNumbers = allNumbers.filter(n => user.assignedNumbers.includes(n.number) && n.range === req.body.rangeTitle);
      
      return ok(res, { numbers: userNumbers });
    }

    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(LAMIX_API_URL, { 
        params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 200 } 
      });
      
      let allSms = [];
      if (Array.isArray(response.data.records)) allSms = response.data.records;
      else if (Array.isArray(response.data)) allSms = response.data;
      
      const userSms = allSms.filter(sms => user.assignedNumbers && user.assignedNumbers.includes(sms.num || sms.number));
      
      return ok(res, { 
        count: userSms.length,
        recent: userSms.map(s => ({ time: s.dt ? s.dt.split(' ')[1] : '', number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text }))
      });
    }

    // 🔥 ADDED MISSING ENDPOINT
    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      // Returning safe default for now to stop the 404 loop
      return ok(res, { count: 0 }); 
    }

    if (url === '/dor' && req.method === 'POST') {
      return ok(res, await getSmartDOR());
    }

    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const data = await scrapeAgentData('SMSBulkAllocations');
      if (!data) return ok(res, { ranges: [] });
      
      const $ = cheerio.load(data);
      const ranges = [];
      $('select[name="range"] option').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          const parts = text.split(' - ');
          ranges.push({ id: `alloc_range_${i}`, title: parts[1] || text, country: parts[0] || 'Global', numbers: [] });
        }
      });
      return ok(res, { ranges });
    }

    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const { rangeId, quantity, payout } = req.body;
      try {
        const allocResponse = await axios.post(`${AGENT_BASE_URL}SMSBulkAllocations`, {
          range: rangeId, qty: quantity, payout: payout || 0.01, user_id: user.clientId
        }, {
          headers: { 'Cookie': AGENT_COOKIE, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'http://51.210.208.26/ints/agent/SMSBulkAllocations' }
        });
        return ok(res, { allocated: parseInt(quantity), message: 'Allocation successful' });
      } catch (err) {
        console.error('Allocation Error:', err.message);
        return error(res, 400, 'Allocation failed on agent panel');
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
