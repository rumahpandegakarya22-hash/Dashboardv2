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
const publicUser = (u) => ({ username: u.username, role: u.role, name: u.name, status: u.status, tfaEnabled: !!u.tfaEnabled });

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
app.use(express.json());
app.use(cookieParser());

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

/* ----------------------------------------------------------- REGISTER */
app.post("/api/register", authLimiter, async (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: "Nama, username, dan password wajib diisi" });
  if (String(username).trim().length < 3) return res.status(400).json({ error: "Username minimal 3 karakter" });
  if (String(password).length < 8) return res.status(400).json({ error: "Password minimal 8 karakter" });
  let users;
  try { users = await loadUsers(); } catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  if (findUser(users, username)) return res.status(409).json({ error: "Username sudah dipakai" });
  users.push({
    username: String(username).trim(), name: String(name).trim(),
    role: null,                  // role ditetapkan owner saat approve
    passwordHash: bcrypt.hashSync(String(password), 10),
    status: "pending",
    tfaEnabled: false, tfaSecret: null,
    createdAt: new Date().toISOString(),
  });
  try { await saveUsers(users); } catch { return res.status(500).json({ error: "Gagal menyimpan akun" }); }
  res.status(201).json({ ok: true, message: "Akun dibuat. Menunggu persetujuan Owner sebelum bisa login." });
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
  const title = name || `${role}-doc-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}`;
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

/* ---- GET /api/sheets  → data live dari spreadsheet (read-only, cached) ---- */
app.get("/api/sheets", requireAuth, async (_req, res) => {
  if (!sheetsApi || !spreadsheetId) return res.json({ configured: false, sheets: {} });
  try {
    const sheets = await readAllSheets();
    res.json({ configured: true, sheets });
  } catch (e) {
    res.status(502).json({ configured: true, error: "Gagal membaca spreadsheet: " + e.message, sheets: {} });
  }
});

/* ---- GET /api/health  → diagnosa konfigurasi (tanpa membocorkan rahasia) ---- */
app.get("/api/health", async (_req, res) => {
  const out = {
    ok: true,
    nodeEnv: process.env.NODE_ENV || null,
    hasJwtEnv: !!process.env.JWT_SECRET,
    redisConfigured: USE_REDIS,
    // diagnosa nama env (TANPA value) untuk mendeteksi nama/scope/project yang salah
    storageEnvKeys: Object.keys(process.env).filter((k) => /upstash|redis|kv_/i.test(k)),
    totalEnvKeys: Object.keys(process.env).length,
    urlLen: REDIS_URL.length,
    tokenLen: REDIS_TOKEN.length,
    // diagnosa integrasi Google Sheets (data live dashboard)
    sheetsConfigured: !!sheetsApi,
    sheetsSource,
    hasServiceAccountEnv: !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GCP_SERVICE_ACCOUNT_JSON),
    spreadsheetIdSet: !!spreadsheetId,
  };
  if (USE_REDIS) {
    try { await redisGet("ktd:health"); out.redisOk = true; }
    catch (e) { out.redisOk = false; out.redisError = e.message; }
  } else {
    out.note = "Upstash belum dikonfigurasi — server pakai file (gagal di FS read-only seperti Vercel). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN lalu redeploy.";
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
