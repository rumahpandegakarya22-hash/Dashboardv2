/* =========================================================================
   Kost Tiga Dara — Koneksi DB Inventory Stock (libSQL, read-only)

   Dashboard membaca DB Turso app Inventory Stock (E:\Stock Inventory Kost /
   inventorystockktd.vercel.app) untuk seksi monitoring "Stok Inventory".
   Dashboard TIDAK pernah menulis ke DB ini — gunakan token read-only bila ada.

   ENV:
     INVENTORY_DATABASE_URL = libsql://inventoystock-<org>.turso.io
     INVENTORY_AUTH_TOKEN   = token (idealnya read-only)

   Tidak dikonfigurasi → isInventoryConfigured() = false, route /api/inventory
   membalas { configured: false } dan seksi di frontend disembunyikan.
   ========================================================================= */
"use strict";

let client = null;
let cache = null; // { at, data } — TTL 60 detik, sama dgn cache utama dashboard
const CACHE_MS = 60 * 1000;

function isInventoryConfigured() {
  return !!process.env.INVENTORY_DATABASE_URL;
}

function getClient() {
  if (client) return client;
  if (!isInventoryConfigured()) throw new Error("INVENTORY_DATABASE_URL belum di-set");
  const { createClient } = require("@libsql/client");
  client = createClient({
    url: process.env.INVENTORY_DATABASE_URL,
    authToken: process.env.INVENTORY_AUTH_TOKEN || undefined,
  });
  return client;
}

/* Baca materials + transaksi terakhir (JOIN nama bahan). Cache 60 detik. */
async function readInventory() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const c = getClient();
  const mats = await c.execute(
    "SELECT id, name, category, unit, current_stock, min_stock FROM materials ORDER BY name"
  );
  const txs = await c.execute(
    `SELECT t.id, t.type, t.quantity, t.total_cost, t.notes, t.created_at,
            m.name AS material_name, m.unit, u.name AS user_name
     FROM inventory_transactions t
     JOIN materials m ON m.id = t.material_id
     LEFT JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC, t.id DESC LIMIT 200`
  );
  const toObjs = (rs) =>
    rs.rows.map((row) => {
      const o = {};
      for (const col of rs.columns) o[col] = row[col];
      return o;
    });
  const data = { materials: toObjs(mats), transactions: toObjs(txs) };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { isInventoryConfigured, readInventory };
