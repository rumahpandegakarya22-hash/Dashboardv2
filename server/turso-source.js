/* =========================================================================
   Kost Tiga Dara — Sumber Data Turso untuk dashboard (ON-READ)

   Menyatukan:  turso.js (baca DB)  →  compute.js (hitung kolom formula)
                →  sheet-map.js (render ke bentuk tab spreadsheet).

   Mengekspor:
     • readComputedTables()  → { table: [rowObject terhitung] }   (untuk /api/db)
     • readComputedSheets()  → { "NAMA TAB": [[header],[row]...] } (untuk /api/sheets)

   Selain 13 tabel Turso, adapter juga MEN-TURUNKAN tab "PENGHUNI" dari data
   booking + kamar, karena migrasi tidak membuat tabel penghuni tersendiri
   sedangkan dashboard butuh daftar penghuni aktif (okupansi, jatuh tempo).
   ========================================================================= */
"use strict";

const turso = require("./turso");
const { computeAll } = require("./compute");
const { SHEET_MAP } = require("./sheet-map");

const TTL = 60 * 1000; // cache 60 detik
let cache = { at: 0, tables: null, sheets: null };

function fmtCell(v) {
  if (v === null || v === undefined) return "";
  return v;
}

/* Ubah {table: rows} terhitung → {tabTitle: 2D array} sesuai SHEET_MAP. */
function toSheets(tables) {
  const out = {};
  for (const [table, def] of Object.entries(SHEET_MAP)) {
    const rows = tables[table] || [];
    const header = def.columns.map((x) => x.header);
    const body = rows.map((r) => def.columns.map((x) => fmtCell(r[x.col])));
    out[def.title] = [header, ...body];
  }
  // Tab turunan PENGHUNI (dari booking aktif + master kamar)
  out["PENGHUNI (dari Booking)"] = derivePenghuni(tables);
  return out;
}

/* Turunkan daftar penghuni AKTIF dari booking. Status yang dihitung sebagai
   penghuni saat ini: selain "Check-out" dan yang dibatalkan (Cancel/Batal).
   Diperkaya profil dari tabel `penghuni` (kontak darurat 2 set, email, dll) —
   match by nama (case-insensitive) lalu fallback no kamar. */
function derivePenghuni(tables) {
  const kamarByNo = {};
  for (const k of tables.kamar || []) kamarByNo[String(k.no_kamar)] = k;
  const profByNama = {}, profByKamar = {};
  for (const p of tables.penghuni || []) {
    if (p.nama_lengkap) profByNama[String(p.nama_lengkap).trim().toLowerCase()] = p;
    if (p.no_kamar != null && p.no_kamar !== "") profByKamar[String(p.no_kamar).trim()] = p;
  }

  const header = ["No", "ID Penghuni", "Nama Lengkap", "Panggilan", "No Kamar", "Jenis Kamar",
    "Asal Daerah", "Pekerjaan", "Instansi", "Tgl Masuk", "Jatuh Tempo", "Durasi", "Status",
    "No HP Penghuni", "Nomor Darurat 1", "Relasi 1", "Nama Kontak 1",
    "Nomor Darurat 2", "Relasi 2", "Nama Kontak 2", "Email"];

  const aktif = (s) => {
    const t = String(s || "").toLowerCase();
    return t && !/check-?out|keluar|cancel|batal/.test(t);
  };
  const v = (x) => (x == null ? "" : x);

  let n = 0;
  const body = (tables.booking || [])
    .filter((b) => b.nama_penyewa && aktif(b.status_booking))
    .map((b) => {
      n++;
      const km = kamarByNo[String(b.kamar_no)];
      const pr = profByNama[String(b.nama_penyewa).trim().toLowerCase()]
        || profByKamar[String(b.kamar_no)] || {};
      return [
        n,
        v(b.id_penghuni),
        b.nama_penyewa,
        v(pr.nama_panggilan),
        b.kamar_no != null ? b.kamar_no : "",
        km ? km.tipe_kamar : "",
        v(pr.asal_daerah),
        v(pr.pekerjaan),
        v(pr.instansi),
        b.tgl_masuk || "",
        b.tgl_keluar_est || "",   // dipakai sbg "Jatuh Tempo" (akhir kontrak)
        b.durasi_bulan != null ? b.durasi_bulan : "",
        b.status_booking || "",
        b.no_hp || v(pr.no_hp),
        v(pr.nomor_darurat_1), v(pr.hubungan_kontak_darurat_1), v(pr.nama_kontak_darurat_1),
        v(pr.nomor_darurat_2), v(pr.hubungan_kontak_darurat_2), v(pr.nama_kontak_darurat_2),
        v(pr.email),
      ];
    });
  return [header, ...body];
}

async function loadAll(force) {
  if (!force && cache.tables && Date.now() - cache.at < TTL) return cache;
  const raw = await turso.readAllTables();
  const computed = computeAll(raw);
  cache = { at: Date.now(), tables: computed, sheets: toSheets(computed) };
  return cache;
}

async function readComputedTables(force) {
  return (await loadAll(force)).tables;
}

async function readComputedSheets(force) {
  return (await loadAll(force)).sheets;
}

function isConfigured() {
  return turso.isTursoConfigured();
}

module.exports = { isConfigured, readComputedTables, readComputedSheets, toSheets, derivePenghuni };
