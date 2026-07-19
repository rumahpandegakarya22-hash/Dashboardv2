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
       POST /api/users/disable   → (owner) nonaktifkan akun (status "disabled")
       POST /api/webhooks/clerk  → Clerk mengirim event user.created →
                                    akun baru otomatis diberi status "pending"
                                    sampai di-ACC Owner
       POST /api/documents       → buat Sheet/Doc baru di folder Drive role
       GET  /api/sheets          → data live (Turso atau Google Sheets, RLS)

   Role & status approval disimpan di Clerk publicMetadata (role, status),
   BUKAN di server kita — RLS (SHEET_ACCESS) dan alur approval TIDAK BERUBAH.

   CATATAN: gating pending/disabled TIDAK memakai Clerk banUser/unbanUser —
   fitur "User bans" Clerk kini Pro-only (lihat clerk.com/pricing). Sesi Clerk
   tetap bisa terbit untuk akun pending/disabled; akses ke aplikasi tetap
   ditolak sepenuhnya di layer kita sendiri (requireAuth/requireClerkSession
   di bawah membaca publicMetadata.status) — hasil akhirnya sama (akun
   pending/disabled tidak bisa memakai dashboard), hanya penegakannya pindah
   dari Clerk ke server kita agar tetap $0/bulan.
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
  if (process.env.NODE_ENV === "production") {
    console.warn("[SECURITY] TOTP_STEPUP_SECRET not set — 2FA step-up cookies will not persist across serverless instances. Set it in the deployment env.");
  }
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

/* ---- Sumber data: Turso (satu-satunya — Google Sheets dicabut).
   Modul turso-source menghitung ulang kolom-kolom formula (lihat
   server/compute.js) agar identik spreadsheet lama. */
const tursoSource = require("./turso-source");
const { SHEET_MAP } = require("./sheet-map");
if (tursoSource.isConfigured()) {
  console.log("[turso] sumber data Turso AKTIF — /api/sheets & /api/db memakai Turso (kolom formula dihitung ulang).");
} else {
  console.warn("[turso] TURSO_DATABASE_URL belum di-set — dashboard tidak punya sumber data.");
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
// PENTING (Vercel): file statis public/ dilayani CDN Vercel LANGSUNG (tidak lewat
// Express), jadi header di sini tidak sampai ke HTML/JS/CSS di production — salinan
// kebijakan yang SAMA ada di vercel.json "headers". Kalau mengubah CSP di sini,
// WAJIB update vercel.json juga (dan sebaliknya). vercel.json tidak bisa baca env,
// jadi di sana selalu memakai wildcard *.clerk.accounts.dev.
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
   Ini SATU-SATUNYA gerbang akses untuk akun pending/disabled (lihat catatan di
   atas soal Clerk banUser/unbanUser yang kini Pro-only) — bukan lagi
   defense-in-depth di atas ban Clerk, tapi penegakan utama.
   TAMBAHAN: jika akun sudah aktifkan 2FA kustom (privateMetadata.totpEnabled),
   sesi Clerk yang valid SAJA belum cukup — wajib juga cookie step-up (lihat atas). ---- */
// Cache ringan userId -> { user, exp } supaya requireAuth tidak memanggil Clerk
// Backend API pada SETIAP request. TTL pendek (60s) — perubahan role/status oleh
// Owner tetap efektif dalam <=1 menit. Bukan LRU (jumlah akun internal kecil).
const CLERK_USER_TTL_MS = 60 * 1000;
const clerkUserCache = new Map(); // userId -> { user, exp }
async function getCachedClerkUser(userId) {
  const hit = clerkUserCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = await clerkClient.users.getUser(userId);
  clerkUserCache.set(userId, { user, exp: Date.now() + CLERK_USER_TTL_MS });
  return user;
}

async function requireAuth(req, res, next) {
  if (!CLERK_READY) return res.status(503).json({ error: "Auth belum dikonfigurasi di server (CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY)" });
  let userId, sessionId;
  try { ({ userId, sessionId } = getAuth(req)); } catch { return res.status(503).json({ error: "Auth belum dikonfigurasi di server" }); }
  if (!userId) return res.status(401).json({ error: "Belum login" });
  let cu;
  try { cu = await getCachedClerkUser(userId); }
  catch { return res.status(500).json({ error: "Gagal membaca data akun" }); }
  const role = cu.publicMetadata?.role || null;
  const status = cu.publicMetadata?.status || "pending";
  if (status === "pending") return res.status(403).json({ error: "Akun belum disetujui Owner" });
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
  if (status === "pending") return res.status(403).json({ error: "Akun belum disetujui Owner" });
  if (status === "disabled") return res.status(403).json({ error: "Akun dinonaktifkan" });
  req.clerkUser = cu; req.clerkUserId = userId; req.clerkSessionId = sessionId;
  next();
}

/* ---- limiter longgar utk endpoint data/info akun (dashboard internal kecil).
   Lebih permisif dari totpAuthLimiter (yang khusus percobaan kode) — cukup untuk
   mencegah abuse/hammering tanpa mengganggu pemakaian normal. ---- */
const dataLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
});

/* ---- konfigurasi publik utk frontend (publishable key AMAN diekspos — bukan rahasia) ---- */
app.get("/api/config", (_req, res) => {
  res.json({ clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null });
});

/* ---- profil akun aktif ---- */
app.get("/api/me", dataLimiter, requireAuth, async (req, res) => {
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
  } catch (e) { console.error("[totp/setup] gagal simpan pending secret:", e); return res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
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
  } catch (e) { console.error("[totp/enable] gagal aktifkan 2FA:", e); return res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
  res.json({ ok: true, tfaEnabled: true });
});

app.post("/api/totp/disable", requireAuth, totpAuthLimiter, async (req, res) => {
  const { code } = req.body || {};
  const secret = req.clerkUser.privateMetadata?.totpSecret;
  if (!secret) return res.status(400).json({ error: "2FA belum aktif" });
  const ok = speakeasy.totp.verify({ secret, encoding: "base32", token: String(code || "").trim(), window: 1 });
  if (!ok) return res.status(401).json({ error: "Kode OTP salah" });
  try { await clerkClient.users.updateUserMetadata(req.user.id, { privateMetadata: { totpSecret: null, totpEnabled: false, totpPendingSecret: null } }); }
  catch (e) { console.error("[totp/disable] gagal matikan 2FA:", e); return res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
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

/* ---- Webhook Clerk: akun baru (user.created) → status "pending" sampai di-ACC Owner.
   WAJIB diverifikasi via svix (signing secret dari Clerk Dashboard → Webhooks).
   TIDAK memakai clerkClient.users.banUser — fitur itu Pro-only di Clerk;
   gerbang akses sepenuhnya di publicMetadata.status (lihat requireAuth). ---- */
app.post("/api/webhooks/clerk", async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return res.status(503).json({ error: "Webhook belum dikonfigurasi" });
  const svixId = req.headers["svix-id"], svixTimestamp = req.headers["svix-timestamp"], svixSignature = req.headers["svix-signature"];
  if (!svixId || !svixTimestamp || !svixSignature) return res.status(400).json({ error: "Header webhook tidak lengkap" });
  let evt;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(req.rawBody, { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature });
  } catch (e) { console.error("[webhooks/clerk] verifikasi svix gagal:", e); return res.status(400).json({ error: "Verifikasi webhook gagal." }); }
  if (evt.type === "user.created") {
    const u = evt.data;
    try {
      await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { role: null, status: "pending" } });
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
      status: u.publicMetadata?.status || "pending",
      tfaEnabled: !!u.privateMetadata?.totpEnabled,
      email: (u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress) || null,
    }));
    res.json(users);
  } catch (e) { console.error("[users] gagal baca daftar akun:", e); res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
});
app.post("/api/users/approve", requireAuth, requireOwner, async (req, res) => {
  const { username, role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid" });
  try {
    const list = await clerkClient.users.getUserList({ username: [String(username || "")] });
    const u = (list.data || [])[0];
    if (!u) return res.status(404).json({ error: "Akun tidak ditemukan" });
    await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { role, status: "active" } });
    // Best-effort: bersihkan ban lama (dari versi sebelumnya sebelum banUser Pro-only
    // diketahui) kalau memang bisa — akses tidak lagi bergantung pada ini, jadi
    // kegagalan (mis. Backend API menolak di Free plan) diabaikan dengan sengaja.
    try { await clerkClient.users.unbanUser(u.id); } catch { /* abaikan — lihat komentar di atas */ }
    res.json({ ok: true });
  } catch (e) { console.error("[users/approve] gagal simpan role/status:", e); res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
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
    res.json({ ok: true });
  } catch (e) { console.error("[users/disable] gagal nonaktifkan akun:", e); res.status(500).json({ error: "Terjadi kesalahan pada server." }); }
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
    console.error("[documents] gagal buat file di Drive:", e);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
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
  sales:       [/leads/i, /survey/i, /booking/i, /penghuni/i, /kamar/i, /dokumen/i, /logbook/i, /parameter/i, /histor|customer|retensi/i],
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
    if (!allow.some((re) => re.test(title))) continue; // tabel tidak diizinkan untuk role ini
    // Redaksi kolom PII identik dengan filterSheetsForRole: tab penghuni, non-admin.
    // Baris /api/db berupa objek (kolom→nilai), jadi hapus key yang cocok PII_COLS.
    if (/penghuni/i.test(title) && role !== "admin" && Array.isArray(rows) && rows.length) {
      out[table] = rows.map((r) => {
        if (!r || typeof r !== "object") return r;
        const o = {};
        for (const k of Object.keys(r)) if (!PII_COLS.test(k)) o[k] = r[k];
        return o;
      });
    } else {
      out[table] = rows;
    }
  }
  return out;
}


/* ---- GET /api/sheets  → data live dari Turso (read-only, cached, di-RLS) ---- */
app.get("/api/sheets", dataLimiter, requireAuth, async (req, res) => {
  if (!tursoSource.isConfigured()) return res.json({ configured: false, sheets: {} });
  try {
    const sheets = await tursoSource.readComputedSheets();
    res.json({ configured: true, source: "turso", sheets: filterSheetsForRole(sheets, req.user.role) });
  } catch (e) {
    console.error("[api/sheets] gagal baca Turso:", e);
    res.status(502).json({ configured: true, source: "turso", error: "Terjadi kesalahan pada server.", sheets: {} });
  }
});

/* ---- GET /api/db  → data Turso terhitung sebagai JSON per tabel (di-RLS) ---- */
app.get("/api/db", dataLimiter, requireAuth, async (req, res) => {
  if (!tursoSource.isConfigured()) return res.json({ configured: false, tables: {} });
  try {
    const tables = await tursoSource.readComputedTables();
    res.json({ configured: true, tables: filterTablesForRole(tables, req.user.role) });
  } catch (e) {
    console.error("[api/db] gagal baca Turso:", e);
    res.status(502).json({ configured: true, error: "Terjadi kesalahan pada server.", tables: {} });
  }
});

/* ---- GET /api/inventory  → monitoring stok dari DB app Inventory Stock (read-only) ----
   Integrasi 3 app (Improvement v1.3 §Rencana 3): Dashboard cuma MEMBACA DB inventoystock.
   Akses: owner, admin, operasional — marketing/sales tidak melihat data stok. */
const inventory = require("./inventory");
app.get("/api/inventory", dataLimiter, requireAuth, async (req, res) => {
  if (!["owner", "admin", "operasional"].includes(req.user.role)) {
    return res.status(403).json({ error: "Tidak punya akses data inventory." });
  }
  if (!inventory.isInventoryConfigured()) return res.json({ configured: false });
  try {
    const data = await inventory.readInventory();
    res.json({ configured: true, ...data });
  } catch (e) {
    console.error("[api/inventory] gagal baca DB inventory:", e);
    res.status(502).json({ configured: true, error: "Terjadi kesalahan pada server." });
  }
});

/* ---- GET /api/health  → liveness check minimal (tanpa membocorkan konfigurasi backend) ---- */
app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
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
