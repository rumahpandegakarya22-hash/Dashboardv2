# Panduan Operasional & Maintenance
## Dashboard Manajemen Kost Tiga Dara

**Versi dokumen:** 2.0 · **Tanggal:** 8 Juli 2026 (auth kini via Clerk)
**URL Aplikasi:** https://dashboard-tiga-dara.vercel.app

> Dokumen ini adalah panduan resmi untuk seluruh staff Kost Tiga Dara dalam menggunakan, mengoperasikan, dan merawat Dashboard Manajemen. Bacalah bagian yang sesuai dengan peran (role) Anda.

---

## Daftar Isi
1. [Definisi & Tujuan](#1-definisi--tujuan)
2. [Konsep Peran (Role)](#2-konsep-peran-role)
3. [Struktur Sistem](#3-struktur-sistem)
4. [Cara Mengakses & Login](#4-cara-mengakses--login)
5. [Mengenal Tampilan Dashboard](#5-mengenal-tampilan-dashboard)
6. [Panduan per Divisi](#6-panduan-per-divisi)
7. [Fitur Umum & Cara Pakai](#7-fitur-umum--cara-pakai)
8. [Sumber Data & Cara Update](#8-sumber-data--cara-update)
9. [Keamanan & Manajemen Akun](#9-keamanan--manajemen-akun)
10. [Panduan Maintenance (Teknis)](#10-panduan-maintenance-teknis)
11. [Troubleshooting / Masalah Umum](#11-troubleshooting--masalah-umum)
12. [Glosarium](#12-glosarium)

---

## 1. Definisi & Tujuan

### Apa itu Dashboard Kost Tiga Dara?
Dashboard ini adalah **aplikasi web terpusat** untuk memantau dan mengelola seluruh operasional kost: data penghuni, pembayaran, kamar, prospek calon penyewa, kegiatan pemasaran, tiket perawatan, keuangan, dan dokumen — semuanya dalam satu layar sesuai peran masing-masing staff.

### Tujuan
- **Satu sumber kebenaran:** semua divisi melihat data yang sama dan konsisten.
- **Pemantauan cepat:** KPI penting tampil sebagai kartu & grafik (okupansi, pendapatan, tunggakan, leads, tiket, dll.).
- **Akuntabilitas:** tiap divisi punya tugas (logbook), dokumen, dan riwayatnya sendiri.
- **Pengambilan keputusan:** Owner bisa melihat seluruh divisi sekaligus untuk evaluasi bisnis.
- **Keamanan akses:** tiap orang hanya melihat data divisinya; akses dikontrol login + 2FA.

---

## 2. Konsep Peran (Role)

Setiap akun memiliki **satu peran**. Peran menentukan menu & data yang bisa dilihat.

| Role | Akses | Tugas utama |
|---|---|---|
| **Owner** | **Semua divisi** | Memantau seluruh bisnis, menyetujui akun staff baru, evaluasi keuangan & operasional |
| **Admin & Keuangan** | Divisi Admin | Data penghuni, pembayaran, jatuh tempo, kontrak, vendor, dokumen |
| **Marketing** | Divisi Marketing | Leads, survey, kampanye promosi, channel pemasaran |
| **Operasional** | Divisi Operasional | Tiket perbaikan, inspeksi/perawatan kamar, vendor, data kamar |
| **Sales** | Divisi Sales | Prospek, booking, konversi, retensi penyewa |

> **Prinsip penting:** peran ditentukan oleh server saat login — **tidak bisa dipilih sendiri** oleh staff. Owner-lah yang menetapkan peran saat menyetujui akun baru.

---

## 3. Struktur Sistem

### Gambaran besar
```
┌─────────────────────────────────────────────────────────┐
│  BROWSER STAFF (HP / Laptop)                             │
│  → buka https://dashboard-tiga-dara.vercel.app            │
└───────────────┬─────────────────────────────────────────┘
                │ (internet, HTTPS aman)
┌───────────────▼─────────────────────────────────────────┐
│  APLIKASI (di Vercel — hosting gratis)                   │
│  • Tampilan dashboard (front-end)                        │
│  • Server login & data (back-end)                        │
└───────────────┬───────────────────────┬─────────────────┘
                │                        │
       ┌────────▼────────┐     ┌─────────▼──────────┐
       │      Clerk      │     │ Google Spreadsheet │
       │ (akun staff,    │     │ Rumah_Pandega_LIVE │
       │  password, 2FA) │     │ (data operasional) │
       └─────────────────┘     └────────────────────┘
```

### Komponen
| Komponen | Fungsi |
|---|---|
| **Front-end** | Tampilan yang dilihat staff (kartu, grafik, tabel) |
| **Back-end (server)** | Menjembatani login ke Clerk, menerapkan hak akses per divisi, dan menyajikan data |
| **Clerk** | Layanan pihak ketiga yang menyimpan **seluruh akun staff** — password, status 2FA, sesi login, dan proses lupa-password. Server kita **tidak pernah** menyimpan/melihat password siapa pun |
| **Google Spreadsheet** (`Rumah_Pandega_LIVE_v2`) | Sumber data operasional (penghuni, transaksi, leads, dll.) |
| **Vercel** | Tempat aplikasi "tinggal" & diakses dari internet (gratis) |
| **GitHub** | Tempat menyimpan kode program (untuk update/perbaikan) |

---

## 4. Cara Mengakses & Login

### Login pertama
1. Buka **https://dashboard-tiga-dara.vercel.app** di browser (Chrome/Edge/HP).
2. Masukkan **Username** dan **Password** yang diberikan Owner.
3. Klik **Masuk**.
4. Jika 2FA aktif di akun Anda, akan diminta **kode OTP 6 digit** dari aplikasi authenticator → masukkan → **Verifikasi**.

### Mendaftar akun baru (staff baru)
1. Di halaman login klik **"Daftar di sini"**.
2. Isi Nama Lengkap, Username (min. 3 karakter), Email, Password (min. 8 karakter) → **Daftar**.
3. Sebuah **kode 6 digit** dikirim ke email yang diisi → masukkan kode itu di layar berikutnya → **Verifikasi & Daftar**.
4. Akun berstatus **menunggu persetujuan** (belum bisa login). **Owner harus menyetujui** dan menetapkan peran lewat **Kelola Akun** (lihat [Bagian 9](#9-keamanan--manajemen-akun)) sebelum staff tsb bisa login.

### Lupa password
1. Di halaman login klik **"Lupa password?"**.
2. Masukkan **Username** Anda → **Kirim OTP**.
3. Buka email terdaftar pada akun tsb, salin kode 6 digit yang dikirim.
4. Masukkan kode + **password baru** → **Simpan Password**. Anda akan otomatis masuk ke dashboard.

### Keluar (logout)
Klik ikon **keluar** (panah) di pojok kiri bawah sidebar.

> **Keamanan:** password & sesi login dikelola penuh oleh Clerk (bukan server kita). Jangan bagikan password. Gunakan 2FA.

---

## 5. Mengenal Tampilan Dashboard

### Sidebar (menu kiri)
- **Nama divisi** (atas)
- **Filter Periode** — pilih rentang waktu data: Hari ini / Minggu ini / Bulan ini / Tahun ini / Custom (tanggal bebas)
- **Dashboards** — halaman ringkasan/grafik
- **Pages** — halaman tabel detail (Penghuni, Pembayaran, dll.)
- **Footer akun** (bawah) — nama Anda, tombol **gembok (Akun & Keamanan)**, dan tombol **Keluar**

### Topbar (bar atas)
| Ikon | Fungsi |
|---|---|
| ☰ | Buka/tutup menu (di HP) |
| ▭ | Sembunyikan / tampilkan sidebar |
| 🔍 Search | Cari di semua tabel halaman aktif |
| ☀️/🌙 | Ganti tema terang / gelap |
| ⟳ | Muat ulang (refresh) data |
| 🔔 | Notifikasi |
| ⛶ | Layar penuh (fullscreen) |

---

## 6. Panduan per Divisi

### 6.1 Owner
Melihat **semua divisi**. Menu Dashboards: Overview, Sales, Marketing, Admin & Keuangan, Operasional. Menu Pages: Daftar Penghuni, Data Kamar, Data Pembayaran, Dokumen, Logbook (gabungan semua divisi).
**Tugas khusus Owner:** menyetujui akun staff baru & menetapkan perannya (lihat [Bagian 9](#9-keamanan--manajemen-akun)).

### 6.2 Admin & Keuangan
| Halaman | Isi |
|---|---|
| **Overview** | KPI (Pendapatan, Kontrak Aktif, Kamar Kosong, Tunggakan, Jatuh Tempo), grafik komposisi kontrak, status kontrak, OPEX, pendapatan vs beban, dan tabel **Daftar Jatuh Tempo** |
| **Daftar Penghuni** | Data lengkap penghuni + status (Aktif/Booking/Lunas/Tunggakan, dll.) |
| **Data Pembayaran** | Riwayat pembayaran (DP / Pelunasan) |
| **Daftar Vendor** | Vendor + penilaian "Hasil" |
| **Dokumen** | Arsip dokumen (tombol OPEN ke Google Drive) |
| **Logbook** | Tugas harian divisi + status |

### 6.3 Marketing
| Halaman | Isi |
|---|---|
| **Overview** | KPI (Leads, Survey, Konversi, Unit Tersewa, CAC), Funnel Penjualan, komposisi **Leads Channel**, grafik channel, tabel Follow Up |
| **Leads dan Survey** | Daftar Leads + Daftar Survey (Nama, WA, Pertimbangan, Asal, Tanggal, tombol WhatsApp) |
| **Dokumen** | Arsip dokumen marketing |
| **Logbook** | Tugas harian marketing |

### 6.4 Operasional
| Halaman | Isi |
|---|---|
| **Overview** | KPI tiket (Preventif/Korektif, Defect, Downtime, Cost, Response/Resolution, MTTR, SLA), komposisi **Kategori Tiket**, expense |
| **Daftar Tiket** | Tiket pekerjaan + status |
| **Daftar Vendor** | Vendor + **tombol WhatsApp** untuk menghubungi |
| **Data Kamar** | 30 kartu kamar; menampilkan **tombol WhatsApp penghuni** (bukan harga) |
| **Dokumen** | Arsip dokumen operasional |
| **Logbook** | **3 tabel:** Inspeksi · Perbaikan · Perawatan (dengan prioritas & status berwarna) |

### 6.5 Sales
| Halaman | Isi |
|---|---|
| **Overview** | KPI (Booking, Cancellation, Conversion, Retention, Avg Durasi Sewa, Kamar Isi), Funnel, komposisi **Prospek**, kategori prospek, tabel Daftar Prospek |
| **Daftar Prospek** | Calon penyewa (Nama, WA, Pertimbangan, Asal, Tanggal, tombol WhatsApp) |
| **Daftar Penghuni** | Ringkas (No Kamar, Jenis, Jatuh Tempo) |
| **Data Kamar** | 30 kartu kamar + harga |
| **Dokumen / Logbook** | Arsip dokumen & tugas harian sales |

---

## 7. Fitur Umum & Cara Pakai

### Filter Periode (tanggal)
1. Di sidebar klik **Filter Periode**.
2. Pilih **Hari ini / Minggu ini / Bulan ini / Tahun ini**, atau **Custom** lalu isi tanggal dari–sampai.
3. Tabel yang punya kolom tanggal (Pembayaran, Leads, Prospek, Logbook, Tiket, Jatuh Tempo) otomatis tersaring.
4. Jika tidak ada data di periode itu, muncul tulisan *"Tidak ada data pada periode …"*.

### Pada setiap tabel (toolbar)
| Tombol | Fungsi |
|---|---|
| **+** | Buat **dokumen/spreadsheet baru** otomatis di folder Google Drive divisi (lihat catatan Drive di Bagian 10) |
| **Filter** | Saring berdasarkan nilai kolom terakhir (mis. status) |
| **Urutkan** | Urutkan baris naik/turun |
| **Search** | Cari di tabel tersebut |

### Tombol aksi di dalam tabel
- **WhatsApp / Chat / Kirim** → membuka WhatsApp ke nomor terkait.
- **OPEN** → membuka dokumen di Google Drive.
- **Dropdown status** (Logbook, Vendor) → ubah status/hasil; warna berubah otomatis.
- **Pill status** (penghuni) → label berwarna sesuai kondisi (Aktif/Tunggakan/dll.).

### Data Kamar
30 kartu kamar dengan status berwarna (Terisi/Kosong/Booking/Maintenance). Gunakan **chip filter** di atas untuk menyaring per status.

---

## 8. Sumber Data & Cara Update

### Dari mana data berasal?
Seluruh data operasional bersumber dari Google Spreadsheet **`Rumah_Pandega_LIVE_v2`** (pemilik: rumahpandegakarya22@gmail.com).

### Cara memperbarui data dashboard
1. Buka spreadsheet `Rumah_Pandega_LIVE_v2` di Google Drive.
2. Edit/ tambah baris pada tab yang sesuai (mis. PENGHUNI, TRANSAKSI, LOG_SALES, dll.).
3. Dashboard akan menampilkan data terbaru (jika integrasi live aktif — lihat Bagian 10).

### Tab yang sudah tersedia di spreadsheet
PARAMETER, PENGHUNI, TRANSAKSI, LOG_MARKETING (Post & Promo), LOG_SALES (Leads/Survey/Booking), LOG_OPS, COA.

### Tab yang BELUM ada (perlu dibuat bila ingin dari data live)
| Kebutuhan | Saran nama tab |
|---|---|
| Daftar Vendor + penilaian | `12_VENDOR` |
| Logbook tugas harian | `13_LOGBOOK` |
| Dokumen per divisi | `14_DOKUMEN` |
| Master 30 kamar | `15_KAMAR` |

> Tersedia skrip otomatis `npm run setup:sheets` untuk membuat tab-tab ini (butuh akses Editor service account — lihat Bagian 10).

---

## 9. Keamanan & Manajemen Akun

Semua diakses lewat tombol **gembok (Akun & Keamanan)** di sidebar.

### Ganti Password (semua role) — WAJIB saat pertama kali
1. Klik **gembok** → kartu **Ganti Password**.
2. Isi **Password lama** & **Password baru** (min. 8 karakter) → **Simpan Password**.

### Aktifkan 2FA / Autentikasi Dua Faktor (sangat disarankan)
1. Klik **gembok** → kartu **Autentikasi Dua Faktor** → **Aktifkan 2FA**.
2. **Scan QR** dengan aplikasi **Google Authenticator** atau **Authy** di HP.
3. Masukkan **kode 6 digit** dari aplikasi → **Verifikasi & Aktifkan**.
4. Mulai login berikutnya, Anda akan diminta kode OTP.
> Untuk mematikan: kartu yang sama → masukkan kode OTP → **Nonaktifkan 2FA**.

### Menyetujui akun staff baru (KHUSUS OWNER)
1. Klik **gembok** → kartu **Kelola Akun**.
2. Akun berstatus **pending** → pilih **Role** → klik **Setujui**.
3. Untuk menonaktifkan akun: klik **Nonaktifkan**.

### Aturan keamanan untuk semua staff
- Ganti password default segera; jangan pakai password yang mudah ditebak.
- Aktifkan 2FA, terutama akun Owner & Admin.
- Jangan bagikan akun. Satu staff = satu akun.
- Selalu **Keluar** setelah memakai komputer bersama.

---

## 10. Panduan Maintenance (Teknis)

> Bagian ini untuk Owner atau orang yang ditunjuk mengelola sisi teknis.

### 10.1 Akun layanan pihak ketiga
| Layanan | Fungsi | URL |
|---|---|---|
| **GitHub** | Penyimpanan kode | https://github.com/rumahpandegakarya22-hash/Dashboardv2 |
| **Vercel** | Hosting aplikasi | https://vercel.com |
| **Clerk** | Database akun staff (password, 2FA, sesi login) | https://dashboard.clerk.com |
| **Google Cloud** | (opsional) integrasi Sheets/Drive | https://console.cloud.google.com |

### 10.1a Setup akun Owner PERTAMA KALI (sekali saja, teknis)
Berbeda dari staff biasa (yang cukup daftar → menunggu di-ACC Owner lewat UI), akun **Owner pertama** perlu dibuatkan lewat Clerk Dashboard karena belum ada Owner lain yang bisa meng-ACC:
1. Daftar seperti staff biasa lewat halaman "Daftar di sini" (isi nama, username, email, password → verifikasi kode email).
2. Buka **Clerk Dashboard → Users**, klik akun yang baru dibuat.
3. Tab **Metadata** → isi **Public metadata**: `{ "role": "owner", "status": "active" }`.
4. Menu **⋯ → Unban user** (akun baru otomatis di-"kunci" sampai di-ACC).
5. Selesai — login seperti biasa. Owner ini sekarang bisa meng-ACC staff lain langsung dari dashboard tanpa perlu masuk Clerk lagi.

### 10.2 Cara update aplikasi
Setiap perubahan kode yang **di-push ke branch `main`** di GitHub akan **otomatis dideploy** ulang oleh Vercel (~1 menit). Tidak perlu langkah manual.

### 10.3 Environment Variables (di Vercel → Settings → Environment Variables)
| Key | Fungsi | Wajib? |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | Kunci publik Clerk (dari Clerk Dashboard → API Keys) | **Wajib** |
| `CLERK_SECRET_KEY` | Kunci rahasia Clerk — kelola akun & cek role | **Wajib** |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifikasi webhook Clerk (akun baru → status pending otomatis) | **Wajib** |
| `TOTP_STEPUP_SECRET` | Tanda tangan cookie 2FA kustom (Google Authenticator) — bukan setting Clerk | **Wajib** |
| `NODE_ENV` = `production` | Mode produksi | Disarankan |

> Setelah mengubah env, **wajib Redeploy** (Deployments → ⋯ → Redeploy). Detail lengkap cara mendapatkan tiap key ada di `README.md` bagian "Setup Clerk".

### 10.4 Cek kesehatan sistem
Buka **https://dashboard-tiga-dara.vercel.app/api/health**. Yang sehat:
```
{ "ok": true, "clerkConfigured": true, "clerkWebhookConfigured": true }
```
- `clerkConfigured: false` → env `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` belum terbaca → cek & Redeploy.
- `clerkWebhookConfigured: false` → `CLERK_WEBHOOK_SIGNING_SECRET` belum diisi → akun baru **tidak** otomatis berstatus pending (celah keamanan — segera lengkapi).

### 10.5 Kelola & pemulihan akun
- Akun staff **100% tersimpan di Clerk** (bukan di server/database kita) — lihat & kelola langsung di **Clerk Dashboard → Users**, atau lewat menu **Kelola Akun** di dashboard (untuk Owner).
- **Reset password staff:** arahkan staff ke "Lupa password?" di halaman login (lihat Bagian 4), ATAU Owner bisa reset dari Clerk Dashboard → pilih user → **⋯ → Reset password**.
- **Hapus akun staff:** Clerk Dashboard → Users → pilih user → **⋯ → Delete**. (Menu "Nonaktifkan" di dashboard kita cukup untuk memblokir login tanpa menghapus data.)
- Clerk otomatis menyimpan histori & backup akun di sisi mereka — tidak perlu backup manual seperti sistem lama.

### 10.6 (Opsional) Mengaktifkan data live Google Sheets
1. Buat **Service Account** di Google Cloud, aktifkan **Google Sheets API**, unduh kunci JSON.
2. **Share** spreadsheet `Rumah_Pandega_LIVE_v2` ke email service account (sebagai **Viewer**).
3. Sediakan `data/service-account.json` + `data/sheets-config.json` (lihat `data/sheets-config.example.json`).
> Tanpa ini, dashboard tetap berjalan memakai data snapshot bawaan.

### 10.7 (Opsional) Membuat tab data baru di spreadsheet
Beri service account akses **Editor**, lalu jalankan `npm run setup:sheets` untuk membuat tab `12_VENDOR`, `13_LOGBOOK`, `14_DOKUMEN`, `15_KAMAR` beserta header-nya (aman, hanya menambah).

### 10.8 Yang TIDAK boleh dilakukan
- Jangan commit file rahasia ke GitHub (`.env`, `service-account.json`, `*-config.json` — sudah otomatis diabaikan).
- Jangan bagikan `CLERK_SECRET_KEY` atau `CLERK_WEBHOOK_SIGNING_SECRET` ke siapa pun di luar Owner/teknis.
- Jangan hapus/ubah **Public metadata** (`role`, `status`) akun di Clerk Dashboard secara sembarangan — itu menentukan hak akses divisi seseorang.

---

## 11. Troubleshooting / Masalah Umum

| Masalah | Penyebab | Solusi |
|---|---|---|
| **Tombol "Masuk" tidak merespons / error auth** | Env Clerk belum terbaca di server | Cek `/api/health`; pastikan `clerkConfigured: true` & **Redeploy** |
| **"Username atau password salah"** | Salah ketik | Cek huruf besar/kecil pada username & password |
| **"Akun belum disetujui Owner"** | Akun masih pending, atau webhook belum aktif | Minta Owner menyetujui di **Kelola Akun**; bila akun baru tidak muncul di sana, cek `clerkWebhookConfigured` di `/api/health` |
| **"Kode OTP salah"** | Jam HP tidak sinkron / kode kedaluwarsa | Pastikan jam HP otomatis; masukkan kode terbaru dari aplikasi authenticator |
| **Kode verifikasi email tidak masuk** | Salah folder / typo email | Cek folder Spam; klik "Kirim ulang kode" di layar verifikasi |
| **Tabel kosong "Tidak ada data pada periode…"** | Filter periode terlalu sempit | Ganti ke **Tahun ini** atau atur Custom |
| **Situs lambat saat dibuka pertama** | Hosting gratis "tidur" saat idle | Normal; tunggu ~30–60 detik, akan aktif |
| **Lupa password** | — | Klik **"Lupa password?"** di halaman login (lihat Bagian 4) |

---

## 12. Glosarium
| Istilah | Arti |
|---|---|
| **Dashboard** | Halaman ringkasan berisi KPI & grafik |
| **KPI** | Indikator kinerja utama (angka penting) |
| **Role** | Peran/jabatan yang menentukan hak akses |
| **2FA / OTP** | Verifikasi tambahan kode 6 digit dari aplikasi authenticator |
| **Clerk** | Layanan pihak ketiga yang mengelola seluruh akun staff (password, 2FA, sesi login, lupa password) |
| **Leads** | Calon penyewa yang baru menunjukkan minat |
| **Prospek** | Calon penyewa yang sedang ditindaklanjuti |
| **Okupansi** | Persentase kamar yang terisi |
| **OPEX** | Beban operasional |
| **Tiket** | Catatan permintaan perbaikan/perawatan |
| **Logbook** | Buku catatan tugas harian divisi |
| **Deploy** | Proses menerbitkan aplikasi versi terbaru ke internet |
| **Env / Environment Variable** | Pengaturan rahasia yang disimpan di server (bukan di kode) |

---

*Dokumen ini dapat diperbarui seiring penambahan fitur. Simpan versi terbaru dan bagikan ke seluruh staff terkait.*
