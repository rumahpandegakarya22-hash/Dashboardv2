/* =========================================================================
   Kost Tiga Dara — Backend Server
   Express + Clerk (password, sesi, verifikasi email, lupa password — semua
   gratis di Clerk) + 2FA/TOTP KUSTOM (Google Authenticator) buatan sendiri,
   karena MFA bawaan Clerk hanya tersedia di paket Pro berbayar.
   Serves the static front-end from /public and exposes the /api endpoints.

   Auth flow:
     (frontend, langsung ke Clerk via @clerk/clerk-js — lihat public/app.js)
       - Daftar akun baru (email+password, verifikasi email via kode)
       - Login (password) — sesi Clerk terbit begitu password benar
       - Lupa password (kode via email)
       - Ganti password sendiri
     (backend, endpoint kita — 2FA kustom, TIDAK lewat Clerk)
       - Setelah password benar, JIKA user sudah aktifkan 2FA, backend
         menahan akses (lihat requireAuth) sampai kode TOTP diverifikasi
         lewat POST /api/totp/verify → baru itu server menerbitkan cookie
         step-up pendek (ktd_2fa, httpOnly, ditandatangani, terikat ke sesi
         Clerk yang sedang aktif — BUKAN sesi/JWT pengganti Clerk).
       - Secret TOTP disimpan di Clerk **privateMetadata** (hanya bisa
         dibaca/ditulis lewat Backend API pakai Secret Key — tidak pernah
         terekspos ke browser), dihasilkan & diverifikasi pakai `speakeasy`.
       GET  /api/config          → publishable key Clerk (aman utk publik)
       GET  /api/me              → profil akun aktif (role/status dari Clerk)
       POST /api/totp/setup      → buat secret TOTP baru (QR + kode manual)
       POST /api/totp/enable     → verifikasi kode → aktifkan 2FA
       POST /api/totp/disable    → verifikasi kode → matikan 2FA
       POST /api/totp/verify     → verifikasi kode saat login → cookie step-up
       GET  /api/users           → (owner) daftar akun, dari Clerk Backend API
       POST /api/users/approve   → (owner) setujui akun + tetapkan role
       POST /api/users/disable   → (owner) nonaktifkan akun (Clerk banUser)
       POST /api/webhooks/clerk  → Clerk mengirim event user.created →
                                    akun baru otomatis diberi status "pending"
                                    + di-ban (tak bisa login) sampai di-ACC Owner
       POST /api/documents       → buat Sheet/Doc baru di folder Drive role
       GET  /api/sheets          → data live (Turso atau Google Sheets, RLS)

   Role & status approval disimpan di Clerk publicMetadata (role, status),
   BUKAN di server kita — RLS (SHEET_ACCESS) dan alur approval TIDAK BERUBAH.
   ========================================================================= */
"use strict";

// Muat .env bila ada (opsional — tidak wajib untuk deploy yang set ENV langsung)
try { require("dotenv").config(); } catch (_) { /* dotenv opsional */ }

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const rateLimit = require("express-rate-limit");
const { clerkMiddleware, getAuth, clerkClient } = require("@clerk/express");
const { Webhook } = require("svix");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
// DATA_DIR dipakai untuk config Drive/Sheets opsional (BUKAN untuk akun lagi — akun 100% di Clerk).
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");

const PORT = process.env.PORT || 5512;
const IS_PROD = process.env.NODE_ENV === "production";
const ROLES = ["owner", "admin", "marketing", "operasional", "sales"];
const APP_NAME = "Kost Tiga Dara";

if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
  console.warn("[clerk] CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY belum di-set — auth tidak akan berfungsi. Lihat README.");
}
if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
  console.warn("[clerk] CLERK_WEBHOOK_SIGNING_SECRET belum di-set — akun baru TIDAK akan otomatis berstatus pending. Wajib untuk alur approval Owner. Lihat README.");
}

/* ---- 2FA/TOTP kustom (Google Authenticator) — lapisan tambahan DI ATAS Clerk.
   Cookie step-up pendek membuktikan "sesi Clerk ini sudah lolos TOTP", tanpa
   menggantikan sesi Clerk itu sendiri (Clerk tetap satu-satunya penerbit sesi). */
const TOTP_COOKIE = "ktd_2fa";
const TOTP_COOKIE_TTL = "12h"; // selaras dgn masa aktif sesi wajar; Clerk sendiri yg atur TTL sesi login
function getStepupSecret() {
  if (process.env.TOTP_STEPUP_SECRET) return process.env.TOTP_STEPUP_SECRET;
  console.warn("[2fa] TOTP_STEPUP_SECRET belum di-set — memakai secret sementara (reset tiap deploy, semua orang akan diminta ulang kode 2FA). Set env ini di produksi!");
  return crypto.randomBytes(48).toString("hex");
}
const STEPUP_SECRET = getStepupSecret();

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
  // Turso aktif -> jangan sentuh Google Sheets sama sekali (dashboard 100% dari Turso).
  if (process.env.TURSO_DATABASE_URL) { console.log("[sheets] Turso aktif - integrasi Google Sheets dinonaktifkan."); return; }
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

/* ---- Sumber data Turso (opsional, prioritas di atas Google Sheets) ----
   Aktif bila ENV TURSO_DATABASE_URL di-set. Modul turso-source menghitung
   ulang kolom-kolom formula (lihat server/compute.js) agar identik spreadsheet. */
const tursoSource = require("./turso-source");
const { SHEET_MAP } = require("./sheet-map");
if (tursoSource.isConfigured()) {
  console.log("[turso] sumber data Turso AKTIF — /api/sheets & /api/db memakai Turso (kolom formula dihitung ulang).");
}

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
app.set("trust proxy", 1); // di belakang proxy Vercel/Railway (secure cookie, dsb.)
app.disable("x-powered-by");
// verify: simpan body mentah (Buffer) untuk verifikasi tanda tangan webhook Clerk (svix).
app.use(express.json({ limit: "64kb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser()); // hanya utk cookie step-up 2FA kustom (ktd_2fa) — sesi utama tetap milik Clerk
// Mount HANYA bila key ada — clerkMiddleware() melempar error sinkron (crash 500 di
// SEMUA request, termasuk file statis) kalau CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY
// kosong. requireAuth() di bawah menangani kasus "belum dikonfigurasi" dgn rapi.
const CLERK_READY = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
if (CLERK_READY) app.use(clerkMiddleware());

// Security headers + Content-Security-Policy (defense-in-depth terhadap XSS/clickjacking).
// Domain Clerk dibuat konfigurabel via CLERK_FRONTEND_API_ORIGIN (default: pola instance
// gratis *.clerk.accounts.dev). Setelah Clerk App production dgn domain custom, set env
// tsb ke Frontend API asli (Clerk Dashboard → Domains) agar CSP tidak perlu wildcard.
const CLERK_FAPI = process.env.CLERK_FRONTEND_API_ORIGIN || "https://*.clerk.accounts.dev";
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    `script-src 'self' https://cdn.jsdelivr.net ${CLERK_FAPI} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://img.clerk.com",
    `connect-src 'self' ${CLERK_FAPI}`,
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
  ].join("; "));
  next();
});

/* ---- cookie step-up 2FA: bukti "sesi Clerk ini sudah lolos verifikasi TOTP".
   Ditandatangani (JWT) + terikat ke sessionId Clerk spesifik, supaya tidak bisa
   dipakai ulang di sesi Clerk lain (mis. login ulang tetap wajib TOTP lagi). ---- */
function issueStepupCookie(res, sessionId) {
  const token = jwt.sign({ sid: sessionId, purpose: "2fa" }, STEPUP_SECRET, { expiresIn: TOTP_COOKIE_TTL });
  res.cookie(TOTP_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: IS_PROD, maxAge: 12 * 60 * 60 * 1000 });
}
function hasValidStepup(req, sessionId) {
  const token = req.cookies?.[TOTP_COOKIE];
  if (!token) return false;
  try { const claims = jwt.verify(token, STEPUP_SECRET); return claims.purpose === "2fa" && claims.sid === sessionId; }
  catch { return false; }
}

/* ---- akses per-request: role & status approval dibaca dari Clerk publicMetadata.
   status "pending"/"disabled" sekaligus di-ban di Clerk (lihat webhook + /api/users/*)
   sehingga secara normal tak akan pernah punya sesi valid — cek di sini adalah
   defense-in-depth, sama seperti arsitektur lama yang selalu cek ulang status.
   TAMBAHAN: jika akun sudah aktifkan 2FA kustom (privateMetadata.totpEnabled),
   sesi Clerk yang valid SAJA belum cukup — wajib juga cookie step-up (lihat atas). ---- */
async function requireAuth(req, res, next) {
  if (!CLERK_READY) return res.status(503).json({ error: "Auth belum dikonfigurasi di server (CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY)" });
  let userId, sessionId;
  try { ({ userId, sessionId } = getAuth(req)); } catch { return res.status(503).json({ error: "Auth belum dikonfigurasi di server" }); }
  if (!userId) return res.status(401).json({ error: "Belum login" });
  let cu;
  try { cu = await clerkClient.users.getUser(userId); }
  catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const role = cu.publicMetadata?.role || null;
  const status = cu.publicMetadata?.status || "pending";
  if (cu.banned || status === "pending") return res.status(403).json({ error: "Akun belum disetujui Owner" });
  if (status === "disabled") return res.status(403).json({ error: "Akun dinonaktifkan" });
  if (!role || !ROLES.includes(role)) return res.status(403).json({ error: "Akun belum memiliki role" });
  if (cu.privateMetadata?.totpEnabled && !hasValidStepup(req, sessionId)) {
    return res.status(401).json({ error: "Verifikasi 2FA diperlukan", totpRequired: true });
  }
  req.clerkUser = cu;
  req.user = {
    id: cu.id,
    username: cu.username || cu.id,
    role,
    name: cu.unsafeMetadata?.name || [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || "",
  };
  next();
}
function requireOwner(req, res, next) {
  if (req.user?.role !== "owner") return res.status(403).json({ error: "Hanya Owner yang diizinkan" });
  next();
}

/* ---- middleware ringan: hanya butuh sesi Clerk VALID (status approved),
   TANPA mensyaratkan cookie step-up 2FA — dipakai khusus endpoint TOTP itu
   sendiri (setup/enable/verify), karena pada titik itu step-up memang belum ada. ---- */
async function requireClerkSession(req, res, next) {
  if (!CLERK_READY) return res.status(503).json({ error: "Auth belum dikonfigurasi di server" });
  let userId, sessionId;
  try { ({ userId, sessionId } = getAuth(req)); } catch { return res.status(503).json({ error: "Auth belum dikonfigurasi di server" }); }
  if (!userId) return res.status(401).json({ error: "Belum login" });
  let cu;
  try { cu = await clerkClient.users.getUser(userId); }
  catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const status = cu.publicMetadata?.status || "pending";
  if (cu.banned || status === "pending") return res.status(403).json({ error: "Akun belum disetujui Owner" });
  if (status === "disabled") return res.status(403).json({ error: "Akun dinonaktifkan" });
  req.clerkUser = cu; req.clerkUserId = userId; req.clerkSessionId = sessionId;
  next();
}

/* ---- konfigurasi publik utk frontend (publishable key AMAN diekspos — bukan rahasia) ---- */
app.get("/api/config", (_req, res) => {
  res.json({ clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null });
});

/* ---- profil akun aktif ---- */
app.get("/api/me", requireAuth, async (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, name: req.user.name, tfaEnabled: !!req.clerkUser.privateMetadata?.totpEnabled });
});

/* ----------------------------------------------------------- 2FA/TOTP kustom (Google Authenticator)
   Secret disimpan di Clerk privateMetadata — hanya bisa dibaca/ditulis Backend API
   (Secret Key kita), TIDAK PERNAH terkirim ke browser kecuali sekali saat setup awal
   (utk ditampilkan sbg QR/kode manual, sama seperti sistem TOTP pada umumnya). */
const totpAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
});

app.post("/api/totp/setup", requireClerkSession, totpAuthLimiter, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `${APP_NAME} (${req.clerkUser.username || req.clerkUserId})`, length: 20 });
  try {
    await clerkClient.users.updateUserMetadata(req.clerkUserId, { privateMetadata: { totpPendingSecret: secret.base32 } });
  } catch (e) { return res.status(500).json({ error: "Gagal menyimpan data: " + e.message }); }
  res.json({ secret: secret.base32, uri: secret.otpauth_url });
});

app.post("/api/totp/enable", requireClerkSession, totpAuthLimiter, async (req, res) => {
  const { code } = req.body || {};
  const pending = req.clerkUser.privateMetadata?.totpPendingSecret;
  if (!pending) return res.status(400).json({ error: "Mulai setup 2FA terlebih dahulu" });
  const ok = speakeasy.totp.verify({ secret: pending, encoding: "base32", token: String(code || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  try {
    await clerkClient.users.updateUserMetadata(req.clerkUserId, { privateMetadata: { totpSecret: pending, totpEnabled: true, totpPendingSecret: null } });
    issueStepupCookie(res, req.clerkSessionId); // sudah membuktikan penguasaan TOTP → langsung step-up, tak perlu isi ulang
  } catch (e) { return res.status(500).json({ error: "Gagal menyimpan data: " + e.message }); }
  res.json({ ok: true, tfaEnabled: true });
});

app.post("/api/totp/disable", requireAuth, totpAuthLimiter, async (req, res) => {
  const { code } = req.body || {};
  const secret = req.clerkUser.privateMetadata?.totpSecret;
  if (!secret) return res.status(400).json({ error: "2FA belum aktif" });
  const ok = speakeasy.totp.verify({ secret, encoding: "base32", token: String(code || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  try { await clerkClient.users.updateUserMetadata(req.user.id, { privateMetadata: { totpSecret: null, totpEnabled: false, totpPendingSecret: null } }); }
  catch (e) { return res.status(500).json({ error: "Gagal menyimpan data: " + e.message }); }
  res.clearCookie(TOTP_COOKIE);
  res.json({ ok: true, tfaEnabled: false });
});

// Dipanggil setelah login password berhasil (sesi Clerk sudah ada) tapi 2FA belum diverifikasi.
app.post("/api/totp/verify", requireClerkSession, totpAuthLimiter, async (req, res) => {
  const { code } = req.body || {};
  const secret = req.clerkUser.privateMetadata?.totpSecret;
  if (!secret || !req.clerkUser.privateMetadata?.totpEnabled) return res.status(400).json({ error: "2FA tidak aktif untuk akun ini" });
  const ok = speakeasy.totp.verify({ secret, encoding: "base32", token: String(code || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  issueStepupCookie(res, req.clerkSessionId);
  res.json({ ok: true });
});

/* ---- Webhook Clerk: akun baru (user.created) → status "pending" + di-ban sampai di-ACC Owner.
   WAJIB diverifikasi via svix (signing secret dari Clerk Dashboard → Webhooks). ---- */
app.post("/api/webhooks/clerk", async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return res.status(503).json({ error: "Webhook belum dikonfigurasi" });
  const svixId = req.headers["svix-id"], svixTimestamp = req.headers["svix-timestamp"], svixSignature = req.headers["svix-signature"];
  if (!svixId || !svixTimestamp || !svixSignature) return res.status(400).json({ error: "Header webhook tidak lengkap" });
  let evt;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(req.rawBody, { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature });
  } catch (e) { return res.status(400).json({ error: "Verifikasi webhook gagal: " + e.message }); }
  if (evt.type === "user.created") {
    const u = evt.data;
    try {
      await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { role: null, status: "pending" } });
      await clerkClient.users.banUser(u.id); // cegah login sebelum di-ACC Owner
      console.log(`[clerk] akun baru "${u.username || u.id}" → status pending, menunggu approval Owner.`);
    } catch (e) { console.warn("[clerk] gagal set metadata awal akun baru:", e.message); }
  }
  res.json({ ok: true });
});

/* ----------------------------------------------------------- owner: kelola akun */
app.get("/api/users", requireAuth, requireOwner, async (_req, res) => {
  try {
    const list = await clerkClient.users.getUserList({ limit: 200, orderBy: "-created_at" });
    const users = (list.data || []).map((u) => ({
      username: u.username || u.id,
      name: u.unsafeMetadata?.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
      role: u.publicMetadata?.role || null,
      status: u.publicMetadata?.status || (u.banned ? "disabled" : "pending"),
      tfaEnabled: !!u.totpEnabled,
      email: (u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress) || null,
    }));
    res.json(users);
  } catch (e) { res.status(500).json({ error: "Gagal membaca data akun: " + e.message }); }
});
app.post("/api/users/approve", requireAuth, requireOwner, async (req, res) => {
  const { username, role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid" });
  try {
    const list = await clerkClient.users.getUserList({ username: [String(username || "")] });
    const u = (list.data || [])[0];
    if (!u) return res.status(404).json({ error: "Akun tidak ditemukan" });
    await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { role, status: "active" } });
    await clerkClient.users.unbanUser(u.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Gagal menyimpan: " + e.message }); }
});
app.post("/api/users/disable", requireAuth, requireOwner, async (req, res) => {
  const { username } = req.body || {};
  if (String(username || "").toLowerCase() === String(req.user.username).toLowerCase()) {
    return res.status(400).json({ error: "Tidak bisa menonaktifkan akun sendiri" });
  }
  try {
    const list = await clerkClient.users.getUserList({ username: [String(username || "")] });
    const u = (list.data || [])[0];
    if (!u) return res.status(404).json({ error: "Akun tidak ditemukan" });
    await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { status: "disabled" } });
    await clerkClient.users.banUser(u.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Gagal menyimpan: " + e.message }); }
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

/* ---- Filter tabel Turso per role (untuk /api/db), reuse aturan SHEET_ACCESS
   dengan menguji NAMA TAB dari SHEET_MAP. Owner = semua. ---- */
function filterTablesForRole(tables, role) {
  if (role === "owner") return tables;
  const allow = SHEET_ACCESS[role] || [];
  const out = {};
  for (const [table, rows] of Object.entries(tables)) {
    const title = (SHEET_MAP[table] && SHEET_MAP[table].title) || table;
    if (allow.some((re) => re.test(title))) out[table] = rows;
  }
  return out;
}


/* ---- GET /api/sheets  → data live (read-only, cached, di-RLS)
   Prioritas: Turso (kolom formula dihitung ulang) → Google Sheets → kosong. ---- */
app.get("/api/sheets", requireAuth, async (req, res) => {
  // 1) Turso (bila dikonfigurasi)
  if (tursoSource.isConfigured()) {
    try {
      const sheets = await tursoSource.readComputedSheets();
      return res.json({ configured: true, source: "turso", sheets: filterSheetsForRole(sheets, req.user.role) });
    } catch (e) {
      console.warn("[turso] gagal baca, coba fallback Google Sheets:", e.message);
      if (!sheetsApi) return res.status(502).json({ configured: true, source: "turso", error: "Gagal membaca Turso: " + e.message, sheets: {} });
    }
  }
  // 2) Google Sheets (perilaku lama)
  if (!sheetsApi || !spreadsheetId) return res.json({ configured: false, sheets: {} });
  try {
    const sheets = await readAllSheets();
    res.json({ configured: true, source: "sheets", sheets: filterSheetsForRole(sheets, req.user.role) });
  } catch (e) {
    res.status(502).json({ configured: true, error: "Gagal membaca spreadsheet: " + e.message, sheets: {} });
  }
});

/* ---- GET /api/db  → data Turso terhitung sebagai JSON per tabel (di-RLS) ---- */
app.get("/api/db", requireAuth, async (req, res) => {
  if (!tursoSource.isConfigured()) return res.json({ configured: false, tables: {} });
  try {
    const tables = await tursoSource.readComputedTables();
    res.json({ configured: true, tables: filterTablesForRole(tables, req.user.role) });
  } catch (e) {
    res.status(502).json({ configured: true, error: "Gagal membaca Turso: " + e.message, tables: {} });
  }
});

/* ---- GET /api/health  → diagnosa konfigurasi (tanpa membocorkan rahasia) ---- */
app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    clerkConfigured: !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    clerkWebhookConfigured: !!process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    sheetsConfigured: !!sheetsApi,
    tursoConfigured: tursoSource.isConfigured(),
  });
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
