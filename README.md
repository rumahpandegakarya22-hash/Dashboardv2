# Kost Tiga Dara — Management Dashboard

Dashboard manajemen kost multi-role (Owner, Admin & Keuangan, Marketing, Operasional, Sales) dengan **auth login berbasis backend**, **registrasi akun**, dan **2FA (TOTP)**.

## Menjalankan (lokal)

```bash
npm install        # sekali saja
npm start          # jalankan server → http://localhost:5512
```

Server (Express) melayani front-end statis dari `public/` sekaligus endpoint auth.
Saat pertama kali dijalankan, server otomatis membuat:
- `data/users.json` — 5 akun default (password ter-hash bcrypt)
- `data/.jwt-secret` — kunci penandatangan JWT (jangan dibagikan)

## Akun bawaan & password (TIDAK ada password di repo)

Saat pertama kali dijalankan, server membuat 5 akun: `owner`, `admin`, `marketing`, `operasional`, `sales`. **Password TIDAK di-hardcode di kode.** Untuk tiap akun, password diambil dari:

1. **Env `<ROLE>_PASSWORD`** bila ada — mis. `OWNER_PASSWORD`, `ADMIN_PASSWORD`, `MARKETING_PASSWORD`, `OPERASIONAL_PASSWORD`, `SALES_PASSWORD`.
2. Jika env tidak diisi → password **di-generate acak** dan **dicetak sekali ke log server** (lihat log Vercel/terminal: `[seed] password "owner" ... : xxxx`).

Cara aman: set `OWNER_PASSWORD` (dll.) di env sebelum boot pertama, **atau** login dengan password acak dari log lalu ganti via menu **Akun & Keamanan → Ganti Password**. Role selain owner juga bisa lewat **registrasi → disetujui owner**.

> Ganti password kapan saja lewat tombol gembok di sidebar → **Ganti Password** (endpoint `POST /api/password`).

## Keamanan & alur auth

Tidak ada kredensial yang di-hardcode/di-expose di front-end. Scope role berasal dari token server (bukan dipilih klien).

- **Registrasi:** `POST /api/register` → akun dibuat berstatus **pending**, harus disetujui Owner sebelum bisa login.
- **Login 2 langkah:** `POST /api/login` (verifikasi password) → bila 2FA aktif balas `tfaRequired` + tiket singkat → `POST /api/login/tfa` (verifikasi OTP) → terbitkan sesi.
- **Sesi:** JWT di cookie **httpOnly** (`ktd_session`, TTL 8 jam), `secure` otomatis saat `NODE_ENV=production`, `sameSite=lax`. `GET /api/me` memulihkan sesi.
- **2FA (TOTP):** `POST /api/tfa/setup` (QR + secret) → `POST /api/tfa/enable` (verifikasi OTP) → aktif. `POST /api/tfa/disable` untuk mematikan. Kompatibel Google Authenticator / Authy.
- **Kelola akun (owner):** `GET /api/users`, `POST /api/users/approve {username, role}`, `POST /api/users/disable {username}`. Tersedia di UI lewat tombol gembok pada sidebar.
- **Rate limiting:** endpoint `/api/login`, `/api/login/tfa`, `/api/register` dibatasi 20 percobaan / 15 menit / IP.

## Arsitektur

```
public/            front-end (index.html, app.js, styles.css)  ← di-serve statis
server/server.js   Express: auth, registrasi, 2FA, kelola akun, dokumen, data sheets
data/              users.json + .jwt-secret + config (TIDAK di-serve & TIDAK di-commit)
```

## Data dashboard (Google Spreadsheet — Rumah_Pandega_LIVE_v2)

Secara default dashboard memakai **snapshot data bawaan** (mirror spreadsheet). Untuk menarik **data live read-only** dari `Rumah_Pandega_LIVE_v2`:

1. Buat **Service Account** di Google Cloud Console, aktifkan **Google Sheets API**, unduh kunci JSON → `data/service-account.json`.
2. **Share** spreadsheet `Rumah_Pandega_LIVE_v2` ke email service account (sebagai **Viewer**).
3. Salin `data/sheets-config.example.json` → `data/sheets-config.json` (sudah berisi `spreadsheetId`).
4. Restart server. Log menampilkan `[sheets] Google Sheets integration AKTIF`. Tab **PENGHUNI** otomatis menggantikan snapshot; semua tab bisa diakses via `GET /api/sheets`.

### Data yang BELUM tersedia di spreadsheet (perlu tab baru)

Dashboard butuh data berikut yang belum ada sheet-nya — tambahkan tab baru bila ingin tampil dari data live:

| Kebutuhan dashboard         | Status di spreadsheet            | Saran tab baru   |
| --------------------------- | -------------------------------- | ---------------- |
| Daftar Vendor (+ rating)    | belum ada                        | `12_VENDOR`      |
| Logbook tugas harian        | belum ada (Ops sudah ada)        | `13_LOGBOOK`     |
| Dokumen per role            | belum ada                        | `14_DOKUMEN`     |
| Master 30 kamar             | hanya 29 baris penghuni          | `15_KAMAR`       |

> Data lain (Penghuni, Transaksi/Keuangan, Log Marketing Post & Promo, Log Sales Leads/Survey/Booking, Log Ops, COA) **sudah tersedia** di spreadsheet.

## Filter periode (tanggal)

Sidebar "Filter Periode" (Hari ini / Minggu ini / Bulan ini / Tahun ini / Custom) menyaring tabel berdimensi waktu (Pembayaran, Leads/Survey/Prospek, Logbook, Tiket, Jatuh Tempo) berdasarkan kolom tanggalnya. Mendukung tanggal format Indonesia (`25 Mei 2026`) dan ISO (`2026-06-15`).

## Integrasi Google Drive (tombol "+" Tambah Dokumen)

Tombol **+** memanggil `POST /api/documents` → membuat Google Sheet/Doc baru di **folder Drive milik role**. Tanpa konfigurasi, jatuh ke fallback (`sheets.new`).

1. Service Account + **Google Drive API**, kunci → `data/service-account.json`.
2. Buat 1 folder Drive per role, share tiap folder ke email service account (Editor).
3. Salin `data/drive-config.example.json` → `data/drive-config.json`, isi ID folder tiap role.
4. Restart. Log: `[drive] Google Drive integration AKTIF`.

## Penyimpanan akun: file lokal atau Upstash Redis

Server menyimpan akun (termasuk 2FA) di salah satu dari:
- **File lokal** `data/users.json` — default untuk jalan di komputer.
- **Upstash Redis** — aktif bila env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` diisi. Wajib untuk hosting gratis (filesystem-nya ephemeral) agar akun tidak hilang saat redeploy.

## Deploy GRATIS #1 (Vercel + Upstash Redis) — TANPA kartu kredit ⭐

Pilihan **$0/bulan, tanpa kartu sama sekali**, dan **tanpa batasan desain UI/UX** (front-end custom disajikan apa adanya). Express berjalan sebagai serverless function (`api/index.js`), akun disimpan di Upstash Redis. File `vercel.json` sudah disiapkan.

**1. Upstash Redis (gratis, tanpa kartu):** seperti langkah di bawah — salin `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`.

**2. Vercel (gratis, tanpa kartu):**
   - Daftar di [vercel.com](https://vercel.com) dengan GitHub.
   - **Add New → Project** → import repo `Dashboardv2` → **Deploy**.
   - **Settings → Environment Variables** → tambahkan lalu **Redeploy**:
     - `JWT_SECRET` = string acak panjang **(WAJIB — filesystem Vercel read-only)**
     - `UPSTASH_REDIS_REST_URL` = dari Upstash
     - `UPSTASH_REDIS_REST_TOKEN` = dari Upstash
     - `NODE_ENV` = `production`
     - `RESEND_API_KEY` = dari [resend.com](https://resend.com) **(WAJIB untuk OTP email: verifikasi pendaftaran & lupa password)**
     - `MAIL_FROM` = mis. `Kost Tiga Dara <onboarding@resend.dev>` (atari alamat domain terverifikasi di Resend)
   - Dapat URL `https://<proyek>.vercel.app`.

> Di Vercel, akun **wajib** disimpan di Upstash (FS ephemeral) dan `JWT_SECRET` **wajib** via env. Tanpa keduanya, login tidak persisten.

### Email OTP (verifikasi pendaftaran + lupa password)
- Registrasi akun baru kini **wajib email** dan **diverifikasi via OTP** sebelum akun masuk antrean approval Owner.
- **Lupa password**: di halaman login → "Lupa password?" → masukkan **username + email terdaftar** (harus cocok) → OTP dikirim ke email itu → masukkan OTP + password baru.
- OTP dikirim via **Resend** (HTTP API). Set `RESEND_API_KEY` + `MAIL_FROM` di env. **Tanpa `RESEND_API_KEY`**, OTP tidak terkirim — di mode dev (lokal) kode OTP dicetak ke **log server** untuk pengujian.
- OTP disimpan sementara (hash + kedaluwarsa) di Upstash Redis; maksimal 5 percobaan, register OTP 15 menit, reset OTP 10 menit.
- Akun seed (owner/admin/dll) belum punya email → set lewat env `OWNER_EMAIL`, `ADMIN_EMAIL`, dst (opsional) agar bisa pakai reset OTP. **Tidak ada secret di repo** — semua via env.

## Deploy GRATIS #2 (Render + Upstash Redis)

Pilihan **$0/bulan**: Render free menjalankan server Express, Upstash Redis menyimpan akun secara persisten. (Netlify/Vercel tidak cocok — serverless + ephemeral; Railway = trial credit lalu berbayar.)

**1. Upstash Redis (gratis):**
   - Daftar di [upstash.com](https://upstash.com) → **Create Database** (Redis, pilih region terdekat mis. Singapore).
   - Di tab **REST API**, salin **`UPSTASH_REDIS_REST_URL`** dan **`UPSTASH_REDIS_REST_TOKEN`**.

**2. Render (gratis):**
   - Daftar di [render.com](https://render.com) → **New → Web Service** → connect repo GitHub `Dashboardv2`.
   - Render membaca `render.yaml` (plan free, `node server/server.js`). Atau set manual: Build `npm install`, Start `node server/server.js`.
   - **Environment** → tambahkan:
     - `NODE_ENV` = `production`
     - `JWT_SECRET` = string acak panjang (atau biarkan `render.yaml` generate)
     - `UPSTASH_REDIS_REST_URL` = (dari Upstash)
     - `UPSTASH_REDIS_REST_TOKEN` = (dari Upstash)
   - `PORT` di-set otomatis oleh Render.
   - Create Web Service → tunggu deploy → dapat URL publik `https://...onrender.com`.

> Catatan free tier Render: layanan "tidur" setelah ~15 menit idle, bangun lagi ~30–60 dtk saat diakses. Akun tetap aman karena tersimpan di Upstash.

**3. (Opsional) data live & Drive:** set env `service-account.json` belum didukung via env — untuk data live di host gratis, paling praktis tetap pakai snapshot bawaan, atau gunakan host dengan disk. Tanpa konfigurasi, dashboard jalan normal dengan snapshot.

## Deploy ke Railway (alternatif berbayar setelah trial)

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**. Railway memakai `railway.json` / `Procfile`.
2. **Variables**: `NODE_ENV=production`, `JWT_SECRET=<acak>`, `DATA_DIR=/data` (+ **Volume** mount di `/data` agar `users.json`/`.jwt-secret` persisten). `PORT` otomatis.
3. Generate domain di **Networking**.

> File rahasia (`users.json`, `.jwt-secret`, `*-config.json`, `service-account.json`) **di-ignore git** — jangan pernah di-commit. Di produksi, `JWT_SECRET` via env wajib (jangan andalkan file).
