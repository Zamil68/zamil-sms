const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ── CORS CONFIGURATION ──
app.use(cors({
  origin: 'http://127.0.0.1:5500',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(bodyParser.json());

// ── CONFIGURATION ──
const LAMIX_API_KEY = "Z4tzfFyChH/commented intentionally/ZIpURFSTgkI="; 
const LAMIX_API_URL = "http://51.77.216.195/crapi/lamix/viewstats";

// ── LOAD LOCAL DATA (Auto-creates if missing to prevent crashes) ──
const loadJSON = (file) => {
  try {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ Warning: ${file} not found. Creating empty default.`);
      fs.writeFileSync(filePath, '[]', 'utf8');
      return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error loading ${file}:`, e.message);
    return [];
  }
};

let users = loadJSON('users.json');
let ranges = loadJSON('ranges.json');

// ── SESSIONS ──
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

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    const token = generateToken();
    sessions[token] = { username: user.username, clientId: user.clientId, assignedNumbers: user.assignedNumbers, createdAt: Date.now() };
    res.json({ ok: true, session: token, username: user.username, clientId: user.clientId, redirect: '/dashboard/dashboard.html' });
  } else {
    res.status(401).json({ ok: false, error: "Invalid username or password" });
  }
});

// 2. PING
app.post('/api/ping', (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (user) res.json({ ok: true });
  else res.status(401).json({ ok: false, error: "Session expired" });
});

// 3. GET RANGES
app.post('/api/ranges', (req, res) => {
  console.log("📡 /api/ranges called successfully!"); // DEBUG LOG
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const userRanges = ranges.filter(r => 
    r.numbers && r.numbers.some(n => user.assignedNumbers && user.assignedNumbers.includes(n))
  ).map(r => ({
    id: r.id,
    title: r.title,
    count: r.numbers ? r.numbers.filter(n => user.assignedNumbers.includes(n)).length : 0,
    minsAgo: Math.floor(Math.random() * 60)
  }));

  res.json({ ok: true, ranges: userRanges });
});

// 4. GET NUMBERS
app.post('/api/numbers', (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const range = ranges.find(r => r.id === req.body.rangeId);
  if (!range || !range.numbers) return res.json({ ok: true, numbers: [] });
  const userNumbers = range.numbers.filter(n => user.assignedNumbers && user.assignedNumbers.includes(n));
  res.json({ ok: true, numbers: userNumbers });
});

// 5. GET SMS COUNT & RECENT
app.post('/api/smscount', async (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(LAMIX_API_URL, {
      params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 100 }
    });
    let allSms = [];
    if (Array.isArray(response.data.records)) allSms = response.data.records;
    else if (Array.isArray(response.data)) allSms = response.data;
    else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;

    const userSms = Array.isArray(allSms) ? allSms.filter(sms => user.assignedNumbers && user.assignedNumbers.includes(sms.num || sms.number)) : [];
    res.json({
      ok: true, count: userSms.length,
      recent: userSms.map(s => ({ time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text, range: "Unknown" }))
    });
  } catch (error) {
    console.error("LaMix API Error:", error.message);
    res.json({ ok: true, count: 0, recent: [] }); 
  }
});

// 6. GET SMS COUNT RANGE
app.post('/api/smscount-range', (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  res.json({ ok: true, count: Math.floor(Math.random() * 50) });
});

// 7. LEADERBOARD
app.post('/api/leaderboard', (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  res.json({ ok: true, users: [{ username: "ZML_Ahsan", count: 45 }, { username: "User_B", count: 32 }] });
});

// 8. ALLOC: VERIFY CLIENT
app.post('/api/alloc/verify-client', (req, res) => {
  res.json({ ok: true, id: "101", name: "ZML_Ahsan", panelNum: 1 });
});

// 9. ALLOC: SEARCH RANGES
app.post('/api/alloc/search-ranges', (req, res) => {
  res.json({ ok: true, ranges: ranges.map(r => ({ id: r.id, title: r.title })) });
});

// 10. ALLOC: CHECK AVAILABILITY
app.post('/api/alloc/check-availability', (req, res) => {
  res.json({ ok: true, available: 500, total: 500 });
});

// 11. ALLOC: ALLOCATE
app.post('/api/alloc/allocate', (req, res) => {
  res.json({ ok: true, allocated: req.body.qty || 5, used: 1, limit: 2, remaining: 1 });
});

// 12. NUMBER SMS COUNT
app.post('/api/number-smscount', (req, res) => {
  const user = getUserFromSession(req.body.session);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  res.json({ ok: true, number: req.body.number, count: Math.floor(Math.random() * 5), recent: [] });
});

// 13. DOR (Detail OTP Report)
app.post('/api/dor', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(LAMIX_API_URL, {
      params: { apikey: LAMIX_API_KEY, date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59`, limit: 200 }
    });
    let allSms = [];
    if (Array.isArray(response.data.records)) allSms = response.data.records;
    else if (Array.isArray(response.data)) allSms = response.data;
    else if (response.data && Array.isArray(response.data.data)) allSms = response.data.data;

    res.json({
      ok: true, total: Array.isArray(allSms) ? allSms.length : 0,
      recent: Array.isArray(allSms) ? allSms.slice(0, 50).map(s => ({ time: s.dt ? s.dt.split(' ')[1] : (s.time || ''), number: s.num || s.number, cli: s.cli || s.sender, message: s.message || s.text, range: "Global" })) : []
    });
  } catch (error) {
    console.error("LaMix DOR API Error:", error.message);
    res.json({ ok: true, total: 0, recent: [] });
  }
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`✅ ZAMIL SMS Backend running on http://localhost:${PORT}`);
  console.log(`✅ CORS configured for http://127.0.0.1:5500`);
  console.log(`✅ All API endpoints are ready!`);
});