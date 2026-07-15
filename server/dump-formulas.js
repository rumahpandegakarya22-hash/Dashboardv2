#!/usr/bin/env node
/* =========================================================================
   Kost Tiga Dara — Dump Formula Spreadsheet (untuk mengunci formula ambigu)

   Beberapa formula tidak bisa dipastikan 100% dari data hasil migrasi saja
   (ROI promosi, ambang SLA maintenance, kategori jurnal, dll). Script ini
   membaca spreadsheet Rumah_Pandega_LIVE_v2 dengan valueRenderOption=FORMULA
   sehingga RUMUS ASLINYA ikut ter-ekspor, bukan hanya hasilnya.

   Output: data/formulas-dump.json berisi, per tab:
     • headers      : baris header asli (untuk menyamakan label di sheet-map.js)
     • formulaByCol : contoh rumus per kolom (dari baris data pertama yg berisi rumus)
     • rawFormulas  : 5 baris pertama (rumus mentah) untuk inspeksi manual

   Prasyarat (sama seperti integrasi Google Sheets di server.js):
     • data/service-account.json  (service account, di-share Viewer ke spreadsheet)
       ATAU ENV GOOGLE_SERVICE_ACCOUNT_JSON / _B64.
     • Opsional ENV SHEETS_SPREADSHEET_ID (default sudah diisi).

   Cara pakai:
       node server/dump-formulas.js
   Lalu KIRIM isi data/formulas-dump.json (khususnya tab PROMOSI & MAINTENANCE)
   agar formula ROI/SLA bisa diterjemahkan persis ke server/compute.js.
   ========================================================================= */
"use strict";

const path = require("path");
const fs = require("fs");
try { require("dotenv").config(); } catch (_) {}

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DEFAULT_SPREADSHEET_ID = "1-xXweqO9IO6s0EQqF0fc7EKSybvn5CUSD601-Dvj328";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function resolveAuth() {
  const { google } = require("googleapis");
  let credentials = null, keyFile = null;
  const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
  const envB64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GCP_SERVICE_ACCOUNT_B64;
  if (envJson) credentials = JSON.parse(envJson);
  else if (envB64) credentials = JSON.parse(Buffer.from(envB64, "base64").toString("utf8"));
  if (!credentials) {
    const keyPath = path.join(DATA_DIR, "service-account.json");
    if (fs.existsSync(keyPath)) keyFile = keyPath;
  }
  if (!credentials && !keyFile) {
    console.error("✗ Kredensial service account tidak ada. Taruh data/service-account.json atau set ENV GOOGLE_SERVICE_ACCOUNT_JSON.");
    process.exit(1);
  }
  return new google.auth.GoogleAuth(credentials ? { credentials, scopes: SCOPES } : { keyFile, scopes: SCOPES });
}

async function main() {
  const { google } = require("googleapis");
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID || process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetsApi = google.sheets({ version: "v4", auth: resolveAuth() });

  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const titles = (meta.data.sheets || []).map((s) => s.properties.title);
  console.log(`Membaca ${titles.length} tab: ${titles.join(", ")}`);

  const resp = await sheetsApi.spreadsheets.values.batchGet({
    spreadsheetId, ranges: titles, valueRenderOption: "FORMULA",
  });

  const dump = {};
  (resp.data.valueRanges || []).forEach((vr, i) => {
    const rows = vr.values || [];
    const headers = rows[0] || [];
    const formulaByCol = {};
    headers.forEach((h, ci) => {
      // cari sel pertama (di bawah header) yang berupa rumus (diawali '=')
      for (let ri = 1; ri < rows.length; ri++) {
        const cell = rows[ri] && rows[ri][ci];
        if (typeof cell === "string" && cell.startsWith("=")) { formulaByCol[h || `col${ci}`] = cell; break; }
      }
    });
    dump[titles[i]] = { headers, formulaByCol, rawFormulas: rows.slice(0, 6) };
  });

  const outPath = path.join(DATA_DIR, "formulas-dump.json");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), "utf8");
  console.log(`✓ Tersimpan: ${outPath}`);
  console.log("  Kirim file ini (atau tab PROMOSI & MAINTENANCE) untuk mengunci formula ROI/SLA di compute.js.");
}

main().catch((e) => { console.error("✗ Error:", e.message); process.exit(1); });
