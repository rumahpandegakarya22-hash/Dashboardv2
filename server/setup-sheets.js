/* =========================================================================
   setup-sheets.js — buat 4 tab baru yang dibutuhkan dashboard di spreadsheet
   Rumah_Pandega_LIVE_v2, lengkap dengan baris header.

   AMAN & IDEMPOTENT:
   - Hanya MENAMBAH tab yang belum ada. Tab/data yang sudah ada tidak disentuh.
   - Bisa dijalankan berkali-kali; tab yang sudah dibuat akan dilewati.

   Prasyarat:
   1. data/sheets-config.json berisi { "spreadsheetId": "...", "serviceAccountKeyPath": "data/service-account.json" }
   2. Service account diberi akses **Editor** ke spreadsheet (bukan Viewer).

   Jalankan:  node server/setup-sheets.js
   ========================================================================= */
"use strict";

const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const CFG_FILE = path.join(DATA_DIR, "sheets-config.json");

// definisi tab baru + header (selaras dengan kolom yang dipakai app.js)
const NEW_TABS = [
  {
    title: "12_VENDOR",
    header: ["ID", "Nama Vendor", "Kategori", "Nomor Telepon/WA", "Hasil"],
    note: "Hasil: Paling Baik / Baik / Cukup / Kurang",
  },
  {
    title: "13_LOGBOOK",
    header: ["Tanggal", "Task", "PIC", "Divisi", "Deadline", "Status"],
    note: "Status: Complete / In Progress / Pending / Incomplete. Divisi: admin/keuangan/marketing/operasional/sales",
  },
  {
    title: "14_DOKUMEN",
    header: ["ID Docs", "Judul", "Role", "Link Drive"],
    note: "Role: owner/admin/marketing/operasional/sales. Link Drive: URL file Google Drive",
  },
  {
    title: "15_KAMAR",
    header: ["No Kamar", "Jenis Kamar", "Penghuni", "Harga", "Status"],
    note: "Jenis: Eco/Classic/Comfy. Status: Terisi/Kosong/Booking/Maintenance. Isi 30 baris (kamar 1-31, nomor 28 & 30 kosong)",
  },
];

async function main() {
  if (!fs.existsSync(CFG_FILE)) {
    console.error("✗ data/sheets-config.json tidak ada. Salin dari sheets-config.example.json dulu.");
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CFG_FILE, "utf8"));
  const spreadsheetId = cfg.spreadsheetId;
  const keyRel = cfg.serviceAccountKeyPath || "data/service-account.json";
  const keyPath = path.isAbsolute(keyRel) ? keyRel : path.join(ROOT, keyRel);
  if (!spreadsheetId) { console.error("✗ spreadsheetId kosong."); process.exit(1); }
  if (!fs.existsSync(keyPath)) { console.error("✗ service account key tidak ditemukan:", keyPath); process.exit(1); }

  const auth = new google.auth.GoogleAuth({ keyFile: keyPath, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });

  // tab yang sudah ada → dilewati
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties.title));

  const toCreate = NEW_TABS.filter((t) => !existing.has(t.title));
  if (!toCreate.length) { console.log("✓ Semua tab sudah ada. Tidak ada yang dibuat."); return; }

  // tambah tab baru (batchUpdate)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: toCreate.map((t) => ({ addSheet: { properties: { title: t.title } } })) },
  });
  console.log("✓ Tab dibuat:", toCreate.map((t) => t.title).join(", "));

  // tulis header tiap tab baru
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: toCreate.map((t) => ({ range: `${t.title}!A1`, values: [t.header] })),
    },
  });
  console.log("✓ Header ditulis.");
  toCreate.forEach((t) => console.log(`  - ${t.title}: ${t.header.join(" | ")}  (${t.note})`));
}

main().catch((e) => { console.error("✗ Gagal:", e.message); process.exit(1); });
