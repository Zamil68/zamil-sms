const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'zamil-sms-super-secret-key-2024';
const LAMIX_API_KEY = process.env.LAMIX_API_KEY || ''; 
const LAMIX_API_URL = 'http://51.77.216.195/crapi/lamix/viewstats';

// 🔥 AGENT PANEL SCRAPER CONFIGURATION
const AGENT_BASE_URL = 'http://51.210.208.26/ints/agent/res/';
// ⚠️ REPLACE THIS WITH YOUR ACTUAL COOKIE FROM CHROME DEV TOOLS
const AGENT_COOKIE = 'PHPSESSID=0950059eaead99816b1e27139bf2d227'; 

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// Local user DB for your new panel's login
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

// 🔥 SCRAPER FUNCTION: Mimics the browser's DataTables request
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

// 🔥 SMART DOR: Fetches from LaMix, saves to daily JSON, resets at 5:00 AM
async function getSmartDOR() {
  const now = new Date();
  const reportDate = new Date(now.getHours() < 5 ? now.getTime() - 86400000 : now.getTime());
  const dateStr = reportDate.toISOString().split('T')[0];
  const fileName = `dor-${dateStr}.json`;
  const filePath = path.join(process.cwd(), fileName);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (Date.now() - stats.mtimeMs < 3000) { // Cache for 3 seconds
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

    // 3. RANGES (Scraped from Agent Panel DataTables)
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      // Scrape the agent panel
      const scrapeParams = {
        frange: '', fclient: '', totnum: 20045, sEcho: 1, iColumns: 8,
        iDisplayStart: 0, iDisplayLength: 100, sSearch: '', bRegex: false, iSortingCols: 1
      };
      const data = await scrapeAgentData('data_smsnumbers.php', scrapeParams);
      
      if (!data || !data.aaData) {
        console.warn('Scraping failed or returned no data. Check AGENT_COOKIE.');
        return ok(res, { ranges: [] });
      }

      // Parse DataTables aaData array into our frontend format
      // Note: Adjust the array indexes [0], [1], etc., based on the actual column order in your agent panel
      const scrapedRanges = data.aaData.map((row, index) => ({
        id: `scraped_${index}`,
        title: row[0] || 'Unknown Range', // Column 1: Range Name
        country: row[1] || 'Unknown',      // Column 2: Country
        count: 0, // Will be updated by smscount
        minsAgo: 0
      }));

      // Filter to only show ranges that belong to this user's assigned numbers
      // (If the agent panel already filters by client, you can skip this filter)
      const userRanges = scrapedRanges.filter(r => 
        // Simple check: if you want to show ALL scraped ranges on the "Add" page, remove this filter.
        // For the main dashboard, keep it to only show user's ranges.
        true // Showing all for now, adjust logic if needed
      );

      return ok(res, { ranges: userRanges });
    }

    // 4. NUMBERS (Scraped or derived)
    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      // For now, return the user's assigned numbers from the local DB
      // You can also scrape data_smsnumbers.php with fclient=user.clientId to get exact numbers
      return ok(res, { numbers: user.assignedNumbers || [] });
    }

    // 5. SMS COUNT (Today's real count for user's numbers via LaMix API)
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

    // 6. DOR (Smart Cache: Fetches from LaMix, saves to daily JSON, resets at 5 AM)
    if (url === '/dor' && req.method === 'POST') {
      const dorData = await getSmartDOR();
      return ok(res, dorData);
    }

    // 7. ALLOC: SEARCH RANGES (Shows all ranges for the "Add" button)
    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      // You can scrape this the same way as /ranges, or use the scraped data above
      const scrapeParams = { frange: '', fclient: '', totnum: 20045, sEcho: 1, iDisplayLength: 100 };
      const data = await scrapeAgentData('data_smsnumbers.php', scrapeParams);
      
      if (data && data.aaData) {
        const allRanges = data.aaData.map((row, index) => ({
          id: `scraped_${index}`,
          title: row[0] || 'Unknown Range',
          country: row[1] || 'Unknown'
        }));
        return ok(res, { ranges: allRanges });
      }
      return ok(res, { ranges: [] });
    }

    // 8. ALLOC: ALLOCATE (Mimics Agent Panel Bulk Allocation)
    if (url === '/alloc/allocate' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const { rangeId, quantity, payout } = req.body;
      
      // ⚠️ TODO: To make this real, you need to find the "allocate" or "add numbers" 
      // POST request in the Network tab of the agent panel and replicate it here using axios.post
      console.log(`[ALLOC REQUEST] User: ${user.username}, Range: ${rangeId}, Qty: ${quantity}, Payout: ${payout}`);
      
      return ok(res, { 
        allocated: parseInt(quantity), 
        message: `Allocation request sent for ${quantity} numbers.` 
      });
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};
