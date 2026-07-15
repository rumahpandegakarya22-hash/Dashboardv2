#!/usr/bin/env node
/* =========================================================================
   Kost Tiga Dara — Recompute Turso (ON-WRITE)

   Membaca seluruh tabel dari Turso, menghitung ulang kolom-kolom formula
   (server/compute.js), lalu MENULIS BALIK nilai kolom formula ke Turso agar
   konsisten untuk konsumen lain (mis. query manual, BI tool).

   Gunakan ini setelah menambah baris BARU ke Turso, atau berkala.

   Cara pakai (dari folder project):
       # aman: hanya menampilkan apa yang AKAN diubah (tidak menulis)
       node server/recompute-turso.js

       # benar-benar menulis perubahan ke Turso
       node server/recompute-turso.js --commit

       # batasi ke tabel tertentu
       node server/recompute-turso.js --commit --only content,promotion

   ENV (via .env atau environment): TURSO_DATABASE_URL, TURSO_AUTH_TOKEN.
   ========================================================================= */
"use strict";

try { require("dotenv").config(); } catch (_) { /* dotenv opsional */ }

const turso = require("./turso");
const { computeAll, FORMULA_COLUMNS } = require("./compute");

/* Primary key per tabel (untuk klausa WHERE saat UPDATE). */
const PK = {
  kamar: "id_kamar",
  booking: "no_booking",
  content: "id",
  promotion: "id",
  maintenance_cm: "id_tiket",
  maintenance_pm: "id_tiket",
  coa: "kode",
  jurnal_transaksi: "id",
};

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx >= 0 && argv[onlyIdx + 1] ? argv[onlyIdx + 1].split(",").map((s) => s.trim()) : null;

const norm = (v) => (v === null || v === undefined ? "" : String(v));

async function main() {
  if (!turso.isTursoConfigured()) {
    console.error("✗ TURSO_DATABASE_URL belum di-set (cek .env). Batal.");
    process.exit(1);
  }
  console.log(`Mode: ${COMMIT ? "COMMIT (menulis ke Turso)" : "DRY-RUN (tidak menulis)"}`);

  const raw = await turso.readAllTables();
  const computed = computeAll(raw);

  let totalCells = 0, totalRows = 0;
  for (const [table, cols] of Object.entries(FORMULA_COLUMNS)) {
    if (ONLY && !ONLY.includes(table)) continue;
    const pk = PK[table];
    if (!pk) { console.warn(`- ${table}: tidak ada PK terdaftar, dilewati`); continue; }

    const rows = computed[table] || [];
    let changedRows = 0, changedCells = 0;
    const updates = [];

    rows.forEach((cr, i) => {
      const orig = raw[table][i];
      const pkVal = cr[pk];
      if (pkVal === null || pkVal === undefined || pkVal === "") return;
      const dirty = cols.filter((col) => norm(cr[col]) !== norm(orig[col]));
      if (!dirty.length) return;
      changedRows++; changedCells += dirty.length;
      dirty.forEach((col) => {
        if (changedCells <= 5 || process.env.VERBOSE)
          console.log(`   ${table}[${pk}=${pkVal}] ${col}: ${JSON.stringify(orig[col])} → ${JSON.stringify(cr[col])}`);
      });
      const setCols = dirty.map((col) => `"${col}" = ?`).join(", ");
      const args = dirty.map((col) => (cr[col] === undefined ? null : cr[col]));
      args.push(pkVal);
      updates.push({ sql: `UPDATE "${table}" SET ${setCols} WHERE "${pk}" = ?`, args });
    });

    totalRows += changedRows; totalCells += changedCells;
    console.log(`- ${table}: ${changedRows} baris / ${changedCells} sel formula ${COMMIT ? "diupdate" : "akan diupdate"}`);

    if (COMMIT && updates.length) {
      for (const u of updates) await turso.execute(u.sql, u.args);
    }
  }

  console.log(`\nRINGKASAN: ${totalRows} baris, ${totalCells} sel formula ${COMMIT ? "berhasil ditulis ke Turso." : "akan diubah (jalankan ulang dengan --commit untuk menerapkan)."}`);
}

main().catch((e) => { console.error("✗ Error:", e.message); process.exit(1); });
