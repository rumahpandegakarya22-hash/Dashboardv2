/* =========================================================================
   Kost Tiga Dara — Koneksi Turso (libSQL)

   Membaca data operasional dari database Turso hasil migrasi (13 tabel).
   Konfigurasi lewat ENV (jangan hardcode token):
     TURSO_DATABASE_URL   = libsql://<db>-<org>.turso.io   (atau file:./local.db untuk uji lokal)
     TURSO_AUTH_TOKEN     = <token>   (tidak wajib untuk file: lokal)

   Aktif otomatis bila TURSO_DATABASE_URL diisi. Bila tidak, modul tetap
   di-load tapi isTursoConfigured() = false (dashboard jatuh ke Google Sheets/
   snapshot seperti semula).
   ========================================================================= */
"use strict";

const TABLES = [
  "kamar", "booking", "leads", "survey", "coa", "jurnal_transaksi",
  "maintenance_cm", "maintenance_pm", "vendor", "content", "promotion",
  "dokumen", "logbook_divisi", "occupancy_history",
  "payment", "penghuni",
];

let client = null;
let initErr = null;

function isTursoConfigured() {
  return !!process.env.TURSO_DATABASE_URL;
}

/* Buat/kembalikan singleton client @libsql/client. Lazy: hanya require paket
   saat benar-benar dipakai, supaya server tetap jalan walau paket belum
   ter-install dan Turso tidak dikonfigurasi. */
function getClient() {
  if (client) return client;
  if (!isTursoConfigured()) throw new Error("TURSO_DATABASE_URL belum di-set");
  let createClient;
  try {
    ({ createClient } = require("@libsql/client"));
  } catch (e) {
    throw new Error(
      "Paket '@libsql/client' belum ter-install. Jalankan: npm install @libsql/client"
    );
  }
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}

/* Jalankan query SQL mentah (untuk utility recompute). */
async function execute(sql, args) {
  return getClient().execute(args ? { sql, args } : sql);
}

/* Baca 1 tabel → array of row-object (kolom → nilai). */
async function readTable(name) {
  const rs = await getClient().execute(`SELECT * FROM "${name}"`);
  return rs.rows.map((row) => {
    // rs.rows sudah object-like; salin agar plain object murni
    const o = {};
    for (const col of rs.columns) o[col] = row[col];
    return o;
  });
}

/* Baca SEMUA tabel → { tableName: [rows] }. Tabel yang error (mis. belum ada)
   dikembalikan sebagai array kosong + dicatat, tidak menggagalkan keseluruhan. */
async function readAllTables() {
  const out = {};
  for (const t of TABLES) {
    try {
      out[t] = await readTable(t);
    } catch (e) {
      out[t] = [];
      if (!initErr) initErr = e.message;
      console.warn(`[turso] gagal baca tabel ${t}: ${e.message}`);
    }
  }
  return out;
}

module.exports = {
  TABLES,
  isTursoConfigured,
  getClient,
  execute,
  readTable,
  readAllTables,
};
