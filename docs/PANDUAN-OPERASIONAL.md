# Panduan Operasional & Maintenance
## Dashboard Manajemen Kost Tiga Dara

**Versi dokumen:** 1.0 · **Tanggal:** 21 Juni 2026
**URL Aplikasi:** https://dashboardv2-lovat.vercel.app

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
│  → buka https://dashboardv2-lovat.vercel.app            │
└───────────────┬─────────────────────────────────────────┘
                │ (internet, HTTPS aman)
┌───────────────▼─────────────────────────────────────────┐
│  APLIKASI (di Vercel — hosting gratis)                   │
│  • Tampilan dashboard (front-end)                        │
│  • Server login & data (back-end)                        │
└───────────────┬───────────────────────┬─────────────────┘
                │                        │
       ┌────────▼────────┐     ┌─────────▼──────────┐
       │ Upstash Redis   │     │ Google Spreadsheet │
       │ (data akun &    │     │ Rumah_Pandega_LIVE │
       │  keamanan 2FA)  │     │ (data operasional) │
       └─────────────────┘     └────────────────────┘
```

### Komponen
| Komponen | Fungsi |
|---|---|
| **Front-end** | Tampilan yang dilihat staff (kartu, grafik, tabel) |
| **Back-end (server)** | Mengatur login, keamanan, dan menyajikan data |
| **Upstash Redis** | Menyimpan akun staff & pengaturan 2FA secara aman & permanen |
| **Google Spreadsheet** (`Rumah_Pandega_LIVE_v2`) | Sumber data operasional (penghuni, transaksi, leads, dll.) |
| **Vercel** | Tempat aplikasi "tinggal" & diakses dari internet (gratis) |
| **GitHub** | Tempat menyimpan kode program (untuk update/perbaikan) |

---

## 4. Cara Mengakses & Login

### Login pertama
1. Buka **https://dashboardv2-lovat.vercel.app** di browser (Chrome/Edge/HP).
2. Masukkan **Username** dan **Password** yang diberikan Owner.
3. Klik **Masuk**.
4. Jika 2FA aktif di akun Anda, akan diminta **kode OTP 6 digit** dari aplikasi authenticator → masukkan → **Verifikasi**.

### Mendaftar akun baru (staff baru)
1. Di halaman login klik **"Daftar di sini"**.
2. Isi Nama Lengkap, Username (min. 3 karakter), Password (min. 8 karakter) → **Daftar**.
3. Akun berstatus **menunggu persetujuan**. **Owner harus menyetujui** dan menetapkan peran sebelum bisa login.

### Keluar (logout)
Klik ikon **keluar** (panah) di pojok kiri bawah sidebar.

> **Keamanan:** sesi login otomatis berakhir setelah 8 jam. Jangan bagikan password. Gunakan 2FA.

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
| **Upstash** | Database akun (Redis) | https://console.upstash.com |
| **Google Cloud** | (opsional) integrasi Sheets/Drive | https://console.cloud.google.com |

### 10.2 Cara update aplikasi
Setiap perubahan kode yang **di-push ke branch `main`** di GitHub akan **otomatis dideploy** ulang oleh Vercel (~1 menit). Tidak perlu langkah manual.

### 10.3 Environment Variables (di Vercel → Settings → Environment Variables)
| Key | Fungsi | Wajib? |
|---|---|---|
| `JWT_SECRET` | Kunci pengaman sesi login | **Wajib** |
| `UPSTASH_REDIS_REST_URL` | Alamat database akun | **Wajib** |
| `UPSTASH_REDIS_REST_TOKEN` | Token database akun | **Wajib** |
| `NODE_ENV` = `production` | Mode produksi (cookie aman) | Disarankan |
| `OWNER_PASSWORD`, `ADMIN_PASSWORD`, dst. | Password awal akun saat seed | Opsional |

> Setelah mengubah env, **wajib Redeploy** (Deployments → ⋯ → Redeploy).

### 10.4 Cek kesehatan sistem
Buka **https://dashboardv2-lovat.vercel.app/api/health**. Yang sehat:
```
{ "redisConfigured": true, "redisOk": true, "hasJwtEnv": true, "nodeEnv": "production" }
```
- `redisConfigured: false` → env Upstash belum terbaca → cek & Redeploy.
- `redisOk: false` → token/URL Upstash salah.

### 10.5 Backup & pemulihan akun
- Akun staff tersimpan di Upstash pada key **`ktd:users`**.
- **Backup:** di Upstash console, salin nilai key `ktd:users` dan simpan di tempat aman.
- **Reset semua akun:** hapus key `ktd:users` → buka aplikasi → akun ter-seed ulang (password baru muncul di **log Vercel**, atau ambil dari env `OWNER_PASSWORD`).

### 10.6 (Opsional) Mengaktifkan data live Google Sheets
1. Buat **Service Account** di Google Cloud, aktifkan **Google Sheets API**, unduh kunci JSON.
2. **Share** spreadsheet `Rumah_Pandega_LIVE_v2` ke email service account (sebagai **Viewer**).
3. Sediakan `data/service-account.json` + `data/sheets-config.json` (lihat `data/sheets-config.example.json`).
> Tanpa ini, dashboard tetap berjalan memakai data snapshot bawaan.

### 10.7 (Opsional) Membuat tab data baru di spreadsheet
Beri service account akses **Editor**, lalu jalankan `npm run setup:sheets` untuk membuat tab `12_VENDOR`, `13_LOGBOOK`, `14_DOKUMEN`, `15_KAMAR` beserta header-nya (aman, hanya menambah).

### 10.8 Yang TIDAK boleh dilakukan
- Jangan commit file rahasia ke GitHub (`users.json`, `.jwt-secret`, `service-account.json`, `*-config.json` — sudah otomatis diabaikan).
- Jangan bagikan `JWT_SECRET` atau token Upstash.
- Jangan ubah `JWT_SECRET` sembarangan (semua sesi login akan logout).

---

## 11. Troubleshooting / Masalah Umum

| Masalah | Penyebab | Solusi |
|---|---|---|
| **"Gagal membaca data akun"** saat login | Env Upstash belum terbaca | Cek `/api/health`; pastikan env Upstash terisi & **Redeploy** |
| **"Username atau password salah"** | Salah ketik / belum disetujui | Cek huruf besar/kecil; pastikan akun sudah disetujui Owner |
| **"Akun belum disetujui Owner"** | Akun masih pending | Minta Owner menyetujui di **Kelola Akun** |
| **"Kode OTP salah"** | Jam HP tidak sinkron / kode kedaluwarsa | Pastikan jam HP otomatis; masukkan kode terbaru |
| **Tabel kosong "Tidak ada data pada periode…"** | Filter periode terlalu sempit | Ganti ke **Tahun ini** atau atur Custom |
| **Situs lambat saat dibuka pertama** | Hosting gratis "tidur" saat idle | Normal; tunggu ~30–60 detik, akan aktif |
| **Lupa password** | — | Minta Owner menonaktifkan & buat ulang, atau reset via Upstash (Bagian 10.5) |

---

## 12. Glosarium
| Istilah | Arti |
|---|---|
| **Dashboard** | Halaman ringkasan berisi KPI & grafik |
| **KPI** | Indikator kinerja utama (angka penting) |
| **Role** | Peran/jabatan yang menentukan hak akses |
| **2FA / OTP** | Verifikasi tambahan kode 6 digit dari aplikasi authenticator |
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
