# Kost Tiga Dara — Management Dashboard

Dashboard manajemen kost multi-role (Owner, Admin & Keuangan, Marketing, Operasional, Sales) dengan **auth via [Clerk](https://clerk.com)** — login, registrasi + verifikasi email, dan **lupa password** semuanya ditangani Clerk (server kita **tidak pernah** menyimpan atau melihat password pengguna). **2FA (Google Authenticator/TOTP)** dibangun sendiri sebagai lapisan tambahan di atas sesi Clerk (Clerk membatasi MFA bawaan hanya untuk paket Pro berbayar — lihat bagian Keamanan di bawah).

## Menjalankan (lokal)

```bash
npm install        # sekali saja
npm start          # jalankan server → http://localhost:5512
```

Server (Express) melayani front-end statis dari `public/` sekaligus endpoint yang butuh Clerk Secret Key (kelola akun, RLS data). **Wajib** setup Clerk dulu (lihat bawah) sebelum login berfungsi — tanpa `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`, halaman login akan tampil tapi tombol "Masuk" tidak akan bekerja.

## Setup Clerk (WAJIB — sekali saja)

1. Daftar gratis di **[clerk.com](https://clerk.com)** → buat **Application** baru.
2. **Configure → User & Authentication → Email, Phone, Username**:
   - Aktifkan **Username** (dashboard ini login pakai username, bukan email).
   - Pastikan **Email address** aktif, dan **Password** aktif sebagai strategi.
   - **Email address → Verification method** = **"Email verification code"** (BUKAN "Email verification link" — UI kita minta kode 6 digit).
3. **Configure → API Keys**: salin **Publishable key** (`pk_...`) dan **Secret key** (`sk_...`) → isi ke env `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`.
4. **Configure → Webhooks → Add Endpoint**:
   - URL: `https://<domain-dashboard-anda>/api/webhooks/clerk` (lokal: pakai [ngrok](https://ngrok.com) atau sejenis, atau lewati dulu saat dev — lihat catatan di bawah).
   - Event: centang **`user.created`**.
   - Salin **Signing Secret** (`whsec_...`) → isi ke env `CLERK_WEBHOOK_SIGNING_SECRET`.
5. Isi env `TOTP_STEPUP_SECRET` dengan string acak panjang (lihat `.env.example`) — dipakai untuk menandatangani cookie 2FA kustom kita, **bukan** setting di Clerk Dashboard.
6. **Opsional — tombol "Google" / "Apple" di layar login:** **Configure → SSO Connections → Add connection** → pilih **Google** dan/atau **Apple**. Untuk instance development, Clerk sudah menyediakan kredensial shared bawaan (tidak perlu bikin OAuth app sendiri) — tinggal aktifkan. Untuk production, ikuti wizard Clerk (perlu bikin OAuth client di Google/Apple Developer Console). Tombolnya **selalu tampil** di UI kita; kalau provider belum diaktifkan di sini, klik akan gagal dengan pesan error yang jelas, bukan crash.

> **Kenapa webhook wajib:** setiap akun baru yang daftar via Clerk (termasuk lewat Google/Apple) otomatis diberi status **"pending"** sampai **Owner** menyetujuinya lewat menu **Akun & Keamanan → Kelola Akun**. Ini persis alur approval yang sudah ada sebelumnya — webhook adalah cara Clerk memberi tahu server kita "ada akun baru" agar status pending itu otomatis terpasang. Tanpa webhook, akun baru akan berstatus kosong (tidak bisa didekati Owner untuk di-approve) — jalankan dulu di lingkungan yang bisa diakses publik (mis. langsung di Vercel) sebelum mengetes alur registrasi.
>
> **Kenapa tidak pakai fitur Multi-factor bawaan Clerk:** MFA/TOTP native Clerk kini hanya tersedia di paket **Pro** ($25/bulan). Agar dashboard tetap **$0/bulan**, 2FA diimplementasikan sendiri di server kita (`speakeasy` + secret disimpan di Clerk `privateMetadata`, terenkripsi & hanya bisa dibaca lewat Secret Key) — dari sisi user, alurnya identik: scan QR pakai Google Authenticator, masukkan kode 6 digit.

## Akun pertama (Owner)

Clerk tidak punya konsep "akun bawaan" seperti sistem lama. Untuk akun **Owner pertama**, ada dua cara — pakai cara A (paling cepat, sekali jalan lewat terminal):

**Cara A — script (disarankan):**
1. Daftar lewat halaman **"Daftar di sini"** di dashboard seperti user biasa (isi nama, username, email, password → verifikasi kode email). Akun akan berstatus **pending** (belum bisa login, sesuai desain).
2. Di terminal server (pastikan `.env` sudah berisi `CLERK_SECRET_KEY`): `npm run bootstrap:owner -- <username>`. Script ini men-set akun tsb menjadi `role: "owner"` + `status: "active"` lewat Clerk Backend API — lihat `server/bootstrap-owner.js`.
3. Login seperti biasa. Owner ini sekarang bisa meng-approve akun baru lain langsung dari UI dashboard (menu **Akun & Keamanan**) tanpa perlu masuk ke Clerk Dashboard lagi.

**Cara B — manual lewat Clerk Dashboard:**
1. Sama seperti langkah 1 di atas.
2. Buka **Clerk Dashboard → Users** → klik akun tsb → tab **Metadata** → isi **Public metadata**:
   ```json
   { "role": "owner", "status": "active" }
   ```
3. Login seperti biasa.

> **Catatan:** versi lama dokumen ini menyebut langkah "Unban user" — itu **sudah tidak berlaku**. Server tidak lagi memanggil Clerk `banUser`/`unbanUser` sama sekali (fitur itu ternyata Pro-only di Clerk — lihat bagian Keamanan di bawah), jadi akun baru tidak pernah ter-ban; status pending/active/disabled sepenuhnya ditegakkan oleh server kita sendiri lewat `publicMetadata.status`. Kalau akun Anda terlanjur ter-ban oleh versi server yang lebih lama, jalankan `npm run bootstrap:owner -- <username>` — script itu juga mencoba unban (best-effort; kalaupun gagal, status active sudah cukup untuk login karena gating dilakukan di server kita, bukan Clerk).

## Keamanan & alur auth

Tidak ada kredensial yang di-hardcode/di-expose di front-end/backend kita — Clerk yang menyimpan & menghitung hash password. Scope role berasal dari **Clerk `publicMetadata`** (hanya bisa diubah lewat Backend API pakai Secret Key, tidak bisa dimanipulasi dari browser).

- **Registrasi:** front-end memanggil Clerk langsung (`clerk.client.signUp`) → verifikasi kode email → akun dibuat, otomatis **pending** via webhook (`POST /api/webhooks/clerk`, tanda tangan diverifikasi via `svix`) — webhook hanya men-set `publicMetadata.status:"pending"`, **tidak** memanggil Clerk `banUser` (fitur itu Pro-only, lihat catatan di bawah).
- **Login/daftar via Google atau Apple:** tombol di layar login & daftar memanggil `clerk.client.signIn.authenticateWithRedirect({ strategy: 'oauth_google' | 'oauth_apple', ... })` — browser diarahkan ke provider lalu kembali ke `/`, di mana `clerk.handleRedirectCallback()` menyelesaikan flow-nya. Clerk otomatis membuat akun baru kalau belum ada (webhook tetap jalan → status pending seperti biasa). Perlu diaktifkan dulu di Clerk Dashboard → SSO Connections (lihat "Setup Clerk" di atas).
- **Login:** front-end memanggil Clerk langsung (`clerk.client.signIn`, password) → sesi Clerk terbit. Bila akun mengaktifkan 2FA kustom kita, backend menahan request berikutnya (`totpRequired: true`) sampai kode TOTP diverifikasi lewat `/api/totp/verify`.
- **Sesi:** dikelola penuh oleh Clerk (cookie sendiri, terisolasi dari domain kita). Backend memverifikasinya lewat `@clerk/express` (`clerkMiddleware` + `getAuth`) di setiap request. **2FA memakai cookie tambahan** (`ktd_2fa`, httpOnly, ditandatangani `TOTP_STEPUP_SECRET`, terikat ke `sessionId` Clerk yang aktif) yang membuktikan sesi Clerk ini sudah lolos verifikasi TOTP — dicek berdampingan dengan sesi Clerk di `requireAuth`.
- **2FA (TOTP kustom, Google Authenticator):** karena MFA native Clerk hanya ada di paket Pro berbayar, 2FA dibangun sendiri: `POST /api/totp/setup` (backend generate secret via `speakeasy`, simpan di Clerk `privateMetadata` — **tidak pernah** terkirim ke browser selain sekali saat setup) → QR code di-generate **100% di browser** dari URI `otpauth://` (paket `qrcode-generator`, tanpa bundler, tanpa pihak ketiga) → `POST /api/totp/enable` mengonfirmasi kode pertama sebelum 2FA aktif. Login berikutnya lewat `POST /api/totp/verify`, `POST /api/totp/disable` untuk mematikan. Semua endpoint TOTP dibatasi rate limit (`express-rate-limit`). Kompatibel Google Authenticator / Authy (standar TOTP RFC 6238).
- **Lupa password:** front-end memanggil `clerk.client.signIn.create({ strategy: 'reset_password_email_code' })` → kode ke email terdaftar → verifikasi → set password baru. Respons selalu diarahkan ke layar kode tanpa membocorkan apakah username terdaftar (anti user-enumeration, sama seperti desain sebelumnya).
- **Kelola akun (owner):** `GET /api/users`, `POST /api/users/approve {username, role}`, `POST /api/users/disable {username}` — backend memanggil **Clerk Backend API** (`clerkClient.users.*`) pakai Secret Key. Approve = set `publicMetadata.role` + `status:"active"`; Disable = set `status:"disabled"`. Akses pending/disabled ditolak sepenuhnya oleh backend kita sendiri (`requireAuth` membaca `publicMetadata.status`) — **bukan** oleh Clerk ban.
- **RLS data (`/api/sheets`, `/api/db`):** **tidak berubah** — filter per role (`SHEET_ACCESS`) dan penyembunyian kolom PII penghuni tetap 100% di server, memakai `role` dari Clerk `publicMetadata`.

> **Kenapa tidak pakai `banUser`/`unbanUser` Clerk:** fitur "User bans" Clerk kini **Pro-only** ($25/bulan) — lihat [clerk.com/pricing](https://clerk.com/pricing). Versi lama dashboard ini memanggilnya otomatis lewat webhook, yang di paket Free menyebabkan akun baru ter-ban tanpa bisa di-unban lewat Dashboard (tombol "Unban" juga Pro-gated). Sejak versi ini, server **tidak pernah** memanggil `banUser`/`unbanUser` — status pending/active/disabled sepenuhnya ditegakkan oleh backend kita sendiri, hasil akhirnya identik (akun pending/disabled tidak bisa memakai dashboard) tanpa bergantung fitur berbayar. Kalau akun Anda terlanjur ter-ban oleh versi lama, jalankan `npm run bootstrap:owner -- <username>` (lihat bagian "Akun pertama").

## Arsitektur

```
public/            front-end (index.html, app.js, styles.css)  ← di-serve statis
                    Clerk SDK dimuat DINAMIS dari CDN oleh app.js setelah
                    publishable key didapat dari /api/config (versi di-pin;
                    clerk.browser.js v6 butuh key saat dieksekusi) — tanpa bundler.
server/server.js   Express: clerkMiddleware, webhook, kelola akun, dokumen, data sheets
                    (tidak ada lagi data/users.json — akun 100% di Clerk)
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

## Penyimpanan akun: 100% di Clerk

Akun (termasuk password ter-hash, status 2FA, role, status approval) **seluruhnya disimpan di Clerk** — bukan lagi di file lokal atau Upstash Redis. **Upstash Redis tidak lagi diperlukan** untuk auth (sistem lama memakainya untuk menyimpan `users.json` + OTP sementara; keduanya sudah digantikan Clerk). Filesystem server hanya dipakai untuk config opsional Google Drive/Sheets (`data/drive-config.json`, `data/sheets-config.json`) — keduanya tidak wajib dan tidak menyimpan apa pun terkait akun.

## Deploy GRATIS (Vercel) — TANPA kartu kredit ⭐

Pilihan **$0/bulan, tanpa kartu sama sekali**, dan **tanpa batasan desain UI/UX** (front-end custom disajikan apa adanya). Express berjalan sebagai serverless function (`api/index.js`); akun 100% di Clerk (bukan di Vercel) sehingga aman dari sifat filesystem Vercel yang ephemeral. File `vercel.json` sudah disiapkan.

1. **Setup Clerk** dulu — ikuti bagian "Setup Clerk" di atas, salin ketiga key-nya.
2. Daftar di [vercel.com](https://vercel.com) dengan GitHub.
3. **Add New → Project** → import repo `Dashboardv2` → **Deploy**.
4. **Settings → Environment Variables** → tambahkan lalu **Redeploy**:
   - `CLERK_PUBLISHABLE_KEY` = dari Clerk Dashboard → API Keys
   - `CLERK_SECRET_KEY` = dari Clerk Dashboard → API Keys
   - `CLERK_WEBHOOK_SIGNING_SECRET` = dari Clerk Dashboard → Webhooks (endpoint `/api/webhooks/clerk`, event `user.created`)
   - `TOTP_STEPUP_SECRET` = string acak panjang (lihat `.env.example`) — WAJIB, dipakai untuk cookie 2FA kustom kita
   - `NODE_ENV` = `production`
5. Dapat URL `https://<proyek>.vercel.app` — pakai URL ini sebagai target webhook Clerk di langkah 4 di atas.

> Tanpa `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`, halaman login tampil tapi tidak berfungsi. Tanpa `CLERK_WEBHOOK_SIGNING_SECRET`, akun baru tidak otomatis berstatus "pending" (lihat penjelasan webhook di atas). Tanpa `TOTP_STEPUP_SECRET`, cookie 2FA ditandatangani pakai secret acak yang berganti tiap deploy/restart — semua user akan diminta ulang kode 2FA setelahnya.

## Deploy alternatif (Render / Railway)

Server ini juga jalan di host Node biasa mana pun (Render, Railway, VPS, dst) — cukup set env `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `TOTP_STEPUP_SECRET`, `NODE_ENV=production`, lalu jalankan `npm start`. Karena akun sudah 100% di Clerk (bukan file/Redis), **tidak ada lagi kebutuhan Volume/disk persisten khusus untuk auth** — filesystem ephemeral aman-aman saja untuk bagian ini.

> File rahasia (`.env`, `*-config.json`, `service-account.json`) **di-ignore git** — jangan pernah di-commit. Semua secret (termasuk key Clerk) wajib lewat env, tidak pernah lewat file yang ikut ter-commit.
