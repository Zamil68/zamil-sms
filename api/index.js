const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

const loadJSON = (file) => {
  try {
    // Try multiple possible paths for Vercel compatibility
    const possiblePaths = [
      path.join(process.cwd(), file),
      path.join(__dirname, '..', file),
      path.join(process.cwd(), '..', file),
      file
    ];
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    }
    
    // If file doesn't exist, create it and return empty array
    const defaultPath = path.join(process.cwd(), file);
    fs.writeFileSync(defaultPath, '[]', 'utf8');
    console.log(`Created default ${file}`);
    return [];
  } catch (e) {
    console.error(`Error loading ${file}:`, e.message);
    return [];
  }
};

const sessions = {};
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function getUserFromSession(token) {
  if (!token || !sessions[token]) return null;
  if (Date.now() - sessions[token].createdAt > 24 * 60 * 60 * 1000) {
    delete sessions[token];
    return null;
  }
  return sessions[token];
}

const LAMIX_API_KEY = process.env.LAMIX_API_KEY || 'Z4tzfFyChH/commented intentionally/ZIpURFSTgkI=';
const LAMIX_API_URL = 'http://51.77.216.195/crapi/lamix/viewstats';

function ok(res, data = {}) {
  res.status(200).json({ ok: true, ...data, ...corsHeaders });
}
function error(res, statusCode, message) {
  res.status(statusCode).json({ ok: false, error: message, ...corsHeaders });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ...corsHeaders });
  }

  // Remove '/api' from the URL to get the route name
  const url = req.url.replace(/^\/api/, '');
  
  try {
   if (url === '/login' && req.method === 'POST') {
      const { username, password } = req.body;
      console.log("Login attempt:", username, password); // DEBUG LOG
      
      if (!username || !password) return error(res, 400, 'Username and password required');
      
      const users = loadJSON('users.json');
      console.log("Loaded users:", users); // DEBUG LOG
      
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      
      if (user) {
        const token = generateToken();
        sessions[token] = { username: user.username, clientId: user.clientId, assignedNumbers: user.assignedNumbers || [], createdAt: Date.now() };
        return ok(res, { session: token, username: user.username, clientId: user.clientId, redirect: '/dashboard/dashboard.html' });
      }
      
      console.log("Login failed: User not found in", users); // DEBUG LOG
      return error(res, 401, 'Invalid username or password');
    }

    if (url === '/ping' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (user) return ok(res);
      return error(res, 401, 'Session expired');
    }

    if (url === '/ranges' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const ranges = loadJSON('ranges.json');
      const userRanges = ranges.filter(r => r.numbers && r.numbers.some(n => user.assignedNumbers && user.assignedNumbers.includes(n))).map(r => ({ id: r.id, title: r.title, count: r.numbers ? r.numbers.filter(n => user.assignedNumbers.includes(n)).length : 0, minsAgo: Math.floor(Math.random() * 60) }));
      return ok(res, { ranges: userRanges });
    }

    if (url === '/numbers' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const ranges = loadJSON('ranges.json');
      const range = ranges.find(r => r.id === req.body.rangeId);
      if (!range || !range.numbers) return ok(res, { numbers: [] });
      const userNumbers = range.numbers.filter(n => user.assignedNumbers && user.assignedNumbers.includes(n));
      return ok(res, { numbers: userNumbers });
    }

    if (url === '/smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(LAMIX_API_URL, { params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 100 } });
      let allSms = [];
      if (Array.isArray(response.data.records)) allSms = response.data.records;
      else if (Array.isArray(response.data)) allSms = response.data;
      else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;
      const userSms = Array.isArray(allSms) ? allSms.filter(sms => user.assignedNumbers && user.assignedNumbers.includes(sms.num || sms.number)) : [];
      return ok(res, { count: userSms.length, recent: userSms.map(s => ({ time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text, range: 'Unknown' })) });
    }

    if (url === '/smscount-range' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { count: Math.floor(Math.random() * 50) });
    }

    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { users: [{ username: 'ZML_Ahsan', count: 45 }, { username: 'User_B', count: 32 }] });
    }

    if (url === '/number-smscount' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { number: req.body.number, count: Math.floor(Math.random() * 5), recent: [] });
    }

    if (url === '/dor' && req.method === 'POST') {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(LAMIX_API_URL, { params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 200 } });
      let allSms = [];
      if (Array.isArray(response.data.records)) allSms = response.data.records;
      else if (Array.isArray(response.data)) allSms = response.data;
      else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;
      return ok(res, { total: Array.isArray(allSms) ? allSms.length : 0, recent: Array.isArray(allSms) ? allSms.slice(0, 50).map(s => ({ time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text, range: 'Global' })) : [] });
    }

    if (url === '/alloc/verify-client' && req.method === 'POST') {
      return ok(res, { id: '101', name: 'ZML_Ahsan', panelNum: 1 });
    }

    if (url === '/alloc/search-ranges' && req.method === 'POST') {
      const ranges = loadJSON('ranges.json');
      return ok(res, { ranges: ranges.map(r => ({ id: r.id, title: r.title })) });
    }

    if (url === '/alloc/check-availability' && req.method === 'POST') {
      return ok(res, { available: 500, total: 500 });
    }

    if (url === '/alloc/allocate' && req.method === 'POST') {
      return ok(res, { allocated: req.body.qty || 5, used: 1, limit: 2, remaining: 1 });
    }

    return error(res, 404, 'Route not found');
  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};
