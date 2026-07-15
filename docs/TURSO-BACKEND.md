# Backend Turso — Paritas Formula Spreadsheet

Dokumen ini menjelaskan lapisan backend baru yang membuat dashboard membaca
data dari **Turso** (bukan lagi Google Spreadsheet) sambil **menghitung ulang
kolom-kolom formula** agar hasilnya *sama persis* dengan spreadsheet
`Rumah_Pandega_LIVE_v2`.

## Kenapa perlu

Di spreadsheet, banyak kolom adalah FORMULA (mis. `Engagement`, `ER%`, `CPL`,
`Tgl Keluar Est`, `Durasi Perbaikan`, `SLA`, `Saldo Normal`, tier harga kamar).
Saat data di-export ke CSV lalu dimigrasi ke Turso, formula itu **beku** jadi
nilai statis. Artinya **baris baru** yang di-insert langsung ke Turso tidak akan
punya kolom itu terisi/terupdate. Lapisan ini menghitung ulang kolom tersebut
dari kolom mentah.

## Cara kerja (2 arah — sesuai permintaan "keduanya")

- **ON-READ** — saat dashboard minta data (`GET /api/sheets` atau `GET /api/db`),
  server membaca tabel dari Turso lalu menghitung kolom formula *on-the-fly*.
  Anti-basi: walau kolom formula di DB kosong/salah, yang dikirim ke dashboard
  selalu benar.
- **ON-WRITE** — `node server/recompute-turso.js --commit` menghitung ulang dan
  **menulis balik** kolom formula ke Turso, supaya konsumen lain (query manual,
  BI tool) juga melihat nilai yang benar.

## File yang ditambahkan

| File | Fungsi |
|---|---|
| `server/turso.js` | Koneksi Turso (`@libsql/client`), baca semua tabel. ENV `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. |
| `server/compute.js` | **Inti**: hitung ulang semua kolom formula per tabel. Parameter ambigu diisolasi di `FORMULA_CONFIG`. |
| `server/sheet-map.js` | Peta tabel Turso → nama tab + label header (agar cocok RLS & pencocokan kolom frontend). |
| `server/turso-source.js` | Gabung baca+compute+render → bentuk `{tab: 2D array}` (untuk `/api/sheets`) & `{tabel: rows}` (untuk `/api/db`). Cache 60 dtk. |
| `server/recompute-turso.js` | Utility ON-WRITE: tulis balik kolom formula ke Turso (`--commit`, `--only`, dry-run default). |
| `server/dump-formulas.js` | Ekstrak **formula asli** dari spreadsheet (valueRenderOption=FORMULA) → `data/formulas-dump.json`. Untuk mengunci formula ambigu. |
| `.env.example` | Template ENV (Turso + auth). |

## Menjalankan

```bash
npm install                      # memasang @libsql/client + dotenv (deps baru)
cp .env.example .env             # isi TURSO_DATABASE_URL & TURSO_AUTH_TOKEN
npm start                        # dashboard di http://localhost:5512
```

Bila `TURSO_DATABASE_URL` terisi, log menampilkan
`[turso] sumber data Turso AKTIF`. Endpoint:
- `GET /api/sheets` → data bentuk-tab (dipakai front-end lama), sudah di-RLS per role.
- `GET /api/db` → data JSON per tabel (rapi, kolom snake_case), sudah di-RLS.
- `GET /api/health` → cek `tursoConfigured`.

Prioritas sumber: **Turso → Google Sheets → snapshot**. Jadi kalau Turso mati,
otomatis fallback ke Sheets (perilaku lama tetap ada).

Setelah menambah baris baru ke Turso, samakan kolom formula di DB:
```bash
npm run recompute          # dry-run: lihat apa yang akan berubah
npm run recompute:commit   # benar-benar menulis
```

## Status paritas formula

Diverifikasi terhadap 420 baris hasil migrasi: **0 sel formula berbeda** untuk
kolom di bawah (kecuali 1 sel `ER%` yang memang RUSAK di sumber —
`2196428571`, isu data quality yang sudah di-flag — dan kini otomatis
diperbaiki jadi nilai benar).

| Tabel | Kolom formula | Rumus | Keyakinan |
|---|---|---|---|
| content | engagement | likes+komentar+share_saves | ✅ VERIFIED |
| content | er_persen | engagement/reach×100 | ✅ VERIFIED |
| promotion | cpl | spend_aktual/leads_aktual | ✅ VERIFIED |
| promotion | conv_lead_booking | booking_dr_promo/leads_aktual | ✅ VERIFIED |
| booking | tgl_keluar_est | EDATE(tgl_masuk, durasi_bulan) | ✅ VERIFIED |
| kamar | harga_bulan/3/6/9/tahun | lookup per tipe_kamar | ✅ LOOKUP (3 tipe) |
| coa | saldo_normal | dari tipe_akun (aturan akuntansi) | ✅ LOOKUP |
| maintenance | kode | lookup per kategori | ✅ LOOKUP (2 kategori) |
| maintenance | durasi_perbaikan_hari | MAX(1, selesai−lapor) | 🟡 PENDING (rule) |
| maintenance | sla | CM: durasi≤target prioritas; PM: "-" | 🟡 PENDING (ambang) |
| jurnal_transaksi | kategori | dari kategori_arus_kas akun terkait | 🟡 PENDING |
| promotion | roi_persen, roi_kotor | bergantung kolom omzet yg tak ikut migrasi | 🔴 PENDING |

### Mengunci yang PENDING (agar 100% identik)

Jalankan di komputer (butuh `data/service-account.json` atau ENV
`GOOGLE_SERVICE_ACCOUNT_JSON`):

```bash
npm run dump:formulas
```

Ini menulis `data/formulas-dump.json` berisi rumus asli tiap kolom. Kirim
isinya (khususnya tab **PROMOSI** & **MAINTENANCE**), lalu rumus ROI/SLA
diterjemahkan persis ke `FORMULA_CONFIG` di `server/compute.js`. Sampai itu
dilakukan, kolom PENDING memakai best-effort dan **tidak** ditimpa saat
`recompute:commit` (roi_* sengaja tidak masuk daftar kolom yang ditulis).

## Catatan

- Tidak ada tabel `penghuni` di Turso (migrasi memakai `booking` + `kamar`).
  Bila front-end butuh tab "Penghuni", turunkan dari booking aktif + kamar,
  atau tambahkan tabelnya ke Turso.
- Tier harga & kode maintenance berbasis lookup: **tipe/kategori baru** perlu
  ditambah entri di `FORMULA_CONFIG` (atau dikunci dari sheet parameter).
- ID spreadsheet bukan rahasia; yang rahasia hanya service account & token Turso
  (sudah masuk `.gitignore`).

---

## UPDATE — Dashboard membaca Turso langsung (tanpa spreadsheet)

Sejak revisi ini, saat `TURSO_DATABASE_URL` di-set:
- **Integrasi Google Sheets dimatikan total** (`initSheets` langsung `return`).
  Log: `[sheets] Turso aktif - integrasi Google Sheets dinonaktifkan.`
- `GET /api/sheets` **hanya** dari Turso (tidak ada fallback ke spreadsheet).
- Front-end (`public/app.js`) tidak diubah: ia mendeteksi tab lewat kata kunci
  header, dan label header di `sheet-map.js` sudah disesuaikan agar cocok.

### Yang membuat tiap bagian dashboard terisi dari Turso

| Bagian dashboard | Sumber Turso | Catatan |
|---|---|---|
| Daftar Penghuni, okupansi, jatuh tempo | **diturunkan** dari `booking` (aktif) + `kamar` | tab sintetis "PENGHUNI (dari Booking)" |
| Keuangan / Pembayaran / Laba-Rugi | `jurnal_transaksi` + `coa` | ditambah kolom **Akun Debit/Kredit (nama)**, **Dampak Laba**, **Arus Kas** hasil hitung dari tipe akun COA |
| Data Kamar | `kamar` | header "No Kamar/Tipe/Harga/Status" |
| Leads, Booking, Tiket (CM/PM), Vendor, Dokumen, Logbook | tabel senama | terdeteksi ✓ |

### Verifikasi (uji terhadap 420 baris migrasi)

Detektor front-end tercocok untuk: Penghuni (24 aktif), Transaksi (128, dengan
Dampak Laba & Arus Kas), Leads (3), Booking (26), Tiket Korektif (1) & Preventif
(2), Vendor (12), Kamar (29), Dokumen (69), Logbook (21).

### Celah data yang HARUS diketahui (bukan bug — data belum ada di Turso)

1. **Penghuni turunan dari booking**: kolom detail seperti *instansi, pekerjaan,
   asal, kontak darurat, email, flag tagih* tidak ada (tidak ikut termigrasi).
   Yang tampil: nama, kamar, tipe, tgl masuk, jatuh tempo (akhir kontrak),
   durasi, status, no HP. Bila butuh lengkap → buat tabel `penghuni` di Turso.
2. **Retention Rate & AVG Durasi Sewa** butuh data "Historical Customer"
   (nama, tgl masuk, tgl keluar) yang **belum ada** di Turso → kartu tampil "—".
3. **Survey** tabel masih 0 baris → tab Survey kosong sampai diisi.
4. **Dampak Laba / Arus Kas** dihitung dari tipe akun COA (pendapatan/beban/kas).
   Ini logika akuntansi baku, bukan formula sheet yang di-copy — bila spreadsheet
   punya rumus khusus, kunci lewat `npm run dump:formulas`.

### Mengaktifkan

```bash
npm install
cp .env.example .env      # isi TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
npm start                 # buka http://localhost:5512 → dashboard = data Turso
```
