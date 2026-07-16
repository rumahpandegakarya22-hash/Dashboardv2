#!/usr/bin/env node
/* =========================================================================
   Kost Tiga Dara — Seed occupancy_history (Retention Rate)

   occupancy_history KOSONG di Turso → Retention Rate & AVG Durasi Sewa (Sales
   overview) selalu "—". Tabel ini bukan dihitung, isinya HARUS diketik manual
   dari riwayat penghuni yang sudah keluar (dan yang masih tinggal, untuk avg
   durasi). Edit array RECORDS di bawah, lalu jalankan.

   Kolom: id_penghuni (opsional) | nama | no_kamar | tanggal_mulai (YYYY-MM-DD)
          | tanggal_selesasi (YYYY-MM-DD, kosongkan "" bila masih tinggal)

   Cara pakai:
       node server/seed-occupancy-history.js            # dry-run, tampilkan saja
       node server/seed-occupancy-history.js --commit    # benar-benar INSERT
   ========================================================================= */
"use strict";

try { require("dotenv").config(); } catch (_) { /* dotenv opsional */ }

const turso = require("./turso");

/* ---- ISI DI SINI: satu baris = satu penghuni (aktif atau sudah keluar) ---- */
const RECORDS = [
  // { id_penghuni: "", nama: "Contoh Nama", no_kamar: 5, tanggal_mulai: "2024-01-10", tanggal_selesasi: "2024-09-10" },
];

const COMMIT = process.argv.includes("--commit");

async function main() {
  if (!turso.isTursoConfigured()) {
    console.error("✗ TURSO_DATABASE_URL belum di-set (cek .env). Batal.");
    process.exit(1);
  }
  if (!RECORDS.length) {
    console.log("RECORDS kosong — edit array di server/seed-occupancy-history.js dulu.");
    return;
  }
  console.log(`Mode: ${COMMIT ? "COMMIT (menulis ke Turso)" : "DRY-RUN (tidak menulis)"}`);
  console.log(`${RECORDS.length} baris akan di-insert ke occupancy_history:`);

  for (const r of RECORDS) {
    const line = `  ${r.nama} · kamar ${r.no_kamar} · ${r.tanggal_mulai} → ${r.tanggal_selesasi || "(masih tinggal)"}`;
    console.log(line);
    if (COMMIT) {
      await turso.execute(
        `INSERT INTO "occupancy_history" ("id_penghuni","nama","no_kamar","tanggal_mulai","tanggal_selesasi") VALUES (?,?,?,?,?)`,
        [r.id_penghuni || null, r.nama, r.no_kamar, r.tanggal_mulai, r.tanggal_selesasi || null]
      );
    }
  }

  console.log(COMMIT ? "\n✓ Selesai ditulis ke Turso." : "\nJalankan ulang dengan --commit untuk benar-benar menulis.");
}

main().catch((e) => { console.error("✗ Error:", e.message); process.exit(1); });
