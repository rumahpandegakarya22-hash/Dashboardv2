/* =========================================================================
   Kost Tiga Dara — Backend Auth Server
   Express + bcryptjs + JWT (httpOnly cookie). Serves the static front-end
   from /public and exposes the /api endpoints.

   Auth flow (no credentials are ever exposed to the front-end):
     POST /api/register        → buat akun baru (status: pending, perlu di-ACC)
     POST /api/login           → verifikasi password; jika 2FA aktif → minta OTP
     POST /api/login/tfa       → verifikasi OTP (TOTP) → terbitkan sesi
     POST /api/logout          → hapus sesi
     GET  /api/me              → pulihkan sesi
     POST /api/tfa/setup       → buat secret TOTP + QR (data URL)
     POST /api/tfa/enable      → aktifkan 2FA setelah verifikasi OTP
     POST /api/tfa/disable     → matikan 2FA (verifikasi OTP)
     GET  /api/users           → (owner) daftar akun
     POST /api/users/approve   → (owner) setujui akun + tetapkan role
     POST /api/users/disable   → (owner) nonaktifkan akun
     POST /api/documents       → buat Sheet/Doc baru di folder Drive role
     GET  /api/sheets          → data live dari Google Spreadsheet (read-only)

   Credentials live in /data/users.json (bcrypt-hashed, seeded on first run).
   ========================================================================= */
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
// DATA_DIR dapat di-override (mis. Railway Volume mount: DATA_DIR=/data) agar
// users.json + .jwt-secret persisten antar-deploy.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, ".jwt-secret");

const PORT = process.env.PORT || 5512;
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE = "ktd_session";
const TOKEN_TTL = "8h";
const COOKIE_MAXAGE = 8 * 60 * 60 * 1000; // 8 jam
const TFA_TICKET_TTL = "5m"; // jendela untuk memasukkan OTP saat login
const ROLES = ["owner", "admin", "marketing", "operasional", "sales"];
const APP_NAME = "Kost Tiga Dara";

/* ---- akun bawaan (hanya untuk seed pertama kali) ----
   TIDAK ada password hardcoded. Password diambil dari env (mis. OWNER_PASSWORD),
   atau di-generate ACAK saat seed dan dicetak sekali ke log server. */
const SEED = [
  { username: "owner",       role: "owner",       name: "Owner" },
  { username: "admin",       role: "admin",       name: "Admin & Keuangan" },
  { username: "marketing",   role: "marketing",   name: "Marketing" },
  { username: "operasional", role: "operasional", name: "Operasional" },
  { username: "sales",       role: "sales",       name: "Sales" },
];
// password seed: dari env <ROLE>_PASSWORD bila ada; jika tidak, acak (dicetak sekali)
function seedPassword(role) {
  const fromEnv = process.env[`${role.toUpperCase()}_PASSWORD`];
  if (fromEnv) return fromEnv;
  const gen = crypto.randomBytes(9).toString("base64url");
  console.log(`[seed] password "${role}" di-generate acak (GANTI segera / set env ${role.toUpperCase()}_PASSWORD): ${gen}`);
  return gen;
}

/* ----------------------------------------------------------- bootstrap */
/* Penyimpanan akun bisa pakai Upstash Redis (gratis, persisten — untuk hosting
   free seperti Render yang filesystem-nya ephemeral) ATAU file lokal data/users.json.
   Mode Redis aktif bila env UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN diisi. */
// Terima beberapa konvensi nama (manual Upstash ATAU integrasi Vercel/KV otomatis)
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_REST_URL || "").replace(/\/$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.REDIS_REST_TOKEN || "";
const USE_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const REDIS_KEY = "ktd:users";

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function seedUsers() {
  return SEED.map((u) => ({
    username: u.username, role: u.role, name: u.name,
    email: process.env[`${u.role.toUpperCase()}_EMAIL`] || null, // utk reset OTP; set via env bila perlu
    passwordHash: bcrypt.hashSync(seedPassword(u.role), 10),
    status: "active",              // active | pending | disabled
    tfaEnabled: false, tfaSecret: null,
    createdAt: new Date().toISOString(),
  }));
}
// upgrade skema akun lama (sebelum kolom status/2FA ada) tanpa mengubah kredensial
function applyMigrations(users) {
  let changed = false;
  for (const u of users) {
    if (u.status === undefined) { u.status = "active"; changed = true; }
    if (u.tfaEnabled === undefined) { u.tfaEnabled = false; changed = true; }
    if (u.tfaSecret === undefined) { u.tfaSecret = null; changed = true; }
    if (u.email === undefined) { u.email = null; changed = true; }
  }
  return changed;
}

async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!r.ok) throw new Error("Redis GET " + r.status);
  return (await r.json()).result; // string | null
}
async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: value });
  if (!r.ok) throw new Error("Redis SET " + r.status);
}

// Baca akun dari sumber kebenaran (Redis di serverless, atau file lokal). Tidak
// memakai cache in-memory agar konsisten di lingkungan serverless (Vercel).
async function loadUsers() {
  if (USE_REDIS) {
    const raw = await redisGet(REDIS_KEY);
    if (!raw) { const seeded = seedUsers(); await redisSet(REDIS_KEY, JSON.stringify(seeded)); return seeded; }
    const users = JSON.parse(raw);
    if (applyMigrations(users)) await redisSet(REDIS_KEY, JSON.stringify(users));
    return users;
  }
  ensureDir();
  if (!fs.existsSync(USERS_FILE)) { const seeded = seedUsers(); fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2)); return seeded; }
  const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  if (applyMigrations(users)) fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  return users;
}
async function saveUsers(u) {
  if (USE_REDIS) { await redisSet(REDIS_KEY, JSON.stringify(u)); }
  else { ensureDir(); fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
}

/* ---- KV singkat berdurasi (OTP & pending registrasi) ----
   Redis: kirim command sebagai array JSON ke root URL (aman utk nilai apa pun + TTL).
   Tanpa Redis (dev lokal): simpan di memori proses. */
const MEM = new Map();
async function redisCmd(args) {
  const r = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error("Redis " + args[0] + " " + r.status);
  return (await r.json()).result;
}
async function kvPut(key, value, ttlSec) {
  if (USE_REDIS) return redisCmd(["SET", key, value, "EX", String(ttlSec)]);
  MEM.set(key, { value, exp: Date.now() + ttlSec * 1000 });
}
async function kvGet(key) {
  if (USE_REDIS) return redisCmd(["GET", key]);
  const e = MEM.get(key); if (!e) return null; if (e.exp < Date.now()) { MEM.delete(key); return null; } return e.value;
}
async function kvDel(key) { if (USE_REDIS) return redisCmd(["DEL", key]); MEM.delete(key); }

/* ---- Email via Resend (HTTP API). Tanpa RESEND_API_KEY → log ke konsol (mode dev). ---- */
async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`;
  if (!key) { console.log(`\n[mail:DEV] (set RESEND_API_KEY untuk kirim sungguhan)\n  to: ${to}\n  subj: ${subject}\n  ${String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n`); return { dev: true }; }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, html }) });
  if (!r.ok) throw new Error("Gagal mengirim email (" + r.status + ")");
  return r.json();
}
const genOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const otpHtml = (kode, ctx) => `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:8px">
  <h2 style="color:#C92D31;margin:0 0 6px">${APP_NAME}</h2>
  <p style="margin:0 0 4px">Kode OTP untuk <b>${ctx}</b>:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:10px;margin:10px 0;color:#111">${kode}</p>
  <p style="color:#666;font-size:13px;margin:0">Berlaku 10 menit. Jangan bagikan kode ini. Jika Anda tidak meminta, abaikan email ini.</p>
</div>`;
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
const normEmail = (e) => String(e || "").trim().toLowerCase();
const findByEmail = (users, email) => users.find((u) => normEmail(u.email) && normEmail(u.email) === normEmail(email));

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET; // WAJIB di serverless (Vercel) — FS read-only
  try {
    ensureDir();
    if (!fs.existsSync(SECRET_FILE)) {
      fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("hex"));
      console.log("[seed] data/.jwt-secret dibuat.");
    }
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch (e) {
    console.warn("[warn] tak bisa menulis .jwt-secret (FS read-only?) — pakai secret sementara. SET env JWT_SECRET!");
    return crypto.randomBytes(48).toString("hex");
  }
}
const findUser = (users, username) =>
  users.find((u) => u.username.toLowerCase() === String(username).toLowerCase().trim());
// data yang aman dikirim ke klien (tanpa hash/secret)
const publicUser = (u) => ({ username: u.username, role: u.role, name: u.name, status: u.status, tfaEnabled: !!u.tfaEnabled, email: u.email || null });

const SECRET = getSecret();
if (IS_PROD && !process.env.JWT_SECRET) {
  console.warn("[warn] NODE_ENV=production tetapi JWT_SECRET belum di-set sebagai env — pakai data/.jwt-secret (akan rotasi jika filesystem ephemeral!). Set JWT_SECRET.");
}
if (IS_PROD && !USE_REDIS) {
  console.warn("[warn] Produksi tanpa Upstash Redis — akun disimpan di file (bisa hilang saat redeploy di host gratis). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.");
}

/* ---- optional Google Drive integration (tambah dokumen per role) ---- */
const DRIVE_CFG_FILE = path.join(DATA_DIR, "drive-config.json");
let drive = null, driveFolders = {};
(function initDrive() {
  try {
    if (!fs.existsSync(DRIVE_CFG_FILE)) { console.log("[drive] data/drive-config.json belum ada — fitur tambah dokumen pakai fallback."); return; }
    const cfg = JSON.parse(fs.readFileSync(DRIVE_CFG_FILE, "utf8"));
    const keyPath = path.isAbsolute(cfg.serviceAccountKeyPath) ? cfg.serviceAccountKeyPath : path.join(ROOT, cfg.serviceAccountKeyPath);
    if (!fs.existsSync(keyPath)) { console.warn("[drive] service account key tidak ditemukan:", keyPath); return; }
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({ keyFile: keyPath, scopes: ["https://www.googleapis.com/auth/drive"] });
    drive = google.drive({ version: "v3", auth });
    driveFolders = cfg.folders || {};
    console.log("[drive] Google Drive integration AKTIF.");
  } catch (e) { console.warn("[drive] gagal inisialisasi:", e.message); }
})();

/* ---- optional Google Sheets integration (data live dashboard, read-only) ----
   Konfigurasi: data/sheets-config.json
     { "spreadsheetId": "....", "serviceAccountKeyPath": "data/service-account.json" }
   Service account harus diberi akses (Viewer) ke spreadsheet Rumah_Pandega_LIVE_v2. */
const SHEETS_CFG_FILE = path.join(DATA_DIR, "sheets-config.json");
// Spreadsheet Rumah_Pandega_LIVE_v2 (ID bukan rahasia — yang rahasia hanya service account)
const DEFAULT_SPREADSHEET_ID = "1-xXweqO9IO6s0EQqF0fc7EKSybvn5CUSD601-Dvj328";
let sheetsApi = null, spreadsheetId = null, sheetsSource = "snapshot";
let sheetsCache = { at: 0, data: null };
const SHEETS_TTL = 5 * 60 * 1000; // cache 5 menit
(function initSheets() {
  try {
    const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
    // 1) Kredensial service account: dari ENV (Vercel/serverless) ATAU file lokal.
    let credentials = null, keyFile = null;
    const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
    const envB64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GCP_SERVICE_ACCOUNT_B64;
    if (envJson) credentials = JSON.parse(envJson);
    else if (envB64) credentials = JSON.parse(Buffer.from(envB64, "base64").toString("utf8"));
    // 2) Spreadsheet ID: ENV → file config → default.
    spreadsheetId = process.env.SHEETS_SPREADSHEET_ID || process.env.SPREADSHEET_ID || null;
    // 3) Fallback ke file lokal bila ENV tidak lengkap.
    if ((!credentials || !spreadsheetId) && fs.existsSync(SHEETS_CFG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(SHEETS_CFG_FILE, "utf8"));
      if (!spreadsheetId) spreadsheetId = cfg.spreadsheetId;
      if (!credentials) {
        const keyRel = cfg.serviceAccountKeyPath || "data/service-account.json";
        const keyPath = path.isAbsolute(keyRel) ? keyRel : path.join(ROOT, keyRel);
        if (fs.existsSync(keyPath)) keyFile = keyPath;
      }
    }
    if (!spreadsheetId) spreadsheetId = DEFAULT_SPREADSHEET_ID;
    if (!credentials && !keyFile) {
      console.log("[sheets] kredensial service account belum ada (set ENV GOOGLE_SERVICE_ACCOUNT_JSON) — dashboard pakai snapshot bawaan.");
      return;
    }
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth(credentials ? { credentials, scopes: SCOPES } : { keyFile, scopes: SCOPES });
    sheetsApi = google.sheets({ version: "v4", auth });
    sheetsSource = credentials ? "env" : "file";
    console.log("[sheets] Google Sheets integration AKTIF (read-only, sumber kredensial: " + sheetsSource + ").");
  } catch (e) { console.warn("[sheets] gagal inisialisasi:", e.message); }
})();

async function readAllSheets() {
  if (sheetsCache.data && Date.now() - sheetsCache.at < SHEETS_TTL) return sheetsCache.data;
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const titles = (meta.data.sheets || []).map((s) => s.properties.title);
  const resp = await sheetsApi.spreadsheets.values.batchGet({ spreadsheetId, ranges: titles, valueRenderOption: "FORMATTED_VALUE" });
  const out = {};
  (resp.data.valueRanges || []).forEach((vr, i) => { out[titles[i]] = vr.values || []; });
  sheetsCache = { at: Date.now(), data: out };
  return out;
}

/* -------------------------------------------------------------- app */
const app = express();
app.set("trust proxy", 1); // di belakang proxy Railway (rate-limit & secure cookie)
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" })); // batasi ukuran body (anti payload besar)
app.use(cookieParser());

// Security headers + Content-Security-Policy (defense-in-depth terhadap XSS/clickjacking).
// script-src 'self' memblokir inline-script & URL javascript:; style 'unsafe-inline' + Google Fonts
// diizinkan karena UI memakai style attribut & font Inter; img data: untuk QR code 2FA.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
  ].join("; "));
  next();
});

const cookieOpts = { httpOnly: true, sameSite: "lax", secure: IS_PROD, maxAge: COOKIE_MAXAGE };
function issueSession(res, user) {
  const payload = { username: user.username, role: user.role, name: user.name };
  const token = jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE, token, cookieOpts);
  return payload;
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: "Belum login" });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.clearCookie(COOKIE); return res.status(401).json({ error: "Sesi berakhir, silakan login lagi" }); }
}
function requireOwner(req, res, next) {
  if (req.user?.role !== "owner") return res.status(403).json({ error: "Hanya Owner yang diizinkan" });
  next();
}

// rate limit: cegah brute-force pada endpoint sensitif
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
});

/* ----------------------------------------------------------- REGISTER (step 1: kirim OTP email) */
app.post("/api/register", authLimiter, async (req, res) => {
  const { username, password, name, email } = req.body || {};
  if (!username || !password || !name || !email) return res.status(400).json({ error: "Nama, username, email, dan password wajib diisi" });
  const uname = String(username).trim(), uname_name = String(name).trim();
  if (uname.length < 3 || uname.length > 32) return res.status(400).json({ error: "Username 3–32 karakter" });
  if (!/^[a-zA-Z0-9._-]+$/.test(uname)) return res.status(400).json({ error: "Username hanya boleh huruf, angka, titik, garis bawah, dan strip" });
  if (uname_name.length < 1 || uname_name.length > 60) return res.status(400).json({ error: "Nama maksimal 60 karakter" });
  if (!validEmail(email)) return res.status(400).json({ error: "Format email tidak valid" });
  if (String(password).length < 8 || String(password).length > 200) return res.status(400).json({ error: "Password 8–200 karakter" });
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  if (findUser(users, username)) return res.status(409).json({ error: "Username sudah dipakai" });
  if (findByEmail(users, email)) return res.status(409).json({ error: "Email sudah terdaftar" });
  // simpan pending registrasi + OTP (belum membuat akun sampai email terverifikasi)
  const otp = genOtp();
  const pending = { username: uname, name: uname_name, email: normEmail(email), passwordHash: bcrypt.hashSync(String(password), 10), otpHash: bcrypt.hashSync(otp, 10), attempts: 0 };
  try {
    await kvPut("ktd:reg:" + uname.toLowerCase(), JSON.stringify(pending), 900); // 15 menit
    await sendMail(normEmail(email), `${APP_NAME} — Kode verifikasi pendaftaran`, otpHtml(otp, "verifikasi pendaftaran"));
  } catch (e) { return res.status(502).json({ error: "Gagal mengirim OTP. Coba lagi nanti." }); }
  res.status(200).json({ ok: true, needVerify: true, username: uname, message: "Kode OTP dikirim ke email Anda. Masukkan untuk menyelesaikan pendaftaran." });
});

/* ----------------------------------------------------------- REGISTER (step 2: verifikasi OTP → buat akun) */
app.post("/api/register/verify", authLimiter, async (req, res) => {
  const { username, otp } = req.body || {};
  if (!username || !otp) return res.status(400).json({ error: "Username dan kode OTP wajib diisi" });
  const key = "ktd:reg:" + String(username).toLowerCase().trim();
  let raw; try { raw = await kvGet(key); } catch { return res.status(500).json({ error: "Gagal memproses" }); }
  if (!raw) return res.status(410).json({ error: "Kode kedaluwarsa. Silakan daftar ulang." });
  const p = JSON.parse(raw);
  if (p.attempts >= 5) { await kvDel(key); return res.status(429).json({ error: "Terlalu banyak percobaan. Daftar ulang." }); }
  if (!bcrypt.compareSync(String(otp).trim(), p.otpHash)) { p.attempts++; await kvPut(key, JSON.stringify(p), 900); return res.status(401).json({ error: "Kode OTP salah" }); }
  let users; try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  if (findUser(users, p.username)) { await kvDel(key); return res.status(409).json({ error: "Username sudah dipakai" }); }
  users.push({ username: p.username, name: p.name, email: p.email, role: null, passwordHash: p.passwordHash, status: "pending", tfaEnabled: false, tfaSecret: null, createdAt: new Date().toISOString() });
  try { await saveUsers(users); await kvDel(key); } catch { return res.status(500).json({ error: "Gagal menyimpan akun" }); }
  res.status(201).json({ ok: true, message: "Email terverifikasi. Akun dibuat — menunggu persetujuan Owner sebelum bisa login." });
});

/* ----------------------------------------------------------- REGISTER (kirim ulang OTP) */
app.post("/api/register/resend", authLimiter, async (req, res) => {
  const { username } = req.body || {};
  const key = "ktd:reg:" + String(username || "").toLowerCase().trim();
  let raw; try { raw = await kvGet(key); } catch { return res.status(500).json({ error: "Gagal memproses" }); }
  if (!raw) return res.status(410).json({ error: "Sesi pendaftaran kedaluwarsa. Daftar ulang." });
  const p = JSON.parse(raw); const otp = genOtp(); p.otpHash = bcrypt.hashSync(otp, 10); p.attempts = 0;
  try { await kvPut(key, JSON.stringify(p), 900); await sendMail(p.email, `${APP_NAME} — Kode verifikasi pendaftaran`, otpHtml(otp, "verifikasi pendaftaran")); }
  catch { return res.status(502).json({ error: "Gagal mengirim OTP" }); }
  res.json({ ok: true, message: "OTP baru dikirim." });
});

/* ----------------------------------------------------------- LUPA PASSWORD (step 1: kirim OTP) */
app.post("/api/forgot", authLimiter, async (req, res) => {
  const { username, email } = req.body || {};
  // Respons SELALU generik (jangan bocorkan apakah akun/email ada)
  const generic = { ok: true, message: "Jika username & email cocok, kode OTP telah dikirim ke email tersebut." };
  if (!username || !email) return res.status(400).json({ error: "Username dan email wajib diisi" });
  try {
    const users = await loadUsers();
    const user = findUser(users, username);
    if (user && user.status !== "disabled" && normEmail(user.email) && normEmail(user.email) === normEmail(email)) {
      const otp = genOtp();
      await kvPut("ktd:reset:" + user.username.toLowerCase(), JSON.stringify({ email: normEmail(user.email), otpHash: bcrypt.hashSync(otp, 10), attempts: 0 }), 600); // 10 menit
      await sendMail(normEmail(user.email), `${APP_NAME} — Kode reset password`, otpHtml(otp, "reset password"));
    }
  } catch { /* tetap balas generik */ }
  res.json(generic);
});

/* ----------------------------------------------------------- LUPA PASSWORD (step 2: verifikasi OTP → set password) */
app.post("/api/reset", authLimiter, async (req, res) => {
  const { username, email, otp, newPassword } = req.body || {};
  if (!username || !email || !otp || !newPassword) return res.status(400).json({ error: "Username, email, OTP, dan password baru wajib diisi" });
  if (String(newPassword).length < 8 || String(newPassword).length > 200) return res.status(400).json({ error: "Password baru 8–200 karakter" });
  const key = "ktd:reset:" + String(username).toLowerCase().trim();
  let raw; try { raw = await kvGet(key); } catch { return res.status(500).json({ error: "Gagal memproses" }); }
  if (!raw) return res.status(410).json({ error: "Kode kedaluwarsa atau tidak ditemukan. Minta OTP lagi." });
  const r = JSON.parse(raw);
  if (r.attempts >= 5) { await kvDel(key); return res.status(429).json({ error: "Terlalu banyak percobaan. Minta OTP lagi." }); }
  if (normEmail(email) !== r.email || !bcrypt.compareSync(String(otp).trim(), r.otpHash)) { r.attempts++; await kvPut(key, JSON.stringify(r), 600); return res.status(401).json({ error: "Email atau kode OTP salah" }); }
  let users; try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, username);
  if (!user || normEmail(user.email) !== r.email) { await kvDel(key); return res.status(400).json({ error: "Akun tidak cocok" }); }
  user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  try { await saveUsers(users); await kvDel(key); } catch { return res.status(500).json({ error: "Gagal menyimpan" }); }
  res.json({ ok: true, message: "Password berhasil diubah. Silakan login dengan password baru." });
});

/* ----------------------------------------------------------- LOGIN (step 1) */
app.post("/api/login", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username dan password wajib diisi" });
  let user;
  try { user = findUser(await loadUsers(), username); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Username atau password salah" });
  }
  if (user.status === "pending") return res.status(403).json({ error: "Akun belum disetujui Owner" });
  if (user.status === "disabled") return res.status(403).json({ error: "Akun dinonaktifkan" });

  if (user.tfaEnabled) {
    // jangan terbitkan sesi dulu — kirim tiket singkat untuk langkah OTP
    const ticket = jwt.sign({ username: user.username, purpose: "tfa" }, SECRET, { expiresIn: TFA_TICKET_TTL });
    return res.json({ tfaRequired: true, ticket });
  }
  res.json(issueSession(res, user));
});

/* ----------------------------------------------------------- LOGIN (step 2: OTP) */
app.post("/api/login/tfa", authLimiter, async (req, res) => {
  const { ticket, token } = req.body || {};
  if (!ticket || !token) return res.status(400).json({ error: "Tiket dan kode OTP wajib diisi" });
  let claims;
  try { claims = jwt.verify(ticket, SECRET); } catch { return res.status(401).json({ error: "Sesi OTP kedaluwarsa, login ulang" }); }
  if (claims.purpose !== "tfa") return res.status(400).json({ error: "Tiket tidak valid" });
  const user = findUser(await loadUsers(), claims.username);
  if (!user || !user.tfaEnabled) return res.status(400).json({ error: "2FA tidak aktif untuk akun ini" });
  const ok = speakeasy.totp.verify({ secret: user.tfaSecret, encoding: "base32", token: String(token).trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  res.json(issueSession(res, user));
});

/* ----------------------------------------------------------- LOGOUT / ME */
app.post("/api/logout", (_req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
app.get("/api/me", requireAuth, async (req, res) => {
  let u;
  try { u = findUser(await loadUsers(), req.user.username); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  if (!u || u.status !== "active") { res.clearCookie(COOKIE); return res.status(401).json({ error: "Akun tidak aktif" }); }
  res.json(publicUser(u));
});

/* ----------------------------------------------------------- 2FA setup */
app.post("/api/tfa/setup", requireAuth, async (req, res) => {
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, req.user.username);
  if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
  const secret = speakeasy.generateSecret({ name: `${APP_NAME} (${user.username})`, length: 20 });
  user.tfaPendingSecret = secret.base32; // belum aktif sampai diverifikasi
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  try {
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qr, secret: secret.base32 }); // secret base32 untuk entri manual di authenticator
  } catch {
    res.json({ qr: null, secret: secret.base32 });
  }
});
app.post("/api/tfa/enable", requireAuth, async (req, res) => {
  const { token } = req.body || {};
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, req.user.username);
  if (!user || !user.tfaPendingSecret) return res.status(400).json({ error: "Mulai setup 2FA terlebih dahulu" });
  const ok = speakeasy.totp.verify({ secret: user.tfaPendingSecret, encoding: "base32", token: String(token || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  user.tfaSecret = user.tfaPendingSecret; user.tfaEnabled = true; delete user.tfaPendingSecret;
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  res.json({ ok: true, tfaEnabled: true });
});
app.post("/api/tfa/disable", requireAuth, async (req, res) => {
  const { token } = req.body || {};
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, req.user.username);
  if (!user || !user.tfaEnabled) return res.status(400).json({ error: "2FA belum aktif" });
  const ok = speakeasy.totp.verify({ secret: user.tfaSecret, encoding: "base32", token: String(token || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  user.tfaEnabled = false; user.tfaSecret = null; delete user.tfaPendingSecret;
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  res.json({ ok: true, tfaEnabled: false });
});

/* ----------------------------------------------------------- ganti password */
app.post("/api/password", requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "Password lama & baru wajib diisi" });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "Password baru minimal 8 karakter" });
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, req.user.username);
  if (!user || !bcrypt.compareSync(String(oldPassword), user.passwordHash)) {
    return res.status(401).json({ error: "Password lama salah" });
  }
  user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  res.json({ ok: true });
});

/* ----------------------------------------------------------- owner: kelola akun */
app.get("/api/users", requireAuth, requireOwner, async (_req, res) => {
  try { res.json((await loadUsers()).map(publicUser)); }
  catch { res.status(500).json({ error: "Gagal membaca data akun" }); }
});
app.post("/api/users/approve", requireAuth, requireOwner, async (req, res) => {
  const { username, role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid" });
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, username);
  if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
  user.role = role; user.status = "active";
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  res.json({ ok: true, user: publicUser(user) });
});
app.post("/api/users/disable", requireAuth, requireOwner, async (req, res) => {
  const { username } = req.body || {};
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const user = findUser(users, username);
  if (!user) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (user.username === req.user.username) return res.status(400).json({ error: "Tidak bisa menonaktifkan akun sendiri" });
  user.status = "disabled";
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan data" }); }
  res.json({ ok: true, user: publicUser(user) });
});

/* ---- POST /api/documents  → buat Sheet/Doc baru di folder Drive role ---- */
app.post("/api/documents", requireAuth, async (req, res) => {
  const role = req.user.role;
  const { type = "sheet", name } = req.body || {};
  if (type !== "sheet" && type !== "doc") return res.status(400).json({ error: "Tipe dokumen tidak valid" });
  // judul: buang karakter kontrol/baris-baru, batasi 100 karakter
  const cleaned = String(name || "").split("").filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("").trim().slice(0, 100);
  const title = cleaned || `${role}-doc-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}`;
  if (!drive || !driveFolders[role]) {
    return res.status(503).json({ error: "Integrasi Google Drive belum dikonfigurasi di server.", setup: true });
  }
  try {
    const mimeType = type === "doc" ? "application/vnd.google-apps.document" : "application/vnd.google-apps.spreadsheet";
    const file = await drive.files.create({
      requestBody: { name: title, mimeType, parents: [driveFolders[role]] },
      fields: "id,name,webViewLink",
    });
    res.json({ id: file.data.id, name: file.data.name, url: file.data.webViewLink });
  } catch (e) {
    res.status(500).json({ error: "Gagal membuat file di Drive: " + e.message });
  }
});

/* ---- Akses data per role (RLS) ----
   Tiap role hanya menerima tab yang relevan; finance (3_KEUANGAN) hanya untuk
   owner & admin. Kolom PII penghuni (email/kontak/tgl lahir) disembunyikan dari
   role non-owner/admin. Owner = semua. Filter dilakukan di SERVER (klien tak
   bisa di-bypass). */
const SHEET_ACCESS = {
  admin:       [/penghuni/i, /keuangan|transaksi|jurnal|kas\b/i, /vendor/i, /dokumen/i, /logbook/i, /parameter/i, /akun|coa/i, /kamar/i],
  marketing:   [/leads/i, /survey/i, /post/i, /promo/i, /marketing/i, /dokumen/i, /logbook/i, /parameter/i, /kamar/i, /penghuni/i],
  sales:       [/leads/i, /survey/i, /booking/i, /penghuni/i, /kamar/i, /dokumen/i, /logbook/i, /parameter/i],
  operasional: [/preventive|corrective|maintenance|inspeksi|perawatan|perbaikan/i, /vendor/i, /kamar/i, /penghuni/i, /dokumen/i, /logbook/i, /parameter/i],
};
const PII_COLS = /email|kontak|darurat|nama kontak|tgl lahir|tanggal lahir|usia/i;
function filterSheetsForRole(sheets, role) {
  if (role === "owner") return sheets;
  const allow = SHEET_ACCESS[role] || [];
  const out = {};
  for (const [title, rows] of Object.entries(sheets)) {
    if (!allow.some((re) => re.test(title))) continue; // tab tidak diizinkan untuk role ini
    if (/penghuni/i.test(title) && role !== "admin" && Array.isArray(rows) && rows.length) {
      const header = (rows[0] || []).map((h) => String(h));
      const drop = header.map((h, i) => (PII_COLS.test(h) ? i : -1)).filter((i) => i >= 0);
      out[title] = drop.length ? rows.map((r) => r.filter((_, i) => !drop.includes(i))) : rows;
    } else {
      out[title] = rows;
    }
  }
  return out;
}

/* ---- GET /api/sheets  → data live dari spreadsheet (read-only, cached, di-RLS) ---- */
app.get("/api/sheets", requireAuth, async (req, res) => {
  if (!sheetsApi || !spreadsheetId) return res.json({ configured: false, sheets: {} });
  try {
    const sheets = await readAllSheets();
    res.json({ configured: true, sheets: filterSheetsForRole(sheets, req.user.role) });
  } catch (e) {
    res.status(502).json({ configured: true, error: "Gagal membaca spreadsheet: " + e.message, sheets: {} });
  }
});

/* ---- GET /api/health  → diagnosa konfigurasi (tanpa membocorkan rahasia) ---- */
app.get("/api/health", async (_req, res) => {
  // Hanya boolean status — TIDAK membocorkan nama env, jumlah, panjang token, atau pesan error
  // mentah (mengurangi recon untuk penyerang). Cukup untuk cek "hidup & terkonfigurasi".
  const out = {
    ok: true,
    redisConfigured: USE_REDIS,
    sheetsConfigured: !!sheetsApi,
  };
  if (USE_REDIS) {
    try { await redisGet("ktd:health"); out.redisOk = true; }
    catch { out.redisOk = false; }
  }
  res.json(out);
});

/* ---- static front-end (only /public is exposed) ---- */
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// Jalankan listener hanya saat dieksekusi langsung (lokal / host persisten).
// Di serverless (Vercel), modul ini di-import dan `app` dipakai sebagai handler.
if (require.main === module) {
  app.listen(PORT, () => console.log(`${APP_NAME} dashboard → http://localhost:${PORT}  (${IS_PROD ? "production" : "development"})`));
}
module.exports = app;
