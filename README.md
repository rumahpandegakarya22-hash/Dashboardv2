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

## Akun demo

| Username      | Password   | Role        | Akses                        |
| ------------- | ---------- | ----------- | ---------------------------- |
| `owner`       | `owner123` | owner       | **semua divisi**             |
| `admin`       | `admin123` | admin       | Admin & Keuangan saja        |
| `marketing`   | `mkt123`   | marketing   | Marketing saja               |
| `operasional` | `ops123`   | operasional | Operasional saja             |
| `sales`       | `sales123` | sales       | Sales saja                   |

> **Ganti password default sebelum produksi.** Hapus `data/users.json` lalu ubah `SEED` di `server/server.js` dan restart, atau ganti `passwordHash` (hash bcrypt) langsung.

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

## Deploy ke Railway

Railway mendukung Node.js persisten (cocok untuk backend ini; Netlify/Vercel tidak, karena serverless + filesystem ephemeral).

1. Push repo ini ke GitHub.
2. Di [railway.app](https://railway.app): **New Project → Deploy from GitHub repo** → pilih repo ini. Railway memakai `railway.json` / `Procfile` (`node server/server.js`).
3. **Variables** (Settings → Variables):
   - `NODE_ENV=production`  → mengaktifkan cookie `secure`.
   - `JWT_SECRET=<string acak panjang>`  → kunci JWT yang persisten antar-deploy.
   - `DATA_DIR=/data`  → arahkan ke volume persisten (lihat langkah 4).
   - `PORT` di-set otomatis oleh Railway (server sudah membaca `process.env.PORT`).
4. **Volume** (penting agar akun & 2FA tidak hilang saat redeploy): Settings → **Volumes** → mount di `/data`. Server menyimpan `users.json`, `.jwt-secret`, dan config di sini.
5. Upload kredensial Google (opsional, untuk data live & Drive): taruh `service-account.json`, `sheets-config.json`, `drive-config.json` di volume `/data`, atau biarkan kosong (snapshot fallback tetap jalan).
6. Generate domain publik di Settings → **Networking → Generate Domain**.

> File rahasia (`users.json`, `.jwt-secret`, `*-config.json`, `service-account.json`) **di-ignore git** — jangan pernah di-commit. Di produksi, `JWT_SECRET` via env lebih aman daripada file.
