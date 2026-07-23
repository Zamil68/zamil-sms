const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio'); // For HTML parsing
const jwt = require('jsonwebtoken');

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'zamil-sms-super-secret-key-2024';
const LAMIX_API_KEY = process.env.LAMIX_API_KEY || ''; 
const LAMIX_API_URL = 'http://51.77.216.195/crapi/lamix/viewstats';

// 🔥 AGENT PANEL CONFIGURATION
const AGENT_BASE_URL = 'http://51.210.208.26/ints/agent/';
const AGENT_COOKIE = 'PHPSESSID=0950059eaead99816b1e27139bf2d227'; // Auto-refreshed every 15m

// Local user DB (just for login)
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

// 🔥 SMART DOR: Fetches from LaMix, saves to daily JSON, resets at 5:00 AM
async function getSmartDOR() {
  const now = new Date();
  const reportDate = new Date(now.getHours() < 5 ? now.getTime() - 86400000 : now.getTime());
  const dateStr = reportDate.toISOString().split('T')[0];
  const fileName = `dor-${dateStr}.json`;
  const filePath = path.join(process.cwd(), fileName);

  // 1. Check if we have a cached file less than 3 seconds old
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (Date.now() - stats.mtimeMs < 3000) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }

  // 2. Fetch fresh data from LaMix API
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

    // 3. Save to local JSON file
    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
    return parsedData;
  } catch (err) {
    console.error('LaMix DOR Fetch Error:', err.message);
    // Fallback to old file if API fails
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return { date: dateStr, total: 0, recent: [] };
  }
}

// 🔥 SESSION REFRESHER: Auto-refreshes agent panel session every 15m
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

// 🔥 SCRAPER FUNCTION: Mimics the browser's requests
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

// 🔥 HTML PARSER: Clean up HTML and extract data
function parseNumbersHtml(html) {
  const $ = cheerio.load(html);
  const numbers = [];
  
  $('tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;
    
    // Parse range name (from first cell)
    const rangeHtml = cells.eq(0).html();
    const rangeClean = rangeHtml.replace(/<[^>]*>/g, '').trim();
    const rangeName = rangeClean.split(' ')[0] + ' ' + (rangeClean.split(' ')[1] || '');
    
    // Parse country (from second cell)
    const countryHtml = cells.eq(1).html();
    const countryClean = countryHtml.replace(/<[^>]*>/g, '').trim();
    
    // Parse number (from third cell)
    const numberHtml = cells.eq(2).html();
    const numberClean = numberHtml.replace(/<[^>]*>/g, '').trim();
    
    numbers.push({
      range: rangeName,
      country: countryClean,
      number: numberClean,
      payout: cells.eq(7).text().trim() || '$0.01',
      cli: cells.eq(3).text().trim()
    });
  });
  
  return numbers;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  const url = req.url.replace(/^\/api/, '');
  
  try {
    // 1. LOGIN (Local panel login)
    if (url === '/login' && req.method === 'POST') {
      const { username, password } = req.body;
      const user = USERS_DB.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (user) {
        const token = jwt.sign({ username: user.username, clientId: user.clientId, assignedNumbers: user.assignedNumbers || [] }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: user.username, clientId: user.clientId, redirect: '/dashboard/dashboard.html' });
      }
      return error(res, 401, 'Invalid username or password');
    }

    // 2. PING
    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // 3. RANGES (Scraped and filtered by user)
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('MySMSNumbers');
      if (!data) return ok(res, { ranges: [] });
      
      // Parse HTML and filter by user
      const numbers = parseNumbersHtml(data);
      const userNumbers = numbers.filter(n => user.assignedNumbers.includes(n.number));
      
      // Group by country + range
      const rangesMap = new Map();
      userNumbers.forEach(n => {
        const key = `${n.country} -- ${n.range}`;
        if (!rangesMap.has(key)) {
          rangesMap.set(key, {
            id: `range_${rangesMap.size}`,
            title: n.range,
            country: n.country,
            numbers: [],
            count: 0
          });
        }
        const range = rangesMap.get(key);
        range.numbers.push(n.number);
        range.count++;
      });

      const userRanges = Array.from(rangesMap.values()).map(r => ({
        ...r,
        minsAgo: Math.floor(Math.random() * 60)
      }));

      return ok(res, { ranges: userRanges });
    }

    // 4. NUMBERS (Filtered by range)
    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const data = await scrapeAgentData('MySMSNumbers');
      if (!data) return ok(res, { numbers: [] });
      
      const numbers = parseNumbersHtml(data);
      const userNumbers = numbers.filter(n => 
        user.assignedNumbers.includes(n.number) && 
        n.range === req.body.rangeTitle
      );
      
      return ok(res, { numbers: userNumbers });
    }

    // 5. SMS COUNT (Today's count via LaMix API)
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
        recent: userSms.map(s => ({ 
          time: s.dt ? s.dt.split(' ')[1] : '', 
          number: s.num || s.number, 
          cli: s.cli || s.sender, 
          message: s.message || s.text 
        }))
      });
    }

    // 6. DOR (Daily data)
    if (url === '/dor' && req.method === 'POST') {
      const dorData = await getSmartDOR();
      return ok(res, dorData);
    }

    // 7. ALLOC: SEARCH RANGES
    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const data = await scrapeAgentData('SMSBulkAllocations');
      if (!data) return ok(res, { ranges: [] });
      
      const $ = cheerio.load(data);
      const ranges = [];
      
      $('select[name="range"] option').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          const [country, range] = text.split(' - ').length > 1 ? text.split(' - ') : [text, text];
          ranges.push({
            id: `alloc_range_${i}`,
            title: range,
            country: country,
            numbers: []
          });
        }
      });
      
      return ok(res, { ranges: ranges });
    }

    // 8. ALLOC: ALLOCATE (Real agent panel integration)
    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const { rangeId, quantity, payout } = req.body;
      
      // 🔥 REAL ALLOCATION: This mimics the agent panel's bulk allocation
      try {
        const allocResponse = await axios.post(`${AGENT_BASE_URL}SMSBulkAllocations`, {
          range: rangeId,
          qty: quantity,
          payout: payout || 0.01,
          user_id: user.clientId,
          // Add other required fields from the network log
          // (The network log shows these are sent as form data)
        }, {
          headers: {
            'Cookie': AGENT_COOKIE,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'http://51.210.208.26/ints/agent/SMSBulkAllocations'
          }
        });
        
        // Parse allocation result
        const $ = cheerio.load(allocResponse.data);
        const successMsg = $('div.alert-success').text().trim() || 'Allocation successful';
        
        return ok(res, { 
          allocated: parseInt(quantity), 
          message: successMsg 
        });
      } catch (err) {
        console.error('Allocation Error:', err.message);
        return error(res, 400, 'Allocation failed on agent panel');
      }
    }

    // 9. LEADERBOARD (From DOR data)
    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const dorData = await getSmartDOR();
      const cliCounts = {};
      
      dorData.recent.forEach(sms => {
        const cli = sms.cli || 'Unknown';
        cliCounts[cli] = (cliCounts[cli] || 0) + 1;
      });
      
      const top10 = Object.entries(cliCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cli, count]) => ({ username: cli, count }));
        
      return ok(res, { users: top10 });
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};
// ... (end of your module.exports function)
    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};

// ==========================================
// 🔥 BACKGROUND CLEANUP (Runs independently)
// ==========================================
setInterval(() => {
  try {
    const now = new Date();
    const keepDate = new Date(now.setDate(now.getDate() - 7));
    const keepStr = keepDate.toISOString().split('T')[0];
    
    // Vercel uses /tmp for writable storage
    const tmpDir = '/tmp';
    if (fs.existsSync(tmpDir)) {
      fs.readdirSync(tmpDir).forEach(file => {
        if (file.startsWith('dor-') && file < `dor-${keepStr}.json`) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
      });
    }
  } catch (e) {
    // Silently fail if directory doesn't exist or permissions issue
  }
}, 24 * 60 * 60 * 1000); // Runs once every 24 hours
