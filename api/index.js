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

// Helper to clean numbers (removes +, spaces, dashes for perfect matching)
function cleanNumber(num) {
  return String(num || '').replace(/[^0-9]/g, '');
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
    console.log('[SESSION REFRESH] Agent panel session refreshed');
  } catch (err) { console.error('[SESSION REFRESH] Failed:', err.message); }
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
        'Referer': 'http://51.210.208.26/ints/agent/MySMSNumbers'
      },
      timeout: 10000
    });
    return response.data;
  } catch (err) {
    console.error('Agent Panel Scrape Error:', err.message);
    return null;
  }
}

// 🔥 FIXED: Correct column mapping based on your HTML table headers
function parseNumbersData(data) {
  if (data && typeof data === 'object' && data.aaData) {
    return data.aaData.map(row => ({
      range: (row[1] || '').replace(/<[^>]*>/g, '').trim(),   // Column 1: Range
      country: (row[2] || '').replace(/<[^>]*>/g, '').trim(), // Column 2: Prefix/Country
      number: (row[3] || '').replace(/<[^>]*>/g, '').trim(),  // Column 3: Number
      client: (row[5] || '').replace(/<[^>]*>/g, '').trim(),  // Column 5: Client
      payout: (row[6] || '$0.01').replace(/<[^>]*>/g, '').trim() // Column 6: Payout
    }));
  }
  
  // Fallback HTML parsing
  const $ = cheerio.load(data);
  const numbers = [];
  $('tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    numbers.push({
      range: cells.eq(1).text().trim(),
      country: cells.eq(2).text().trim(),
      number: cells.eq(3).text().trim(),
      client: cells.eq(5).text().trim(),
      payout: cells.eq(6).text().trim() || '$0.01'
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

    // 🔥 RANGES
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('res/data_smsnumbers.php', {
        frange: '', fclient: '', totnum: 20045, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 20000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      
      if (!data) return ok(res, { ranges: [] });
      
      const allNumbers = parseNumbersData(data);
      console.log(`🔍 DEBUG: Scraped ${allNumbers.length} total numbers.`);
      
      const userCleanNumbers = user.assignedNumbers.map(cleanNumber);
      
      const userNumbers = allNumbers.filter(n => {
        const cleanScraped = cleanNumber(n.number);
        return userCleanNumbers.includes(cleanScraped);
      });
      
      console.log(`🔍 DEBUG: Matched ${userNumbers.length} numbers for this user.`);
      if (userNumbers.length > 0) console.log(`🔍 DEBUG: First matched number:`, userNumbers[0]);
      
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
        frange: '', fclient: '', totnum: 20045, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 20000, sSearch: '', bRegex: false, iSortingCols: 1
      });
      if (!data) return ok(res, { numbers: [] });
      
      const allNumbers = parseNumbersData(data);
      const userCleanNumbers = user.assignedNumbers.map(cleanNumber);
      
      const userNumbers = allNumbers.filter(n => {
        const cleanScraped = cleanNumber(n.number);
        return userCleanNumbers.includes(cleanScraped) && n.range === req.body.rangeTitle;
      });
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
      
      const userCleanNumbers = user.assignedNumbers.map(cleanNumber);
      const userSms = allSms.filter(sms => userCleanNumbers.includes(cleanNumber(sms.num || sms.number)));
      
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
        await axios.post(`${AGENT_BASE_URL}SMSBulkAllocations`, {
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
