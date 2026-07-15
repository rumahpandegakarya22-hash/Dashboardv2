/* =========================================================================
   Kost Tiga Dara — Compute Engine (paritas formula spreadsheet → Turso)

   Di spreadsheet Rumah_Pandega_LIVE_v2, banyak kolom adalah FORMULA
   (mis. engagement, ER%, CPL, tgl keluar estimasi, durasi perbaikan, SLA,
   ROI, saldo normal COA, tier harga kamar). Saat data di-export ke CSV lalu
   di-migrasi ke Turso, formula itu "beku" jadi nilai statis. Artinya BARIS
   BARU yang di-insert langsung ke Turso TIDAK akan punya kolom itu terisi
   dengan benar.

   Modul ini menghitung ULANG semua kolom turunan dari kolom mentah, supaya
   data dari Turso "sama persis" dengan yang dulu dihasilkan spreadsheet.

   Dipakai 2 arah:
     • ON-READ  : dipanggil turso-source.js saat menyajikan data ke dashboard.
     • ON-WRITE : dipakai recompute-turso.js untuk menulis balik kolom
                  formula ke Turso agar konsisten untuk konsumen lain.

   TINGKAT KEYAKINAN tiap formula ditandai di komentar:
     [VERIFIED] cocok 100% dengan data hasil migrasi (batched.db).
     [LOOKUP]   tabel referensi diturunkan dari data / aturan akuntansi baku.
     [PENDING]  aritmetika ambigu — best-effort; WAJIB dikonfirmasi dari
                formula asli via dump-formulas.js (lihat FORMULA_CONFIG).
   ========================================================================= */
"use strict";

/* -------------------------------------------------------------------------
   FORMULA_CONFIG — satu tempat untuk semua parameter formula yang BELUM
   dikunci dari spreadsheet. Setelah menjalankan `node server/dump-formulas.js`
   di komputer (dengan service account), ganti nilai di sini agar 100% identik.
   ------------------------------------------------------------------------- */
const FORMULA_CONFIG = {
  /* Tier harga kamar per tipe [LOOKUP dari data migrasi — 3 tipe diketahui].
     harga_bulan & tier lain seluruhnya ditentukan oleh tipe_kamar di sumber.
     Tambahkan entri baru bila ada tipe kamar baru. */
  priceByTipe: {
    "Eco (Non AC)":  { bulan: 850000,  b3: 2400000, b6: 4800000,  b9: 7200000,  tahun: 8800000 },
    "Classic (AC)":  { bulan: 1200000, b3: 3600000, b6: 7200000,  b9: 10800000, tahun: 13200000 },
    "Comfy (AC)":    { bulan: 1600000, b3: 4800000, b6: 9600000,  b9: 14400000, tahun: 17600000 },
  },

  /* Kode kategori maintenance [LOOKUP — 2 diketahui dari data; lengkapi dari
     sheet parameter maintenance bila ada kategori lain]. */
  kodeByKategori: {
    "Elektrikal dan Elektronik": "ELK",
    "Furniture dan Interior":    "FUR",
  },

  /* Saldo normal per tipe akun COA [LOOKUP — aturan akuntansi baku, cocok
     100% dengan 122 baris COA]. */
  saldoNormalByTipe: {
    "Aset": "Debit",
    "Beban": "Debit",
    "Beban Non-Operasional": "Debit",
    "Kontra Ekuitas": "Debit",
    "Ekuitas": "Kredit",
    "Kontra Aset": "Kredit",
    "Liabilitas": "Kredit",
    "Pendapatan": "Kredit",
  },

  /* [PENDING] Target SLA hari per prioritas (maintenance korektif/CM).
     KONFIRMASI dari formula kolom SLA di sheet maintenance. */
  slaTargetHari: { pending: true, Tinggi: 2, Sedang: 3, Rendah: 5 },

  /* [PENDING] Aturan durasi perbaikan (hari): MAX(1, selesai-lapor).
     Konfirmasi dari sheet (bisa jadi NETWORKDAYS). */
  durasiMinimalSatuHari: true,

  /* [PENDING] ROI promosi — bergantung kolom omzet yg tak ikut migrasi.
     Tidak ditebak di sini. Isi rumusnya setelah dump-formulas.js. */
  roi: { pending: true },

  /* [PENDING] Sumber kategori arus kas jurnal: "kredit" atau "debit". */
  jurnalKategoriDari: "kredit",
};

/* ------------------------------------------------------------ util angka -- */
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
};
const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* EDATE(tanggal, n): tambah n bulan, clamp ke akhir bulan. "YYYY-MM-DD". */
function edate(iso, months) {
  if (isBlank(iso)) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return iso;
  let y = +m[1], mo = +m[2] - 1, d = +m[3];
  const total = mo + Math.trunc(num(months));
  const ny = y + Math.floor(total / 12);
  const nmo = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nmo + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny.toString().padStart(4, "0")}-${(nmo + 1).toString().padStart(2, "0")}-${nd.toString().padStart(2, "0")}`;
}

/* Selisih hari kalender (b - a). */
function dayDiff(aIso, bIso) {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ========================= COMPUTE PER TABEL ============================= */

/* kamar: harga_bulan + semua tier ditentukan oleh tipe_kamar [LOOKUP]. */
function computeKamar(r) {
  const o = { ...r };
  const t = FORMULA_CONFIG.priceByTipe[String(r.tipe_kamar || "").trim()];
  if (t) {
    if (isBlank(o.harga_bulan))  o.harga_bulan  = t.bulan;
    o.harga_3bulan = t.b3;
    o.harga_6bulan = t.b6;
    o.harga_9bulan = t.b9;
    o.harga_tahun  = t.tahun;
  }
  return o;
}

/* booking: tgl_keluar_est = EDATE(tgl_masuk, durasi_bulan) [VERIFIED]. */
function computeBooking(r) {
  const o = { ...r };
  if (!isBlank(r.tgl_masuk)) {
    o.tgl_keluar_est = isBlank(r.durasi_bulan)
      ? r.tgl_masuk
      : edate(r.tgl_masuk, r.durasi_bulan);
  }
  return o;
}

/* content: engagement & ER% [VERIFIED]. */
function computeContent(r) {
  const o = { ...r };
  o.engagement = num(r.likes) + num(r.komentar) + num(r.share_saves);
  o.er_persen = num(r.reach) > 0 ? round2((o.engagement / num(r.reach)) * 100) : 0;
  return o;
}

/* promotion: CPL & konversi [VERIFIED]; ROI [PENDING]. */
function computePromotion(r) {
  const o = { ...r };
  const leads = num(r.leads_aktual);
  o.cpl = leads > 0 ? Math.round(num(r.spend_aktual) / leads) : 0;
  o.conv_lead_booking = leads > 0 ? round2(num(r.booking_dr_promo) / leads) : 0;
  return o;
}

/* maintenance (CM & PM): kode [LOOKUP], durasi [PENDING-rule], sla [PENDING]. */
function computeMaintenance(r, isPM) {
  const o = { ...r };
  const k = FORMULA_CONFIG.kodeByKategori[String(r.kategori || "").trim()];
  if (k) o.kode = k;
  if (!isBlank(r.tanggal_lapor) && !isBlank(r.tanggal_selesai)) {
    const d = dayDiff(r.tanggal_lapor, r.tanggal_selesai);
    if (d !== null) o.durasi_perbaikan_hari = FORMULA_CONFIG.durasiMinimalSatuHari ? Math.max(1, d) : d;
  }
  if (isPM) {
    o.sla = "-";
  } else {
    const target = FORMULA_CONFIG.slaTargetHari[String(r.prioritas || "").trim()];
    if (target != null && o.durasi_perbaikan_hari != null && o.durasi_perbaikan_hari !== "") {
      o.sla = num(o.durasi_perbaikan_hari) <= target ? "OK" : "Telat";
    }
  }
  return o;
}

/* coa: saldo_normal dari tipe_akun [LOOKUP/aturan baku]. */
function computeCoa(r) {
  const o = { ...r };
  const sn = FORMULA_CONFIG.saldoNormalByTipe[String(r.tipe_akun || "").trim()];
  if (sn) o.saldo_normal = sn;
  return o;
}

/* jurnal_transaksi: enrich untuk dashboard keuangan.
   - kategori           : dari kategori_arus_kas akun terkait [PENDING]
   - akun_debit_nama /
     akun_kredit_nama   : nama akun (join COA) — dipakai klasifikasi pembayaran
   - dampak_laba        : efek ke laba-rugi (akrual) berdasarkan tipe akun COA
   - arus_kas           : efek ke kas (akun grup "Kas & Bank")
   Kolom turunan ini TIDAK disimpan ke Turso (bukan kolom DB), hanya untuk
   penyajian ke dashboard agar identik dengan tab Transaksi spreadsheet. */
function computeJurnal(r, ctx) {
  const o = { ...r };
  const coa = (ctx && ctx.coaByKode) || {};
  const cd = coa[r.akun_debit_kode];
  const ck = coa[r.akun_kredit_kode];
  const nominal = num(r.nominal);

  o.akun_debit_nama = cd ? cd.nama_akun : r.akun_debit_kode;
  o.akun_kredit_nama = ck ? ck.nama_akun : r.akun_kredit_kode;

  const pick = FORMULA_CONFIG.jurnalKategoriDari === "debit" ? [cd, ck] : [ck, cd];
  for (const cc of pick) {
    if (cc && !isBlank(cc.kategori_arus_kas)) { o.kategori = cc.kategori_arus_kas; break; }
  }

  const isPendapatan = (cc) => cc && cc.tipe_akun === "Pendapatan";
  const isBeban = (cc) => cc && (cc.tipe_akun === "Beban" || cc.tipe_akun === "Beban Non-Operasional");
  let dl = 0;
  if (isPendapatan(ck)) dl = nominal;
  else if (isBeban(cd)) dl = -nominal;
  o.dampak_laba = dl === 0 ? "-" : dl;

  const isKas = (cc) => cc && cc.grup_laporan === "Kas & Bank";
  let ak = 0;
  if (isKas(cd) && !isKas(ck)) ak = nominal;
  else if (isKas(ck) && !isKas(cd)) ak = -nominal;
  o.arus_kas = ak === 0 ? "-" : ak;

  return o;
}

/* Peta nama tabel → fungsi compute. */
const COMPUTERS = {
  kamar: computeKamar,
  booking: computeBooking,
  content: computeContent,
  promotion: computePromotion,
  maintenance_cm: (r) => computeMaintenance(r, false),
  maintenance_pm: (r) => computeMaintenance(r, true),
  coa: computeCoa,
  jurnal_transaksi: computeJurnal,
};

/* Kolom formula per tabel (dipakai recompute-turso.js untuk UPDATE selektif). */
const FORMULA_COLUMNS = {
  kamar: ["harga_bulan", "harga_3bulan", "harga_6bulan", "harga_9bulan", "harga_tahun"],
  booking: ["tgl_keluar_est"],
  content: ["engagement", "er_persen"],
  promotion: ["cpl", "conv_lead_booking"],
  maintenance_cm: ["kode", "durasi_perbaikan_hari", "sla"],
  maintenance_pm: ["kode", "durasi_perbaikan_hari", "sla"],
  coa: ["saldo_normal"],
  jurnal_transaksi: ["kategori"],
};

function computeRow(table, row, ctx) {
  const fn = COMPUTERS[table];
  return fn ? fn(row, ctx || {}) : { ...row };
}

function computeAll(tables) {
  const ctx = { coaByKode: {} };
  for (const c of tables.coa || []) ctx.coaByKode[c.kode] = c;
  const out = {};
  for (const [table, rows] of Object.entries(tables)) {
    out[table] = (rows || []).map((r) => computeRow(table, r, ctx));
  }
  return out;
}

module.exports = {
  FORMULA_CONFIG,
  FORMULA_COLUMNS,
  COMPUTERS,
  computeRow,
  computeAll,
  edate,
  dayDiff,
};
