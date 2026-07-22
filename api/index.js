const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'zamil-sms-super-secret-key-2024';
const LAMIX_API_KEY = process.env.LAMIX_API_KEY || ''; // MUST be set in Vercel
const LAMIX_API_URL = 'http://51.77.216.195/crapi/lamix/viewstats';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// 🔥 HARDCODED CONFIG (Ranges & Users) - Edit these to add more users/ranges
const USERS_DB = [
  { username: "ZML_Ahsan", password: "12345", clientId: "101", assignedNumbers: ["255651498861", "96893010505"] },
  { username: "test", password: "test", clientId: "102", assignedNumbers: [] }
];

const RANGES_DB = [
  { id: "range_1", title: "Tanzania LX 20Apr", country: "Tanzania", numbers: ["255651498861", "255651498862", "255651498863"] },
  { id: "range_2", title: "Oman LX 04Jul", country: "Oman", numbers: ["96893010505", "96893010506"] }
];

// 🔥 SMART CACHE: Prevents hammering LaMix API when multiple users refresh
let lamixCache = { key: '', data: [], ts: 0 };
async function getLaMixData(dateFrom, dateTo, limit = 500) {
  const cacheKey = `${dateFrom}-${dateTo}`;
  // Cache for 10 seconds
  if (lamixCache.key === cacheKey && Date.now() - lamixCache.ts < 10000) {
    return lamixCache.data;
  }
  
  try {
    const response = await axios.get(LAMIX_API_URL, { 
      params: { apikey: LAMIX_API_KEY, date_from: dateFrom, date_to: dateTo, limit } 
    });
    let allSms = [];
    if (Array.isArray(response.data.records)) allSms = response.data.records;
    else if (Array.isArray(response.data)) allSms = response.data;
    else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;
    
    lamixCache = { key: cacheKey, data: allSms, ts: Date.now() };
    return allSms;
  } catch (err) {
    console.error('LaMix API Error:', err.message);
    return [];
  }
}

function getUserFromSession(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

function ok(res, data = {}) { res.status(200).json({ ok: true, ...data, ...corsHeaders }); }
function error(res, statusCode, message) { res.status(statusCode).json({ ok: false, error: message, ...corsHeaders }); }

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  const url = req.url.replace(/^\/api/, '');
  
  try {
    // 1. LOGIN
    if (url === '/login' && req.method === 'POST') {
      const { username, password } = req.body;
      const user = USERS_DB.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (user) {
        const token = jwt.sign({ username: user.username, clientId: user.clientId, assignedNumbers: user.assignedNumbers || [] }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: user.username, clientId: user.clientId, redirect: '/dashboard/dashboard.html' });
      }
      return error(res, 401, 'Invalid username or password');
    }

    // Helper to get today's date range
    const today = new Date().toISOString().split('T')[0];
    const todayFrom = `${today} 00:00:00`;
    const todayTo = `${today} 23:59:59`;

    // 2. PING
    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // 3. RANGES (Real-time counts from LaMix)
    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const allSms = await getLaMixData(todayFrom, todayTo, 500);
      
      const userRanges = RANGES_DB
        .filter(r => r.numbers && r.numbers.some(n => user.assignedNumbers && user.assignedNumbers.includes(n)))
        .map(r => {
          // Count real SMS for this range today
          const realCount = allSms.filter(sms => 
            r.numbers.includes(sms.num || sms.number) && user.assignedNumbers.includes(sms.num || sms.number)
          ).length;
          return {
            id: r.id, title: r.title, country: r.country,
            count: realCount, // Real count instead of hardcoded
            minsAgo: Math.floor(Math.random() * 60)
          };
        });
      return ok(res, { ranges: userRanges });
    }

    // 4. NUMBERS
    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const range = RANGES_DB.find(r => r.id === req.body.rangeId);
      if (!range || !range.numbers) return ok(res, { numbers: [] });
      return ok(res, { numbers: range.numbers.filter(n => user.assignedNumbers && user.assignedNumbers.includes(n)) });
    }

    // 5. SMS COUNT (Today)
    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const allSms = await getLaMixData(todayFrom, todayTo, 500);
      const userSms = allSms.filter(sms => user.assignedNumbers && user.assignedNumbers.includes(sms.num || sms.number));
      
      return ok(res, { 
        count: userSms.length,
        recent: userSms.map(s => ({ 
          time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), 
          number: s.num || s.number, 
          cli: s.cli || s.sender, 
          message: s.message || s.text, 
          range: 'Unknown' 
        }))
      });
    }

    // 6. SMS COUNT RANGE (Week/Month)
    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const rangeType = req.body.range || 'week';
      const now = new Date();
      let fromDate = new Date();
      
      if (rangeType === 'week') fromDate.setDate(now.getDate() - 7);
      else if (rangeType === 'month') fromDate.setMonth(now.getMonth() - 1);
      
      const fromStr = fromDate.toISOString().split('T')[0] + ' 00:00:00';
      const toStr = now.toISOString().split('T')[0] + ' 23:59:59';
      
      const allSms = await getLaMixData(fromStr, toStr, 1000);
      const userSms = allSms.filter(sms => user.assignedNumbers && user.assignedNumbers.includes(sms.num || sms.number));
      
      return ok(res, { count: userSms.length });
    }

    // 7. LEADERBOARD (Top 10 Real Senders/CLIs)
    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      
      const allSms = await getLaMixData(todayFrom, todayTo, 1000);
      
      // Count SMS per CLI (Sender)
      const cliCounts = {};
      allSms.forEach(sms => {
        const cli = sms.cli || sms.sender || 'Unknown';
        cliCounts[cli] = (cliCounts[cli] || 0) + 1;
      });
      
      // Sort and get Top 10
      const top10 = Object.entries(cliCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cli, count]) => ({ username: cli, count }));
        
      return ok(res, { users: top10 });
    }

    // 8. DOR (Global Detail OTP Report)
    if (url === '/dor' && req.method === 'POST') {
      const allSms = await getLaMixData(todayFrom, todayTo, 500);
      return ok(res, { 
        total: allSms.length,
        recent: allSms.slice(0, 50).map(s => ({ 
          time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), 
          number: s.num || s.number, 
          cli: s.cli || s.sender, 
          message: s.message || s.text, 
          range: 'Global' 
        }))
      });
    }

    // 9. ALLOC ENDPOINTS (Keep as mock for now, or connect to LaMix alloc API if available)
    if (url === '/alloc/verify-client' && req.method === 'POST') return ok(res, { id: '101', name: 'ZML_Ahsan', panelNum: 1 });
    if (url === '/alloc/search-ranges' && req.method === 'POST') return ok(res, { ranges: RANGES_DB.map(r => ({ id: r.id, title: r.title })) });
    if (url === '/alloc/check-availability' && req.method === 'POST') return ok(res, { available: 500, total: 500 });
    if (url === '/alloc/allocate' && req.method === 'POST') return ok(res, { allocated: req.body.qty || 5, used: 1, limit: 2, remaining: 1 });
    if (url === '/number-smscount' && req.method === 'POST') {
       const user = getUserFromSession(req.body.session);
       if (!user) return error(res, 401, 'Unauthorized');
       const allSms = await getLaMixData(todayFrom, todayTo, 500);
       const count = allSms.filter(s => s.num === req.body.number).length;
       return ok(res, { number: req.body.number, count, recent: [] });
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};
